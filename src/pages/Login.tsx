import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';

// Built from the Figma "Login" frame (Sales Pipeline Automation file).
export function Login({ onSignedIn }: { onSignedIn: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.login(email, password);
      onSignedIn(r.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t sign in.');
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-brand">
        <div className="sidebar-mark" />
        <span>Commercial Assistant</span>
      </div>

      <form className="login-card" onSubmit={submit}>
        <div className="login-head">
          <h1>Sign in</h1>
          <p>Use your PSYKHE account to open the knowledge pool.</p>
        </div>

        <div className="login-fields">
          <label className="login-field">
            <span>Email</span>
            <input type="email" autoComplete="username" required value={email} placeholder="name@psykhe.com" onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="login-field">
            <span>Password</span>
            <input type="password" autoComplete="current-password" required value={password} placeholder="••••••••••" onChange={(e) => setPassword(e.target.value)} />
          </label>
          <div className="login-options">
            <button type="button" className="login-link" onClick={() => setError('Ask your admin to reset your password.')}>
              Forgot password?
            </button>
          </div>
        </div>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary login-btn" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="login-foot">Access is limited to PSYKHE staff. The knowledge pool holds client-confidential proposals and case studies.</p>
    </div>
  );
}
