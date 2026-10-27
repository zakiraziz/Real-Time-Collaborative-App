import { useEffect, useRef, useState } from 'react';

/**
 * MessageList — Displays chat messages with sender info and timestamps.
 * Auto-scrolls to the bottom, but preserves scroll position when the user
 * has scrolled up (to avoid auto-jumping while reading history).
 */
export default function MessageList({ messages, currentUser, emptyMessage, onCopyMessage }) {
  const listRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const previousCountRef = useRef(messages.length);

  useEffect(() => {
    const newMessageCount = Math.max(0, messages.length - previousCountRef.current);
    previousCountRef.current = messages.length;

    if (isAtBottomRef.current) {
      scrollToBottom();
    } else if (newMessageCount > 0) {
      setUnreadCount((count) => count + newMessageCount);
    }
  }, [messages]);

  const scrollToBottom = () => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    isAtBottomRef.current = true;
    setUnreadCount(0);
  };

  const handleScroll = () => {
    if (listRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = listRef.current;
      isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
      if (isAtBottomRef.current) setUnreadCount(0);
    }
  };

  const formatDay = (timestamp) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  };

  return (
    <div className="message-list-wrap">
      <div className="message-list" ref={listRef} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            <p>{emptyMessage || 'No messages yet. Start the conversation! 💬'}</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const previousMessage = messages[index - 1];
            const isNewDay =
              !previousMessage ||
              new Date(previousMessage.timestamp).toDateString() !==
                new Date(msg.timestamp).toDateString();

            return (
              <div className="message-group" key={msg.id}>
                {isNewDay && <div className="date-divider"><span>{formatDay(msg.timestamp)}</span></div>}
                <div className={`message-bubble ${msg.username === currentUser ? 'mine' : 'their'} fade-in`}>
                  <div className="message-content">
                    <span className="sender">{msg.username === currentUser ? 'You' : msg.username}</span>
                    <div className="message-text">{msg.content}</div>
                    <div className="time" title={new Date(msg.timestamp).toLocaleString()}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="message-copy"
                    aria-label={`Copy message from ${msg.username}`}
                    title="Copy message"
                    onClick={() => onCopyMessage(msg.content)}
                  >
                    Copy
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      {unreadCount > 0 && (
        <button type="button" className="new-messages-button" onClick={scrollToBottom}>
          {unreadCount} new {unreadCount === 1 ? 'message' : 'messages'} ↓
        </button>
      )}
    </div>
  );
}