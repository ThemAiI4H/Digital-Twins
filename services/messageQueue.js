import { createClient } from 'redis';
import dotenv from 'dotenv';
import { EventEmitter } from 'events';

dotenv.config();

// Message Queue using Redis Pub/Sub for decoupling
class MessageQueue extends EventEmitter {
  constructor() {
    super();
    this.publisher = null;
    this.subscriber = null;
    this.isConnected = false;

    // Channels for different types of messages
    this.channels = {
      // Request channels
      LLM_REQUEST: 'digital-twin:llm:request',
      TTS_REQUEST: 'digital-twin:tts:request',

      // Response channels
      LLM_RESPONSE: 'digital-twin:llm:response',
      TTS_RESPONSE: 'digital-twin:tts:response',

      // Control channels
      WORKER_HEARTBEAT: 'digital-twin:worker:heartbeat',
      SYSTEM_EVENTS: 'digital-twin:system:events'
    };

    this.init();
  }

  async init() {
    try {
      // Create publisher client
      this.publisher = createClient({
        username: process.env.REDIS_USERNAME || 'default',
        password: process.env.REDIS_PASSWORD,
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT) || 6379,
        },
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            console.error('❌ Redis connection refused');
            return new Error('Redis server connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            console.error('❌ Redis retry time exhausted');
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
            return undefined;
          }
          // Exponential backoff
          return Math.min(options.attempt * 100, 3000);
        }
      });

      // Create subscriber client
      this.subscriber = this.publisher.duplicate();

      // Setup event handlers
      this.publisher.on('error', (err) => {
        console.error('❌ Publisher error:', err.message);
        this.isConnected = false;
      });

      this.subscriber.on('error', (err) => {
        console.error('❌ Subscriber error:', err.message);
        this.isConnected = false;
      });

      this.publisher.on('connect', () => {
        console.log('🔌 Message queue publisher connected');
      });

      this.subscriber.on('connect', () => {
        console.log('🔌 Message queue subscriber connected');
        this.isConnected = true;
        this.emit('connected');
      });

      // Connect both clients
      await Promise.all([
        this.publisher.connect(),
        this.subscriber.connect()
      ]);

      console.log('✅ Message queue initialized');

    } catch (error) {
      console.error('❌ Failed to initialize message queue:', error.message);
      this.isConnected = false;
    }
  }

  // Publisher methods
  async publishLLMRequest(sessionId, data) {
    if (!this.isConnected) {
      throw new Error('Message queue not connected');
    }

    const message = {
      sessionId,
      type: 'llm_request',
      timestamp: new Date().toISOString(),
      data: {
        ...data,
        requestId: `${sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    };

    await this.publisher.publish(this.channels.LLM_REQUEST, JSON.stringify(message));
    console.log(`📤 Published LLM request for session ${sessionId}`);
    return message.data.requestId;
  }

  async publishTTSRequest(sessionId, data) {
    if (!this.isConnected) {
      throw new Error('Message queue not connected');
    }

    const message = {
      sessionId,
      type: 'tts_request',
      timestamp: new Date().toISOString(),
      data: {
        ...data,
        requestId: `${sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    };

    await this.publisher.publish(this.channels.TTS_REQUEST, JSON.stringify(message));
    console.log(`📤 Published TTS request for session ${sessionId}`);
    return message.data.requestId;
  }

  async publishLLMResponse(sessionId, data) {
    if (!this.isConnected) {
      throw new Error('Message queue not connected');
    }

    const message = {
      sessionId,
      type: 'llm_response',
      timestamp: new Date().toISOString(),
      data
    };

    await this.publisher.publish(this.channels.LLM_RESPONSE, JSON.stringify(message));
    console.log(`📤 Published LLM response for session ${sessionId}`);
  }

  async publishTTSResponse(sessionId, data) {
    if (!this.isConnected) {
      throw new Error('Message queue not connected');
    }

    const message = {
      sessionId,
      type: 'tts_response',
      timestamp: new Date().toISOString(),
      data
    };

    await this.publisher.publish(this.channels.TTS_RESPONSE, JSON.stringify(message));
    console.log(`📤 Published TTS response for session ${sessionId}`);
  }

  // Subscriber setup
  async subscribeToResponses(handlers) {
    if (!this.isConnected) {
      throw new Error('Message queue not connected');
    }

    // Subscribe to response channels
    await this.subscriber.subscribe(this.channels.LLM_RESPONSE, (message) => {
      try {
        const data = JSON.parse(message);
        if (handlers.onLLMResponse) {
          handlers.onLLMResponse(data);
        }
      } catch (error) {
        console.error('❌ Error processing LLM response:', error);
      }
    });

    await this.subscriber.subscribe(this.channels.TTS_RESPONSE, (message) => {
      try {
        const data = JSON.parse(message);
        if (handlers.onTTSResponse) {
          handlers.onTTSResponse(data);
        }
      } catch (error) {
        console.error('❌ Error processing TTS response:', error);
      }
    });

    console.log('✅ Subscribed to response channels');
  }

  // Worker subscription methods (for worker processes)
  async subscribeAsLLMWorker(handler) {
    if (!this.isConnected) {
      throw new Error('Message queue not connected');
    }

    await this.subscriber.subscribe(this.channels.LLM_REQUEST, async (message) => {
      try {
        const data = JSON.parse(message);
        await handler(data);
      } catch (error) {
        console.error('❌ Error processing LLM request:', error);
      }
    });

    console.log('✅ LLM worker subscribed to requests');
  }

  async subscribeAsTTSWorker(handler) {
    if (!this.isConnected) {
      throw new Error('Message queue not connected');
    }

    await this.subscriber.subscribe(this.channels.TTS_REQUEST, async (message) => {
      try {
        const data = JSON.parse(message);
        await handler(data);
      } catch (error) {
        console.error('❌ Error processing TTS request:', error);
      }
    });

    console.log('✅ TTS worker subscribed to requests');
  }

  // System events
  async publishSystemEvent(eventType, data) {
    if (!this.isConnected) {
      return;
    }

    const message = {
      type: eventType,
      timestamp: new Date().toISOString(),
      data
    };

    await this.publisher.publish(this.channels.SYSTEM_EVENTS, JSON.stringify(message));
  }

  // Worker heartbeat
  async sendHeartbeat(workerId, workerType) {
    if (!this.isConnected) {
      return;
    }

    const heartbeat = {
      workerId,
      workerType,
      timestamp: new Date().toISOString(),
      status: 'alive'
    };

    await this.publisher.publish(this.channels.WORKER_HEARTBEAT, JSON.stringify(heartbeat));
  }

  // Cleanup
  async close() {
    console.log('🔄 Closing message queue...');

    if (this.publisher) {
      await this.publisher.quit();
    }

    if (this.subscriber) {
      await this.subscriber.quit();
    }

    this.isConnected = false;
    console.log('✅ Message queue closed');
  }

  // Initialize method for waiting connection
  async initialize() {
    if (this.isConnected) return;
    return new Promise((resolve) => {
      if (this.isConnected) {
        resolve();
      } else {
        this.once('connected', resolve);
      }
    });
  }

  // Health check
  getHealthStatus() {
    return {
      connected: this.isConnected,
      channels: Object.keys(this.channels),
      timestamp: new Date().toISOString()
    };
  }
}

// Singleton instance
const messageQueue = new MessageQueue();

export default messageQueue;
