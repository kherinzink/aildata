import React, { useState, useMemo, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { DynamicRecord, getDetainees, DetaineeSummary, updateDetainee } from '../services/dataService';
import { DetaineeDetailModal, DetaineeDetailRecord } from '../components/DetaineeDetailModal';
import { DatePickerModal, DatePickerInput } from '../components/DatePicker';

interface SpreadsheetViewProps {
  records: DynamicRecord[];
}

const COLUMN_FIELD_MAP: Record<string, string> = {
  Name: 'name',
  'Jacket #': 'jacket_number',
  Country: 'country',
  Age: 'age',
  Sex: 'sex',
  'Book Date': 'book_date_gcj',
  'Departure Date': 'departure_date',
  Agency: 'delivering_agency',
  Charges: 'charges',
  'Judge Ordered': 'judge_ordered',
  Penpal: 'penpal'
};

function isDateColumn(colName: string): boolean {
  const lower = colName.toLowerCase();
  return lower.includes('date') || lower === 'book date' || lower === 'departure date';
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

const PAGE_SIZE = 100;

export function SpreadsheetView({ records }: SpreadsheetViewProps) {
  // Mode: 'normalized' or 'all' or 'import_<sheetName>'
  const [selectedDataset, setSelectedDataset] = useState<string>('normalized');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  
  // Normalized Detainees from API
  const [normalizedDetainees, setNormalizedDetainees] = useState<DetaineeSummary[]>([]);
  const [normalizedLoading, setNormalizedLoading] = useState(false);

  // Detainee Modal state
  const [selectedDetainee, setSelectedDetainee] = useState<DetaineeDetailRecord | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Inline cell editing state
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    field: string;
    value: string;
    originalValue: string;
  } | null>(null);
  const [cellDatePickerVisible, setCellDatePickerVisible] = useState(false);
  const [savingCellKey, setSavingCellKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Date Range Filter State
  const [dateFilterField, setDateFilterField] = useState<'none' | 'book_date' | 'departure_date'>('none');
  const [dateFilterStart, setDateFilterStart] = useState<string>('');
  const [dateFilterEnd, setDateFilterEnd] = useState<string>('');

  // Fetch normalized detainees
  const loadNormalizedDetainees = async (page = currentPage, query = searchQuery) => {
    try {
      setNormalizedLoading(true);
      const res = await getDetainees({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        search: query || undefined
      });
      const results = Array.isArray(res?.results) ? res.results : [];
      setNormalizedDetainees(results);
      setTotalCount(typeof res?.total === 'number' ? res.total : results.length);
    } catch {
      setNormalizedDetainees([]);
      setTotalCount(0);
    } finally {
      setNormalizedLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDataset === 'normalized') {
      if (records.length === 0) {
        setNormalizedDetainees([]);
        setTotalCount(0);
      } else {
        loadNormalizedDetainees(currentPage, searchQuery);
      }
    }
  }, [records, selectedDataset, currentPage, searchQuery]);

  // Extract unique categories for filter pills
  const categories = useMemo(() => {
    const cats = new Set<string>();
    const safeRecs = Array.isArray(records) ? records : [];
    safeRecs.forEach(r => {
      if (r && r.category) cats.add(r.category);
    });
    return Array.from(cats);
  }, [records]);

  // Clean up stale category selection if category was deleted
  useEffect(() => {
    const safeCats = Array.isArray(categories) ? categories : [];
    if (selectedDataset !== 'normalized' && selectedDataset !== 'all' && !safeCats.includes(selectedDataset)) {
      setSelectedDataset('normalized');
    }
  }, [categories, selectedDataset]);

  // Rows when in Normalized mode
  const normalizedRows = useMemo(() => {
    const list = Array.isArray(normalizedDetainees) ? normalizedDetainees : [];
    return list.map(d => ({
      id: d?.id || '',
      Name: d?.name || 'UNKNOWN',
      'Jacket #': d?.jacket_number || 'N/A',
      Country: d?.country || 'Unknown',
      Age: d?.age || '',
      Sex: d?.sex || '',
      'Book Date': d?.book_date_gcj || '',
      'Departure Date': d?.departure_date || 'In Custody',
      Agency: d?.delivering_agency || '',
      Charges: d?.charges_summary || '',
      'Judge Ordered': d?.judge_ordered || '',
      Penpal: d?.penpal || '',
      __normalizedRecord: d
    }));
  }, [normalizedDetainees]);

  // Rows when in Raw mode
  const rawParsedRows = useMemo(() => {
    const safeRecs = Array.isArray(records) ? records : [];
    const filtered = selectedDataset === 'all'
      ? safeRecs
      : safeRecs.filter(r => r && r.category === selectedDataset);

    return filtered.map(rec => {
      try {
        const data = JSON.parse(rec?.dataJson || '{}');
        const cleanedData: any = {};
        Object.entries(data || {}).forEach(([k, v]) => {
          if (k && !k.startsWith('__EMPTY') && k.trim() !== '') {
            cleanedData[k.trim()] = formatCell(v);
          }
        });
        return { 
          id: rec?.id, 
          category: rec?.category, 
          createdAt: rec?.createdAt, 
          __rawObj: data, 
          ...cleanedData 
        };
      } catch {
        return { id: rec?.id, category: rec?.category, raw: rec?.dataJson, __rawObj: {} };
      }
    });
  }, [records, selectedDataset]);

  const activeRows = useMemo(() => {
    const rows = selectedDataset === 'normalized' ? normalizedRows : rawParsedRows;
    return Array.isArray(rows) ? rows : [];
  }, [selectedDataset, normalizedRows, rawParsedRows]);

  // Extract dynamic column keys
  const columns = useMemo(() => {
    if (selectedDataset === 'normalized') {
      return ['Name', 'Jacket #', 'Country', 'Age', 'Sex', 'Book Date', 'Departure Date', 'Agency', 'Charges', 'Judge Ordered', 'Penpal'];
    }
    const allKeysSet = new Set<string>();
    const list = Array.isArray(activeRows) ? activeRows : [];
    list.forEach(row => {
      if (row) {
        Object.keys(row).forEach(k => {
          if (!['id', 'category', 'createdAt', 'raw', '__rawObj', '__normalizedRecord'].includes(k)) {
            allKeysSet.add(k);
          }
        });
      }
    });
    return Array.from(allKeysSet);
  }, [selectedDataset, activeRows]);

  // Filter and sort with numeric collation and date range filtering
  const sortedRows = useMemo(() => {
    const list = Array.isArray(activeRows) ? activeRows : [];
    const query = searchQuery.toLowerCase().trim();
    
    let filtered = query === '' ? list : list.filter(row => {
      if (!row) return false;
      return Object.entries(row).some(([k, val]) => {
        if (k === '__rawObj' || k === '__normalizedRecord') return false;
        return String(val ?? '').toLowerCase().includes(query);
      });
    });

    // Apply date range filter if enabled
    if (dateFilterField !== 'none' && (dateFilterStart || dateFilterEnd)) {
      filtered = filtered.filter((row: any) => {
        if (!row) return false;
        let cellDate = '';
        if (selectedDataset === 'normalized') {
          cellDate = dateFilterField === 'book_date' ? String(row['Book Date'] || '') : String(row['Departure Date'] || '');
        } else {
          for (const [k, v] of Object.entries(row)) {
            const lk = k.toLowerCase();
            if (dateFilterField === 'book_date' && (lk.includes('book') || lk.includes('intake')) && v) {
              cellDate = String(v);
              break;
            } else if (dateFilterField === 'departure_date' && (lk.includes('departure') || lk.includes('release')) && v) {
              cellDate = String(v);
              break;
            }
          }
        }

        if (!cellDate || cellDate === 'In Custody' || cellDate === 'Present') {
          return false;
        }

        const cleanDate = cellDate.trim().substring(0, 10);
        if (dateFilterStart && cleanDate < dateFilterStart) return false;
        if (dateFilterEnd && cleanDate > dateFilterEnd) return false;
        return true;
      });
    }

    if (!sortField) return filtered;

    return [...filtered].sort((a, b) => {
      const valA = String((a as any)?.[sortField] ?? '');
      const valB = String((b as any)?.[sortField] ?? '');
      const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
      return sortAsc ? cmp : -cmp;
    });
  }, [activeRows, searchQuery, sortField, sortAsc, dateFilterField, dateFilterStart, dateFilterEnd, selectedDataset]);

  // Pagination calculation
  const totalPages = selectedDataset === 'normalized'
    ? (Math.ceil(totalCount / PAGE_SIZE) || 1)
    : (Math.ceil(sortedRows.length / PAGE_SIZE) || 1);

  const paginatedRows = useMemo(() => {
    const list = Array.isArray(sortedRows) ? sortedRows : [];
    if (selectedDataset === 'normalized') {
      return list;
    }
    const start = (currentPage - 1) * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
  }, [selectedDataset, sortedRows, currentPage]);

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

  const handleCellClick = (row: any, col: string, val: string) => {
    if (selectedDataset !== 'normalized') return;
    setEditingCell({
      rowId: row.id,
      field: col,
      value: val === '—' || val === 'In Custody' ? '' : val,
      originalValue: val
    });
  };

  const handleCancelCell = () => {
    setEditingCell(null);
    setCellDatePickerVisible(false);
  };

  const handleSaveCell = async () => {
    if (!editingCell) return;
    setCellDatePickerVisible(false);
    const { rowId, field, value, originalValue } = editingCell;
    const trimmed = value.trim();

    if (trimmed === originalValue.trim()) {
      setEditingCell(null);
      return;
    }

    const cellKey = `${rowId}:${field}`;
    const fieldKey = COLUMN_FIELD_MAP[field] || field;
    setSavingCellKey(cellKey);
    setEditingCell(null);

    // Optimistically update local normalizedDetainees state
    setNormalizedDetainees(prev =>
      prev.map(d => {
        if (d.id !== rowId) return d;
        const updated = { ...d };
        if (fieldKey === 'name') updated.name = trimmed;
        else if (fieldKey === 'jacket_number') updated.jacket_number = trimmed;
        else if (fieldKey === 'country') updated.country = trimmed;
        else if (fieldKey === 'age') updated.age = trimmed;
        else if (fieldKey === 'sex') updated.sex = trimmed;
        else if (fieldKey === 'book_date_gcj') updated.book_date_gcj = trimmed;
        else if (fieldKey === 'departure_date') updated.departure_date = trimmed;
        else if (fieldKey === 'delivering_agency') updated.delivering_agency = trimmed;
        else if (fieldKey === 'charges') updated.charges_summary = trimmed;
        else if (fieldKey === 'judge_ordered') updated.judge_ordered = trimmed;
        else if (fieldKey === 'penpal') updated.penpal = trimmed;
        return updated;
      })
    );

    try {
      await updateDetainee(rowId, { [fieldKey]: trimmed });
      setToastMessage(`✓ Saved ${field}`);
      setTimeout(() => setToastMessage(null), 2500);
    } catch (e: any) {
      // Revert on failure
      setNormalizedDetainees(prev =>
        prev.map(d => {
          if (d.id !== rowId) return d;
          const reverted = { ...d };
          if (fieldKey === 'name') reverted.name = originalValue;
          else if (fieldKey === 'jacket_number') reverted.jacket_number = originalValue;
          else if (fieldKey === 'country') reverted.country = originalValue;
          else if (fieldKey === 'age') reverted.age = originalValue;
          else if (fieldKey === 'sex') reverted.sex = originalValue;
          else if (fieldKey === 'book_date_gcj') reverted.book_date_gcj = originalValue;
          else if (fieldKey === 'departure_date') reverted.departure_date = originalValue;
          else if (fieldKey === 'delivering_agency') reverted.delivering_agency = originalValue;
          else if (fieldKey === 'charges') reverted.charges_summary = originalValue;
          else if (fieldKey === 'judge_ordered') reverted.judge_ordered = originalValue;
          else if (fieldKey === 'penpal') reverted.penpal = originalValue;
          return reverted;
        })
      );
      setToastMessage(`⚠️ Failed to save: ${e.message}`);
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setSavingCellKey(null);
    }
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
          placeholder="🔍 Search entries..."
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

      {/* Date Filter Bar */}
      <View style={styles.dateFilterBar}>
        <View style={styles.dateFilterLeft}>
          <Text style={styles.dateFilterTitle}>📅 Date Filter:</Text>
          <View style={styles.dateFilterPills}>
            <TouchableOpacity
              style={[styles.dateFilterPill, dateFilterField === 'none' && styles.dateFilterPillActive]}
              onPress={() => {
                setDateFilterField('none');
                setDateFilterStart('');
                setDateFilterEnd('');
                setCurrentPage(1);
              }}
            >
              <Text style={[styles.dateFilterPillText, dateFilterField === 'none' && styles.dateFilterPillTextActive]}>
                Off
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dateFilterPill, dateFilterField === 'book_date' && styles.dateFilterPillActive]}
              onPress={() => {
                setDateFilterField('book_date');
                setCurrentPage(1);
              }}
            >
              <Text style={[styles.dateFilterPillText, dateFilterField === 'book_date' && styles.dateFilterPillTextActive]}>
                Book Date
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dateFilterPill, dateFilterField === 'departure_date' && styles.dateFilterPillActive]}
              onPress={() => {
                setDateFilterField('departure_date');
                setCurrentPage(1);
              }}
            >
              <Text style={[styles.dateFilterPillText, dateFilterField === 'departure_date' && styles.dateFilterPillTextActive]}>
                Departure Date
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {dateFilterField !== 'none' && (
          <View style={styles.dateFilterInputsRow}>
            <View style={styles.dateFilterInputItem}>
              <Text style={styles.dateFilterInputLabel}>From:</Text>
              <DatePickerInput
                value={dateFilterStart}
                onChange={d => {
                  setDateFilterStart(d);
                  setCurrentPage(1);
                }}
                placeholder="Start Date"
                compact
                allowClear
                title={`Filter ${dateFilterField === 'book_date' ? 'Book Date' : 'Departure Date'} From`}
                style={{ width: 140 }}
              />
            </View>

            <View style={styles.dateFilterInputItem}>
              <Text style={styles.dateFilterInputLabel}>To:</Text>
              <DatePickerInput
                value={dateFilterEnd}
                onChange={d => {
                  setDateFilterEnd(d);
                  setCurrentPage(1);
                }}
                placeholder="End Date"
                compact
                allowClear
                title={`Filter ${dateFilterField === 'book_date' ? 'Book Date' : 'Departure Date'} To`}
                style={{ width: 140 }}
              />
            </View>

            {(!!dateFilterStart || !!dateFilterEnd) && (
              <TouchableOpacity
                style={styles.clearDateFilterBtn}
                onPress={() => {
                  setDateFilterStart('');
                  setDateFilterEnd('');
                  setCurrentPage(1);
                }}
              >
                <Text style={styles.clearDateFilterBtnText}>✕ Reset Range</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Inline Editing Hint Bar */}
      {selectedDataset === 'normalized' && (
        <View style={styles.inlineEditHintBar}>
          <Text style={styles.inlineEditHintText}>
            💡 Click any cell (or ✎) to edit in-place. Press <Text style={{ fontWeight: 'bold' }}>Enter</Text> or <Text style={{ fontWeight: 'bold' }}>✓</Text> to save. Click <Text style={{ fontWeight: 'bold' }}>View 🔍</Text> for full history.
          </Text>
          {toastMessage && (
            <View style={styles.toastBadge}>
              <Text style={styles.toastText}>{toastMessage}</Text>
            </View>
          )}
        </View>
      )}

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
                <View 
                  key={row.id || index} 
                  style={[styles.row, index % 2 === 1 && styles.evenRow]}
                >
                  <View style={[styles.cell, styles.idCell]}>
                    <Text style={styles.cellText} numberOfLines={1}>{row.id}</Text>
                  </View>
                  <TouchableOpacity 
                    style={[styles.cell, styles.actionCell]}
                    onPress={() => handleRowClick(row)}
                  >
                    <Text style={styles.viewBadge}>View 🔍</Text>
                  </TouchableOpacity>
                  {columns.map(col => {
                    const isEditing = editingCell?.rowId === row.id && editingCell?.field === col;
                    const cellKey = `${row.id}:${col}`;
                    const isSaving = savingCellKey === cellKey;
                    const val = String(row[col] ?? '');

                    if (isEditing) {
                      const isDate = isDateColumn(col);
                      return (
                        <View key={col} style={[styles.cell, styles.dataCell, styles.editingCellContainer]}>
                          <TextInput
                            style={[styles.inlineInput, isDate && styles.inlineDateInput]}
                            value={editingCell.value}
                            onChangeText={text => setEditingCell(prev => prev ? { ...prev, value: text } : null)}
                            onSubmitEditing={handleSaveCell}
                            placeholder={isDate ? 'YYYY-MM-DD' : undefined}
                            placeholderTextColor="#94a3b8"
                            autoFocus
                            selectTextOnFocus
                          />
                          {isDate && (
                            <TouchableOpacity
                              style={styles.cellCalendarBtn}
                              onPress={() => setCellDatePickerVisible(true)}
                              accessibilityLabel="Open calendar date picker"
                            >
                              <Text style={styles.cellCalendarIcon}>📅</Text>
                            </TouchableOpacity>
                          )}
                          <View style={styles.inlineActions}>
                            <TouchableOpacity style={styles.saveActionBtn} onPress={handleSaveCell} accessibilityLabel="Save">
                              <Text style={styles.saveActionText}>✓</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.cancelActionBtn} onPress={handleCancelCell} accessibilityLabel="Cancel">
                              <Text style={styles.cancelActionText}>✕</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    }

                    return (
                      <TouchableOpacity
                        key={col}
                        style={[
                          styles.cell,
                          styles.dataCell,
                          selectedDataset === 'normalized' && styles.editableCell
                        ]}
                        onPress={() => handleCellClick(row, col, val)}
                        activeOpacity={selectedDataset === 'normalized' ? 0.7 : 1}
                      >
                        <Text style={styles.cellText} numberOfLines={2}>
                          {val || (selectedDataset === 'normalized' ? '—' : '')}
                        </Text>
                        {isSaving ? (
                          <ActivityIndicator size="small" color="#2563eb" style={{ marginLeft: 4 }} />
                        ) : selectedDataset === 'normalized' ? (
                          <Text style={styles.editPencil}>{isDateColumn(col) ? '📅' : '✎'}</Text>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
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

      {/* Detainee Master-Detail Modal */}
      <DetaineeDetailModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        detainee={selectedDetainee}
        onDetaineeUpdated={loadNormalizedDetainees}
      />

      {/* DatePicker Modal for Inline Cell Editing */}
      <DatePickerModal
        visible={cellDatePickerVisible}
        value={editingCell?.value || ''}
        onSelect={dateStr => {
          setEditingCell(prev => prev ? { ...prev, value: dateStr } : null);
          setCellDatePickerVisible(false);
        }}
        onClose={() => setCellDatePickerVisible(false)}
        title={editingCell ? `Select ${editingCell.field}` : 'Select Date'}
        allowClear
        onClear={() => {
          setEditingCell(prev => prev ? { ...prev, value: '' } : null);
          setCellDatePickerVisible(false);
        }}
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
  dateFilterBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dateFilterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateFilterTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  dateFilterPills: {
    flexDirection: 'row',
    gap: 6,
  },
  dateFilterPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dateFilterPillActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  dateFilterPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  dateFilterPillTextActive: {
    color: '#1d4ed8',
  },
  dateFilterInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  dateFilterInputItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateFilterInputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  clearDateFilterBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  clearDateFilterBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#dc2626',
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
  inlineEditHintBar: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#dbeafe',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inlineEditHintText: {
    fontSize: 12,
    color: '#1e40af',
  },
  toastBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  toastText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  editableCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editPencil: {
    fontSize: 11,
    color: '#94a3b8',
    marginLeft: 6,
    opacity: 0.6,
  },
  editingCellContainer: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#2563eb',
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
    minWidth: 0,
    overflow: 'hidden',
  },
  inlineInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    color: '#0f172a',
    padding: 0,
    height: 28,
  },
  inlineDateInput: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: -0.2,
  },
  cellCalendarBtn: {
    flexShrink: 0,
    paddingVertical: 2,
    paddingHorizontal: 4,
    marginRight: 4,
    backgroundColor: '#eff6ff',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  cellCalendarIcon: {
    fontSize: 12,
  },
  inlineActions: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 2,
  },
  saveActionBtn: {
    backgroundColor: '#10b981',
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  saveActionText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  cancelActionBtn: {
    backgroundColor: '#94a3b8',
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  cancelActionText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
