import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput, SafeAreaView } from 'react-native';
import { initializeDatabase, getTableNames, getRecords, insertRecord, getStorageMode, getAuthToken, getAuthUser, logoutUser, setUnauthorizedCallback, DynamicRecord } from './src/services/dataService';
import { SpreadsheetView } from './src/views/SpreadsheetView';
import { DashboardView } from './src/views/DashboardView';
import { ImportFileView } from './src/views/ImportFileView';
import { AuthView } from './src/views/AuthView';
import { AdminView } from './src/views/AdminView';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!getAuthToken());
  const [currentUser, setCurrentUser] = useState<{ email?: string | null; role?: string | null } | null>(getAuthUser());

  useEffect(() => {
    setUnauthorizedCallback(() => {
      setIsAuthenticated(false);
      setCurrentUser(null);
    });
  }, []);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'spreadsheet' | 'insert' | 'import' | 'admin'>('dashboard');
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
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setCurrentUser(getAuthUser());
    loadData();
  };

  const handleLogout = () => {
    logoutUser();
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  const handleAddRecord = async () => {
    if (!inputName) return;
    if (currentUser?.role === 'viewer') {
      alert('Access denied: Viewers cannot add records.');
      return;
    }
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

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <AuthView onLoginSuccess={handleLoginSuccess} />
      </SafeAreaView>
    );
  }

  const role = (currentUser?.role || 'viewer').toLowerCase();
  const isAdmin = role === 'admin';
  const canModify = role === 'admin' || role === 'analyst';

  const getRoleBadgeStyle = (userRole: string) => {
    if (userRole === 'admin') return { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c' };
    if (userRole === 'analyst') return { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' };
    return { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' };
  };

  const roleStyle = getRoleBadgeStyle(role);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Aildata Workspace</Text>
          <Text style={styles.subtitle}>Secure Relational Database & Ingestion Framework</Text>
        </View>
        <View style={styles.headerRight}>
          {currentUser?.email && (
            <View style={[styles.userBadge, { backgroundColor: roleStyle.bg, borderColor: roleStyle.border }]}>
              <Text style={[styles.userText, { color: roleStyle.text }]} numberOfLines={1}>
                {currentUser.email} • {role.toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {dbStatus.includes('Connected') ? '● Connected' : dbStatus} | {storageMode || 'D1'}
            </Text>
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Navigation Tabs */}
      <View style={styles.tabBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarScroll}
        >
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'dashboard' && styles.activeTab]} 
            onPress={() => {
              setActiveTab('dashboard');
              loadData();
            }}
          >
            <Text style={[styles.tabText, activeTab === 'dashboard' && styles.activeTabText]}>📈 Dashboard</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.tab, activeTab === 'spreadsheet' && styles.activeTab]} 
            onPress={() => {
              setActiveTab('spreadsheet');
              loadData();
            }}
          >
            <Text style={[styles.tabText, activeTab === 'spreadsheet' && styles.activeTabText]}>📊 Spreadsheet Grid</Text>
          </TouchableOpacity>

          {canModify && (
            <TouchableOpacity 
              style={[styles.tab, activeTab === 'import' && styles.activeTab]} 
              onPress={() => setActiveTab('import')}
            >
              <Text style={[styles.tabText, activeTab === 'import' && styles.activeTabText]}>📂 Import File</Text>
            </TouchableOpacity>
          )}

          {canModify && (
            <TouchableOpacity 
              style={[styles.tab, activeTab === 'insert' && styles.activeTab]} 
              onPress={() => setActiveTab('insert')}
            >
              <Text style={[styles.tabText, activeTab === 'insert' && styles.activeTabText]}>➕ Add Record</Text>
            </TouchableOpacity>
          )}

          {isAdmin && (
            <TouchableOpacity 
              style={[styles.tab, activeTab === 'admin' && styles.activeTab]} 
              onPress={() => {
                setActiveTab('admin');
                loadData();
              }}
            >
              <Text style={[styles.tabText, activeTab === 'admin' && styles.activeTabText]}>🛡️ Admin</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* Active View Content */}
      <View style={styles.contentContainer}>
        {activeTab === 'dashboard' && (
          <DashboardView 
            records={records} 
            storageMode={storageMode} 
            tables={tables} 
            currentUser={currentUser} 
            onDataChanged={loadData} 
          />
        )}
        {activeTab === 'spreadsheet' && <SpreadsheetView records={records} />}
        {activeTab === 'import' && canModify && <ImportFileView onImportComplete={loadData} />}
        {activeTab === 'admin' && isAdmin && (
          <AdminView 
            currentUser={currentUser} 
            onDataChanged={loadData} 
          />
        )}
        {activeTab === 'insert' && canModify && (
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
    width: '100%',
    maxWidth: '100%',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
    maxWidth: '100%',
  },
  titleContainer: {
    flexShrink: 1,
    minWidth: 180,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    flexShrink: 1,
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
  userBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    maxWidth: 220,
  },
  userText: {
    fontSize: 11,
    fontWeight: '700',
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
  logoutButton: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  logoutText: {
    color: '#991b1b',
    fontSize: 11,
    fontWeight: '600',
  },
  tabBarContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    width: '100%',
    maxWidth: '100%',
  },
  tabBarScroll: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginRight: 4,
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
