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
export default function Room({ username, roomId, initialHistory = [], initialUsers = [], onLeave, connectionStatus }) {
  const [messages, setMessages] = useState(initialHistory);
  const [onlineUsers, setOnlineUsers] = useState(initialUsers);
  const [typingUsers, setTypingUsers] = useState([]);
  const [lastMessageId, setLastMessageId] = useState(
    initialHistory.length ? Math.max(...initialHistory.map((message) => message.id)) : 0
  );
  const [joinError, setJoinError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const typingDebounceRef = useRef(null);

  // --- Socket.IO event listeners ---
  useEffect(() => {
    const handleHistory = (history) => {
      setMessages(history || []);
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
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    };
  }, [username]);

  useEffect(() => {
    if (messages.length > 0) {
      setLastMessageId(Math.max(...messages.map((message) => message.id)));
    }
  }, [messages]);

  // --- Reconnection: request catch-up after re-joining (App.jsx re-emits 'join') ---
  const wasConnectedRef = useRef(false);
  useEffect(() => {
    const handleConnect = () => {
      if (wasConnectedRef.current && lastMessageId > 0) {
        // We were previously connected — request any missed messages
        socket.emit('catch-up', { roomId, lastMessageId });
      }
      wasConnectedRef.current = true;
    };
    const handleDisconnect = () => { wasConnectedRef.current = false; };
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    return () => { socket.off('connect', handleConnect); socket.off('disconnect', handleDisconnect); };
  }, [roomId, lastMessageId]);

  // --- Handle actions from MessageInput ---
  const handleInputAction = useCallback((action, done) => {
    switch (action.type) {
      case 'send':
        socket.timeout(5000).emit('message', action.payload, (timeoutError, ack) => {
          if (timeoutError) {
            done('Message was not delivered. Please try again.');
          } else if (ack?.error) {
            done(ack.error);
          } else {
            done();
          }
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

  const handleLeave = () => onLeave();

  const handleCopyLink = async () => {
    const url = `${window.location.origin}?room=${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus('Link copied!');
    } catch (error) {
      console.error('[CLIPBOARD] Could not copy room link:', error);
      setCopyStatus('Copy failed. Share this code: ' + roomId);
    }
    window.setTimeout(() => setCopyStatus(''), 3000);
  };

  return (
    <div className="room-view">
      <PresenceList users={onlineUsers} currentUser={username} />
      <div className="chat-container">
        <div className="room-header">
          <div className="room-title">
            <span aria-hidden="true">💬</span>
            <span>Room</span>
            <code className="room-code">{roomId}</code>
          </div>
          <div className="room-actions-header">
            <div className={`connection-status status-${connectionStatus}`}>
              <span className="connection-dot"></span>
              <span>{connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Reconnecting…' : 'Offline'}</span>
            </div>
            <button type="button" onClick={handleCopyLink} className="copy-btn" title="Copy room link">
              {copyStatus || 'Share invite link'}
            </button>
            <button type="button" onClick={handleLeave} className="copy-btn leave-btn">Leave room</button>
          </div>
        </div>

        <MessageList messages={messages} currentUser={username} />
        <TypingIndicator users={typingUsers} />

        {joinError && (
          <div className="room-error" role="alert">
            <span>{joinError}</span>
            <button type="button" onClick={handleLeave}>Back to start</button>
          </div>
        )}

        <MessageInput roomId={roomId} username={username} onSendMessage={handleInputAction} disabled={connectionStatus !== 'connected'} />
      </div>
    </div>
  );
}