import { callLLM } from "../services/llmService.js";
import { generateTTS } from "../services/ttsService.js";

export async function handleTwinMessage(ws, digitalTwinId, digitalTwinName, prompt, history = []) {
  try {
    // 1️⃣ Chiamata immediata al modello LLM
    const { reply: textReply, newHistory } = await callLLM(digitalTwinId, prompt, history);

    // 2️⃣ Invia subito la risposta testuale al client
    ws.send(JSON.stringify({
      type: "twin_response",
      timestamp: new Date().toISOString(),
      data: {
        digitalTwinId,
        digitalTwinName,
        text: textReply,
        session_id: `${digitalTwinId}_${Date.now()}`,
        tts_will_follow: true
      }
    }));

    // 3️⃣ Avvia generazione TTS in parallelo (non bloccante)
    generateTTS(digitalTwinId, textReply)
      .then(ttsResult => {
        // 4️⃣ Invia notifica TTS started
        ws.send(JSON.stringify({
          type: "tts_started",
          timestamp: new Date().toISOString(),
          data: {
            session_id: ttsResult.sessionId,
            digitalTwinId,
            text: textReply,
            voice: ttsResult.voice || "henry",
            provider: "speechify",
            format: "mp3",
            estimated_duration: ttsResult.estimatedDuration
          }
        }));

        // 5️⃣ Stream audio chunks se disponibili
        if (ttsResult.chunks && ttsResult.chunks.length > 0) {
          ttsResult.chunks.forEach((chunk, index) => {
            ws.send(JSON.stringify({
              type: "audio_chunk",
              timestamp: new Date().toISOString(),
              data: {
                session_id: ttsResult.sessionId,
                chunk_index: index,
                audio_base64: chunk, // Invia il chunk così com'è
                total_chunks_expected: ttsResult.chunks.length,
                format: "mp3",
                is_final_chunk: index === ttsResult.chunks.length - 1
              }
            }));

            if (index === 0) {
              console.log(`Chunk ${index + 1}/${ttsResult.chunks.length} inviato`);
            }else if (index === ttsResult.chunks.length - 1) {
              console.log(`Tutti i chunk (${ttsResult.chunks.length}) inviati`);
            }
          });
        }

        // 6️⃣ TTS completato
        ws.send(JSON.stringify({
          type: "tts_complete",
          timestamp: new Date().toISOString(),
          data: {
            session_id: ttsResult.sessionId,
            digitalTwinId,
            total_chunks: ttsResult.chunks?.length || 0,
            total_audio_bytes: ttsResult.totalBytes || 0,
            total_duration: ttsResult.duration || ttsResult.estimatedDuration,
            audioUrl: ttsResult.audioUrl // Solo per audio completo
          }
        }));
      })
      .catch(err => {
        console.error("❌ Errore TTS:", err);
        ws.send(JSON.stringify({
          type: "error",
          timestamp: new Date().toISOString(),
          data: {
            error_code: "TTS_ERROR",
            digitalTwinId,
            message: `Errore durante la generazione TTS: ${err.message}`,
            stage: "tts_synthesis"
          }
        }));
      });

    return { newHistory }; // Per mantenere la cronologia

  } catch (error) {
    console.error("❌ Errore LLM:", error);
    ws.send(JSON.stringify({
      type: "error",
      timestamp: new Date().toISOString(),
      data: {
        error_code: "DIGITAL_TWIN_ERROR",
        digitalTwinId,
        message: `Errore durante la generazione del testo: ${error.message}`,
        stage: "twin_response"
      }
    }));
  }
}

