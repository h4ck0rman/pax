import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type SignedInUser = { id: string; email: string; name: string };

type AuthState =
  | { status: 'checking'; user: null }
  | { status: 'signed-in'; user: SignedInUser }
  | { status: 'signed-out'; user: null }
  | { status: 'unavailable'; user: null };

type AuthContextValue = AuthState & { signOut: () => Promise<void>; recheck: () => void };

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'checking', user: null });
  const [attempt, setAttempt] = useState(0);

  const recheck = useCallback(() => setAttempt(count => count + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/me', { signal: controller.signal, credentials: 'same-origin' })
      .then(async response => {
        if (response.status === 401) {
          setState({ status: 'signed-out', user: null });
          return;
        }
        if (!response.ok) {
          setState({ status: 'unavailable', user: null });
          return;
        }
        const body: unknown = await response.json();
        const user =
          typeof body === 'object' && body !== null ? (body as { user?: unknown }).user : null;
        if (
          typeof user === 'object' &&
          user !== null &&
          typeof (user as SignedInUser).id === 'string' &&
          typeof (user as SignedInUser).email === 'string'
        ) {
          setState({ status: 'signed-in', user: user as SignedInUser });
        } else {
          setState({ status: 'signed-out', user: null });
        }
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setState({ status: 'unavailable', user: null });
      });
    return () => controller.abort();
  }, [attempt]);

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      setState({ status: 'signed-out', user: null });
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, signOut, recheck }}>{children}</AuthContext.Provider>
  );
}
