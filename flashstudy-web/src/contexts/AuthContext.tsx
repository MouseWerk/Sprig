'use client';

import { apiClient } from '@/lib/api-client';
import Cookies from 'js-cookie';
import React, { createContext, useContext, useEffect, useState } from 'react';

interface User {
  _id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      let token = Cookies.get('auth_token');
      if (!token) {
        token = localStorage.getItem('auth_token') || undefined;
      }
      console.log('Checking auth, token exists:', !!token);
      if (token) {
        const userData = await apiClient.getMe();
        console.log('Auth check successful, user:', userData.user);
        setUser(userData.user);
      }
    } catch (error: any) {
      console.error('Auth check failed:', error);
      // Only remove token if it's actually invalid (401/403)
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        console.log('Token invalid, removing');
        Cookies.remove('auth_token');
        localStorage.removeItem('auth_token');
      } else {
        console.log('Auth check failed but keeping token (network error?)');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const data = await apiClient.login(email, password);
    Cookies.set('auth_token', data.token, { 
      expires: 30,
      path: '/',
      sameSite: 'lax'
    });
    localStorage.setItem('auth_token', data.token);
    setUser(data.user);
  };

  const register = async (name: string, email: string, password: string) => {
    const data = await apiClient.register(name, email, password);
    Cookies.set('auth_token', data.token, { 
      expires: 30,
      path: '/',
      sameSite: 'lax'
    });
    localStorage.setItem('auth_token', data.token);
    setUser(data.user);
  };

  const logout = () => {
    Cookies.remove('auth_token');
    localStorage.removeItem('auth_token');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
