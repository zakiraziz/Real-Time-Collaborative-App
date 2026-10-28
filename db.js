/**
 * Database module using Node.js built-in node:sqlite (DatabaseSync).
 *
 * Node v22+ ships with an experimental SQLite binding — no native compilation
 * required, so no Visual Studio build tools needed.
 *
 * The interface is designed so that switching to PostgreSQL only requires
 * replacing this module (use the `pg` package) without touching server.js.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// Use a file-based DB so data persists across restarts.
// In production on Render/Fly, SQLite works on their mounted volumes.
const dbPath = process.env.DATABASE_URL || path.join(__dirname, 'database.sqlite');
const db = new DatabaseSync(dbPath);

// Ensure concurrent read/write safety (PRAGMA via exec, not pragma method)
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

/**
 * Initialize database schema.
 * Uses a simple schema that can be adapted for PostgreSQL:
 *   - rooms: stores room metadata
 *   - messages: stores chat messages (the "shared state")
 *   - users: ephemeral presence tracking (also tracked in-memory via Socket.IO)
 */
function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id            TEXT PRIMARY KEY,
      name          TEXT,
      created_by    TEXT,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id     TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      username    TEXT NOT NULL,
      content     TEXT NOT NULL,
      timestamp   INTEGER NOT NULL,              -- epoch ms for ordering
      client_id   TEXT,                         -- client-generated UUID for dedup
      version     INTEGER DEFAULT 1             -- logical clock for CRDT-lite
    );

    CREATE INDEX IF NOT EXISTS idx_messages_room_ts ON messages(room_id, timestamp, id);
    CREATE INDEX IF NOT EXISTS idx_messages_client  ON messages(client_id);

    CREATE TABLE IF NOT EXISTS users (
      socket_id  TEXT PRIMARY KEY,
      username   TEXT NOT NULL,
      room_id    TEXT NOT NULL,
      joined_at  INTEGER NOT NULL
    );
  `);
}

// Create tables immediately so prepared statements don't fail at prepare-time.
// node:sqlite validates SQL against the schema during prepare().
initDB();

// --- Room operations ---

const getRoomStmt = db.prepare('SELECT * FROM rooms WHERE id = ?');
const createRoomStmt = db.prepare('INSERT OR IGNORE INTO rooms (id, name, created_by, created_at) VALUES (?, ?, ?, ?)');

function roomExists(roomId) {
  return getRoomStmt.get(roomId) !== undefined;
}

function createRoom(roomId, name, createdBy) {
  const existing = getRoomStmt.get(roomId);
  if (!existing) {
    createRoomStmt.run(roomId, name || roomId, createdBy || 'anonymous', Date.now());
  }
  return getRoomStmt.get(roomId);
}

// --- Message operations ---

const insertMessageStmt = db.prepare(`
  INSERT INTO messages (room_id, user_id, username, content, timestamp, client_id, version)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const getMessagesStmt = db.prepare(`
  SELECT id, room_id, user_id, username, content, timestamp, client_id, version
  FROM messages
  WHERE room_id = ?
  ORDER BY timestamp ASC, id ASC
  LIMIT ?
`);

const getMessagesSinceStmt = db.prepare(`
  SELECT id, room_id, user_id, username, content, timestamp, client_id, version
  FROM messages
  WHERE room_id = ? AND id > ?
  ORDER BY id ASC
  LIMIT ?
`);

const dedupMessageStmt = db.prepare('SELECT id FROM messages WHERE client_id = ? LIMIT 1');

/**
 * Insert a message if not already present (dedup by client_id).
 * Returns the message object with the server-assigned id, or null if dup.
 */
function saveMessage({ roomId, userId, username, content, timestamp, clientId, version }) {
  // Dedup: if this client_id already exists, skip
  const existing = dedupMessageStmt.get(clientId);
  if (existing) return null;

  const info = insertMessageStmt.run(
    roomId, userId, username, content, timestamp, clientId, version
  );

  return {
    id: info.lastInsertRowid,
    room_id: roomId,
    user_id: userId,
    username,
    content,
    timestamp,
    client_id: clientId,
    version
  };
}

function getMessages(roomId, limit = 100) {
  return getMessagesStmt.all(roomId, limit);
}

function getMessagesSince(roomId, lastId, limit = 100) {
  if (lastId === undefined || lastId === null) {
    return getMessages(roomId, limit);
  }
  return getMessagesSinceStmt.all(roomId, lastId, limit);
}

// --- User/presence operations (optional persistence) ---

const upsertPresenceStmt = db.prepare(`
  INSERT OR REPLACE INTO users (socket_id, username, room_id, joined_at)
  VALUES (?, ?, ?, ?)
`);

const deletePresenceStmt = db.prepare('DELETE FROM users WHERE socket_id = ?');

const presenceInRoomStmt = db.prepare('SELECT username, room_id FROM users WHERE room_id = ?');

function setPresence(socketId, username, roomId) {
  upsertPresenceStmt.run(socketId, username, roomId, Date.now());
}

function deletePresence(socketId) {
  deletePresenceStmt.run(socketId);
}

function getPresence(roomId) {
  return presenceInRoomStmt.all(roomId);
}

module.exports = {
  db,
  initDB,
  roomExists,
  createRoom,
  saveMessage,
  getMessages,
  getMessagesSince,
  setPresence,
  deletePresence,
  getPresence
};