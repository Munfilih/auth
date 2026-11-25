import React, { useState, useMemo } from 'react';
import {
  Table,
  Input,
  Select,
  Button,
  Space,
  Row,
  Col,
  Card,
  Popconfirm,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  Building2,
  Search,
  Eye,
  Pencil,
  KeyRound,
  Sparkles,
  CheckCircle2,
  Clock,
  Filter,
  Plus,
  Pause,
  Play,
} from 'lucide-react';
import type { RegisteredBusiness } from '../types';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { StatCard } from '../components/StatCard';
import { EmptyState } from '../components/EmptyState';

const { Text } = Typography;

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

interface RegisteredBusinessesPageProps {
  businesses: RegisteredBusiness[];
  loading: boolean;
  busy: boolean;
  onRegisterBusiness: () => void;
  onViewBusiness: (businessId: string) => void;
  onEditBusiness: (business: RegisteredBusiness) => void;
  onSetBusinessHold: (businessId: string, onHold: boolean) => Promise<void>;
}

export const RegisteredBusinessesPage: React.FC<RegisteredBusinessesPageProps> = ({
  businesses,
  loading,
  busy,
  onRegisterBusiness,
  onViewBusiness,
  onEditBusiness,
  onSetBusinessHold,
}) => {
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending_activation'>('all');
  const [versionFilter, setVersionFilter] = useState<string>('all');

  // Statistics
  const activeCount = useMemo(() => businesses.filter((b) => b.status === 'active').length, [businesses]);
  const pendingCount = useMemo(() => businesses.filter((b) => b.status === 'pending_activation').length, [businesses]);
  const totalCodesCount = useMemo(
    () => businesses.reduce((sum, b) => sum + (b.systemCodes?.length || 0), 0),
    [businesses]
  );

  // Filtered List
  const filteredBusinesses = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return businesses.filter((b) => {
      // Status filter
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      // Version filter
      if (versionFilter !== 'all' && b.appVersion !== versionFilter) return false;
      // Search text
      if (!query) return true;
      const haystack = [
        b.businessName,
        b.username,
        b.mobileNumber,
        b.appVersion,
        ...b.systemCodes.map((s) => s.systemCode),
      ].map((v) => v?.toLowerCase() || '');

      return haystack.some((v) => v.includes(query));
    });
  }, [businesses, searchText, statusFilter, versionFilter]);
  const hasActiveFilters = Boolean(searchText) || statusFilter !== 'all' || versionFilter !== 'all';

  const columns: ColumnsType<RegisteredBusiness> = [
    {
      title: 'Business',
      dataIndex: 'businessName',
      key: 'businessName',
      sorter: (a, b) => a.businessName.localeCompare(b.businessName),
      render: (text: string, record: RegisteredBusiness) => (
        <div>
          <a
            onClick={() => onViewBusiness(record.id)}
            style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}
          >
            {text}
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: '#7c3aed',
                backgroundColor: '#f5f3ff',
                padding: '1px 6px',
                borderRadius: 4,
                border: '1px solid #ddd6fe',
              }}
            >
              {record.appVersion}
            </span>
            {record.legacy && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#64748b',
                  backgroundColor: '#f1f5f9',
                  padding: '1px 6px',
                  borderRadius: 4,
                }}
              >
                Legacy
              </span>
            )}
            {record.onHold && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#b91c1c',
                  backgroundColor: '#fef2f2',
                  padding: '1px 6px',
                  borderRadius: 4,
                  border: '1px solid #fecaca',
                }}
              >
                On Hold
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'POS User / Owner',
      dataIndex: 'username',
      key: 'username',
      render: (text: string, record: RegisteredBusiness) => (
        <div>
          <div style={{ fontWeight: 600, color: '#1e293b' }}>{text}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{record.mobileNumber || '—'}</div>
        </div>
      ),
    },
    {
      title: 'System Codes',
      dataIndex: 'systemCodes',
      key: 'systemCodes',
      render: (codes: RegisteredBusiness['systemCodes']) => {
        if (!codes || codes.length === 0) {
          return <span style={{ color: '#94a3b8', fontSize: 12 }}>None</span>;
        }
        return (
          <Space direction="horizontal" size={4} wrap>
            {codes.map((item) => (
              <Tooltip key={item.systemCode} title={`Status: ${item.status}`}>
                <code
                  style={{
                    fontSize: 11,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: item.status === 'active' ? '#ecfdf5' : '#fffbeb',
                    color: item.status === 'active' ? '#065f46' : '#92400e',
                    border: `1px solid ${item.status === 'active' ? '#a7f3d0' : '#fde68a'}`,
                  }}
                >
                  {item.systemCode}
                </code>
              </Tooltip>
            ))}
          </Space>
        );
      },
    },
    {
      title: 'Activation Status',
      dataIndex: 'status',
      key: 'status',
      width: 170,
      render: (status: string) => <StatusBadge status={status} />,
    },
    {
      title: 'Registration Date',
      dataIndex: 'registeredAt',
      key: 'registeredAt',
      width: 160,
      sorter: (a, b) => (a.registeredAt || '').localeCompare(b.registeredAt || ''),
      render: (date: string | null) => (
        <span style={{ fontSize: 12, color: '#64748b' }}>{formatDate(date)}</span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      align: 'right',
      render: (_: unknown, record: RegisteredBusiness) => (
        <Space size={4}>
          <Tooltip title="View Details">
            <Button
              type="text"
              size="small"
              icon={<Eye size={15} color="#7c3aed" />}
              onClick={() => onViewBusiness(record.id)}
            />
          </Tooltip>

          {!record.legacy && (
            <>
              <Tooltip title="Edit Details">
                <Button
                  type="text"
                  size="small"
                  icon={<Pencil size={15} color="#475569" />}
                  onClick={() => onEditBusiness(record)}
                  disabled={busy}
                />
              </Tooltip>

              <Tooltip title={record.onHold ? 'Resume License' : 'Hold License'}>
                <Popconfirm
                  title={record.onHold ? 'Resume this license?' : 'Place this license on hold?'}
                  description={
                    record.onHold
                      ? 'Linked POS systems will regain access to this license.'
                      : 'All linked POS systems will be blocked from using this license until it is resumed.'
                  }
                  onConfirm={() => onSetBusinessHold(record.id, !record.onHold)}
                  okText={record.onHold ? 'Resume License' : 'Hold License'}
                  okButtonProps={record.onHold ? undefined : { danger: true }}
                  cancelText="Cancel"
                >
                  <Button
                    type="text"
                    size="small"
                    danger={!record.onHold}
                    icon={record.onHold ? <Play size={15} /> : <Pause size={15} />}
                    disabled={busy}
                  />
                </Popconfirm>
              </Tooltip>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Registered Businesses"
        subtitle="Manage commercial aptPOS clients, license keys, and hardware terminal activation status."
        eyebrow="Commercial Accounts"
        icon={Building2}
        breadcrumbItems={[
          { title: 'Dashboard', href: '#' },
          { title: 'Registered Businesses' },
        ]}
        extra={
          <Button type="primary" icon={<Plus size={15} />} onClick={onRegisterBusiness}>
            Register Business
          </Button>
        }
      />

      {/* Business Registration Statistics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Total Registered"
            value={businesses.length}
            subtitle="Commercial business clients"
            icon={Building2}
            iconColor="#7c3aed"
            iconBg="#f5f3ff"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Active Licenses"
            value={activeCount}
            subtitle="Activated in aptPOS settings"
            icon={CheckCircle2}
            iconColor="#10b981"
            iconBg="#ecfdf5"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Pending Activation"
            value={pendingCount}
            subtitle="Keys issued, awaiting entry"
            icon={Clock}
            iconColor="#f59e0b"
            iconBg="#fffbeb"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Total Terminal Codes"
            value={totalCodesCount}
            subtitle="Linked POS hardware terminals"
            icon={Sparkles}
            iconColor="#3b82f6"
            iconBg="#eff6ff"
          />
        </Col>
      </Row>

      {/* Main Table Card */}
      <Card
        style={{
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
        bodyStyle={{ padding: 0 }}
      >
        {/* Search & Advanced Filters Toolbar */}
        <div
          className="registered-businesses-toolbar"
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
          <div className="registered-businesses-search" style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260, maxWidth: 420 }}>
            <Input
              placeholder="Search by business, user, mobile, or code..."
              prefix={<Search size={15} color="#94a3b8" />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </div>

          <Space className="registered-businesses-filters" wrap size={10}>
            <div className="registered-businesses-filter" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Filter size={14} color="#64748b" />
              <Text type="secondary" style={{ fontSize: 12 }}>Status:</Text>
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 160 }}
                size="middle"
              >
                <Select.Option value="all">All Statuses</Select.Option>
                <Select.Option value="active">Active Only</Select.Option>
                <Select.Option value="pending_activation">Pending Activation</Select.Option>
              </Select>
            </div>

            <div className="registered-businesses-filter" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Edition:</Text>
              <Select
                value={versionFilter}
                onChange={setVersionFilter}
                style={{ width: 130 }}
                size="middle"
              >
                <Select.Option value="all">All Editions</Select.Option>
                <Select.Option value="Soft">Soft</Select.Option>
                <Select.Option value="Silver">Silver</Select.Option>
                <Select.Option value="Standard">Standard</Select.Option>
              </Select>
            </div>

            {(searchText || statusFilter !== 'all' || versionFilter !== 'all') && (
              <Button
                type="text"
                size="small"
                onClick={() => {
                  setSearchText('');
                  setStatusFilter('all');
                  setVersionFilter('all');
                }}
                style={{ fontSize: 12, color: '#7c3aed' }}
              >
                Reset Filters
              </Button>
            )}
          </Space>
        </div>

        {/* Structured Data Table */}
        <Table<RegisteredBusiness>
          scroll={{ x: 'max-content' }}
          dataSource={filteredBusinesses}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} businesses`,
          }}
          onRow={(record) => ({
            onClick: () => onViewBusiness(record.id),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <EmptyState
                icon={KeyRound}
                title={
                  searchText || statusFilter !== 'all' || versionFilter !== 'all'
                    ? 'No matching registered businesses'
                    : 'No registered businesses yet'
                }
                description={
                  searchText || statusFilter !== 'all' || versionFilter !== 'all'
                    ? 'Try adjusting your search criteria or resetting the active filters.'
                    : 'New business registrations created via the portal will be listed here with their license keys.'
                }
                actionText={hasActiveFilters ? 'Clear Filters' : undefined}
                onAction={
                  hasActiveFilters
                    ? () => {
                        setSearchText('');
                        setStatusFilter('all');
                        setVersionFilter('all');
                      }
                    : undefined
                }
              />
            ),
          }}
        />
      </Card>
    </div>
  );
};
