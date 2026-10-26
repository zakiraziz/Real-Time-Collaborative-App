import { useState } from 'react';

/**
 * LoginScreen — Entry point for new sessions.
 * Users enter a username, then either create a new room or join an existing one.
 * Room codes are 6-character alphanumeric strings.
 */
export default function LoginScreen({ onJoin, notice = '' }) {
  const [username, setUsername] = useState('');
  const sharedRoomCode = new URLSearchParams(window.location.search).get('room') || '';
  const [roomCode, setRoomCode] = useState(sharedRoomCode.toUpperCase());
  const [step, setStep] = useState('enter-name');
  const [error, setError] = useState(notice);
  const [busy, setBusy] = useState(false);

  const submitJoin = (createRoom) => {
    if (!username.trim()) {
      setError('Please enter your name first.');
      setStep('enter-name');
      return;
    }
    if (!createRoom && !/^[A-Z0-9]{6}$/.test(roomCode.trim())) {
      setError('Room codes are six letters or numbers. Please check the code and try again.');
      return;
    }

    setError('');
    setBusy(true);
    onJoin(
      {
        username: username.trim(),
        roomId: roomCode.trim().toUpperCase(),
        createRoom,
      },
      (result) => {
        setBusy(false);
        if (!result.success) setError(result.error);
      }
    );
  };

  const handleNext = () => {
    if (!username.trim()) {
      setError('Please enter a username.');
      return;
    }
    setError('');
    setStep(sharedRoomCode ? 'join-room' : 'choose-action');
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>✦ Real-Time Collab</h1>
        <p className="subtitle">A simple place to chat together, in real time.</p>

        {error && <p className="form-message" role="alert">{error}</p>}

        {step === 'enter-name' && (
          <>
            <div className="form-group">
              <label htmlFor="username">Your Name</label>
              <input
                id="username"
                type="text"
                autoComplete="nickname"
                placeholder="What should we call you?"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                maxLength={30}
                aria-describedby="name-help"
              />
              <small id="name-help" className="field-help">Up to 30 characters. No account needed.</small>
            </div>

            <button className="btn btn-primary" onClick={handleNext} disabled={busy}>
              Continue
            </button>
          </>
        )}

        {step === 'choose-action' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <p className="welcome-copy">
                Welcome, <strong>{username}</strong>!
              </p>
            </div>

            <button className="btn btn-primary" onClick={() => submitJoin(true)} disabled={busy}>
              {busy ? 'Creating your room…' : 'Create a new room'}
            </button>

            <div className="room-actions">
              <button className="btn btn-secondary" onClick={() => setStep('join-room')} disabled={busy}>
                Join with a room code
              </button>
              <button className="btn btn-secondary" onClick={() => setStep('enter-name')} disabled={busy}>
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
                autoComplete="off"
                placeholder="e.g. A3BC7D"
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
                  setError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && submitJoin(false)}
                maxLength={6}
                aria-describedby="room-code-help"
              />
              <small id="room-code-help" className="field-help">Ask the room creator for their six-character code.</small>
            </div>

            <button className="btn btn-primary" onClick={() => submitJoin(false)} disabled={busy}>
              {busy ? 'Joining room…' : 'Join room'}
            </button>

            <div className="room-actions">
              <button className="btn btn-secondary" onClick={() => setStep(sharedRoomCode ? 'enter-name' : 'choose-action')} disabled={busy}>
                ← Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}