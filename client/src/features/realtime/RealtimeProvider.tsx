import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '../auth/AuthProvider';

const RealtimeContext = createContext<Socket | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { refreshUser } = useAuth();
  const [socket] = useState(() =>
    io(import.meta.env.VITE_API_URL || undefined, {
      autoConnect: false,
      withCredentials: true,
      reconnection: true,
    }),
  );

  useEffect(() => {
    let authRetry = false;
    const connected = () => {
      authRetry = false;
    };
    const failed = (cause: Error) => {
      if (cause.message !== 'UNAUTHORIZED' || authRetry) return;
      authRetry = true;
      void refreshUser().then((restored) => {
        if (restored) socket.connect();
      });
    };
    socket.on('connect', connected);
    socket.on('connect_error', failed);
    socket.connect();
    const heartbeat = window.setInterval(() => {
      if (socket.connected) socket.emit('presence:heartbeat', {}, () => undefined);
    }, 30000);
    return () => {
      window.clearInterval(heartbeat);
      socket.off('connect', connected);
      socket.off('connect_error', failed);
      socket.disconnect();
    };
  }, [refreshUser, socket]);

  return <RealtimeContext.Provider value={socket}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeSocket(): Socket {
  const socket = useContext(RealtimeContext);
  if (!socket) throw new Error('useRealtimeSocket requires RealtimeProvider');
  return socket;
}
