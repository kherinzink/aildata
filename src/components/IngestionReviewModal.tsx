import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Modal, ActivityIndicator, Platform } from 'react-native';
import { FlaggedRecord, CuratedDecision, CleanRecord, IngestionCommitPayload, IngestionCommitResult, commitCuratedBatch } from '../services/dataService';

interface IngestionReviewModalProps {
  visible: boolean;
  category: string;
  cleanRows: CleanRecord[];
  flaggedItems: FlaggedRecord[];
  onClose: () => void;
  onCommitSuccess: (result: IngestionCommitResult) => void;
}

export function IngestionReviewModal({
  visible,
  category,
  cleanRows,
  flaggedItems,
  onClose,
  onCommitSuccess
}: IngestionReviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, {
    action: 'merge' | 'create_new' | 'skip';
    chosenSource: 'existing' | 'incoming' | 'custom';
  }>>(() => {
    // Initialize default decisions based on system suggestions
    const initial: Record<string, { action: 'merge' | 'create_new' | 'skip'; chosenSource: 'existing' | 'incoming' | 'custom' }> = {};
    flaggedItems.forEach(item => {
      if (item.suggestedAction === 'skip') {
        initial[item.id] = { action: 'skip', chosenSource: 'existing' };
      } else if (item.suggestedAction === 'create_new') {
        initial[item.id] = { action: 'create_new', chosenSource: 'incoming' };
      } else {
        initial[item.id] = { action: 'merge', chosenSource: 'incoming' };
      }
    });
    return initial;
  });

  const [filterType, setFilterType] = useState<string>('ALL');
  const [committing, setCommitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!visible || flaggedItems.length === 0) return null;

  // Filter items if user selects specific category
  const filteredIndices = flaggedItems
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => filterType === 'ALL' || item.matchType === filterType)
    .map(({ idx }) => idx);

  const activeIndex = filteredIndices.includes(currentIndex) ? currentIndex : (filteredIndices[0] || 0);
  const currentItem = flaggedItems[activeIndex];
  const currentDecision = decisions[currentItem.id] || {
    action: currentItem.suggestedAction,
    chosenSource: currentItem.suggestedAction === 'skip' ? 'existing' : 'incoming'
  };

  const setDecisionForCurrent = (action: 'merge' | 'create_new' | 'skip', chosenSource: 'existing' | 'incoming' | 'custom') => {
    setDecisions(prev => ({
      ...prev,
      [currentItem.id]: { action, chosenSource }
    }));
  };

  const applyActionToAllOfSameType = (type: string, action: 'merge' | 'create_new' | 'skip', source: 'existing' | 'incoming' | 'custom') => {
    setDecisions(prev => {
      const updated = { ...prev };
      flaggedItems.forEach(item => {
        if (item.matchType === type) {
          updated[item.id] = { action, chosenSource: source };
        }
      });
      return updated;
    });
  };

  const handleCommit = async () => {
    setCommitting(true);
    setErrorMessage(null);

    try {
      const curatedDecisions: CuratedDecision[] = flaggedItems.map(item => {
        const dec = decisions[item.id] || { action: item.suggestedAction, chosenSource: 'incoming' };
        return {
          id: item.id,
          rowIndex: item.rowIndex,
          action: dec.action,
          chosenSource: dec.chosenSource,
          targetDetaineeId: item.existingDetainee?.id,
          targetDetentionId: item.existingDetention?.id,
          incomingRow: JSON.parse(item.rawJson)
        };
      });

      const payload: IngestionCommitPayload = {
        category,
        cleanRows,
        curatedDecisions
      };

      const result = await commitCuratedBatch(payload);
      onCommitSuccess(result);
    } catch (e: any) {
      setErrorMessage(e.message || 'Failed to commit curated records');
    } finally {
      setCommitting(false);
    }
  };

  // Decision tally
  const tally = {
    merge: 0,
    skip: 0,
    create_new: 0
  };
  Object.values(decisions).forEach(d => {
    if (d.action === 'merge') tally.merge++;
    if (d.action === 'skip') tally.skip++;
    if (d.action === 'create_new') tally.create_new++;
  });

  const getBadgeStyle = (matchType: string) => {
    switch (matchType) {
      case 'EXACT_DUPLICATE':
        return { bg: '#dbeafe', text: '#1e40af', label: '🔵 Exact Duplicate Stay' };
      case 'STAY_UPDATE':
        return { bg: '#fef3c7', text: '#92400e', label: '🟡 Stay Update / Enriched Data' };
      case 'REPEAT_BOOKING':
        return { bg: '#ede9fe', text: '#5b21b6', label: '🟣 Repeat Booking (Recidivism)' };
      case 'AMBIGUOUS_MATCH':
        return { bg: '#ffedd5', text: '#9a3412', label: '🟠 Name & Country Match (Ambiguous)' };
      case 'KEY_CONFLICT':
        return { bg: '#fee2e2', text: '#991b1b', label: '🔴 High Conflict (Jacket Reused?)' };
      default:
        return { bg: '#f1f5f9', text: '#334155', label: matchType };
    }
  };

  const badge = getBadgeStyle(currentItem.matchType);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>📋 Ingestion Curation & Deduplication Review</Text>
              <Text style={styles.subTitle}>
                Reviewing flagged record {activeIndex + 1} of {flaggedItems.length} (Row #{currentItem.rowIndex + 1} in spreadsheet)
              </Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} disabled={committing}>
              <Text style={styles.closeButtonText}>✕ Close</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Filter Bar */}
          <View style={styles.filterBar}>
            <Text style={styles.filterLabel}>Filter by Conflict Type:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
              {[
                { key: 'ALL', label: `All (${flaggedItems.length})` },
                { key: 'EXACT_DUPLICATE', label: 'Exact Duplicates' },
                { key: 'STAY_UPDATE', label: 'Stay Updates' },
                { key: 'REPEAT_BOOKING', label: 'Repeat Bookings' },
                { key: 'AMBIGUOUS_MATCH', label: 'Ambiguous' },
                { key: 'KEY_CONFLICT', label: 'Conflicts' },
              ].map(f => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterChip, filterType === f.key && styles.activeFilterChip]}
                  onPress={() => setFilterType(f.key)}
                >
                  <Text style={[styles.filterChipText, filterType === f.key && styles.activeFilterChipText]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyContainer}>
            {/* Status & Match Rationale Banner */}
            <View style={[styles.rationaleCard, { backgroundColor: badge.bg, borderColor: badge.text }]}>
              <View style={styles.rationaleHeader}>
                <View style={[styles.typeBadge, { backgroundColor: badge.text }]}>
                  <Text style={styles.typeBadgeText}>{badge.label}</Text>
                </View>
                <Text style={styles.systemSuggestion}>
                  Suggested Action: <Text style={{ fontWeight: 'bold' }}>{currentItem.suggestedAction.toUpperCase()}</Text>
                </Text>
              </View>
              <Text style={[styles.rationaleText, { color: badge.text }]}>{currentItem.reason}</Text>
            </View>

            {/* MASTER SELECTION SECTION: Which side are you choosing? */}
            <View style={styles.choiceSection}>
              <Text style={styles.choiceSectionTitle}>
                👉 SELECT YOUR DECISION: WHICH SIDE DO YOU CHOOSE FOR THIS RECORD?
              </Text>
              <Text style={styles.choiceSectionSubtitle}>
                Click one of the three options below. Your active choice is highlighted with a bold colored border and banner.
              </Text>

              <View style={styles.cardsRow}>
                {/* CHOICE 1: KEEP DATABASE */}
                <TouchableOpacity
                  style={[
                    styles.choiceCard,
                    styles.databaseChoiceCard,
                    currentDecision.action === 'skip' && styles.databaseChoiceCardActive
                  ]}
                  onPress={() => setDecisionForCurrent('skip', 'existing')}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.choiceIcon}>🗄️</Text>
                    <Text style={[styles.choiceCardTitle, { color: '#1e3a8a' }]}>
                      KEEP DATABASE
                    </Text>
                  </View>
                  <Text style={styles.choiceCardSubtitle}>
                    (Discard Incoming Spreadsheet Row)
                  </Text>
                  <Text style={styles.choiceCardDesc}>
                    Preserve the current database values exactly as they are. The incoming spreadsheet row is ignored.
                  </Text>

                  {currentDecision.action === 'skip' ? (
                    <View style={[styles.selectedBanner, { backgroundColor: '#2563eb' }]}>
                      <Text style={styles.selectedBannerText}>✓ ACTIVE: DATABASE PRESERVED</Text>
                    </View>
                  ) : (
                    <View style={styles.unselectedBanner}>
                      <Text style={styles.unselectedBannerText}>Click to Choose Database</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* CHOICE 2: UPDATE FROM SPREADSHEET */}
                <TouchableOpacity
                  style={[
                    styles.choiceCard,
                    styles.spreadsheetChoiceCard,
                    currentDecision.action === 'merge' && styles.spreadsheetChoiceCardActive
                  ]}
                  onPress={() => setDecisionForCurrent('merge', 'incoming')}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.choiceIcon}>📊</Text>
                    <Text style={[styles.choiceCardTitle, { color: '#065f46' }]}>
                      UPDATE FROM SPREADSHEET
                    </Text>
                  </View>
                  <Text style={styles.choiceCardSubtitle}>
                    (Merge & Overwrite Database)
                  </Text>
                  <Text style={styles.choiceCardDesc}>
                    Link to this existing detainee, updating with new or changed fields (departure date, cell, new charges).
                  </Text>

                  {currentDecision.action === 'merge' ? (
                    <View style={[styles.selectedBanner, { backgroundColor: '#059669' }]}>
                      <Text style={styles.selectedBannerText}>✓ ACTIVE: SPREADSHEET WINS</Text>
                    </View>
                  ) : (
                    <View style={styles.unselectedBanner}>
                      <Text style={styles.unselectedBannerText}>Click to Choose Spreadsheet</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* CHOICE 3: CREATE AS NEW INDIVIDUAL */}
                <TouchableOpacity
                  style={[
                    styles.choiceCard,
                    styles.splitChoiceCard,
                    currentDecision.action === 'create_new' && styles.splitChoiceCardActive
                  ]}
                  onPress={() => setDecisionForCurrent('create_new', 'incoming')}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.choiceIcon}>👤➕</Text>
                    <Text style={[styles.choiceCardTitle, { color: '#5b21b6' }]}>
                      CREATE AS SEPARATE PERSON
                    </Text>
                  </View>
                  <Text style={styles.choiceCardSubtitle}>
                    (Do Not Merge — Split Profiles)
                  </Text>
                  <Text style={styles.choiceCardDesc}>
                    Do not link to this existing detainee. Create a completely separate person (e.g. recycled jacket # or different person).
                  </Text>

                  {currentDecision.action === 'create_new' ? (
                    <View style={[styles.selectedBanner, { backgroundColor: '#7c3aed' }]}>
                      <Text style={styles.selectedBannerText}>✓ ACTIVE: SPLIT AS NEW PERSON</Text>
                    </View>
                  ) : (
                    <View style={styles.unselectedBanner}>
                      <Text style={styles.unselectedBannerText}>Click to Split Profile</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* SIDE-BY-SIDE FIELD COMPARISON TABLE */}
            <View style={styles.diffTableSection}>
              <View style={styles.diffTableHeadingBar}>
                <Text style={styles.diffTableTitle}>🔍 Side-by-Side Field Attribute Comparison</Text>
                <Text style={styles.diffTableHint}>
                  {currentDecision.action === 'skip' && '🗄️ Currently set to KEEP DATABASE: Left column values will be preserved.'}
                  {currentDecision.action === 'merge' && '📊 Currently set to SPREADSHEET MERGE: Right column values will update the database.'}
                  {currentDecision.action === 'create_new' && '👤➕ Currently set to CREATE NEW: Right column values will create a brand new profile.'}
                </Text>
              </View>

              {/* Table Column Headers */}
              <View style={styles.tableHeaderRow}>
                <View style={[styles.columnHeader, styles.leftColumnHeader, currentDecision.action === 'skip' && styles.activeColumnHeaderBlue]}>
                  <Text style={styles.columnHeaderText}>
                    🗄️ CURRENT IN DATABASE
                  </Text>
                  <Text style={styles.columnSubheader}>
                    ID: {currentItem.existingDetainee?.id?.substring(0, 16)}...
                  </Text>
                </View>

                <View style={[styles.columnHeader, styles.centerColumnHeader]}>
                  <Text style={styles.columnHeaderTextCenter}>FIELD ATTRIBUTE</Text>
                  <Text style={styles.columnSubheaderCenter}>Change Status</Text>
                </View>

                <View style={[styles.columnHeader, styles.rightColumnHeader, currentDecision.action === 'merge' && styles.activeColumnHeaderGreen]}>
                  <Text style={styles.columnHeaderText}>
                    📊 INCOMING SPREADSHEET
                  </Text>
                  <Text style={styles.columnSubheader}>
                    Row #{currentItem.rowIndex + 1}
                  </Text>
                </View>
              </View>

              {/* Table Rows */}
              {currentItem.diffs.map((diff, dIdx) => {
                const isChanged = diff.status === 'changed';
                const isAdded = diff.status === 'added';
                const isIdentical = diff.status === 'identical';

                // Highlighting based on decision
                const leftHighlight = currentDecision.action === 'skip' || (currentDecision.action === 'merge' && isIdentical);
                const rightHighlight = (currentDecision.action === 'merge' && (isChanged || isAdded)) || currentDecision.action === 'create_new';

                return (
                  <View key={diff.field} style={[styles.tableRow, dIdx % 2 === 1 && styles.tableRowAlt]}>
                    {/* Left Cell: Database */}
                    <View style={[
                      styles.cell,
                      styles.leftCell,
                      leftHighlight && styles.cellChosenBlue,
                      currentDecision.action === 'merge' && (isChanged || isAdded) && styles.cellReplaced
                    ]}>
                      <Text style={[
                        styles.cellValue,
                        !diff.existing && styles.emptyValue,
                        currentDecision.action === 'merge' && (isChanged || isAdded) && styles.cellValueOverwritten
                      ]}>
                        {diff.existing || '(None / Empty)'}
                      </Text>
                      {currentDecision.action === 'skip' && (
                        <Text style={styles.badgeLeftKept}>✓ PRESERVED</Text>
                      )}
                    </View>

                    {/* Center Cell: Attribute & Status */}
                    <View style={[styles.cell, styles.centerCell]}>
                      <Text style={styles.fieldLabel}>{diff.label}</Text>
                      {isIdentical && <Text style={styles.statusIdentical}>= Same</Text>}
                      {isChanged && <Text style={styles.statusChanged}>⚠️ Changed</Text>}
                      {isAdded && <Text style={styles.statusAdded}>🟢 New Data</Text>}
                      {diff.status === 'removed' && <Text style={styles.statusRemoved}>ℹ️ Unchanged</Text>}
                    </View>

                    {/* Right Cell: Spreadsheet */}
                    <View style={[
                      styles.cell,
                      styles.rightCell,
                      rightHighlight && styles.cellChosenGreen,
                      currentDecision.action === 'skip' && isChanged && styles.cellIgnored
                    ]}>
                      <Text style={[
                        styles.cellValue,
                        !diff.incoming && styles.emptyValue,
                        rightHighlight && styles.cellValueHighlight
                      ]}>
                        {diff.incoming || '(None / Empty)'}
                      </Text>
                      {currentDecision.action === 'merge' && (isChanged || isAdded) && (
                        <Text style={styles.badgeRightApplied}>🟢 WILL OVERWRITE</Text>
                      )}
                      {currentDecision.action === 'skip' && (
                        <Text style={styles.badgeRightIgnored}>✕ DROPPED</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Quick Bulk Action for this specific type */}
            <View style={styles.bulkShortcutCard}>
              <Text style={styles.bulkShortcutTitle}>⚡ Batch Action for Similar Records:</Text>
              <Text style={styles.bulkShortcutText}>
                Apply your current choice ({currentDecision.action.toUpperCase()}) to all {
                  flaggedItems.filter(i => i.matchType === currentItem.matchType).length
                } records of type "{currentItem.matchType}":
              </Text>
              <TouchableOpacity
                style={styles.bulkShortcutButton}
                onPress={() => applyActionToAllOfSameType(currentItem.matchType, currentDecision.action, currentDecision.chosenSource)}
              >
                <Text style={styles.bulkShortcutButtonText}>
                  Apply "{currentDecision.action === 'skip' ? 'Keep Database' : currentDecision.action === 'merge' ? 'Update from Spreadsheet' : 'Create New'}" to All {currentItem.matchType} Records
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Error display */}
          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ Error: {errorMessage}</Text>
            </View>
          )}

          {/* Footer Bar */}
          <View style={styles.footer}>
            {/* Stepper Navigation */}
            <View style={styles.stepperContainer}>
              <TouchableOpacity
                style={[styles.stepperButton, activeIndex === 0 && styles.stepperButtonDisabled]}
                disabled={activeIndex === 0}
                onPress={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
              >
                <Text style={styles.stepperButtonText}>⬅️ Previous</Text>
              </TouchableOpacity>

              <Text style={styles.stepperStatusText}>
                Record {activeIndex + 1} of {flaggedItems.length}
              </Text>

              <TouchableOpacity
                style={[styles.stepperButton, activeIndex === flaggedItems.length - 1 && styles.stepperButtonDisabled]}
                disabled={activeIndex === flaggedItems.length - 1}
                onPress={() => setCurrentIndex(prev => Math.min(flaggedItems.length - 1, prev + 1))}
              >
                <Text style={styles.stepperButtonText}>Next ➡️</Text>
              </TouchableOpacity>
            </View>

            {/* Tally & Final Commit Action */}
            <View style={styles.commitContainer}>
              <View style={styles.tallyBox}>
                <Text style={styles.tallyText}>
                  Decisions: <Text style={{ color: '#059669', fontWeight: 'bold' }}>{tally.merge} Update/Merge</Text> •{' '}
                  <Text style={{ color: '#2563eb', fontWeight: 'bold' }}>{tally.skip} Keep DB</Text> •{' '}
                  <Text style={{ color: '#7c3aed', fontWeight: 'bold' }}>{tally.create_new} Split New</Text>
                </Text>
                <Text style={styles.cleanCountNotice}>
                  +{cleanRows.length} clean new rows will also be ingested
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.commitButton, committing && styles.commitButtonDisabled]}
                disabled={committing}
                onPress={handleCommit}
              >
                {committing ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.commitButtonText}>
                    ✓ Confirm & Ingest All ({cleanRows.length + flaggedItems.length} Total Rows)
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  subTitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 3,
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  filterBar: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginRight: 12,
  },
  filterScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
  },
  activeFilterChip: {
    backgroundColor: '#2563eb',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  activeFilterChipText: {
    color: '#ffffff',
  },
  bodyScroll: {
    flex: 1,
  },
  bodyContainer: {
    padding: 24,
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
  rationaleCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 20,
  },
  rationaleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  systemSuggestion: {
    fontSize: 13,
    color: '#1e293b',
  },
  rationaleText: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  choiceSection: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  choiceSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.5,
  },
  choiceSectionSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 16,
  },
  cardsRow: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: 16,
  },
  choiceCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: 180,
  },
  databaseChoiceCard: {
    backgroundColor: '#f8fafc',
  },
  databaseChoiceCardActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
    borderWidth: 3,
  },
  spreadsheetChoiceCard: {
    backgroundColor: '#f8fafc',
  },
  spreadsheetChoiceCardActive: {
    borderColor: '#059669',
    backgroundColor: '#ecfdf5',
    borderWidth: 3,
  },
  splitChoiceCard: {
    backgroundColor: '#f8fafc',
  },
  splitChoiceCardActive: {
    borderColor: '#7c3aed',
    backgroundColor: '#f5f3ff',
    borderWidth: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  choiceIcon: {
    fontSize: 22,
  },
  choiceCardTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  choiceCardSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  choiceCardDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
    flex: 1,
  },
  selectedBanner: {
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 12,
  },
  selectedBannerText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  unselectedBanner: {
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: '#e2e8f0',
  },
  unselectedBannerText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  diffTableSection: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  diffTableHeadingBar: {
    padding: 16,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  diffTableTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  diffTableHint: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
    marginTop: 4,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 2,
    borderBottomColor: '#cbd5e1',
  },
  columnHeader: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  leftColumnHeader: {
    flex: 2,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  centerColumnHeader: {
    flex: 1.5,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  rightColumnHeader: {
    flex: 2,
  },
  activeColumnHeaderBlue: {
    backgroundColor: '#dbeafe',
  },
  activeColumnHeaderGreen: {
    backgroundColor: '#d1fae5',
  },
  columnHeaderText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  columnSubheader: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  columnHeaderTextCenter: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  columnSubheaderCenter: {
    fontSize: 11,
    color: '#94a3b8',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    minHeight: 52,
  },
  tableRowAlt: {
    backgroundColor: '#fafbfc',
  },
  cell: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  leftCell: {
    flex: 2,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  centerCell: {
    flex: 1.5,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  rightCell: {
    flex: 2,
  },
  cellChosenBlue: {
    backgroundColor: '#eff6ff',
  },
  cellChosenGreen: {
    backgroundColor: '#f0fdf4',
  },
  cellReplaced: {
    opacity: 0.6,
  },
  cellIgnored: {
    opacity: 0.5,
  },
  cellValue: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '500',
  },
  cellValueHighlight: {
    color: '#065f46',
    fontWeight: '700',
  },
  cellValueOverwritten: {
    textDecorationLine: 'line-through',
    color: '#94a3b8',
  },
  emptyValue: {
    fontStyle: 'italic',
    color: '#94a3b8',
  },
  badgeLeftKept: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563eb',
    marginTop: 4,
  },
  badgeRightApplied: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    marginTop: 4,
  },
  badgeRightIgnored: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
  },
  statusIdentical: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  statusChanged: {
    fontSize: 11,
    fontWeight: '700',
    color: '#d97706',
    marginTop: 2,
  },
  statusAdded: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a',
    marginTop: 2,
  },
  statusRemoved: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  bulkShortcutCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 20,
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  bulkShortcutTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  bulkShortcutText: {
    fontSize: 13,
    color: '#64748b',
    flex: 1,
  },
  bulkShortcutButton: {
    backgroundColor: '#334155',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  bulkShortcutButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderTopWidth: 1,
    borderTopColor: '#fecaca',
    padding: 12,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  stepperButtonDisabled: {
    opacity: 0.4,
  },
  stepperButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  stepperStatusText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  commitContainer: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    alignItems: 'center',
    gap: 16,
  },
  tallyBox: {
    alignItems: Platform.OS === 'web' ? 'flex-end' : 'center',
  },
  tallyText: {
    fontSize: 13,
    color: '#334155',
  },
  cleanCountNotice: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  commitButton: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  commitButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  commitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
