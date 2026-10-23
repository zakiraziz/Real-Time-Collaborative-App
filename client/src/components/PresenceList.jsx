/**
 * PresenceList — Sidebar showing who's currently online in the room.
 * Highlights the current user.
 */
export default function PresenceList({ users, currentUser }) {
  return (
    <div className="presence-sidebar">
      <div className="presence-header">
        <h3>👥 Online</h3>
        <span className="presence-count">
          {users.length} {users.length === 1 ? 'person' : 'people'}
        </span>
      </div>
      <div className="presence-list">
        {users.map((user) => (
          <div
            key={user.username}
            className={`presence-user ${user.username === currentUser ? 'presence-you' : ''}`}
          >
            <span className="presence-dot"></span>
            <span className="presence-username">
              {user.username} {user.username === currentUser && ' (you)'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}