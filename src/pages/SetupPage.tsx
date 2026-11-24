import React from 'react';
import { Card, Button, Typography, Space } from 'antd';
import { ShieldCheck, ArrowUpRight, Check } from 'lucide-react';

const { Title, Text } = Typography;

interface SetupPageProps {
  firebaseWebConfigured: boolean;
}

export const SetupPage: React.FC<SetupPageProps> = ({ firebaseWebConfigured }) => {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        padding: 24,
      }}
    >
      <Card
        style={{
          maxWidth: 620,
          width: '100%',
          borderRadius: 16,
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.06)',
          border: '1px solid #e2e8f0',
        }}
        bodyStyle={{ padding: '36px 40px' }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
          }}
        >
          <ShieldCheck size={26} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          APTPOS ADMIN PORTAL
        </div>

        <Title level={2} style={{ margin: '6px 0 10px 0', fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
          {firebaseWebConfigured ? 'Finish Portal Configuration' : 'Firebase Settings Required'}
        </Title>

        <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.6, display: 'block', marginBottom: 24 }}>
          {firebaseWebConfigured ? (
            <>
              Set <code>VITE_ADMIN_LOGIN_EMAIL</code> in your environment variables or deployment secrets, then reload the application.
            </>
          ) : (
            <>
              Add the required Firebase web client settings and <code>VITE_ADMIN_LOGIN_EMAIL</code> to your <code>.env</code> file or deployment secrets.
            </>
          )}
        </Text>

        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: '16px 20px',
            marginBottom: 28,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 10 }}>
            Configuration Checklist:
          </Text>
          <Space direction="vertical" size={10} style={{ width: '100%', fontSize: 12, color: '#475569' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={14} color="#10b981" />
              <span>
                Set <code>VITE_FIREBASE_API_KEY</code>, <code>AUTH_DOMAIN</code>, <code>PROJECT_ID</code>, and <code>APP_ID</code>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={14} color="#10b981" />
              <span>
                Set <code>VITE_ADMIN_LOGIN_EMAIL</code> to the Firebase Auth admin email
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={14} color="#10b981" />
              <span>Enable Firebase Authentication (Email/Password & Google)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={14} color="#10b981" />
              <span>
                Firestore: create <code>portalAdmins/{'{uid}'}</code> with <code>active: true</code> and <code>username: &quot;aptadmin&quot;</code>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={14} color="#10b981" />
              <span>
                Set <code>VITE_API_BASE_URL</code> to the hosted Node API endpoint
              </span>
            </div>
          </Space>
        </div>

        <Button
          type="primary"
          size="large"
          style={{ background: '#7c3aed' }}
          icon={<ArrowUpRight size={16} />}
          href="https://console.firebase.google.com/"
          target="_blank"
          rel="noreferrer"
        >
          Open Firebase Console
        </Button>
      </Card>
    </div>
  );
};
