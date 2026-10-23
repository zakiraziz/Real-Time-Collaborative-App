/**
 * TypingIndicator — Shows animated "typing..." bubble for users who are typing.
 * Displays up to 3 names, then "+ N more".
 */
export default function TypingIndicator({ users }) {
  if (!users || users.length === 0) return null;

  let text;
  if (users.length === 1) {
    text = `${users[0]} is typing`;
  } else if (users.length === 2) {
    text = `${users[0]} and ${users[1]} are typing`;
  } else if (users.length === 3) {
    text = `${users[0]}, ${users[1]} and ${users[2]} are typing`;
  } else {
    text = `${users[0]}, ${users[1]} and ${users.length - 2} more are typing`;
  }

  return (
    <div className="typing-container">
      <div className="typing-indicator fade-in">
        <span>{text}</span>
        <span className="typing-dots">
          <span className="typing-dot"></span>
          <span className="typing-dot"></span>
        </span>
      </div>
    </div>
  );
}