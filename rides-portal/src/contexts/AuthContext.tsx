import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, LoginResponse } from '@shared/types';
import { authAPI } from '../services/api';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<LoginResponse>;
  register: (name: string, email: string, password: string, role?: string) => Promise<LoginResponse>;
  setSession: (token: string, user: User) => void;
  refreshMe: () => Promise<User | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem('rides_token'),
    loading: true,
  });

  const setSession = useCallback((token: string, user: User) => {
    localStorage.setItem('rides_token', token);
    localStorage.setItem('rides_user', JSON.stringify(user));
    setState({ user, token, loading: false });
  }, []);

  const refreshMe = useCallback(async () => {
    if (!state.token) return null;
    try {
      const user = await authAPI.me();
      localStorage.setItem('rides_user', JSON.stringify(user));
      setState((s) => ({ ...s, user }));
      return user;
    } catch {
      return null;
    }
  }, [state.token]);

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

    if (res.challenge_required) {
      return res;
    }

    if (!res.token || !res.user) {
      throw new Error(res.message || 'Login failed');
    }

    setSession(res.token, res.user);
    return res;
  }, [setSession]);

  const register = useCallback(async (name: string, email: string, password: string, role?: string) => {
    const res = await authAPI.signup({ email, password, name, role });
    if (!res.token || !res.user) {
      throw new Error(res.message || 'Registration failed');
    }
    setSession(res.token, res.user);
    return res;
  }, [setSession]);

  const logout = useCallback(() => {
    localStorage.removeItem('rides_token');
    localStorage.removeItem('rides_user');
    setState({ user: null, token: null, loading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, setSession, refreshMe, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
