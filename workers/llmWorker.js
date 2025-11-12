import messageQueue from '../services/messageQueue.js';
import { callLLM } from '../services/llmService.js';
import { ConversationRepository } from '../repositories/conversationRepository.js';
import { query } from '../services/database.js';

class LLMWorker {
  constructor() {
    this.conversationRepo = new ConversationRepository();
    this.isRunning = false;
    this.workerId = `llm-worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async start() {
    console.log(`🚀 Starting LLM Worker: ${this.workerId}`);

    try {
      // Wait for message queue to be ready
      await new Promise((resolve) => {
        if (messageQueue.isConnected) {
          resolve();
        } else {
          messageQueue.once('connected', resolve);
        }
      });

      // Subscribe to LLM requests
      await messageQueue.subscribeAsLLMWorker(this.handleLLMRequest.bind(this));

      this.isRunning = true;
      console.log(`✅ LLM Worker ${this.workerId} ready`);

      // Send heartbeat every 30 seconds
      this.heartbeatInterval = setInterval(() => {
        messageQueue.sendHeartbeat(this.workerId, 'llm');
      }, 30000);

    } catch (error) {
      console.error('❌ Failed to start LLM worker:', error);
      throw error;
    }
  }

  async handleLLMRequest(requestData) {
    const { sessionId, data } = requestData;
    const { digitalTwinId, prompt, history = [], requestId } = data;

    console.log(`🤖 Processing LLM request ${requestId} for session ${sessionId}`);

    const startTime = Date.now();

    try {
      // Skip database operations
      // const conversation = await this.conversationRepo.getOrCreate(digitalTwinId, sessionId);

      // Call LLM service
      const { reply, newHistory } = await callLLM(digitalTwinId, prompt, history);

      const processingTime = Date.now() - startTime;

      // Skip storing message in database
      // await this.conversationRepo.addMessage(conversation.id, {
      //   role: 'assistant',
      //   content: reply,
      //   tokensUsed: this.estimateTokens(reply),
      //   modelUsed: this.getModelForTwin(digitalTwinId),
      //   responseTimeMs: processingTime,
      //   metadata: {
      //     requestId,
      //     workerId: this.workerId,
      //     sessionId
      //   }
      // });

      // Publish response
      await messageQueue.publishLLMResponse(sessionId, {
        requestId,
        digitalTwinId,
        reply,
        newHistory,
        processingTime,
        conversationId: null, // No DB
        success: true
      });

      console.log(`✅ LLM request ${requestId} completed in ${processingTime}ms`);

      // Skip recording API usage
      // await this.recordAPIUsage(digitalTwinId, 'chat_completion', {
      //   tokens: this.estimateTokens(reply),
      //   model: data.model,
      //   requestId
      // });

    } catch (error) {
      console.error(`❌ LLM request ${requestId} failed:`, error);

      const processingTime = Date.now() - startTime;

      // Publish error response
      await messageQueue.publishLLMResponse(sessionId, {
        requestId,
        digitalTwinId,
        error: error.message,
        processingTime,
        success: false
      });
    }
  }

  estimateTokens(text) {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  getModelForTwin(digitalTwinId) {
    const models = {
      "warren-buffett": "ft:gpt-4.1-nano-2025-04-14:ai4smartcity:warren-buffett:CXmgEp7Z",
    };
    return models[digitalTwinId] || "gpt-3.5-turbo";
  }

  async recordAPIUsage(userId, service, data) {
    try {
      const sql = `
        INSERT INTO api_usage (user_id, service, operation, tokens_used, request_metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      `;

      await query(sql, [
        userId || null,
        service,
        'chat_completion',
        data.tokens || 0,
        JSON.stringify({
          model: data.model,
          requestId: data.requestId,
          workerId: this.workerId
        })
      ]);
    } catch (error) {
      console.warn('⚠️ Failed to record API usage:', error.message);
    }
  }

  async stop() {
    console.log(`🛑 Stopping LLM Worker: ${this.workerId}`);

    this.isRunning = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    await messageQueue.close();
  }

  getStatus() {
    return {
      workerId: this.workerId,
      type: 'llm',
      isRunning: this.isRunning,
      messageQueueConnected: messageQueue.isConnected,
      uptime: process.uptime()
    };
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('📴 Received SIGTERM, shutting down LLM worker...');
  const worker = new LLMWorker();
  await worker.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📴 Received SIGINT, shutting down LLM worker...');
  const worker = new LLMWorker();
  await worker.stop();
  process.exit(0);
});

// Start worker if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = new LLMWorker();

  worker.start().catch((error) => {
    console.error('❌ Failed to start LLM worker:', error);
    process.exit(1);
  });

  // Health check endpoint for worker
  const http = await import('http');
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(worker.getStatus()));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const PORT = process.env.LLM_WORKER_PORT || 3002;
  server.listen(PORT, () => {
    console.log(`🏥 LLM Worker health check on port ${PORT}`);
  });
}

export default LLMWorker;
