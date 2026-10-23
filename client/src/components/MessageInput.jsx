import { useState, useRef, useEffect } from 'react';

/**
 * MessageInput — Text input with emoji support and send button.
 * Emits 'typing' while the user is composing, and 'stop-typing' when done.
 * Uses crypto.randomUUID() to generate a client_id for dedup (CRDT-lite).
 */
export default function MessageInput({ roomId, username, onSendMessage }) {
  const [message, setMessage] = useState('');
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Auto-focus the input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const emitTyping = (content) => {
    onSendMessage({
      type: 'typing',
      content: content.trim(),
    });
  };

  const handleChange = (e) => {
    const value = e.target.value;
    setMessage(value);

    // Emit typing events while composing
    if (value.trim().length > 0) {
      emitTyping(value);
    } else {
      // Stop typing when input is cleared
      onSendMessage({ type: 'stop-typing' });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;

    // Generate a client UUID for deduplication (CRDT-lite)
    const clientId = crypto.randomUUID();
    const timestamp = Date.now();

    onSendMessage({
      type: 'send',
      payload: {
        roomId,
        username,
        content: trimmed,
        timestamp,
        clientId,
        version: 1,
      },
    });

    setMessage('');
    onSendMessage({ type: 'stop-typing' });
  };

  return (
    <form className="message-input-container" onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        className="message-input"
        type="text"
        placeholder="Type a message..."
        value={message}
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
        maxLength={2000}
      />
      <button
        type="submit"
        className="send-btn"
        disabled={!message.trim()}
        title="Send message"
      >
        {message.trim() ? '→' : '⭕'}
      </button>
    </form>
  );
}