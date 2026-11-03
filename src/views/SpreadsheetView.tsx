import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { DynamicRecord } from '../services/dataService';

interface SpreadsheetViewProps {
  records: DynamicRecord[];
}

export function SpreadsheetView({ records }: SpreadsheetViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  // Parse JSON data for each record
  const parsedRows = records.map(rec => {
    try {
      const data = JSON.parse(rec.dataJson);
      return { id: rec.id, category: rec.category, createdAt: rec.createdAt, ...data };
    } catch {
      return { id: rec.id, category: rec.category, raw: rec.dataJson };
    }
  });

  // Extract dynamic column keys from all rows
  const allKeysSet = new Set<string>();
  parsedRows.forEach(row => {
    Object.keys(row).forEach(k => {
      if (!['id', 'category', 'createdAt', 'raw'].includes(k)) {
        allKeysSet.add(k);
      }
    });
  });
  const columns = Array.from(allKeysSet);

  // Filter rows
  const filteredRows = parsedRows.filter(row => {
    if (!searchQuery) return true;
    return Object.values(row).some(val => 
      String(val ?? '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Sort rows
  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!sortField) return 0;
    const valA = a[sortField] ?? '';
    const valB = b[sortField] ?? '';
    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Search across all columns (Excel-style)..."
          placeholderTextColor="#888"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <Text style={styles.rowCount}>Showing {sortedRows.length} of {records.length} records</Text>
      </View>

      <ScrollView horizontal contentContainerStyle={styles.horizontalScroll}>
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.headerRow}>
            <View style={[styles.cell, styles.idCell]}>
              <Text style={styles.headerText}>ID</Text>
            </View>
            {columns.map(col => (
              <TouchableOpacity key={col} style={[styles.cell, styles.dataCell]} onPress={() => handleSort(col)}>
                <Text style={styles.headerText}>
                  {col} {sortField === col ? (sortAsc ? '▲' : '▼') : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Table Body */}
          <ScrollView style={styles.bodyScroll}>
            {sortedRows.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>No matching records found.</Text>
              </View>
            ) : (
              sortedRows.map((row, index) => (
                <View key={row.id || index} style={[styles.row, index % 2 === 1 && styles.evenRow]}>
                  <View style={[styles.cell, styles.idCell]}>
                    <Text style={styles.cellText} numberOfLines={1}>{row.id}</Text>
                  </View>
                  {columns.map(col => (
                    <View key={col} style={[styles.cell, styles.dataCell]}>
                      <Text style={styles.cellText} numberOfLines={2}>{String(row[col] ?? '')}</Text>
                    </View>
                  ))}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  toolbar: {
    padding: 16,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
    marginRight: 12,
  },
  rowCount: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  horizontalScroll: {
    flexGrow: 1,
  },
  table: {
    flex: 1,
    minWidth: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderBottomWidth: 2,
    borderBottomColor: '#0f172a',
  },
  bodyScroll: {
    maxHeight: 500,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  evenRow: {
    backgroundColor: '#f8fafc',
  },
  cell: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  idCell: {
    width: 120,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  dataCell: {
    width: 180,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  headerText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12,
  },
  cellText: {
    color: '#334155',
    fontSize: 13,
  },
  emptyRow: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontStyle: 'italic',
  },
});
