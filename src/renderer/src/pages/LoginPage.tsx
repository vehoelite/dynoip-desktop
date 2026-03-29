import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getOAuthUrl } from '../api/client';
import { Eye, EyeOff, Loader2, Mail, Lock, KeyRound } from 'lucide-react';
import { cn } from '../lib/utils';

type View = 'login' | 'register' | '2fa' | 'forgot';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, login2FA, register, error, loading, clearError, refreshUser } = useAuth();

  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [challengeToken, setChallengeToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [localError, setLocalError] = useState('');
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  const displayError = localError || error;

  function switchView(v: View) {
    setView(v);
    clearError();
    setLocalError('');
    setForgotSent(false);
    setTotpCode('');
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLocalError('');
    try {
      const result = await login(email, password);
      if (result?.requires_2fa && result.challenge_token) {
        setChallengeToken(result.challenge_token);
        setView('2fa');
      } else {
        navigate('/');
      }
    } catch {
      // error set by context
    }
  }

  async function handle2FA(e: FormEvent) {
    e.preventDefault();
    setLocalError('');
    try {
      await login2FA(challengeToken, totpCode);
      navigate('/');
    } catch {
      // error set by context
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setLocalError('');
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }
    try {
      await register(email, username, password);
      navigate('/');
    } catch {
      // error set by context
    }
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setLocalError('');
    try {
      const { forgotPassword } = await import('../api/client');
      await forgotPassword(email);
      setForgotSent(true);
    } catch {
      setLocalError('Failed to send reset email');
    }
  }

  async function handleOAuth(provider: 'google' | 'github') {
    setOauthLoading(provider);
    setLocalError('');
    try {
      const { auth_url, session_id } = await getOAuthUrl(provider);
      // Open in system browser
      window.electron.openExternal(auth_url);
      // Poll for tokens
      const { pollOAuthTokens } = await import('../api/client');
      const maxAttempts = 60; // 5 minutes at 5s intervals
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const tokens = await pollOAuthTokens(session_id);
        if (tokens) {
          // Tokens stored by pollOAuthTokens, now load user into context
          await refreshUser();
          navigate('/');
          return;
        }
      }
      setLocalError('OAuth timed out. Please try again.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(`${provider} login failed: ${msg}`);
    } finally {
      setOauthLoading(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg overflow-y-auto">
      {/* Background subtle grid */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-primary) 1px, transparent 1px), linear-gradient(90deg, var(--color-primary) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo + Title */}
        <div className="mb-8 text-center">
          <video
            src="globe.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="mx-auto mb-4 h-16 w-auto opacity-80"
          />
          <h1 className="text-2xl font-bold tracking-wider text-primary">
            DYNO-IP
          </h1>
          <p className="mt-1 text-sm text-text-dim">
            {view === 'login' && 'Sign in to your account'}
            {view === 'register' && 'Create your account'}
            {view === '2fa' && 'Two-factor authentication'}
            {view === 'forgot' && 'Reset your password'}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-surface p-6 shadow-2xl">
          {/* Error — always rendered to prevent layout shift */}
          <div
            className={cn(
              'mb-4 rounded-lg border px-4 py-2.5 text-sm transition-all duration-200 overflow-hidden',
              displayError
                ? 'border-error/30 bg-error/10 text-error max-h-20 opacity-100'
                : 'max-h-0 opacity-0 mb-0 py-0 border-transparent'
            )}
          >
            {displayError || '\u00A0'}
          </div>

          {/* ── Login Form ── */}
          {view === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <InputField
                icon={<Mail size={16} />}
                type="email"
                placeholder="Email"
                value={email}
                onChange={setEmail}
                autoFocus
              />
              <InputField
                icon={<Lock size={16} />}
                type={showPw ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={setPassword}
                suffix={
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="text-text-muted hover:text-text"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              />

              <SubmitButton loading={loading}>Sign In</SubmitButton>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => switchView('forgot')}
                  className="text-text-dim hover:text-primary transition-colors"
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  onClick={() => switchView('register')}
                  className="text-primary hover:text-primary/80 transition-colors"
                >
                  Create account
                </button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-text-muted">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* OAuth */}
              <div className="grid grid-cols-2 gap-3">
                <OAuthButton
                  provider="google"
                  loading={oauthLoading === 'google'}
                  onClick={() => handleOAuth('google')}
                />
                <OAuthButton
                  provider="github"
                  loading={oauthLoading === 'github'}
                  onClick={() => handleOAuth('github')}
                />
              </div>
            </form>
          )}

          {/* ── Register Form ── */}
          {view === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <InputField
                icon={<Mail size={16} />}
                type="email"
                placeholder="Email"
                value={email}
                onChange={setEmail}
                autoFocus
              />
              <InputField
                icon={<KeyRound size={16} />}
                type="text"
                placeholder="Username"
                value={username}
                onChange={setUsername}
              />
              <InputField
                icon={<Lock size={16} />}
                type={showPw ? 'text' : 'password'}
                placeholder="Password (min 8 chars)"
                value={password}
                onChange={setPassword}
                suffix={
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="text-text-muted hover:text-text"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              />

              <SubmitButton loading={loading}>Create Account</SubmitButton>

              <p className="text-center text-xs text-text-dim">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchView('login')}
                  className="text-primary hover:text-primary/80"
                >
                  Sign in
                </button>
              </p>
            </form>
          )}

          {/* ── 2FA Form ── */}
          {view === '2fa' && (
            <form onSubmit={handle2FA} className="space-y-4">
              <p className="text-sm text-text-dim">
                Enter the 6-digit code from your authenticator app.
              </p>
              <InputField
                icon={<KeyRound size={16} />}
                type="text"
                placeholder="000000"
                value={totpCode}
                onChange={setTotpCode}
                autoFocus
                maxLength={6}
                inputMode="numeric"
                className="text-center font-mono text-xl tracking-[0.5em]"
              />
              <SubmitButton loading={loading}>Verify</SubmitButton>
              <p className="text-center text-xs text-text-dim">
                <button
                  type="button"
                  onClick={() => switchView('login')}
                  className="text-primary hover:text-primary/80"
                >
                  Back to login
                </button>
              </p>
            </form>
          )}

          {/* ── Forgot Password ── */}
          {view === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              {forgotSent ? (
                <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
                  If that email is registered, you'll receive a reset link shortly.
                </div>
              ) : (
                <>
                  <p className="text-sm text-text-dim">
                    Enter your email and we'll send a reset link.
                  </p>
                  <InputField
                    icon={<Mail size={16} />}
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={setEmail}
                    autoFocus
                  />
                  <SubmitButton loading={loading}>Send Reset Link</SubmitButton>
                </>
              )}
              <p className="text-center text-xs text-text-dim">
                <button
                  type="button"
                  onClick={() => switchView('login')}
                  className="text-primary hover:text-primary/80"
                >
                  Back to login
                </button>
              </p>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-text-muted">
          © {new Date().getFullYear()} Dyno-IP · v1.0.0
        </p>
      </div>
    </div>
  );
}

// ── Reusable Components ──

function InputField({
  icon,
  suffix,
  className,
  onChange,
  ...props
}: {
  icon: React.ReactNode;
  suffix?: React.ReactNode;
  onChange: (val: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'>) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 focus-within:border-primary/50 transition-colors">
      <span className="text-text-muted">{icon}</span>
      <input
        {...props}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'flex-1 bg-transparent text-sm text-text placeholder:text-text-muted outline-none',
          className
        )}
      />
      {suffix}
    </div>
  );
}

function SubmitButton({
  loading,
  children,
}: {
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className={cn(
        'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all',
        'bg-primary text-bg hover:bg-primary/90',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

function OAuthButton({
  provider,
  loading,
  onClick,
}: {
  provider: 'google' | 'github';
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        'flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text transition-all',
        'hover:border-primary/40 hover:bg-surface-2/80',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : provider === 'google' ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
      )}
      <span className="capitalize">{provider}</span>
    </button>
  );
}
