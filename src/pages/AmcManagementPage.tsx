import React, { useMemo, useState } from 'react';
import { Button, Card, Col, Input, Modal, Row, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CalendarClock, CircleCheck, Clock3, FileText, ShieldAlert } from 'lucide-react';
import type { RegisteredBusiness, UpdateRegisteredBusinessAmcInput } from '../types';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';

const { Text } = Typography;

const AMC_SECTIONS = ['all', 'active', 'renewing', 'expired', 'scheduled', 'uncovered'] as const;
type AmcSection = (typeof AMC_SECTIONS)[number];
type AmcStatus = Exclude<AmcSection, 'all'>;

interface AmcManagementPageProps {
  businesses: RegisteredBusiness[];
  loading: boolean;
  busy: boolean;
  onSave: (businessId: string, input: UpdateRegisteredBusinessAmcInput) => Promise<void>;
}

function localDateValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function daysBetweenDates(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
  const [toYear, toMonth, toDay] = to.split('-').map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86_400_000
  );
}

function amcStatus(business: RegisteredBusiness, today: string): AmcStatus {
  const { amcStartDate, amcEndDate } = business;
  if (!amcStartDate || !amcEndDate) return 'uncovered';
  if (amcEndDate < today) return 'expired';
  if (amcStartDate > today) return 'scheduled';
  return daysBetweenDates(today, amcEndDate) <= 30 ? 'renewing' : 'active';
}

function statusLabel(status: AmcStatus): string {
  const labels: Record<AmcStatus, string> = {
    active: 'Active',
    renewing: 'Renewal due',
    expired: 'Expired',
    scheduled: 'Scheduled',
    uncovered: 'Not covered',
  };
  return labels[status];
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    new Date(year, month - 1, day)
  );
}

export const AmcManagementPage: React.FC<AmcManagementPageProps> = ({
  businesses,
  loading,
  busy,
  onSave,
}) => {
  const [section, setSection] = useState<AmcSection>('all');
  const [search, setSearch] = useState('');
  const [editingBusiness, setEditingBusiness] = useState<RegisteredBusiness | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saveError, setSaveError] = useState('');
  const today = localDateValue();
  const managedBusinesses = useMemo(
    () => businesses.filter((business) => !business.legacy),
    [businesses]
  );
  const counts = useMemo(() => {
    const result: Record<AmcStatus, number> = {
      active: 0,
      renewing: 0,
      expired: 0,
      scheduled: 0,
      uncovered: 0,
    };
    managedBusinesses.forEach((business) => {
      result[amcStatus(business, today)] += 1;
    });
    return result;
  }, [managedBusinesses, today]);

  const filteredBusinesses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return managedBusinesses.filter((business) => {
      if (section !== 'all' && amcStatus(business, today) !== section) return false;
      if (!query) return true;
      return [
        business.businessName,
        business.username,
        ...business.systemCodes.map((system) => system.systemCode),
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [managedBusinesses, search, section, today]);

  const openEditor = (business: RegisteredBusiness) => {
    setEditingBusiness(business);
    setStartDate(business.amcStartDate || '');
    setEndDate(business.amcEndDate || '');
    setNotes(business.amcNotes || '');
    setSaveError('');
  };

  const handleSave = async () => {
    if (!editingBusiness) return;
    if (Boolean(startDate) !== Boolean(endDate)) {
      setSaveError('Enter both AMC dates or clear both dates to remove coverage.');
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setSaveError('AMC end date must be on or after the start date.');
      return;
    }
    try {
      await onSave(editingBusiness.id, {
        amcStartDate: startDate || null,
        amcEndDate: endDate || null,
        amcNotes: notes.trim(),
      });
      setEditingBusiness(null);
      message.success('AMC details saved.');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save AMC details.');
    }
  };

  const columns: ColumnsType<RegisteredBusiness> = [
    {
      title: 'Business',
      dataIndex: 'businessName',
      key: 'businessName',
      sorter: (left, right) => left.businessName.localeCompare(right.businessName),
      render: (name: string, business) => (
        <div>
          <Text strong>{name}</Text>
          <div style={{ color: '#64748b', fontSize: 11 }}>{business.username}</div>
        </div>
      ),
    },
    {
      title: 'POS Systems',
      dataIndex: 'systemCodes',
      key: 'systemCodes',
      render: (systems: RegisteredBusiness['systemCodes']) =>
        systems.length ? systems.map((system) => system.systemCode).join(', ') : '—',
    },
    {
      title: 'AMC Start',
      dataIndex: 'amcStartDate',
      key: 'amcStartDate',
      render: (value: string | null | undefined) => formatDate(value),
    },
    {
      title: 'AMC End / Renewal',
      dataIndex: 'amcEndDate',
      key: 'amcEndDate',
      sorter: (left, right) => (left.amcEndDate || '').localeCompare(right.amcEndDate || ''),
      render: (value: string | null | undefined) => formatDate(value),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, business) => {
        const status = amcStatus(business, today);
        const color = status === 'active' ? 'green' : status === 'renewing' ? 'orange' : status === 'expired' ? 'red' : 'default';
        return <Tag color={color}>{statusLabel(status)}</Tag>;
      },
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, business) => (
        <Button type="link" onClick={() => openEditor(business)}>
          Manage AMC
        </Button>
      ),
    },
  ];

  const sections = [
    { key: 'all', label: `All (${managedBusinesses.length})` },
    { key: 'active', label: `Active (${counts.active})` },
    { key: 'renewing', label: `Renewal due (${counts.renewing})` },
    { key: 'expired', label: `Expired (${counts.expired})` },
    { key: 'scheduled', label: `Scheduled (${counts.scheduled})` },
    { key: 'uncovered', label: `Not covered (${counts.uncovered})` },
  ];

  return (
    <div>
      <PageHeader
        title="AMC Management"
        subtitle="Track annual maintenance coverage and upcoming renewals for registered businesses."
        eyebrow="Customer Care"
        icon={CalendarClock}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Active AMC" value={counts.active} icon={CircleCheck} iconColor="#059669" iconBg="#ecfdf5" onClick={() => setSection('active')} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Renewal Due" value={counts.renewing} subtitle="Within 30 days" icon={Clock3} iconColor="#d97706" iconBg="#fffbeb" onClick={() => setSection('renewing')} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Expired AMC" value={counts.expired} icon={ShieldAlert} iconColor="#dc2626" iconBg="#fef2f2" onClick={() => setSection('expired')} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Not Covered" value={counts.uncovered} icon={FileText} iconColor="#64748b" iconBg="#f1f5f9" onClick={() => setSection('uncovered')} />
        </Col>
      </Row>

      <Card bodyStyle={{ padding: 16 }} style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <Space direction="vertical" size={16} style={{ display: 'flex' }}>
          <Tabs
            activeKey={section}
            items={sections}
            onChange={(key) => {
              const selected = AMC_SECTIONS.find((candidate) => candidate === key);
              if (selected) setSection(selected);
            }}
          />
          <Input.Search
            allowClear
            placeholder="Search business, POS username, or system code"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ maxWidth: 420 }}
          />
          {managedBusinesses.length === 0 && !loading ? (
            <EmptyState
              title="No registered businesses"
              description="Register a business before managing its AMC coverage."
            />
          ) : (
            <Table
              rowKey="id"
              columns={columns}
              dataSource={filteredBusinesses}
              loading={loading}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              locale={{ emptyText: 'No businesses match this AMC section.' }}
              scroll={{ x: 900 }}
            />
          )}
        </Space>
      </Card>

      <Modal
        title={`AMC Coverage · ${editingBusiness?.businessName || ''}`}
        open={Boolean(editingBusiness)}
        onCancel={() => setEditingBusiness(null)}
        onOk={() => void handleSave()}
        okText="Save AMC"
        confirmLoading={busy}
        destroyOnClose
      >
        <Space direction="vertical" size={14} style={{ display: 'flex', marginTop: 16 }}>
          <label>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>Coverage start date</Text>
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>Coverage end date / renewal date</Text>
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <label>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>Notes</Text>
            <Input.TextArea
              rows={3}
              maxLength={1000}
              showCount
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional service or contract notes"
            />
          </label>
          <Text type="secondary">Clear both dates and save to remove AMC coverage.</Text>
          {saveError && <Text type="danger">{saveError}</Text>}
        </Space>
      </Modal>
    </div>
  );
};
