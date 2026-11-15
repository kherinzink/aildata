export interface RetentionResult {
  snapshotDate: string;
  totalActive: number;
  totalReleased: number;
  withPenpal: number;
  purgedDetentionsCount: number;
  purgedDetaineesCount: number;
  purgedDynamicRecordsCount: number;
}

export async function runRetentionJob(db: D1Database): Promise<RetentionResult> {
  const today = new Date().toISOString().split('T')[0];

  // 1. Compute summary metrics for today
  // Active detentions (departure_date is NULL, empty, or > today)
  const activeRes = await db.prepare(`
    SELECT COUNT(DISTINCT detainee_id) as activeCount
    FROM detentions
    WHERE departure_date IS NULL 
       OR TRIM(departure_date) = '' 
       OR LOWER(departure_date) IN ('present', 'today', 'ongoing')
       OR departure_date > ?
  `).bind(today).first<{ activeCount: number }>();
  const totalActive = activeRes?.activeCount ?? 0;

  // Released detentions
  const releasedRes = await db.prepare(`
    SELECT COUNT(DISTINCT detainee_id) as releasedCount
    FROM detentions
    WHERE departure_date IS NOT NULL 
      AND TRIM(departure_date) != '' 
      AND LOWER(departure_date) NOT IN ('present', 'today', 'ongoing')
      AND departure_date <= ?
  `).bind(today).first<{ releasedCount: number }>();
  const totalReleased = releasedRes?.releasedCount ?? 0;

  // Detainees with penpal
  const penpalRes = await db.prepare(`
    SELECT COUNT(DISTINCT detainee_id) as penpalCount
    FROM correspondence
    WHERE penpal IS NOT NULL AND TRIM(penpal) != ''
  `).first<{ penpalCount: number }>();
  const withPenpal = penpalRes?.penpalCount ?? 0;

  // Country breakdown
  const countryRows = await db.prepare(`
    SELECT COALESCE(NULLIF(TRIM(country), ''), 'Unknown') as country, COUNT(*) as count
    FROM detainees
    GROUP BY country
    ORDER BY count DESC
    LIMIT 10
  `).all<{ country: string; count: number }>();
  const byCountry: Record<string, number> = {};
  for (const r of countryRows.results || []) {
    byCountry[r.country] = r.count;
  }

  // Agency breakdown
  const agencyRows = await db.prepare(`
    SELECT COALESCE(NULLIF(TRIM(delivering_agency), ''), 'Unknown') as agency, COUNT(*) as count
    FROM detentions
    GROUP BY agency
    ORDER BY count DESC
    LIMIT 10
  `).all<{ agency: string; count: number }>();
  const byAgency: Record<string, number> = {};
  for (const r of agencyRows.results || []) {
    byAgency[r.agency] = r.count;
  }

  // Sex breakdown
  const sexRows = await db.prepare(`
    SELECT COALESCE(NULLIF(TRIM(sex), ''), 'Unknown') as sex, COUNT(*) as count
    FROM detainees
    GROUP BY sex
    ORDER BY count DESC
  `).all<{ sex: string; count: number }>();
  const bySex: Record<string, number> = {};
  for (const r of sexRows.results || []) {
    bySex[r.sex] = r.count;
  }

  // 2. Insert or replace snapshot into aggregate_rollups
  await db.prepare(`
    INSERT INTO aggregate_rollups (
      snapshot_date, total_active, total_released, with_penpal,
      by_country_json, by_agency_json, by_sex_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(snapshot_date) DO UPDATE SET
      total_active = excluded.total_active,
      total_released = excluded.total_released,
      with_penpal = excluded.with_penpal,
      by_country_json = excluded.by_country_json,
      by_agency_json = excluded.by_agency_json,
      by_sex_json = excluded.by_sex_json;
  `).bind(
    today,
    totalActive,
    totalReleased,
    withPenpal,
    JSON.stringify(byCountry),
    JSON.stringify(byAgency),
    JSON.stringify(bySex)
  ).run();

  // 3. Ephemeral TTL Purge (1-Year Retention Window)
  // Date threshold: 365 days ago
  const d365 = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];

  // A. Purge detentions where departed older than 1 year (365 days)
  const delDetentions = await db.prepare(`
    DELETE FROM detentions
    WHERE departure_date IS NOT NULL
      AND TRIM(departure_date) != ''
      AND LOWER(departure_date) NOT IN ('present', 'today', 'ongoing')
      AND departure_date < ?
  `).bind(d365).run();

  const purgedDetentionsCount = delDetentions.meta?.changes ?? 0;

  // B. Purge orphaned detainees who now have no detention records
  const delOrphanDetainees = await db.prepare(`
    DELETE FROM detainees
    WHERE id NOT IN (SELECT DISTINCT detainee_id FROM detentions)
  `).run();
  const purgedDetaineesCount = delOrphanDetainees.meta?.changes ?? 0;

  // C. Purge dynamic_records older than 1 year (365 days)
  const delDynamic = await db.prepare(`
    DELETE FROM dynamic_records
    WHERE created_at < datetime('now', '-1 year')
  `).run();
  const purgedDynamicRecordsCount = delDynamic.meta?.changes ?? 0;

  return {
    snapshotDate: today,
    totalActive,
    totalReleased,
    withPenpal,
    purgedDetentionsCount,
    purgedDetaineesCount,
    purgedDynamicRecordsCount
  };
}
