import React from 'react';
import { Card, Typography } from 'antd';
import type { LucideIcon } from 'lucide-react';

const { Text } = Typography;

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = '#7c3aed',
  iconBg = '#f5f3ff',
  trend,
  onClick,
}) => {
  return (
    <Card
      hoverable={Boolean(onClick)}
      onClick={onClick}
      bodyStyle={{ padding: '16px 20px' }}
      style={{
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            {title}
          </Text>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', lineHeight: 1.2, marginTop: 4 }}>
            {value}
          </div>
          {subtitle && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              {subtitle}
            </div>
          )}
          {trend && (
            <div style={{ fontSize: 11, color: trend.isPositive ? '#10b981' : '#ef4444', marginTop: 4, fontWeight: 500 }}>
              {trend.value}
            </div>
          )}
        </div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            backgroundColor: iconBg,
            color: iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: 16,
            flexShrink: 0,
          }}
        >
          <Icon size={22} />
        </div>
      </div>
    </Card>
  );
};
