import React, { useState } from 'react';
import { Input, Button, Alert, Typography, Divider } from 'antd';
import {
  ShieldCheck,
  Building2,
  BadgeCheck,
  KeyRound,
  User as UserIcon,
  Lock,
  Sparkles,
} from 'lucide-react';

const { Title, Text } = Typography;

interface LoginPageProps {
  adminUsername: string;
  onLogin: (password: string) => Promise<void>;
  onGoogleLogin: () => Promise<void>;
  loginBusy: boolean;
  loginError: string;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  adminUsername,
  onLogin,
  onGoogleLogin,
  loginBusy,
  loginError,
}) => {
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    await onLogin(password);
  };

  return (
    <div
      className="login-page"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at 80% 20%, #2e1065 0%, #0f0a1c 70%)',
        padding: 24,
      }}
    >
      <div
        className="login-card"
        style={{
          width: '100%',
          maxWidth: 960,
          minHeight: 560,
          background: '#ffffff',
          borderRadius: 20,
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.45)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
        }}
      >
        {/* Left Side: Branded Visual Showcase */}
        <div
          className="login-brand-panel"
          style={{
            background: 'linear-gradient(145deg, #240e44 0%, #15082a 100%)',
            padding: '48px 40px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Subtle background glow */}
          <div
            style={{
              position: 'absolute',
              top: -60,
              right: -60,
              width: 220,
              height: 220,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(168, 85, 247, 0.25) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          <div>
            <div className="login-brand-header">
              <div
                className="login-brand-logo"
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 24px rgba(124, 58, 237, 0.35)',
                  marginBottom: 24,
                }}
              >
                <ShieldCheck size={28} />
              </div>

              <div className="login-brand-copy">
                <div style={{ fontSize: 11, fontWeight: 700, color: '#c084fc', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  SMART RETAIL PLATFORM
                </div>

                <Title level={1} style={{ color: '#ffffff', margin: '4px 0 12px 0', fontSize: 32, fontWeight: 800 }}>
                  apt<span style={{ color: '#c084fc' }}>POS</span> <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', verticalAlign: 'middle', background: 'rgba(255,255,255,0.1)', padding: '3px 8px', borderRadius: 6 }}>ADMIN</span>
                </Title>
              </div>
            </div>

            <Text className="login-brand-description" style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6, display: 'block', maxWidth: 340 }}>
              Centralized enterprise workspace for commercial business registrations, POS terminal licensing, and evaluation key provisioning.
            </Text>

            <div className="login-brand-features" style={{ marginTop: 36, display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#e2e8f0', fontSize: 13 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(124, 58, 237, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc' }}>
                  <Building2 size={16} />
                </div>
                <span>Multi-location Business Management</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#e2e8f0', fontSize: 13 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(124, 58, 237, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc' }}>
                  <KeyRound size={16} />
                </div>
                <span>Cryptographic License Key Issuance</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#e2e8f0', fontSize: 13 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(124, 58, 237, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc' }}>
                  <BadgeCheck size={16} />
                </div>
                <span>Live Hardware Telemetry & Verification</span>
              </div>
            </div>
          </div>

          <div className="login-brand-footer" style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={13} color="#c084fc" />
              Secured with Firebase Authentication & Cloud Firestore
            </span>
          </div>
        </div>

        {/* Right Side: Form Panel */}
        <div
          className="login-form-panel"
          style={{
            padding: '48px 44px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            background: '#ffffff',
          }}
        >
          <div className="login-form-intro" style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              SECURE ACCESS
            </div>
            <Title level={2} style={{ margin: '4px 0 6px 0', fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
              Welcome back
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Sign in with your aptPOS administrative account credentials.
            </Text>
          </div>

          {loginError && (
            <Alert
              message={loginError}
              type="error"
              showIcon
              style={{ marginBottom: 20 }}
            />
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Admin Username
              </label>
              <Input
                size="large"
                prefix={<UserIcon size={16} color="#94a3b8" style={{ marginRight: 6 }} />}
                value={adminUsername}
                disabled
                style={{ background: '#f8fafc' }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Admin Password
              </label>
              <Input.Password
                size="large"
                prefix={<Lock size={16} color="#94a3b8" style={{ marginRight: 6 }} />}
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                autoFocus={window.matchMedia('(min-width: 641px)').matches}
              />
            </div>

            <Button
              type="primary"
              size="large"
              htmlType="submit"
              block
              style={{
                height: 44,
                background: 'linear-gradient(120deg, #7c3aed, #a855f7)',
                fontSize: 14,
                fontWeight: 600,
                boxShadow: '0 4px 14px rgba(124, 58, 237, 0.3)',
              }}
              loading={loginBusy}
              icon={<ShieldCheck size={16} />}
            >
              Sign In Securely
            </Button>
          </form>

          <Divider style={{ margin: '22px 0 18px 0', fontSize: 12, color: '#94a3b8' }}>
            or continue with
          </Divider>

          <Button
            size="large"
            block
            style={{
              height: 44,
              borderColor: '#e2e8f0',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
            onClick={onGoogleLogin}
            loading={loginBusy}
          >
            <span style={{ fontWeight: 700, color: '#4285F4', fontSize: 16 }}>G</span>
            Sign in with Google
          </Button>

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Access restricted to authorized aptPOS portal administrators only.
            </Text>
          </div>
        </div>
      </div>
    </div>
  );
};
