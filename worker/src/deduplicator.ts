import { normalizeSpreadsheetRow, NormalizedEntity, ExtractedDetainee, ExtractedDetention, ExtractedLegal, ExtractedCorrespondence } from './normalizer';

export type MatchType =
  | 'EXACT_DUPLICATE'
  | 'STAY_UPDATE'
  | 'REPEAT_BOOKING'
  | 'AMBIGUOUS_MATCH'
  | 'KEY_CONFLICT';

export type SuggestedAction = 'skip' | 'merge' | 'create_new';

export interface FieldDiff {
  field: string;
  label: string;
  existing: string | null;
  incoming: string | null;
  status: 'identical' | 'added' | 'changed' | 'removed';
}

export interface ExistingDetaineeRef {
  id: string;
  jacket_number: string | null;
  name: string | null;
  age: string | null;
  race: string | null;
  sex: string | null;
  country: string | null;
  ice_case_number: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ExistingDetentionRef {
  id: string;
  detainee_id: string;
  book_date_gcj: string | null;
  departure_date: string | null;
  cell: string | null;
  days_in_gcj: string | null;
  delivering_agency: string | null;
  charges_summary?: string;
}

export interface FlaggedRecord {
  id: string; // e.g. "review_0"
  rowIndex: number;
  matchType: MatchType;
  severity: 'info' | 'warning' | 'danger';
  reason: string;
  suggestedAction: SuggestedAction;

  existingDetainee: ExistingDetaineeRef;
  existingDetention?: ExistingDetentionRef | null;
  existingCharges: string[];

  incomingDetainee: ExtractedDetainee;
  incomingDetention: ExtractedDetention;
  incomingCharges: string[];
  incomingLegal: ExtractedLegal;
  incomingCorrespondence: ExtractedCorrespondence;
  rawJson: string;

  diffs: FieldDiff[];
}

export interface CleanRecord {
  rowIndex: number;
  normalized: NormalizedEntity;
  rawJson: string;
}

export interface IngestionAnalysisResult {
  summary: {
    totalRows: number;
    cleanCount: number;
    flaggedCount: number;
    exactDuplicatesCount: number;
    stayUpdatesCount: number;
    repeatBookingsCount: number;
    ambiguousCount: number;
    conflictsCount: number;
  };
  cleanRows: CleanRecord[];
  flaggedItems: FlaggedRecord[];
}

export interface CuratedDecision {
  id: string; // matches FlaggedRecord.id
  rowIndex: number;
  action: 'merge' | 'create_new' | 'skip';
  chosenSource: 'existing' | 'incoming' | 'custom';
  targetDetaineeId?: string;
  targetDetentionId?: string;
  detaineeOverrides?: Record<string, string | null>;
  detentionOverrides?: Record<string, string | null>;
  incomingRow: Record<string, any>;
}

export interface IngestionCommitPayload {
  category: string;
  cleanRows: Array<{
    rowIndex: number;
    normalized: NormalizedEntity;
    rawJson: string;
  }>;
  curatedDecisions: CuratedDecision[];
}

export interface IngestionCommitResult {
  success: boolean;
  insertedDetainees: number;
  updatedDetainees: number;
  insertedDetentions: number;
  updatedDetentions: number;
  skippedRows: number;
  totalProcessed: number;
}

// ---------------------------------------------------------------------------
// Normalization Helpers
// ---------------------------------------------------------------------------

export function normalizeDateString(val: any): string | null {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  if (!str) return null;

  // Check Excel serial number (numeric, 5 digits between 25000 and 65000)
  if (/^\d{5}$/.test(str)) {
    const serial = parseInt(str, 10);
    const utcDays = serial - 25569;
    const date = new Date(utcDays * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }

  // Check standard ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }

  // Check MM/DD/YYYY or M/D/YYYY
  const mdy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (mdy) {
    const month = mdy[1].padStart(2, '0');
    const day = mdy[2].padStart(2, '0');
    const year = mdy[3];
    return `${year}-${month}-${day}`;
  }

  // Check YYYY/MM/DD
  const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymd) {
    const year = ymd[1];
    const month = ymd[2].padStart(2, '0');
    const day = ymd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return str;
}

export function normalizeIdentifier(val: any): string | null {
  if (val === undefined || val === null) return null;
  const str = String(val).trim().toUpperCase();
  return str.length > 0 ? str : null;
}

export function normalizeName(val: any): string | null {
  if (val === undefined || val === null) return null;
  const str = String(val).trim().toLowerCase().replace(/\s+/g, ' ');
  return str.length > 0 ? str : null;
}

// ---------------------------------------------------------------------------
// Diff Calculation
// ---------------------------------------------------------------------------

function computeFieldDiffs(
  existingDetainee: ExistingDetaineeRef | null,
  existingDetention: ExistingDetentionRef | null,
  existingCharges: string[],
  incomingDetainee: ExtractedDetainee,
  incomingDetention: ExtractedDetention,
  incomingCharges: string[]
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  function addField(field: string, label: string, existingVal: any, incomingVal: any) {
    const exStr = existingVal !== null && existingVal !== undefined && String(existingVal).trim() !== ''
      ? String(existingVal).trim()
      : null;
    const inStr = incomingVal !== null && incomingVal !== undefined && String(incomingVal).trim() !== ''
      ? String(incomingVal).trim()
      : null;

    let status: 'identical' | 'added' | 'changed' | 'removed' = 'identical';
    if (!exStr && !inStr) {
      status = 'identical';
    } else if (!exStr && inStr) {
      status = 'added';
    } else if (exStr && !inStr) {
      status = 'removed';
    } else if (exStr?.toLowerCase() !== inStr?.toLowerCase()) {
      status = 'changed';
    } else {
      status = 'identical';
    }

    diffs.push({
      field,
      label,
      existing: exStr,
      incoming: inStr,
      status
    });
  }

  addField('jacket_number', 'Jacket Number', existingDetainee?.jacket_number, incomingDetainee.jacket_number);
  addField('name', 'Full Name', existingDetainee?.name, incomingDetainee.name);
  addField('age', 'Age', existingDetainee?.age, incomingDetainee.age);
  addField('race', 'Race', existingDetainee?.race, incomingDetainee.race);
  addField('sex', 'Sex / Gender', existingDetainee?.sex, incomingDetainee.sex);
  addField('country', 'Country of Origin', existingDetainee?.country, incomingDetainee.country);
  addField('ice_case_number', 'ICE A# / Case #', existingDetainee?.ice_case_number, incomingDetainee.ice_case_number);

  addField('book_date_gcj', 'Booking Date', existingDetention?.book_date_gcj, incomingDetention.book_date_gcj);
  addField('departure_date', 'Departure Date', existingDetention?.departure_date, incomingDetention.departure_date);
  addField('cell', 'Cell / Pod', existingDetention?.cell, incomingDetention.cell);
  addField('days_in_gcj', 'Days in GCJ', existingDetention?.days_in_gcj, incomingDetention.days_in_gcj);
  addField('delivering_agency', 'Delivering Agency', existingDetention?.delivering_agency, incomingDetention.delivering_agency);

  // Compare charges list
  const exChargesSorted = [...existingCharges].sort().join('; ');
  const inChargesSorted = [...incomingCharges].sort().join('; ');
  addField('charges', 'Charges', exChargesSorted || null, inChargesSorted || null);

  return diffs;
}

// ---------------------------------------------------------------------------
// DB Pre-fetch Queries
// ---------------------------------------------------------------------------

async function fetchCandidateDetainees(
  db: D1Database,
  jackets: string[],
  iceNumbers: string[],
  names: string[]
): Promise<ExistingDetaineeRef[]> {
  const candidates: ExistingDetaineeRef[] = [];
  const CHUNK = 30;

  // Query by Jacket Numbers
  for (let i = 0; i < jackets.length; i += CHUNK) {
    const chunk = jackets.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(', ');
    const res = await db
      .prepare(`SELECT * FROM detainees WHERE jacket_number IN (${placeholders})`)
      .bind(...chunk)
      .all();
    if (res.results) candidates.push(...(res.results as any[]));
  }

  // Query by ICE Numbers
  for (let i = 0; i < iceNumbers.length; i += CHUNK) {
    const chunk = iceNumbers.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(', ');
    const res = await db
      .prepare(`SELECT * FROM detainees WHERE ice_case_number IN (${placeholders})`)
      .bind(...chunk)
      .all();
    if (res.results) candidates.push(...(res.results as any[]));
  }

  // Query by Names
  for (let i = 0; i < names.length; i += CHUNK) {
    const chunk = names.slice(i, i + CHUNK).map(n => n.toLowerCase().trim());
    const placeholders = chunk.map(() => '?').join(', ');
    const res = await db
      .prepare(`SELECT * FROM detainees WHERE LOWER(TRIM(name)) IN (${placeholders})`)
      .bind(...chunk)
      .all();
    if (res.results) candidates.push(...(res.results as any[]));
  }

  // Deduplicate by ID
  const map = new Map<string, ExistingDetaineeRef>();
  for (const c of candidates) {
    if (c && c.id && !map.has(c.id)) {
      map.set(c.id, c);
    }
  }

  return Array.from(map.values());
}

async function fetchCandidateDetentions(
  db: D1Database,
  detaineeIds: string[]
): Promise<ExistingDetentionRef[]> {
  if (detaineeIds.length === 0) return [];
  const detentions: ExistingDetentionRef[] = [];
  const CHUNK = 30;

  for (let i = 0; i < detaineeIds.length; i += CHUNK) {
    const chunk = detaineeIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(', ');
    const res = await db
      .prepare(`
        SELECT d.id, d.detainee_id, d.book_date_gcj, d.departure_date, d.cell, d.days_in_gcj, d.delivering_agency,
               GROUP_CONCAT(c.charge_description, ' ;; ') AS charges_summary
        FROM detentions d
        LEFT JOIN charges c ON c.detention_id = d.id
        WHERE d.detainee_id IN (${placeholders})
        GROUP BY d.id
      `)
      .bind(...chunk)
      .all();
    if (res.results) detentions.push(...(res.results as any[]));
  }

  return detentions;
}

// ---------------------------------------------------------------------------
// Main Analysis Pipeline
// ---------------------------------------------------------------------------

export async function analyzeSpreadsheetRows(
  db: D1Database,
  category: string,
  rawRows: any[]
): Promise<IngestionAnalysisResult> {
  const normalizedRows: { index: number; entity: NormalizedEntity; rawJson: string }[] = [];
  const jacketsSet = new Set<string>();
  const iceSet = new Set<string>();
  const namesSet = new Set<string>();

  // 1. In-batch normalization and key collection
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const entity = normalizeSpreadsheetRow(row);

    // Normalize date fields in entity
    if (entity.detention.book_date_gcj) {
      entity.detention.book_date_gcj = normalizeDateString(entity.detention.book_date_gcj) || entity.detention.book_date_gcj;
    }
    if (entity.detention.departure_date) {
      entity.detention.departure_date = normalizeDateString(entity.detention.departure_date) || entity.detention.departure_date;
    }

    normalizedRows.push({
      index: i,
      entity,
      rawJson: JSON.stringify(row)
    });

    if (entity.detainee.jacket_number) {
      jacketsSet.add(entity.detainee.jacket_number.trim());
    }
    if (entity.detainee.ice_case_number) {
      iceSet.add(entity.detainee.ice_case_number.trim());
    }
    if (entity.detainee.name) {
      namesSet.add(entity.detainee.name.trim().toLowerCase());
    }
  }

  // 2. Pre-fetch existing candidates from D1
  const candidateDetainees = await fetchCandidateDetainees(
    db,
    Array.from(jacketsSet),
    Array.from(iceSet),
    Array.from(namesSet)
  );

  const candidateDetaineeIds = candidateDetainees.map(d => d.id);
  const candidateDetentions = await fetchCandidateDetentions(db, candidateDetaineeIds);

  // Index detentions by detainee_id
  const detentionsByDetainee = new Map<string, ExistingDetentionRef[]>();
  for (const d of candidateDetentions) {
    const list = detentionsByDetainee.get(d.detainee_id) || [];
    list.push(d);
    detentionsByDetainee.set(d.detainee_id, list);
  }

  // 3. Evaluate each incoming row against candidates & batch history
  const cleanRows: CleanRecord[] = [];
  const flaggedItems: FlaggedRecord[] = [];

  let exactDuplicatesCount = 0;
  let stayUpdatesCount = 0;
  let repeatBookingsCount = 0;
  let ambiguousCount = 0;
  let conflictsCount = 0;

  for (const item of normalizedRows) {
    const { index, entity, rawJson } = item;
    const { detainee, detention, charges, legal, correspondence } = entity;

    const normJacket = normalizeIdentifier(detainee.jacket_number);
    const normIce = normalizeIdentifier(detainee.ice_case_number);
    const normName = normalizeName(detainee.name);
    const normCountry = normalizeName(detainee.country);

    // Look for matching candidate in DB
    let matchedDetainee: ExistingDetaineeRef | null = null;
    let matchQuality: 'jacket' | 'ice' | 'name_country' | null = null;

    // Check Jacket #
    if (normJacket) {
      matchedDetainee = candidateDetainees.find(cd => normalizeIdentifier(cd.jacket_number) === normJacket) || null;
      if (matchedDetainee) matchQuality = 'jacket';
    }

    // Check ICE Case #
    if (!matchedDetainee && normIce) {
      matchedDetainee = candidateDetainees.find(cd => normalizeIdentifier(cd.ice_case_number) === normIce) || null;
      if (matchedDetainee) matchQuality = 'ice';
    }

    // Check Name + Country
    if (!matchedDetainee && normName && normCountry) {
      matchedDetainee = candidateDetainees.find(cd => {
        return normalizeName(cd.name) === normName && normalizeName(cd.country) === normCountry;
      }) || null;
      if (matchedDetainee) matchQuality = 'name_country';
    }

    // No match found -> Clean new record
    if (!matchedDetainee) {
      cleanRows.push({
        rowIndex: index,
        normalized: entity,
        rawJson
      });
      continue;
    }

    // A match exists! Analyze match characteristics
    const existingStays = detentionsByDetainee.get(matchedDetainee.id) || [];
    const incomingBookDate = detention.book_date_gcj ? normalizeDateString(detention.book_date_gcj) : null;

    // Check demographic consistency for jacket match
    let isConflict = false;
    if (matchQuality === 'jacket' && normName && matchedDetainee.name) {
      const dbNormName = normalizeName(matchedDetainee.name);
      // Check if names have any token overlap
      const incomingTokens = (normName || '').split(' ');
      const dbTokens = (dbNormName || '').split(' ');
      const hasTokenOverlap = incomingTokens.some(t => t.length > 2 && dbTokens.includes(t));
      const sexDiffers = detainee.sex && matchedDetainee.sex && detainee.sex.toUpperCase() !== matchedDetainee.sex.toUpperCase();

      if (!hasTokenOverlap && sexDiffers) {
        isConflict = true;
      }
    }

    // Find if a detention stay with the same booking date already exists
    let matchingStay: ExistingDetentionRef | null = null;
    if (incomingBookDate) {
      matchingStay = existingStays.find(s => normalizeDateString(s.book_date_gcj) === incomingBookDate) || null;
    } else if (existingStays.length === 1 && !detention.departure_date) {
      // If only one stay exists and incoming has no book date, compare with that single stay
      matchingStay = existingStays[0];
    }

    const existingCharges = matchingStay?.charges_summary
      ? matchingStay.charges_summary.split(' ;; ').map(c => c.trim()).filter(Boolean)
      : [];

    const diffs = computeFieldDiffs(
      matchedDetainee,
      matchingStay || (existingStays[0] || null),
      existingCharges,
      detainee,
      detention,
      charges
    );

    let matchType: MatchType;
    let severity: 'info' | 'warning' | 'danger';
    let reason: string;
    let suggestedAction: SuggestedAction;

    if (isConflict) {
      matchType = 'KEY_CONFLICT';
      severity = 'danger';
      reason = `Jacket #${detainee.jacket_number} matches an existing detainee (${matchedDetainee.name}), but names and demographic details strongly conflict. Jacket number may have been recycled.`;
      suggestedAction = 'create_new';
      conflictsCount++;
    } else if (matchQuality === 'name_country' && !normJacket && !normIce) {
      matchType = 'AMBIGUOUS_MATCH';
      severity = 'warning';
      reason = `Name (${matchedDetainee.name}) and Country (${detainee.country}) match an existing detainee, but Jacket # and ICE A# are not present for deterministic verification.`;
      suggestedAction = 'merge';
      ambiguousCount++;
    } else if (matchingStay) {
      // Same stay booking date
      const hasChanges = diffs.some(d => d.status === 'added' || d.status === 'changed');
      if (!hasChanges) {
        matchType = 'EXACT_DUPLICATE';
        severity = 'info';
        reason = `Identical record already exists in database for Jacket #${matchedDetainee.jacket_number || 'N/A'} (Booking Date: ${matchingStay.book_date_gcj || 'N/A'}). No new fields detected.`;
        suggestedAction = 'skip';
        exactDuplicatesCount++;
      } else {
        matchType = 'STAY_UPDATE';
        severity = 'warning';
        reason = `Existing detention stay found for Booking Date ${matchingStay.book_date_gcj || 'N/A'}. Incoming record contains new or updated fields.`;
        suggestedAction = 'merge';
        stayUpdatesCount++;
      }
    } else {
      // Repeat booking stay
      matchType = 'REPEAT_BOOKING';
      severity = 'info';
      reason = `Detainee profile exists (${matchedDetainee.name}, Jacket: ${matchedDetainee.jacket_number || 'N/A'}), but booking date (${incomingBookDate || 'Unknown'}) is new. Represents a repeat stay / recidivism.`;
      suggestedAction = 'merge';
      repeatBookingsCount++;
    }

    flaggedItems.push({
      id: `review_${index}`,
      rowIndex: index,
      matchType,
      severity,
      reason,
      suggestedAction,
      existingDetainee: matchedDetainee,
      existingDetention: matchingStay || (existingStays[0] || null),
      existingCharges,
      incomingDetainee: detainee,
      incomingDetention: detention,
      incomingCharges: charges,
      incomingLegal: legal,
      incomingCorrespondence: correspondence,
      rawJson,
      diffs
    });
  }

  return {
    summary: {
      totalRows: rawRows.length,
      cleanCount: cleanRows.length,
      flaggedCount: flaggedItems.length,
      exactDuplicatesCount,
      stayUpdatesCount,
      repeatBookingsCount,
      ambiguousCount,
      conflictsCount
    },
    cleanRows,
    flaggedItems
  };
}

// ---------------------------------------------------------------------------
// Curated Ingestion Commit Pipeline
// ---------------------------------------------------------------------------

export async function commitCuratedIngestion(
  db: D1Database,
  payload: IngestionCommitPayload
): Promise<IngestionCommitResult> {
  const { category, cleanRows, curatedDecisions } = payload;
  const statements: D1PreparedStatement[] = [];

  let insertedDetainees = 0;
  let updatedDetainees = 0;
  let insertedDetentions = 0;
  let updatedDetentions = 0;
  let skippedRows = 0;

  // 1. Process Clean Rows (All new detainees)
  for (let i = 0; i < cleanRows.length; i++) {
    const item = cleanRows[i];
    const { normalized, rawJson, rowIndex } = item;
    const dynamicId = `rec_${Date.now()}_${rowIndex}_${Math.random().toString(36).substring(2, 5)}`;
    const d = normalized.detainee;
    const dt = normalized.detention;

    const detaineeId = `det_${d.jacket_number || d.ice_case_number || (d.name ? d.name.replace(/\s+/g, '_') : 'unk')}_${Math.random().toString(36).substring(2, 7)}`;
    const detentionId = `dtn_${Date.now()}_${rowIndex}_${Math.random().toString(36).substring(2, 6)}`;

    // Staging record
    statements.push(
      db.prepare(
        'INSERT INTO dynamic_records (id, category, data_json, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
      ).bind(dynamicId, category, rawJson)
    );

    // Insert detainee
    statements.push(
      db.prepare(`
        INSERT INTO detainees (id, jacket_number, name, age, race, sex, country, ice_case_number, is_uncharged, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(
        detaineeId,
        d.jacket_number || null,
        d.name || 'UNKNOWN',
        d.age || null,
        d.race || null,
        d.sex || null,
        d.country || null,
        d.ice_case_number || null,
        normalized.charges.length === 0 ? 1 : 0
      )
    );
    insertedDetainees++;

    // Insert detention stay
    statements.push(
      db.prepare(`
        INSERT INTO detentions (id, detainee_id, category, book_date_gcj, departure_date, cell, days_in_gcj, days_prior_facility, came_from, sent_to_note, delivering_agency, duplicate_jacket_returned, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(
        detentionId,
        detaineeId,
        category,
        dt.book_date_gcj || null,
        dt.departure_date || null,
        dt.cell || null,
        dt.days_in_gcj || null,
        dt.days_prior_facility || null,
        dt.came_from || null,
        dt.sent_to_note || null,
        dt.delivering_agency || null,
        dt.duplicate_jacket_returned || null
      )
    );
    insertedDetentions++;

    // Insert charges
    for (const ch of normalized.charges) {
      statements.push(
        db.prepare('INSERT INTO charges (detention_id, charge_description) VALUES (?, ?)').bind(detentionId, ch)
      );
    }

    // Insert legal proceedings
    if (normalized.legal.judge_ordered || normalized.legal.decision_date || normalized.legal.notes) {
      statements.push(
        db.prepare(
          'INSERT INTO legal_proceedings (detention_id, judge_ordered, decision_date, day_wait, notes) VALUES (?, ?, ?, ?, ?)'
        ).bind(
          detentionId,
          normalized.legal.judge_ordered || null,
          normalized.legal.decision_date || null,
          normalized.legal.day_wait || null,
          normalized.legal.notes || null
        )
      );
    }

    // Insert correspondence
    if (normalized.correspondence.penpal || normalized.correspondence.loc_note) {
      statements.push(
        db.prepare('INSERT INTO correspondence (detainee_id, penpal, loc_note) VALUES (?, ?, ?)').bind(
          detaineeId,
          normalized.correspondence.penpal || null,
          normalized.correspondence.loc_note || null
        )
      );
    }
  }

  // 2. Process Curated Decisions
  for (const decision of curatedDecisions) {
    const { action, targetDetaineeId, targetDetentionId, incomingRow, rowIndex } = decision;

    if (action === 'skip') {
      skippedRows++;
      continue;
    }

    const normalized = normalizeSpreadsheetRow(incomingRow);
    const d = normalized.detainee;
    const dt = normalized.detention;
    const rawJson = JSON.stringify(incomingRow);
    const dynamicId = `rec_${Date.now()}_${rowIndex}_${Math.random().toString(36).substring(2, 5)}`;

    // Raw staging
    statements.push(
      db.prepare(
        'INSERT INTO dynamic_records (id, category, data_json, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
      ).bind(dynamicId, category, rawJson)
    );

    if (action === 'create_new') {
      // Split / Create as completely new person
      const newDetaineeId = `det_${d.jacket_number || d.ice_case_number || (d.name ? d.name.replace(/\s+/g, '_') : 'unk')}_${Math.random().toString(36).substring(2, 7)}`;
      const newDetentionId = `dtn_${Date.now()}_${rowIndex}_${Math.random().toString(36).substring(2, 6)}`;

      statements.push(
        db.prepare(`
          INSERT INTO detainees (id, jacket_number, name, age, race, sex, country, ice_case_number, is_uncharged, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).bind(
          newDetaineeId,
          d.jacket_number || null,
          d.name || 'UNKNOWN',
          d.age || null,
          d.race || null,
          d.sex || null,
          d.country || null,
          d.ice_case_number || null,
          normalized.charges.length === 0 ? 1 : 0
        )
      );
      insertedDetainees++;

      statements.push(
        db.prepare(`
          INSERT INTO detentions (id, detainee_id, category, book_date_gcj, departure_date, cell, days_in_gcj, days_prior_facility, came_from, sent_to_note, delivering_agency, duplicate_jacket_returned, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(
          newDetentionId,
          newDetaineeId,
          category,
          dt.book_date_gcj || null,
          dt.departure_date || null,
          dt.cell || null,
          dt.days_in_gcj || null,
          dt.days_prior_facility || null,
          dt.came_from || null,
          dt.sent_to_note || null,
          dt.delivering_agency || null,
          dt.duplicate_jacket_returned || null
        )
      );
      insertedDetentions++;

      for (const ch of normalized.charges) {
        statements.push(
          db.prepare('INSERT INTO charges (detention_id, charge_description) VALUES (?, ?)').bind(newDetentionId, ch)
        );
      }
    } else if (action === 'merge' && targetDetaineeId) {
      // Merge with existing detainee
      statements.push(
        db.prepare(`
          UPDATE detainees SET
            name = COALESCE(?, name),
            age = COALESCE(?, age),
            race = COALESCE(?, race),
            sex = COALESCE(?, sex),
            country = COALESCE(?, country),
            ice_case_number = COALESCE(?, ice_case_number),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          d.name || null,
          d.age || null,
          d.race || null,
          d.sex || null,
          d.country || null,
          d.ice_case_number || null,
          targetDetaineeId
        )
      );
      updatedDetainees++;

      if (targetDetentionId) {
        // Update existing detention stay
        statements.push(
          db.prepare(`
            UPDATE detentions SET
              departure_date = COALESCE(?, departure_date),
              cell = COALESCE(?, cell),
              days_in_gcj = COALESCE(?, days_in_gcj),
              came_from = COALESCE(?, came_from),
              sent_to_note = COALESCE(?, sent_to_note),
              delivering_agency = COALESCE(?, delivering_agency)
            WHERE id = ?
          `).bind(
            dt.departure_date || null,
            dt.cell || null,
            dt.days_in_gcj || null,
            dt.came_from || null,
            dt.sent_to_note || null,
            dt.delivering_agency || null,
            targetDetentionId
          )
        );
        updatedDetentions++;

        // Add charges that don't already exist
        for (const ch of normalized.charges) {
          statements.push(
            db.prepare(`
              INSERT INTO charges (detention_id, charge_description)
              SELECT ?, ? WHERE NOT EXISTS (
                SELECT 1 FROM charges WHERE detention_id = ? AND charge_description = ?
              )
            `).bind(targetDetentionId, ch, targetDetentionId, ch)
          );
        }
      } else {
        // Repeat booking stay for existing detainee
        const newDetentionId = `dtn_${Date.now()}_${rowIndex}_${Math.random().toString(36).substring(2, 6)}`;
        statements.push(
          db.prepare(`
            INSERT INTO detentions (id, detainee_id, category, book_date_gcj, departure_date, cell, days_in_gcj, days_prior_facility, came_from, sent_to_note, delivering_agency, duplicate_jacket_returned, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Yes', CURRENT_TIMESTAMP)
          `).bind(
            newDetentionId,
            targetDetaineeId,
            category,
            dt.book_date_gcj || null,
            dt.departure_date || null,
            dt.cell || null,
            dt.days_in_gcj || null,
            dt.days_prior_facility || null,
            dt.came_from || null,
            dt.sent_to_note || null,
            dt.delivering_agency || null
          )
        );
        insertedDetentions++;

        for (const ch of normalized.charges) {
          statements.push(
            db.prepare('INSERT INTO charges (detention_id, charge_description) VALUES (?, ?)').bind(newDetentionId, ch)
          );
        }
      }
    }
  }

  // 3. Execute in atomic chunks of 80 statements
  const CHUNK_SIZE = 80;
  for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
    const chunk = statements.slice(i, i + CHUNK_SIZE);
    await db.batch(chunk);
  }

  return {
    success: true,
    insertedDetainees,
    updatedDetainees,
    insertedDetentions,
    updatedDetentions,
    skippedRows,
    totalProcessed: cleanRows.length + curatedDecisions.length
  };
}
