import React from 'react';
import { Breadcrumb, Typography, Space } from 'antd';
import type { LucideIcon } from 'lucide-react';

const { Title, Text } = Typography;

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  eyebrow?: string;
  breadcrumbItems?: Array<{ title: React.ReactNode; href?: string; onClick?: () => void }>;
  extra?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  eyebrow,
  breadcrumbItems,
  extra,
}) => {
  return (
    <div className="page-header" style={{ marginBottom: 20 }}>
      {breadcrumbItems && breadcrumbItems.length > 0 && (
        <Breadcrumb
          style={{ marginBottom: 8, fontSize: 12 }}
          items={breadcrumbItems.map((item) => ({
            title: item.onClick ? (
              <a
                onClick={(e) => {
                  e.preventDefault();
                  item.onClick?.();
                }}
                style={{ cursor: 'pointer' }}
              >
                {item.title}
              </a>
            ) : item.href ? (
              <a href={item.href}>{item.title}</a>
            ) : (
              item.title
            ),
          }))}
        />
      )}

      <div
        className="page-header-main"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div className="page-header-title-block" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {Icon && (
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
                color: '#7c3aed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #ddd6fe',
                flexShrink: 0,
              }}
            >
              <Icon size={22} />
            </div>
          )}
          <div>
            {eyebrow && (
              <Text
                type="secondary"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#7c3aed',
                  display: 'block',
                  marginBottom: 2,
                }}
              >
                {eyebrow}
              </Text>
            )}
            <Title level={2} style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>
              {title}
            </Title>
            {subtitle && (
              <Text type="secondary" style={{ fontSize: 13, marginTop: 2, display: 'block' }}>
                {subtitle}
              </Text>
            )}
          </div>
        </div>

        {extra && <Space className="page-header-extra" wrap size={10}>{extra}</Space>}
      </div>
    </div>
  );
};
