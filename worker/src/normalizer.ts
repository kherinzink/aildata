export interface ExtractedDetainee {
  jacket_number?: string;
  name?: string;
  age?: string;
  race?: string;
  sex?: string;
  country?: string;
  ice_case_number?: string;
}

export interface ExtractedDetention {
  book_date_gcj?: string;
  departure_date?: string;
  cell?: string;
  days_in_gcj?: string;
  days_prior_facility?: string;
  came_from?: string;
  sent_to_note?: string;
  delivering_agency?: string;
  duplicate_jacket_returned?: string;
}

export interface ExtractedLegal {
  judge_ordered?: string;
  decision_date?: string;
  day_wait?: string;
  notes?: string;
}

export interface ExtractedCorrespondence {
  penpal?: string;
  loc_note?: string;
}

export interface NormalizedEntity {
  detainee: ExtractedDetainee;
  detention: ExtractedDetention;
  charges: string[];
  legal: ExtractedLegal;
  correspondence: ExtractedCorrespondence;
  rawJson: string;
}

const ALIAS_MAP: Record<string, string[]> = {
  // Detainee fields
  jacket_number: ['jacket #', 'jacket number', 'jacket', 'jacket_number', 'duplicate jacket # (came back?)'],
  name: ['name', 'detainee name', 'name (from jail tracker)', 'full name'],
  age: ['age'],
  race: ['race'],
  sex: ['sex', 'gender'],
  country: ['country', 'coo', 'country of origin', 'nationality'],
  ice_case_number: ['ice case #', 'ice case number', 'a-number', 'case number', 'ice case number/a#', 'a#'],

  // Detention fields
  book_date_gcj: ['book date', 'gcj book date', 'book date in gcj', 'booking date', 'book_date', 'book_date_gcj'],
  departure_date: ['departure date', 'release date', 'dep date', 'departure date (or today)', 'dep_date', 'departure_date'],
  cell: ['cell', 'housing', 'cell / pod', 'unit'],
  days_in_gcj: ['days in gcj', 'days gcj', 'total days'],
  days_prior_facility: ['days prior facility', 'days prior'],
  came_from: ['came from', 'prior facility', 'transfer from'],
  sent_to_note: ['sent to', 'sent to note', 'sent to (or note)', 'destination'],
  delivering_agency: ['delivering agency', 'agency', 'arresting agency'],
  duplicate_jacket_returned: ['duplicate jacket returned'],

  // Charges
  charges: ['charges', 'charge', 'offense', 'offenses', 'criminal charges'],

  // Legal Proceedings
  judge_ordered: ['judge ordered', 'judge ordered?', 'order'],
  decision_date: ['decision date', 'decision date?', 'order date'],
  day_wait: ['day wait', 'days waiting'],
  notes: ['notes', 'legal notes', 'habeas notes', 'notes for habeas, ongoing etc', 'remarks'],

  // Correspondence
  penpal: ['penpal', 'pen pal', 'correspondent'],
  loc_note: ['loc note', 'location note', 'locnote & fmr. penpal', 'former penpal']
};

function getField(row: Record<string, any>, key: string): string | undefined {
  const aliases = ALIAS_MAP[key] || [key];
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== '') {
      return String(row[alias]).trim();
    }
  }

  // Case-insensitive fallback
  const rowEntries = Object.entries(row);
  for (const alias of aliases) {
    const lAlias = alias.toLowerCase();
    for (const [rk, rv] of rowEntries) {
      if (rk.toLowerCase().trim() === lAlias && rv !== null && rv !== undefined && String(rv).trim() !== '') {
        return String(rv).trim();
      }
    }
  }

  return undefined;
}

export function normalizeJudgeOrdered(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const val = raw.trim();
  if (!val) return undefined;
  const lVal = val.toLowerCase();

  if (lVal === 'removal' || lVal.includes('removal') || lVal.includes('expedited') || lVal.includes('reinstatement') || lVal.includes('deport')) {
    return 'Removal';
  }
  if (lVal === 'voldep' || lVal === 'voluntary departure' || lVal.includes('volunt') || lVal.includes('voldep') || lVal.includes('departure')) {
    return 'VolDep';
  }
  if (lVal === 'old eoir' || lVal === 'old-eoir' || lVal === 'old_eoir' || lVal.includes('old eoir')) {
    return 'Old EOIR';
  }
  if (lVal === 'no eoir' || lVal === 'no-eoir' || lVal === 'no_eoir' || lVal.includes('no eoir' ) || lVal.includes('none recorded') || lVal === 'none' || lVal === 'n/a' || lVal === '-') {
    return 'No EOIR';
  }
  if (lVal === 'pending' || lVal.includes('pending') || lVal.includes('continued') || lVal.includes('habeas') || lVal.includes('redetermination')) {
    return 'Pending';
  }
  if (lVal === 'other') {
    return 'Other';
  }

  return 'Other';
}

export function normalizeSpreadsheetRow(row: Record<string, any>): NormalizedEntity {
  const detainee: ExtractedDetainee = {
    jacket_number: getField(row, 'jacket_number'),
    name: getField(row, 'name'),
    age: getField(row, 'age'),
    race: getField(row, 'race'),
    sex: getField(row, 'sex'),
    country: getField(row, 'country'),
    ice_case_number: getField(row, 'ice_case_number')
  };

  const detention: ExtractedDetention = {
    book_date_gcj: getField(row, 'book_date_gcj'),
    departure_date: getField(row, 'departure_date'),
    cell: getField(row, 'cell'),
    days_in_gcj: getField(row, 'days_in_gcj'),
    days_prior_facility: getField(row, 'days_prior_facility'),
    came_from: getField(row, 'came_from'),
    sent_to_note: getField(row, 'sent_to_note'),
    delivering_agency: getField(row, 'delivering_agency'),
    duplicate_jacket_returned: getField(row, 'duplicate_jacket_returned')
  };

  const rawCharges = getField(row, 'charges');
  const charges = rawCharges 
    ? rawCharges.split(/[;\n]/).map(c => c.trim()).filter(Boolean)
    : [];

  const rawJudgeOrdered = getField(row, 'judge_ordered');
  const legal: ExtractedLegal = {
    judge_ordered: normalizeJudgeOrdered(rawJudgeOrdered),
    decision_date: getField(row, 'decision_date'),
    day_wait: getField(row, 'day_wait'),
    notes: getField(row, 'notes')
  };

  const correspondence: ExtractedCorrespondence = {
    penpal: getField(row, 'penpal'),
    loc_note: getField(row, 'loc_note')
  };

  return {
    detainee,
    detention,
    charges,
    legal,
    correspondence,
    rawJson: JSON.stringify(row)
  };
}
