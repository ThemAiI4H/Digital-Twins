import { getHistory } from './services/redisClient.js';

async function checkRedis() {
  console.log('🔍 Controllo cronologia salvata in Redis...');

  try {
    const history = await getHistory('warren-buffett');
    console.log('📚 Cronologia per warren-buffett:');
    console.log(JSON.stringify(history, null, 2));

    if (history.length > 0) {
      console.log('✅ Cronologia salvata correttamente in Redis!');
    } else {
      console.log('⚠️ Nessuna cronologia trovata');
    }
  } catch (error) {
    console.error('❌ Errore nel controllo Redis:', error);
  }

  process.exit(0);
}

checkRedis();
