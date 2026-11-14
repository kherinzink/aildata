import { Platform } from 'react-native';
import type * as SQLite from 'expo-sqlite';

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (Platform.OS === 'web') {
    return {
      execAsync: async () => {},
      runAsync: async () => {},
      getAllAsync: async () => []
    } as unknown as SQLite.SQLiteDatabase;
  }
  const SQLiteModule = await import('expo-sqlite');
  const db = await SQLiteModule.openDatabaseAsync('aildata.db');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  return db;
}
