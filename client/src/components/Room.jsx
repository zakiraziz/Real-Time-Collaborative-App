import { useState, useEffect, useRef, useCallback } from 'react';
import socket from '../socket';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import PresenceList from './PresenceList';
import TypingIndicator from './TypingIndicator';

/**
 * Room — Main chat room view.
 * Subscribes to Socket.IO events for:
 *   - history / history-catch-up: message persistence & reconnect catch-up
 *   - message: real-time message broadcast
 *   - presence: live online user list
 *   - typing-update: typing indicators from other users
 *
 * Emits: join, leave, message, typing, stop-typing, catch-up
 */
export default function Room({ username, roomId, onLeave, connectionStatus }) {
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [lastMessageId, setLastMessageId] = useState(0);
  const [joinError, setJoinError] = useState('');
  const typingDebounceRef = useRef(null);
  const reconnectAttemptedRef = useRef(false);

  // --- Socket.IO event listeners ---
  useEffect(() => {
    const handleHistory = (history) => {
      setMessages(history || []);
      if (history && history.length > 0) {
        setLastMessageId(history[history.length - 1].id);
      }
    };

    const handleHistoryCatchUp = (missed) => {
      if (!missed || missed.length === 0) return;
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newMessages = missed.filter((m) => !existingIds.has(m.id));
        const merged = [...prev, ...newMessages].sort((a, b) => {
          if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
          return a.id - b.id;
        });
        setLastMessageId(Math.max(...merged.map((m) => m.id)));
        return merged;
      });
    };

    const handleNewMessage = (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        const updated = [...prev, msg].sort((a, b) => {
          if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
          return a.id - b.id;
        });
        setLastMessageId(Math.max(...updated.map((m) => m.id)));
        return updated;
      });
    };

    const handlePresence = (users) => setOnlineUsers(users || []);
    const handleTypingUpdate = (typists) => setTypingUsers((typists || []).filter((t) => t !== username));
    const handleUserJoined = ({ username: joinedUser }) => console.log('[SOCKET] User joined:', joinedUser);
    const handleUserLeft = ({ username: leftUser }) => console.log('[SOCKET] User left:', leftUser);
    const handleJoinError = ({ message }) => setJoinError(message || 'Failed to join room.');

    socket.on('history', handleHistory);
    socket.on('history-catch-up', handleHistoryCatchUp);
    socket.on('message', handleNewMessage);
    socket.on('presence', handlePresence);
    socket.on('typing-update', handleTypingUpdate);
    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    socket.on('join-error', handleJoinError);

    return () => {
      socket.off('history', handleHistory);
      socket.off('history-catch-up', handleHistoryCatchUp);
      socket.off('message', handleNewMessage);
      socket.off('presence', handlePresence);
      socket.off('typing-update', handleTypingUpdate);
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
      socket.off('join-error', handleJoinError);
    };
  }, [username]);

  // --- Re-emit join on socket reconnection ---
  useEffect(() => {
    const handleConnect = () => {
      if (connectionStatus === 'connected' && !reconnectAttemptedRef.current) {
        socket.emit('join', { roomId, username });
        if (lastMessageId > 0) {
          socket.emit('catch-up', { roomId, lastMessageId });
        }
        reconnectAttemptedRef.current = true;
        setTimeout(() => { reconnectAttemptedRef.current = false; }, 1000);
      }
    };
    const handleDisconnect = () => { reconnectAttemptedRef.current = false; };
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    return () => { socket.off('connect', handleConnect); socket.off('disconnect', handleDisconnect); };
  }, [roomId, username, connectionStatus, lastMessageId]);

  // --- Handle actions from MessageInput ---
  const handleInputAction = useCallback((action) => {
    switch (action.type) {
      case 'send':
        socket.emit('message', action.payload, (ack) => {
          if (ack?.error) console.error('[SOCKET] Message error:', ack.error);
        });
        break;
      case 'typing':
        if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
        typingDebounceRef.current = setTimeout(() => {
          socket.emit('typing', { roomId, username });
        }, 300);
        break;
      case 'stop-typing':
        if (typingDebounceRef.current) {
          clearTimeout(typingDebounceRef.current);
          typingDebounceRef.current = null;
        }
        socket.emit('stop-typing', { roomId, username });
        break;
      default:
        break;
    }
  }, [roomId, username]);

  const handleLeave = () => { socket.emit('leave', { roomId, username }); onLeave(); };

  const handleCopyLink = () => {
    const url = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(url);
    alert('Room link copied to clipboard!');
  };

  return (
    <div className="room-view">
      <PresenceList users={onlineUsers} currentUser={username} />
      <div className="chat-container">
        <div className="room-header">
          <div className="room-title">
            <span>💬</span>
            <span>Room: </span>
            <code className="room-code">{roomId}</code>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className={`connection-status status-${connectionStatus}`}>
              <span className="connection-dot"></span>
              <span style={{ textTransform: 'capitalize' }}>{connectionStatus}</span>
            </div>
            <button onClick={handleCopyLink} className="copy-btn" title="Copy room link">📋 Share</button>
            <button onClick={handleLeave} className="copy-btn" title="Leave room" style={{ color: 'var(--danger)' }}>← Leave</button>
          </div>
        </div>

        <MessageList messages={messages} currentUser={username} />
        <TypingIndicator users={typingUsers} />

        {joinError && (
          <div style={{ padding: '0.75rem 1.5rem', background: 'rgba(255, 107, 107, 0.15)', color: 'var(--danger)', fontSize: '0.85rem', textAlign: 'center' }}>{joinError}</div>
        )}

        <MessageInput roomId={roomId} username={username} onSendMessage={handleInputAction} />
      </div>
    </div>
  );
}