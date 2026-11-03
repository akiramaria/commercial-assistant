import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { Login } from '../pages/Login';

interface Auth {
  email: string;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

/** Shows the login page until the server confirms a session, then renders the app. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: 'checking' } | { status: 'out' } | { status: 'error' } | { status: 'in'; email: string }>({
    status: 'checking',
  });

  const check = useCallback(async () => {
    try {
      const { email } = await api.me();
      setState({ status: 'in', email });
    } catch (e) {
      // A 401 means signed out; anything else means the server is down.
      setState({ status: e instanceof Error && e.message === 'Not signed in' ? 'out' : 'error' });
    }
  }, []);

  useEffect(() => {
    check();
    const expired = () => setState({ status: 'out' });
    window.addEventListener('auth:expired', expired);
    return () => window.removeEventListener('auth:expired', expired);
  }, [check]);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setState({ status: 'out' });
  }, []);

  if (state.status === 'checking') return null;
  if (state.status === 'error') {
    return (
      <div className="state-msg">
        <p className="placeholder-title">Can’t reach the server</p>
        <p className="hint">Start it with npm run dev, then reload the page.</p>
      </div>
    );
  }
  if (state.status === 'out') return <Login onSignedIn={(email) => setState({ status: 'in', email })} />;
  return <AuthContext.Provider value={{ email: state.email, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthGate');
  return ctx;
}
