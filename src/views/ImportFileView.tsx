import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Platform, ScrollView } from 'react-native';
import * as XLSX from 'xlsx';
import { insertBatchRecords } from '../services/dataService';

interface ImportFileViewProps {
  onImportComplete: () => void;
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

  const handleConfirmImport = async () => {
    if (!fileData) return;

    setLoading(true);
    setStatusMessage('Batch importing selected sheets...');

    try {
      let totalImported = 0;
      for (const [sheetName, isSelected] of Object.entries(sheetSelections)) {
        if (!isSelected) continue;

        const worksheet = fileData.workbook.Sheets[sheetName];
        const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, { raw: false, dateNF: 'yyyy-mm-dd', range: 1 });

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
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>📂 High-Performance Spreadsheet Import</Text>
        <Text style={styles.description}>
          Upload any CSV, ODS, or XLSX file. Rows are validated and bulk batch-inserted instantly to prevent page freezing.
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
              <Text style={styles.nativeNotice}>File upload supported on web preview.</Text>
            )}
          </View>
        ) : (
          <View style={styles.selectionContainer}>
            <Text style={styles.sectionHeader}>Select Sheets to Import from: {fileData.fileName}</Text>
            <ScrollView style={styles.sheetList}>
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
            </ScrollView>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setFileData(null)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.importButton} onPress={handleConfirmImport}>
                <Text style={styles.importButtonText}>Batch Import Selected Sheets</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#f8fafc',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 30,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    maxWidth: 650,
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
    marginBottom: 12,
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
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 10,
  },
  sheetList: {
    maxHeight: 200,
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
    fontSize: 18,
    marginRight: 12,
  },
  sheetName: {
    fontSize: 14,
    color: '#334155',
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
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
