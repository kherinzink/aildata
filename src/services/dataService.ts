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

// Web localStorage implementation with test1.ods seeded detainee records
class WebStorage {
  async init() {
    try {
      const storageKey = 'aildata_records_v2';
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        // Seed with test1.ods parsed record
        const defaultRecord: DynamicRecord = {
          id: 'det_0_bob_dole',
          category: 'detainee_record',
          dataJson: JSON.stringify({
            "Name (From Jail Tracker)": "BOB JIMMY DOLE",
            "Book Date in GCJ": "2025-01-01",
            "Jacket Number": "123456",
            "ICE Case Number/A#": "A123456789",
            "Cell": "B-2",
            "Age": "45",
            "Race": "W",
            "Sex": "M",
            "Delivering Agency": "Greene County Jail",
            "Country": "USA",
            "Charges": "Immigration Violation",
            "sorter": "537"
          }),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem(storageKey, JSON.stringify([defaultRecord]));
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

  async getTables(): Promise<string[]> {
    return ['dynamic_records', 'schema_migrations'];
  }
}

export function getStorageMode(): string {
  return Platform.OS === 'web' ? 'Web Local Cache (Browser)' : 'Native SQLite (expo-sqlite)';
}

const webStorage = new WebStorage();
let isInitialized = false;

export async function initializeDatabase() {
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

export async function getRecords(category?: string): Promise<DynamicRecord[]> {
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

export async function getTableNames(): Promise<string[]> {
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
