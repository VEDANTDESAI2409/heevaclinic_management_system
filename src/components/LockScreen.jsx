import React, { useState, useRef, useEffect } from 'react';
import { Logo } from './ui';
import { Lock, Eye, EyeOff, KeyRound, AlertCircle, Loader2 } from 'lucide-react';

export default function LockScreen({ onLogin }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!password.trim() || loading) return;

    setError('');
    setLoading(true);

    try {
      await onLogin(password);
    } catch (err) {
      setError(err?.message || 'Incorrect clinic password. Please try again.');
      setPassword('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-brand">
        <div className="login-brand-inner">
          <div className="login-logo-row">
            <Logo size={52} />
            <div>
              <div className="login-clinic">HEEVA CLINIC</div>
              <div className="login-tag">Trusted care, every time.</div>
            </div>
          </div>
          <div className="login-headline">
            Secure, edge-backed clinical practice.
          </div>
          <ul className="login-points">
            <li>Single-password clinical access for doctors &amp; clinic staff</li>
            <li>Real-time patient history, appointments, and consultations</li>
            <li>A4 and thermal invoicing with inventory tracking</li>
            <li>Cloudflare D1 resilient database architecture</li>
          </ul>
          <div className="login-foot">
            HEEVA CLINIC Management System · Surat, Gujarat
          </div>
        </div>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'var(--teal-50, #e6f7f6)',
              color: 'var(--teal-600, #0e9594)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Lock size={20} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 20 }}>Unlock Workspace</h1>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Authorized clinic access only</div>
            </div>
          </div>

          <p className="login-sub">
            Enter the clinic password to access patient records and clinical tools.
          </p>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="input-with-icon" style={{ height: 46 }}>
              <KeyRound size={18} />
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                className="input"
                placeholder="Enter clinic password..."
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                disabled={loading}
                autoComplete="current-password"
                style={{ height: '100%', fontSize: 14 }}
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                title={showPassword ? 'Hide password' : 'Show password'}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4 }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 12px',
                borderRadius: 8,
                background: 'var(--red-50, #fee2e2)',
                color: 'var(--red-600, #dc2626)',
                fontSize: 13,
                fontWeight: 500,
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary login-btn"
              disabled={loading || !password.trim()}
              style={{ height: 44, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>Unlocking...</span>
                </>
              ) : (
                <>
                  <Lock size={16} />
                  <span>Unlock Clinic</span>
                </>
              )}
            </button>
          </form>

          <div style={{
            marginTop: 24,
            paddingTop: 16,
            borderTop: '1px solid var(--border-2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 11,
            color: 'var(--text-3)'
          }}>
            <span>HEEVA CLINIC v2.0</span>
            <span>Cloudflare D1 Protected</span>
          </div>
        </div>
      </div>
    </div>
  );
}
