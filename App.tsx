import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput, SafeAreaView } from 'react-native';
import { initializeDatabase, getTableNames, getRecords, insertRecord, getStorageMode, DynamicRecord } from './src/services/dataService';
import { SpreadsheetView } from './src/views/SpreadsheetView';
import { DashboardView } from './src/views/DashboardView';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'spreadsheet' | 'insert'>('spreadsheet');
  const [dbStatus, setDbStatus] = useState<string>('Initializing...');
  const [storageMode, setStorageMode] = useState<string>('');
  const [tables, setTables] = useState<string[]>([]);
  const [records, setRecords] = useState<DynamicRecord[]>([]);
  
  // Insert Form State
  const [inputKey, setInputKey] = useState<string>('');
  const [inputValue, setInputValue] = useState<string>('');
  const [inputName, setInputName] = useState<string>('');

  const loadData = async () => {
    try {
      await initializeDatabase();
      setStorageMode(getStorageMode());
      setDbStatus('Connected & Secured');
      const tableList = await getTableNames();
      setTables(tableList);
      const recs = await getRecords();
      setRecords(recs);
    } catch (error: any) {
      setDbStatus(`Error: ${error.message}`);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddRecord = async () => {
    if (!inputName) return;
    try {
      await insertRecord('detainee_record', {
        "Name (From Jail Tracker)": inputName,
        [inputKey || "CustomField"]: inputValue || "Value",
        "Book Date in GCJ": new Date().toISOString().split('T')[0],
        "Delivering Agency": "Manual Entry"
      });
      setInputName('');
      setInputKey('');
      setInputValue('');
      await loadData();
      setActiveTab('spreadsheet');
    } catch (e: any) {
      alert(`Failed to insert: ${e.message}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Aildata Workspace</Text>
          <Text style={styles.subtitle}>Secure Database & Spreadsheet Framework</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{dbStatus} | {storageMode}</Text>
        </View>
      </View>

      {/* Navigation Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'spreadsheet' && styles.activeTab]} 
          onPress={() => setActiveTab('spreadsheet')}
        >
          <Text style={[styles.tabText, activeTab === 'spreadsheet' && styles.activeTabText]}>📊 Spreadsheet Grid</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tab, activeTab === 'dashboard' && styles.activeTab]} 
          onPress={() => setActiveTab('dashboard')}
        >
          <Text style={[styles.tabText, activeTab === 'dashboard' && styles.activeTabText]}>📈 Dashboard</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tab, activeTab === 'insert' && styles.activeTab]} 
          onPress={() => setActiveTab('insert')}
        >
          <Text style={[styles.tabText, activeTab === 'insert' && styles.activeTabText]}>➕ Add Record</Text>
        </TouchableOpacity>
      </View>

      {/* Active View Content */}
      <View style={styles.contentContainer}>
        {activeTab === 'spreadsheet' && <SpreadsheetView records={records} />}
        {activeTab === 'dashboard' && <DashboardView records={records} storageMode={storageMode} tables={tables} />}
        {activeTab === 'insert' && (
          <ScrollView contentContainerStyle={styles.insertContainer}>
            <Text style={styles.sectionTitle}>Add New Record</Text>
            
            <Text style={styles.label}>Name (From Jail Tracker)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. JOHN DOE"
              placeholderTextColor="#888"
              value={inputName}
              onChangeText={setInputName}
            />

            <Text style={styles.label}>Custom Field Key</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Charges, Age, Cell"
              placeholderTextColor="#888"
              value={inputKey}
              onChangeText={setInputKey}
            />

            <Text style={styles.label}>Custom Field Value</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Grand Larceny"
              placeholderTextColor="#888"
              value={inputValue}
              onChangeText={setInputValue}
            />

            <TouchableOpacity style={styles.button} onPress={handleAddRecord}>
              <Text style={styles.buttonText}>Save to Database</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  badgeText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 16,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#2563eb',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  activeTabText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  contentContainer: {
    flex: 1,
  },
  insertContainer: {
    padding: 24,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 16,
    color: '#0f172a',
  },
  button: {
    backgroundColor: '#2563eb',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
