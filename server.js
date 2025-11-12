import express from "express";
import { callLLM } from "./llmService.js";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Express app
const app = express();
app.use(express.json());

// Serve static files from frontend directory
const __dirname = dirname(fileURLToPath(import.meta.url));
// app.use(express.static(join(__dirname, 'frontend')));

// Serve frontend
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, 'frontend', 'index.html'));
});

app.get("/styles.css", (req, res) => {
  res.sendFile(join(__dirname, 'frontend', 'styles.css'));
});

app.get("/script.js", (req, res) => {
  res.sendFile(join(__dirname, 'frontend', 'script.js'));
});

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

    // Temporary: return fixed response
    const reply = `Ciao! Sono ${digitalTwinId === 'warren-buffett' ? 'Warren Buffett' : 'Lorenzo Canali'}. Come posso aiutarti?`;
    const processingTime = 100;

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
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server attivo su http://localhost:${PORT}`);
    console.log(`💚 Health check: http://localhost:${PORT}/health`);
  });
}
