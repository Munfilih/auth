import React from 'react';
import { Menu, Badge, Typography } from 'antd';
import {
  LayoutDashboard,
  Building2,
  Users,
  KeyRound,
  ShieldCheck,
  LogOut,
  Sparkles,
  Settings,
  CalendarClock,
  MonitorCog,
} from 'lucide-react';

const { Text } = Typography;

export type NavigationKey = 'dashboard' | 'registered' | 'demo' | 'demo-requests' | 'device-management' | 'amc-management' | 'version-control' | 'admin-users';

interface SidebarProps {
  currentKey: NavigationKey;
  onSelect: (key: NavigationKey) => void;
  pendingDemoRequestsCount?: number;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentKey,
  onSelect,
  pendingDemoRequestsCount = 0,
  onLogout,
}) => {
  const menuItems = [
    {
      key: 'main-group',
      type: 'group' as const,
      label: <span style={{ fontSize: 10, letterSpacing: '0.08em', color: '#94a3b8', fontWeight: 600 }}>OVERVIEW</span>,
      children: [
        {
          key: 'dashboard',
          icon: <LayoutDashboard size={18} />,
          label: 'Dashboard',
        },
      ],
    },
    {
      key: 'accounts-group',
      type: 'group' as const,
      label: <span style={{ fontSize: 10, letterSpacing: '0.08em', color: '#94a3b8', fontWeight: 600 }}>MANAGEMENT</span>,
      children: [
        {
          key: 'registered',
          icon: <Building2 size={18} />,
          label: 'Registered Businesses',
        },
        {
          key: 'demo',
          icon: <Users size={18} />,
          label: 'Demo Users',
        },
      ],
    },
    {
      key: 'amc-group',
      type: 'group' as const,
      label: <span style={{ fontSize: 10, letterSpacing: '0.08em', color: '#94a3b8', fontWeight: 600 }}>CUSTOMER CARE</span>,
      children: [
        {
          key: 'device-management',
          icon: <MonitorCog size={18} />,
          label: 'Device Management',
        },
        {
          key: 'amc-management',
          icon: <CalendarClock size={18} />,
          label: 'AMC Management',
        },
      ],
    },
    {
      key: 'requests-group',
      type: 'group' as const,
      label: <span style={{ fontSize: 10, letterSpacing: '0.08em', color: '#94a3b8', fontWeight: 600 }}>LICENSING</span>,
      children: [
        {
          key: 'demo-requests',
          icon: <KeyRound size={18} />,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>Demo Key Requests</span>
              {pendingDemoRequestsCount > 0 && (
                <Badge
                  count={pendingDemoRequestsCount}
                  style={{
                    backgroundColor: '#f59e0b',
                    color: '#fff',
                    boxShadow: 'none',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                />
              )}
            </div>
          ),
        },
        {
          key: 'version-control',
          icon: <Settings size={18} />,
          label: 'Version Manager',
        },
      ],
    },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#180e2b',
        color: '#f8fafc',
        userSelect: 'none',
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          padding: '20px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
            flexShrink: 0,
          }}
        >
          <ShieldCheck size={20} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff' }}>
              apt<span style={{ color: '#c084fc' }}>POS</span>
            </span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.06em',
                background: 'rgba(168, 85, 247, 0.2)',
                color: '#d8b4fe',
                padding: '2px 6px',
                borderRadius: 4,
                border: '1px solid rgba(168, 85, 247, 0.3)',
              }}
            >
              ADMIN
            </span>
          </div>
          <Text style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 1 }}>
            Enterprise Portal
          </Text>
        </div>
      </div>

      {/* Navigation Menu */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 6px' }}>
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={[currentKey]}
          style={{
            background: 'transparent',
            borderRight: 'none',
          }}
          items={menuItems}
          onClick={({ key }) => {
            if (
              key === 'dashboard' ||
              key === 'registered' ||
              key === 'demo' ||
              key === 'demo-requests' ||
              key === 'device-management' ||
              key === 'amc-management' ||
              key === 'version-control'
            ) {
              onSelect(key);
            }
          }}
        />
      </div>

      {/* Sidebar Footer */}
      <div
        style={{
          padding: '16px 14px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(0, 0, 0, 0.15)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            marginBottom: 10,
          }}
        >
          <Sparkles size={16} color="#c084fc" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0', display: 'block' }}>
              Firebase Secured
            </span>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>
              Firestore & Auth Active
            </span>
          </div>
        </div>

        <button
          onClick={onLogout}
          type="button"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            color: '#cbd5e1',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            textAlign: 'left',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
            e.currentTarget.style.color = '#fca5a5';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#cbd5e1';
          }}
        >
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
};
