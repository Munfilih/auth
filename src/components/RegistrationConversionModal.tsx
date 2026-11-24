import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, Alert, Typography } from 'antd';
import type { AppVersion, DemoRequest } from '../types';
import { APP_VERSIONS } from '../types';

const { Text } = Typography;

interface RegistrationConversionModalProps {
  open: boolean;
  request: DemoRequest | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    appVersion: AppVersion;
    username: string;
    password: string;
  }) => Promise<void>;
}

export const RegistrationConversionModal: React.FC<RegistrationConversionModalProps> = ({
  open,
  request,
  busy,
  onClose,
  onSubmit,
}) => {
  const [form] = Form.useForm();
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (request && open) {
      form.setFieldsValue({
        appVersion: 'Standard',
        username: request.requestedBy || '',
        password: '',
      });
      setError('');
    }
  }, [request, open, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setError('');
      await onSubmit({
        appVersion: values.appVersion as AppVersion,
        username: values.username.trim(),
        password: values.password,
      });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Conversion failed.');
    }
  };

  return (
    <Modal
      title={
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            System Registration
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
            Convert Demo to Registered: {request?.systemCode}
          </div>
        </div>
      }
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={busy}
      okText={busy ? 'Converting...' : 'Convert & Generate License'}
      cancelText="Cancel"
      destroyOnClose
      width={480}
    >
      <Text type="secondary" style={{ display: 'block', fontSize: 13, marginBottom: 16 }}>
        Choose an aptPOS version and create the owner credentials for system code{' '}
        <code style={{ color: '#7c3aed', fontWeight: 600 }}>{request?.systemCode}</code>.
        The permanent license registration key will be generated upon completion.
      </Text>

      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError('')}
        />
      )}

      <Form form={form} layout="vertical" disabled={busy}>
        <Form.Item
          name="appVersion"
          label="Registered Software Version"
          rules={[{ required: true }]}
        >
          <Select>
            {APP_VERSIONS.map((v) => (
              <Select.Option key={v} value={v}>
                {v} Edition
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="username"
          label="Primary POS Username"
          rules={[
            { required: true, message: 'Please enter a username' },
            { min: 3, max: 32, message: 'Between 3 and 32 characters' },
          ]}
        >
          <Input placeholder="POS username" />
        </Form.Item>

        <Form.Item
          name="password"
          label="Primary POS Password"
          rules={[
            { required: true, message: 'Please enter a password' },
            { min: 8, message: 'Minimum 8 characters' },
          ]}
        >
          <Input.Password placeholder="••••••••" />
        </Form.Item>
      </Form>
    </Modal>
  );
};
