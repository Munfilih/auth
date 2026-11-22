export type AppVersion = 'Soft' | 'Silver' | 'Standard';
export type UserType = 'current' | 'demo';
export type UserRole = 'cashier' | 'custom';
export type ActivationStatus = 'pending' | 'approved' | 'rejected';

export interface AppUser {
  uid: string;
  username: string;
  email: string;
  displayName: string;
  role: UserRole;
  userType: UserType;
  disabled: boolean;
  createdAt: string | null;
  appVersion?: AppVersion;
}

export interface ActivationRequest {
  id: string;
  userId: string;
  username: string;
  email: string;
  appVersion: AppVersion;
  status: ActivationStatus;
  note: string;
  requestedAt: string | null;
  reviewedAt: string | null;
  reviewedBy?: string;
}

export interface CreateUserInput {
  username: string;
  email: string;
  displayName: string;
  password: string;
  role: UserRole;
  userType: UserType;
}

export interface UpdateUserInput {
  username: string;
  email: string;
  displayName: string;
  password?: string;
  role: UserRole;
  userType: UserType;
  disabled: boolean;
}
