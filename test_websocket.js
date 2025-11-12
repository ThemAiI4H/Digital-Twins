import WebSocket from 'ws';
import { getHistory, getCacheStats } from './services/redisClient.js';

const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
  console.log('🔗 Connesso al server WebSocket');

  // Invia una domanda al digital twin
  const message = {
    digitalTwinId: 'warren-buffett',
    digitalTwinName: 'Warren Buffett',
    prompt: 'Qual è la tua opinione sulla tecnologia AI nel mondo del lavoro?',
    tts_options: {}
  };

  console.log('📤 Invio messaggio:', message);
  ws.send(JSON.stringify(message));
});

ws.on('message', async (data) => {
  const response = JSON.parse(data.toString());
  console.log('📥 Risposta ricevuta:', JSON.stringify(response, null, 2));

  // Dopo aver ricevuto la risposta, controlla Redis
  if (response.type === 'twin_response') {
    console.log('🔍 Controllo cronologia salvata in Redis...');

    try {
      const history = await getHistory('warren-buffett');
      console.log('📚 Cronologia trovata:', history.length, 'messaggi');

      if (history.length > 0) {
        console.log('✅ SUCCESSO: Cronologia salvata in Redis!');
        console.log('📝 Contenuto:', JSON.stringify(history, null, 2));
      } else {
        console.log('❌ FALLIMENTO: Nessuna cronologia trovata in Redis');
      }
    } catch (error) {
      console.error('❌ Errore nel controllo Redis:', error);
    }

    // Chiudi la connessione
    setTimeout(() => {
      console.log('🔌 Chiusura connessione');
      ws.close();
    }, 1000);
  }
});

ws.on('error', (error) => {
  console.error('❌ Errore WebSocket:', error);
});

ws.on('close', () => {
  console.log('🔌 Connessione chiusa');

  // Mostra metriche finali
  const stats = getCacheStats();
  console.log('\n📊 Metriche Performance Finali:');
  console.log('  L1 Cache Size:', stats.l1CacheSize);
  console.log('  Memory Store Size:', stats.memoryStoreSize);
  console.log('  Redis Available:', stats.redisAvailable);
  console.log('  Redis Pool Size:', stats.poolSize);

  process.exit(0);
});
