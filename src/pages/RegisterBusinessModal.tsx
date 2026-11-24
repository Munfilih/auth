import React, { useState } from 'react';
import {
  Card,
  Form,
  Modal,
  Input,
  InputNumber,
  Select,
  Button,
  Row,
  Col,
  Typography,
  Descriptions,
  message,
  Alert,
} from 'antd';
import {
  KeyRound,
  CheckCircle2,
  Copy,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import type { AppVersion, RegisterBusinessInput, RegisteredBusinessDetails } from '../types';
import { APP_VERSIONS } from '../types';

const { Text, Title } = Typography;

type AmcSelection = 'one_year' | 'none' | 'custom';

function localDateValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function addOneYear(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const targetYear = year + 1;
  const targetDay = Math.min(day, new Date(Date.UTC(targetYear, month, 0)).getUTCDate());
  return `${targetYear}-${String(month).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

interface RegisterBusinessModalProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onRegister: (input: RegisterBusinessInput) => Promise<RegisteredBusinessDetails>;
  onViewRegisteredBusiness: (business: RegisteredBusinessDetails) => void;
}

export const RegisterBusinessModal: React.FC<RegisterBusinessModalProps> = ({
  open,
  busy,
  onClose,
  onRegister,
  onViewRegisteredBusiness,
}) => {
  const [form] = Form.useForm();
  const [registrationResult, setRegistrationResult] = useState<RegisteredBusinessDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const amcSelection = Form.useWatch('amcSelection', form) as AmcSelection | undefined;

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setErrorMessage('');
      const today = localDateValue();
      const amcEndDate = values.amcSelection === 'one_year'
        ? addOneYear(today)
        : values.amcSelection === 'custom'
          ? values.customAmcEndDate
          : null;
      const result = await onRegister({
        businessName: values.businessName.trim(),
        address: values.address.trim(),
        mobileNumber: values.mobileNumber.trim(),
        appVersion: values.appVersion as AppVersion,
        systemLimit: values.systemLimit,
        username: values.username.trim(),
        password: values.password,
        amcStartDate: amcEndDate ? today : null,
        amcEndDate,
      });
      setRegistrationResult(result);
      message.success('Business successfully registered!');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      setErrorMessage(err instanceof Error ? err.message : 'Registration failed.');
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

  const handleReset = () => {
    form.resetFields();
    setRegistrationResult(null);
    setErrorMessage('');
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <Modal
      title="Register Business"
      open={open}
      onCancel={handleClose}
      width={820}
      footer={null}
      closable={!registrationResult && !busy}
      mask={{ closable: !registrationResult && !busy }}
      keyboard={!registrationResult && !busy}
    >
      {registrationResult ? (
        /* Success State View */
        <Card
          style={{
            maxWidth: 800,
            margin: '0 auto',
            borderRadius: 14,
            border: '1px solid #a7f3d0',
            background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)',
            boxShadow: '0 4px 16px rgba(16, 185, 129, 0.08)',
          }}
          bodyStyle={{ padding: '32px 36px' }}
        >
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                background: '#d1fae5',
                color: '#059669',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <CheckCircle2 size={32} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              REGISTRATION COMPLETE
            </div>
            <Title level={3} style={{ margin: '4px 0 8px 0', color: '#065f46' }}>
              Successfully Registered {registrationResult.businessName}
            </Title>
            <Text type="secondary" style={{ fontSize: 13, maxWidth: 560, display: 'inline-block' }}>
              The aptPOS license key is generated. Register devices from Device Management, then enter this key on each POS to activate it.
            </Text>
          </div>

          {/* License Key Card */}
          {registrationResult.licenseKey && (
            <div
              style={{
                background: '#ffffff',
                border: '2px dashed #34d399',
                borderRadius: 12,
                padding: '20px 24px',
                textAlign: 'center',
                marginBottom: 24,
              }}
            >
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                16-Digit Commercial License Key
              </Text>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
                <code
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: '#047857',
                    letterSpacing: '0.08em',
                  }}
                >
                  {registrationResult.licenseKey}
                </code>
                <Button
                  type="primary"
                  style={{ background: '#059669' }}
                  icon={<Copy size={14} />}
                  onClick={() => handleCopyKey(registrationResult.licenseKey!)}
                >
                  Copy Key
                </Button>
              </div>
            </div>
          )}

          {/* Details Summary */}
          <Descriptions bordered column={{ xs: 1, sm: 2 }} size="middle" style={{ marginBottom: 28, background: '#ffffff', borderRadius: 8 }}>
            <Descriptions.Item label="Business Name">
              <strong>{registrationResult.businessName}</strong>
            </Descriptions.Item>
            <Descriptions.Item label="Edition">
              <span style={{ fontWeight: 600, color: '#7c3aed' }}>{registrationResult.appVersion} Edition</span>
            </Descriptions.Item>
            <Descriptions.Item label="Licensed Systems">
              {registrationResult.systemLimit}
            </Descriptions.Item>
            <Descriptions.Item label="Registered Devices">
              {registrationResult.systemCodes.length}
            </Descriptions.Item>
            <Descriptions.Item label="AMC Coverage">
              {registrationResult.amcStartDate && registrationResult.amcEndDate
                ? `${registrationResult.amcStartDate} – ${registrationResult.amcEndDate}`
                : 'No AMC'}
            </Descriptions.Item>
            <Descriptions.Item label="Mobile Number">
              {registrationResult.mobileNumber}
            </Descriptions.Item>
            <Descriptions.Item label="Primary Username">
              <code>{registrationResult.username}</code>
            </Descriptions.Item>
            <Descriptions.Item label="Initial Password">
              <code>{registrationResult.password || '••••••••'}</code>
            </Descriptions.Item>
            <Descriptions.Item label="Physical Address" span={2}>
              {registrationResult.address}
            </Descriptions.Item>
          </Descriptions>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <Button
              type="primary"
              size="large"
              style={{ background: '#7c3aed', padding: '0 24px' }}
              icon={<ArrowRight size={16} />}
              onClick={() => {
                handleReset();
                onViewRegisteredBusiness(registrationResult);
              }}
            >
              View Registered Business
            </Button>
            <Button size="large" onClick={handleReset} icon={<RotateCcw size={14} />}>
              Register Another Business
            </Button>
          </div>
        </Card>
      ) : (
        /* Form View */
        <Card
          style={{
            maxWidth: 800,
            margin: '0 auto',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
          }}
          bodyStyle={{ padding: '28px 32px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: '#f5f3ff',
                color: '#7c3aed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <KeyRound size={20} />
            </div>
            <div>
              <Title level={4} style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>
                New Business Commercial License
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Enter business profile information and primary login credentials to generate a license key.
              </Text>
            </div>
          </div>

          {errorMessage && (
            <Alert
              message={errorMessage}
              type="error"
              showIcon
              style={{ marginBottom: 20 }}
              closable
              onClose={() => setErrorMessage('')}
            />
          )}

          <Form
            form={form}
            layout="vertical"
            initialValues={{
              appVersion: 'Standard',
              systemLimit: 1,
              businessName: '',
              address: '',
              mobileNumber: '',
              username: '',
              password: '',
              amcSelection: 'none',
            }}
            disabled={busy}
          >
            <Row gutter={16}>
              <Col xs={24} md={16}>
                <Form.Item
                  name="businessName"
                  label="Business Name"
                  rules={[{ required: true, message: 'Please enter the registered business name' }]}
                >
                  <Input placeholder="e.g. Apex Retail Store" maxLength={120} />
                </Form.Item>
              </Col>

              <Col xs={24} md={8}>
                <Form.Item
                  name="appVersion"
                  label="Software Edition"
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
              </Col>
            </Row>

            <Form.Item
              name="address"
              label="Physical Business Address"
              rules={[{ required: true, message: 'Please enter physical address' }]}
            >
              <Input.TextArea rows={2} placeholder="Street, Suite, City, State/Province, Country" maxLength={500} />
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="mobileNumber"
                  label="Contact Phone / Mobile"
                  rules={[{ required: true, message: 'Please enter contact number' }]}
                >
                  <Input placeholder="+1 234 567 8900" />
                </Form.Item>
              </Col>

              <Col xs={24} sm={12}>
                <Form.Item
                  name="systemLimit"
                  label="Number of Systems to Activate"
                  extra="Each licensed POS device uses one system slot."
                  rules={[
                    { required: true, message: 'Enter the number of systems for this license.' },
                    {
                      validator: (_, value) => Number.isSafeInteger(value) && value > 0
                        ? Promise.resolve()
                        : Promise.reject(new Error('Enter a positive whole number of systems.')),
                    },
                  ]}
                >
                  <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="amcSelection"
                  label="AMC"
                  rules={[{ required: true, message: 'Choose an AMC option.' }]}
                >
                  <Select
                    options={[
                      { value: 'one_year', label: '1 year' },
                      { value: 'none', label: 'No AMC' },
                      { value: 'custom', label: 'Custom date' },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>

            {amcSelection === 'custom' && (
              <Form.Item
                name="customAmcEndDate"
                label="AMC End Date"
                extra="AMC coverage starts today and ends on the selected date."
                rules={[{ required: true, message: 'Choose the AMC end date.' }]}
              >
                <Input type="date" min={localDateValue()} />
              </Form.Item>
            )}

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="username"
                  label="Primary Administrator Username"
                  rules={[
                    { required: true, message: 'Please enter primary username' },
                    { min: 1, max: 32, message: 'Between 1 and 32 characters' },
                  ]}
                >
                  <Input placeholder="admin" maxLength={32} />
                </Form.Item>
              </Col>

              <Col xs={24} sm={12}>
                <Form.Item
                  name="password"
                  label="Primary Password"
                  rules={[
                    { required: true, message: 'Please enter password' },
                    { min: 1, max: 128, message: 'Up to 128 characters' },
                  ]}
                >
                  <Input.Password placeholder="••••••••" maxLength={128} />
                </Form.Item>
              </Col>
            </Row>

            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <Button onClick={() => form.resetFields()}>Reset</Button>
              <Button
                type="primary"
                size="large"
                style={{ background: '#7c3aed' }}
                icon={<ShieldCheck size={16} />}
                onClick={handleSubmit}
                loading={busy}
              >
                Register & Issue License Key
              </Button>
            </div>
          </Form>
        </Card>
      )}
    </Modal>
  );
};
