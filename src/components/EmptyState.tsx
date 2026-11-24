import React from 'react';
import { Button, Typography } from 'antd';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

const { Title, Text } = Typography;

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  style?: React.CSSProperties;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  actionText,
  onAction,
  style,
}) => {
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
        borderRadius: 12,
        ...style,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: '#f8fafc',
          color: '#94a3b8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
          border: '1px solid #e2e8f0',
        }}
      >
        <Icon size={26} strokeWidth={1.5} />
      </div>
      <Title level={4} style={{ margin: '0 0 6px 0', fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
        {title}
      </Title>
      {description && (
        <Text type="secondary" style={{ fontSize: 13, maxWidth: 380, display: 'block', marginBottom: actionText ? 20 : 0 }}>
          {description}
        </Text>
      )}
      {actionText && onAction && (
        <Button type="primary" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
};
