import { Platform } from 'react-native';

export interface DynamicRecord {
  id: string;
  category: string;
  dataJson: string;
  createdAt?: string;
  updatedAt?: string;
}

const API_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://aildata.khanis.workers.dev';

export async function registerUser(email: string, password: string, role: string = 'viewer') {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getAuthToken() ? { 'Authorization': `Bearer ${getAuthToken()}` } : {})
    },
    body: JSON.stringify({ email, password, role })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data;
}

export async function loginUser(email: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  if (data.token && typeof localStorage !== 'undefined') {
    localStorage.setItem('aildata_auth_token', data.token);
    localStorage.setItem('aildata_user_email', data.user.email);
    localStorage.setItem('aildata_user_role', data.user.role);
  }
  return data;
}

export function getAuthToken(): string | null {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('aildata_auth_token');
  }
  return null;
}

export function getAuthUser() {
  if (typeof localStorage !== 'undefined') {
    return {
      email: localStorage.getItem('aildata_user_email'),
      role: localStorage.getItem('aildata_user_role')
    };
  }
  return null;
}

export function logoutUser() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('aildata_auth_token');
    localStorage.removeItem('aildata_user_email');
    localStorage.removeItem('aildata_user_role');
  }
}

export async function initializeDatabase() {
  // Connected to Cloudflare D1 Edge Worker API
}

export async function insertRecord(category: string, data: Record<string, any>): Promise<string> {
  const res = await fetch(`${API_URL}/api/records/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getAuthToken() ? { 'Authorization': `Bearer ${getAuthToken()}` } : {})
    },
    body: JSON.stringify({ category, rows: [data] })
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Failed to insert record');
  return 'rec_api_' + Date.now();
}

export async function insertBatchRecords(category: string, rows: Record<string, any>[]): Promise<number> {
  const res = await fetch(`${API_URL}/api/records/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getAuthToken() ? { 'Authorization': `Bearer ${getAuthToken()}` } : {})
    },
    body: JSON.stringify({ category, rows })
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Failed to batch insert records');
  return rows.length;
}

export async function getRecords(category?: string): Promise<DynamicRecord[]> {
  const url = category ? `${API_URL}/api/records?category=${encodeURIComponent(category)}` : `${API_URL}/api/records`;
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error('Failed to fetch records from Cloudflare D1 API');
  return await res.json();
}

export async function clearDatabase(): Promise<void> {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}/api/records`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error('Failed to clear database via Cloudflare D1 API');
}

export async function deleteCategoryRecords(category: string): Promise<void> {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}/api/records/category/${encodeURIComponent(category)}`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error('Failed to delete category records via Cloudflare D1 API');
}

export async function getTableNames(): Promise<string[]> {
  return ['dynamic_records', 'users', 'detainees', 'detentions', 'charges', 'legal_proceedings', 'correspondence'];
}

export function getStorageMode(): string {
  return 'Cloudflare D1 (Serverless Edge)';
}
