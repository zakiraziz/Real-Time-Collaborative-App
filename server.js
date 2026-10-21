/**
 * Real-Time Collaborative App — Server
 * Stack: Node.js + Express + Socket.IO + better-sqlite3
 */
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const {
  initDB,
  roomExists,
  createRoom,
  saveMessage,
  getMessages,
  getMessagesSince,
  setPresence,
  deletePresence,
} = require('./db');

const app = express();
const server = http.createServer(app);

// --- Socket.IO setup ---
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || "*", methods: ["GET", "POST"] }
});

// Serve static React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client', 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
  });
}

// --- In-memory presence map: socketId -> { username, roomId, joinedAt } ---
const presence = new Map();
// --- Client state for catch-up: socketId -> { roomId, lastMessageId } ---
const clientState = new Map();
// --- Typing state: roomId -> Set<username> ---
const typingState = new Map();

const TYPING_TIMEOUT_MS = 3000;
const typingTimers = new Map(); // roomId:username -> timeout

function getTypists(roomId) {
  return Array.from(typingState.get(roomId) || []);
}

function broadcastPresence(roomId) {
  const users = Array.from(presence.values())
    .filter(u => u.roomId === roomId)
    .map(u => ({ username: u.username, joinedAt: u.joinedAt }));
  io.to(roomId).emit('presence', users);
}

function removeTypist(roomId, username) {
  const typists = typingState.get(roomId);
  if (typists) {
    typists.delete(username);
    if (typists.size === 0) typingState.delete(roomId);
    io.to(roomId).emit('typing-update', getTypists(roomId));
  }
  const timerKey = `${roomId}:${username}`;
  if (typingTimers.has(timerKey)) {
    clearTimeout(typingTimers.get(timerKey));
    typingTimers.delete(timerKey);
  }
}

// --- Initialize database ---
initDB();

// --- Socket.IO connection handler ---
io.on('connection', (socket) => {
  console.log(`[SOCKET] User connected: ${socket.id}`);

  // --- JOIN EVENT ---
  socket.on('join', ({ roomId, username }) => {
    console.log(`[JOIN] ${username} joining room ${roomId}`);

    if (!roomExists(roomId)) {
      socket.emit('join-error', { message: 'Room does not exist.' });
      return;
    }

    socket.join(roomId);

    const joinedAt = Date.now();
    presence.set(socket.id, { username, roomId, joinedAt });
    setPresence(socket.id, username, roomId);
    clientState.set(socket.id, { roomId, lastMessageId: 0 });

    const history = getMessages(roomId, 200);
    socket.emit('history', history);
    broadcastPresence(roomId);
    socket.to(roomId).emit('user-joined', { username, joinedAt });

    if (!typingState.has(roomId)) typingState.set(roomId, new Set());
  });

  // --- LEAVE EVENT ---
  socket.on('leave', ({ roomId }) => {
    socket.leave(roomId);
    const info = presence.get(socket.id);
    if (info) {
      const leavingUsername = info.username;
      presence.delete(socket.id);
      deletePresence(socket.id);
      clientState.delete(socket.id);
      removeTypist(roomId, leavingUsername);
      broadcastPresence(roomId);
      socket.to(roomId).emit('user-left', { username: leavingUsername });
    }
  });