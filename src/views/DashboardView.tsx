import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { DynamicRecord } from '../services/dataService';

interface DashboardViewProps {
  records: DynamicRecord[];
  storageMode: string;
  tables: string[];
}

export function DashboardView({ records, storageMode, tables }: DashboardViewProps) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>System Overview</Text>
      
      <View style={styles.grid}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Total Records</Text>
          <Text style={styles.cardValue}>{records.length}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Database Tables</Text>
          <Text style={styles.cardValue}>{tables.length}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Storage Engine</Text>
          <Text style={styles.cardSubValue}>{storageMode}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Ingested Data</Text>
        {records.slice(0, 5).map(rec => (
          <View key={rec.id} style={styles.recordItem}>
            <Text style={styles.recordId}>{rec.id}</Text>
            <Text style={styles.recordPreview} numberOfLines={2}>{rec.dataJson}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#f8fafc',
    flexGrow: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  card: {
    flex: 1,
    minWidth: 200,
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  cardSubValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  recordItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  recordId: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
    marginBottom: 2,
  },
  recordPreview: {
    fontSize: 13,
    color: '#334155',
    fontFamily: 'monospace',
  },
});
