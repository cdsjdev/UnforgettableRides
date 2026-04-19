import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User, LoginResponse } from '@shared/types';
import { authAPI } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResponse>;
  verifyDeviceLogin: (challengeId: string, code: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('rides_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      localStorage.removeItem('rides_user');
      localStorage.removeItem('rides_token');
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('rides_token');
    if (!token) {
      setLoading(false);
      return;
    }
    // Validate token by calling /auth/me
    authAPI.me()
      .then((u) => {
        setUser(u);
        localStorage.setItem('rides_user', JSON.stringify(u));
      })
      .catch(() => {
        localStorage.removeItem('rides_token');
        localStorage.removeItem('rides_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string): Promise<LoginResponse> => {
    const result = await authAPI.login(email, password);
    if (result.challenge_required && result.challenge_id) {
      return result;
    }
    if (!result.token || !result.user) {
      throw new Error(result.message || 'Login requires additional verification.');
    }
    localStorage.setItem('rides_token', result.token);
    localStorage.setItem('rides_user', JSON.stringify(result.user));
    setUser(result.user);
    return result;
  };

  const verifyDeviceLogin = async (challengeId: string, code: string) => {
    const result = await authAPI.verifyDeviceLogin(challengeId, code);
    if (!result.token || !result.user) {
      throw new Error(result.message || 'Verification failed. Please try again.');
    }
    localStorage.setItem('rides_token', result.token);
    localStorage.setItem('rides_user', JSON.stringify(result.user));
    setUser(result.user);
  };

  const logout = () => {
    localStorage.removeItem('rides_token');
    localStorage.removeItem('rides_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyDeviceLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
