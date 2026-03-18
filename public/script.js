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
