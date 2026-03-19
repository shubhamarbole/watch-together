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

    // Video events - anyone can control now!
    socket.on('play', ({ roomId, time }) => {
        socket.to(roomId).emit('play', time);
    });

    socket.on('pause', ({ roomId, time }) => {
        socket.to(roomId).emit('pause', time);
    });

    socket.on('seek', ({ roomId, time }) => {
        socket.to(roomId).emit('seek', time);
    });

    socket.on('change-video', ({ roomId, type, videoId }) => {
        socket.to(roomId).emit('change-video', { type, videoId });
    });
    
    socket.on('start-countdown', (roomId) => {
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
