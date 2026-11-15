import { Platform } from 'react-native';

export interface DynamicRecord {
  id: string;
  category: string;
  dataJson: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DetaineeSummary {
  id: string;
  jacket_number?: string;
  name?: string;
  age?: string;
  race?: string;
  sex?: string;
  country?: string;
  ice_case_number?: string;
  created_at?: string;
  updated_at?: string;
  detention_id?: string;
  book_date_gcj?: string;
  departure_date?: string;
  cell?: string;
  delivering_agency?: string;
  charge_count?: number;
  charges_summary?: string;
  penpal?: string;
}

export interface DetaineeDetail {
  detainee: Record<string, any>;
  detentions: Record<string, any>[];
  charges: Record<string, any>[];
  legalProceedings: Record<string, any>[];
  correspondence: Record<string, any>[];
}

export interface DashboardStats {
  totalDynamic: number;
  counts: {
    detainees: number;
    detentions: number;
    charges: number;
    legal_proceedings: number;
    correspondence: number;
  };
  currentCount: number;
  releasedCount: number;
  withPenpalCount: number;
  topCountries: [string, number][];
  topAgencies: [string, number][];
  sexDistribution: [string, number][];
  rollups: any[];
}

const API_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://aildata.khanis.workers.dev';

// In-memory fallback for environments without localStorage
const memoryStorage: Record<string, string> = {};

function storageGet(key: string): string | null {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  return memoryStorage[key] || null;
}

function storageSet(key: string, value: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
  } else {
    memoryStorage[key] = value;
  }
}

function storageRemove(key: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.removeItem(key);
  } else {
    delete memoryStorage[key];
  }
}

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedCallback(callback: () => void) {
  unauthorizedHandler = callback;
}

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    logoutUser();
    if (unauthorizedHandler) {
      unauthorizedHandler();
    }
  }

  return response;
}

export async function getSetupStatus(): Promise<{ needsSetup: boolean }> {
  try {
    const res = await fetch(`${API_URL}/api/auth/setup-status`);
    if (!res.ok) return { needsSetup: false };
    return await res.json();
  } catch {
    return { needsSetup: false };
  }
}

export async function inviteUser(email: string, role: string = 'viewer'): Promise<{ success: boolean; inviteToken: string; email: string; role: string; expiresAt: string }> {
  const res = await apiFetch(`${API_URL}/api/auth/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.toLowerCase().trim(), role })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create invitation link');
  return data;
}

export async function validateInvite(token: string): Promise<{ valid: boolean; email?: string; role?: string; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/auth/invite/${encodeURIComponent(token)}`);
    const data = await res.json();
    return data;
  } catch {
    return { valid: false, error: 'Network error validating invitation link' };
  }
}

export async function activateAccount(token: string, password: string): Promise<{ success: boolean; token: string; user: { id: string; email: string; role: string } }> {
  const res = await fetch(`${API_URL}/api/auth/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to activate account');
  if (data.token && data.user) {
    storageSet('aildata_auth_token', data.token);
    storageSet('aildata_user_email', data.user.email);
    storageSet('aildata_user_role', data.user.role);
  }
  return data;
}

export async function registerUser(email: string, password: string, role: string = 'viewer') {
  const currentToken = getAuthToken();
  const res = await apiFetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.toLowerCase().trim(), password, role })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  
  // Only persist to session storage if we are not already logged in (i.e. first-use admin setup)
  if (!currentToken && data.token && data.user) {
    storageSet('aildata_auth_token', data.token);
    storageSet('aildata_user_email', data.user.email);
    storageSet('aildata_user_role', data.user.role);
  }
  return data;
}

export async function loginUser(email: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.toLowerCase().trim(), password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  if (data.token && data.user) {
    storageSet('aildata_auth_token', data.token);
    storageSet('aildata_user_email', data.user.email);
    storageSet('aildata_user_role', data.user.role);
  }
  return data;
}

export function getAuthToken(): string | null {
  return storageGet('aildata_auth_token');
}

export function getAuthUser(): { email: string | null; role: string | null } | null {
  const email = storageGet('aildata_user_email');
  const role = storageGet('aildata_user_role');
  if (email || role) {
    return { email, role };
  }
  return null;
}

export function logoutUser() {
  storageRemove('aildata_auth_token');
  storageRemove('aildata_user_email');
  storageRemove('aildata_user_role');
}

export async function initializeDatabase() {
  // Connected to Cloudflare D1 Edge Worker API
}

export async function insertRecord(category: string, data: Record<string, any>): Promise<string> {
  const res = await apiFetch(`${API_URL}/api/records/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, rows: [data] })
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Failed to insert record');
  return 'rec_api_' + Date.now();
}

export async function insertBatchRecords(category: string, rows: Record<string, any>[]): Promise<number> {
  const res = await apiFetch(`${API_URL}/api/records/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, rows })
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Failed to batch insert records');
  return rows.length;
}

export async function getRecords(category?: string): Promise<DynamicRecord[]> {
  const url = category ? `${API_URL}/api/records?category=${encodeURIComponent(category)}` : `${API_URL}/api/records`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to fetch records from Cloudflare D1 API');
  return await res.json();
}

export async function getDetainees(params?: { search?: string; limit?: number; offset?: number }): Promise<DetaineeSummary[]> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));

  const url = `${API_URL}/api/detainees${query.toString() ? '?' + query.toString() : ''}`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to fetch normalized detainees');
  return await res.json();
}

export async function getDetaineeDetail(id: string): Promise<DetaineeDetail> {
  const res = await apiFetch(`${API_URL}/api/detainees/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('Failed to fetch detainee detail');
  return await res.json();
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await apiFetch(`${API_URL}/api/stats`);
  if (!res.ok) throw new Error('Failed to fetch dashboard stats');
  return await res.json();
}

export async function runRetentionPurge(): Promise<any> {
  const res = await apiFetch(`${API_URL}/api/maintenance/purge`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to run retention purge');
  return data;
}

export async function clearDatabase(): Promise<void> {
  const res = await apiFetch(`${API_URL}/api/records`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to clear database via Cloudflare D1 API');
}

export async function deleteCategoryRecords(category: string): Promise<void> {
  const res = await apiFetch(`${API_URL}/api/records/category/${encodeURIComponent(category)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete category records via Cloudflare D1 API');
}

export async function getTableNames(): Promise<string[]> {
  return ['dynamic_records', 'users', 'detainees', 'detentions', 'charges', 'legal_proceedings', 'correspondence', 'aggregate_rollups'];
}

export function getStorageMode(): string {
  return 'Cloudflare D1 (Serverless Edge)';
}
