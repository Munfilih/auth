import React, { useEffect, useState } from 'react';
import {
  Drawer,
  Typography,
  Descriptions,
  Space,
  Button,
  Divider,
  Tag,
  Alert,
  Popconfirm,
  Select,
} from 'antd';
import {
  KeyRound,
  CheckCircle,
  XCircle,
  Clock,
  Laptop,
  Activity,
  History,
  Trash2,
  RefreshCw,
  Copy,
} from 'lucide-react';
import type { AppVersion, DemoRequest, DemoScreenType, DemoSystemActivity } from '../types';
import { APP_VERSIONS } from '../types';
import { StatusBadge } from './StatusBadge';

const { Title, Text } = Typography;

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
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

interface DemoRequestDetailDrawerProps {
  open: boolean;
  request: DemoRequest | null;
  activity: DemoSystemActivity | null;
  loadingActivity: boolean;
  activityError: string;
  issuedKey?: string;
  busy: boolean;
  onClose: () => void;
  onApprove: (request: DemoRequest) => Promise<void>;
  onReject: (request: DemoRequest) => Promise<void>;
  onUpdateConfiguration: (
    request: DemoRequest,
    selection: { appVersion: AppVersion; screenType: DemoScreenType }
  ) => Promise<void>;
  onExtend: (request: DemoRequest) => Promise<void>;
  onDeactivate: (request: DemoRequest) => Promise<void>;
  onReactivate: (request: DemoRequest) => Promise<void>;
  onRegenerateKey: (request: DemoRequest) => Promise<void>;
  onChangeExpiry: (request: DemoRequest) => void;
  onDeleteSystemData: (request: DemoRequest) => void;
  onCopyKey: (key: string) => void;
}

export const DemoRequestDetailDrawer: React.FC<DemoRequestDetailDrawerProps> = ({
  open,
  request,
  activity,
  loadingActivity,
  activityError,
  issuedKey,
  busy,
  onClose,
  onApprove,
  onReject,
  onUpdateConfiguration,
  onExtend,
  onDeactivate,
  onReactivate,
  onRegenerateKey,
  onChangeExpiry,
  onDeleteSystemData,
  onCopyKey,
}) => {
  const [appVersion, setAppVersion] = useState<AppVersion>('Standard');
  const [screenType, setScreenType] = useState<DemoScreenType>('pos');

  useEffect(() => {
    if (!request) return;
    setAppVersion(request.appVersion || 'Standard');
    setScreenType(request.screenType || 'pos');
  }, [request?.id, request?.appVersion, request?.screenType]);

  if (!request) return null;

  const hardware = request.hardwareInfo;
  const canEditConfiguration = request.status === 'approved' && !request.registeredSystem;

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: '#f5f3ff',
                color: '#7c3aed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <KeyRound size={18} />
            </div>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                DEMO LICENSE REQUEST
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                {request.requestType === 'extension' ? 'Extension Request' : 'Initial Activation'}
              </span>
            </div>
          </div>
          <StatusBadge
            status={request.status}
            label={request.deactivatedAt ? 'Deactivated' : undefined}
          />
        </div>
      }
      placement="right"
      width={640}
      open={open}
      onClose={onClose}
      destroyOnClose
      extra={
        <Space>
          {request.status === 'pending' && (
            <>
              <Button
                type="primary"
                icon={<CheckCircle size={14} />}
                onClick={() => onApprove(request)}
                loading={busy}
              >
                Approve
              </Button>
              <Popconfirm
                title="Reject demo request?"
                description="Are you sure you want to reject this demo request?"
                onConfirm={() => onReject(request)}
                okText="Reject"
                okButtonProps={{ danger: true }}
                cancelText="Cancel"
              >
                <Button danger icon={<XCircle size={14} />} loading={busy}>
                  Reject
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      }
    >
      {/* Issued Key Banner */}
      {issuedKey && (
        <Alert
          message={request.keyUsed ? 'Current Demo License Key' : 'Demo License Key Ready'}
          description={
            <div style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <code
                  style={{
                    fontSize: 14,
                    padding: '4px 10px',
                    background: '#ffffff',
                    border: '1px solid #c4b5fd',
                    borderRadius: 6,
                    color: '#6d28d9',
                    fontWeight: 700,
                  }}
                >
                  {issuedKey}
                </code>
                <Button
                  size="small"
                  icon={<Copy size={13} />}
                  onClick={() => onCopyKey(issuedKey)}
                >
                  Copy Key
                </Button>
              </div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
                {request.keyUsed
                  ? 'This key was used to activate the current demo system.'
                  : 'Share this key with the applicant to activate aptPOS demo access.'}
              </Text>
            </div>
          }
          type="success"
          showIcon
          style={{ marginBottom: 20, borderRadius: 8 }}
        />
      )}
      {request.status === 'approved' && !issuedKey && (
        <Alert
          message="Demo key is unavailable"
          description="Regenerate the key to create a new copyable key for this system."
          type="info"
          showIcon
          style={{ marginBottom: 20, borderRadius: 8 }}
        />
      )}

      {/* Summary Section */}
      <Descriptions
        bordered
        size="small"
        column={{ xs: 1, sm: 2 }}
        style={{ marginBottom: 20 }}
      >
        <Descriptions.Item label="System Code">
          <code style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>
            {request.systemCode}
          </code>
        </Descriptions.Item>
        <Descriptions.Item label="Requested By">
          <strong>{request.requestedBy}</strong>
        </Descriptions.Item>
        <Descriptions.Item label="Request Type">
          <Tag color={request.requestType === 'extension' ? 'orange' : 'blue'}>
            {request.requestType === 'extension' ? 'Extension' : 'Initial Activation'}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Software Version">
          {canEditConfiguration ? (
            <Select<AppVersion>
              value={appVersion}
              onChange={setAppVersion}
              options={APP_VERSIONS.map((version) => ({ value: version, label: version }))}
              style={{ width: '100%' }}
            />
          ) : (
            request.appVersion || '—'
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Screen Type">
          {canEditConfiguration ? (
            <Select<DemoScreenType>
              value={screenType}
              onChange={setScreenType}
              options={[
                { value: 'pos', label: 'POS — Standard Retail' },
                { value: 'rpos', label: 'RPOS — Restaurant & Café' },
              ]}
              style={{ width: '100%' }}
            />
          ) : request.screenType === 'rpos' ? (
            'RPOS — Restaurant & Café'
          ) : request.screenType === 'pos' ? (
            'POS — Standard Retail'
          ) : (
            '—'
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Requested At">
          {formatDate(request.requestedAt)}
        </Descriptions.Item>
        <Descriptions.Item label="Expires At">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{formatDate(request.expiresAt)}</span>
            {request.status === 'approved' && !request.registeredSystem && (
              <Button
                type="link"
                size="small"
                style={{ padding: 0 }}
                onClick={() => onChangeExpiry(request)}
              >
                Change
              </Button>
            )}
          </div>
        </Descriptions.Item>
        <Descriptions.Item label="Reviewed At">
          {request.reviewedAt ? formatDate(request.reviewedAt) : 'Pending review'}
        </Descriptions.Item>
      </Descriptions>
      {canEditConfiguration && (
        <div style={{ marginBottom: 20 }}>
          <Button
            type="primary"
            icon={<RefreshCw size={14} />}
            onClick={() => onUpdateConfiguration(request, { appVersion, screenType })}
            loading={busy}
          >
            Update Demo User & Generate Key
          </Button>
          <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
            The new key will appear above, ready to copy and share.
          </Text>
        </div>
      )}

      {/* System Registration Status */}
      <div
        style={{
          padding: '14px 16px',
          background: '#f8fafc',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Text style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', display: 'block' }}>
              System Registration Status
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {request.registeredSystem
                ? `System is registered on ${request.registeredVersion || 'Standard'} edition (${request.registrationStatus === 'pending_activation' ? 'Pending Activation' : 'Active'}).`
                : 'This demo system is not registered as a commercial business.'}
            </Text>
          </div>
        </div>
      </div>

      {/* Hardware Details */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Laptop size={16} color="#7c3aed" />
          <Title level={5} style={{ margin: 0, fontSize: 14 }}>
            Client Machine & Hardware Profile
          </Title>
        </div>

        {hardware ? (
          <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="Device Manufacturer">
              {hardware.deviceManufacturer || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Device Model">
              {hardware.deviceModel || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Operating System">
              {hardware.osCaption || hardware.osPlatform || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Hostname">
              {hardware.hostname || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Processor">
              {hardware.cpuModel || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="CPU Cores">
              {hardware.cpuCores ? `${hardware.cpuCores} cores` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Total Memory">
              {hardware.totalMemoryGb ? `${hardware.totalMemoryGb} GB RAM` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="BIOS Serial">
              <code style={{ fontSize: 11 }}>{hardware.biosSerial || '—'}</code>
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Text type="secondary" style={{ fontSize: 13 }}>
            Hardware telemetry was not provided with this request.
          </Text>
        )}
      </div>

      {/* System Activity & Telemetry */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Activity size={16} color="#7c3aed" />
          <Title level={5} style={{ margin: 0, fontSize: 14 }}>
            System Activity & Telemetry
          </Title>
        </div>

        {loadingActivity ? (
          <Text type="secondary">Loading telemetry activity data...</Text>
        ) : activityError ? (
          <Alert message={activityError} type="error" showIcon style={{ fontSize: 12 }} />
        ) : activity ? (
          <>
            <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Total Logins">
                <strong>{activity.totalLogins}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="Status Checks">
                {activity.totalStatusChecks}
              </Descriptions.Item>
              <Descriptions.Item label="Last Logged In">
                {formatDate(activity.lastLoggedInAt)}
              </Descriptions.Item>
              <Descriptions.Item label="Network Telemetry">
                {formatBytes(activity.networkBytesReceived + activity.networkBytesSent)}
                <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>
                  ({formatBytes(activity.networkBytesReceived)} in / {formatBytes(activity.networkBytesSent)} out)
                </span>
              </Descriptions.Item>
            </Descriptions>

            {activity.recentLogins && activity.recentLogins.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <History size={14} color="#64748b" />
                  <Text style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                    Recent Login History ({activity.recentLogins.length})
                  </Text>
                </div>
                <div
                  style={{
                    maxHeight: 180,
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    background: '#f8fafc',
                    padding: 8,
                  }}
                >
                  {activity.recentLogins.map((login) => (
                    <div
                      key={login.id}
                      style={{
                        padding: '6px 10px',
                        borderBottom: '1px solid #e2e8f0',
                        fontSize: 12,
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <strong>{formatDate(login.loggedInAt)}</strong>
                        {login.systemInfo && (
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            {login.systemInfo.hostname} · {login.systemInfo.osPlatform}
                          </div>
                        )}
                      </div>
                      <span style={{ color: '#64748b', fontSize: 11 }}>
                        {formatBytes(login.networkBytesReceived + login.networkBytesSent)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <Text type="secondary" style={{ fontSize: 13 }}>
            No activity telemetry recorded yet.
          </Text>
        )}
      </div>

      <Divider style={{ margin: '16px 0' }} />

      {/* Dangerous & Management Actions */}
      <div>
        <Text style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 12 }}>
          License Actions
        </Text>

        <Space wrap orientation="horizontal" size={8}>
          {request.status === 'rejected' && request.deactivatedAt && (
            <Popconfirm
              title="Reactivate Demo?"
              description="This restores the demo request and creates a new activation key."
              onConfirm={() => onReactivate(request)}
              okText="Reactivate"
              cancelText="Cancel"
            >
              <Button
                type="primary"
                icon={<CheckCircle size={14} />}
                onClick={(event) => event.stopPropagation()}
                loading={busy}
              >
                Reactivate Demo
              </Button>
            </Popconfirm>
          )}
          {request.status === 'approved' && (
            <>
              <Button
                icon={<Clock size={14} />}
                onClick={() => onExtend(request)}
                loading={busy}
              >
                Extend Demo (+Days)
              </Button>

              <Popconfirm
                title="Regenerate Demo Key?"
                description="This issues a new demo key and invalidates previously generated unredeemed keys."
                onConfirm={() => onRegenerateKey(request)}
                okText="Regenerate"
                cancelText="Cancel"
              >
                <Button icon={<RefreshCw size={14} />} loading={busy}>
                  Regenerate Key
                </Button>
              </Popconfirm>

              <Popconfirm
                title="Deactivate Demo License?"
                description="The user will immediately lose demo access on this system."
                onConfirm={() => onDeactivate(request)}
                okText="Deactivate"
                okButtonProps={{ danger: true }}
                cancelText="Cancel"
              >
                <Button danger loading={busy}>
                  Deactivate Demo
                </Button>
              </Popconfirm>
            </>
          )}

          <Button
            danger
            type="dashed"
            icon={<Trash2 size={14} />}
            onClick={() => onDeleteSystemData(request)}
            loading={busy}
          >
            Delete System Data
          </Button>
        </Space>
      </div>
    </Drawer>
  );
};
