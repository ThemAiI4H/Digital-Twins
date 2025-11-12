import { query, transaction } from '../services/database.js';
import crypto from 'crypto';

export class ConversationRepository {

  /**
   * Create a new conversation
   */
  async create(conversationData) {
    const { digitalTwinId, userId, sessionId, metadata = {} } = conversationData;

    const id = crypto.randomUUID();
    const sql = `
      INSERT INTO conversations (id, digital_twin_id, user_id, session_id, metadata)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await query(sql, [id, digitalTwinId, userId, sessionId, JSON.stringify(metadata)]);
    return result.rows[0];
  }

  /**
   * Find conversation by ID
   */
  async findById(id) {
    const sql = `
      SELECT c.*, dt.name as digital_twin_name, u.username
      FROM conversations c
      LEFT JOIN digital_twins dt ON c.digital_twin_id = dt.id
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = $1
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Find conversation by session ID
   */
  async findBySessionId(sessionId) {
    const sql = `
      SELECT c.*, dt.name as digital_twin_name, u.username
      FROM conversations c
      LEFT JOIN digital_twins dt ON c.digital_twin_id = dt.id
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.session_id = $1
    `;

    const result = await query(sql, [sessionId]);
    return result.rows[0] || null;
  }

  /**
   * Get or create conversation for digital twin and session
   */
  async getOrCreate(digitalTwinId, sessionId, userId = null) {
    // Try to find existing conversation
    let conversation = await this.findBySessionId(sessionId);

    if (!conversation) {
      // Create new conversation
      conversation = await this.create({
        digitalTwinId,
        userId,
        sessionId
      });
    }

    return conversation;
  }

  /**
   * End a conversation
   */
  async endConversation(id) {
    const sql = `
      UPDATE conversations
      SET ended_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND ended_at IS NULL
      RETURNING *
    `;

    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Get conversation messages with pagination
   */
  async getMessages(conversationId, limit = 50, offset = 0) {
    const sql = `
      SELECT * FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [conversationId, limit, offset]);
    return result.rows.reverse(); // Return in chronological order
  }

  /**
   * Add message to conversation
   */
  async addMessage(conversationId, messageData) {
    const { role, content, tokensUsed, modelUsed, responseTimeMs, metadata = {} } = messageData;

    const sql = `
      INSERT INTO messages (conversation_id, role, content, tokens_used, model_used, response_time_ms, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await query(sql, [
      conversationId,
      role,
      content,
      tokensUsed,
      modelUsed,
      responseTimeMs,
      JSON.stringify(metadata)
    ]);

    return result.rows[0];
  }

  /**
   * Get conversation statistics
   */
  async getStats(conversationId) {
    const sql = `
      SELECT
        c.total_messages,
        c.total_tokens,
        c.started_at,
        c.ended_at,
        COUNT(m.id) as actual_messages,
        SUM(m.tokens_used) as actual_tokens,
        AVG(m.response_time_ms) as avg_response_time
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.id = $1
      GROUP BY c.id, c.total_messages, c.total_tokens, c.started_at, c.ended_at
    `;

    const result = await query(sql, [conversationId]);
    return result.rows[0] || null;
  }

  /**
   * Get conversations for a digital twin
   */
  async getByDigitalTwin(digitalTwinId, limit = 20, offset = 0) {
    const sql = `
      SELECT c.*, dt.name as digital_twin_name,
             COUNT(m.id) as message_count
      FROM conversations c
      LEFT JOIN digital_twins dt ON c.digital_twin_id = dt.id
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.digital_twin_id = $1
      GROUP BY c.id, dt.name
      ORDER BY c.started_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [digitalTwinId, limit, offset]);
    return result.rows;
  }

  /**
   * Get active conversations (not ended)
   */
  async getActiveConversations(limit = 50) {
    const sql = `
      SELECT c.*, dt.name as digital_twin_name, u.username
      FROM conversations c
      LEFT JOIN digital_twins dt ON c.digital_twin_id = dt.id
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.ended_at IS NULL
      ORDER BY c.started_at DESC
      LIMIT $1
    `;

    const result = await query(sql, [limit]);
    return result.rows;
  }

  /**
   * Migrate conversation history from Redis to database
   * This method helps transition from the current Redis-only storage
   */
  async migrateFromRedis(digitalTwinId, sessionId, messages) {
    return await transaction(async (client) => {
      // Create conversation if it doesn't exist
      const conversationSql = `
        INSERT INTO conversations (id, digital_twin_id, session_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (session_id) DO NOTHING
        RETURNING id
      `;

      const conversationId = crypto.randomUUID();
      await client.query(conversationSql, [conversationId, digitalTwinId, sessionId]);

      // Insert messages
      const messageSql = `
        INSERT INTO messages (conversation_id, role, content, created_at)
        VALUES ($1, $2, $3, $4)
      `;

      for (const message of messages) {
        await client.query(messageSql, [
          conversationId,
          message.role,
          message.content,
          message.timestamp || new Date()
        ]);
      }

      return conversationId;
    });
  }

  /**
   * Clean up old conversations (for maintenance)
   */
  async cleanupOldConversations(daysOld = 90) {
    const sql = `
      UPDATE conversations
      SET ended_at = CURRENT_TIMESTAMP
      WHERE ended_at IS NULL
      AND started_at < CURRENT_TIMESTAMP - INTERVAL '${daysOld} days'
    `;

    const result = await query(sql);
    return result.rowCount;
  }
}
