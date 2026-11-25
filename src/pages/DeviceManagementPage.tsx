import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Input,
  Popconfirm,
  Row,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  Activity,
  Clock3,
  Cpu,
  History,
  Laptop,
  MonitorCog,
  ShieldCheck,
  Users,
  Plus,
} from 'lucide-react';
import type {
  DemoRequest,
  DemoSystemActivity,
  DeviceHistoryEntry,
  DeviceLicenseHistoryEntry,
  DeviceRegistrationLicense,
  HardwareInfo,
  RegisterDeviceInput,
  RegisterDeviceResult,
  RegisteredBusiness,
  RegisteredBusinessSystemCode,
} from '../types';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { RegisterDeviceModal } from '../components/RegisterDeviceModal';

const { Text, Title } = Typography;

const DEVICE_SECTIONS = ['all', 'registered', 'demo', 'pending'] as const;
type DeviceSection = (typeof DEVICE_SECTIONS)[number];
type RegistrationStatus = 'active' | 'pending_activation' | 'not_registered';

interface DeviceRecord {
  systemCode: string;
  businessName: string;
  username: string;
  appVersion: string;
  licenseNumber?: string;
  isRegistered: boolean;
  registrationStatus: RegistrationStatus;
  blocked: boolean;
  registeredAt: string | null;
  activatedAt: string | null;
  firstActivatedAt: string | null;
  deviceHistory: DeviceHistoryEntry[];
  licenseHistory: DeviceLicenseHistoryEntry[];
  demoRequest?: DemoRequest;
}

interface RegisterDeviceTarget {
  systemCode?: string;
  demoRequestId?: string;
}

interface DeviceManagementPageProps {
  businesses: RegisteredBusiness[];
  demoRequests: DemoRequest[];
  blockedSystemCodes: string[];
  loading: boolean;
  onLoadActivity: (systemCode: string) => Promise<DemoSystemActivity>;
  onToggleBlock: (systemCode: string, blocked: boolean) => Promise<void>;
  onLoadRegistrationLicenses: () => Promise<DeviceRegistrationLicense[]>;
  onRegisterDevice: (input: RegisterDeviceInput) => Promise<RegisterDeviceResult>;
}

function requestDate(request: DemoRequest): string {
  return request.redeemedAt || request.reviewedAt || request.requestedAt || '';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : '—';
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let amount = Math.max(0, bytes);
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  return `${amount.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function demoDeviceStatus(request: DemoRequest | undefined): string {
  if (!request) return 'Unknown';
  if (request.deactivatedAt) return 'Deactivated';
  if (request.expiresAt && Date.parse(request.expiresAt) <= Date.now()) return 'Expired';
  return 'Active';
}

function registrationLabel(status: RegistrationStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'pending_activation') return 'Pending activation';
  return 'Not registered';
}

function licenseLabel(device: DeviceRecord): string {
  if (device.isRegistered) return device.licenseNumber || 'Legacy License';
  return device.demoRequest?.requestType === 'extension' ? 'Demo Extension' : 'Demo License';
}

function buildDevices(
  businesses: RegisteredBusiness[],
  demoRequests: DemoRequest[],
  blockedSystemCodes: string[]
): DeviceRecord[] {
  const devices = new Map<string, DeviceRecord>();
  const blockedCodes = new Set(blockedSystemCodes.map((systemCode) => systemCode.trim().toUpperCase()));
  const latestActivatedDemo = [...demoRequests]
    .filter((request) => request.status === 'approved' && request.keyUsed)
    .sort((left, right) => requestDate(right).localeCompare(requestDate(left)));

  businesses.forEach((business) => {
    business.systemCodes.forEach((system: RegisteredBusinessSystemCode) => {
      const systemCode = system.systemCode.trim().toUpperCase();
      if (!systemCode) return;
      devices.set(systemCode, {
        systemCode,
        businessName: business.businessName,
        username: business.username,
        appVersion: business.appVersion,
        licenseNumber: business.licenseNumber,
        isRegistered: true,
        registrationStatus: system.status,
        blocked: false,
        registeredAt: system.registeredAt,
        activatedAt: system.activatedAt,
        firstActivatedAt: system.firstActivatedAt || system.activatedAt,
        deviceHistory: system.deviceHistory,
        licenseHistory: system.licenseHistory.length
          ? system.licenseHistory
          : [{
              licenseType: 'commercial',
              label: business.businessName,
              appVersion: business.appVersion,
              assignedAt: system.registeredAt,
              activatedAt: system.activatedAt,
              expiresAt: null,
              endedAt: null,
            }],
      });
    });
  });

  latestActivatedDemo.forEach((request) => {
    const systemCode = request.systemCode.trim().toUpperCase();
    if (!systemCode) return;
    const existing = devices.get(systemCode);
    if (existing) {
      if (!existing.demoRequest) {
        existing.demoRequest = request;
      }
      if (request.registeredSystem) {
        existing.isRegistered = true;
        existing.registrationStatus =
          request.registrationStatus || existing.registrationStatus;
      }
      return;
    }

    devices.set(systemCode, {
      systemCode,
      businessName: request.requestedBy || 'Demo device',
      username: request.requestedBy,
      appVersion: request.appVersion || request.registeredVersion || 'Standard',
      isRegistered: request.registeredSystem,
      registrationStatus: request.registeredSystem
        ? request.registrationStatus || 'active'
        : 'not_registered',
      blocked: false,
      registeredAt: null,
      activatedAt: request.redeemedAt,
      firstActivatedAt: request.firstActivatedAt || request.redeemedAt,
      deviceHistory: request.deviceHistory,
      licenseHistory: request.licenseHistory,
      demoRequest: request,
    });
  });

  return [...devices.values()]
    .map((device) => ({ ...device, blocked: blockedCodes.has(device.systemCode) }))
    .sort((left, right) => left.businessName.localeCompare(right.businessName));
}

function statusColor(status: string): string {
  if (status === 'Active') return 'green';
  if (status === 'Pending activation') return 'orange';
  if (status === 'Expired' || status === 'Deactivated') return 'red';
  return 'default';
}

function deviceHistoryLabel(event: string): string {
  const labels: Record<string, string> = {
    first_activation: 'First Activation',
    registered: 'Registered',
    registered_to_commercial_license: 'Assigned to Commercial License',
    commercial_activated: 'Commercial License Activated',
    demo_extended: 'Demo Extended',
    system_code_replaced: 'System Code Replaced',
  };
  return labels[event] || event.replace(/_/g, ' ');
}

interface CombinedDeviceHistoryItem {
  at: string | null;
  title: string;
  mode?: 'Demo' | 'Licensed';
  details: string;
  color: string;
}

function combineDeviceHistory(device: DeviceRecord): CombinedDeviceHistoryItem[] {
  const deviceEntries = device.deviceHistory.map((entry) => ({
    at: entry.at,
    title: deviceHistoryLabel(entry.event),
    mode: entry.source === 'demo'
      ? 'Demo' as const
      : entry.source === 'commercial' || entry.source === 'registered'
        ? 'Licensed' as const
        : undefined,
    details: entry.businessName || '',
    color: entry.source === 'demo' ? 'blue' : 'green',
  }));
  const licenseEntries = device.licenseHistory.map((entry) => ({
    at: entry.assignedAt || entry.activatedAt || entry.endedAt || entry.expiresAt,
    title: entry.label,
    mode: entry.licenseType === 'demo' ? 'Demo' as const : 'Licensed' as const,
    details: [
      entry.appVersion,
      entry.activatedAt ? `Activated ${formatDate(entry.activatedAt)}` : '',
      entry.endedAt ? `Ended ${formatDate(entry.endedAt)}` : '',
      !entry.endedAt && entry.expiresAt ? `Expires ${formatDate(entry.expiresAt)}` : '',
    ].filter(Boolean).join(' · '),
    color: entry.endedAt ? 'gray' : entry.licenseType === 'demo' ? 'blue' : 'green',
  }));

  return [...deviceEntries, ...licenseEntries].sort((left, right) => {
    const leftTime = left.at ? Date.parse(left.at) : 0;
    const rightTime = right.at ? Date.parse(right.at) : 0;
    return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0);
  });
}

export const DeviceManagementPage: React.FC<DeviceManagementPageProps> = ({
  businesses,
  demoRequests,
  blockedSystemCodes,
  loading,
  onLoadActivity,
  onToggleBlock,
  onLoadRegistrationLicenses,
  onRegisterDevice,
}) => {
  const [section, setSection] = useState<DeviceSection>('all');
  const [search, setSearch] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<DeviceRecord | null>(null);
  const [activity, setActivity] = useState<DemoSystemActivity | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [loginHistoryOpen, setLoginHistoryOpen] = useState(false);
  const [deviceHistoryOpen, setDeviceHistoryOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockError, setBlockError] = useState('');
  const [registerDeviceTarget, setRegisterDeviceTarget] = useState<RegisterDeviceTarget | null>(null);

  const devices = useMemo(
    () => buildDevices(businesses, demoRequests, blockedSystemCodes),
    [businesses, demoRequests, blockedSystemCodes]
  );
  const counts = useMemo(
    () => ({
      registered: devices.filter((device) => device.isRegistered).length,
      demo: devices.filter((device) => !device.isRegistered).length,
      pending: devices.filter((device) => device.registrationStatus === 'pending_activation').length,
    }),
    [devices]
  );

  const filteredDevices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return devices.filter((device) => {
      if (section === 'registered' && !device.isRegistered) return false;
      if (section === 'demo' && device.isRegistered) return false;
      if (section === 'pending' && device.registrationStatus !== 'pending_activation') return false;
      if (!query) return true;
      return [
        device.systemCode,
        device.businessName,
        device.username,
        device.appVersion,
        device.demoRequest?.hardwareInfo?.hostname,
        device.demoRequest?.hardwareInfo?.deviceModel,
      ].some((value) => value?.toLowerCase().includes(query));
    });
  }, [devices, search, section]);

  useEffect(() => {
    if (!selectedDevice || !loginHistoryOpen) {
      if (!selectedDevice) {
        setActivity(null);
        setActivityError('');
      }
      setActivityLoading(false);
      return;
    }

    let active = true;
    setActivity(null);
    setActivityError('');
    setActivityLoading(true);
    void onLoadActivity(selectedDevice.systemCode)
      .then((result) => {
        if (active) setActivity(result);
      })
      .catch((error: unknown) => {
        if (active) {
          setActivityError(error instanceof Error ? error.message : 'Failed to load device activity.');
        }
      })
      .finally(() => {
        if (active) setActivityLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedDevice?.systemCode, loginHistoryOpen, onLoadActivity]);

  const openDevice = (device: DeviceRecord) => {
    setLoginHistoryOpen(false);
    setDeviceHistoryOpen(false);
    setActivity(null);
    setActivityError('');
    setSelectedDevice(device);
  };

  const closeDevice = () => {
    setLoginHistoryOpen(false);
    setDeviceHistoryOpen(false);
    setBlockError('');
    setSelectedDevice(null);
  };

  const toggleSelectedDeviceBlock = async () => {
    if (!selectedDevice) return;
    setBlockBusy(true);
    setBlockError('');
    try {
      await onToggleBlock(selectedDevice.systemCode, !selectedDevice.blocked);
      setSelectedDevice((current) => current
        ? { ...current, blocked: !current.blocked }
        : current);
    } catch (error) {
      setBlockError(error instanceof Error ? error.message : 'Could not update the device block status.');
    } finally {
      setBlockBusy(false);
    }
  };

  const columns: ColumnsType<DeviceRecord> = [
    {
      title: 'System Code',
      dataIndex: 'systemCode',
      key: 'systemCode',
      render: (systemCode: string) => <code style={{ color: '#7c3aed', fontWeight: 700 }}>{systemCode}</code>,
    },
    {
      title: 'Device Type',
      key: 'deviceType',
      render: (_, device) => <Tag color={device.isRegistered ? 'purple' : 'blue'}>{device.isRegistered ? 'Registered' : 'Demo'}</Tag>,
    },
    {
      title: 'Registration Status',
      key: 'registrationStatus',
      render: (_, device) => (
        <Tag color={device.registrationStatus === 'active' ? 'green' : device.registrationStatus === 'pending_activation' ? 'orange' : 'default'}>
          {registrationLabel(device.registrationStatus)}
        </Tag>
      ),
    },
    {
      title: 'Under License',
      key: 'license',
      render: (_, device) => (
        device.isRegistered && device.licenseNumber
          ? <code style={{ color: '#6d28d9', fontWeight: 600 }}>{device.licenseNumber}</code>
          : <Tag color={device.isRegistered ? 'default' : 'blue'}>{licenseLabel(device)}</Tag>
      ),
    },
    {
      title: 'Business Name',
      dataIndex: 'businessName',
      key: 'businessName',
    },
    {
      title: 'Device Status',
      key: 'deviceStatus',
      render: (_, device) => {
        const status = device.isRegistered
          ? registrationLabel(device.registrationStatus)
          : demoDeviceStatus(device.demoRequest);
        return <Tag color={statusColor(status)}>{status}</Tag>;
      },
    },
    {
      title: 'System Access',
      key: 'systemAccess',
      render: (_, device) => (
        <Tag color={device.blocked ? 'red' : 'green'}>
          {device.blocked ? 'Blocked' : 'Allowed'}
        </Tag>
      ),
    },
    {
      title: 'Last Login',
      key: 'lastLoggedInAt',
      render: (_, device) => formatDate(device.demoRequest?.lastLoggedInAt),
    },
  ];

  const sections = [
    { key: 'all', label: `All Devices (${devices.length})` },
    { key: 'registered', label: `Registered (${counts.registered})` },
    { key: 'demo', label: `Demo (${counts.demo})` },
    { key: 'pending', label: `Pending Registration (${counts.pending})` },
  ];
  const selectedHardware: HardwareInfo | undefined = selectedDevice?.demoRequest?.hardwareInfo;
  const selectedSystemInfo = activity?.systemInfo || selectedDevice?.demoRequest?.systemInfo;
  const selectedHistory = selectedDevice ? combineDeviceHistory(selectedDevice) : [];
  const deviceStatus = selectedDevice
    ? selectedDevice.isRegistered
      ? registrationLabel(selectedDevice.registrationStatus)
      : demoDeviceStatus(selectedDevice.demoRequest)
    : '';

  return (
    <div>
      <PageHeader
        title="Device Management"
        subtitle="Review registered terminals and activated demo devices, including hardware and login history."
        eyebrow="Device Operations"
        icon={MonitorCog}
        extra={
          <Button type="primary" icon={<Plus size={15} />} onClick={() => setRegisterDeviceTarget({})}>
            Register Device
          </Button>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <StatCard title="Total Devices" value={devices.length} icon={Laptop} iconColor="#7c3aed" iconBg="#f5f3ff" onClick={() => setSection('all')} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard title="Registered" value={counts.registered} icon={ShieldCheck} iconColor="#059669" iconBg="#ecfdf5" onClick={() => setSection('registered')} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard title="Demo Activated" value={counts.demo} icon={Users} iconColor="#0284c7" iconBg="#f0f9ff" onClick={() => setSection('demo')} />
        </Col>
      </Row>

      <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <Space direction="vertical" size={14} style={{ display: 'flex' }}>
          <Tabs
            activeKey={section}
            items={sections}
            onChange={(key) => {
              const next = DEVICE_SECTIONS.find((candidate) => candidate === key);
              if (next) setSection(next);
            }}
          />
          <Input.Search
            allowClear
            placeholder="Search system code, business, device, or screen mode"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ maxWidth: 460 }}
          />
          {devices.length === 0 && !loading ? (
            <EmptyState
              title="No registered or activated demo devices"
              description="Registered POS systems and activated demo systems will appear here."
            />
          ) : (
            <Table<DeviceRecord>
              rowKey="systemCode"
              columns={columns}
              dataSource={filteredDevices}
              loading={loading}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              scroll={{ x: 1250 }}
              onRow={(device) => ({
                onClick: () => openDevice(device),
                style: { cursor: 'pointer' },
              })}
              locale={{ emptyText: 'No devices match this section.' }}
            />
          )}
        </Space>
      </Card>

      <Drawer
        title={selectedDevice ? `Device · ${selectedDevice.systemCode}` : 'Device Details'}
        open={Boolean(selectedDevice)}
        onClose={closeDevice}
        width={680}
      >
        {selectedDevice && (
          <Space direction="vertical" size={22} style={{ display: 'flex' }}>
            <section>
              <Title level={5}>Device and Registration</Title>
              <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
                <Descriptions.Item label="Business / Requester">{selectedDevice.businessName}</Descriptions.Item>
                <Descriptions.Item label="POS Username">{selectedDevice.username || '—'}</Descriptions.Item>
                <Descriptions.Item label="System Code"><code>{selectedDevice.systemCode}</code></Descriptions.Item>
                <Descriptions.Item label="Device Type">{selectedDevice.isRegistered ? 'Registered' : 'Demo Activated'}</Descriptions.Item>
                <Descriptions.Item label={selectedDevice.isRegistered ? 'License Number' : 'License'}>
                  {selectedDevice.isRegistered && selectedDevice.licenseNumber
                    ? <code>{selectedDevice.licenseNumber}</code>
                    : licenseLabel(selectedDevice)}
                </Descriptions.Item>
                <Descriptions.Item label="Activated Mode">
                  <Tag color={selectedDevice.isRegistered ? 'green' : 'blue'}>
                    {selectedDevice.isRegistered ? 'Licensed' : 'Demo'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Software Edition">{selectedDevice.appVersion}</Descriptions.Item>
                <Descriptions.Item label="Registration Status">
                  <Tag color={selectedDevice.registrationStatus === 'active' ? 'green' : selectedDevice.registrationStatus === 'pending_activation' ? 'orange' : 'default'}>
                    {registrationLabel(selectedDevice.registrationStatus)}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Device Status">
                  <Tag color={statusColor(deviceStatus)}>{deviceStatus}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="System Access">
                  <Tag color={selectedDevice.blocked ? 'red' : 'green'}>
                    {selectedDevice.blocked ? 'Blocked' : 'Allowed'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Registered On">{formatDate(selectedDevice.registeredAt)}</Descriptions.Item>
                <Descriptions.Item label="First Activated On">
                  {formatDate(
                    selectedDevice.firstActivatedAt ||
                    selectedDevice.activatedAt ||
                    selectedDevice.demoRequest?.firstActivatedAt ||
                    selectedDevice.demoRequest?.redeemedAt
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Demo Expiration">{formatDate(selectedDevice.demoRequest?.expiresAt)}</Descriptions.Item>
                <Descriptions.Item label="Last Login">
                  {formatDate(activity?.lastLoggedInAt || selectedDevice.demoRequest?.lastLoggedInAt)}
                </Descriptions.Item>
              </Descriptions>
            </section>

            <section>
              <Title level={5}><Laptop size={16} style={{ marginRight: 8 }} />Hardware Profile</Title>
              <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
                <Descriptions.Item label="Manufacturer">{selectedHardware?.deviceManufacturer || '—'}</Descriptions.Item>
                <Descriptions.Item label="Model">{selectedHardware?.deviceModel || '—'}</Descriptions.Item>
                <Descriptions.Item label="Hostname">{selectedHardware?.hostname || selectedSystemInfo?.hostname || '—'}</Descriptions.Item>
                <Descriptions.Item label="Operating System">
                  {selectedHardware?.osCaption || selectedHardware?.osPlatform || selectedSystemInfo?.osPlatform || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="OS Release">
                  {selectedHardware?.osRelease || selectedSystemInfo?.osRelease || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Architecture">{selectedSystemInfo?.architecture || '—'}</Descriptions.Item>
                <Descriptions.Item label="Processor">{selectedHardware?.cpuModel || selectedSystemInfo?.cpuModel || '—'}</Descriptions.Item>
                <Descriptions.Item label="CPU Cores">
                  {selectedHardware?.cpuCores || selectedSystemInfo?.cpuCores || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Memory">
                  {selectedHardware?.totalMemoryGb || selectedSystemInfo?.totalMemoryGb
                    ? `${selectedHardware?.totalMemoryGb || selectedSystemInfo?.totalMemoryGb} GB`
                    : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="BIOS Serial">{selectedHardware?.biosSerial || '—'}</Descriptions.Item>
              </Descriptions>
            </section>

            <section>
              <Title level={5}>Device Actions</Title>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {!selectedDevice.isRegistered && selectedDevice.demoRequest?.keyUsed && (
                  <Button
                    type="primary"
                    size="small"
                    block
                    icon={<Plus size={14} />}
                    style={{ flex: '1 1 155px' }}
                    onClick={() => {
                      const demoRequest = selectedDevice.demoRequest;
                      if (!demoRequest) return;
                      setRegisterDeviceTarget({
                        systemCode: selectedDevice.systemCode,
                        demoRequestId: demoRequest.id,
                      });
                    }}
                  >
                    Register this Device
                  </Button>
                )}
                <div style={{ flex: '1 1 155px' }}>
                  <Popconfirm
                    title={selectedDevice.blocked ? 'Unblock this system code?' : 'Block this system code?'}
                    description={
                      selectedDevice.blocked
                        ? 'This device will be allowed to sign in again.'
                        : 'This device will be prevented from signing in.'
                    }
                    okText={selectedDevice.blocked ? 'Unblock' : 'Block'}
                    cancelText="Cancel"
                    okButtonProps={{ danger: !selectedDevice.blocked, loading: blockBusy }}
                    onConfirm={() => void toggleSelectedDeviceBlock()}
                  >
                    <Button
                      type={selectedDevice.blocked ? 'primary' : 'default'}
                      size="small"
                      block
                      danger={!selectedDevice.blocked}
                      loading={blockBusy}
                      disabled={blockBusy}
                    >
                      {selectedDevice.blocked ? 'Unblock System Code' : 'Block System Code'}
                    </Button>
                  </Popconfirm>
                </div>
                <Button
                  type={loginHistoryOpen ? 'primary' : 'default'}
                  size="small"
                  block
                  icon={<History size={14} />}
                  aria-expanded={loginHistoryOpen}
                  style={{ flex: '1 1 155px' }}
                  loading={activityLoading}
                  onClick={() => setLoginHistoryOpen((open) => !open)}
                >
                  {loginHistoryOpen ? 'Hide Login History' : 'View Login History'}
                </Button>
                <Button
                  type={deviceHistoryOpen ? 'primary' : 'default'}
                  size="small"
                  block
                  icon={<History size={14} />}
                  aria-expanded={deviceHistoryOpen}
                  style={{ flex: '1 1 190px' }}
                  onClick={() => setDeviceHistoryOpen((open) => !open)}
                >
                  {deviceHistoryOpen ? 'Hide Device & License History' : 'View Device & License History'}
                </Button>
              </div>
              {blockError && <Text type="danger" style={{ display: 'block', marginTop: 8 }}>{blockError}</Text>}
            </section>

            {deviceHistoryOpen && (
              <section>
                <Title level={5}>Device &amp; License History</Title>
                {selectedHistory.length ? (
                  <Timeline
                    items={selectedHistory.map((entry) => ({
                      color: entry.color,
                      content: (
                        <div>
                          <Space size={8} wrap>
                            <Text strong>{entry.title}</Text>
                            {entry.mode && (
                              <Tag color={entry.mode === 'Licensed' ? 'green' : 'blue'}>
                                {entry.mode}
                              </Tag>
                            )}
                          </Space>
                          <div style={{ color: '#64748b', fontSize: 12 }}>
                            {formatDate(entry.at)}
                            {entry.details ? ` · ${entry.details}` : ''}
                          </div>
                        </div>
                      ),
                    }))}
                  />
                ) : (
                  <Text type="secondary">No device or license history has been recorded.</Text>
                )}
              </section>
            )}

            {loginHistoryOpen && (
              <section>
                <Title level={5}><Activity size={16} style={{ marginRight: 8 }} />Login History</Title>
                {activityLoading ? (
                  <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>
                ) : activityError ? (
                  <Text type="danger">{activityError}</Text>
                ) : activity ? (
                  <>
                    <Space size={18} wrap style={{ marginBottom: 12 }}>
                      <Text><Clock3 size={14} style={{ marginRight: 5 }} />{activity.totalLogins} logins</Text>
                      <Text><Cpu size={14} style={{ marginRight: 5 }} />{activity.totalStatusChecks} status checks</Text>
                      <Text>Traffic: {formatBytes(activity.networkBytesReceived + activity.networkBytesSent)}</Text>
                    </Space>
                    {activity.recentLogins.length ? (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {activity.recentLogins.map((login) => (
                          <Card key={login.id} size="small" bodyStyle={{ padding: '10px 12px' }}>
                            <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
                              <div>
                                <Text strong>{formatDate(login.loggedInAt)}</Text>
                                <div style={{ color: '#64748b', fontSize: 12 }}>
                                  {login.systemInfo?.hostname || 'Unknown device'}
                                  {login.systemInfo?.osPlatform ? ` · ${login.systemInfo.osPlatform}` : ''}
                                </div>
                              </div>
                              <Text type="secondary">
                                {formatBytes(login.networkBytesReceived + login.networkBytesSent)}
                              </Text>
                            </Space>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={History}
                        title="No login history"
                        description="No login events have been recorded for this device."
                      />
                    )}
                    {activity.recentLogins.length >= 50 && (
                      <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 11 }}>
                        Showing the latest 50 login events.
                      </Text>
                    )}
                  </>
                ) : !activityLoading ? (
                  <Text type="secondary">No activity data is available for this device.</Text>
                ) : null}
              </section>
            )}
          </Space>
        )}
      </Drawer>

      <RegisterDeviceModal
        open={Boolean(registerDeviceTarget)}
        onClose={() => setRegisterDeviceTarget(null)}
        demoRequests={demoRequests}
        onLoadLicenses={onLoadRegistrationLicenses}
        onRegister={async (input) => {
          const result = await onRegisterDevice({
            ...input,
            ...(registerDeviceTarget?.demoRequestId
              ? { demoRequestId: registerDeviceTarget.demoRequestId }
              : {}),
          });
          if (result.convertedFromDemo) closeDevice();
          return result;
        }}
        initialSystemCode={registerDeviceTarget?.systemCode}
        demoRequestId={registerDeviceTarget?.demoRequestId}
      />
    </div>
  );
};
