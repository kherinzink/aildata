import React from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, ScrollView } from 'react-native';

export interface DetaineeDetailRecord {
  id?: string;
  name?: string;
  jacket_number?: string;
  ice_case_number?: string;
  age?: string;
  race?: string;
  sex?: string;
  country?: string;
  // Detentions
  book_date_gcj?: string;
  departure_date?: string;
  cell?: string;
  days_in_gcj?: string;
  days_prior_facility?: string;
  came_from?: string;
  sent_to_note?: string;
  delivering_agency?: string;
  duplicate_jacket_returned?: string;
  // Charges & Legal
  charges?: string[];
  judge_ordered?: string;
  decision_date?: string;
  day_wait?: string;
  notes?: string;
  // Correspondence
  penpal?: string;
  loc_note?: string;
  // Raw Data fallback
  rawAttributes?: Record<string, any>;
}

interface DetaineeDetailModalProps {
  visible: boolean;
  onClose: () => void;
  detainee: DetaineeDetailRecord | null;
}

export function DetaineeDetailModal({ visible, onClose, detainee }: DetaineeDetailModalProps) {
  if (!detainee) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{detainee.name || 'Detainee Record'}</Text>
              <Text style={styles.subtitle}>
                Jacket: {detainee.jacket_number || 'N/A'} • ICE Case / A#: {detainee.ice_case_number || 'N/A'}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body}>
            {/* Core Profile */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>👤 Core Demographics & Identity</Text>
              <View style={styles.grid}>
                <View style={styles.field}>
                  <Text style={styles.label}>Country of Origin</Text>
                  <Text style={styles.value}>{detainee.country || 'Unknown'}</Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Age</Text>
                  <Text style={styles.value}>{detainee.age || 'N/A'}</Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Sex</Text>
                  <Text style={styles.value}>{detainee.sex || 'N/A'}</Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Race</Text>
                  <Text style={styles.value}>{detainee.race || 'N/A'}</Text>
                </View>
              </View>
            </View>

            {/* Detention & Custody Info */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🏢 Detention & Facility History</Text>
              <View style={styles.grid}>
                <View style={styles.field}>
                  <Text style={styles.label}>Book Date in GCJ</Text>
                  <Text style={styles.value}>{detainee.book_date_gcj || 'N/A'}</Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Departure / Release Date</Text>
                  <Text style={styles.value}>{detainee.departure_date || 'Present / In Custody'}</Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Housing Cell</Text>
                  <Text style={styles.value}>{detainee.cell || 'N/A'}</Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Days in GCJ</Text>
                  <Text style={styles.value}>{detainee.days_in_gcj || 'N/A'}</Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Delivering Agency</Text>
                  <Text style={styles.value}>{detainee.delivering_agency || 'N/A'}</Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Came From</Text>
                  <Text style={styles.value}>{detainee.came_from || 'N/A'}</Text>
                </View>
                <View style={styles.fieldFull}>
                  <Text style={styles.label}>Sent To / Release Note</Text>
                  <Text style={styles.value}>{detainee.sent_to_note || 'None recorded'}</Text>
                </View>
              </View>
            </View>

            {/* Charges */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>⚖️ Charges & Offenses</Text>
              {detainee.charges && detainee.charges.length > 0 ? (
                detainee.charges.map((charge, idx) => (
                  <View key={idx} style={styles.chargeItem}>
                    <Text style={styles.chargeBullet}>•</Text>
                    <Text style={styles.chargeText}>{charge}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyNote}>No formal criminal or civil charges listed.</Text>
              )}
            </View>

            {/* Legal Proceedings */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🏛️ Legal Proceedings & Orders</Text>
              <View style={styles.grid}>
                <View style={styles.field}>
                  <Text style={styles.label}>Judge Ordered?</Text>
                  <Text style={styles.value}>{detainee.judge_ordered || 'N/A'}</Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Decision Date</Text>
                  <Text style={styles.value}>{detainee.decision_date || 'N/A'}</Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Day Wait</Text>
                  <Text style={styles.value}>{detainee.day_wait || 'N/A'}</Text>
                </View>
                <View style={styles.fieldFull}>
                  <Text style={styles.label}>Habeas / Legal Notes</Text>
                  <Text style={styles.value}>{detainee.notes || 'None recorded'}</Text>
                </View>
              </View>
            </View>

            {/* Correspondence */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>✉️ Correspondence & Penpals</Text>
              <View style={styles.grid}>
                <View style={styles.field}>
                  <Text style={styles.label}>Penpal</Text>
                  <Text style={styles.value}>{detainee.penpal || 'None'}</Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Location / Former Penpal Note</Text>
                  <Text style={styles.value}>{detainee.loc_note || 'None'}</Text>
                </View>
              </View>
            </View>

            {/* Raw attributes preview if present */}
            {detainee.rawAttributes && Object.keys(detainee.rawAttributes).length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📋 Raw Ingested Attributes</Text>
                <View style={styles.rawBox}>
                  {Object.entries(detainee.rawAttributes).map(([k, v]) => (
                    <View key={k} style={styles.rawRow}>
                      <Text style={styles.rawKey}>{k}:</Text>
                      <Text style={styles.rawValue}>{String(v)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.dismissButton} onPress={onClose}>
              <Text style={styles.dismissButtonText}>Close Record</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    maxWidth: 700,
    width: '100%',
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  closeButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#64748b',
  },
  body: {
    padding: 20,
  },
  section: {
    marginBottom: 20,
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  field: {
    flex: 1,
    minWidth: 140,
  },
  fieldFull: {
    width: '100%',
    marginTop: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
  },
  chargeItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  chargeBullet: {
    fontSize: 14,
    color: '#2563eb',
    marginRight: 6,
    fontWeight: 'bold',
  },
  chargeText: {
    fontSize: 13,
    color: '#334155',
    flex: 1,
  },
  emptyNote: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  rawBox: {
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rawRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  rawKey: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    width: 180,
  },
  rawValue: {
    fontSize: 12,
    color: '#0f172a',
    flex: 1,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  dismissButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  dismissButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
});
