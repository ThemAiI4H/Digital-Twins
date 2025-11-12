// GSAP Timeline for initial animations
const tl = gsap.timeline();

tl.from(".container", { duration: 1, y: 50, opacity: 0, ease: "power3.out" })
  .from(".title", { duration: 0.8, scale: 0.8, opacity: 0, ease: "back.out(1.7)" }, "-=0.5")
  .from(".switch-container", { duration: 0.6, y: -20, opacity: 0, ease: "power2.out" }, "-=0.4")
  .from(".chat-container", { duration: 0.8, scale: 0.9, opacity: 0, ease: "power2.out" }, "-=0.3")
  .from(".input-container", { duration: 0.6, y: 30, opacity: 0, ease: "power2.out" }, "-=0.2");

const messagesEl = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const statusEl = document.getElementById('status');
const titleEl = document.getElementById('title');
const switchButton = document.getElementById('switchButton');

// Current digital twin
let currentTwin = localStorage.getItem('currentTwin') || 'warren-buffett';
updateUI();

function updateUI() {
    const names = {
        'warren-buffett': 'Warren Buffett',
        'lorenzo-canali': 'Lorenzo Canali'
    };
    titleEl.textContent = `Digital Twin Chat - ${names[currentTwin]}`;
    switchButton.textContent = `Switch to ${currentTwin === 'warren-buffett' ? 'Lorenzo Canali' : 'Warren Buffett'}`;
}

switchButton.addEventListener('click', () => {
    currentTwin = currentTwin === 'warren-buffett' ? 'lorenzo-canali' : 'warren-buffett';
    localStorage.setItem('currentTwin', currentTwin);
    updateUI();
    // Clear messages when switching
    messagesEl.innerHTML = '';
});

// WebSocket connection
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.host || 'localhost:3000'}`;
let ws;

function connectWebSocket() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        statusEl.textContent = 'Connected';
        gsap.to(statusEl, { duration: 0.3, color: '#4ecdc4' });
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };

    ws.onclose = () => {
        statusEl.textContent = 'Disconnected';
        gsap.to(statusEl, { duration: 0.3, color: '#ff6b6b' });
        // Auto reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        statusEl.textContent = 'Connection Error';
        gsap.to(statusEl, { duration: 0.3, color: '#ff6b6b' });
    };
}

connectWebSocket();

function handleMessage(data) {
    switch (data.type) {
        case 'twin_response':
            addMessage(data.data.reply, 'bot');
            break;
        case 'tts_started':
            // TTS started, prepare for audio
            break;
        case 'audio_chunk':
            handleAudioChunk(data.data);
            break;
        case 'tts_complete':
            // TTS complete
            break;
        case 'error':
            addMessage(`Error: ${data.data.message}`, 'bot');
            break;
        default:
            console.log('Unknown message type:', data.type);
    }
}

let audioChunks = [];
let audioContext;
let audioBuffer;

function handleAudioChunk(data) {
    audioChunks.push(data.audioBase64);

    if (data.isFinalChunk) {
        playAudio();
    }
}

function playAudio() {
    if (audioChunks.length === 0) return;

    const audioData = audioChunks.join('');
    audioChunks = [];

    // Convert base64 to ArrayBuffer
    const binaryString = atob(audioData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    // Play audio
    const blob = new Blob([bytes], { type: 'audio/mp3' });
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    audio.play();
}

function addMessage(text, sender) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${sender}`;
    messageEl.textContent = text;

    messagesEl.appendChild(messageEl);

    // GSAP animation for new message
    gsap.fromTo(messageEl,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }
    );

    // Scroll to bottom
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || ws.readyState !== WebSocket.OPEN) return;

    // Add user message
    addMessage(text, 'user');

    // Send to server
    const message = {
        digitalTwinId: currentTwin,
        digitalTwinName: currentTwin === 'warren-buffett' ? 'Warren Buffett' : 'Lorenzo Canali',
        prompt: text,
        tts_options: { voice: 'default' } // Enable TTS
    };

    ws.send(JSON.stringify(message));

    // Clear input
    messageInput.value = '';

    // Animate send button
    gsap.to(sendButton, { duration: 0.1, scale: 0.9, yoyo: true, repeat: 1, ease: "power2.inOut" });
}

// Event listeners
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Hover effects with GSAP
sendButton.addEventListener('mouseenter', () => {
    gsap.to(sendButton, { duration: 0.3, scale: 1.05, ease: "power2.out" });
});

sendButton.addEventListener('mouseleave', () => {
    gsap.to(sendButton, { duration: 0.3, scale: 1, ease: "power2.out" });
});

messageInput.addEventListener('focus', () => {
    gsap.to(messageInput, { duration: 0.3, background: 'rgba(255, 255, 255, 0.15)', ease: "power2.out" });
});

messageInput.addEventListener('blur', () => {
    gsap.to(messageInput, { duration: 0.3, background: 'rgba(255, 255, 255, 0.1)', ease: "power2.out" });
});
