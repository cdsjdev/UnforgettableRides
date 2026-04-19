import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '@shared/types';
import { authAPI } from '../services/api';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem('rides_token'),
    loading: true,
  });

  useEffect(() => {
    if (state.token) {
      authAPI.me()
        .then((user) => setState((s) => ({ ...s, user, loading: false })))
        .catch(() => {
          localStorage.removeItem('rides_token');
          localStorage.removeItem('rides_user');
          setState({ user: null, token: null, loading: false });
        });
    } else {
      setState((s) => ({ ...s, loading: false }));
    }
  }, [state.token]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authAPI.login(email, password);

    if (!res.token || !res.user) {
      throw new Error(res.message || 'Login response missing token or user');
    }

    localStorage.setItem('rides_token', res.token);
    localStorage.setItem('rides_user', JSON.stringify(res.user));
    setState({ user: res.user, token: res.token, loading: false });
  }, []);

  const register = useCallback(async (name: string, email: string, password: string, role?: string) => {
    await authAPI.signup({ email, password, name, role });
    await login(email, password);
  }, [login]);

  const logout = useCallback(() => {
    localStorage.removeItem('rides_token');
    localStorage.removeItem('rides_user');
    setState({ user: null, token: null, loading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
