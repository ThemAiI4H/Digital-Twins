const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send');

const ws = new WebSocket('ws://localhost:3001');

ws.onopen = () => {
    console.log('Connected to test server');
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'twin_response') {
        addMessage(data.data.reply, 'bot');
    } else if (data.type === 'audio_chunk') {
        // Handle audio
        playAudio(data.data.audioBase64);
    } else if (data.type === 'error') {
        addMessage('Error: ' + data.data.message, 'bot');
    }
};

ws.onclose = () => {
    console.log('Disconnected');
};

function addMessage(text, sender) {
    const msg = document.createElement('div');
    msg.className = `message ${sender}`;
    msg.textContent = text;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function playAudio(base64) {
    const audio = new Audio('data:audio/mp3;base64,' + base64);
    audio.play();
}

sendBtn.addEventListener('click', sendMessage);
inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    addMessage(text, 'user');

    ws.send(JSON.stringify({
        digitalTwinId: 'test-user',
        prompt: text,
        tts_options: true
    }));

    inputEl.value = '';
}
