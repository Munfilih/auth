import React from 'react';
import { Tag } from 'antd';
import { CheckCircle2, Clock, AlertCircle, XCircle, ShieldCheck, UserCheck } from 'lucide-react';

export type StatusType =
  | 'active'
  | 'pending_activation'
  | 'approved'
  | 'rejected'
  | 'pending'
  | 'demo'
  | 'current'
  | 'cashier'
  | 'custom'
  | 'disabled';

interface StatusBadgeProps {
  status: StatusType | string;
  label?: string;
  size?: 'small' | 'middle';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, size = 'middle' }) => {
  const normalized = status?.toLowerCase() || '';

  let color = 'default';
  let icon: React.ReactNode = null;
  let displayLabel = label || status;

  switch (normalized) {
    case 'active':
    case 'registered':
      color = 'success';
      icon = <CheckCircle2 size={13} style={{ marginRight: 4, verticalAlign: -2 }} />;
      displayLabel = label || 'Active';
      break;
    case 'approved':
      color = 'success';
      icon = <CheckCircle2 size={13} style={{ marginRight: 4, verticalAlign: -2 }} />;
      displayLabel = label || 'Approved';
      break;
    case 'pending_activation':
      color = 'warning';
      icon = <Clock size={13} style={{ marginRight: 4, verticalAlign: -2 }} />;
      displayLabel = label || 'Pending Activation';
      break;
    case 'pending':
      color = 'processing';
      icon = <Clock size={13} style={{ marginRight: 4, verticalAlign: -2 }} />;
      displayLabel = label || 'Pending';
      break;
    case 'rejected':
      color = 'error';
      icon = <XCircle size={13} style={{ marginRight: 4, verticalAlign: -2 }} />;
      displayLabel = label || 'Rejected';
      break;
    case 'disabled':
      color = 'error';
      icon = <AlertCircle size={13} style={{ marginRight: 4, verticalAlign: -2 }} />;
      displayLabel = label || 'Disabled';
      break;
    case 'demo':
      color = 'purple';
      icon = <ShieldCheck size={13} style={{ marginRight: 4, verticalAlign: -2 }} />;
      displayLabel = label || 'Demo';
      break;
    case 'current':
      color = 'blue';
      icon = <UserCheck size={13} style={{ marginRight: 4, verticalAlign: -2 }} />;
      displayLabel = label || 'Current';
      break;
    default:
      color = 'default';
      displayLabel = label || status;
      break;
  }

  return (
    <Tag
      color={color}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: size === 'small' ? '0 6px' : '2px 8px',
        fontWeight: 500,
        textTransform: 'capitalize',
        margin: 0,
      }}
    >
      {icon}
      <span>{displayLabel}</span>
    </Tag>
  );
};
