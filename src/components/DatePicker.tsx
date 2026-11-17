import React, { useState, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  TextInput,
  Platform,
  StyleProp,
  ViewStyle,
  TextStyle
} from 'react-native';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * Safely parse a YYYY-MM-DD or ISO string into a local Date object without UTC drift.
 */
export function parseISODate(dateStr?: string | null): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const match = dateStr.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const d = new Date(year, month, day);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format a Date object to YYYY-MM-DD.
 */
export function formatDateToISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayISO(): string {
  return formatDateToISO(new Date());
}

export interface DatePickerModalProps {
  visible: boolean;
  value?: string | null;
  onSelect: (dateStr: string) => void;
  onClose: () => void;
  title?: string;
  minDate?: string;
  maxDate?: string;
  allowClear?: boolean;
  onClear?: () => void;
}

export function DatePickerModal({
  visible,
  value,
  onSelect,
  onClose,
  title = 'Select Date',
  minDate,
  maxDate,
  allowClear = true,
  onClear
}: DatePickerModalProps) {
  const initialDate = useMemo(() => parseISODate(value) || new Date(), [value]);
  
  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth());

  // Reset to value month/year whenever modal opens
  useEffect(() => {
    if (visible) {
      const d = parseISODate(value) || new Date();
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [visible, value]);

  const todayStr = useMemo(() => getTodayISO(), []);
  const selectedStr = useMemo(() => (value && parseISODate(value) ? formatDateToISO(parseISODate(value)!) : ''), [value]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const handlePrevYear = () => setViewYear(y => y - 1);
  const handleNextYear = () => setViewYear(y => y + 1);

  // Generate 42 calendar grid cells (prev month overflow + current month + next month overflow)
  const calendarCells = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: {
      day: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      isDisabled: boolean;
    }[] = [];

    // Prev month days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const prevDate = new Date(viewYear, viewMonth - 1, day);
      const str = formatDateToISO(prevDate);
      cells.push({
        day,
        dateStr: str,
        isCurrentMonth: false,
        isToday: str === todayStr,
        isSelected: str === selectedStr,
        isDisabled: (minDate ? str < minDate : false) || (maxDate ? str > maxDate : false)
      });
    }

    // Current month days
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      const curDate = new Date(viewYear, viewMonth, day);
      const str = formatDateToISO(curDate);
      cells.push({
        day,
        dateStr: str,
        isCurrentMonth: true,
        isToday: str === todayStr,
        isSelected: str === selectedStr,
        isDisabled: (minDate ? str < minDate : false) || (maxDate ? str > maxDate : false)
      });
    }

    // Next month fill up to 42 cells (6 rows of 7)
    const remaining = 42 - cells.length;
    for (let day = 1; day <= remaining; day++) {
      const nextDate = new Date(viewYear, viewMonth + 1, day);
      const str = formatDateToISO(nextDate);
      cells.push({
        day,
        dateStr: str,
        isCurrentMonth: false,
        isToday: str === todayStr,
        isSelected: str === selectedStr,
        isDisabled: (minDate ? str < minDate : false) || (maxDate ? str > maxDate : false)
      });
    }

    return cells;
  }, [viewYear, viewMonth, todayStr, selectedStr, minDate, maxDate]);

  const handleSelectDay = (dateStr: string, isDisabled: boolean) => {
    if (isDisabled) return;
    onSelect(dateStr);
    onClose();
  };

  const handlePickToday = () => {
    onSelect(todayStr);
    onClose();
  };

  const handleClear = () => {
    if (onClear) onClear();
    else onSelect('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{title}</Text>
              <Text style={styles.modalSubtitle}>
                {selectedStr ? `Selected: ${selectedStr}` : 'No date chosen'}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Month & Year Navigation Bar */}
          <View style={styles.navBar}>
            <View style={styles.navYearGroup}>
              <TouchableOpacity style={styles.navYearBtn} onPress={handlePrevYear} accessibilityLabel="Previous Year">
                <Text style={styles.navYearBtnText}>«</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navMonthBtn} onPress={handlePrevMonth} accessibilityLabel="Previous Month">
                <Text style={styles.navMonthBtnText}>‹</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.navTitleContainer}>
              <Text style={styles.navMonthTitle}>{MONTH_NAMES[viewMonth]}</Text>
              <Text style={styles.navYearTitle}>{viewYear}</Text>
            </View>

            <View style={styles.navYearGroup}>
              <TouchableOpacity style={styles.navMonthBtn} onPress={handleNextMonth} accessibilityLabel="Next Month">
                <Text style={styles.navMonthBtnText}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navYearBtn} onPress={handleNextYear} accessibilityLabel="Next Year">
                <Text style={styles.navYearBtnText}>»</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Day of Week Labels */}
          <View style={styles.daysHeaderRow}>
            {DAY_LABELS.map((label, idx) => (
              <View key={idx} style={styles.dayLabelCell}>
                <Text style={[styles.dayLabelText, (idx === 0 || idx === 6) && styles.weekendLabelText]}>
                  {label}
                </Text>
              </View>
            ))}
          </View>

          {/* Calendar 6-week Grid */}
          <View style={styles.calendarGrid}>
            {calendarCells.map((cell, idx) => {
              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.cellTouchable,
                    cell.isToday && styles.todayCell,
                    cell.isSelected && styles.selectedCell,
                    cell.isDisabled && styles.disabledCell
                  ]}
                  onPress={() => handleSelectDay(cell.dateStr, cell.isDisabled)}
                  disabled={cell.isDisabled}
                >
                  <Text
                    style={[
                      styles.cellText,
                      !cell.isCurrentMonth && styles.otherMonthText,
                      cell.isToday && styles.todayCellText,
                      cell.isSelected && styles.selectedCellText,
                      cell.isDisabled && styles.disabledCellText
                    ]}
                  >
                    {cell.day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Footer Shortcuts */}
          <View style={styles.modalFooter}>
            <View style={styles.shortcutRow}>
              <TouchableOpacity style={styles.todayShortcutBtn} onPress={handlePickToday}>
                <Text style={styles.todayShortcutText}>📅 Today</Text>
              </TouchableOpacity>
              {allowClear && (
                <TouchableOpacity style={styles.clearShortcutBtn} onPress={handleClear}>
                  <Text style={styles.clearShortcutText}>✕ Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export interface DatePickerInputProps {
  value?: string | null;
  onChange: (dateStr: string) => void;
  placeholder?: string;
  label?: string;
  title?: string;
  minDate?: string;
  maxDate?: string;
  allowClear?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  compact?: boolean;
}

/**
 * Standard text input with calendar popup trigger and clear button.
 */
export function DatePickerInput({
  value,
  onChange,
  placeholder = 'YYYY-MM-DD',
  label,
  title,
  minDate,
  maxDate,
  allowClear = true,
  disabled = false,
  style,
  inputStyle,
  compact = false
}: DatePickerInputProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [textValue, setTextValue] = useState(value || '');

  useEffect(() => {
    setTextValue(value || '');
  }, [value]);

  const handleTextChange = (text: string) => {
    setTextValue(text);
    // If user enters valid YYYY-MM-DD or clears it, propagate upward
    if (!text.trim() || /^\d{4}-\d{2}-\d{2}$/.test(text.trim())) {
      onChange(text.trim());
    }
  };

  const handleBlur = () => {
    // If invalid text was left, either revert or propagate trimmed
    onChange(textValue.trim());
  };

  const handleSelectDate = (dateStr: string) => {
    setTextValue(dateStr);
    onChange(dateStr);
  };

  const handleClear = () => {
    setTextValue('');
    onChange('');
  };

  return (
    <View style={[styles.inputWrapper, style]}>
      {label && <Text style={styles.inputLabel}>{label}</Text>}
      <View style={[styles.inputContainer, compact && styles.inputContainerCompact, disabled && styles.inputDisabled]}>
        <TextInput
          style={[styles.textInput, compact && styles.textInputCompact, inputStyle]}
          value={textValue}
          onChangeText={handleTextChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          editable={!disabled}
          maxLength={10}
        />
        {allowClear && !!textValue && !disabled && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={handleClear}
            accessibilityLabel="Clear date"
          >
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.calendarIconBtn, compact && styles.calendarIconBtnCompact]}
          onPress={() => !disabled && setModalVisible(true)}
          disabled={disabled}
          accessibilityLabel="Open calendar date picker"
        >
          <Text style={compact ? styles.calendarIconCompact : styles.calendarIcon}>📅</Text>
        </TouchableOpacity>
      </View>

      <DatePickerModal
        visible={modalVisible}
        value={textValue}
        onSelect={handleSelectDate}
        onClose={() => setModalVisible(false)}
        title={title || label || 'Select Date'}
        minDate={minDate}
        maxDate={maxDate}
        allowClear={allowClear}
        onClear={handleClear}
      />
    </View>
  );
}

export interface CellDatePickerProps {
  value: string;
  onChange: (dateStr: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Compact DatePicker tailored specifically for spreadsheet grid inline editing.
 */
export function CellDatePicker({
  value,
  onChange,
  onSave,
  onCancel,
  placeholder = 'YYYY-MM-DD',
  autoFocus = true
}: CellDatePickerProps) {
  const [modalVisible, setModalVisible] = useState(false);

  const handleSelect = (dateStr: string) => {
    onChange(dateStr);
  };

  return (
    <View style={styles.cellContainer}>
      <TextInput
        style={styles.cellInput}
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSave}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        autoFocus={autoFocus}
        selectTextOnFocus
      />
      <TouchableOpacity
        style={styles.cellCalendarBtn}
        onPress={() => setModalVisible(true)}
        accessibilityLabel="Pick date"
      >
        <Text style={styles.cellCalendarIcon}>📅</Text>
      </TouchableOpacity>

      <DatePickerModal
        visible={modalVisible}
        value={value}
        onSelect={handleSelect}
        onClose={() => setModalVisible(false)}
        title="Edit Cell Date"
        allowClear
        onClear={() => onChange('')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Input Component Styles
  inputWrapper: {
    width: '100%',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    minHeight: 42,
  },
  inputContainerCompact: {
    minHeight: 34,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  inputDisabled: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    paddingVertical: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  textInputCompact: {
    fontSize: 12,
    paddingVertical: 4,
  },
  clearBtn: {
    padding: 6,
    marginRight: 2,
  },
  clearBtnText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: 'bold',
  },
  calendarIconBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginLeft: 4,
  },
  calendarIconBtnCompact: {
    padding: 4,
  },
  calendarIcon: {
    fontSize: 16,
  },
  calendarIconCompact: {
    fontSize: 13,
  },

  // Cell Specific Styles
  cellContainer: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 4,
    paddingHorizontal: 4,
    height: '100%',
  },
  cellInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    color: '#0f172a',
    paddingVertical: 2,
    paddingHorizontal: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  cellCalendarBtn: {
    flexShrink: 0,
    padding: 3,
    marginLeft: 2,
    backgroundColor: '#eff6ff',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  cellCalendarIcon: {
    fontSize: 12,
  },

  // Modal Styles
  modalOverlay: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999999,
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    zIndex: 1000000,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#64748b',
  },

  // Navigation Bar
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  navYearGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  navMonthBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  navMonthBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    lineHeight: 18,
  },
  navYearBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  navYearBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#475569',
    lineHeight: 18,
  },
  navTitleContainer: {
    alignItems: 'center',
  },
  navMonthTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  navYearTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },

  // Days Header
  daysHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: '#ffffff',
  },
  dayLabelCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  dayLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  weekendLabelText: {
    color: '#94a3b8',
  },

  // Calendar Grid
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: '#ffffff',
  },
  cellTouchable: {
    width: '14.285%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginVertical: 1,
  },
  cellText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1e293b',
  },
  otherMonthText: {
    color: '#cbd5e1',
  },
  todayCell: {
    borderWidth: 1.5,
    borderColor: '#3b82f6',
  },
  todayCellText: {
    fontWeight: '700',
    color: '#2563eb',
  },
  selectedCell: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  selectedCellText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  disabledCell: {
    opacity: 0.3,
  },
  disabledCellText: {
    color: '#94a3b8',
  },

  // Footer
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
  },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  todayShortcutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  todayShortcutText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  clearShortcutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  clearShortcutText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  doneBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#0f172a',
  },
  doneBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
});
