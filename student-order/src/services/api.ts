import type { Branch, MenuItem, StudentOrderPayload } from '../types';

const BASE = '/api/public';

let csrfToken = '';

export async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(`${BASE}/csrf-token`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch CSRF token');
  const data = await res.json() as { csrfToken: string };
  csrfToken = data.csrfToken;
  return csrfToken;
}

export function getCsrfToken(): string {
  return csrfToken;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken
    },
    credentials: 'include',
    body: JSON.stringify(body)
  });
  const data = await res.json() as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data;
}

export async function getPublicBranches(): Promise<Branch[]> {
  const res = await fetch(`${BASE}/branches`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load branches');
  return res.json() as Promise<Branch[]>;
}

export async function getStudentMenu(branchId?: string): Promise<MenuItem[]> {
  const url = branchId
    ? `${BASE}/student-menu?branchId=${encodeURIComponent(branchId)}`
    : `${BASE}/student-menu`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load menu');
  return res.json() as Promise<MenuItem[]>;
}

export async function initSession(branchId: string): Promise<string> {
  const data = await postJson<{ sessionId: string }>(`${BASE}/self-service/session`, { branchId });
  return data.sessionId;
}

export async function createStudentOrder(payload: StudentOrderPayload): Promise<{ orderId: string }> {
  return postJson<{ orderId: string }>(`${BASE}/student-orders`, payload);
}
