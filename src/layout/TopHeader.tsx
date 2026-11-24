import React from 'react';
import { Button, Avatar, Dropdown, Typography, Tag } from 'antd';
import type { MenuProps } from 'antd';
import {
  Menu as MenuIcon,
  ShieldCheck,
  LogOut,
  User,
  RefreshCw,
  Users,
} from 'lucide-react';

const { Text } = Typography;

interface TopHeaderProps {
  adminUsername: string;
  onLogout: () => void;
  onOpenAdminUsers: () => void;
  onOpenMobileMenu?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  breadcrumbs?: Array<{ label: string; active?: boolean }>;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  adminUsername,
  onLogout,
  onOpenAdminUsers,
  onOpenMobileMenu,
  onRefresh,
  isRefreshing,
  breadcrumbs,
}) => {
  const userMenuItems: MenuProps['items'] = [
    {
      key: 'user-info',
      disabled: true,
      label: (
        <div style={{ padding: '4px 0' }}>
          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{adminUsername}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Portal Administrator</div>
        </div>
      ),
    },
    {
      type: 'divider',
    },
    {
      key: 'admin-users',
      icon: <Users size={14} />,
      label: 'Admin User Management',
      onClick: onOpenAdminUsers,
    },
    {
      key: 'logout',
      danger: true,
      icon: <LogOut size={14} />,
      label: 'Sign Out',
      onClick: onLogout,
    },
  ];

  return (
    <header
      className="top-header"
      style={{
        height: 64,
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #e2e8f0',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      {/* Left: Mobile Toggle & Breadcrumb */}
      <div className="top-header-left" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {onOpenMobileMenu && (
          <Button
            type="text"
            icon={<MenuIcon size={18} />}
            onClick={onOpenMobileMenu}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Toggle navigation menu"
            className="mobile-nav-toggle"
          />
        )}

        <div className="top-header-breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: '#f5f3ff',
              color: '#7c3aed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #ddd6fe',
            }}
          >
            <ShieldCheck size={16} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <span className="top-header-brand" style={{ color: '#64748b', fontWeight: 500 }}>aptPOS Admin</span>
            {breadcrumbs && breadcrumbs.length > 0 && (
              <>
                <span className="top-header-brand-separator" style={{ color: '#cbd5e1' }}>/</span>
                {breadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <span style={{ color: '#cbd5e1' }}>/</span>}
                    <span
                      className="top-header-crumb"
                      style={{
                        fontWeight: crumb.active ? 600 : 500,
                        color: crumb.active ? '#0f172a' : '#64748b',
                      }}
                    >
                      {crumb.label}
                    </span>
                  </React.Fragment>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: Actions, Status & User Menu */}
      <div className="top-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {onRefresh && (
          <Button
            className="top-header-refresh"
            type="text"
            size="small"
            icon={<RefreshCw size={14} className={isRefreshing ? 'spin' : ''} />}
            onClick={onRefresh}
            title="Refresh Data"
            style={{ color: '#64748b' }}
          >
            <span className="top-header-refresh-label">Refresh</span>
          </Button>
        )}

        <Tag
          className="top-header-environment"
          color="purple"
          style={{
            margin: 0,
            borderRadius: 6,
            fontWeight: 500,
            fontSize: 11,
            padding: '2px 8px',
            border: 'none',
            background: '#f3e8ff',
            color: '#7e22ce',
          }}
        >
          Production
        </Tag>

        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" arrow>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '4px 8px',
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            className="user-profile-chip"
          >
            <Avatar
              size={32}
              style={{
                backgroundColor: '#7c3aed',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: 13,
              }}
              icon={!adminUsername ? <User size={14} /> : undefined}
            >
              {adminUsername ? adminUsername.slice(0, 1).toUpperCase() : 'A'}
            </Avatar>
            <div className="top-header-profile-info" style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
              <Text style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>
                {adminUsername}
              </Text>
              <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.2 }}>
                Administrator
              </Text>
            </div>
          </div>
        </Dropdown>
      </div>
    </header>
  );
};
