// Settings management
let settings = {
    fontSize: localStorage.getItem('fontSize') || 'medium',
    animations: localStorage.getItem('animations') !== 'false'
};

// Apply settings
function applySettings() {
    document.body.className = `font-${settings.fontSize}`;
    if (!settings.animations) {
        gsap.set("*", { clearProps: "all" });
    }
}

// Create particles
function createParticles() {
    const particlesContainer = document.getElementById('particles');
    const particleCount = 50;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.width = Math.random() * 4 + 2 + 'px';
        particle.style.height = particle.style.width;
        particle.style.animationDelay = Math.random() * 10 + 's';
        particlesContainer.appendChild(particle);
    }
}

// Enhanced GSAP Timeline for initial animations
const tl = gsap.timeline();

if (settings.animations) {
    tl.from(".container", { duration: 1.2, y: 60, opacity: 0, scale: 0.95, ease: "power3.out" })
      .from(".header", { duration: 0.8, y: -30, opacity: 0, ease: "power2.out" }, "-=0.8")
      .from(".title", { duration: 1, scale: 0.5, opacity: 0, rotation: -10, ease: "back.out(1.7)" }, "-=0.6")
      .from(".switch-container", { duration: 0.7, y: -25, opacity: 0, scale: 0.8, ease: "power2.out" }, "-=0.5")
      .from(".chat-container", { duration: 0.9, scale: 0.9, opacity: 0, rotationY: 15, ease: "power2.out" }, "-=0.4")
      .from(".input-container", { duration: 0.7, y: 40, opacity: 0, scale: 0.9, ease: "power2.out" }, "-=0.3")
      .from(".status", { duration: 0.5, opacity: 0, ease: "power2.out" }, "-=0.2");
}

const messagesEl = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const statusEl = document.getElementById('status');
const titleEl = document.getElementById('title');
const switchButton = document.getElementById('switchButton');
const settingsButton = document.getElementById('settingsButton');
const settingsPanel = document.getElementById('settingsPanel');
const fontSizeSelect = document.getElementById('fontSize');
const animationsToggle = document.getElementById('animations');

// Current digital twin
let currentTwin = localStorage.getItem('currentTwin') || 'warren-buffett';
let isLoading = false;

// Initialize
applySettings();
createParticles();
updateUI();

// Settings panel toggle
settingsButton.addEventListener('click', () => {
    const isActive = settingsPanel.classList.contains('active');
    if (isActive) {
        gsap.to(settingsPanel, { duration: 0.4, scaleY: 0, opacity: 0, ease: "power2.inOut" });
        setTimeout(() => settingsPanel.classList.remove('active'), 400);
    } else {
        settingsPanel.classList.add('active');
        gsap.to(settingsPanel, { duration: 0.4, scaleY: 1, opacity: 1, ease: "power2.inOut" });
    }
});

// Font size change
fontSizeSelect.addEventListener('change', (e) => {
    settings.fontSize = e.target.value;
    localStorage.setItem('fontSize', settings.fontSize);
    applySettings();
});

// Animations toggle
animationsToggle.addEventListener('change', (e) => {
    settings.animations = e.target.checked;
    localStorage.setItem('animations', settings.animations);
    applySettings();
});

// Set initial values
fontSizeSelect.value = settings.fontSize;
animationsToggle.checked = settings.animations;

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

// Typing effect for bot messages
async function typeText(element, text, speed = 50) {
    element.textContent = '';
    for (let i = 0; i < text.length; i++) {
        element.textContent += text[i];
        await new Promise(resolve => setTimeout(resolve, speed));
    }
}

function addMessage(text, sender) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${sender}`;

    messagesEl.appendChild(messageEl);

    if (settings.animations) {
        // Enhanced GSAP animation for new message
        gsap.set(messageEl, { opacity: 0, y: 30, scale: 0.8, rotationX: -15 });
        gsap.to(messageEl, {
            opacity: 1,
            y: 0,
            scale: 1,
            rotationX: 0,
            duration: 0.6,
            ease: "back.out(1.7)",
            onComplete: async () => {
                if (sender === 'bot') {
                    await typeText(messageEl, text, 30);
                } else {
                    messageEl.textContent = text;
                }
            }
        });
    } else {
        messageEl.textContent = text;
    }

    // Scroll to bottom with smooth animation
    if (settings.animations) {
        gsap.to(messagesEl, {
            duration: 0.3,
            scrollTop: messagesEl.scrollHeight,
            ease: "power2.out"
        });
    } else {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }
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

// Enhanced hover effects with GSAP
sendButton.addEventListener('mouseenter', () => {
    if (settings.animations) {
        gsap.to(sendButton, {
            duration: 0.4,
            scale: 1.08,
            y: -3,
            boxShadow: '0 8px 25px rgba(0, 0, 0, 0.3)',
            ease: "power2.out"
        });
    }
});

sendButton.addEventListener('mouseleave', () => {
    if (settings.animations) {
        gsap.to(sendButton, {
            duration: 0.4,
            scale: 1,
            y: 0,
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
            ease: "power2.out"
        });
    }
});

messageInput.addEventListener('focus', () => {
    if (settings.animations) {
        gsap.to(messageInput, {
            duration: 0.4,
            background: 'rgba(255, 255, 255, 0.18)',
            scale: 1.02,
            boxShadow: '0 0 20px rgba(255, 255, 255, 0.1)',
            ease: "power2.out"
        });
    }
});

messageInput.addEventListener('blur', () => {
    if (settings.animations) {
        gsap.to(messageInput, {
            duration: 0.4,
            background: 'rgba(255, 255, 255, 0.1)',
            scale: 1,
            boxShadow: 'none',
            ease: "power2.out"
        });
    }
});

// Settings button hover
settingsButton.addEventListener('mouseenter', () => {
    if (settings.animations) {
        gsap.to(settingsButton, {
            duration: 0.3,
            rotation: 180,
            scale: 1.1,
            ease: "power2.out"
        });
    }
});

settingsButton.addEventListener('mouseleave', () => {
    if (settings.animations) {
        gsap.to(settingsButton, {
            duration: 0.3,
            rotation: 0,
            scale: 1,
            ease: "power2.out"
        });
    }
});

// Switch button enhanced hover
switchButton.addEventListener('mouseenter', () => {
    if (settings.animations) {
        gsap.to(switchButton, {
            duration: 0.3,
            scale: 1.03,
            filter: 'blur(0.5px)',
            ease: "power2.out"
        });
    }
});

switchButton.addEventListener('mouseleave', () => {
    if (settings.animations) {
        gsap.to(switchButton, {
            duration: 0.3,
            scale: 1,
            filter: 'blur(0px)',
            ease: "power2.out"
        });
    }
});

// Container hover effect
document.querySelector('.container').addEventListener('mouseenter', () => {
    if (settings.animations) {
        gsap.to('.container', {
            duration: 0.6,
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.15)',
            y: -5,
            ease: "power2.out"
        });
    }
});

document.querySelector('.container').addEventListener('mouseleave', () => {
    if (settings.animations) {
        gsap.to('.container', {
            duration: 0.6,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
            y: 0,
            ease: "power2.out"
        });
    }
});
