import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'digital_twin_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: parseInt(process.env.DB_POOL_SIZE) || 10, // Maximum number of clients in pool
  min: 2, // Minimum number of clients in pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection could not be established
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// Create connection pool
const pool = new Pool(dbConfig);

pool.on('connect', (client) => {
  console.log('🔌 New database client connected');
});

pool.on('error', (err, client) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

pool.on('remove', (client) => {
  console.log('🔌 Database client removed from pool');
});

// Test database connection
export async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Database connected successfully');
    client.release();
    return true;
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    return false;
  }
}

// Query helper with error handling
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`✅ Query executed in ${duration}ms:`, text.substring(0, 50) + '...');
    return res;
  } catch (err) {
    console.error('❌ Query error:', err);
    throw err;
  }
}

// Transaction helper
export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Health check
export async function healthCheck() {
  try {
    const result = await query('SELECT NOW() as current_time, version() as version');
    return {
      status: 'healthy',
      timestamp: result.rows[0].current_time,
      version: result.rows[0].version,
      pool: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      }
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      error: err.message,
      pool: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      }
    };
  }
}

// Graceful shutdown
export async function close() {
  console.log('🔄 Closing database pool...');
  await pool.end();
  console.log('✅ Database pool closed');
}

// Export pool for advanced usage
export { pool };
