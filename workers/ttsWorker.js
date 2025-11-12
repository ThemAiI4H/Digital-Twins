import messageQueue from '../services/messageQueue.js';
import { generateTTS } from '../services/ttsService.js';
import { ConversationRepository } from '../repositories/conversationRepository.js';
import { query } from '../services/database.js';
import crypto from 'crypto';

class TTSWorker {
  constructor() {
    this.conversationRepo = new ConversationRepository();
    this.isRunning = false;
    this.workerId = `tts-worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async start() {
    console.log(`🚀 Starting TTS Worker: ${this.workerId}`);

    try {
      // Wait for message queue to be ready
      await new Promise((resolve) => {
        if (messageQueue.isConnected) {
          resolve();
        } else {
          messageQueue.once('connected', resolve);
        }
      });

      // Subscribe to TTS requests
      await messageQueue.subscribeAsTTSWorker(this.handleTTSRequest.bind(this));

      this.isRunning = true;
      console.log(`✅ TTS Worker ${this.workerId} ready`);

      // Send heartbeat every 30 seconds
      this.heartbeatInterval = setInterval(() => {
        messageQueue.sendHeartbeat(this.workerId, 'tts');
      }, 30000);

    } catch (error) {
      console.error('❌ Failed to start TTS worker:', error);
      throw error;
    }
  }

  async handleTTSRequest(requestData) {
    const { sessionId, data } = requestData;
    const { digitalTwinId, text, voiceId, requestId } = data;

    console.log(`🎤 Processing TTS request ${requestId} for session ${sessionId}`);

    const startTime = Date.now();

    try {
      // Generate TTS audio
      const ttsResult = await generateTTS(digitalTwinId, text);

      const processingTime = Date.now() - startTime;

      // Skip storing TTS metadata in database
      // try {
      //   const conversation = await this.conversationRepo.findBySessionId(sessionId);
      //   if (conversation) {
      //     await this.conversationRepo.addMessage(conversation.id, {
      //       role: 'assistant',
      //       content: '[TTS Generated]',
      //       tokensUsed: 0,
      //       modelUsed: 'speechify',
      //       responseTimeMs: processingTime,
      //       metadata: {
      //         requestId,
      //         workerId: this.workerId,
      //         sessionId,
      //         tts: {
      //           voice: ttsResult.voice,
      //           format: 'mp3',
      //           chunksCount: ttsResult.chunks?.length || 0,
      //           totalBytes: ttsResult.totalBytes,
      //           duration: ttsResult.estimatedDuration
      //         }
      //       }
      //     });
      //   }
      // } catch (dbError) {
      //   console.warn('⚠️ Failed to store TTS metadata in database:', dbError.message);
      // }

      // Skip caching audio
      // if (process.env.TTS_CACHE_ENABLED === 'true') {
      //   await this.cacheAudio(text, ttsResult, voiceId);
      // }

      // Publish response
      await messageQueue.publishTTSResponse(sessionId, {
        requestId,
        digitalTwinId,
        ttsResult: {
          sessionId: ttsResult.sessionId,
          voice: ttsResult.voice,
          chunks: ttsResult.chunks,
          totalBytes: ttsResult.totalBytes,
          estimatedDuration: ttsResult.estimatedDuration,
          isStreaming: ttsResult.isStreaming
        },
        processingTime,
        success: true
      });

      console.log(`✅ TTS request ${requestId} completed in ${processingTime}ms`);

      // Skip recording API usage
      // await this.recordAPIUsage(digitalTwinId, 'tts_generation', {
      //   textLength: text.length,
      //   voice: voiceId,
      //   requestId
      // });

    } catch (error) {
      console.error(`❌ TTS request ${requestId} failed:`, error);

      const processingTime = Date.now() - startTime;

      // Publish error response
      await messageQueue.publishTTSResponse(sessionId, {
        requestId,
        digitalTwinId,
        error: error.message,
        processingTime,
        success: false
      });
    }
  }

  async cacheAudio(text, ttsResult, voiceId) {
    try {
      const textHash = crypto.createHash('sha256').update(text + (voiceId || '')).digest('hex');

      // Check if already cached
      const existingSql = `SELECT id FROM audio_cache WHERE text_hash = $1`;
      const existing = await query(existingSql, [textHash]);

      if (existing.rows.length > 0) {
        // Update access time
        const updateSql = `
          UPDATE audio_cache
          SET last_accessed = CURRENT_TIMESTAMP, access_count = access_count + 1
          WHERE text_hash = $1
        `;
        await query(updateSql, [textHash]);
        return;
      }

      // Store new audio cache entry
      const insertSql = `
        INSERT INTO audio_cache (
          id, text_hash, text_content, voice_id, format, audio_data,
          duration_seconds, file_size_bytes, created_at, last_accessed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;

      const audioData = ttsResult.chunks ? Buffer.from(ttsResult.chunks[0], 'base64') : null;
      const duration = ttsResult.estimatedDuration ? parseFloat(ttsResult.estimatedDuration.replace('s', '')) : 0;

      await query(insertSql, [
        crypto.randomUUID(),
        textHash,
        text,
        voiceId || ttsResult.voice,
        'mp3',
        audioData,
        duration,
        ttsResult.totalBytes || 0
      ]);

      console.log(`💾 Cached TTS audio for hash: ${textHash.substring(0, 8)}...`);

    } catch (error) {
      console.warn('⚠️ Failed to cache TTS audio:', error.message);
    }
  }

  async recordAPIUsage(userId, service, data) {
    try {
      const sql = `
        INSERT INTO api_usage (user_id, service, operation, request_metadata, created_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      `;

      await query(sql, [
        userId || null,
        service,
        'tts_generation',
        JSON.stringify({
          textLength: data.textLength,
          voice: data.voice,
          requestId: data.requestId,
          workerId: this.workerId
        })
      ]);
    } catch (error) {
      console.warn('⚠️ Failed to record TTS API usage:', error.message);
    }
  }

  async stop() {
    console.log(`🛑 Stopping TTS Worker: ${this.workerId}`);

    this.isRunning = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    await messageQueue.close();
  }

  getStatus() {
    return {
      workerId: this.workerId,
      type: 'tts',
      isRunning: this.isRunning,
      messageQueueConnected: messageQueue.isConnected,
      uptime: process.uptime()
    };
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('📴 Received SIGTERM, shutting down TTS worker...');
  const worker = new TTSWorker();
  await worker.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📴 Received SIGINT, shutting down TTS worker...');
  const worker = new TTSWorker();
  await worker.stop();
  process.exit(0);
});

// Start worker if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = new TTSWorker();

  worker.start().catch((error) => {
    console.error('❌ Failed to start TTS worker:', error);
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

  const PORT = process.env.TTS_WORKER_PORT || 3003;
  server.listen(PORT, () => {
    console.log(`🏥 TTS Worker health check on port ${PORT}`);
  });
}

export default TTSWorker;
