import React, { useState } from 'react';
import { Layout, Drawer } from 'antd';
import { Sidebar, type NavigationKey } from './Sidebar';
import { TopHeader } from './TopHeader';

const { Sider, Content } = Layout;

interface AppShellProps {
  currentTab: NavigationKey;
  onTabChange: (tab: NavigationKey) => void;
  adminUsername: string;
  onLogout: () => void;
  onOpenAdminUsers: () => void;
  pendingDemoRequestsCount?: number;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  breadcrumbs?: Array<{ label: string; active?: boolean }>;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentTab,
  onTabChange,
  adminUsername,
  onLogout,
  onOpenAdminUsers,
  pendingDemoRequestsCount,
  onRefresh,
  isRefreshing,
  breadcrumbs,
  children,
}) => {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const handleSelectTab = (key: NavigationKey) => {
    onTabChange(key);
    setMobileDrawerOpen(false);
  };

  return (
    <Layout style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Desktop Sider */}
      <Sider
        width={240}
        breakpoint="lg"
        collapsedWidth={0}
        trigger={null}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 20,
          boxShadow: '2px 0 8px rgba(0,0,0,0.06)',
        }}
        className="desktop-sider"
      >
        <Sidebar
          currentKey={currentTab}
          onSelect={handleSelectTab}
          pendingDemoRequestsCount={pendingDemoRequestsCount}
          onLogout={onLogout}
        />
      </Sider>

      {/* Mobile Navigation Drawer */}
      <Drawer
        placement="left"
        closable={false}
        onClose={() => setMobileDrawerOpen(false)}
        open={mobileDrawerOpen}
        bodyStyle={{ padding: 0 }}
        width={260}
        styles={{ body: { padding: 0, background: '#180e2b' } }}
      >
        <Sidebar
          currentKey={currentTab}
          onSelect={handleSelectTab}
          pendingDemoRequestsCount={pendingDemoRequestsCount}
          onLogout={onLogout}
        />
      </Drawer>

      {/* Main Content Layout */}
      <Layout className="site-layout" style={{ marginLeft: 240, transition: 'margin-left 0.2s', minHeight: '100vh' }}>
        <TopHeader
          adminUsername={adminUsername}
          onLogout={onLogout}
          onOpenAdminUsers={onOpenAdminUsers}
          onOpenMobileMenu={() => setMobileDrawerOpen(true)}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
          breadcrumbs={breadcrumbs}
        />

        <Content
          className="site-content"
          style={{
            padding: '24px 32px 40px',
            maxWidth: 1400,
            width: '100%',
            margin: '0 auto',
            boxSizing: 'border-box',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};
