# Watch Together Application

A complete application for watching local videos or YouTube videos synchronously with friends in real-time, complete with a live chat system, room user counting, **host controls**, **bandwidth-free local video syncing**, a synchronized **countdown feature**, and newly added **Secure Room Passwords**!

## 1. How to Install Dependencies

1. Ensure you have **Node.js** installed on your system.
2. Open a terminal (Command Prompt, PowerShell, or Git Bash).
3. Navigate to your project directory.
4. Run the following command to download the required Node.js libraries:
   ```bash
   npm install express socket.io
   ```

## 2. How to Run the Server locally

1. In your terminal, run the following command to start the server:
   ```bash
   npm start
   ```
2. You should see `Server listening on port 3000` logged in your terminal. This means the backend is ready!

## 3. How to Setup and Join Password-Protected Rooms

1. Open your web browser and go to your live URL (or `http://localhost:3000`).
2. Type a **Room Code** (e.g., `movie-night`).
3. Type a **Room Password** (e.g., `secret123`).
4. Click **Join Room**.
5. Because you are the first person, you automatically create the room and become the **HOST**, and the password you typed is locked into that room.
6. When your friends want to join, they type the exact same Room Code `movie-night` and your exact password `secret123` to enter as viewers!

---

# Full Working Code (Copy-Paste Ready)

Below are the 5 core files needed to run this project. You should organize them exactly like this:
```text
watch2gether/
├── package.json
├── server.js
└── public/
    ├── index.html
    ├── style.css
    └── script.js
```

### 1. `package.json`
```json
{
  "name": "watch2gether",
  "version": "1.0.0",
  "description": "Watch together website",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.2"
  }
}
```

### 2. `server.js`
```javascript
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Store hosts for each room: { roomId: socket.id }
const roomHosts = {};
const roomPasswords = {}; // Protect rooms with passwords

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to discover locally stored videos
app.get('/api/videos', (req, res) => {
    const videoDir = path.join(__dirname, 'public', 'videos');
    if (!fs.existsSync(videoDir)) {
        fs.mkdirSync(videoDir, { recursive: true });
    }
    const files = fs.readdirSync(videoDir).filter(f => f.match(/\.(mp4|webm|ogg)$/i));
    res.json(files);
});

io.on('connection', (socket) => {
    // Join a room
    socket.on('join-room', ({ roomId, password }) => {
        const targetRoom = io.sockets.adapter.rooms.get(roomId);
        const targetCount = targetRoom ? targetRoom.size : 0;
        
        if (targetCount > 0) {
            if (roomPasswords[roomId] !== password) {
                socket.emit('join-error', 'Incorrect room password!');
                return;
            }
        } else {
            roomPasswords[roomId] = password || '';
        }

        // Leave previous room if any
        if (socket.roomId) {
            socket.leave(socket.roomId);
            const prevRoom = io.sockets.adapter.rooms.get(socket.roomId);
            const prevCount = prevRoom ? prevRoom.size : 0;
            io.to(socket.roomId).emit('update-user-count', prevCount);
            
            // Reassign host if this user was the host
            if (roomHosts[socket.roomId] === socket.id) {
                if (prevCount > 0) {
                    const nextHost = Array.from(prevRoom)[0];
                    roomHosts[socket.roomId] = nextHost;
                    io.to(nextHost).emit('is-host', true);
                } else {
                    delete roomHosts[socket.roomId];
                    delete roomPasswords[socket.roomId];
                }
            }
        }

        socket.join(roomId);
        socket.roomId = roomId; // Store room ID on the socket
        
        const room = io.sockets.adapter.rooms.get(roomId);
        const count = room ? room.size : 0;
        
        // Assign as host if first to join
        if (count === 1) {
            roomHosts[roomId] = socket.id;
        }

        socket.emit('join-success', roomId);

        // Broadcast updated user count to everyone
        io.to(roomId).emit('update-user-count', count);

        // Notify if they are host
        socket.emit('is-host', roomHosts[roomId] === socket.id);
    });

    // Chat system - anyone can chat
    socket.on('chat-message', ({ roomId, message }) => {
        socket.to(roomId).emit('chat-message', message);
    });

    // Security helper: Check if socket is host
    function isHost(socket, roomId) {
        return roomHosts[roomId] === socket.id;
    }

    // Video events - restricted to host only!
    socket.on('play', ({ roomId, time }) => {
        if (!isHost(socket, roomId)) return;
        socket.to(roomId).emit('play', time);
    });

    socket.on('pause', ({ roomId, time }) => {
        if (!isHost(socket, roomId)) return;
        socket.to(roomId).emit('pause', time);
    });

    socket.on('seek', ({ roomId, time }) => {
        if (!isHost(socket, roomId)) return;
        socket.to(roomId).emit('seek', time);
    });

    socket.on('change-video', ({ roomId, type, videoId }) => {
        if (!isHost(socket, roomId)) return;
        socket.to(roomId).emit('change-video', { type, videoId });
    });
    
    socket.on('start-countdown', (roomId) => {
        if (!isHost(socket, roomId)) return;
        io.to(roomId).emit('start-countdown');
    });
    
    // Auto-sync
    socket.on('sync', ({ roomId, time }) => {
        if (!isHost(socket, roomId)) return;
        socket.to(roomId).emit('sync', time);
    });

    // Disconnect handling
    socket.on('disconnect', () => {
        if (socket.roomId) {
            const room = io.sockets.adapter.rooms.get(socket.roomId);
            const count = room ? room.size : 0;
            io.to(socket.roomId).emit('update-user-count', count);
            
            // Reassign host if disconnected user was host
            if (roomHosts[socket.roomId] === socket.id) {
                if (count > 0) {
                    const nextHost = Array.from(room)[0];
                    roomHosts[socket.roomId] = nextHost;
                    io.to(nextHost).emit('is-host', true);
                } else {
                    delete roomHosts[socket.roomId];
                    delete roomPasswords[socket.roomId];
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
```

### 3. `public/index.html`
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Watch Together</title>
    <link rel="stylesheet" href="style.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
    <div class="container">
        <header>
            <h1>Watch Together</h1>
            <p>Sync your video playback and chat with friends in real-time.</p>
        </header>

        <div id="room-selection" class="room-selection card">
            <h2>Create or Join a Room</h2>
            <div class="input-group">
                <input type="text" id="room-id" placeholder="Room Code (e.g., movie-night)" />
            </div>
            <div class="input-group">
                <input type="password" id="room-password" placeholder="Room Password (Optional)" />
            </div>
            <button id="join-btn" class="primary-btn" style="width: 100%; margin-bottom: 15px;">Join Room</button>
            <p id="connection-status" class="status-msg"></p>
        </div>

        <div id="app-container" class="app-container hidden">
            <!-- Left Side: Video Player -->
            <div id="video-container" class="video-container card">
                <div class="room-info">
                    <span>Room: <strong id="current-room"></strong></span>
                    <span id="host-badge" class="host-badge hidden">HOST</span>
                    <span class="viewers-badge"><span id="user-count">1</span> User(s)</span>
                    <span class="sync-status text-success">Synced</span>
                </div>
                
                <div class="video-switcher">
                    <input type="text" id="youtube-url" placeholder="Paste YouTube Link here...">
                    <button id="load-yt-btn" class="secondary-btn">Load YouTube</button>
                    
                    <input type="file" id="local-file-picker" accept="video/*" class="secondary-btn" title="Choose a local video file">
                    <button id="start-together-btn" class="primary-btn hidden">Start Together</button>
                </div>

                <!-- Local Video Player -->
                <video id="video-player" controls preload="auto">
                    <source src="" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
                
                <!-- YouTube Video Player Container -->
                <div id="yt-player-container" class="hidden">
                    <div id="yt-overlay" class="hidden" title="Only the host can control playback."></div>
                    <div id="yt-player"></div>
                </div>

                <div class="instructions">
                    <p>Note: Each viewer must use the <strong>Choose Video File</strong> button to select their downloaded copy of the movie from their own computer.</p>
                </div>
                
                <!-- Countdown Overlay -->
                <div id="countdown-overlay" class="countdown-overlay hidden">3</div>
            </div>

            <!-- Right Side: Chat System -->
            <div id="chat-container" class="chat-container card">
                <h3>Live Chat</h3>
                <div id="chat-messages" class="chat-messages">
                    <div class="chat-msg system-msg">Welcome to the room!</div>
                </div>
                <div class="chat-input-group">
                    <input type="text" id="chat-input" placeholder="Type a message..." />
                    <button id="send-btn" class="primary-btn">Send</button>
                </div>
            </div>
        </div>
    </div>

    <!-- YouTube IFrame API -->
    <script src="https://www.youtube.com/iframe_api"></script>

    <!-- Socket.io client script -->
    <script src="/socket.io/socket.io.js"></script>
    <script src="script.js"></script>
</body>
</html>
```

### 4. `public/style.css`
```css
:root {
    --bg-color: #0d1117;
    --card-bg: #161b22;
    --text-primary: #e6edf3;
    --text-secondary: #8b949e;
    --accent-color: #58a6ff;
    --accent-hover: #3182ce;
    --border-color: #30363d;
    --success: #3fb950;
    --font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    background-color: var(--bg-color);
    color: var(--text-primary);
    font-family: var(--font-family);
    line-height: 1.6;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    min-height: 100vh;
    padding: 40px 20px;
}

.container {
    width: 100%;
    max-width: 1200px;
}

header {
    text-align: center;
    margin-bottom: 30px;
}

header h1 {
    font-size: 2.5rem;
    background: linear-gradient(90deg, #58a6ff, #a371f7);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 10px;
}

header p {
    color: var(--text-secondary);
    font-size: 1.1rem;
}

.card {
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 25px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    margin-bottom: 20px;
    transition: all 0.3s ease;
}

.room-selection {
    max-width: 500px;
    margin: 0 auto;
    text-align: center;
}

.room-selection h2 {
    margin-bottom: 20px;
    font-size: 1.5rem;
}

.input-group {
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
}

input[type="text"] {
    flex: 1;
    padding: 12px 16px;
    background: var(--bg-color);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    border-radius: 8px;
    font-size: 1rem;
    outline: none;
    transition: border-color 0.2s;
}

input[type="text"]:focus {
    border-color: var(--accent-color);
}

.primary-btn {
    background: var(--accent-color);
    color: #ffffff;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
}

.primary-btn:hover {
    background: var(--accent-hover);
}

.status-msg {
    color: var(--text-secondary);
    font-size: 0.9rem;
    min-height: 20px;
}
.status-error {
    color: #ff7b72;
    font-weight: 500;
}
input[type="password"] {
    flex: 1;
    padding: 12px 16px;
    background: var(--bg-color);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    border-radius: 8px;
    font-size: 1rem;
    outline: none;
    transition: border-color 0.2s;
}
input[type="password"]:focus {
    border-color: var(--accent-color);
}

.hidden {
    display: none !important;
}

/* App Container (Video + Chat layout) */
.app-container {
    display: flex;
    gap: 20px;
    align-items: stretch;
}

@media (max-width: 900px) {
    .app-container {
        flex-direction: column;
    }
}

@media (max-width: 600px) {
    header h1 { font-size: 2rem; }
    .video-switcher { flex-direction: column; gap: 8px; }
    .video-switcher > *, .primary-btn { width: 100%; box-sizing: border-box; }
    .chat-container { min-height: 350px; }
    body { padding: 15px 10px; }
    .countdown-overlay { font-size: 4rem; }
}

/* Video Section */
.video-container {
    flex: 2;
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.video-switcher {
    display: flex;
    gap: 10px;
    margin-bottom: 5px;
    flex-wrap: wrap;
}

.video-switcher input {
    flex: 1;
    min-width: 150px;
}

.secondary-btn, .video-switcher input[type="file"] {
    background: var(--bg-color);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
    outline: none;
}

.secondary-btn:hover, .video-switcher input[type="file"]:hover {
    border-color: var(--text-secondary);
    background: var(--card-bg);
}

.room-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 15px;
    background: rgba(88, 166, 255, 0.1);
    border-radius: 8px;
    font-size: 0.95rem;
}

.room-info strong {
    color: var(--accent-color);
}

.host-badge {
    background: rgba(88, 166, 255, 0.2);
    color: var(--accent-color);
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
}

.viewers-badge {
    background: rgba(163, 113, 247, 0.2);
    color: #a371f7;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
}

.text-success {
    color: var(--success);
    font-weight: 500;
}

video, #yt-player-container, .countdown-overlay {
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #000;
    border-radius: 8px;
    overflow: hidden;
    position: relative;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.countdown-overlay {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.85);
    color: white;
    font-size: 6rem;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
}

#yt-overlay {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    z-index: 10;
    cursor: not-allowed;
    background: transparent;
}

iframe {
    width: 100%;
    height: 100%;
    border: none;
}

.instructions {
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.85rem;
}

kbd {
    background: var(--border-color);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.8rem;
    font-family: monospace;
}

/* Chat Section */
.chat-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 400px;
    max-height: 600px;
}

.chat-container h3 {
    font-size: 1.2rem;
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border-color);
}

.chat-messages {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 15px;
    padding-right: 5px;
}

/* Custom Scrollbar */
.chat-messages::-webkit-scrollbar {
    width: 6px;
}
.chat-messages::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 3px;
}

.chat-msg {
    background: var(--bg-color);
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 0.95rem;
    align-self: flex-start;
    max-width: 90%;
    word-break: break-word;
}

.chat-msg.self {
    background: rgba(88, 166, 255, 0.15);
    border: 1px solid rgba(88, 166, 255, 0.3);
    align-self: flex-end;
}

.system-msg {
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.85rem;
    font-style: italic;
    align-self: center;
    padding: 4px;
}

.chat-input-group {
    display: flex;
    gap: 10px;
    margin-top: auto;
}

.chat-input-group input {
    margin-bottom: 0;
}
```

### 5. `public/script.js`
```javascript
const socket = io();

// UI Elements
const roomSelection = document.getElementById('room-selection');
const appContainer = document.getElementById('app-container');
const roomIdInput = document.getElementById('room-id');
const passwordInput = document.getElementById('room-password');
const joinBtn = document.getElementById('join-btn');
const connectionStatus = document.getElementById('connection-status');
const currentRoomDisplay = document.getElementById('current-room');
const userCountDisplay = document.getElementById('user-count');
const hostBadge = document.getElementById('host-badge');

const videoPlayer = document.getElementById('video-player');
const youtubeUrlInput = document.getElementById('youtube-url');
const loadYtBtn = document.getElementById('load-yt-btn');
const localFilePicker = document.getElementById('local-file-picker');
const startTogetherBtn = document.getElementById('start-together-btn');
const ytPlayerContainer = document.getElementById('yt-player-container');
const ytOverlay = document.getElementById('yt-overlay');
const countdownOverlay = document.getElementById('countdown-overlay');

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');

let currentRoom = '';
let isRemoteEvent = false;

let activePlayerType = 'local';
let ytPlayer;
let isYtReady = false;

let isHost = false;

// Initialize YouTube API
function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('yt-player', {
        height: '100%',
        width: '100%',
        videoId: '',
        playerVars: {
            'playsinline': 1,
            'rel': 0,
            'modestbranding': 1
        },
        events: {
            'onStateChange': onPlayerStateChange
        }
    });
    isYtReady = true;
}

function extractVideoID(url) {
    let videoId = null;
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    if (match && match[1]) {
        videoId = match[1];
    }
    return videoId;
}

function onPlayerStateChange(event) {
    if (activePlayerType !== 'youtube') return;
    if (event.data === YT.PlayerState.PLAYING) {
        if (!isRemoteEvent && isHost) socket.emit('play', { roomId: currentRoom, time: ytPlayer.getCurrentTime() });
        isRemoteEvent = false;
    } else if (event.data === YT.PlayerState.PAUSED) {
        if (!isRemoteEvent && isHost) socket.emit('pause', { roomId: currentRoom, time: ytPlayer.getCurrentTime() });
        isRemoteEvent = false;
    }
}

// Handle Local File Selection directly purely client side (bandwidth-free!)
localFilePicker.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const fileURL = URL.createObjectURL(file);
        switchVideo('local', null); // change to local player
        videoPlayer.src = fileURL;
        videoPlayer.load();
        
        // If host, notify room that we switched to local
        if (isHost) {
            socket.emit('change-video', { roomId: currentRoom, type: 'local', videoId: null });
        }
    }
});

// Join Room Logic
joinBtn.addEventListener('click', () => {
    const roomId = roomIdInput.value.trim();
    const password = passwordInput.value.trim();
    if (roomId) {
        socket.emit('join-room', { roomId, password });
        connectionStatus.textContent = 'Joining...';
        connectionStatus.classList.remove('status-error');
    } else {
        connectionStatus.textContent = 'Please enter a valid room code.';
        connectionStatus.classList.add('status-error');
    }
});

socket.on('join-success', (roomId) => {
    currentRoom = roomId;
    roomSelection.classList.add('hidden');
    appContainer.classList.remove('hidden');
    currentRoomDisplay.textContent = roomId;
    connectionStatus.textContent = '';
});

socket.on('join-error', (errorMsg) => {
    connectionStatus.textContent = errorMsg;
    connectionStatus.classList.add('status-error');
});

// Update User Count & Host Status
socket.on('update-user-count', (count) => {
    userCountDisplay.textContent = count;
});

socket.on('is-host', (status) => {
    isHost = status;
    if (isHost) {
        // UI
        hostBadge.classList.remove('hidden');
        youtubeUrlInput.disabled = false;
        loadYtBtn.disabled = false;
        startTogetherBtn.classList.remove('hidden');
        
        // Video Controls
        videoPlayer.setAttribute('controls', 'controls');
        ytOverlay.classList.add('hidden');
    } else {
        // UI
        hostBadge.classList.add('hidden');
        youtubeUrlInput.disabled = true;
        loadYtBtn.disabled = true;
        startTogetherBtn.classList.add('hidden');
        
        // Video Controls
        videoPlayer.removeAttribute('controls');
        ytOverlay.classList.remove('hidden');
    }
});

// Chat Logic
function addMessage(msg, isSelf = false) {
    const div = document.createElement('div');
    div.classList.add('chat-msg');
    if (isSelf) div.classList.add('self');
    div.textContent = msg;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const text = chatInput.value.trim();
    if (text) {
        addMessage(text, true);
        socket.emit('chat-message', { roomId: currentRoom, message: text });
        chatInput.value = '';
    }
}

socket.on('chat-message', (msg) => {
    addMessage(msg, false); // From someone else
});


// Switcher logic
loadYtBtn.addEventListener('click', () => {
    if (!isHost) return;
    const url = youtubeUrlInput.value.trim();
    if (!url) return;
    const videoId = extractVideoID(url);
    if (videoId) {
        switchVideo('youtube', videoId);
        socket.emit('change-video', { roomId: currentRoom, type: 'youtube', videoId });
        youtubeUrlInput.value = ''; 
    } else {
        alert("Invalid YouTube URL.");
    }
});

function switchVideo(type, videoId) {
    activePlayerType = type;
    if (type === 'youtube') {
        videoPlayer.pause();
        videoPlayer.classList.add('hidden');
        ytPlayerContainer.classList.remove('hidden');
        if (isYtReady && videoId) {
            ytPlayer.loadVideoById(videoId);
            ytPlayer.pauseVideo();
        }
    } else {
        if (isYtReady && ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
        ytPlayerContainer.classList.add('hidden');
        videoPlayer.classList.remove('hidden');
        
        videoPlayer.currentTime = 0;
        videoPlayer.pause();
    }
}

function getActiveTime() {
    if (activePlayerType === 'youtube' && isYtReady && ytPlayer.getCurrentTime) return ytPlayer.getCurrentTime() || 0;
    return videoPlayer.currentTime;
}
function setActiveTime(time) {
    if (activePlayerType === 'youtube' && isYtReady && ytPlayer.seekTo) ytPlayer.seekTo(time, true);
    else videoPlayer.currentTime = time;
}

// Countdown Logic
startTogetherBtn.addEventListener('click', () => {
    if (!isHost) return;
    
    // reset to 0 before starting
    if (activePlayerType === 'youtube' && isYtReady && ytPlayer.seekTo) {
        ytPlayer.seekTo(0, true);
    } else {
        videoPlayer.currentTime = 0;
    }
    
    socket.emit('start-countdown', currentRoom);
});

socket.on('start-countdown', () => {
    countdownOverlay.classList.remove('hidden');
    let count = 3;
    countdownOverlay.textContent = count;
    
    // Ensure paused initially
    if (activePlayerType === 'youtube' && isYtReady) ytPlayer.pauseVideo();
    else videoPlayer.pause();

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownOverlay.textContent = count;
        } else {
            clearInterval(interval);
            countdownOverlay.classList.add('hidden');
            
            // GO!
            isRemoteEvent = true;
            if (activePlayerType === 'youtube' && isYtReady) ytPlayer.playVideo();
            else videoPlayer.play().catch(e => console.log(e));
        }
    }, 1000);
});


// Socket Video Events
socket.on('change-video', (data) => {
    isRemoteEvent = true;
    switchVideo(data.type, data.videoId);
});

socket.on('play', (remoteTime) => {
    isRemoteEvent = true;
    if (Math.abs(getActiveTime() - remoteTime) > 0.5) setActiveTime(remoteTime);
    if (activePlayerType === 'youtube' && isYtReady) ytPlayer.playVideo();
    else videoPlayer.play().catch(e => console.log('Autoplay prevented', e));
});

socket.on('pause', (remoteTime) => {
    isRemoteEvent = true;
    setActiveTime(remoteTime);
    if (activePlayerType === 'youtube' && isYtReady) ytPlayer.pauseVideo();
    else videoPlayer.pause();
});

socket.on('seek', (remoteTime) => {
    isRemoteEvent = true;
    setActiveTime(remoteTime);
});

socket.on('sync', (remoteTime) => {
    isRemoteEvent = true;
    if (Math.abs(getActiveTime() - remoteTime) > 1.5) setActiveTime(remoteTime);
});


// Local Video Dispatch
videoPlayer.addEventListener('play', () => {
    if (isRemoteEvent) {
        isRemoteEvent = false;
        return;
    }
    if (!isHost) { videoPlayer.pause(); return; }
    if (activePlayerType === 'local') socket.emit('play', { roomId: currentRoom, time: videoPlayer.currentTime });
});
videoPlayer.addEventListener('pause', () => {
    if (isRemoteEvent) {
        isRemoteEvent = false;
        return;
    }
    if (!isHost) return;
    if (activePlayerType === 'local') socket.emit('pause', { roomId: currentRoom, time: videoPlayer.currentTime });
});
videoPlayer.addEventListener('seeked', () => {
    if (isRemoteEvent) {
        isRemoteEvent = false;
        return;
    }
    if (!isHost) return;
    if (activePlayerType === 'local') socket.emit('seek', { roomId: currentRoom, time: videoPlayer.currentTime });
});

// Periodic Sync - ONLY HOST SYNCS
setInterval(() => {
    if (!currentRoom || !isHost) return;
    let isPlaying = false;
    let currentTime = 0;
    if (activePlayerType === 'youtube' && isYtReady && ytPlayer.getPlayerState) {
        isPlaying = ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
        currentTime = ytPlayer.getCurrentTime() || 0;
    } else if (activePlayerType === 'local') {
        isPlaying = !videoPlayer.paused;
        currentTime = videoPlayer.currentTime;
    }
    if (isPlaying) socket.emit('sync', { roomId: currentRoom, time: currentTime });
}, 5000);
```
