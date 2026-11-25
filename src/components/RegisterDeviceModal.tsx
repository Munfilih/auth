import React, { useEffect, useState } from 'react';
import { Alert, AutoComplete, Button, Form, Input, Modal, Select, Space, Tag, Typography, message } from 'antd';
import type {
  DemoScreenType,
  DemoRequest,
  DeviceRegistrationLicense,
  RegisterDeviceInput,
  RegisterDeviceResult,
} from '../types';

const { Text } = Typography;

interface RegisterDeviceModalProps {
  open: boolean;
  onClose: () => void;
  demoRequests: DemoRequest[];
  onLoadLicenses: () => Promise<DeviceRegistrationLicense[]>;
  onRegister: (input: RegisterDeviceInput) => Promise<RegisterDeviceResult>;
  initialSystemCode?: string;
  initialScreenType?: DemoScreenType;
  demoRequestId?: string;
}

export const RegisterDeviceModal: React.FC<RegisterDeviceModalProps> = ({
  open,
  onClose,
  demoRequests = [],
  onLoadLicenses,
  onRegister,
  initialSystemCode,
  initialScreenType,
  demoRequestId,
}) => {
  const [form] = Form.useForm<RegisterDeviceInput>();
  const [licenses, setLicenses] = useState<DeviceRegistrationLicense[]>([]);
  const [licensesLoading, setLicensesLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const unavailableDemoCodes = new Set(
    demoRequests
      .filter((request) => request.convertedToRegistered || request.registeredSystem)
      .map((request) => request.systemCode.trim().toUpperCase())
  );
  const demoRequestByCode = new Map<string, DemoRequest>();
  [...demoRequests]
    .filter((request) =>
      request.status === 'approved' &&
      request.keyUsed &&
      !request.convertedToRegistered &&
      !request.registeredSystem &&
      !unavailableDemoCodes.has(request.systemCode.trim().toUpperCase())
    )
    .sort((left, right) =>
      (right.redeemedAt || right.reviewedAt || right.requestedAt || '')
        .localeCompare(left.redeemedAt || left.reviewedAt || left.requestedAt || '')
    )
    .forEach((request) => {
      const code = request.systemCode.trim().toUpperCase();
      if (code && !demoRequestByCode.has(code)) demoRequestByCode.set(code, request);
    });
  const demoSystemOptions = [...demoRequestByCode.entries()].map(([systemCode, request]) => ({
    value: systemCode,
    label: (
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Text strong>{systemCode}</Text>
        <Text type="secondary">
          {request.requestedBy} · {request.requestType === 'extension' ? 'Demo extension' : 'Demo'}
        </Text>
      </Space>
    ),
  }));

  useEffect(() => {
    if (!open) return;
    let active = true;
    form.resetFields();
    form.setFieldsValue({
      ...(initialSystemCode ? { systemCode: initialSystemCode } : {}),
      screenType: initialScreenType || 'pos',
    });
    setLicenses([]);
    setErrorMessage('');
    setLicensesLoading(true);
    void onLoadLicenses()
      .then((result) => {
        if (active) setLicenses(result);
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not load active license keys.');
        }
      })
      .finally(() => {
        if (active) setLicensesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [form, initialScreenType, initialSystemCode, onLoadLicenses, open]);

  const handleSubmit = async (input: RegisterDeviceInput) => {
    setRegistering(true);
    setErrorMessage('');
    try {
      const systemCode = input.systemCode.trim().toUpperCase();
      const matchedDemoRequest = demoRequestByCode.get(systemCode);
      const result = await onRegister({
        ...input,
        systemCode,
        ...((demoRequestId || matchedDemoRequest?.id)
          ? { demoRequestId: demoRequestId || matchedDemoRequest?.id }
          : {}),
      });
      message.success(
        result.convertedFromDemo
          ? `Demo access ended. Device ${result.systemCode} is assigned to the commercial license. Enter the license key in aptPOS to activate.`
          : `Device ${result.systemCode} registered. Enter its license key in aptPOS to activate.`
      );
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not register this device.');
    } finally {
      setRegistering(false);
    }
  };

  const availableLicenses = licenses.filter((license) => license.availableSlots > 0).length;

  return (
    <Modal
      title="Register Device"
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnClose
    >
      <Text type="secondary">
        Assign a system code and screen mode to a commercial license with an available device slot.
      </Text>

      {errorMessage && (
        <Alert
          message={errorMessage}
          type="error"
          showIcon
          closable
          onClose={() => setErrorMessage('')}
          style={{ marginTop: 16 }}
        />
      )}

      {!licensesLoading && !errorMessage && availableLicenses === 0 && (
        <Alert
          message="No license keys have available system slots."
          description="Register a business with additional system capacity, or remove a registered device from a license."
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
        />
      )}

      <Form<RegisterDeviceInput>
        form={form}
        layout="vertical"
        initialValues={{ screenType: 'pos' }}
        onFinish={(values) => void handleSubmit(values)}
        style={{ marginTop: 20 }}
      >
        <Form.Item
          name="systemCode"
          label="System Code"
          extra={demoRequestByCode.size
            ? 'Type a system code to find a matching activated demo device.'
            : undefined}
          normalize={(value: string) => value.toUpperCase()}
          rules={[
            { required: true, message: 'Enter the device system code.' },
            {
              pattern: /^(?:\d{10}|APT(?:-[A-Z0-9]{4}){5})$/i,
              message: 'Enter a valid 10-digit or APT system code.',
            },
          ]}
        >
          <AutoComplete
            options={demoSystemOptions}
            filterOption={(inputValue, option) =>
              String(option?.value || '').toUpperCase().includes(inputValue.trim().toUpperCase())
            }
            onSelect={(value) => {
              const request = demoRequestByCode.get(value.trim().toUpperCase());
              if (request?.screenType) form.setFieldValue('screenType', request.screenType);
            }}
            notFoundContent={demoSystemOptions.length ? 'No matching demo system codes' : null}
          >
            <Input
              maxLength={28}
              readOnly={Boolean(initialSystemCode)}
              placeholder="e.g. 1029384756 or APT-XXXX-XXXX-XXXX-XXXX-XXXX"
            />
          </AutoComplete>
        </Form.Item>

        <Form.Item
          name="screenType"
          label="Screen Mode"
          rules={[{ required: true, message: 'Choose a screen mode.' }]}
        >
          <Select
            options={[
              { value: 'pos', label: 'POS' },
              { value: 'rpos', label: 'RPOS' },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="businessId"
          label="Commercial License Key"
          rules={[{ required: true, message: 'Choose a license key.' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            loading={licensesLoading}
            placeholder="Search and choose an active license key"
            notFoundContent={licensesLoading ? 'Loading license keys…' : 'No license keys found'}
          >
            {licenses.map((license) => {
              const hasSlot = license.availableSlots > 0;
              return (
                <Select.Option
                  key={license.businessId}
                  value={license.businessId}
                  label={`${license.businessName} ${license.licenseKey}`}
                  disabled={!hasSlot}
                >
                  <Space style={{ width: '100%', justifyContent: 'space-between' }} align="center">
                    <div>
                      <Text strong style={{ display: 'block', color: hasSlot ? '#059669' : '#dc2626' }}>
                        {license.licenseKey}
                      </Text>
                      <Text type="secondary">
                        {license.businessName} · {license.appVersion} · {license.registeredSystemCount}/{license.systemLimit} systems
                      </Text>
                    </div>
                    <Tag color={hasSlot ? 'green' : 'red'}>
                      {hasSlot ? `${license.availableSlots} slot${license.availableSlots === 1 ? '' : 's'} available` : 'Full'}
                    </Tag>
                  </Space>
                </Select.Option>
              );
            })}
          </Select>
        </Form.Item>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button onClick={onClose} disabled={registering}>Cancel</Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={registering}
            disabled={licensesLoading || availableLicenses === 0}
          >
            Register Device
          </Button>
        </div>
      </Form>
    </Modal>
  );
};
