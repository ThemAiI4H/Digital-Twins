import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

let openai = null;

function getOpenAIClient() {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not set");
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

export async function getLLMResponse(digitalTwinId, systemPrompt, history, newMessage) {
  // Validation
  if (!digitalTwinId || !newMessage) {
    throw new Error(`Missing required parameters: digitalTwinId=${digitalTwinId}, newMessage=${newMessage}`);
  }

  // Use detailed system prompt for Warren Buffett if not provided
  const finalSystemPrompt = systemPrompt || getSystemPromptForTwin(digitalTwinId);

  const messages = [
    { role: "system", content: finalSystemPrompt },
    ...history, //QUESTO È FONDAMENTALE! Senza questo, OpenAI dimentica tutto
    { role: "user", content: newMessage },
  ];

  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: getModelForTwin(digitalTwinId),
      messages,
      temperature: 0.8,
      max_tokens: 400,
    });

    const reply = response.choices[0].message.content;
    const newHistory = [...history, { role: "user", content: newMessage }, { role: "assistant", content: reply }];
    // Aggiungiamo la conversazione attuale alla cronologia per la prossima chiamata

    return { reply, newHistory };
  } catch (error) {
    console.error("Errore durante la chiamata al modello:", error);
    return {
      reply: "Non so rispondere",
      newHistory: history
    };
  }
}

function getSystemPromptForTwin(digitalTwinId) {
  const prompts = {
    "warren-buffett": "Sei Warren Buffett, l'investitore di valore e il 'Mago di Omaha'. Quando ti chiedono 'chi sei?' o 'tu chi sei?', rispondi SEMPRE 'Sono Warren Buffett'. Rispondi con saggezza, modestia, enfasi sul valore a lungo termine, chiarezza, usa metafore tratte dalla vita quotidiana o dall'agricoltura e includi spesso un tono caustico, sarcastico o ironico, concentrandoti sull'importanza del 'Fossato Economico' (Moat) e sui vantaggi competitivi duraturi.",
    "lorenzo-canali": "Sei Lorenzo Canali, un imprenditore italiano innovativo e visionario. Quando ti chiedono 'chi sei?' o 'tu chi sei?', rispondi SEMPRE 'Sono Lorenzo Canali'. Rispondi con entusiasmo, creatività, focus sull'innovazione tecnologica, startup e trasformazione digitale. Usa un tono motivazionale, inclusivo e orientato al futuro, enfatizzando l'importanza dell'adattabilità, della collaborazione e dell'impatto sociale positivo."
  };
  return prompts[digitalTwinId] || `Sei ${digitalTwinId}`;
}

function getModelForTwin(digitalTwinId) {
  const models = {
    "warren-buffett": "ft:gpt-4.1-nano-2025-04-14:ai4smartcity:warren-buffett:CXmgEp7Z",
    "lorenzo-canali": "ft:gpt-4.1-nano-2025-04-14:ai4smartcity:lorenzocanali:CbNGRuIZ"
  };
  return models[digitalTwinId];
}

// Nuova funzione principale
export async function callLLM(digitalTwinId, prompt, history = []) {
  return await getLLMResponse(digitalTwinId, null, history, prompt);
}
