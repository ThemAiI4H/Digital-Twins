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
let isLoading = false;

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

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || isLoading) return;

    // Add user message
    addMessage(text, 'user');

    // Show loading
    isLoading = true;
    sendButton.textContent = 'Sending...';
    sendButton.disabled = true;

    try {
        // Send to API
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                digitalTwinId: currentTwin,
                prompt: text
            })
        });

        const data = await response.json();

        if (response.ok) {
            addMessage(data.reply, 'bot');
        } else {
            addMessage(data.error || 'Error', 'bot');
        }

    } catch (error) {
        console.error('Fetch error:', error);
        addMessage('Connection error', 'bot');
    }

    // Reset loading
    isLoading = false;
    sendButton.textContent = 'Send';
    sendButton.disabled = false;

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
