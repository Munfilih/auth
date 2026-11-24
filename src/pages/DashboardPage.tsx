import React, { useState } from 'react';
import { Row, Col, Card, Table, Button, Space } from 'antd';
import {
  Building2,
  Users,
  ShieldCheck,
  Plus,
  Laptop,
  ArrowRight,
  Clock,
  Sparkles,
} from 'lucide-react';
import type {
  DeviceRegistrationLicense,
  DemoRequest,
  RegisterDeviceInput,
  RegisterDeviceResult,
  RegisteredBusiness,
} from '../types';
import { StatCard } from '../components/StatCard';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { RegisterDeviceModal } from '../components/RegisterDeviceModal';

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

interface DashboardPageProps {
  registeredBusinesses: RegisteredBusiness[];
  demoRequests: DemoRequest[];
  onNavigate: (tab: 'registered' | 'demo' | 'demo-requests') => void;
  onRegisterBusiness: () => void;
  onLoadRegistrationLicenses: () => Promise<DeviceRegistrationLicense[]>;
  onRegisterDevice: (input: RegisterDeviceInput) => Promise<RegisterDeviceResult>;
  onSelectBusiness: (businessId: string) => void;
  onSelectDemoRequest: (requestId: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  registeredBusinesses,
  demoRequests,
  onNavigate,
  onRegisterBusiness,
  onLoadRegistrationLicenses,
  onRegisterDevice,
  onSelectBusiness,
  onSelectDemoRequest,
}) => {
  const [registerDeviceOpen, setRegisterDeviceOpen] = useState(false);
  const activeBusinesses = registeredBusinesses.filter((b) => b.status === 'active');
  const pendingBusinesses = registeredBusinesses.filter((b) => b.status === 'pending_activation');
  const totalSystemCodes = registeredBusinesses.reduce(
    (acc, b) => acc + (b.systemCodes?.length || 0),
    0
  );

  const pendingRequests = demoRequests.filter((r) => r.status === 'pending');
  const approvedDemos = demoRequests.filter(
    (r) => r.status === 'approved' && !r.convertedToRegistered
  );

  const recentBusinesses = [...registeredBusinesses]
    .sort((a, b) => (b.registeredAt || '').localeCompare(a.registeredAt || ''))
    .slice(0, 5);

  const recentRequests = [...demoRequests]
    .filter((r) => r.status === 'pending')
    .sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''))
    .slice(0, 5);

  return (
    <div>
      <PageHeader
        title="Admin Overview"
        subtitle="Real-time status of business registrations, system licenses, and demo requests."
        eyebrow="aptPOS Control Center"
        icon={ShieldCheck}
        breadcrumbItems={[
          { title: 'Home' },
          { title: 'Dashboard' },
        ]}
        extra={
          <Space wrap>
            <Button
              icon={<Laptop size={15} />}
              onClick={() => setRegisterDeviceOpen(true)}
            >
              Register Device
            </Button>
            <Button
              type="primary"
              icon={<Plus size={15} />}
              onClick={onRegisterBusiness}
            >
              Register Business
            </Button>
          </Space>
        }
      />

      {/* Metrics Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Registered Businesses"
            value={registeredBusinesses.length}
            subtitle={`${activeBusinesses.length} active · ${pendingBusinesses.length} pending`}
            icon={Building2}
            iconColor="#7c3aed"
            iconBg="#f5f3ff"
            onClick={() => onNavigate('registered')}
          />
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Active System Codes"
            value={totalSystemCodes}
            subtitle="Registered POS terminal nodes"
            icon={Sparkles}
            iconColor="#0284c7"
            iconBg="#f0f9ff"
            onClick={() => onNavigate('registered')}
          />
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Approved Demos"
            value={approvedDemos.length}
            subtitle="Active evaluation licenses"
            icon={Users}
            iconColor="#059669"
            iconBg="#ecfdf5"
            onClick={() => onNavigate('demo')}
          />
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Pending Requests"
            value={pendingRequests.length}
            subtitle={pendingRequests.length > 0 ? 'Requires administrator review' : 'Queue is all caught up'}
            icon={Clock}
            iconColor={pendingRequests.length > 0 ? '#d97706' : '#64748b'}
            iconBg={pendingRequests.length > 0 ? '#fffbeb' : '#f8fafc'}
            onClick={() => onNavigate('demo-requests')}
          />
        </Col>
      </Row>

      {/* Recent Tables Grid */}
      <Row gutter={[16, 16]}>
        {/* Recent Businesses */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Recent Business Registrations</span>
                <Button
                  type="link"
                  size="small"
                  onClick={() => onNavigate('registered')}
                  style={{ padding: 0 }}
                >
                  View All <ArrowRight size={13} style={{ verticalAlign: -2 }} />
                </Button>
              </div>
            }
            bodyStyle={{ padding: 0 }}
            style={{ borderRadius: 12, border: '1px solid #e2e8f0', height: '100%' }}
          >
            <Table
              dataSource={recentBusinesses}
              rowKey="id"
              pagination={false}
              size="middle"
              columns={[
                {
                  title: 'Business',
                  dataIndex: 'businessName',
                  key: 'businessName',
                  render: (text, record) => (
                    <div>
                      <a
                        onClick={() => onSelectBusiness(record.id)}
                        style={{ fontWeight: 600, color: '#0f172a' }}
                      >
                        {text}
                      </a>
                      <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>
                        {record.appVersion} Edition
                      </span>
                    </div>
                  ),
                },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  key: 'status',
                  width: 140,
                  render: (status) => <StatusBadge status={status} size="small" />,
                },
                {
                  title: 'Date',
                  dataIndex: 'registeredAt',
                  key: 'registeredAt',
                  width: 120,
                  render: (val) => <span style={{ fontSize: 12, color: '#64748b' }}>{formatDate(val)}</span>,
                },
              ]}
              locale={{ emptyText: 'No businesses registered yet' }}
            />
          </Card>
        </Col>

        {/* Pending Requests */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Pending Demo Requests</span>
                  {pendingRequests.length > 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        backgroundColor: '#fef3c7',
                        color: '#b45309',
                        padding: '1px 8px',
                        borderRadius: 12,
                      }}
                    >
                      {pendingRequests.length} pending
                    </span>
                  )}
                </div>
                <Button
                  type="link"
                  size="small"
                  onClick={() => onNavigate('demo-requests')}
                  style={{ padding: 0 }}
                >
                  View Queue <ArrowRight size={13} style={{ verticalAlign: -2 }} />
                </Button>
              </div>
            }
            bodyStyle={{ padding: 0 }}
            style={{ borderRadius: 12, border: '1px solid #e2e8f0', height: '100%' }}
          >
            <Table
              dataSource={recentRequests}
              rowKey="id"
              pagination={false}
              size="middle"
              columns={[
                {
                  title: 'System Code',
                  dataIndex: 'systemCode',
                  key: 'systemCode',
                  render: (text, record) => (
                    <div>
                      <a
                        onClick={() => onSelectDemoRequest(record.id)}
                        style={{ fontFamily: 'monospace', fontWeight: 600, color: '#7c3aed' }}
                      >
                        {text}
                      </a>
                      <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>
                        By {record.requestedBy}
                      </span>
                    </div>
                  ),
                },
                {
                  title: 'Type',
                  dataIndex: 'requestType',
                  key: 'requestType',
                  width: 120,
                  render: (val) => (
                    <span style={{ fontSize: 12, textTransform: 'capitalize' }}>
                      {val === 'extension' ? 'Extension' : 'Activation'}
                    </span>
                  ),
                },
                {
                  title: 'Requested',
                  dataIndex: 'requestedAt',
                  key: 'requestedAt',
                  width: 130,
                  render: (val) => <span style={{ fontSize: 12, color: '#64748b' }}>{formatDate(val)}</span>,
                },
              ]}
              locale={{ emptyText: 'No pending demo requests' }}
            />
          </Card>
        </Col>
      </Row>
      <RegisterDeviceModal
        open={registerDeviceOpen}
        onClose={() => setRegisterDeviceOpen(false)}
        demoRequests={demoRequests}
        onLoadLicenses={onLoadRegistrationLicenses}
        onRegister={onRegisterDevice}
      />
    </div>
  );
};
