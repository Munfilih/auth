import React, { useState, useMemo } from 'react';
import {
  Card,
  Table,
  Input,
  Select,
  Button,
  Space,
  Popconfirm,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  KeyRound,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Calendar,
} from 'lucide-react';
import type { DemoRequest } from '../types';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

const { Text } = Typography;

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function matchesDemoRequestSearch(request: DemoRequest, query: string): boolean {
  if (!query) return true;
  const hardware = request.hardwareInfo;
  return [
    request.systemCode,
    request.requestedBy,
    request.requestType,
    hardware?.deviceModel,
    hardware?.deviceManufacturer,
    hardware?.osCaption,
    hardware?.biosSerial,
  ].some((value) => value?.toLowerCase().includes(query));
}

interface DemoRequestsPageProps {
  demoRequests: DemoRequest[];
  loading: boolean;
  busy: boolean;
  onSelectRequest: (requestId: string) => void;
  onApproveRequest: (request: DemoRequest) => Promise<void>;
  onRejectRequest: (request: DemoRequest) => Promise<void>;
  onChangeExpiry: (request: DemoRequest) => void;
}

export const DemoRequestsPage: React.FC<DemoRequestsPageProps> = ({
  demoRequests,
  loading,
  busy,
  onSelectRequest,
  onApproveRequest,
  onRejectRequest,
  onChangeExpiry,
}) => {
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'rejected'>('all');

  const pendingCount = useMemo(
    () => demoRequests.filter((r) => r.status === 'pending').length,
    [demoRequests]
  );

  const filteredRequests = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return demoRequests
      .filter((request) => request.status !== 'approved')
      .filter((request) => statusFilter === 'all' || request.status === statusFilter)
      .filter((request) => matchesDemoRequestSearch(request, query))
      .sort((a, b) => {
        const statusRank: Record<DemoRequest['status'], number> = { pending: 0, approved: 1, rejected: 2 };
        const statusDiff = statusRank[a.status] - statusRank[b.status];
        if (statusDiff !== 0) return statusDiff;
        return new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime();
      });
  }, [demoRequests, searchText, statusFilter]);

  const columns: ColumnsType<DemoRequest> = [
    {
      title: 'Hardware System Code',
      dataIndex: 'systemCode',
      key: 'systemCode',
      render: (code: string, record: DemoRequest) => (
        <div>
          <a
            onClick={() => onSelectRequest(record.id)}
            style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#7c3aed' }}
          >
            {code}
          </a>
          {record.hardwareInfo && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              {[record.hardwareInfo.deviceManufacturer, record.hardwareInfo.deviceModel]
                .filter(Boolean)
                .join(' ')}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Requester',
      dataIndex: 'requestedBy',
      key: 'requestedBy',
      render: (text: string) => (
        <span style={{ fontWeight: 600, color: '#0f172a' }}>{text}</span>
      ),
    },
    {
      title: 'Request Type',
      dataIndex: 'requestType',
      key: 'requestType',
      width: 140,
      render: (type: string) => (
        <Tag color={type === 'extension' ? 'orange' : 'blue'}>
          {type === 'extension' ? 'Extension' : 'Initial Activation'}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string, record: DemoRequest) => (
        <StatusBadge
          status={status}
          label={record.deactivatedAt ? 'Deactivated' : undefined}
          size="small"
        />
      ),
    },
    {
      title: 'Requested On',
      dataIndex: 'requestedAt',
      key: 'requestedAt',
      width: 150,
      render: (date: string | null) => (
        <span style={{ fontSize: 12, color: '#64748b' }}>{formatDate(date)}</span>
      ),
    },
    {
      title: 'Expiration',
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      width: 160,
      render: (date: string | null, record: DemoRequest) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>{formatDate(date)}</span>
          {record.status === 'approved' && (
            <Button
              type="text"
              size="small"
              icon={<Calendar size={13} color="#7c3aed" />}
              onClick={(e) => {
                e.stopPropagation();
                onChangeExpiry(record);
              }}
              title="Change expiration date"
            />
          )}
        </div>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 170,
      align: 'right',
      render: (_: unknown, record: DemoRequest) => (
        <Space size={6}>
          {record.status === 'pending' ? (
            <>
              <Button
                type="primary"
                size="small"
                style={{ background: '#059669' }}
                icon={<CheckCircle size={13} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onApproveRequest(record);
                }}
                loading={busy}
              >
                Approve
              </Button>
              <Popconfirm
                title="Reject request?"
                description="Reject this evaluation key request?"
                onConfirm={() => onRejectRequest(record)}
                okText="Reject"
                okButtonProps={{ danger: true }}
                cancelText="Cancel"
              >
                <Button
                  danger
                  size="small"
                  icon={<XCircle size={13} />}
                  onClick={(e) => e.stopPropagation()}
                  loading={busy}
                >
                  Reject
                </Button>
              </Popconfirm>
            </>
          ) : (
            <Button
              type="link"
              size="small"
              icon={<Eye size={13} />}
              onClick={() => onSelectRequest(record.id)}
            >
              Details
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Demo Key Requests"
        subtitle="Review evaluation license requests and authorize 2-day trial extensions."
        eyebrow="Evaluation Queue"
        icon={KeyRound}
        breadcrumbItems={[
          { title: 'Dashboard', href: '#' },
          { title: 'Demo Key Requests' },
        ]}
      />

      <Card
        style={{
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
        bodyStyle={{ padding: 0 }}
      >
        {/* Toolbar */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260, maxWidth: 420 }}>
            <Input
              placeholder="Search by system code, requester, hardware..."
              prefix={<Search size={15} color="#94a3b8" />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </div>

          <Space wrap size={10}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={14} color="#64748b" />
              <Text type="secondary" style={{ fontSize: 12 }}>Filter:</Text>
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 150 }}
              >
                <Select.Option value="all">All Non-Approved</Select.Option>
                <Select.Option value="pending">
                  Pending ({pendingCount})
                </Select.Option>
                <Select.Option value="rejected">Rejected / Deactivated</Select.Option>
              </Select>
            </div>

            {searchText && (
              <Button
                type="text"
                size="small"
                onClick={() => setSearchText('')}
                style={{ fontSize: 12, color: '#7c3aed' }}
              >
                Clear Search
              </Button>
            )}
          </Space>
        </div>

        {/* Requests Table */}
        <Table<DemoRequest>
          dataSource={filteredRequests}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          onRow={(record) => ({
            onClick: () => onSelectRequest(record.id),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <EmptyState
                icon={KeyRound}
                title="No pending demo key requests"
                description="When users request aptPOS trial keys or extensions from their POS software, they will appear here for review."
              />
            ),
          }}
        />
      </Card>
    </div>
  );
};
