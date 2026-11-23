import type { User } from 'firebase/auth';
import type {
  ActivationRequest,
  AppUser,
  CreateUserInput,
  DemoRequest,
  DemoSystemActivity,
  ReviewedDemoRequest,
  UpdateUserInput,
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

export async function createUser(user: User, input: CreateUserInput): Promise<AppUser> {
  return request('/api/admin/users', user, {
    method: 'POST',
    body: JSON.stringify(input),
  });
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

export async function getActivationRequests(user: User): Promise<ActivationRequest[]> {
  return request('/api/admin/activation-requests', user);
}

export async function createActivationRequest(
  user: User,
  input: { userId: string; appVersion: string; note: string }
): Promise<ActivationRequest> {
  return request('/api/admin/activation-requests', user, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function reviewActivationRequest(
  user: User,
  id: string,
  status: 'approved' | 'rejected'
): Promise<ActivationRequest> {
  return request(`/api/admin/activation-requests/${encodeURIComponent(id)}`, user, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
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

export async function deleteDemoSystemData(
  user: User,
  requestId: string
): Promise<{
  systemCode: string;
  deletedRequests: number;
  deletedRequestIds: string[];
  deletedKeyClaims: number;
  deletedLicenses: number;
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
  status: 'approved' | 'rejected'
): Promise<ReviewedDemoRequest> {
  return request(`/api/admin/demo-requests/${encodeURIComponent(id)}`, user, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function regenerateDemoRequestKey(user: User, id: string): Promise<{ demoKey: string }> {
  return request(`/api/admin/demo-requests/${encodeURIComponent(id)}/key`, user, {
    method: 'POST',
  });
}

export async function deactivateDemoRequest(user: User, id: string): Promise<{ request: DemoRequest }> {
  return request(`/api/admin/demo-requests/${encodeURIComponent(id)}/deactivate`, user, {
    method: 'POST',
  });
}

export async function extendDemoRequest(
  user: User,
  id: string,
  days = 2
): Promise<{ request: DemoRequest; newExpiresAt: string }> {
  return request(`/api/admin/demo-requests/${encodeURIComponent(id)}/extend`, user, {
    method: 'POST',
    body: JSON.stringify({ days }),
  });
}
