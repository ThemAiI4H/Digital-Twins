import { WebSocketServer } from "ws";
import express from "express";
import http from "http";
import { callLLM } from "../services/llmService.js";
import { generateTTS } from "../services/ttsService.js";

// Express app
const app = express();
app.use(express.json());
app.use(express.static('test'));

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: 'test' });
});

// Track active sessions
const activeSessions = new Map();

const server = http.createServer(app);

// WebSocket
const wss = new WebSocketServer({ server });

server.listen(3001, () => {
  console.log(`🚀 Test server attivo su http://localhost:3001`);
});

wss.on("connection", (ws) => {
  const sessionId = `test_${Date.now()}`;
  activeSessions.set(sessionId, { ws });

  console.log(`🔌 Test client connected: ${sessionId}`);

  ws.on("message", async (data) => {
    try {
      const { digitalTwinId, prompt, tts_options } = JSON.parse(data.toString());
      console.log(`📨 Test request: ${prompt}`);

      // Direct LLM call
      const start = Date.now();
      const { reply } = await callLLM(digitalTwinId || 'test-user', prompt, []);
      const processingTime = Date.now() - start;

      console.log(`✅ LLM response: ${reply.substring(0, 50)}...`);

      // Send response
      ws.send(JSON.stringify({
        type: "twin_response",
        data: { reply, processingTime }
      }));

      // TTS if requested
      if (tts_options !== false) {
        try {
          const ttsResult = await generateTTS(digitalTwinId || 'test-user', prompt);
          console.log(`✅ TTS generated`);

          // Send TTS chunks
          if (ttsResult.chunks) {
            ttsResult.chunks.forEach((chunk, index) => {
              ws.send(JSON.stringify({
                type: "audio_chunk",
                data: {
                  audioBase64: chunk,
                  isFinalChunk: index === ttsResult.chunks.length - 1
                }
              }));
            });
          }
        } catch (ttsError) {
          console.warn('TTS failed:', ttsError.message);
        }
      }

    } catch (err) {
      console.error(`❌ Error:`, err.message);
      ws.send(JSON.stringify({
        type: "error",
        data: { message: err.message }
      }));
    }
  });

  ws.on("close", () => {
    activeSessions.delete(sessionId);
  });
});
