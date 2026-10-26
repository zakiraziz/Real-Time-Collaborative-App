/**
 * Real-Time Collaborative App — Server
 * Stack: Node.js + Express + Socket.IO + SQLite
 */
require('dotenv').config();
const { randomInt } = require('crypto');
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
// Vite builds to <project-root>/dist (configured in client/vite.config.mjs)
if (process.env.NODE_ENV === 'production') {
  const clientDistPath = path.join(__dirname, 'dist');
  app.use(express.static(clientDistPath));
}
// Health check endpoint
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: Date.now() }));
if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// --- In-memory presence map: socketId -> { username, roomId, joinedAt } ---
const presence = new Map();
// --- Client state for catch-up: socketId -> { roomId, lastMessageId } ---
const clientState = new Map();
// --- Typing state: roomId -> Set<socketId> ---
const typingState = new Map();

const TYPING_TIMEOUT_MS = 3000;
const typingTimers = new Map();

function getTypists(roomId) {
  return Array.from(new Set(
    Array.from(typingState.get(roomId) || [])
      .map(socketId => presence.get(socketId)?.username)
      .filter(Boolean)
  ));
}

function broadcastPresence(roomId) {
  const users = Array.from(presence.values())
    .filter(u => u.roomId === roomId)
    .map(u => ({ socketId: u.socketId, username: u.username, joinedAt: u.joinedAt }));
  io.to(roomId).emit('presence', users);
  return users;
}

function removeTypist(roomId, socketId) {
  const typists = typingState.get(roomId);
  if (typists) {
    typists.delete(socketId);
    if (typists.size === 0) typingState.delete(roomId);
    io.to(roomId).emit('typing-update', getTypists(roomId));
  }
  const timerKey = `${roomId}:${socketId}`;
  if (typingTimers.has(timerKey)) {
    clearTimeout(typingTimers.get(timerKey));
    typingTimers.delete(timerKey);
  }
}

function validUsername(username) {
  return typeof username === 'string' && username.trim().length > 0 && username.trim().length <= 30;
}

function validRoomId(roomId) {
  return typeof roomId === 'string' && /^[A-Z0-9]{6}$/.test(roomId);
}

function joinRoom(socket, roomId, username, ack) {
  const cleanUsername = typeof username === 'string' ? username.trim() : '';
  if (!validRoomId(roomId) || !validUsername(cleanUsername)) {
    const result = { success: false, error: 'Enter a valid name and six-character room code.' };
    socket.emit('join-error', { message: result.error });
    if (typeof ack === 'function') ack(result);
    return;
  }
  if (!roomExists(roomId)) {
    const result = { success: false, error: 'That room could not be found. Check the code or create a new room.' };
    socket.emit('join-error', { message: result.error });
    if (typeof ack === 'function') ack(result);
    return;
  }

  const previous = presence.get(socket.id);
  if (previous && previous.roomId !== roomId) {
    socket.leave(previous.roomId);
    presence.delete(socket.id);
    deletePresence(socket.id);
    removeTypist(previous.roomId, socket.id);
    broadcastPresence(previous.roomId);
    socket.to(previous.roomId).emit('user-left', { username: previous.username });
  }

  const joinedAt = Date.now();
  socket.join(roomId);
  presence.set(socket.id, { socketId: socket.id, username: cleanUsername, roomId, joinedAt });
  setPresence(socket.id, cleanUsername, roomId);
  clientState.set(socket.id, { roomId, lastMessageId: 0 });

  const history = getMessages(roomId, 200);
  socket.emit('history', history);
  const users = broadcastPresence(roomId);
  socket.to(roomId).emit('user-joined', { username: cleanUsername, joinedAt });
  if (!typingState.has(roomId)) typingState.set(roomId, new Set());

  if (typeof ack === 'function') {
    ack({ success: true, roomId, history, users });
  }
}

function createRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let roomId;
  do {
    roomId = Array.from({ length: 6 }, () => chars[randomInt(chars.length)]).join('');
  } while (roomExists(roomId));
  return roomId;
}

function leaveRoom(socket, reason) {
  const info = presence.get(socket.id);
  if (!info) return;

  socket.leave(info.roomId);
  presence.delete(socket.id);
  deletePresence(socket.id);
  clientState.delete(socket.id);
  removeTypist(info.roomId, socket.id);
  broadcastPresence(info.roomId);
  socket.to(info.roomId).emit('user-left', { username: info.username, reason });
}

// --- Initialize database ---
initDB();

// --- Socket.IO connection handler ---
io.on('connection', (socket) => {
  console.log(`[SOCKET] User connected: ${socket.id}`);

  // --- JOIN EVENT ---
  socket.on('join', (payload = {}, ack) => {
    const { roomId, username } = payload || {};
    joinRoom(socket, roomId, username, ack);
  });

  socket.on('create-room', (payload = {}, ack) => {
    const { username } = payload || {};
    if (!validUsername(username)) {
      if (typeof ack === 'function') ack({ success: false, error: 'Your name must be between 1 and 30 characters.' });
      return;
    }

    const roomId = createRoomCode();
    createRoom(roomId, roomId, username.trim());
    joinRoom(socket, roomId, username, ack);
  });

  // --- LEAVE EVENT ---
  socket.on('leave', () => {
    leaveRoom(socket);
  });

  // --- MESSAGE EVENT ---
  socket.on('message', (payload, ack) => {
    const info = presence.get(socket.id);
    const { roomId, content, clientId, timestamp, version } = payload || {};
    if (!info || info.roomId !== roomId || !socket.rooms.has(roomId)) {
      if (ack) ack({ error: 'Join this room before sending a message.' });
      return;
    }
    if (typeof content !== 'string' || !content.trim() || content.trim().length > 2000) {
      if (ack) ack({ error: 'Messages must be between 1 and 2000 characters.' });
      return;
    }

    const saved = saveMessage({
      roomId, userId: socket.id, username: info.username, content: content.trim(),
      timestamp: Number.isSafeInteger(timestamp) ? timestamp : Date.now(),
      clientId: clientId || null,
      version: Number.isSafeInteger(version) && version > 0 ? version : 1
    });

    if (saved) {
      const state = clientState.get(socket.id);
      if (state && state.roomId === roomId) state.lastMessageId = saved.id;
      io.to(roomId).emit('message', saved);
      removeTypist(roomId, socket.id);
      if (ack) ack({ success: true, message: saved });
    } else {
      if (ack) ack({ success: true, duplicate: true });
    }
  });

  // --- TYPING EVENT ---
  socket.on('typing', (payload = {}) => {
    const { roomId } = payload || {};
    const info = presence.get(socket.id);
    if (!info || info.roomId !== roomId || !socket.rooms.has(roomId)) return;
    if (!typingState.has(roomId)) typingState.set(roomId, new Set());
    typingState.get(roomId).add(socket.id);
    socket.to(roomId).emit('typing-update', getTypists(roomId));
    const timerKey = `${roomId}:${socket.id}`;
    if (typingTimers.has(timerKey)) clearTimeout(typingTimers.get(timerKey));
    typingTimers.set(timerKey, setTimeout(() => removeTypist(roomId, socket.id), TYPING_TIMEOUT_MS));
  });

  // --- STOP TYPING EVENT ---
  socket.on('stop-typing', (payload = {}) => {
    const { roomId } = payload || {};
    const info = presence.get(socket.id);
    if (info && info.roomId === roomId) removeTypist(roomId, socket.id);
  });

  // --- CATCH-UP EVENT ---
  socket.on('catch-up', (payload = {}) => {
    const { roomId, lastMessageId } = payload || {};
    const info = presence.get(socket.id);
    if (!info || info.roomId !== roomId || !socket.rooms.has(roomId)) return;
    const missed = getMessagesSince(roomId, lastMessageId || 0, 100);
    socket.emit('history-catch-up', missed);
  });

  // --- DISCONNECT ---
  socket.on('disconnect', (reason) => {
    leaveRoom(socket, reason);
  });
});

// --- Graceful shutdown ---
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM received, shutting down...');
  dbClose();
  server.close(() => process.exit(0));
});

const { db } = require('./db');
function dbClose() {
  try { db.close(); } catch (e) { console.error('[SERVER] DB close error:', e.message); }
}

// --- Start server ---
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[SERVER] Listening on port ${PORT}`);
  console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
});