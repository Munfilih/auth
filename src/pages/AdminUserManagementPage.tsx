import React from 'react';
import { Alert, Card, Col, Row, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ShieldCheck, ShieldX, UserRound } from 'lucide-react';
import type { DefaultCredentialAuditRecord } from '../types';

const { Title, Text } = Typography;

interface AdminUserManagementPageProps {
  adminUsername: string;
  records: DefaultCredentialAuditRecord[];
  loading: boolean;
  error: string;
}

function checkedAtLabel(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export const AdminUserManagementPage: React.FC<AdminUserManagementPageProps> = ({
  adminUsername,
  records,
  loading,
  error,
}) => {
  const defaultCount = records.filter((record) => record.defaultAdminCredentialsInUse === true).length;
  const customCount = records.filter((record) => record.defaultAdminCredentialsInUse === false).length;
  const notReportedCount = records.filter((record) => record.defaultAdminCredentialsInUse === null).length;

  const columns: ColumnsType<DefaultCredentialAuditRecord> = [
    {
      title: 'System Code',
      dataIndex: 'systemCode',
      key: 'systemCode',
      render: (systemCode: string) => <Text strong>{systemCode}</Text>,
    },
    {
      title: 'Business / Mode',
      key: 'business',
      render: (_, record) => (
        <div>
          <div>{record.businessName}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.systemType === 'registered'
              ? record.registrationStatus === 'pending_activation'
                ? 'Registered · Pending activation'
                : 'Registered'
              : 'Demo / unregistered'}
          </Text>
        </div>
      ),
    },
    {
      title: 'Credential Status',
      dataIndex: 'defaultAdminCredentialsInUse',
      key: 'credentialStatus',
      render: (inUse: boolean | null) => {
        if (inUse === null) return <Tag>Not reported</Tag>;
        return inUse
          ? <Tag color="error">Default credentials in use</Tag>
          : <Tag color="success">Custom credentials</Tag>;
      },
    },
    {
      title: 'Last Checked',
      dataIndex: 'checkedAt',
      key: 'checkedAt',
      render: checkedAtLabel,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Title level={3} style={{ margin: 0 }}>Admin User Management</Title>
        <Text type="secondary">
          Portal admin profile and POS default-credential monitoring.
        </Text>
      </div>

      {error && <Alert type="error" showIcon message="Could not load credential audit" description={error} />}

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card style={{ height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <UserRound size={20} color="#7c3aed" />
              <div>
                <Text type="secondary">Portal administrator</Text>
                <div><Text strong>{adminUsername}</Text></div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card style={{ height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ShieldX size={20} color="#dc2626" />
              <div>
                <Text type="secondary">Using default credentials</Text>
                <div><Text strong>{defaultCount}</Text></div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card style={{ height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ShieldCheck size={20} color="#16a34a" />
              <div>
                <Text type="secondary">Custom / awaiting report</Text>
                <div>
                  <Text strong>{customCount}</Text>
                  <Text type="secondary"> custom · {notReportedCount} not reported</Text>
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <Alert
        type="info"
        showIcon
        message="Read-only credential audit"
        description="POS devices report whether the seeded aptadmin account still uses its default password. The password itself is never sent to or stored by the Admin portal. Devices appear after they check in; offline devices may show an older check time."
      />

      <Card
        title="POS systems"
        extra={<Text type="secondary">{records.length} systems</Text>}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          rowKey="systemCode"
          columns={columns}
          dataSource={records}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{ emptyText: loading ? 'Loading systems…' : 'No POS systems have reported yet.' }}
          scroll={{ x: 700 }}
        />
      </Card>
    </div>
  );
};
