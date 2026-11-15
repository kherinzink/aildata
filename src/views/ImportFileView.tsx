import React, { useState, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Platform, ScrollView } from 'react-native';
import * as XLSX from 'xlsx';
import { insertBatchRecords } from '../services/dataService';

interface ImportFileViewProps {
  onImportComplete: () => void;
}

const HEADER_TOKENS = ['name', 'jacket', 'country', 'coo', 'agency', 'book', 'charge', 'cell', 'race', 'sex', 'case', 'date', 'ice', 'penpal'];

function detectHeaderRow(worksheet: XLSX.WorkSheet): { headerRowIndex: number; headers: string[] } {
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
  const maxScan = Math.min(5, rows.length);
  
  let bestRowIndex = 0;
  let maxMatches = 0;
  let bestHeaders: string[] = [];

  for (let r = 0; r < maxScan; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const stringCells = row.map(cell => (cell ? String(cell).trim() : ''));
    let matches = 0;
    stringCells.forEach(cell => {
      const lower = cell.toLowerCase();
      if (HEADER_TOKENS.some(token => lower.includes(token))) {
        matches++;
      }
    });

    if (matches > maxMatches) {
      maxMatches = matches;
      bestRowIndex = r;
      bestHeaders = stringCells.filter(Boolean);
    }
  }

  if (maxMatches === 0 && rows.length > 0) {
    bestHeaders = (rows[0] || []).map(cell => (cell ? String(cell).trim() : '')).filter(Boolean);
  }

  return { headerRowIndex: bestRowIndex, headers: bestHeaders };
}

interface SheetPreview {
  sheetName: string;
  headerRowIndex: number;
  headers: string[];
  matchedCoreColumns: string[];
  totalRawRows: number;
  validRowsCount: number;
  skippedRowsCount: number;
  sampleRows: Record<string, any>[];
}

export function ImportFileView({ onImportComplete }: ImportFileViewProps) {
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  
  // Multi-sheet selection state
  const [fileData, setFileData] = useState<{ workbook: XLSX.WorkBook; fileName: string } | null>(null);
  const [sheetSelections, setSheetSelections] = useState<{ [sheetName: string]: boolean }>({});

  const handleWebFileChange = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatusMessage(`Analyzing ${file.name}...`);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      
      const selections: { [sheetName: string]: boolean } = {};
      workbook.SheetNames.forEach((name, index) => {
        const isAuxiliary = name.includes('#') || name.startsWith("'file://");
        selections[name] = !isAuxiliary && index === 0;
      });

      setFileData({ workbook, fileName: file.name });
      setSheetSelections(selections);
      setStatusMessage(null);
    } catch (e: any) {
      setStatusMessage(`Error reading file: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Compute pre-import preview for selected sheets
  const previews: SheetPreview[] = useMemo(() => {
    if (!fileData) return [];

    return fileData.workbook.SheetNames.filter(name => sheetSelections[name]).map(sheetName => {
      const worksheet = fileData.workbook.Sheets[sheetName];
      const { headerRowIndex, headers } = detectHeaderRow(worksheet);

      const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        dateNF: 'yyyy-mm-dd',
        range: headerRowIndex
      });

      const validRows: Record<string, any>[] = [];
      let skippedCount = 0;

      for (const row of jsonRows) {
        const hasValues = Object.values(row).some(val => val !== null && val !== undefined && String(val).trim() !== '');
        const hasName = Object.entries(row).some(([k, v]) => 
          k.toLowerCase().includes('name') && v !== null && String(v).trim() !== ''
        );

        if (hasValues && hasName) {
          validRows.push(row);
        } else {
          skippedCount++;
        }
      }

      const matchedCore = headers.filter(h => {
        const l = h.toLowerCase();
        return HEADER_TOKENS.some(token => l.includes(token));
      });

      return {
        sheetName,
        headerRowIndex,
        headers,
        matchedCoreColumns: matchedCore,
        totalRawRows: jsonRows.length,
        validRowsCount: validRows.length,
        skippedRowsCount: skippedCount,
        sampleRows: validRows.slice(0, 3)
      };
    });
  }, [fileData, sheetSelections]);

  const handleConfirmImport = async () => {
    if (!fileData) return;

    setLoading(true);
    setStatusMessage('Batch importing selected sheets...');

    try {
      let totalImported = 0;
      for (const [sheetName, isSelected] of Object.entries(sheetSelections)) {
        if (!isSelected) continue;

        const worksheet = fileData.workbook.Sheets[sheetName];
        const { headerRowIndex } = detectHeaderRow(worksheet);

        const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, {
          raw: false,
          dateNF: 'yyyy-mm-dd',
          range: headerRowIndex
        });

        const validRows: Record<string, any>[] = [];
        for (const row of jsonRows) {
          const hasValues = Object.values(row).some(val => val !== null && val !== undefined && String(val).trim() !== '');
          const hasName = Object.entries(row).some(([k, v]) => 
            k.toLowerCase().includes('name') && v !== null && String(v).trim() !== ''
          );

          if (hasValues && hasName) {
            validRows.push(row);
          }
        }

        if (validRows.length > 0) {
          const cleanCategory = sheetName.replace(/['#\\/]/g, '_');
          const count = await insertBatchRecords(`import_${cleanCategory}`, validRows);
          totalImported += count;
        }
      }

      setStatusMessage(`Successfully batch imported ${totalImported} valid records from ${fileData.fileName}!`);
      setFileData(null);
      onImportComplete();
    } catch (e: any) {
      setStatusMessage(`Error during batch import: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>📂 High-Performance Spreadsheet Ingestion</Text>
        <Text style={styles.description}>
          Upload any CSV, ODS, or XLSX spreadsheet. The scanner detects header rows dynamically and validates relational entities before batch ingestion.
        </Text>

        {!fileData ? (
          <View>
            {Platform.OS === 'web' ? (
              <View style={styles.uploadArea}>
                <input
                  type="file"
                  accept=".csv, .ods, .xlsx, .xls"
                  onChange={handleWebFileChange}
                  style={{ fontSize: 16, padding: 20, cursor: 'pointer', width: '100%' }}
                />
              </View>
            ) : (
              <Text style={styles.nativeNotice}>Web file picker active. On native, file system permissions apply.</Text>
            )}
          </View>
        ) : (
          <View style={styles.selectionContainer}>
            <Text style={styles.sectionHeader}>File: {fileData.fileName}</Text>
            <Text style={styles.subText}>Select sheets to inspect and import:</Text>
            
            <View style={styles.sheetList}>
              {fileData.workbook.SheetNames.map(sheetName => (
                <TouchableOpacity
                  key={sheetName}
                  style={styles.sheetItem}
                  onPress={() => setSheetSelections(prev => ({ ...prev, [sheetName]: !prev[sheetName] }))}
                >
                  <Text style={styles.checkbox}>{sheetSelections[sheetName] ? '☑️' : '☐'}</Text>
                  <Text style={styles.sheetName} numberOfLines={1}>{sheetName}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Pre-Import Previews */}
            {previews.length > 0 && (
              <View style={styles.previewContainer}>
                <Text style={styles.previewHeading}>📊 Pre-Import Validation & Column Mapping Preview</Text>
                {previews.map(preview => (
                  <View key={preview.sheetName} style={styles.previewCard}>
                    <View style={styles.previewHeader}>
                      <Text style={styles.previewSheetName}>Sheet: {preview.sheetName}</Text>
                      <Text style={styles.headerRowBadge}>Header Row: {preview.headerRowIndex + 1}</Text>
                    </View>

                    <View style={styles.statPills}>
                      <View style={[styles.statPill, { backgroundColor: '#dcfce7' }]}>
                        <Text style={[styles.statPillText, { color: '#166534' }]}>
                          ✓ {preview.validRowsCount} Valid Rows
                        </Text>
                      </View>
                      <View style={[styles.statPill, { backgroundColor: '#f1f5f9' }]}>
                        <Text style={[styles.statPillText, { color: '#475569' }]}>
                          ⊘ {preview.skippedRowsCount} Blank/Skipped
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.matchedHeading}>Matched Relational Columns:</Text>
                    <View style={styles.matchedColumns}>
                      {preview.matchedCoreColumns.map(col => (
                        <View key={col} style={styles.columnTag}>
                          <Text style={styles.columnTagText}>{col}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setFileData(null)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.importButton, previews.length === 0 && styles.disabledButton]} 
                disabled={previews.length === 0}
                onPress={handleConfirmImport}
              >
                <Text style={styles.importButtonText}>
                  Batch Ingest Selected ({previews.reduce((acc, p) => acc + p.validRowsCount, 0)} Rows)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>{statusMessage || 'Processing...'}</Text>
          </View>
        )}

        {statusMessage && !loading && (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 30,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    maxWidth: 720,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    marginBottom: 20,
  },
  uploadArea: {
    borderWidth: 2,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  nativeNotice: {
    color: '#64748b',
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 20,
  },
  selectionContainer: {
    marginTop: 10,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  subText: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 10,
  },
  sheetList: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: '#f8fafc',
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  checkbox: {
    fontSize: 16,
    marginRight: 10,
  },
  sheetName: {
    fontSize: 14,
    color: '#334155',
    flex: 1,
  },
  previewContainer: {
    marginVertical: 14,
  },
  previewHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  previewCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  previewSheetName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  headerRowBadge: {
    fontSize: 11,
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    fontWeight: '600',
  },
  statPills: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  statPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  matchedHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  matchedColumns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  columnTag: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  columnTagText: {
    fontSize: 11,
    color: '#3730a3',
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 10,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  cancelButtonText: {
    color: '#475569',
    fontWeight: '600',
  },
  importButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  importButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  loadingContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#2563eb',
    fontWeight: '500',
  },
  statusBox: {
    marginTop: 20,
    backgroundColor: '#dcfce7',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  statusText: {
    color: '#166534',
    fontWeight: '600',
    textAlign: 'center',
  },
});
