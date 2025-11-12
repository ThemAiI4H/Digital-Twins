import { WebSocketServer } from "ws";
import express from "express";
import http from "http";
import { handleTwinMessage } from "./ws/handlers.js";
import { getHistory, setHistory, getCacheStats } from "./services/redisClient.js";
import messageQueue from "./services/messageQueue.js";
import { ConversationRepository } from "./repositories/conversationRepository.js";
import { callLLM } from "./services/llmService.js";
import { generateTTS } from "./services/ttsService.js";

// Express app for health checks and future REST API
const app = express();
app.use(express.json());

// Serve static files from frontend directory
app.use(express.static('frontend'));

// Initialize conversation repository
const conversationRepo = new ConversationRepository();

// Track active sessions (WebSocket connections)
const activeSessions = new Map();

// Health check endpoints
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || "1.0.0"
  });
});

app.get("/ready", (req, res) => {
  // Check Redis connectivity
  const cacheStats = getCacheStats();
  if (cacheStats.redisAvailable) {
    res.status(200).json({
      status: "ready",
      timestamp: new Date().toISOString(),
      cache: cacheStats
    });
  } else {
    res.status(503).json({
      status: "not ready",
      timestamp: new Date().toISOString(),
      message: "Redis not available",
      cache: cacheStats
    });
  }
});

// Metrics endpoint for monitoring
app.get("/metrics", (req, res) => {
  const cacheStats = getCacheStats();
  res.status(200).json({
    timestamp: new Date().toISOString(),
    cache: cacheStats,
    process: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    }
  });
});

// Future REST API endpoints can be added here
// app.post("/api/config", (req, res) => {
//   res.json({ status: "ok" });
// });

const server = http.createServer(app);

// Initialize message queue before setting up WebSocket
await messageQueue.initialize();

// WebSocket con compression per performance - attached to HTTP server
const wss = new WebSocketServer({
  server: server,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 10,
    concurrencyLimit: 10,
    threshold: 1024
  }
});

// For Vercel deployment, export the app
export default app;

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`🚀 Server attivo su http://localhost:${PORT}`);
    console.log(`🔌 WebSocket disponibile su ws://localhost:${PORT}`);
    console.log(`💚 Health check: http://localhost:${PORT}/health`);
    console.log(`📊 Metrics: http://localhost:${PORT}/metrics`);
  });
}

wss.on("connection", (ws) => {
  // Generate unique session ID for this WebSocket connection
  const sessionId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  activeSessions.set(sessionId, { ws, connectedAt: new Date() });

  console.log(`🔌 WebSocket client connected: ${sessionId}`);

  // Subscribe to responses for this session
  messageQueue.subscribeToResponses({
    onLLMResponse: (responseData) => handleLLMResponse(sessionId, responseData),
    onTTSResponse: (responseData) => handleTTSResponse(sessionId, responseData)
  });

  ws.on("message", async (data) => {
    try {
      console.log(`📨 Message from ${sessionId}:`, data.toString());
      const { digitalTwinId, digitalTwinName, prompt, tts_options } = JSON.parse(data.toString());
      console.log(`📨 Request from ${digitalTwinId}: ${prompt.substring(0, 50)}...`);

      let useDirect = false;
      let currentHistory = [];

      // Try DB/Redis operations
      try {
        // Get conversation history (hybrid approach: try DB first, fallback to Redis)
        const conversation = await conversationRepo.getOrCreate(digitalTwinId, sessionId);
        const messages = await conversationRepo.getMessages(conversation.id, 20); // Last 20 messages

        // Convert DB messages to the format expected by LLM service
        currentHistory = messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })).reverse(); // Reverse to get chronological order

        console.log(`📚 Loaded ${currentHistory.length} messages from database for ${digitalTwinId}`);

        // Store user message in database
        await conversationRepo.addMessage(conversation.id, {
          role: 'user',
          content: prompt,
          tokensUsed: Math.ceil(prompt.length / 4), // Rough estimation
          responseTimeMs: 0,
          metadata: {
            sessionId,
            source: 'websocket'
          }
        });
      } catch (dbError) {
        console.warn(`⚠️ Database/Redis unavailable, using direct mode for ${digitalTwinId}:`, dbError.message);
        // Fallback to direct mode
        useDirect = true;
        currentHistory = await getHistory(digitalTwinId) || [];
        console.log(`📚 Loaded ${currentHistory.length} messages from Redis for ${digitalTwinId}`);
      }

      if (useDirect) {
        // Direct LLM call
        console.log(`🔄 Using direct mode for ${sessionId}`);
        const start = Date.now();
        const { reply } = await callLLM(digitalTwinId, prompt, currentHistory);
        const processingTime = Date.now() - start;

        console.log(`✅ Direct LLM response: ${reply.substring(0, 50)}...`);

        // Send response
        ws.send(JSON.stringify({
          type: "twin_response",
          timestamp: new Date().toISOString(),
          data: {
            digitalTwinId,
            reply,
            sessionId,
            conversationId: null,
            processingTime,
            tts_will_follow: tts_options !== false
          }
        }));

        // Direct TTS call
        if (tts_options !== false) {
          try {
            const ttsResult = await generateTTS(digitalTwinId, prompt);
            console.log(`✅ Direct TTS generated`);

            // Send TTS chunks
            if (ttsResult.chunks) {
              ttsResult.chunks.forEach((chunk, index) => {
                ws.send(JSON.stringify({
                  type: "audio_chunk",
                  timestamp: new Date().toISOString(),
                  data: {
                    sessionId,
                    chunkIndex: index,
                    audioBase64: chunk,
                    totalChunks: ttsResult.chunks.length,
                    format: "mp3",
                    isFinalChunk: index === ttsResult.chunks.length - 1
                  }
                }));
              });
            }
          } catch (ttsError) {
            console.warn('Direct TTS failed:', ttsError.message);
          }
        }
      } else {
        // Use message queue system
        const llmRequestId = await messageQueue.publishLLMRequest(sessionId, {
          digitalTwinId,
          prompt,
          history: currentHistory
        });

        if (tts_options !== false) {
          await messageQueue.publishTTSRequest(sessionId, {
            digitalTwinId,
            text: prompt,
            voiceId: tts_options?.voice || null,
            waitForLLM: true
          });
        }

        console.log(`✅ Requests published for ${sessionId}: LLM(${llmRequestId})`);
      }

    } catch (err) {
      console.error(`❌ Error processing message from ${sessionId}:`, err);
      ws.send(JSON.stringify({
        type: "error",
        timestamp: new Date().toISOString(),
        data: {
          error_code: "MESSAGE_PROCESSING_ERROR",
          message: err.message,
          sessionId
        }
      }));
    }
  });

  ws.on("close", () => {
    console.log(`🔌 WebSocket client disconnected: ${sessionId}`);

    // End conversation in database
    conversationRepo.findBySessionId(sessionId).then(conversation => {
      if (conversation) {
        conversationRepo.endConversation(conversation.id);
      }
    }).catch(err => {
      console.warn(`⚠️ Failed to end conversation for ${sessionId}:`, err.message);
    });

    // Clean up session tracking
    activeSessions.delete(sessionId);
  });

  ws.on("error", (error) => {
    console.error(`❌ WebSocket error for ${sessionId}:`, error);
    activeSessions.delete(sessionId);
  });
});

// Response handlers
async function handleLLMResponse(sessionId, responseData) {
  const { requestId, digitalTwinId, reply, newHistory, processingTime, conversationId, success, error } = responseData;

  const session = activeSessions.get(sessionId);
  if (!session) {
    console.warn(`⚠️ No active session found for ${sessionId}, ignoring LLM response`);
    return;
  }

  const { ws } = session;

  if (success) {
    console.log(`✅ Sending LLM response to ${sessionId} (${processingTime}ms)`);

    // Send text response immediately
    ws.send(JSON.stringify({
      type: "twin_response",
      timestamp: new Date().toISOString(),
      data: {
        digitalTwinId,
        reply,
        sessionId,
        conversationId,
        processingTime,
        tts_will_follow: true
      }
    }));

    // Update conversation history in Redis (for backward compatibility)
    try {
      await setHistory(digitalTwinId, newHistory);
    } catch (redisError) {
      console.warn('⚠️ Failed to update Redis history:', redisError.message);
    }

  } else {
    console.error(`❌ LLM processing failed for ${sessionId}:`, error);

    ws.send(JSON.stringify({
      type: "error",
      timestamp: new Date().toISOString(),
      data: {
        error_code: "LLM_PROCESSING_ERROR",
        digitalTwinId,
        message: error,
        sessionId
      }
    }));
  }
}

async function handleTTSResponse(sessionId, responseData) {
  const { requestId, digitalTwinId, ttsResult, processingTime, success, error } = responseData;

  const session = activeSessions.get(sessionId);
  if (!session) {
    console.warn(`⚠️ No active session found for ${sessionId}, ignoring TTS response`);
    return;
  }

  const { ws } = session;

  if (success && ttsResult) {
    console.log(`✅ Sending TTS response to ${sessionId} (${processingTime}ms)`);

    // Send TTS started notification
    ws.send(JSON.stringify({
      type: "tts_started",
      timestamp: new Date().toISOString(),
      data: {
        sessionId: ttsResult.sessionId,
        digitalTwinId,
        voice: ttsResult.voice,
        format: "mp3",
        estimatedDuration: ttsResult.estimatedDuration,
        processingTime
      }
    }));

    // Send audio chunks
    if (ttsResult.chunks && ttsResult.chunks.length > 0) {
      ttsResult.chunks.forEach((chunk, index) => {
        ws.send(JSON.stringify({
          type: "audio_chunk",
          timestamp: new Date().toISOString(),
          data: {
            sessionId: ttsResult.sessionId,
            chunkIndex: index,
            audioBase64: chunk,
            totalChunks: ttsResult.chunks.length,
            format: "mp3",
            isFinalChunk: index === ttsResult.chunks.length - 1
          }
        }));
      });
    }

    // Send TTS completion
    ws.send(JSON.stringify({
      type: "tts_complete",
      timestamp: new Date().toISOString(),
      data: {
        sessionId: ttsResult.sessionId,
        digitalTwinId,
        totalChunks: ttsResult.chunks?.length || 0,
        totalAudioBytes: ttsResult.totalBytes || 0,
        totalDuration: ttsResult.estimatedDuration,
        processingTime
      }
    }));

  } else {
    console.error(`❌ TTS processing failed for ${sessionId}:`, error);

    ws.send(JSON.stringify({
      type: "error",
      timestamp: new Date().toISOString(),
      data: {
        error_code: "TTS_PROCESSING_ERROR",
        digitalTwinId,
        message: error,
        sessionId
      }
    }));
  }
}
