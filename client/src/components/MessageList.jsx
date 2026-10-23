import { useEffect, useRef } from 'react';

/**
 * MessageList — Displays chat messages with sender info and timestamps.
 * Auto-scrolls to the bottom, but preserves scroll position when the user
 * has scrolled up (to avoid auto-jumping while reading history).
 */
export default function MessageList({ messages, currentUser }) {
  const listRef = useRef(null);
  const isAtBottomRef = useRef(true);

  // Auto-scroll to bottom when new messages arrive, if user is at the bottom
  useEffect(() => {
    if (listRef.current && isAtBottomRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleScroll = () => {
    if (listRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = listRef.current;
      isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="message-list" ref={listRef} onScroll={handleScroll}>
      {messages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          <p>No messages yet. Start the conversation! 💬</p>
        </div>
      ) : (
        messages.map((msg) => (
          <div
            key={msg.id}
            className={`message-bubble ${msg.username === currentUser ? 'mine' : 'their'} fade-in`}
          >
            <span className="sender">
              {msg.username === currentUser ? 'You' : msg.username}
            </span>
            <div>{msg.content}</div>
            <div className="time">{formatTime(msg.timestamp)}</div>
          </div>
        ))
      )}
    </div>
  );
}