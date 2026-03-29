import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import {
  type User,
  login as apiLogin,
  login2FA as apiLogin2FA,
  register as apiRegister,
  getMe,
  logout as apiLogout,
  hasTokens,
  clearTokens,
  restoreTokens,
  ApiError,
} from '../api/client';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (
    email: string,
    password: string
  ) => Promise<{ requires_2fa?: boolean; challenge_token?: string } | void>;
  login2FA: (challengeToken: string, code: string) => Promise<void>;
  register: (
    email: string,
    username: string,
    password: string
  ) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  const setUser = (user: User | null) =>
    setState((s) => ({ ...s, user, loading: false, error: null }));

  const setError = (error: string) =>
    setState((s) => ({ ...s, error, loading: false }));

  const clearError = () => setState((s) => ({ ...s, error: null }));

  // Restore session on mount (from electron-store → localStorage → /auth/me)
  useEffect(() => {
    async function init() {
      await restoreTokens();
      if (!hasTokens()) {
        setState({ user: null, loading: false, error: null });
        return;
      }
      try {
        const user = await getMe();
        setUser(user);
      } catch {
        clearTokens();
        setState({ user: null, loading: false, error: null });
      }
    }
    init();
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const result = await apiLogin(email, password);
        if ('requires_2fa' in result) {
          setState((s) => ({ ...s, loading: false }));
          return {
            requires_2fa: true,
            challenge_token: result.challenge_token,
          };
        }
        setUser(result);
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message : 'Login failed';
        setError(msg);
        throw err;
      }
    },
    []
  );

  const login2FA = useCallback(
    async (challengeToken: string, code: string) => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const user = await apiLogin2FA(challengeToken, code);
        setUser(user);
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message : '2FA verification failed';
        setError(msg);
        throw err;
      }
    },
    []
  );

  const register = useCallback(
    async (email: string, username: string, password: string) => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const user = await apiRegister(email, username, password);
        setUser(user);
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message : 'Registration failed';
        setError(msg);
        throw err;
      }
    },
    []
  );

  const logout = useCallback(() => {
    apiLogout();
    setState({ user: null, loading: false, error: null });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const user = await getMe();
      setUser(user);
    } catch {
      // Token expired and refresh failed
      clearTokens();
      setState({ user: null, loading: false, error: null });
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        login2FA,
        register,
        logout,
        refreshUser,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
