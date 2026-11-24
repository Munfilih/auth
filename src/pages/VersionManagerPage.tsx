import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Checkbox,
  Button,
  Space,
  Typography,
  Alert,
  message,
  Tag,
} from 'antd';
import {
  Settings,
  Save,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import type {
  AppModuleId,
  AppVersion,
  VersionControlSettings,
  VersionModulePolicy,
} from '../types';
import { APP_MODULES, APP_VERSIONS } from '../types';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';

const { Text } = Typography;

interface VersionManagerPageProps {
  settings: VersionControlSettings | null;
  loading: boolean;
  busy: boolean;
  onLoadSettings: () => Promise<void>;
  onSaveSettings: (allowedModules: VersionModulePolicy) => Promise<void>;
}

function moduleLabel(moduleId: AppModuleId): string {
  const module = APP_MODULES.find((m) => m.id === moduleId);
  return module ? module.label : moduleId;
}

export const VersionManagerPage: React.FC<VersionManagerPageProps> = ({
  settings,
  loading,
  busy,
  onLoadSettings,
  onSaveSettings,
}) => {
  const [localPolicy, setLocalPolicy] = useState<VersionModulePolicy>({
    Soft: [],
    Silver: [],
    Standard: [],
  });
  const [saveError, setSaveError] = useState('');
  const [loadAttempted, setLoadAttempted] = useState(false);

  useEffect(() => {
    let active = true;
    void onLoadSettings().finally(() => {
      if (active) setLoadAttempted(true);
    });
    return () => {
      active = false;
    };
  }, [onLoadSettings]);

  useEffect(() => {
    if (settings) {
      setLocalPolicy(settings.allowedModules);
    }
  }, [settings]);

  const loaded = localPolicy;

  const handleModuleToggle = (version: AppVersion, moduleId: AppModuleId) => {
    setSaveError('');
    setLocalPolicy((prev) => {
      const next = { ...prev };
      const current = next[version];
      if (current.includes(moduleId)) {
        next[version] = current.filter((id) => id !== moduleId);
      } else {
        next[version] = [...current, moduleId];
      }
      return next;
    });
  };

  const isModuleEnabled = (version: AppVersion, moduleId: AppModuleId) =>
    loaded[version].includes(moduleId);

  const handleSave = async () => {
    setSaveError('');
    try {
      await onSaveSettings(loaded);
      message.success('Version module policies saved successfully.');
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'Failed to save version settings.';
      setSaveError(messageText);
      message.error(messageText);
    }
  };

  const handleReset = () => {
    setSaveError('');
    if (settings) {
      setLocalPolicy(settings.allowedModules);
    }
  };

  const totalModules = APP_MODULES.length;
  const enabledCounts = useMemo(
    () => ({
      Soft: loaded.Soft.length,
      Silver: loaded.Silver.length,
      Standard: loaded.Standard.length,
    }),
    [loaded]
  );

  if (!settings && (loading || !loadAttempted)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Loading version settings…</span>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <Alert
        type="error"
        showIcon
        message="Version settings could not be loaded."
        description="Module access controls are unavailable until the saved policies load successfully."
        action={
          <Button type="primary" size="small" onClick={() => void onLoadSettings()} loading={loading}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Version Manager"
        subtitle="Control which POS modules are available for each aptPOS edition (Soft, Silver, Standard)."
        eyebrow="Version Control"
        icon={Settings}
        breadcrumbItems={[
          { title: 'Dashboard', href: '#' },
          { title: 'Version Manager' },
        ]}
        extra={
          <Space wrap size={10}>
            <Button
              type="text"
              icon={<ShieldCheck size={14} />}
              onClick={onLoadSettings}
              loading={loading}
              disabled={busy || loading}
              size="small"
            >
              Refresh
            </Button>
            <Button
              type="text"
              danger
              icon={<AlertCircle size={14} />}
              onClick={handleReset}
              disabled={busy || loading}
              size="small"
            >
              Reset
            </Button>
            <Button
              type="primary"
              icon={<Save size={14} />}
              onClick={handleSave}
              loading={busy}
              disabled={busy || loading}
            >
              Save Changes
            </Button>
          </Space>
        }
      />

      {saveError && (
        <Alert message={saveError} type="error" showIcon style={{ marginBottom: 20 }} closable onClose={() => setSaveError('')} />
      )}

      {/* Policy Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {APP_VERSIONS.map((version) => (
          <StatCard
            key={version}
            title={`${version} Edition`}
            value={enabledCounts[version as AppVersion]}
            subtitle={`${enabledCounts[version as AppVersion]} of ${totalModules} modules enabled`}
            icon={ShieldCheck}
            iconColor="#7c3aed"
            iconBg="#f5f3ff"
          />
        ))}
      </div>

      <Card
        title="Current Modules Available by Version"
        style={{ borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 24 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
          {APP_VERSIONS.map((version) => (
            <div
              key={version}
              style={{
                minWidth: 0,
                padding: 16,
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                background: '#f8fafc',
              }}
            >
              <Text strong>{version} Edition</Text>
              <Text type="secondary" style={{ display: 'block', margin: '4px 0 12px', fontSize: 12 }}>
                {loaded[version].length} of {totalModules} modules available
              </Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {loaded[version].length > 0 ? (
                  loaded[version].map((moduleId) => (
                    <Tag key={moduleId} color="purple" style={{ margin: 0 }}>
                      {moduleLabel(moduleId)}
                    </Tag>
                  ))
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>No modules enabled</Text>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Module Matrix */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={16} color="#7c3aed" />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Allowed Modules by Version</span>
          </div>
        }
        style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
        bodyStyle={{ padding: 0 }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', border: '1px solid #cbd5e1', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ textAlign: 'left', padding: '16px 20px', fontWeight: 600, color: '#334155', border: '1px solid #cbd5e1' }}>
                  Module
                </th>
                {APP_VERSIONS.map((version) => (
                  <th
                    key={version}
                    style={{
                      textAlign: 'center',
                      padding: '16px 12px',
                      fontWeight: 600,
                      color: '#334155',
                      border: '1px solid #cbd5e1',
                      background: '#f5f3ff',
                    }}
                  >
                    {version}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {APP_MODULES.map((module) => (
                <tr key={module.id}>
                  <td style={{ padding: '14px 20px', fontWeight: 500, color: '#0f172a', verticalAlign: 'top', border: '1px solid #cbd5e1' }}>
                    {moduleLabel(module.id)}
                  </td>
                  {APP_VERSIONS.map((version) => (
                    <td key={version} style={{ textAlign: 'center', padding: '14px 12px', verticalAlign: 'top', border: '1px solid #cbd5e1' }}>
                      <Checkbox
                        className="version-manager-checkbox"
                        checked={isModuleEnabled(version, module.id)}
                        onChange={() => handleModuleToggle(version, module.id)}
                        disabled={busy || loading}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Help Text */}
      <Card
        style={{ marginTop: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}
        bodyStyle={{ padding: 20 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <AlertCircle size={16} color="#f59e0b" />
          <div>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: 'block' }}>
              How it works
            </Text>
            <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.6 }}>
              Each aptPOS edition (Soft, Silver, Standard) can have its own set of enabled modules. When a POS
              installation checks its license status, the server returns the allowed modules for that system's
              version. Disabled modules are hidden or restricted in the POS client. Changes take effect on the
              next license status check performed by each registered POS system.
            </Text>
          </div>
        </div>
      </Card>
    </div>
  );
};