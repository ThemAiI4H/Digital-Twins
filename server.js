import express from "express";
import { callLLM } from "./llmService.js";

// Express app
const app = express();
app.use(express.json());

// Serve static files from frontend directory
app.use(express.static('frontend'));

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0"
  });
});

// API endpoint for chat
app.post("/api/chat", async (req, res) => {
  try {
    const { digitalTwinId, prompt } = req.body;

    if (!digitalTwinId || !prompt) {
      return res.status(400).json({ error: "Missing digitalTwinId or prompt" });
    }

    console.log(`📨 API request: ${digitalTwinId} - ${prompt.substring(0, 50)}...`);

    const start = Date.now();
    const { reply } = await callLLM(digitalTwinId, prompt, []);
    const processingTime = Date.now() - start;

    console.log(`✅ API response: ${reply.substring(0, 50)}...`);

    res.json({
      reply,
      processingTime,
      digitalTwinId
    });

  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ error: "Non so rispondere" });
  }
});

// For Vercel deployment, export the app
export default app;

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server attivo su http://localhost:${PORT}`);
    console.log(`💚 Health check: http://localhost:${PORT}/health`);
  });
}
