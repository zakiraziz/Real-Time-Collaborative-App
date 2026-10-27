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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('collab-theme') || 'dark');
  const [notice, setNotice] = useState('');
  const typingDebounceRef = useRef(null);
  const noticeTimerRef = useRef(null);
  const searchInputRef = useRef(null);

  const showNotice = useCallback((message) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(''), 2600);
  }, []);

  useEffect(() => {
    localStorage.setItem('collab-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

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
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
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
      showNotice('Invite link copied to clipboard');
    } catch (error) {
      console.error('[CLIPBOARD] Could not copy room link:', error);
      showNotice(`Copy failed — share room code ${roomId}`);
    }
  };

  const handleCopyMessage = async (content) => {
    try {
      await navigator.clipboard.writeText(content);
      showNotice('Message copied');
    } catch (error) {
      console.error('[CLIPBOARD] Could not copy message:', error);
      showNotice('Could not copy this message');
    }
  };

  const handleExport = () => {
    const transcript = messages
      .map((message) => {
        const time = new Date(message.timestamp).toLocaleString();
        return `[${time}] ${message.username}: ${message.content}`;
      })
      .join('\n');
    const file = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `chat-${roomId}.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    showNotice('Chat transcript downloaded');
  };

  const filteredMessages = searchQuery.trim()
    ? messages.filter((message) =>
        `${message.username} ${message.content}`
          .toLowerCase()
          .includes(searchQuery.trim().toLowerCase())
      )
    : messages;

  return (
    <div className={`room-view theme-${theme}`}>
      <PresenceList users={onlineUsers} currentUser={username} />
      <div className="chat-container">
        <div className="room-header">
          <div className="room-title">
            <span className="brand-mark" aria-hidden="true">✦</span>
            <div className="room-title-copy">
              <strong>CollabSpace</strong>
              <span>Room <code className="room-code">{roomId}</code></span>
            </div>
          </div>
          <div className="room-actions-header">
            <div className={`connection-status status-${connectionStatus}`} role="status" aria-live="polite">
              <span className="connection-dot"></span>
              <span>{connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Reconnecting…' : 'Offline'}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchOpen((open) => !open);
                setSearchQuery('');
              }}
              className="copy-btn"
              aria-expanded={searchOpen}
            >
              {searchOpen ? 'Close search' : 'Search'}
            </button>
            <button
              type="button"
              onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
              className="copy-btn"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="copy-btn"
              disabled={messages.length === 0}
              title={messages.length ? 'Download chat transcript' : 'Send a message before downloading a transcript'}
            >
              Download chat
            </button>
            <button type="button" onClick={handleCopyLink} className="copy-btn" title="Copy room link">
              Share invite
            </button>
            <button type="button" onClick={handleLeave} className="copy-btn leave-btn">Leave room</button>
          </div>
        </div>

        <div className="conversation-toolbar">
          <div>
            <strong>Conversation</strong>
            <span>{messages.length} {messages.length === 1 ? 'message' : 'messages'} · {onlineUsers.length} online</span>
          </div>
          <span className="privacy-label"><span aria-hidden="true">●</span> Room members only</span>
        </div>

        {searchOpen && (
          <div className="message-search">
            <label htmlFor="message-search-input">Search this conversation</label>
            <input
              ref={searchInputRef}
              id="message-search-input"
              type="search"
              placeholder="Search messages or names"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              autoFocus
            />
            {searchQuery && (
              <span className="search-count">
                {filteredMessages.length} {filteredMessages.length === 1 ? 'match' : 'matches'}
              </span>
            )}
          </div>
        )}
        <MessageList
          messages={filteredMessages}
          currentUser={username}
          emptyMessage={searchQuery ? 'No messages match your search.' : undefined}
          onCopyMessage={handleCopyMessage}
        />
        <TypingIndicator users={typingUsers} />
        {notice && <div className="toast-notice" role="status" aria-live="polite">{notice}</div>}

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