export type AppVersion = 'Soft' | 'Silver' | 'Standard';
export const APP_VERSIONS: AppVersion[] = ['Soft', 'Silver', 'Standard'];
export type DemoScreenType = 'pos' | 'rpos';

export const APP_MODULES = [
  { id: 'register', label: 'Counter' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'purchase-history', label: 'Purchase History' },
  { id: 'purchase-return-register', label: 'Purchase Returns' },
  { id: 'purchase-return-history', label: 'Purchase Return History' },
  { id: 'sales-order', label: 'Sales Order' },
  { id: 'sales-quotation', label: 'Sales Quotation' },
  { id: 'purchase-order', label: 'Purchase Order' },
  { id: 'purchase-quotation', label: 'Purchase Quotation' },
  { id: 'goods-delivery', label: 'Goods Delivery' },
  { id: 'goods-receipt', label: 'Goods Receipt' },
  { id: 'customers', label: 'Customers' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'sales', label: 'Sales' },
  { id: 'return-register', label: 'Sales Returns' },
  { id: 'return-history', label: 'Sales Return History' },
  { id: 'accounts', label: 'Accounts & Cash Book' },
  { id: 'reports', label: 'Reports' },
  { id: 'organization-hr', label: 'HR' },
  { id: 'salary-process', label: 'Salary Process' },
  { id: 'shift', label: 'Shift' },
  { id: 'files', label: 'Files' },
  { id: 'settings', label: 'Settings' },
] as const;

export type AppModuleId = (typeof APP_MODULES)[number]['id'];
export type VersionModulePolicy = Record<AppVersion, AppModuleId[]>;

export interface VersionControlSettings {
  allowedModules: VersionModulePolicy;
  updatedAt: string | null;
}

export interface DeviceHistoryEntry {
  event: string;
  at: string | null;
  source?: string;
  businessName?: string;
}

export interface DeviceLicenseHistoryEntry {
  licenseType: 'demo' | 'commercial' | 'registered';
  label: string;
  appVersion: AppVersion;
  assignedAt: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  endedAt: string | null;
}

export interface RegisteredSystem {
  systemCode: string;
  username: string;
  appVersion: AppVersion;
  status: 'pending_activation' | 'active';
  screenType?: DemoScreenType;
  registeredAt: string | null;
  activatedAt: string | null;
  firstActivatedAt: string | null;
  deviceHistory: DeviceHistoryEntry[];
  licenseHistory: DeviceLicenseHistoryEntry[];
}

export interface DefaultCredentialAuditRecord {
  systemCode: string;
  businessName: string;
  systemType: 'registered' | 'unregistered';
  registrationStatus: 'active' | 'pending_activation' | 'unregistered';
  defaultAdminCredentialsInUse: boolean | null;
  checkedAt: string | null;
}

export interface RegisteredBusinessSystemCode {
  systemCode: string;
  status: 'pending_activation' | 'active';
  screenType?: DemoScreenType;
  registeredAt: string | null;
  activatedAt: string | null;
  firstActivatedAt: string | null;
  deviceHistory: DeviceHistoryEntry[];
  licenseHistory: DeviceLicenseHistoryEntry[];
}

export interface RegisteredBusiness {
  id: string;
  businessName: string;
  address: string;
  mobileNumber: string;
  username: string;
  appVersion: AppVersion;
  status: 'pending_activation' | 'active';
  systemLimit: number;
  onHold?: boolean;
  licenseNumber?: string;
  registeredAt: string | null;
  activatedAt: string | null;
  systemCodes: RegisteredBusinessSystemCode[];
  amcStartDate?: string | null;
  amcEndDate?: string | null;
  amcNotes?: string;
  legacy?: boolean;
}

export interface RegisteredBusinessDetails extends RegisteredBusiness {
  licenseKey?: string;
  password?: string;
}

export interface RegisterBusinessInput {
  businessName: string;
  address: string;
  mobileNumber: string;
  appVersion: AppVersion;
  systemLimit: number;
  username: string;
  password: string;
  amcStartDate: string | null;
  amcEndDate: string | null;
}

export interface DeviceRegistrationLicense {
  businessId: string;
  businessName: string;
  appVersion: AppVersion;
  licenseKey: string;
  systemLimit: number;
  registeredSystemCount: number;
  availableSlots: number;
}

export interface RegisterDeviceInput {
  systemCode: string;
  screenType?: DemoScreenType;
  businessId: string;
  demoRequestId?: string;
}

export interface RegisterDeviceResult {
  systemCode: string;
  screenType?: DemoScreenType;
  businessId: string;
  businessName: string;
  availableSlots: number;
  convertedFromDemo?: boolean;
}

export interface UpdateRegisteredBusinessInput {
  businessName: string;
  address: string;
  mobileNumber: string;
  appVersion: AppVersion;
  username: string;
  password?: string;
}

export interface UpdateRegisteredBusinessAmcInput {
  amcStartDate: string | null;
  amcEndDate: string | null;
  amcNotes: string;
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
  status: DemoRequestStatus;
  deactivatedAt: string | null;
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
  appVersion?: AppVersion;
  screenType?: DemoScreenType;
  registrationStatus?: 'pending_activation' | 'active';
  keyUsed: boolean;
  hardwareInfo?: HardwareInfo;
  firstActivatedAt: string | null;
  deviceHistory: DeviceHistoryEntry[];
  licenseHistory: DeviceLicenseHistoryEntry[];
  convertedToRegistered: boolean;
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
