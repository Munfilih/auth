import React, { useState } from 'react';
import {
  Card,
  Descriptions,
  Button,
  Space,
  Table,
  Modal,
  Input,
  Select,
  Tag,
  Popconfirm,
  Typography,
  message,
  Alert,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeft,
  Copy,
  Pencil,
  Trash2,
  Plus,
  Building2,
  KeyRound,
  ShieldCheck,
  ArrowUpDown,
  CalendarClock,
  Pause,
  Play,
  Minus,
} from 'lucide-react';
import type {
  AppVersion,
  RegisteredBusinessDetails,
  RegisteredBusinessSystemCode,
  UpdateRegisteredBusinessAmcInput,
  UpdateRegisteredBusinessInput,
} from '../types';
import { APP_VERSIONS } from '../types';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { BusinessEditModal } from '../components/BusinessEditModal';

const { Text } = Typography;

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatAmcDate(value: string | null | undefined): string {
  if (!value) return 'Not covered';
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

interface BusinessDetailPageProps {
  business: RegisteredBusinessDetails;
  busy: boolean;
  onBack: () => void;
  onUpdateBusiness: (input: UpdateRegisteredBusinessInput) => Promise<void>;
  onUpdateBusinessVersion: (appVersion: AppVersion) => Promise<void>;
  onUpdateAmc: (input: UpdateRegisteredBusinessAmcInput) => Promise<void>;
  onSetBusinessHold: (onHold: boolean) => Promise<void>;
  onAdjustDeviceSlots: (action: 'add' | 'remove') => Promise<void>;
  onAddSystemCode: (code: string) => Promise<void>;
  onChangeSystemCode: (currentCode: string, newCode: string) => Promise<void>;
  onRemoveSystemCode: (code: string) => Promise<void>;
}

export const BusinessDetailPage: React.FC<BusinessDetailPageProps> = ({
  business,
  busy,
  onBack,
  onUpdateBusiness,
  onUpdateBusinessVersion,
  onUpdateAmc,
  onSetBusinessHold,
  onAdjustDeviceSlots,
  onAddSystemCode,
  onChangeSystemCode,
  onRemoveSystemCode,
}) => {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<AppVersion>(business.appVersion);
  const [versionError, setVersionError] = useState('');
  const [amcModalOpen, setAmcModalOpen] = useState(false);
  const [amcStartDate, setAmcStartDate] = useState('');
  const [amcEndDate, setAmcEndDate] = useState('');
  const [amcNotes, setAmcNotes] = useState('');
  const [amcError, setAmcError] = useState('');
  const [addCodeModalOpen, setAddCodeModalOpen] = useState(false);
  const [newCodeInput, setNewCodeInput] = useState('');
  const [changeCodeModalOpen, setChangeCodeModalOpen] = useState(false);
  const [currentCodeTarget, setCurrentCodeTarget] = useState('');
  const [changeCodeInput, setChangeCodeInput] = useState('');

  const [removeCodeModalOpen, setRemoveCodeModalOpen] = useState(false);
  const [codeToRemove, setCodeToRemove] = useState('');
  const [removeConfirmInput, setRemoveConfirmInput] = useState('');

  const handleCopyDetails = async () => {
    try {
      const details = [
        `Business Name: ${business.businessName}`,
        `Address: ${business.address}`,
        `Mobile: ${business.mobileNumber}`,
        `Version: ${business.appVersion}`,
        `System Code(s): ${business.systemCodes.map((s) => s.systemCode).join(', ')}`,
        `Username: ${business.username}`,
        ...(business.password ? [`Password: ${business.password}`] : []),
        ...(business.licenseKey ? [`License Key: ${business.licenseKey}`] : []),
      ].join('\n');

      await navigator.clipboard.writeText(details);
      message.success('Registration details copied to clipboard');
    } catch {
      message.error('Failed to copy to clipboard');
    }
  };

  const handleToggleBusinessHold = async () => {
    try {
      await onSetBusinessHold(!business.onHold);
      message.success(business.onHold ? 'Business license resumed.' : 'Business license placed on hold.');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to update license status.');
    }
  };

  const handleAdjustSlots = async (action: 'add' | 'remove') => {
    try {
      await onAdjustDeviceSlots(action);
      message.success(action === 'add' ? 'Device slot added.' : 'Device slot removed.');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to update device slots.');
    }
  };

  const handleCopyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      message.success('License key copied to clipboard');
    } catch {
      message.error('Failed to copy license key');
    }
  };

  const handleAddCodeSubmit = async () => {
    if (!newCodeInput.trim()) return;
    await onAddSystemCode(newCodeInput.trim().toUpperCase());
    setNewCodeInput('');
    setAddCodeModalOpen(false);
  };

  const handleChangeCodeSubmit = async () => {
    if (!changeCodeInput.trim() || !currentCodeTarget) return;
    await onChangeSystemCode(currentCodeTarget, changeCodeInput.trim().toUpperCase());
    setChangeCodeInput('');
    setCurrentCodeTarget('');
    setChangeCodeModalOpen(false);
  };

  const handleConfirmRemoveCode = async () => {
    if (removeConfirmInput.trim().toUpperCase() !== codeToRemove.trim().toUpperCase()) {
      message.error('Confirmation code does not match');
      return;
    }
    await onRemoveSystemCode(codeToRemove);
    setCodeToRemove('');
    setRemoveConfirmInput('');
    setRemoveCodeModalOpen(false);
  };

  const openVersionModal = () => {
    setSelectedVersion(business.appVersion);
    setVersionError('');
    setVersionModalOpen(true);
  };

  const handleVersionChange = async () => {
    if (selectedVersion === business.appVersion) {
      setVersionModalOpen(false);
      return;
    }
    try {
      await onUpdateBusinessVersion(selectedVersion);
      setVersionModalOpen(false);
      message.success(`Business version changed to ${selectedVersion}.`);
    } catch (error) {
      setVersionError(error instanceof Error ? error.message : 'Failed to change business version.');
    }
  };

  const openAmcModal = () => {
    setAmcStartDate(business.amcStartDate || '');
    setAmcEndDate(business.amcEndDate || '');
    setAmcNotes(business.amcNotes || '');
    setAmcError('');
    setAmcModalOpen(true);
  };

  const handleAmcSave = async () => {
    if (Boolean(amcStartDate) !== Boolean(amcEndDate)) {
      setAmcError('Enter both AMC dates or clear both dates to remove coverage.');
      return;
    }
    if (amcStartDate && amcEndDate && amcStartDate > amcEndDate) {
      setAmcError('AMC end date must be on or after the start date.');
      return;
    }
    try {
      await onUpdateAmc({
        amcStartDate: amcStartDate || null,
        amcEndDate: amcEndDate || null,
        amcNotes: amcNotes.trim(),
      });
      setAmcModalOpen(false);
      message.success('AMC details updated.');
    } catch (error) {
      setAmcError(error instanceof Error ? error.message : 'Failed to save AMC details.');
    }
  };

  const systemCodeColumns: ColumnsType<RegisteredBusinessSystemCode> = [
    {
      title: 'Terminal System Code',
      dataIndex: 'systemCode',
      key: 'systemCode',
      render: (code: string) => (
        <code style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>{code}</code>
      ),
    },
    {
      title: 'Terminal Status',
      dataIndex: 'status',
      key: 'status',
      width: 180,
      render: (status: string) => <StatusBadge status={status} size="small" />,
    },
    {
      title: 'Registered On',
      dataIndex: 'registeredAt',
      key: 'registeredAt',
      render: (date: string | null) => (
        <span style={{ fontSize: 12, color: '#64748b' }}>{formatDate(date)}</span>
      ),
    },
    {
      title: 'Activated On',
      dataIndex: 'activatedAt',
      key: 'activatedAt',
      render: (date: string | null) => (
        <span style={{ fontSize: 12, color: '#64748b' }}>{formatDate(date)}</span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      align: 'right',
      render: (_: unknown, record: RegisteredBusinessSystemCode) => {
        if (business.legacy) return null;
        return (
          <Space size={6}>
            <Button
              type="text"
              size="small"
              icon={<Pencil size={13} />}
              onClick={() => {
                setCurrentCodeTarget(record.systemCode);
                setChangeCodeInput(record.systemCode);
                setChangeCodeModalOpen(true);
              }}
              disabled={busy}
            >
              Change
            </Button>
            <Button
              type="text"
              size="small"
              danger
              icon={<Trash2 size={13} />}
              onClick={() => {
                setCodeToRemove(record.systemCode);
                setRemoveConfirmInput('');
                setRemoveCodeModalOpen(true);
              }}
              disabled={busy}
            >
              Remove
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title={business.businessName}
        subtitle={`${business.appVersion} Edition · Registered ${formatDate(business.registeredAt)}`}
        icon={Building2}
        breadcrumbItems={[
          { title: 'Dashboard', href: '#' },
          { title: 'Registered Businesses', onClick: onBack },
          { title: business.businessName },
        ]}
        extra={
          <Space wrap>
            <Button icon={<ArrowLeft size={14} />} onClick={onBack}>
              Back to List
            </Button>
            <Button icon={<Copy size={14} />} onClick={handleCopyDetails}>
              Copy Full Details
            </Button>
            {!business.legacy && (
              <>
                <Button
                  icon={<ArrowUpDown size={14} />}
                  onClick={openVersionModal}
                  disabled={busy}
                >
                  Upgrade / Downgrade Version
                </Button>
                <Button
                  icon={<CalendarClock size={14} />}
                  onClick={openAmcModal}
                  disabled={busy}
                >
                  Change AMC Details
                </Button>
                <Button
                  type="primary"
                  icon={<Pencil size={14} />}
                  onClick={() => setEditModalOpen(true)}
                  disabled={busy}
                >
                  Edit Business
                </Button>
                <Popconfirm
                  title={business.onHold ? 'Resume this license?' : 'Place this license on hold?'}
                  description={
                    business.onHold
                      ? 'Linked POS systems will regain access to this license.'
                      : 'All linked POS systems will be blocked from using this license until it is resumed.'
                  }
                  onConfirm={handleToggleBusinessHold}
                  okText={business.onHold ? 'Resume License' : 'Hold License'}
                  okButtonProps={business.onHold ? undefined : { danger: true }}
                  cancelText="Cancel"
                >
                  <Button
                    danger={!business.onHold}
                    icon={business.onHold ? <Play size={14} /> : <Pause size={14} />}
                    disabled={busy}
                  >
                    {business.onHold ? 'Unhold License' : 'Hold License'}
                  </Button>
                </Popconfirm>
              </>
            )}
          </Space>
        }
      />

      {/* Legacy Notice */}
      {business.legacy && (
        <Card
          style={{
            marginBottom: 20,
            background: '#fffbeb',
            borderColor: '#fef3c7',
            borderRadius: 10,
          }}
          bodyStyle={{ padding: '12px 18px' }}
        >
          <Text style={{ color: '#92400e', fontSize: 13, fontWeight: 500 }}>
            Note: This is a legacy registration imported from the previous registry. Its core properties are read-only.
          </Text>
        </Card>
      )}

      {/* License Key Hero Banner */}
      <Card
        style={{
          borderRadius: 12,
          border: '1px solid #ddd6fe',
          background: 'linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%)',
          marginBottom: 20,
          boxShadow: '0 2px 8px rgba(124, 58, 237, 0.05)',
        }}
        bodyStyle={{ padding: '20px 24px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <KeyRound size={18} color="#7c3aed" />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                aptPOS License Key
              </span>
              <StatusBadge status={business.status} size="small" />
              {business.onHold && <Tag color="red" style={{ margin: 0 }}>On Hold</Tag>}
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 12 }}>
              <code
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#6d28d9',
                  letterSpacing: '0.06em',
                  background: '#ffffff',
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: '1px solid #c4b5fd',
                }}
              >
                {business.licenseKey || 'Legacy registration (No license key assigned)'}
              </code>
              {business.licenseKey && (
                <Button
                  size="small"
                  icon={<Copy size={13} />}
                  onClick={() => handleCopyKey(business.licenseKey!)}
                >
                  Copy Key
                </Button>
              )}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 12, color: '#64748b', display: 'block' }}>
              Activated in aptPOS Settings:
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
              {business.activatedAt ? formatDate(business.activatedAt) : 'Pending first POS activation'}
            </span>
          </div>
        </div>
      </Card>

      {/* Details Grid */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={16} color="#7c3aed" />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Commercial Registration Information</span>
          </div>
        }
        style={{
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          marginBottom: 20,
        }}
        bodyStyle={{ padding: 20 }}
      >
        <Descriptions bordered column={{ xs: 1, sm: 2, lg: 3 }} size="middle">
          <Descriptions.Item label="Business Name">
            <strong>{business.businessName}</strong>
          </Descriptions.Item>
          <Descriptions.Item label="Software Edition">
            <Tag color="purple" style={{ fontWeight: 600 }}>
              {business.appVersion} Edition
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Contact Mobile">
            {business.mobileNumber || '—'}
          </Descriptions.Item>

          <Descriptions.Item label="Physical Address" span={{ xs: 1, sm: 2, lg: 3 }}>
            {business.address || '—'}
          </Descriptions.Item>

          <Descriptions.Item label="Primary POS Username">
            <code>{business.username}</code>
          </Descriptions.Item>
          <Descriptions.Item label="Primary Password">
            {business.password ? <code>{business.password}</code> : <span style={{ color: '#94a3b8' }}>••••••••</span>}
          </Descriptions.Item>
          <Descriptions.Item label="Registered Date">
            {formatDate(business.registeredAt)}
          </Descriptions.Item>
          <Descriptions.Item label="AMC Start Date">
            {formatAmcDate(business.amcStartDate)}
          </Descriptions.Item>
          <Descriptions.Item label="AMC Expiry Date">
            {formatAmcDate(business.amcEndDate)}
          </Descriptions.Item>
          <Descriptions.Item label="AMC Notes" span={{ xs: 1, sm: 2, lg: 3 }}>
            {business.amcNotes?.trim() || '—'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Linked Terminal System Codes */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 600, display: 'block' }}>
                Authorized Terminal System Codes ({business.systemCodes.length})
              </span>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>
                Allowed slots: {business.systemLimit} · Used: {business.systemCodes.length} · Available: {Math.max(0, business.systemLimit - business.systemCodes.length)}
              </span>
            </div>
            {!business.legacy && (
              <Space wrap size={6}>
                <Popconfirm
                  title="Remove one device slot?"
                  description="The license will have one fewer available device slot."
                  onConfirm={() => handleAdjustSlots('remove')}
                  okText="Remove Slot"
                  okButtonProps={{ danger: true }}
                  cancelText="Cancel"
                >
                  <Button
                    size="small"
                    icon={<Minus size={14} />}
                    disabled={busy || business.systemLimit <= Math.max(1, business.systemCodes.length)}
                  >
                    Remove Slot
                  </Button>
                </Popconfirm>
                <Button
                  size="small"
                  icon={<Plus size={14} />}
                  onClick={() => void handleAdjustSlots('add')}
                  disabled={busy || business.systemLimit >= Number.MAX_SAFE_INTEGER}
                >
                  Add Slot
                </Button>
                <Button
                  type="primary"
                  size="small"
                  icon={<Plus size={14} />}
                  onClick={() => {
                    setNewCodeInput('');
                    setAddCodeModalOpen(true);
                  }}
                  disabled={busy || business.systemCodes.length >= business.systemLimit || business.onHold}
                >
                  Add System Code
                </Button>
              </Space>
            )}
          </div>
        }
        style={{
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        }}
        bodyStyle={{ padding: 0 }}
      >
        <Table<RegisteredBusinessSystemCode>
          dataSource={business.systemCodes}
          columns={systemCodeColumns}
          rowKey="systemCode"
          pagination={false}
          size="middle"
          locale={{ emptyText: 'No terminal system codes registered yet' }}
        />
      </Card>

      {/* Edit Business Modal */}
      <BusinessEditModal
        open={editModalOpen}
        business={business}
        busy={busy}
        onClose={() => setEditModalOpen(false)}
        onSubmit={async (input) => {
          await onUpdateBusiness(input);
          setEditModalOpen(false);
        }}
      />

      <Modal
        title={`Change Software Version · ${business.businessName}`}
        open={versionModalOpen}
        onOk={() => void handleVersionChange()}
        onCancel={() => setVersionModalOpen(false)}
        confirmLoading={busy}
        okText="Apply Version Change"
        okButtonProps={{ disabled: selectedVersion === business.appVersion }}
        destroyOnClose
      >
        <Space direction="vertical" size={14} style={{ display: 'flex', marginTop: 16 }}>
          <Text type="secondary">
            Changing the edition updates the business license and all linked POS systems.
          </Text>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>Current version</Text>
            <Tag color="purple">{business.appVersion}</Tag>
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>New version</Text>
            <Select<AppVersion>
              value={selectedVersion}
              onChange={setSelectedVersion}
              options={APP_VERSIONS.map((version) => ({ value: version, label: `${version} Edition` }))}
              style={{ width: '100%' }}
            />
          </div>
          {versionError && <Alert type="error" showIcon message={versionError} />}
        </Space>
      </Modal>

      <Modal
        title={`AMC Coverage · ${business.businessName}`}
        open={amcModalOpen}
        onOk={() => void handleAmcSave()}
        onCancel={() => setAmcModalOpen(false)}
        confirmLoading={busy}
        okText="Save AMC Details"
        destroyOnClose
      >
        <Space direction="vertical" size={14} style={{ display: 'flex', marginTop: 16 }}>
          <label>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>Coverage start date</Text>
            <Input type="date" value={amcStartDate} onChange={(event) => setAmcStartDate(event.target.value)} />
          </label>
          <label>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>Coverage end date / renewal date</Text>
            <Input type="date" value={amcEndDate} onChange={(event) => setAmcEndDate(event.target.value)} />
          </label>
          <label>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>Notes</Text>
            <Input.TextArea
              rows={3}
              maxLength={1000}
              showCount
              value={amcNotes}
              onChange={(event) => setAmcNotes(event.target.value)}
              placeholder="Optional service or contract notes"
            />
          </label>
          <Text type="secondary">Clear both dates and save to remove AMC coverage.</Text>
          {amcError && <Alert type="error" showIcon message={amcError} />}
        </Space>
      </Modal>

      {/* Add System Code Modal */}
      <Modal
        title="Add Terminal System Code"
        open={addCodeModalOpen}
        onOk={handleAddCodeSubmit}
        onCancel={() => setAddCodeModalOpen(false)}
        confirmLoading={busy}
        okText="Add Code"
        destroyOnClose
      >
        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
            Enter the 10-digit or standard APT hardware system code for the new POS device.
          </Text>
          <Input
            placeholder="e.g. 1029384756 or APT-XXXX-XXXX-XXXX"
            value={newCodeInput}
            onChange={(e) => setNewCodeInput(e.target.value)}
            onPressEnter={handleAddCodeSubmit}
            autoFocus
          />
        </div>
      </Modal>

      {/* Change System Code Modal */}
      <Modal
        title={`Change System Code: ${currentCodeTarget}`}
        open={changeCodeModalOpen}
        onOk={handleChangeCodeSubmit}
        onCancel={() => setChangeCodeModalOpen(false)}
        confirmLoading={busy}
        okText="Update Code"
        destroyOnClose
      >
        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
            Enter the replacement system code. The new code will be placed in pending activation status.
          </Text>
          <Input
            placeholder="Replacement system code"
            value={changeCodeInput}
            onChange={(e) => setChangeCodeInput(e.target.value)}
            onPressEnter={handleChangeCodeSubmit}
            autoFocus
          />
        </div>
      </Modal>

      {/* Remove System Code Confirmation Modal */}
      <Modal
        title="Confirm Removal of System Code"
        open={removeCodeModalOpen}
        onOk={handleConfirmRemoveCode}
        onCancel={() => setRemoveCodeModalOpen(false)}
        confirmLoading={busy}
        okText="Remove Code"
        okButtonProps={{ danger: true, disabled: removeConfirmInput.trim().toUpperCase() !== codeToRemove.trim().toUpperCase() }}
        destroyOnClose
      >
        <div style={{ marginTop: 12 }}>
          <Text type="danger" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
            This terminal will immediately lose its commercial aptPOS activation!
          </Text>
          <Text style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
            Type <strong style={{ color: '#dc2626' }}>{codeToRemove}</strong> to confirm:
          </Text>
          <Input
            placeholder={codeToRemove}
            value={removeConfirmInput}
            onChange={(e) => setRemoveConfirmInput(e.target.value)}
            onPressEnter={handleConfirmRemoveCode}
            autoFocus
          />
        </div>
      </Modal>
    </div>
  );
};
