# Digital Twin Backend - Enterprise Scalable Edition

Backend server per il progetto Digital Twin che fornisce un'interfaccia WebSocket scalabile per interagire con modelli AI fine-tuned.

## 🏗️ Architettura Scalabile

Questa versione implementa un'architettura enterprise-ready con:

- **Load Balancing**: Nginx con session affinity per WebSocket
- **Database Relazionale**: PostgreSQL per persistenza dati strutturata
- **Message Queue**: Redis Pub/Sub per decoupling asincrono
- **Microservizi**: Architettura containerizzata con Docker Swarm
- **Monitoring**: Prometheus + Grafana per osservabilità
- **Health Checks**: Endpoint dedicati per monitoraggio salute servizi

### Componenti dell'Architettura

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Gateway   │    │  WebSocket      │    │   Monitoring    │
│   (Nginx)       │    │   Service       │    │   Stack         │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
          │                       │                       │
          └───────────────────────┼───────────────────────┘
                                  │
                    ┌─────────────────┐
                    │   Message       │
                    │   Queue         │
                    │   (Redis)       │
                    └─────────────────┘
          ┌─────────┼─────────┬─────────┼─────────┐
          │         │         │         │         │
┌─────────────────┐ │ ┌─────────────────┐ ┌─────────────────┐
│   LLM Worker    │ │ │   TTS Worker    │ │  Database       │
│   Service       │ │ │   Service       │ │  Service        │
└─────────────────┘ │ └─────────────────┘ └─────────────────┘
                    │
          ┌─────────────────┐
          │   Cache         │
          │   (Redis)       │
          └─────────────────┘
```

## 🚀 Deployments

### Opzione 1: Deploy Rapido (Docker Swarm)

```bash
# Deploy completo con un comando
./scripts/deploy.sh

# Oppure deploy manuale
docker swarm init
docker stack deploy -c docker-compose.yml digital-twin
```

### Opzione 2: Deploy Locale per Sviluppo

```bash
# Installazione dipendenze
npm install

# Avvio semplice (senza scalabilità)
npm start
```

### Opzione 3: Deploy su Kubernetes

```bash
# Converti docker-compose in Kubernetes manifests
kompose convert -f docker-compose.yml

# Deploy su cluster K8s
kubectl apply -f digital-twin-k8s/
```

## 📊 Monitoraggio e Osservabilità

### Endpoint Disponibili

- **Health Check**: `http://localhost/health`
- **Readiness**: `http://localhost/ready`
- **Metrics**: `http://localhost/metrics`
- **WebSocket**: `ws://localhost/ws`
- **Grafana**: `http://localhost:3001` (admin/admin)
- **Prometheus**: `http://localhost:9090`

### Metriche Monitorate

- Response times (LLM, TTS)
- Error rates per servizio
- Connection pool usage
- WebSocket active connections
- Database query performance
- Cache hit/miss ratios

## 🔧 Configurazione

### Environment Variables

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-...

# TTS Configuration (Speechify)
TTS_API_KEY=your_tts_key
TTS_AGENT_ID=voice_id
TTS_FORMAT=mp3

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_POOL_SIZE=5

# Database Configuration
DB_HOST=postgres
DB_PORT=5432
DB_NAME=digital_twin_db
DB_USER=digital_twin
DB_PASSWORD=digital_twin_password
DB_POOL_SIZE=10

# Server Configuration
PORT=3000
NODE_ENV=production
```

### Scaling dei Servizi

```bash
# Scale backend instances
./scripts/deploy.sh scale backend 5

# Scale nginx load balancers
./scripts/deploy.sh scale nginx 3

# Check service status
docker stack ps digital-twin
```

## Utilizzo

### Connessione WebSocket
Connettiti al server WebSocket usando un client compatibile:
```javascript
const ws = new WebSocket('ws://localhost:3000');
```

### Formato JSON Input
Il server si aspetta messaggi in formato JSON con la seguente struttura:

```json
{
  "digitalTwinId": "warren-buffett-001",
  "digitalTwinName": "Warren Buffett",
  "prompt": "Cosa pensi degli investimenti in tecnologia?"
}
```

#### Campi richiesti:
- `digitalTwinId` (string): Identificativo univoco del digital twin **[IMPORTANTE: per mantenere la sessione]**
- `digitalTwinName` (string): Nome del digital twin da utilizzare **[IMPORTANTE: per identificare quale twin cercare al primo avvio]**
- `prompt` (string): Il messaggio/domanda da inviare al digital twin

### Formato JSON Output
Il server risponde sempre con entrambi gli identificatori:

```json
{
  "digitalTwinId": "warren-buffett-001",
  "digitalTwinName": "Warren Buffett",
  "reply": "Risposta del digital twin..."
}
```

In caso di errore:
```json
{
  "digitalTwinId": "warren-buffett-001",
  "digitalTwinName": "Warren Buffett",
  "error": "Digital twin not found o altro errore"
}
```

> **Nota**: Entrambi `digitalTwinId` e `digitalTwinName` sono necessari per permettere al server di identificare correttamente quale digital twin utilizzare, specialmente al primo avvio della sessione.

## Modelli Supportati

Attualmente configurato con:
- **Warren Buffett**: `ft:gpt-4.1-nano-2025-04-14:ai4smartcity:warren-buffett:CXmgEp7Z`

## Esempio Completo

```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  // Invia messaggio al digital twin
  ws.send(JSON.stringify({
    digitalTwinId: "warren-buffett-001",
    digitalTwinName: "Warren Buffett",
    prompt: "Qual è la tua strategia di investimento?"
  }));
};

ws.onmessage = (event) => {
  const response = JSON.parse(event.data);
  console.log(`${response.digitalTwinName} (${response.digitalTwinId}): ${response.reply}`);
};
```

## Note di Sicurezza

- Non committare mai il file `.env` nel repository
- Aggiungi `.env` al tuo `.gitignore`
- Mantieni sicura la tua API key OpenAI
