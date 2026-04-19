import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../../../shared/types';
import { authAPI, setAuthToken } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role?: string) => Promise<void>;
  updateUserProfile: (updates: { name?: string; avatar_url?: string | null }) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = '@rides_auth_token';
const USER_KEY = '@rides_auth_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [token, storedUser] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (token && storedUser) {
          setAuthToken(token);
          try {
            const freshUser = await authAPI.me();
            setUser(freshUser);
            await AsyncStorage.setItem(USER_KEY, JSON.stringify(freshUser));
          } catch {
            await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
            setAuthToken(null);
          }
        }
      } catch {
        // storage error
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const result = await authAPI.login(email, password);
    if (!result.token || !result.user) throw new Error('Login failed');
    setAuthToken(result.token);
    await AsyncStorage.setItem(TOKEN_KEY, result.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(result.user));
    setUser(result.user);
  };

  const register = async (name: string, email: string, password: string, role?: string) => {
    const result = await authAPI.register(name, email, password, role);
    if (!result.token || !result.user) throw new Error('Registration failed');
    setAuthToken(result.token);
    await AsyncStorage.setItem(TOKEN_KEY, result.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(result.user));
    setUser(result.user);
  };

  const updateUserProfile = async (updates: { name?: string; avatar_url?: string | null }) => {
    const updated = await authAPI.updateProfile(updates);
    setUser(updated);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
  };

  const refreshUser = async () => {
    const freshUser = await authAPI.me();
    setUser(freshUser);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(freshUser));
  };

  const logout = async () => {
    setAuthToken(null);
    setUser(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, updateUserProfile, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
