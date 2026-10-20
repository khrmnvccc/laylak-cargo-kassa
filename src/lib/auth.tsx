import { createContext, useContext } from 'react';
import type { User } from './types';

export interface AuthState {
  user: User;
  setUser: (u: User) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthContext');
  return ctx;
}
