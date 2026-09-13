import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import axios from 'axios';
import { api } from '../../shared/api';
import type { CurrentUser } from '../../shared/types';

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  setUser: (user: CurrentUser | null) => void;
  refreshUser: () => Promise<boolean>;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const setUser = useCallback((nextUser: CurrentUser | null) => {
    requestId.current += 1;
    setUserState(nextUser);
    setLoading(false);
  }, []);
  const refreshUser = useCallback(async (): Promise<boolean> => {
    const id = ++requestId.current;
    try {
      const { data } = await api.get<{ user: CurrentUser }>('/api/v1/auth/me');
      if (id === requestId.current) setUserState(data.user);
      return true;
    } catch (error) {
      if (id === requestId.current && axios.isAxiosError(error) && error.response?.status === 401) {
        setUserState(null);
      }
      return false;
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);
  useEffect(() => {
    const expired = () => {
      void refreshUser();
    };
    window.addEventListener('ana-auth-expired', expired);
    return () => window.removeEventListener('ana-auth-expired', expired);
  }, [refreshUser]);
  const logout = async () => {
    try {
      await api.post('/api/v1/auth/logout');
    } finally {
      setUser(null);
    }
  };
  return (
    <AuthContext.Provider value={{ user, loading, setUser, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth requires AuthProvider');
  return value;
}
