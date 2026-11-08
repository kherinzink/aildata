import { Platform } from 'react-native';
import { getDatabase } from '../database/db';
import { runMigrations } from '../database/migrations';

export interface DynamicRecord {
  id: string;
  category: string;
  dataJson: string;
  createdAt?: string;
  updatedAt?: string;
}

const API_URL = process.env.EXPO_PUBLIC_API_BASE_URL || '';

export async function registerUser(email: string, password: string, role: string = 'viewer') {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_BASE_URL is not configured');
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data;
}

export async function loginUser(email: string, password: string) {
  if (!API_URL) throw new Error('EXPO_PUBLIC_API_BASE_URL is not configured');
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

// Web localStorage implementation with test1.ods seeded detainee records and high-performance batching
class WebStorage {
  async init() {
    try {
      const storageKey = 'aildata_records_v2';
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        const firstNames = ["ALEX", "JORDAN", "SAM", "MORGAN", "TAYLOR", "CASEY", "RILEY", "JAMIE", "AVERY", "PEYTON", "CHRIS", "PAT", "DREW", "REESE", "SKYLAR", "DAKOTA", "CAMERON", "KENDALL", "QUINN", "REAGAN"];
        const lastNames = ["SMITH", "JOHNSON", "WILLIAMS", "BROWN", "JONES", "GARCIA", "MILLER", "DAVIS", "RODRIGUEZ", "MARTINEZ", "HERNANDEZ", "LOPEZ", "GONZALEZ", "WILSON", "ANDERSON", "THOMAS", "TAYLOR", "MOORE", "JACKSON", "MARTIN"];
        const countries = ["MEXICO", "GUATEMALA", "HONDURAS", "EL SALVADOR", "COLOMBIA", "CUBA", "HAITI", "VENEZUELA", "BRAZIL", "INDIA", "CHINA", "VIETNAM", "PHILIPPINES", "NIGERIA", "KENYA", "UKRAINE", "POLAND", "RUSSIA", "IRAQ", "SOMALIA"];
        const agencies = ["Greene County Jail", "Metro Detention Center", "North Facility", "County Sheriff", "Federal Holding", "District Marshal"];
        const cells = ["A-1", "A-2", "B-1", "B-2", "C-3", "D-4", "E-1", "F-2", "HOLD-1", "SEC-2"];
        const charges = ["Immigration Violation", "Administrative Hold", "Transit Violation", "Border Processing", "Re-entry Violation"];
        const penpals = ["Jane Doe (Friend)", "Mary Smith (Family)", "Support Network Local", "ACLU Volunteer", "Penpal Coalition", "None"];

        const seedRecords: DynamicRecord[] = [];
        for (let i = 0; i < 200; i++) {
          const fn = firstNames[i % firstNames.length];
          const ln = lastNames[(i * 7) % lastNames.length];
          const name = `${fn} ${ln} ${i}`;
          const jacket = String(100000 + i);
          const iceNum = `A${String(200000000 + i)}`;
          const country = countries[(i * 3) % countries.length];
          const agency = agencies[i % agencies.length];
          const cell = cells[i % cells.length];
          const charge = charges[i % charges.length];
          const penpal = penpals[i % penpals.length];
          const age = String(20 + (i % 45));
          const sex = i % 2 === 0 ? "M" : "F";
          const bookDate = `2025-${String((i % 12) + 1).padStart(2, '0')}-15`;
          const depDate = i % 3 === 0 ? `2026-03-${String((i % 28) + 1).padStart(2, '0')}` : "Present";

          seedRecords.push({
            id: `det_${i}_${fn.toLowerCase()}_${ln.toLowerCase()}`,
            category: 'detainee_record',
            dataJson: JSON.stringify({
              "Name (From Jail Tracker)": name,
              "Book Date in GCJ": bookDate,
              "Departure Date": depDate,
              "Jacket Number": jacket,
              "ICE Case Number/A#": iceNum,
              "Cell": cell,
              "Age": age,
              "Race": "H",
              "Sex": sex,
              "Delivering Agency": agency,
              "Country": country,
              "Charges": charge,
              "Penpal": penpal,
              "sorter": String(500 + i)
            }),
            createdAt: new Date(Date.now() - i * 3600000).toISOString(),
            updatedAt: new Date(Date.now() - i * 3600000).toISOString()
          });
        }
        localStorage.setItem(storageKey, JSON.stringify(seedRecords));
      }
    } catch (e) {
      console.error('WebStorage init error:', e);
    }
  }

  async insert(category: string, data: Record<string, any>): Promise<string> {
    const storageKey = 'aildata_records_v2';
    const id = 'rec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const record: DynamicRecord = {
      id,
      category,
      dataJson: JSON.stringify(data),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const existing = await this.getAll();
    existing.unshift(record);
    localStorage.setItem(storageKey, JSON.stringify(existing));
    return id;
  }

  async insertBatch(category: string, rows: Record<string, any>[]): Promise<number> {
    const storageKey = 'aildata_records_v2';
    const existing = await this.getAll();

    const newRecords: DynamicRecord[] = rows.map((row, idx) => ({
      id: `rec_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`,
      category,
      dataJson: JSON.stringify(row),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));

    const updated = [...newRecords, ...existing];
    localStorage.setItem(storageKey, JSON.stringify(updated));
    return newRecords.length;
  }

  async getAll(category?: string): Promise<DynamicRecord[]> {
    try {
      await this.init();
      const storageKey = 'aildata_records_v2';
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const records: DynamicRecord[] = JSON.parse(raw);
      if (category) {
        return records.filter(r => r.category === category);
      }
      return records;
    } catch {
      return [];
    }
  }

  async clear(): Promise<void> {
    const storageKey = 'aildata_records_v2';
    localStorage.removeItem(storageKey);
    await this.init();
  }

  async deleteByCategory(category: string): Promise<void> {
    const storageKey = 'aildata_records_v2';
    const existing = await this.getAll();
    const filtered = existing.filter(r => r.category !== category);
    localStorage.setItem(storageKey, JSON.stringify(filtered));
  }

  async getTables(): Promise<string[]> {
    return ['dynamic_records', 'schema_migrations', 'users', 'detainees', 'detentions', 'charges', 'legal_proceedings', 'correspondence'];
  }
}

export function getStorageMode(): string {
  if (API_URL) return 'Cloudflare D1 (Serverless Edge)';
  return Platform.OS === 'web' ? 'Web Local Cache (Browser)' : 'Native SQLite (expo-sqlite)';
}

const webStorage = new WebStorage();
let isInitialized = false;

export async function initializeDatabase() {
  if (API_URL) {
    isInitialized = true;
    return;
  }
  if (Platform.OS === 'web') {
    await webStorage.init();
    isInitialized = true;
    return;
  }

  if (isInitialized) return;
  const db = await getDatabase();
  await runMigrations(db);
  isInitialized = true;
}

export async function insertRecord(category: string, data: Record<string, any>): Promise<string> {
  if (API_URL) {
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

  if (Platform.OS === 'web') {
    return await webStorage.insert(category, data);
  }

  await initializeDatabase();
  const db = await getDatabase();
  const id = 'rec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const dataJson = JSON.stringify(data);
  
  await db.runAsync(
    'INSERT INTO dynamic_records (id, category, data_json, created_at, updated_at) VALUES (?, ?, ?, datetime("now"), datetime("now"));',
    [id, category, dataJson]
  );
  return id;
}

export async function insertBatchRecords(category: string, rows: Record<string, any>[]): Promise<number> {
  if (API_URL) {
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

  if (Platform.OS === 'web') {
    return await webStorage.insertBatch(category, rows);
  }

  await initializeDatabase();
  const db = await getDatabase();
  
  // Native SQLite batch transaction
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const id = `rec_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 5)}`;
      const dataJson = JSON.stringify(row);
      await db.runAsync(
        'INSERT INTO dynamic_records (id, category, data_json, created_at, updated_at) VALUES (?, ?, ?, datetime("now"), datetime("now"));',
        [id, category, dataJson]
      );
    }
    await db.execAsync('COMMIT;');
    return rows.length;
  } catch (e) {
    await db.execAsync('ROLLBACK;');
    throw e;
  }
}

export async function getRecords(category?: string): Promise<DynamicRecord[]> {
  if (API_URL) {
    const url = category ? `${API_URL}/api/records?category=${encodeURIComponent(category)}` : `${API_URL}/api/records`;
    const headers: Record<string, string> = {};
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('Failed to fetch records from Cloudflare D1 API');
    return await res.json();
  }

  if (Platform.OS === 'web') {
    return await webStorage.getAll(category);
  }

  await initializeDatabase();
  const db = await getDatabase();
  let query = 'SELECT id, category, data_json as dataJson, created_at as createdAt, updated_at as updatedAt FROM dynamic_records';
  let params: any[] = [];
  
  if (category) {
    query += ' WHERE category = ?';
    params.push(category);
  }
  query += ' ORDER BY created_at DESC;';
  
  const rows = await db.getAllAsync<any>(query, params);
  return rows;
}

export async function clearDatabase(): Promise<void> {
  if (API_URL) {
    const headers: Record<string, string> = {};
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/api/records`, { method: 'DELETE', headers });
    if (!res.ok) throw new Error('Failed to clear database via Cloudflare D1 API');
    return;
  }

  if (Platform.OS === 'web') {
    await webStorage.clear();
    return;
  }
  await initializeDatabase();
  const db = await getDatabase();
  await db.execAsync('DELETE FROM dynamic_records;');
}

export async function deleteCategoryRecords(category: string): Promise<void> {
  if (API_URL) {
    const headers: Record<string, string> = {};
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/api/records/category/${encodeURIComponent(category)}`, { method: 'DELETE', headers });
    if (!res.ok) throw new Error('Failed to delete category records via Cloudflare D1 API');
    return;
  }

  if (Platform.OS === 'web') {
    await webStorage.deleteByCategory(category);
    return;
  }
  await initializeDatabase();
  const db = await getDatabase();
  await db.runAsync('DELETE FROM dynamic_records WHERE category = ?;', [category]);
}

export async function getTableNames(): Promise<string[]> {
  if (API_URL) {
    return ['dynamic_records', 'users', 'detainees', 'detentions', 'charges', 'legal_proceedings', 'correspondence'];
  }
  if (Platform.OS === 'web') {
    return await webStorage.getTables();
  }

  await initializeDatabase();
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
  );
  return rows.map((r: { name: string }) => r.name);
}
