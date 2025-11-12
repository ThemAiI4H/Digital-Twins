-- Digital Twin Backend Database Schema
-- Migration: 001_initial_schema
-- Created: 2025-11-11

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users and Authentication
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- For future authentication
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Digital Twins Configuration
CREATE TABLE digital_twins (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    system_prompt TEXT,
    model VARCHAR(50) DEFAULT 'gpt-3.5-turbo',
    voice_id VARCHAR(100),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Conversation Sessions
CREATE TABLE conversations (
    id VARCHAR(100) PRIMARY KEY,
    digital_twin_id VARCHAR(50) REFERENCES digital_twins(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(100) UNIQUE, -- From WebSocket session
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    total_messages INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Messages with full history
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    conversation_id VARCHAR(100) REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    tokens_used INTEGER,
    model_used VARCHAR(50),
    response_time_ms INTEGER, -- Response time in milliseconds
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}' -- Store TTS info, errors, etc.
);

-- TTS Cache/Audio Storage
CREATE TABLE audio_cache (
    id VARCHAR(100) PRIMARY KEY,
    text_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 hash of text + voice
    text_content TEXT NOT NULL,
    voice_id VARCHAR(100),
    format VARCHAR(10) DEFAULT 'mp3',
    audio_data BYTEA,
    audio_url VARCHAR(500), -- For external storage (S3, etc.)
    duration_seconds DECIMAL(5,2),
    file_size_bytes INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    access_count INTEGER DEFAULT 0
);

-- API Usage Tracking (for billing/monitoring)
CREATE TABLE api_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    service VARCHAR(50) NOT NULL, -- 'openai', 'speechify', etc.
    operation VARCHAR(50) NOT NULL, -- 'chat_completion', 'tts_generation', etc.
    tokens_used INTEGER,
    cost_cents INTEGER, -- Cost in cents (for billing)
    request_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- System Health Monitoring
CREATE TABLE system_metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(10,2),
    metric_unit VARCHAR(20),
    tags JSONB DEFAULT '{}',
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX CONCURRENTLY idx_conversations_digital_twin ON conversations(digital_twin_id);
CREATE INDEX CONCURRENTLY idx_conversations_user ON conversations(user_id);
CREATE INDEX CONCURRENTLY idx_conversations_started_at ON conversations(started_at);
CREATE INDEX CONCURRENTLY idx_messages_conversation ON messages(conversation_id);
CREATE INDEX CONCURRENTLY idx_messages_created_at ON messages(created_at);
CREATE INDEX CONCURRENTLY idx_audio_cache_hash ON audio_cache(text_hash);
CREATE INDEX CONCURRENTLY idx_audio_cache_accessed ON audio_cache(last_accessed);
CREATE INDEX CONCURRENTLY idx_api_usage_user ON api_usage(user_id);
CREATE INDEX CONCURRENTLY idx_api_usage_created_at ON api_usage(created_at);
CREATE INDEX CONCURRENTLY idx_system_metrics_name ON system_metrics(metric_name);
CREATE INDEX CONCURRENTLY idx_system_metrics_recorded_at ON system_metrics(recorded_at);

-- Partial indexes for active records
CREATE INDEX CONCURRENTLY idx_active_digital_twins ON digital_twins(id) WHERE is_active = true;
CREATE INDEX CONCURRENTLY idx_active_users ON users(id) WHERE is_active = true;

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_digital_twins_updated_at BEFORE UPDATE ON digital_twins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update conversation statistics
CREATE OR REPLACE FUNCTION update_conversation_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE conversations
        SET total_messages = total_messages + 1,
            total_tokens = total_tokens + COALESCE(NEW.tokens_used, 0)
        WHERE id = NEW.conversation_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE conversations
        SET total_messages = total_messages - 1,
            total_tokens = total_tokens - COALESCE(OLD.tokens_used, 0)
        WHERE id = OLD.conversation_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_conversation_stats_trigger
    AFTER INSERT OR DELETE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_stats();

-- Function to update audio cache access statistics
CREATE OR REPLACE FUNCTION update_audio_cache_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE audio_cache
    SET last_accessed = CURRENT_TIMESTAMP,
        access_count = access_count + 1
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Note: This trigger would be activated when audio is accessed
-- CREATE TRIGGER update_audio_cache_stats_trigger
--     AFTER SELECT ON audio_cache
--     FOR EACH ROW EXECUTE FUNCTION update_audio_cache_stats();

-- Row Level Security (RLS) policies (optional, for multi-tenant setups)
-- ALTER TABLE digital_twins ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY digital_twins_user_policy ON digital_twins
--     FOR ALL USING (user_id = current_user_id());

-- Default data (optional seed data)
-- INSERT INTO users (username, email) VALUES ('admin', 'admin@example.com');
-- INSERT INTO digital_twins (id, name, system_prompt) VALUES
--     ('warren-buffett', 'Warren Buffett', 'You are Warren Buffett...');

-- Comments for documentation
COMMENT ON TABLE users IS 'User accounts for the digital twin platform';
COMMENT ON TABLE digital_twins IS 'Digital twin configurations and settings';
COMMENT ON TABLE conversations IS 'Chat sessions between users and digital twins';
COMMENT ON TABLE messages IS 'Individual messages in conversations';
COMMENT ON TABLE audio_cache IS 'Cached TTS audio files and metadata';
COMMENT ON TABLE api_usage IS 'API usage tracking for billing and monitoring';
COMMENT ON TABLE system_metrics IS 'System performance and health metrics';
