import { useCallback, useEffect, useRef, useState } from 'react';
import socket from './socket';
import LoginScreen from './components/LoginScreen';
import Room from './components/Room';

function readSavedSession() {
  try {
    const saved = JSON.parse(localStorage.getItem('collab-session') || 'null');
    if (
      saved &&
      typeof saved.username === 'string' &&
      typeof saved.roomId === 'string'
    ) {
      return { username: saved.username, roomId: saved.roomId };
    }
  } catch {
    localStorage.removeItem('collab-session');
  }
  return null;
}

export default function App() {
  const [session, setSession] = useState(readSavedSession);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [loginNotice, setLoginNotice] = useState('');
  const sessionRef = useRef(session);

  useEffect(() => {
    sessionRef.current = session;
    if (session) {
      localStorage.setItem(
        'collab-session',
        JSON.stringify({ username: session.username, roomId: session.roomId })
      );
    } else {
      localStorage.removeItem('collab-session');
    }
  }, [session]);

  const rejoinSavedRoom = useCallback((activeSession) => {
    if (!activeSession) return;
    setConnectionStatus('connecting');
    socket.timeout(5000).emit(
      'join',
      { roomId: activeSession.roomId, username: activeSession.username },
      (timeoutError, result) => {
        if (timeoutError || !result?.success) {
          setSession(null);
          setLoginNotice(
            result?.error || 'Could not reconnect to your room. Please join again.'
          );
          setConnectionStatus('error');
          return;
        }
        setConnectionStatus('connected');
      }
    );
  }, []);

  useEffect(() => {
    const onConnect = () => {
      setConnectionStatus('connected');
      rejoinSavedRoom(sessionRef.current);
    };
    const onDisconnect = () => setConnectionStatus('disconnected');
    const onConnectError = () => setConnectionStatus('error');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.connect();

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, [rejoinSavedRoom]);

  const handleJoin = useCallback(({ username, roomId, createRoom }, done) => {
    const event = createRoom ? 'create-room' : 'join';
    const payload = createRoom ? { username } : { username, roomId };
    setConnectionStatus(socket.connected ? 'connecting' : 'disconnected');

    socket.timeout(8000).emit(event, payload, (timeoutError, result) => {
      if (timeoutError) {
        setConnectionStatus(socket.connected ? 'connected' : 'error');
        done({ success: false, error: 'The server did not respond. Please try again.' });
        return;
      }
      if (!result?.success) {
        setConnectionStatus(socket.connected ? 'connected' : 'error');
        done({
          success: false,
          error: result?.error || 'Could not join the room. Please try again.',
        });
        return;
      }

      setLoginNotice('');
      setSession({
        username,
        roomId: result.roomId,
        initialHistory: result.history,
        initialUsers: result.users,
      });
      setConnectionStatus('connected');
      done({ success: true });
    });
  }, []);

  const handleLeave = useCallback(() => {
    socket.emit('leave');
    setSession(null);
    setLoginNotice('');
    setConnectionStatus(socket.connected ? 'connected' : 'disconnected');
  }, []);

  return (
    <div className="app">
      {session ? (
        <Room
          key={session.roomId}
          username={session.username}
          roomId={session.roomId}
          initialHistory={session.initialHistory}
          initialUsers={session.initialUsers}
          onLeave={handleLeave}
          connectionStatus={connectionStatus}
        />
      ) : (
        <LoginScreen onJoin={handleJoin} notice={loginNotice} />
      )}
    </div>
  );
}
