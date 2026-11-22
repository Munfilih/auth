import type { User } from 'firebase/auth';
import type {
  ActivationRequest,
  AppUser,
  CreateUserInput,
  UpdateUserInput,
} from './types';

async function request<T>(
  path: string,
  user: User,
  options: RequestInit = {}
): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(path, {
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

export async function verifyAdmin(user: User): Promise<{ username: string }> {
  return request('/api/admin/session', user);
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
