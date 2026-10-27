import { useState, useRef, useEffect } from 'react';

/**
 * MessageInput — Text input with emoji support and send button.
 * Emits 'typing' while the user is composing, and 'stop-typing' when done.
 * Uses crypto.randomUUID() to generate a client_id for dedup (CRDT-lite).
 */
export default function MessageInput({ roomId, username, onSendMessage, disabled = false }) {
  const [message, setMessage] = useState('');
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const inputRef = useRef(null);
  const emojis = ['😊', '😂', '❤️', '👍', '🎉', '👋'];

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
    setSendError('');

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
    if (!trimmed || sending || disabled) return;

    // Generate a client UUID for deduplication (CRDT-lite)
    const clientId = crypto.randomUUID();
    const timestamp = Date.now();

    setSending(true);
    setSendError('');
    onSendMessage(
      {
        type: 'send',
        payload: {
          roomId,
          username,
          content: trimmed,
          timestamp,
          clientId,
          version: 1,
        },
      },
      (error) => {
        setSending(false);
        if (error) {
          setSendError(error);
          return;
        }
        setMessage('');
        onSendMessage({ type: 'stop-typing' });
      }
    );
  };

  const addEmoji = (emoji) => {
    const updatedMessage = `${message}${emoji}`;
    setMessage(updatedMessage);
    emitTyping(updatedMessage);
    setEmojiPickerOpen(false);
    inputRef.current?.focus();
  };

  return (
    <form className="message-input-container" onSubmit={handleSubmit}>
      <div className="emoji-picker">
        <button
          type="button"
          className="emoji-toggle"
          aria-label={emojiPickerOpen ? 'Close emoji picker' : 'Add emoji'}
          aria-expanded={emojiPickerOpen}
          disabled={disabled}
          onClick={() => setEmojiPickerOpen((open) => !open)}
        >
          ☺
        </button>
        {emojiPickerOpen && (
          <div className="emoji-menu" role="group" aria-label="Choose an emoji">
            {emojis.map((emoji) => (
              <button
                type="button"
                key={emoji}
                className="emoji-option"
                aria-label={`Add ${emoji}`}
                onClick={() => addEmoji(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
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
        disabled={disabled}
        aria-label="Write a message"
        aria-describedby={sendError ? 'message-send-error' : undefined}
      />
      <button
        type="submit"
        className="send-btn"
        disabled={!message.trim() || disabled || sending}
        title="Send message"
      >
        {sending ? '…' : message.trim() ? '→' : '⭕'}
      </button>
      {sendError && <span id="message-send-error" className="send-error" role="alert">{sendError}</span>}
    </form>
  );
}