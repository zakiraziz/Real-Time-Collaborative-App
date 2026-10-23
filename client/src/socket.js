import { io } from 'socket.io-client';

/**
 * Socket.IO client singleton.
 * 
 * The server URL is determined by:
 * - VITE_SERVER_URL env var (set during build for production)
 * - Defaults to the same origin (window.location) in production
 * - Falls back to localhost:3001 for development (proxied via Vite)
 */
const getServerUrl = () => {
  // In production, the server and client are on the same origin
  if (import.meta.env.PROD) {
    return undefined; // Let socket.io use the current origin
  }
  // In development, use the Vite proxy
  return import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
};

export const socket = io(getServerUrl(), {
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
  transports: ['websocket', 'polling'],
});

export default socket;