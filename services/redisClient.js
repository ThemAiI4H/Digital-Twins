import { createClient } from 'redis';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

// Debug: log delle env vars lette
console.log('🔍 Redis Config Debug:');
console.log('  REDIS_HOST:', process.env.REDIS_HOST);
console.log('  REDIS_PORT:', process.env.REDIS_PORT);
console.log('  REDIS_USERNAME:', process.env.REDIS_USERNAME);
console.log('  REDIS_PASSWORD:', process.env.REDIS_PASSWORD ? '[SET]' : '[NOT SET]');

// Connection Pooling per alta performance
const POOL_SIZE = parseInt(process.env.REDIS_POOL_SIZE) || 5;
const redisClients = [];
let redisAvailable = false;

// Crea pool di connessioni Redis
for (let i = 0; i < POOL_SIZE; i++) {
  const client = createClient({
    username: process.env.REDIS_USERNAME || 'default',
    password: process.env.REDIS_PASSWORD,
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
    },
    // Ottimizzazioni performance
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    lazyConnect: true,
    // Per Redis Cloud, potrebbe servire TLS
    // tls: process.env.REDIS_HOST && process.env.REDIS_HOST.includes('redis-cloud.com') ? {} : undefined,
  });

  client.on('error', (err) => {
    console.error(`❌ Errore Redis client ${i}:`, err.message);
  });

  client.on('connect', () => {
    console.log(`✅ Redis client ${i} connesso`);
  });

  client.on('ready', () => {
    if (!redisAvailable) {
      console.log('🚀 Redis pool pronto');
      redisAvailable = true;
    }
  });

  client.on('end', () => {
    console.log(`🔌 Redis client ${i} disconnesso`);
  });

  // Connessione iniziale lazy
  client.connect().catch((err) => {
    console.warn(`⚠️ Redis client ${i} non disponibile:`, err.message);
  });

  redisClients.push(client);
}

// Round-robin per distribuire load
let currentClientIndex = 0;
function getClient() {
  const client = redisClients[currentClientIndex];
  currentClientIndex = (currentClientIndex + 1) % POOL_SIZE;
  return client;
}

// Fallback in-memory con TTL
const memoryStore = new Map();
const MEMORY_CACHE_TTL = 10 * 60 * 1000; // 10 minuti

export default getClient;

// L1 Cache (in-memory) per performance
const l1Cache = new Map();
const L1_CACHE_TTL = 5 * 60 * 1000; // 5 minuti

function getFromL1Cache(key) {
  const cached = l1Cache.get(key);
  if (cached && Date.now() - cached.timestamp < L1_CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setL1Cache(key, data) {
  l1Cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

// Funzioni helper per gestire la cronologia con caching multi-livello
export async function getHistory(digitalTwinId) {
  const cacheKey = `history:${digitalTwinId}`;

  // 1. Check L1 Cache
  const l1Data = getFromL1Cache(cacheKey);
  if (l1Data) {
    console.log(`⚡ Hit L1 cache per ${digitalTwinId}`);
    return l1Data;
  }

  // 2. Check Redis
  if (redisAvailable) {
    try {
      const client = getClient();
      const historyJson = await client.get(cacheKey);

      if (historyJson) {
        const parsed = JSON.parse(historyJson);
        console.log(`✅ Hit Redis per ${digitalTwinId}: ${parsed.length} messaggi`);

        // Update L1 cache
        setL1Cache(cacheKey, parsed);
        return parsed;
      }
    } catch (error) {
      console.error('❌ Errore Redis, uso fallback:', error.message);
    }
  }

  // 3. Fallback to memory store
  console.log(`💾 Fallback memory store per ${digitalTwinId}`);
  const memoryData = memoryStore.get(digitalTwinId) || [];
  setL1Cache(cacheKey, memoryData); // Cache anche i dati memory
  return memoryData;
}

export async function setHistory(digitalTwinId, history) {
  const cacheKey = `history:${digitalTwinId}`;

  // Validazione input
  if (!Array.isArray(history)) {
    console.error('❌ History deve essere un array');
    return;
  }

  // 1. Update L1 Cache
  setL1Cache(cacheKey, history);

  // 2. Update Redis
  if (redisAvailable) {
    try {
      const client = getClient();
      await client.set(cacheKey, JSON.stringify(history), {
        EX: 24 * 60 * 60, // TTL 24 ore
      });
      console.log(`✅ Salvataggio Redis completato per ${digitalTwinId}`);
    } catch (error) {
      console.error('❌ Errore Redis, uso solo memory:', error.message);
    }
  }

  // 3. Always update memory store come backup
  memoryStore.set(digitalTwinId, history);
  console.log(`💾 Backup memory store aggiornato per ${digitalTwinId}`);
}

export async function deleteHistory(digitalTwinId) {
  const cacheKey = `history:${digitalTwinId}`;

  // Remove from L1 cache
  l1Cache.delete(cacheKey);

  // Remove from Redis
  if (redisAvailable) {
    try {
      const client = getClient();
      await client.del(cacheKey);
      console.log(`🗑️ Cancellazione Redis completata per ${digitalTwinId}`);
    } catch (error) {
      console.error('Errore nella cancellazione da Redis:', error);
    }
  }

  // Remove from memory store
  memoryStore.delete(digitalTwinId);
}

// Metriche performance
export function getCacheStats() {
  return {
    l1CacheSize: l1Cache.size,
    memoryStoreSize: memoryStore.size,
    redisAvailable,
    poolSize: POOL_SIZE
  };
}
