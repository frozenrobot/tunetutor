import React, { useState, useEffect, useContext } from 'react';
import { Mail, Lock, User as UserIcon, Eye, EyeOff, Loader2, ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react';
import { apiPath } from './api';

export const AuthContext = React.createContext<{ token: string | null, setToken: any }>({ token: null, setToken: null });

type AuthMode = 'login' | 'register' | 'forgot-password' | 'reset-password' | 'verify-notice';

export const AuthView = ({ onLogin }: { onLogin: (token: string) => void }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const handledRef = React.useRef(false);

  // Handle Token Detection (Verify or Reset) on Mount
  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const verifyToken = params.get('verify_token');
    const resetToken = params.get('reset_token');
    const emailChangeToken = params.get('email_change_token');

    if (verifyToken || emailChangeToken || resetToken) {
      // Clear existing session to ensure clean verification state
      localStorage.removeItem("lyvo_token");
    }

    if (verifyToken) {
      handleVerify(verifyToken);
    } else if (emailChangeToken) {
      handleVerifyChange(emailChangeToken);
    } else if (resetToken) {
      setToken(resetToken);
      setMode('reset-password');
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleVerify = async (vToken: string) => {
    setLoading(true);
    try {
      const res = await fetch(apiPath(`/api/auth/verify?verify_token=${vToken}`));
      const data = await res.json();
      if (res.ok) {
        setError("");
        setMessage("Email verified successfully! You can now login.");
        setMode('login');
      } else {
        setError(data.detail || "Verification failed");
        setMode('login');
      }
    } catch (e) {
      setError("Network error during verification");
    }
    setLoading(false);
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const handleVerifyChange = async (vToken: string) => {
    setLoading(true);
    try {
      const res = await fetch(apiPath(`/api/auth/verify-email-change?verify_token=${vToken}`));
      const data = await res.json();
      if (res.ok) {
        setError("");
        setMessage("Email updated successfully! You can now login with your new email.");
        setMode('login');
      } else {
        setError(data.detail || "Email update verification failed");
        setMode('login');
      }
    } catch (e) {
      setError("Network error during verification");
    }
    setLoading(false);
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      if (mode === 'login') {
        const formData = new URLSearchParams();
        formData.append("username", username);
        formData.append("password", password);
        const res = await fetch(apiPath("/api/auth/login"), {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.detail || "Login failed");
        } else {
          onLogin(data.access_token);
        }
      }

      else if (mode === 'register') {
        const res = await fetch(apiPath("/api/auth/register"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, email })
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.detail || "Registration failed");
        } else {
          setMode('verify-notice');
        }
      }

      else if (mode === 'forgot-password') {
        const res = await fetch(apiPath("/api/auth/forgot-password"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
        });
        if (res.ok) {
          setMessage("If an account exists, a reset link has been sent to your email.");
        } else {
          setError("Failed to process request");
        }
      }

      else if (mode === 'reset-password') {
        if (password !== confirmPassword) {
          setError("Passwords do not match");
          setLoading(false);
          return;
        }
        const res = await fetch(apiPath("/api/auth/reset-password"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, new_password: password })
        });
        if (res.ok) {
          setMessage("Password reset successful. You can now login.");
          setMode('login');
        } else {
          const data = await res.json();
          setError(data.detail || "Reset failed. Link may be expired.");
        }
      }
    } catch (err) {
      setError("Network error. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    if (mode === 'verify-notice') {
      return (
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '1.5rem', borderRadius: '50%', width: 'fit-content', margin: '0 auto 1.5rem' }}>
            <Mail size={48} color="var(--brand-primary)" />
          </div>
          <h2 style={{ marginBottom: '1rem' }}>Verify your email</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '2rem' }}>
            We've sent a verification link to <strong>{email}</strong>. Please click the link to activate your account.
          </p>
          <button className="btn btn-outline" onClick={() => setMode('login')} style={{ width: '100%' }}>Back to Login</button>
        </div>
      );
    }

    if (mode === 'reset-password') {
      return (
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Create New Password</h2>
          <input
            type="password"
            placeholder="New Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Updating..." : "Reset Password"}
          </button>
        </form>
      );
    }

    if (mode === 'forgot-password') {
      return (
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setMode('login')}>
            <ArrowLeft size={16} /> <span style={{ fontSize: '0.9rem' }}>Back to login</span>
          </div>
          <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Reset Password</h2>
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            Enter your email and we'll send you a link to reset your password.
          </p>
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>
      );
    }

    return (
      <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <h2 className="title-gradient" style={{ textAlign: 'center', marginBottom: '1rem' }}>
          {mode === 'login' ? "Welcome Back" : "Create Account"}
        </h2>

        <div style={{ position: 'relative' }}>
          <UserIcon size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder={mode === 'login' ? "Username or Email" : "Username"}
            value={username}
            className="glass-input"
            style={{ paddingLeft: '3rem', width: '100%' }}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        {mode === 'register' && (
          <div style={{ position: 'relative' }}>
            <Mail size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="email"
              placeholder="Email"
              value={email}
              className="glass-input"
              style={{ paddingLeft: '3rem', width: '100%' }}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        )}

        <div style={{ position: 'relative' }}>
          <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="password"
            placeholder="Password"
            value={password}
            className="glass-input"
            style={{ paddingLeft: '3rem', width: '100%' }}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {mode === 'login' && (
          <div style={{ textAlign: 'right' }}>
            <span
              onClick={() => setMode('forgot-password')}
              style={{ fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer', transition: 'color 0.2s' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--brand-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              Forgot password?
            </span>
          </div>
        )}

        <button type="submit" className="btn" style={{ marginTop: '0.5rem' }} disabled={loading}>
          {loading ? "Please wait..." : (mode === 'login' ? "Login" : "Sign Up")}
        </button>

        <p style={{ textAlign: 'center', marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {mode === 'login' ? "New to Lyvo? " : "Already have an account? "}
          <span
            style={{ color: 'var(--brand-primary)', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? "Sign up" : "Login"}
          </span>
        </p>
      </form>
    );
  };

  return (
    <div className="page-enter" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <div className="glass-panel" style={{ padding: '3rem', width: '100%', maxWidth: '450px', position: 'relative' }}>
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            borderLeft: '4px solid var(--danger)',
            padding: '1rem',
            borderRadius: '0 8px 8px 0',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            animation: 'shake 0.4s ease-in-out'
          }}>
            <AlertTriangle size={20} color="var(--danger)" />
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{error}</span>
          </div>
        )}

        {message && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            borderLeft: '4px solid var(--success)',
            padding: '1rem',
            borderRadius: '0 8px 8px 0',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <CheckCircle size={20} color="var(--success)" />
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{message}</span>
          </div>
        )}

        {renderContent()}

        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-5px); }
            40%, 80% { transform: translateX(5px); }
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
};
