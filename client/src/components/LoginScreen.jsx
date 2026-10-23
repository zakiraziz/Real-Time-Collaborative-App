import { useState, useCallback } from 'react';

/**
 * LoginScreen — Entry point for new sessions.
 * Users enter a username, then either create a new room or join an existing one.
 * Room codes are 6-character alphanumeric strings.
 */
export default function LoginScreen({ onJoin }) {
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [step, setStep] = useState('enter-name'); // 'enter-name' | 'choose-action' | 'join-room'
  const [error, setError] = useState('');

  const generateRoomCode = useCallback(() => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }, []);

  const handleCreateRoom = () => {
    if (!username.trim()) {
      setError('Please enter a username first.');
      return;
    }
    const code = generateRoomCode();
    onJoin({ username: username.trim(), roomId: code });
  };

  const handleJoinRoom = () => {
    if (!username.trim()) {
      setError('Please enter a username first.');
      return;
    }
    if (!roomCode.trim()) {
      setError('Please enter a room code.');
      return;
    }
    onJoin({ username: username.trim(), roomId: roomCode.trim().toUpperCase() });
  };

  const handleNext = () => {
    if (!username.trim()) {
      setError('Please enter a username.');
      return;
    }
    setError('');
    setStep('choose-action');
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>✦ Real-Time Collab</h1>
        <p className="subtitle">Chat with friends in real time</p>

        {step === 'enter-name' && (
          <>
            <div className="form-group">
              <label htmlFor="username">Your Name</label>
              <input
                id="username"
                type="text"
                placeholder="Enter your name..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                maxLength={30}
              />
            </div>

            {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>}

            <button className="btn btn-primary" onClick={handleNext}>
              Continue
            </button>
          </>
        )}

        {step === 'choose-action' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Welcome, <strong>{username}</strong>!
              </p>
            </div>

            {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>}

            <button className="btn btn-primary" onClick={handleCreateRoom}>
              🚀 Create New Room
            </button>

            <div className="room-actions">
              <button className="btn btn-secondary" onClick={() => setStep('join-room')}>
                🔗 Join with Code
              </button>
              <button className="btn btn-secondary" onClick={() => setStep('enter-name')}>
                Change Name
              </button>
            </div>
          </>
        )}

        {step === 'join-room' && (
          <>
            <div className="form-group">
              <label htmlFor="room-code">Room Code</label>
              <input
                id="room-code"
                type="text"
                placeholder="Enter room code..."
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                maxLength={6}
              />
            </div>

            {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>}

            <button className="btn btn-primary" onClick={handleJoinRoom}>
              Join Room
            </button>

            <div className="room-actions">
              <button className="btn btn-secondary" onClick={() => setStep('choose-action')}>
                ← Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}