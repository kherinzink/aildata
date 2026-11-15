import React, { useState, useMemo, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { DynamicRecord, getDetainees, DetaineeSummary } from '../services/dataService';
import { DetaineeDetailModal, DetaineeDetailRecord } from '../components/DetaineeDetailModal';

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
  // Mode: 'normalized' or 'all' or 'import_<sheetName>'
  const [selectedDataset, setSelectedDataset] = useState<string>('normalized');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Normalized Detainees from API
  const [normalizedDetainees, setNormalizedDetainees] = useState<DetaineeSummary[]>([]);
  const [normalizedLoading, setNormalizedLoading] = useState(false);

  // Detainee Modal state
  const [selectedDetainee, setSelectedDetainee] = useState<DetaineeDetailRecord | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Fetch normalized detainees
  const loadNormalizedDetainees = async () => {
    try {
      setNormalizedLoading(true);
      const data = await getDetainees({ limit: 10000 });
      setNormalizedDetainees(data);
    } catch {
      // Fallback
    } finally {
      setNormalizedLoading(false);
    }
  };

  useEffect(() => {
    if (records.length === 0) {
      setNormalizedDetainees([]);
      setSelectedDataset('normalized');
    } else {
      loadNormalizedDetainees();
    }
  }, [records]);

  // Extract unique categories for filter pills
  const categories = useMemo(() => {
    const cats = new Set<string>();
    records.forEach(r => cats.add(r.category));
    return Array.from(cats);
  }, [records]);

  // Clean up stale category selection if category was deleted
  useEffect(() => {
    if (selectedDataset !== 'normalized' && selectedDataset !== 'all' && !categories.includes(selectedDataset)) {
      setSelectedDataset('normalized');
    }
  }, [categories, selectedDataset]);

  // Rows when in Normalized mode
  const normalizedRows = useMemo(() => {
    return normalizedDetainees.map(d => ({
      id: d.id,
      Name: d.name || 'UNKNOWN',
      'Jacket #': d.jacket_number || 'N/A',
      Country: d.country || 'Unknown',
      Age: d.age || '',
      Sex: d.sex || '',
      'Book Date': d.book_date_gcj || '',
      'Departure Date': d.departure_date || 'In Custody',
      Agency: d.delivering_agency || '',
      Charges: d.charges_summary || '',
      Penpal: d.penpal || '',
      __normalizedRecord: d
    }));
  }, [normalizedDetainees]);

  // Rows when in Raw mode
  const rawParsedRows = useMemo(() => {
    const filtered = selectedDataset === 'all'
      ? records
      : records.filter(r => r.category === selectedDataset);

    return filtered.map(rec => {
      try {
        const data = JSON.parse(rec.dataJson);
        const cleanedData: any = {};
        Object.entries(data).forEach(([k, v]) => {
          if (!k.startsWith('__EMPTY') && k.trim() !== '') {
            cleanedData[k.trim()] = formatCell(v);
          }
        });
        return { 
          id: rec.id, 
          category: rec.category, 
          createdAt: rec.createdAt, 
          __rawObj: data, 
          ...cleanedData 
        };
      } catch {
        return { id: rec.id, category: rec.category, raw: rec.dataJson, __rawObj: {} };
      }
    });
  }, [records, selectedDataset]);

  const activeRows = selectedDataset === 'normalized' ? normalizedRows : rawParsedRows;

  // Extract dynamic column keys
  const columns = useMemo(() => {
    if (selectedDataset === 'normalized') {
      return ['Name', 'Jacket #', 'Country', 'Age', 'Sex', 'Book Date', 'Departure Date', 'Agency', 'Charges', 'Penpal'];
    }
    const allKeysSet = new Set<string>();
    activeRows.forEach(row => {
      Object.keys(row).forEach(k => {
        if (!['id', 'category', 'createdAt', 'raw', '__rawObj', '__normalizedRecord'].includes(k)) {
          allKeysSet.add(k);
        }
      });
    });
    return Array.from(allKeysSet);
  }, [selectedDataset, activeRows]);

  // Filter and sort with numeric collation
  const sortedRows = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    
    const filtered = query === '' ? activeRows : activeRows.filter(row => {
      return Object.entries(row).some(([k, val]) => {
        if (k === '__rawObj' || k === '__normalizedRecord') return false;
        return String(val ?? '').toLowerCase().includes(query);
      });
    });

    if (!sortField) return filtered;

    return [...filtered].sort((a, b) => {
      const valA = String((a as any)[sortField] ?? '');
      const valB = String((b as any)[sortField] ?? '');
      const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
      return sortAsc ? cmp : -cmp;
    });
  }, [activeRows, searchQuery, sortField, sortAsc]);

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
    setCurrentPage(1);
  };

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    setCurrentPage(1);
  };

  const handleSelectDataset = (dataset: string) => {
    setSelectedDataset(dataset);
    setSortField(null);
    setCurrentPage(1);
  };

  const handleRowClick = (row: any) => {
    if (row.__normalizedRecord) {
      const d: DetaineeSummary = row.__normalizedRecord;
      const detail: DetaineeDetailRecord = {
        id: d.id,
        name: d.name,
        jacket_number: d.jacket_number,
        ice_case_number: d.ice_case_number,
        age: d.age,
        race: d.race,
        sex: d.sex,
        country: d.country,
        book_date_gcj: d.book_date_gcj,
        departure_date: d.departure_date,
        cell: d.cell,
        delivering_agency: d.delivering_agency,
        charges: d.charges_summary ? d.charges_summary.split(';').map(c => c.trim()).filter(Boolean) : [],
        penpal: d.penpal
      };
      setSelectedDetainee(detail);
      setModalVisible(true);
      return;
    }

    const raw = row.__rawObj || {};
    const getVal = (possibleKeys: string[]): string | undefined => {
      for (const k of possibleKeys) {
        if (raw[k] !== undefined && raw[k] !== null && String(raw[k]).trim() !== '') {
          return String(raw[k]);
        }
        const lowerKey = k.toLowerCase();
        for (const [rk, rv] of Object.entries(raw)) {
          if (rk.toLowerCase().trim() === lowerKey && rv !== null && rv !== undefined && String(rv).trim() !== '') {
            return String(rv);
          }
        }
      }
      return undefined;
    };

    const chargesVal = getVal(['Charges', 'Charge', 'Offense']);
    const chargesList = chargesVal 
      ? chargesVal.split(/[;\n]/).map(s => s.trim()).filter(Boolean)
      : [];

    const detail: DetaineeDetailRecord = {
      id: row.id,
      name: getVal(['Name (From Jail Tracker)', 'Name', 'Detainee Name']),
      jacket_number: getVal(['Jacket Number', 'Jacket #', 'Jacket']),
      ice_case_number: getVal(['ICE Case Number/A#', 'ICE Case #', 'A-Number', 'Case Number']),
      age: getVal(['Age']),
      race: getVal(['Race']),
      sex: getVal(['Sex', 'Gender']),
      country: getVal(['Country', 'COO', 'Country of Origin']),
      book_date_gcj: getVal(['Book Date in GCJ', 'Book Date', 'GCJ Book Date']),
      departure_date: getVal(['Departure date (or today)', 'Departure Date', 'Release Date', 'Dep Date']),
      cell: getVal(['Cell', 'Housing']),
      days_in_gcj: getVal(['Days in GCJ', 'Days GCJ']),
      days_prior_facility: getVal(['Days Prior Facility']),
      came_from: getVal(['Came From']),
      sent_to_note: getVal(['Sent To (or note)', 'Sent To', 'Sent To Note']),
      delivering_agency: getVal(['Delivering Agency', 'Agency']),
      duplicate_jacket_returned: getVal(['Duplicate Jacket # (came back?)', 'Duplicate Jacket Returned']),
      charges: chargesList,
      judge_ordered: getVal(['Judge ordered?', 'Judge Ordered']),
      decision_date: getVal(['Decision date?', 'Decision Date']),
      day_wait: getVal(['Day wait', 'Day Wait']),
      notes: getVal(['Notes for habeas, ongoing etc', 'Notes', 'Legal Notes']),
      penpal: getVal(['Penpal', 'Pen Pal']),
      loc_note: getVal(['LocNote & Fmr. Penpal', 'Loc Note', 'Location Note']),
      rawAttributes: raw
    };

    setSelectedDetainee(detail);
    setModalVisible(true);
  };

  const startCount = sortedRows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endCount = Math.min(currentPage * PAGE_SIZE, sortedRows.length);

  return (
    <View style={styles.container}>
      {/* Dataset Mode Switcher */}
      <View style={styles.filterBar}>
        <Text style={styles.filterLabel}>Dataset Mode:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <TouchableOpacity
            style={[styles.filterPill, selectedDataset === 'normalized' && styles.activeFilterPill]}
            onPress={() => handleSelectDataset('normalized')}
          >
            <Text style={[styles.filterPillText, selectedDataset === 'normalized' && styles.activeFilterPillText]}>
              ✨ Normalized Detainees ({normalizedDetainees.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, selectedDataset === 'all' && styles.activeFilterPill]}
            onPress={() => handleSelectDataset('all')}
          >
            <Text style={[styles.filterPillText, selectedDataset === 'all' && styles.activeFilterPillText]}>
              All Raw Ingested ({records.length})
            </Text>
          </TouchableOpacity>

          {categories.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.filterPill, selectedDataset === cat && styles.activeFilterPill]}
              onPress={() => handleSelectDataset(cat)}
            >
              <Text style={[styles.filterPillText, selectedDataset === cat && styles.activeFilterPillText]}>
                {cat} ({records.filter(r => r.category === cat).length})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Toolbar & Search */}
      <View style={styles.toolbar}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Search entries... (Click any row to open relational drill-down)"
          placeholderTextColor="#888"
          value={searchQuery}
          onChangeText={handleSearchChange}
        />
        <View style={styles.toolbarRight}>
          {normalizedLoading && <ActivityIndicator size="small" color="#2563eb" style={{ marginRight: 8 }} />}
          <TouchableOpacity 
            style={styles.refreshButton} 
            onPress={() => loadNormalizedDetainees()}
          >
            <Text style={styles.refreshButtonText}>🔄 Refresh</Text>
          </TouchableOpacity>
          <Text style={styles.rowCount}>
            Showing {startCount} - {endCount} of {sortedRows.length} (Total: {activeRows.length})
          </Text>
        </View>
      </View>

      {/* Spreadsheet Table Grid */}
      <ScrollView horizontal contentContainerStyle={styles.horizontalScroll}>
        <View style={styles.table}>
          <View style={styles.headerRow}>
            <View style={[styles.cell, styles.idCell]}>
              <Text style={styles.headerText}>ID</Text>
            </View>
            <View style={[styles.cell, styles.actionCell]}>
              <Text style={styles.headerText}>Detail</Text>
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
              paginatedRows.map((row: any, index: number) => (
                <TouchableOpacity 
                  key={row.id || index} 
                  style={[styles.row, index % 2 === 1 && styles.evenRow]}
                  onPress={() => handleRowClick(row)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.cell, styles.idCell]}>
                    <Text style={styles.cellText} numberOfLines={1}>{row.id}</Text>
                  </View>
                  <View style={[styles.cell, styles.actionCell]}>
                    <Text style={styles.viewBadge}>View 🔍</Text>
                  </View>
                  {columns.map(col => (
                    <View key={col} style={[styles.cell, styles.dataCell]}>
                      <Text style={styles.cellText} numberOfLines={2}>{String(row[col] ?? '')}</Text>
                    </View>
                  ))}
                </TouchableOpacity>
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

      {/* Detainee Master-Detail Modal */}
      <DetaineeDetailModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        detainee={selectedDetainee}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginRight: 10,
    textTransform: 'uppercase',
  },
  filterScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  activeFilterPill: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  activeFilterPillText: {
    color: '#ffffff',
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
  toolbarRight: {
    flexDirection: 'row',
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
  refreshButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    marginRight: 10,
  },
  refreshButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
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
    maxHeight: 520,
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
    paddingVertical: 6,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  idCell: {
    width: 120,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  actionCell: {
    width: 80,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
    alignItems: 'center',
  },
  viewBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
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
