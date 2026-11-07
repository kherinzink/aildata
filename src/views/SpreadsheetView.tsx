import React, { useState, useMemo } from 'react';
import { StyleSheet, Text, View, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { DynamicRecord } from '../services/dataService';

interface SpreadsheetViewProps {
  records: DynamicRecord[];
}

function formatCell(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number' && val > 30000 && val < 60000) {
    const excelEpoch = new Date(1899, 11, 30);
    const jsDate = new Date(excelEpoch.getTime() + val * 86400000);
    if (!isNaN(jsDate.getTime())) {
      return jsDate.toISOString().split('T')[0];
    }
  }
  return String(val);
}

const PAGE_SIZE = 10;

export function SpreadsheetView({ records }: SpreadsheetViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Memoize parsing JSON data
  const parsedRows = useMemo(() => {
    return records.map(rec => {
      try {
        const data = JSON.parse(rec.dataJson);
        const cleanedData: any = {};
        Object.entries(data).forEach(([k, v]) => {
          if (!k.startsWith('__EMPTY') && k.trim() !== '') {
            cleanedData[k.trim()] = formatCell(v);
          }
        });
        return { id: rec.id, category: rec.category, createdAt: rec.createdAt, ...cleanedData };
      } catch {
        return { id: rec.id, category: rec.category, raw: rec.dataJson };
      }
    });
  }, [records]);

  // Extract dynamic column keys
  const columns = useMemo(() => {
    const allKeysSet = new Set<string>();
    parsedRows.forEach(row => {
      Object.keys(row).forEach(k => {
        if (!['id', 'category', 'createdAt', 'raw'].includes(k)) {
          allKeysSet.add(k);
        }
      });
    });
    return Array.from(allKeysSet);
  }, [parsedRows]);

  // Memoize filtered and sorted rows
  const sortedRows = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    
    const filtered = query === '' ? parsedRows : parsedRows.filter(row => {
      return Object.values(row).some(val => 
        String(val ?? '').toLowerCase().includes(query)
      );
    });

    if (!sortField) return filtered;

    return [...filtered].sort((a, b) => {
      const valA = a[sortField] ?? '';
      const valB = b[sortField] ?? '';
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [parsedRows, searchQuery, sortField, sortAsc]);

  // Pagination calculation
  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, currentPage]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
    setCurrentPage(1); // Reset to page 1 on sort
  };

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    setCurrentPage(1); // Reset to page 1 on search
  };

  return (
    <View style={styles.container}>
      {/* Toolbar & Search */}
      <View style={styles.toolbar}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Instant search across all entries..."
          placeholderTextColor="#888"
          value={searchQuery}
          onChangeText={handleSearchChange}
        />
        <Text style={styles.rowCount}>
          Showing {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, sortedRows.length)} of {sortedRows.length} (Total: {records.length})
        </Text>
      </View>

      {/* Spreadsheet Table Grid */}
      <ScrollView horizontal contentContainerStyle={styles.horizontalScroll}>
        <View style={styles.table}>
          <View style={styles.headerRow}>
            <View style={[styles.cell, styles.idCell]}>
              <Text style={styles.headerText}>ID</Text>
            </View>
            {columns.map(col => (
              <TouchableOpacity key={col} style={[styles.cell, styles.dataCell]} onPress={() => handleSort(col)}>
                <Text style={styles.headerText} numberOfLines={1}>
                  {col} {sortField === col ? (sortAsc ? '▲' : '▼') : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={styles.bodyScroll}>
            {paginatedRows.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>No matching records found.</Text>
              </View>
            ) : (
              paginatedRows.map((row, index) => (
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

      {/* Pagination Bar */}
      <View style={styles.paginationBar}>
        <TouchableOpacity 
          style={[styles.pageButton, currentPage === 1 && styles.disabledButton]} 
          disabled={currentPage === 1}
          onPress={() => setCurrentPage(1)}
        >
          <Text style={styles.pageButtonText}>« First</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.pageButton, currentPage === 1 && styles.disabledButton]} 
          disabled={currentPage === 1}
          onPress={() => setCurrentPage(p => Math.max(p - 1, 1))}
        >
          <Text style={styles.pageButtonText}>‹ Prev</Text>
        </TouchableOpacity>

        <Text style={styles.pageIndicator}>
          Page {currentPage} of {totalPages}
        </Text>

        <TouchableOpacity 
          style={[styles.pageButton, currentPage === totalPages && styles.disabledButton]} 
          disabled={currentPage === totalPages}
          onPress={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
        >
          <Text style={styles.pageButtonText}>Next ›</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.pageButton, currentPage === totalPages && styles.disabledButton]} 
          disabled={currentPage === totalPages}
          onPress={() => setCurrentPage(totalPages)}
        >
          <Text style={styles.pageButtonText}>Last »</Text>
        </TouchableOpacity>
      </View>
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
    maxHeight: 450,
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
    paddingVertical: 4,
    paddingHorizontal: 8,
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
  paginationBar: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  pageButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
  },
  disabledButton: {
    opacity: 0.5,
    backgroundColor: '#f1f5f9',
  },
  pageButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  pageIndicator: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    marginHorizontal: 8,
  },
});
