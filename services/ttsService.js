import dotenv from "dotenv";
dotenv.config();

const API_KEY = process.env.TTS_API_KEY || "G23VZlhVg_NXuq6Hm4-tq4G3wPdf_sXZ7aKZRKbVGIY=";
const AGENT_ID = process.env.TTS_AGENT_ID || "henry"; // Default to "henry" instead of empty
const TTS_FORMAT = process.env.TTS_FORMAT || 'mp3';

if (!API_KEY) {
  console.error("⚠️ Missing API_KEY. Set API_KEY environment variable with your Speechify API key.");
  process.exit(1);
}

const SPEECHIFY_CONFIG = {
  baseUrl: 'https://api.sws.speechify.com/v1/audio/stream',
  headers: { 
    "Accept": "audio/mpeg",
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json"
  },
  commonVoices: [
    'henry', 'sarah', 'david', 'alice', 'george', 'emma', 'john', 'jane',
    'a882153d-42fa-4f24-940e-f1c9f7853b12' // Add your UUID voice as fallback
  ]
};

console.log(`🎤 Speechify TTS Provider initialized - Voice: ${AGENT_ID}, Format: ${TTS_FORMAT}`);

// Validate voice ID format
if (AGENT_ID && !SPEECHIFY_CONFIG.commonVoices.includes(AGENT_ID) && !isValidUUID(AGENT_ID)) {
  console.warn(`⚠️ Voice ID '${AGENT_ID}' might not be valid. Common voices: ${SPEECHIFY_CONFIG.commonVoices.slice(0, 8).join(', ')}`);
}

/**
 * Check if a string is a valid UUID
 */
function isValidUUID(str) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(str);
}

/**
 * Get the best voice ID to use
 */
function getBestVoiceId() {
  // If AGENT_ID is set and valid, use it
  if (AGENT_ID && (SPEECHIFY_CONFIG.commonVoices.includes(AGENT_ID) || isValidUUID(AGENT_ID))) {
    return AGENT_ID;
  }
  
  // Fallback to henry
  return 'henry';
}

/**
 * Genera TTS e stream direttamente al client
 */
export async function generateTTS(digitalTwinId, text) {
  const sessionId = `${digitalTwinId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log(`🎤 Generando TTS per ${digitalTwinId}: "${text.substring(0, 50)}..."`);
    
    // Prova prima con streaming real-time
    try {
      return await generateStreamingTTS(sessionId, text);
    } catch (streamError) {
      console.log(`⚠️ Streaming fallito: ${streamError.message}`);
      console.log(`🔄 Fallback a audio completo...`);
      return await generateCompleteTTS(sessionId, text);
    }
    
  } catch (error) {
    console.error("Errore nella generazione TTS:", error);
    throw new Error(`TTS generation failed: ${error.message}`);
  }
}

/**
 * Genera TTS con streaming real-time
 */
async function generateStreamingTTS(sessionId, text) {
  let voiceId = getBestVoiceId();
  
  const requestBody = {
    input: text,
    voice_id: voiceId,
    audio_format: TTS_FORMAT,
    streaming: true
  };

  console.log(` Tentativo streaming TTS: voice=${voiceId}, format=${TTS_FORMAT}`);

  let response = await fetch(SPEECHIFY_CONFIG.baseUrl, {
    method: 'POST',
    headers: {
      ...SPEECHIFY_CONFIG.headers,
      "Accept": "application/octet-stream"
    },
    body: JSON.stringify(requestBody)
  });

  // Prova voci alternative se 404
  if (response.status === 404) {
    console.log(`🔍 Voice '${voiceId}' non trovata, provo alternative...`);
    
    for (const voice of SPEECHIFY_CONFIG.commonVoices) {
      if (voice === voiceId) continue;
      
      const fallbackBody = { ...requestBody, voice_id: voice };
      const fallbackResponse = await fetch(SPEECHIFY_CONFIG.baseUrl, {
        method: 'POST',
        headers: {
          ...SPEECHIFY_CONFIG.headers,
          "Accept": "application/octet-stream"
        },
        body: JSON.stringify(fallbackBody)
      });
      
      if (fallbackResponse.ok) {
        console.log(` Successo con voice: ${voice}`);
        response = fallbackResponse;
        voiceId = voice;
        break;
      }
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Streaming failed: ${response.status} ${errorText}`);
  }

  if (!response.body || !response.body.getReader) {
    throw new Error("Response body doesn't support streaming");
  }

  // Processa lo stream
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  let chunkCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      const base64Chunk = Buffer.from(value).toString('base64');
      chunks.push(base64Chunk);
      totalBytes += value.length;
      chunkCount++;
      
      console.log(` Chunk ${chunkCount}: ${value.length} bytes`);
    }
    
    console.log(` Streaming completo: ${chunkCount} chunks, ${totalBytes} bytes`);
    
    return {
      sessionId,
      voice: voiceId,
      chunks,
      totalBytes,
      estimatedDuration: estimateDuration(totalBytes) + 's',
      isStreaming: true
    };
    
  } finally {
    reader.releaseLock();
  }
}

/**
 * Genera TTS completo (fallback)
 */
async function generateCompleteTTS(sessionId, text) {
  let voiceId = getBestVoiceId();
  
  const requestBody = {
    input: text,
    voice_id: voiceId,
    audio_format: TTS_FORMAT
  };

  console.log(`📦 TTS completo: voice=${voiceId}, format=${TTS_FORMAT}`);

  let response = await fetch(SPEECHIFY_CONFIG.baseUrl, {
    method: 'POST',
    headers: SPEECHIFY_CONFIG.headers,
    body: JSON.stringify(requestBody)
  });

  // Prova voci alternative se 404
  if (response.status === 404) {
    for (const voice of SPEECHIFY_CONFIG.commonVoices) {
      if (voice === voiceId) continue;
      
      const fallbackBody = { ...requestBody, voice_id: voice };
      const fallbackResponse = await fetch(SPEECHIFY_CONFIG.baseUrl, {
        method: 'POST',
        headers: SPEECHIFY_CONFIG.headers,
        body: JSON.stringify(fallbackBody)
      });
      
      if (fallbackResponse.ok) {
        console.log(` Successo con voice: ${voice}`);
        response = fallbackResponse;
        voiceId = voice;
        break;
      }
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Complete TTS failed: ${response.status} ${errorText}`);
  }

  // Gestisci risposta
  const contentType = response.headers.get('content-type') || '';
  let audioBuffer;
  
  if (contentType.includes('application/json')) {
    const responseData = await response.json();
    if (!responseData.audio_data) {
      throw new Error("No audio_data in response");
    }
    audioBuffer = Buffer.from(responseData.audio_data, 'base64');
  } else {
    const arrayBuffer = await response.arrayBuffer();
    audioBuffer = Buffer.from(arrayBuffer);
  }
  
  console.log(` Audio completo: ${audioBuffer.length} bytes`);
  
  return {
    sessionId,
    voice: voiceId,
    audioUrl: `data:audio/mp3;base64,${audioBuffer.toString('base64')}`,
    totalBytes: audioBuffer.length,
    estimatedDuration: estimateDuration(audioBuffer.length) + 's',
    duration: estimateDuration(audioBuffer.length) + 's',
    chunks: [audioBuffer.toString('base64')], // Come singolo chunk
    isStreaming: false
  };
}

/**
 * Stima durata audio (approssimativa)
 */
function estimateDuration(audioBytes) {
  // Stima per MP3: ~128 kbps = 16KB/sec
  const estimatedSeconds = audioBytes / 16000;
  return estimatedSeconds.toFixed(2);
}

/**
 * Test del servizio TTS
 */
export async function testTTS(text = "Hello, this is a TTS test.") {
  console.log(`🧪 Testing TTS service...`);
  
  try {
    const result = await generateTTS('test-twin', text);
    console.log(` Test completato:`, {
      sessionId: result.sessionId,
      voice: result.voice,
      totalBytes: result.totalBytes,
      duration: result.estimatedDuration,
      isStreaming: result.isStreaming,
      chunksCount: result.chunks?.length || 0
    });
    
    return result;
  } catch (error) {
    console.error(`❌ Test fallito: ${error.message}`);
    throw error;
  }
}

/**
 * Get TTS provider info
 */
export function getTTSProviderInfo() {
  return {
    name: 'Speechify',
    provider: 'speechify',
    voice: AGENT_ID,
    format: TTS_FORMAT,
    streaming: true
  };
}