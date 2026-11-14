import React, { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { DynamicRecord, clearDatabase, deleteCategoryRecords } from '../services/dataService';

interface DashboardViewProps {
  records: DynamicRecord[];
  storageMode: string;
  tables: string[];
  onDataChanged: () => void;
}

export function DashboardView({ records, storageMode, tables, onDataChanged }: DashboardViewProps) {
  // Extract unique categories / imported sheets
  const categories = useMemo(() => {
    const cats = new Set<string>();
    records.forEach(r => cats.add(r.category));
    return Array.from(cats);
  }, [records]);

  // Compute interesting aggregations & Custody Status (Current vs Released) with robust column matching
  const analytics = useMemo(() => {
    const countries: { [key: string]: number } = {};
    const agencies: { [key: string]: number } = {};
    const sexes: { [key: string]: number } = {};
    
    let currentCount = 0;
    let releasedCount = 0;
    let currentWithPenpalCount = 0;
    const today = new Date('2026-11-02'); // Current session date

    records.forEach(r => {
      try {
        const data = JSON.parse(r.dataJson);
        
        // Country
        const country = data['Country'] || data['COO'] || 'Unknown';
        if (country && String(country).trim()) {
          countries[String(country).trim()] = (countries[String(country).trim()] || 0) + 1;
        }

        // Delivering Agency
        const agency = data['Delivering Agency'] || 'Unknown';
        if (agency && String(agency).trim()) {
          agencies[String(agency).trim()] = (agencies[String(agency).trim()] || 0) + 1;
        }

        // Sex
        const sex = data['Sex'] || 'Unknown';
        if (sex && String(sex).trim()) {
          sexes[String(sex).trim()] = (sexes[String(sex).trim()] || 0) + 1;
        }

        // Robust Departure Date Detection (search keys case-insensitively for departure/release)
        let depDateStr = '';
        for (const [k, v] of Object.entries(data)) {
          const lKey = k.toLowerCase();
          if ((lKey.includes('departure') || lKey.includes('release') || lKey.includes('dep date')) && v !== null && v !== undefined && String(v).trim() !== '') {
            depDateStr = String(v);
            break;
          }
        }

        let isCurrent = false;
        if (!depDateStr || depDateStr.trim() === '' || depDateStr.toLowerCase() === 'present' || depDateStr.toLowerCase() === 'today' || depDateStr.toLowerCase() === 'ongoing') {
          isCurrent = true;
          currentCount++;
        } else {
          // Parse date
          const depDate = new Date(depDateStr);
          if (isNaN(depDate.getTime())) {
            isCurrent = true;
            currentCount++;
          } else if (depDate <= today) {
            releasedCount++;
          } else {
            isCurrent = true;
            currentCount++;
          }
        }

        // Check if has penpal
        let hasPenpal = false;
        for (const [k, v] of Object.entries(data)) {
          if (k.toLowerCase().includes('penpal') && v !== null && v !== undefined && String(v).trim() !== '') {
            hasPenpal = true;
            break;
          }
        }

        if (isCurrent && hasPenpal) {
          currentWithPenpalCount++;
        }
      } catch {
        currentCount++;
      }
    });

    const topCountries = Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topAgencies = Object.entries(agencies).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const sexDistribution = Object.entries(sexes).sort((a, b) => b[1] - a[1]);
    const penpalPercentage = currentCount > 0 ? ((currentWithPenpalCount / currentCount) * 100).toFixed(1) : '0.0';

    return { topCountries, topAgencies, sexDistribution, currentCount, releasedCount, penpalPercentage };
  }, [records]);

  const handleClearDatabase = async () => {
    const confirmClear = window.confirm 
      ? window.confirm('Are you sure you want to clear all database records?') 
      : true;

    if (confirmClear) {
      try {
        await clearDatabase();
        await onDataChanged();
        alert('Database cleared successfully.');
      } catch (e: any) {
        alert(`Failed to clear database: ${e.message}`);
      }
    }
  };

  const handleDeleteCategory = async (cat: string) => {
    const confirmDelete = window.confirm 
      ? window.confirm(`Are you sure you want to delete all records for imported sheet "${cat}"?`) 
      : true;

    if (confirmDelete) {
      try {
        await deleteCategoryRecords(cat);
        await onDataChanged();
        alert(`Successfully deleted records for "${cat}".`);
      } catch (e: any) {
        alert(`Failed to delete records: ${e.message}`);
      }
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>System Overview & Custody Analytics</Text>
      
      {/* Top Metric Cards */}
      <View style={styles.grid}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Total Records</Text>
          <Text style={styles.cardValue}>{records.length.toLocaleString()}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🟢 Current In Custody</Text>
          <Text style={[styles.cardValue, { color: '#166534' }]}>{analytics.currentCount.toLocaleString()}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔴 Released / Transferred</Text>
          <Text style={[styles.cardValue, { color: '#991b1b' }]}>{analytics.releasedCount.toLocaleString()}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>✉️ Current with Penpals</Text>
          <Text style={[styles.cardValue, { color: '#2563eb' }]}>{analytics.penpalPercentage}%</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Storage Engine</Text>
          <Text style={styles.cardSubValue}>{storageMode}</Text>
        </View>
      </View>

      {/* Interesting Insights / Column Aggregations */}
      <View style={styles.rowGrid}>
        {/* Top Countries */}
        <View style={styles.halfSection}>
          <Text style={styles.sectionTitle}>🌍 Top Countries of Origin (COO)</Text>
          {analytics.topCountries.length === 0 ? (
            <Text style={styles.emptyText}>No country data available.</Text>
          ) : (
            analytics.topCountries.map(([country, count]) => (
              <View key={country} style={styles.statRow}>
                <Text style={styles.statLabel}>{country}</Text>
                <Text style={styles.statCount}>{count}</Text>
              </View>
            ))
          )}
        </View>

        {/* Top Delivering Agencies */}
        <View style={styles.halfSection}>
          <Text style={styles.sectionTitle}>🏛️ Top Delivering Agencies</Text>
          {analytics.topAgencies.length === 0 ? (
            <Text style={styles.emptyText}>No agency data available.</Text>
          ) : (
            analytics.topAgencies.map(([agency, count]) => (
              <View key={agency} style={styles.statRow}>
                <Text style={styles.statLabel}>{agency}</Text>
                <Text style={styles.statCount}>{count}</Text>
              </View>
            ))
          )}
        </View>
      </View>

      {/* Sex Distribution & Active Sheets */}
      <View style={styles.rowGrid}>
        <View style={styles.halfSection}>
          <Text style={styles.sectionTitle}>👥 Sex Distribution</Text>
          {analytics.sexDistribution.length === 0 ? (
            <Text style={styles.emptyText}>No demographic data available.</Text>
          ) : (
            analytics.sexDistribution.map(([sex, count]) => (
              <View key={sex} style={styles.statRow}>
                <Text style={styles.statLabel}>{sex === 'M' ? 'Male' : sex === 'F' ? 'Female' : sex}</Text>
                <Text style={styles.statCount}>{count}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.halfSection}>
          <Text style={styles.sectionTitle}>📁 Active Sheets & Tables</Text>
          <Text style={[styles.sectionDesc, { fontSize: 12, marginBottom: 8 }]}>Click any imported sheet badge below to delete its records:</Text>
          <View style={styles.badgeContainer}>
            {categories.map(cat => (
              <TouchableOpacity 
                key={cat} 
                style={[styles.categoryBadge, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]} 
                onPress={() => handleDeleteCategory(cat)}
              >
                <Text style={[styles.categoryText, { color: '#991b1b' }]}>{cat} ({records.filter(r => r.category === cat).length}) 🗑️</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>🗄️ Relational Entities</Text>
          <View style={styles.badgeContainer}>
            {['detainees', 'detentions', 'charges', 'legal_proceedings', 'correspondence'].map(t => (
              <View key={t} style={styles.tableBadge}>
                <Text style={styles.tableBadgeText}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Maintenance */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Database Maintenance</Text>
        <Text style={styles.sectionDesc}>
          Need to wipe all imported spreadsheets and start with a clean slate?
        </Text>
        <TouchableOpacity style={styles.clearButton} onPress={handleClearDatabase}>
          <Text style={styles.clearButtonText}>🗑️ Clear Database Records</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#f8fafc',
    flexGrow: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  rowGrid: {
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
  halfSection: {
    flex: 1,
    minWidth: 300,
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: {
    fontSize: 13,
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
    fontSize: 13,
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
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  sectionDesc: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 16,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  statLabel: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '500',
  },
  statCount: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#94a3b8',
    fontStyle: 'italic',
    fontSize: 13,
  },
  badgeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryBadge: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  categoryText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '500',
  },
  tableBadge: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  tableBadgeText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  clearButton: {
    backgroundColor: '#dc2626',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
