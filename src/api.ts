import type { User } from 'firebase/auth';
import type {
  AppVersion,
  AppUser,
  DefaultCredentialAuditRecord,
  DemoScreenType,
  DemoRequest,
  DemoSystemActivity,
  DeviceRegistrationLicense,
  RegisterDeviceInput,
  RegisterDeviceResult,
  RegisterBusinessInput,
  RegisteredBusiness,
  RegisteredBusinessDetails,
  RegisteredSystem,
  ReviewedDemoRequest,
  UpdateRegisteredBusinessInput,
  UpdateRegisteredBusinessAmcInput,
  UpdateUserInput,
  VersionControlSettings,
  VersionModulePolicy,
} from './types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || '';

async function request<T>(
  path: string,
  user: User,
  options: RequestInit = {}
): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return payload as T;
}

export async function getUsers(user: User): Promise<AppUser[]> {
  return request('/api/admin/users', user);
}

export async function getRegisteredSystems(user: User): Promise<RegisteredSystem[]> {
  return request('/api/admin/registered-systems', user);
}

export async function getDefaultCredentialAudit(user: User): Promise<DefaultCredentialAuditRecord[]> {
  return request('/api/admin/default-credential-audit', user);
}

export async function getRegisteredBusinesses(user: User): Promise<RegisteredBusiness[]> {
  return request('/api/admin/registered-businesses', user);
}

export async function getRegisteredBusinessDetails(
  user: User,
  businessId: string
): Promise<RegisteredBusinessDetails> {
  return request(`/api/admin/registered-businesses/${encodeURIComponent(businessId)}`, user);
}

export async function registerBusiness(
  user: User,
  input: RegisterBusinessInput
): Promise<RegisteredBusinessDetails> {
  return request('/api/admin/registered-businesses', user, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getDeviceRegistrationLicenses(user: User): Promise<DeviceRegistrationLicense[]> {
  return request('/api/admin/device-registration/licenses', user);
}

export async function registerDevice(
  user: User,
  input: RegisterDeviceInput
): Promise<RegisterDeviceResult> {
  return request('/api/admin/devices/register', user, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateRegisteredBusiness(
  user: User,
  businessId: string,
  input: UpdateRegisteredBusinessInput
): Promise<RegisteredBusinessDetails> {
  return request(`/api/admin/registered-businesses/${encodeURIComponent(businessId)}`, user, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function updateRegisteredBusinessVersion(
  user: User,
  businessId: string,
  appVersion: AppVersion
): Promise<{ appVersion: AppVersion }> {
  return request(`/api/admin/registered-businesses/${encodeURIComponent(businessId)}/version`, user, {
    method: 'PATCH',
    body: JSON.stringify({ appVersion }),
  });
}

export async function setRegisteredBusinessHold(
  user: User,
  businessId: string,
  onHold: boolean
): Promise<{ onHold: boolean }> {
  return request(`/api/admin/registered-businesses/${encodeURIComponent(businessId)}/hold`, user, {
    method: 'PATCH',
    body: JSON.stringify({ onHold }),
  });
}

export async function adjustRegisteredBusinessDeviceSlots(
  user: User,
  businessId: string,
  action: 'add' | 'remove'
): Promise<{ systemLimit: number; registeredSystemCount: number }> {
  return request(
    `/api/admin/registered-businesses/${encodeURIComponent(businessId)}/device-slots`,
    user,
    {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    }
  );
}

export async function updateRegisteredBusinessAmc(
  user: User,
  businessId: string,
  input: UpdateRegisteredBusinessAmcInput
): Promise<UpdateRegisteredBusinessAmcInput> {
  return request(`/api/admin/registered-businesses/${encodeURIComponent(businessId)}/amc`, user, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function addRegisteredSystemCode(
  user: User,
  businessId: string,
  systemCode: string
): Promise<void> {
  await request(`/api/admin/registered-businesses/${encodeURIComponent(businessId)}/system-codes`, user, {
    method: 'POST',
    body: JSON.stringify({ systemCode }),
  });
}

export async function changeRegisteredSystemCode(
  user: User,
  businessId: string,
  currentSystemCode: string,
  systemCode: string
): Promise<void> {
  await request(`/api/admin/registered-businesses/${encodeURIComponent(businessId)}/system-codes`, user, {
    method: 'PATCH',
    body: JSON.stringify({ currentSystemCode, systemCode }),
  });
}

export async function removeRegisteredSystemCode(
  user: User,
  businessId: string,
  systemCode: string
): Promise<void> {
  await request(
    `/api/admin/registered-businesses/${encodeURIComponent(businessId)}/system-codes/${encodeURIComponent(systemCode)}`,
    user,
    { method: 'DELETE' }
  );
}

export async function updateUser(
  user: User,
  uid: string,
  input: UpdateUserInput
): Promise<AppUser> {
  return request(`/api/admin/users/${encodeURIComponent(uid)}`, user, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteUser(user: User, uid: string): Promise<void> {
  await request(`/api/admin/users/${encodeURIComponent(uid)}`, user, { method: 'DELETE' });
}

export async function getDemoRequests(user: User): Promise<DemoRequest[]> {
  return request('/api/admin/demo-requests', user);
}

export async function getDemoSystemActivity(
  user: User,
  requestId: string
): Promise<DemoSystemActivity> {
  return request(`/api/admin/demo-requests/${encodeURIComponent(requestId)}/activity`, user);
}

export async function getDeviceActivity(
  user: User,
  systemCode: string
): Promise<DemoSystemActivity> {
  return request(`/api/admin/devices/${encodeURIComponent(systemCode)}/activity`, user);
}

export async function getBlockedSystemCodes(user: User): Promise<string[]> {
  const result = await request<{ blockedSystemCodes: string[] }>('/api/admin/devices/blocks', user);
  return result.blockedSystemCodes;
}

export async function blockDeviceSystem(user: User, systemCode: string): Promise<void> {
  await request(`/api/admin/devices/${encodeURIComponent(systemCode)}/block`, user, {
    method: 'POST',
  });
}

export async function unblockDeviceSystem(user: User, systemCode: string): Promise<void> {
  await request(`/api/admin/devices/${encodeURIComponent(systemCode)}/block`, user, {
    method: 'DELETE',
  });
}

export async function updateDeviceScreenType(
  user: User,
  systemCode: string,
  screenType: DemoScreenType
): Promise<{ systemCode: string; screenType: DemoScreenType }> {
  return request(`/api/admin/devices/${encodeURIComponent(systemCode)}/screen-type`, user, {
    method: 'PATCH',
    body: JSON.stringify({ screenType }),
  });
}

export async function convertDemoSystemToRegistered(
  user: User,
  requestId: string,
  input: { appVersion: AppVersion; username: string; password: string }
): Promise<{ systemCode: string; appVersion: AppVersion; username: string; registrationKey: string }> {
  return request(`/api/admin/demo-requests/${encodeURIComponent(requestId)}/convert`, user, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateDemoRequestExpiry(
  user: User,
  requestId: string,
  expiresAt: string
): Promise<{ systemCode: string; expiresAt: string }> {
  return request(`/api/admin/demo-requests/${encodeURIComponent(requestId)}/expiry`, user, {
    method: 'PATCH',
    body: JSON.stringify({ expiresAt }),
  });
}

export async function updateDemoRequestConfiguration(
  user: User,
  requestId: string,
  selection: { appVersion: AppVersion; screenType: DemoScreenType }
): Promise<{ request: DemoRequest; demoKey: string }> {
  return request(`/api/admin/demo-requests/${encodeURIComponent(requestId)}/configuration`, user, {
    method: 'PATCH',
    body: JSON.stringify(selection),
  });
}

export async function deleteDemoSystemData(
  user: User,
  requestId: string
): Promise<{
  systemCode: string;
  deletedRequests: number;
  deletedRequestIds: string[];
  deletedKeyClaims: number;
  deletedLicenses: number;
  deletedRegisteredSystems: number;
  deletedLoginEvents: number;
  deletedTelemetryRecords: number;
  authAccountsDeleted: number;
}> {
  return request(`/api/admin/demo-requests/${encodeURIComponent(requestId)}/system-data`, user, {
    method: 'DELETE',
  });
}

export async function reviewDemoRequest(
  user: User,
  id: string,
  status: 'approved' | 'rejected',
  selection?: { appVersion: AppVersion; screenType: DemoScreenType }
): Promise<ReviewedDemoRequest> {
  return request(`/api/admin/demo-requests/${encodeURIComponent(id)}`, user, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...selection }),
  });
}

export async function regenerateDemoRequestKey(user: User, id: string): Promise<{ demoKey: string }> {
  return request(`/api/admin/demo-requests/${encodeURIComponent(id)}/key`, user, {
    method: 'POST',
  });
}

export async function getDemoRequestKey(
  user: User,
  id: string
): Promise<{ demoKey: string | null }> {
  return request(`/api/admin/demo-requests/${encodeURIComponent(id)}/key`, user);
}

export async function deactivateDemoRequest(user: User, id: string): Promise<{ request: DemoRequest }> {
  return request(`/api/admin/demo-requests/${encodeURIComponent(id)}/deactivate`, user, {
    method: 'POST',
  });
}

export async function reactivateDemoRequest(
  user: User,
  id: string
): Promise<{ request: DemoRequest; demoKey: string }> {
  return request(`/api/admin/demo-requests/${encodeURIComponent(id)}/reactivate`, user, {
    method: 'POST',
  });
}

export async function extendDemoRequest(
  user: User,
  id: string,
  days = 2
): Promise<{ request: DemoRequest; newExpiresAt: string; demoKey?: string }> {
  return request(`/api/admin/demo-requests/${encodeURIComponent(id)}/extend`, user, {
    method: 'POST',
    body: JSON.stringify({ days }),
  });
}

export async function getVersionControlSettings(
  user: User
): Promise<VersionControlSettings> {
  return request('/api/admin/version-control', user);
}

export async function updateVersionControlSettings(
  user: User,
  allowedModules: VersionModulePolicy
): Promise<VersionControlSettings> {
  return request('/api/admin/version-control', user, {
    method: 'PUT',
    body: JSON.stringify({ allowedModules }),
  });
}
