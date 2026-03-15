'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  email?: string;
  name?: string;
  image?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: () => {},
  signOut: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 检查 session
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(data => {
        setUser(data.user || null);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const signIn = () => {
    window.location.href = '/api/auth/signin/google';
  };

  const signOut = () => {
    fetch('/api/auth/signout', { method: 'GET' })
      .then(() => {
        setUser(null);
        window.location.href = '/';
      });
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// 兼容 next-auth 的 useSession
export function useSession() {
  const { user, loading } = useAuth();
  return {
    data: user ? { user } : null,
    status: loading ? 'loading' : (user ? 'authenticated' : 'unauthenticated'),
  };
}

// 兼容 next-auth 的 signIn/signOut
export const signIn = () => { window.location.href = '/api/auth/signin/google'; };
export const signOut = () => { 
  fetch('/api/auth/signout', { method: 'GET' }).then(() => window.location.href = '/'); 
};
