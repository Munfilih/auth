import React, { useState, useMemo } from 'react';
import {
  Card,
  Table,
  Input,
  Button,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  Users,
  Search,
  Eye,
  KeyRound,
} from 'lucide-react';
import type { DemoRequest } from '../types';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';

const { Text } = Typography;

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

interface DemoUsersPageProps {
  demoUserRequests: DemoRequest[];
  loading: boolean;
  onSelectDemoRequest: (requestId: string) => void;
}

export const DemoUsersPage: React.FC<DemoUsersPageProps> = ({
  demoUserRequests,
  loading,
  onSelectDemoRequest,
}) => {
  const [demoSearchText, setDemoSearchText] = useState('');

  // Search active and deactivated demo systems.
  const filteredDemoUsers = useMemo(() => {
    const query = demoSearchText.trim().toLowerCase();
    return demoUserRequests.filter((r) => {
      if (!query) return true;
      return [
        r.systemCode,
        r.requestedBy,
        r.requestType,
        r.appVersion,
        r.hardwareInfo?.deviceModel,
        r.hardwareInfo?.deviceManufacturer,
      ].some((v) => v?.toLowerCase().includes(query));
    });
  }, [demoUserRequests, demoSearchText]);

  const demoRequestColumns: ColumnsType<DemoRequest> = [
    {
      title: 'User / Requester',
      dataIndex: 'requestedBy',
      key: 'requestedBy',
      render: (text: string) => (
        <span style={{ fontWeight: 600, color: '#0f172a' }}>{text}</span>
      ),
    },
    {
      title: 'System Code',
      dataIndex: 'systemCode',
      key: 'systemCode',
      render: (code: string) => (
        <code style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>{code}</code>
      ),
    },
    {
      title: 'License Type',
      dataIndex: 'requestType',
      key: 'requestType',
      render: (type: string) => (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#3b82f6',
            background: '#eff6ff',
            padding: '2px 8px',
            borderRadius: 6,
          }}
        >
          {type === 'extension' ? 'Extension' : 'Initial Activation'}
        </span>
      ),
    },
    {
      title: 'Version',
      dataIndex: 'appVersion',
      key: 'appVersion',
      render: (version?: string) => version || '—',
    },
    {
      title: 'Activation Status',
      dataIndex: 'keyUsed',
      key: 'keyUsed',
      render: (keyUsed: boolean, request: DemoRequest) => {
        const inactive = Boolean(request.deactivatedAt);
        const color = inactive ? '#b91c1c' : keyUsed ? '#047857' : '#b45309';
        const background = inactive ? '#fef2f2' : keyUsed ? '#ecfdf5' : '#fffbeb';
        return (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color,
              background,
              padding: '2px 8px',
              borderRadius: 6,
            }}
          >
            {inactive ? 'Inactive Demo' : keyUsed ? 'Activated' : 'Awaiting Activation'}
          </span>
        );
      },
    },
    {
      title: 'Activated / Deactivated On',
      dataIndex: 'redeemedAt',
      key: 'redeemedAt',
      render: (date: string | null, request: DemoRequest) => (
        <span style={{ fontSize: 12, color: '#64748b' }}>
          {formatDate(request.deactivatedAt || date)}
        </span>
      ),
    },
    {
      title: 'Expiration Date',
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (date: string | null) => (
        <span style={{ fontSize: 12, color: '#64748b' }}>{formatDate(date)}</span>
      ),
    },
    {
      title: 'Last Login',
      dataIndex: 'lastLoggedInAt',
      key: 'lastLoggedInAt',
      render: (date: string | null) => (
        <span style={{ fontSize: 12, color: '#64748b' }}>{formatDate(date)}</span>
      ),
    },
    {
      title: 'Details',
      key: 'actions',
      width: 110,
      align: 'right',
      render: (_: unknown, record: DemoRequest) => (
        <Button
          type="link"
          size="small"
          icon={<Eye size={13} />}
          onClick={() => onSelectDemoRequest(record.id)}
        >
          View Details
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Demo Users"
        subtitle="View active and inactive demo systems and manage their activation status."
        eyebrow="Evaluation Management"
        icon={Users}
        breadcrumbItems={[
          { title: 'Dashboard', href: '#' },
          { title: 'Demo Users' },
        ]}
      />

      <Card
        title={`Demo Systems (${demoUserRequests.length})`}
        style={{
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
          <div
            style={{
              paddingBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <Input
              placeholder="Search demo systems by code, requester, hardware..."
              prefix={<Search size={15} color="#94a3b8" />}
              value={demoSearchText}
              onChange={(e) => setDemoSearchText(e.target.value)}
              style={{ maxWidth: 380 }}
              allowClear
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Showing {filteredDemoUsers.length} of {demoUserRequests.length} systems
            </Text>
          </div>

          <Table<DemoRequest>
            dataSource={filteredDemoUsers}
            columns={demoRequestColumns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            onRow={(record) => ({
              onClick: () => onSelectDemoRequest(record.id),
              style: { cursor: 'pointer' },
            })}
            locale={{
              emptyText: (
                <EmptyState
                  icon={KeyRound}
                  title="No demo systems"
                  description="Active and inactive demo systems appear here with their activation status."
                />
              ),
            }}
          />
      </Card>
    </div>
  );
};
