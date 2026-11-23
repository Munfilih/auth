export type AppVersion = 'Soft' | 'Silver' | 'Standard';
export const APP_VERSIONS: AppVersion[] = ['Soft', 'Silver', 'Standard'];

export const APP_MODULES = [
  { id: 'register', label: 'Counter' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'purchase-history', label: 'Purchase History' },
  { id: 'purchase-return-register', label: 'Purchase Returns' },
  { id: 'purchase-return-history', label: 'Purchase Return History' },
  { id: 'customers', label: 'Customers' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'sales', label: 'Sales History' },
  { id: 'return-register', label: 'Sales Returns' },
  { id: 'return-history', label: 'Sales Return History' },
  { id: 'accounts', label: 'Accounts & Cash Book' },
  { id: 'reports', label: 'Reports' },
  { id: 'shift', label: 'Shift' },
  { id: 'files', label: 'Files' },
] as const;

export type AppModuleId = (typeof APP_MODULES)[number]['id'];
export type VersionModulePolicy = Record<AppVersion, AppModuleId[]>;

export interface VersionControlSettings {
  allowedModules: VersionModulePolicy;
  updatedAt: string | null;
}

export interface RegisteredSystem {
  systemCode: string;
  username: string;
  appVersion: AppVersion;
  status: 'pending_activation' | 'active';
  registeredAt: string | null;
  activatedAt: string | null;
}

export type UserType = 'current' | 'demo';
export type UserRole = 'cashier' | 'custom';

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

export type DemoRequestType = 'demo' | 'extension';
export type DemoRequestStatus = 'pending' | 'approved' | 'rejected';

export interface HardwareInfo {
  hostname?: string;
  osPlatform?: string;
  osRelease?: string;
  cpuModel?: string;
  cpuCores?: number;
  totalMemoryGb?: number;
  deviceModel?: string;
  deviceManufacturer?: string;
  osCaption?: string;
  biosSerial?: string;
}

export interface DemoSystemInfo {
  hostname?: string;
  osPlatform?: string;
  osRelease?: string;
  architecture?: string;
  cpuModel?: string;
  cpuCores?: number;
  totalMemoryGb?: number;
}

export interface DemoLoginEvent {
  id: string;
  loggedInAt: string | null;
  networkBytesReceived: number;
  networkBytesSent: number;
  systemInfo?: DemoSystemInfo;
}

export interface DemoSystemActivity {
  systemCode: string;
  lastLoggedInAt: string | null;
  totalLogins: number;
  totalStatusChecks: number;
  networkBytesReceived: number;
  networkBytesSent: number;
  systemInfo?: DemoSystemInfo;
  recentLogins: DemoLoginEvent[];
}

export interface DemoRequest {
  id: string;
  requestType: DemoRequestType;
  systemCode: string;
  requestedBy: string;
  demoKey?: string;
  status: DemoRequestStatus;
  requestedAt: string | null;
  reviewedAt: string | null;
  reviewedBy?: string;
  redeemedAt: string | null;
  expiresAt: string | null;
  lastLoggedInAt: string | null;
  totalLogins: number;
  totalStatusChecks: number;
  networkBytesReceived: number;
  networkBytesSent: number;
  systemInfo?: DemoSystemInfo;
  registeredSystem: boolean;
  registeredVersion?: AppVersion;
  registrationStatus?: 'pending_activation' | 'active';
  keyUsed: boolean;
  hardwareInfo?: HardwareInfo;
}

export interface ReviewedDemoRequest {
  request: DemoRequest;
  demoKey?: string;
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
