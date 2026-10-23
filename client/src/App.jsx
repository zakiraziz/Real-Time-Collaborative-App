import { useState, useEffect, useRef, useCallback } from 'react';
import socket from './socket';
import LoginScreen from './components/LoginScreen';
import Room from './components/Room';

/**
 * App.jsx — Root component
 * Manages session state (username, roomId) and Socket.IO lifecycle.
 * 
 * On initial load, checks localStorage for a saved session.
 * On socket reconnect, re-emits 'join' automatically.
 */
export default function App() {
  const [session, setSession] = useState(() => {
    // Restore session from localStorage on initial load
    const saved = localStorage.getItem('collab-session');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        localStorage.removeItem('collab-session');
      }
    }
    return null;
  });
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const socketRef = useRef(socket);

  // Persist session to localStorage
  useEffect(() => {
    if (session) {
      localStorage.setItem('collab-session', JSON.stringify(session));
    } else {
      localStorage.removeItem('collab-session');
    }
  }, [session]);

  // --- Socket.IO connection status monitoring ---
  useEffect(() => {
    const s = socketRef.current;

    const onConnect = () => {
      console.log('[SOCKET] Connected');
      setConnectionStatus('connected');

      // If we have a session, re-join the room on reconnect
      if (session) {
        console.log('[SOCKET] Re-joining room on reconnect:', session.roomId);
        s.emit('join', { roomId: session.roomId, username: session.username });
      }
    };

    const onDisconnect = (reason) => {
      console.log('[SOCKET] Disconnected:', reason);
      setConnectionStatus('disconnected');
    };

    const onConnectError = (err) => {
      console.error('[SOCKET] Connection error:', err.message);
      setConnectionStatus('error');
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onConnectError);
    };
  }, [session]);

  // --- Handle join ---
  const handleJoin = useCallback(({ username, roomId }) => {
    setSession({ username, roomId });
    setConnectionStatus('connecting');
    socketRef.current.emit('join', { roomId, username });
  }, []);

  // --- Handle leave ---
  const handleLeave = useCallback(() => {
    if (session) {
      socketRef.current.emit('leave', { roomId: session.roomId });
    }
    setSession(null);
    setConnectionStatus('disconnected');
  }, [session]);

  return (
    <div className="app">
      {session ? (
        <Room
          username={session.username}
          roomId={session.roomId}
          onLeave={handleLeave}
          connectionStatus={connectionStatus}
        />
      ) : (
        <LoginScreen onJoin={handleJoin} />
      )}
    </div>
  );
}