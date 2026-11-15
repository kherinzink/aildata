import { normalizeSpreadsheetRow, NormalizedEntity } from './src/normalizer';
import { runRetentionJob } from './src/retention';

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
}

// Web Crypto PBKDF2 password hashing helper
async function hashPassword(password: string, salt: string = 'aildata_salt'): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const exported = await crypto.subtle.exportKey('raw', derivedKey);
  return Array.from(new Uint8Array(exported))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Extract and verify session token
function getAuthenticatedUser(request: Request): { id: string; email: string; role: string } | null {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    const payload = JSON.parse(atob(token));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

export default {
  // Cloudflare Workers Scheduled Cron Trigger Handler (Daily at 03:00 UTC)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runRetentionJob(env.DB));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Root status route
    if (path === '/' && method === 'GET') {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Aildata Edge API</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #f8fafc; color: #0f172a; padding: 40px; display: flex; justify-content: center; }
    .card { background: #fff; border-radius: 12px; padding: 32px; max-width: 600px; border: 1px solid #e2e8f0; }
    h1 { margin-top: 0; font-size: 22px; color: #1e293b; }
    .badge { display: inline-block; background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Aildata D1 Edge Worker Active</div>
    <h1>Aildata Relational & Ingestion Gateway</h1>
    <p>Connected to Cloudflare D1 with Role-Based Access Control and automated 1-year retention lifecycle.</p>
  </div>
</body>
</html>`;
      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    try {
      // 1. Auth: Setup Status (Public - checks if initial administrator onboarding is required)
      if (path === '/api/auth/setup-status' && method === 'GET') {
        const userCountRes = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
        const totalUsers = userCountRes?.count ?? 0;
        return new Response(JSON.stringify({ needsSetup: totalUsers === 0 }), { status: 200, headers: corsHeaders });
      }

      // 2. Auth: Login (Public)
      if (path === '/api/auth/login' && method === 'POST') {
        const body: any = await request.json();
        const { email, password } = body;

        if (!email || !password) {
          return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400, headers: corsHeaders });
        }

        const passwordHash = await hashPassword(password);
        const user: any = await env.DB.prepare(
          'SELECT id, email, role FROM users WHERE email = ? AND password_hash = ?'
        ).bind(email.toLowerCase().trim(), passwordHash).first();

        if (!user) {
          return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401, headers: corsHeaders });
        }

        const token = btoa(JSON.stringify({ id: user.id, email: user.email, role: user.role, exp: Date.now() + 86400000 * 7 }));
        return new Response(JSON.stringify({ success: true, token, user }), { status: 200, headers: corsHeaders });
      }

      // 3. Auth: Register (Admin only, except when 0 users exist to bootstrap initial admin)
      if (path === '/api/auth/register' && method === 'POST') {
        const caller = getAuthenticatedUser(request);
        
        // Count existing users
        const userCountRes = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
        const totalUsers = userCountRes?.count ?? 0;

        // If system is already initialized, strictly require an existing admin token
        if (totalUsers > 0 && caller?.role !== 'admin') {
          return new Response(
            JSON.stringify({ error: 'Unauthorized: Account provisioning is restricted to administrators' }),
            { status: 403, headers: corsHeaders }
          );
        }

        const body: any = await request.json();
        const { email, password, role } = body;

        if (!email || !password) {
          return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400, headers: corsHeaders });
        }

        // On first use (0 users), enforce root admin role. Subsequent users default to viewer unless admin selects analyst/admin
        const assignedRole = totalUsers === 0 ? 'admin' : ((role === 'admin' || role === 'analyst') ? role : 'viewer');
        const userId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const passwordHash = await hashPassword(password);

        try {
          await env.DB.prepare(
            'INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)'
          ).bind(userId, email.toLowerCase().trim(), passwordHash, assignedRole).run();

          // Only issue an auto-login token if this was first-time setup (0 existing users)
          const token = totalUsers === 0
            ? btoa(JSON.stringify({ id: userId, email: email.toLowerCase().trim(), role: assignedRole, exp: Date.now() + 86400000 * 7 }))
            : undefined;

          return new Response(JSON.stringify({ 
            success: true, 
            token, 
            user: { id: userId, email: email.toLowerCase().trim(), role: assignedRole } 
          }), { status: 201, headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: 'Email already registered or invalid data', details: err.message }), { status: 400, headers: corsHeaders });
        }
      }

      // 4. Auth: Validate Invite Token (Public)
      if (path.startsWith('/api/auth/invite/') && method === 'GET') {
        const token = path.split('/api/auth/invite/')[1];
        if (!token) {
          return new Response(JSON.stringify({ valid: false, error: 'Invite token is required' }), { status: 400, headers: corsHeaders });
        }

        const user: any = await env.DB.prepare(
          'SELECT email, role, invite_expires_at FROM users WHERE invite_token = ? AND password_hash = ?'
        ).bind(token, 'PENDING_ACTIVATION').first();

        if (!user) {
          return new Response(JSON.stringify({ valid: false, error: 'Invalid or already activated invitation link' }), { status: 404, headers: corsHeaders });
        }

        if (new Date(user.invite_expires_at).getTime() < Date.now()) {
          return new Response(JSON.stringify({ valid: false, error: 'This invitation link has expired' }), { status: 410, headers: corsHeaders });
        }

        return new Response(JSON.stringify({ valid: true, email: user.email, role: user.role }), { status: 200, headers: corsHeaders });
      }

      // 5. Auth: Activate Account (Public - user sets their own password)
      if (path === '/api/auth/activate' && method === 'POST') {
        const body: any = await request.json();
        const { token, password } = body;

        if (!token || !password) {
          return new Response(JSON.stringify({ error: 'Token and password are required' }), { status: 400, headers: corsHeaders });
        }

        if (password.length < 8) {
          return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), { status: 400, headers: corsHeaders });
        }

        const user: any = await env.DB.prepare(
          'SELECT id, email, role, invite_expires_at FROM users WHERE invite_token = ? AND password_hash = ?'
        ).bind(token, 'PENDING_ACTIVATION').first();

        if (!user) {
          return new Response(JSON.stringify({ error: 'Invalid or already activated invitation link' }), { status: 400, headers: corsHeaders });
        }

        if (new Date(user.invite_expires_at).getTime() < Date.now()) {
          return new Response(JSON.stringify({ error: 'This invitation link has expired' }), { status: 410, headers: corsHeaders });
        }

        const passwordHash = await hashPassword(password);
        await env.DB.prepare(
          'UPDATE users SET password_hash = ?, invite_token = NULL, invite_expires_at = NULL WHERE id = ?'
        ).bind(passwordHash, user.id).run();

        const sessionToken = btoa(JSON.stringify({ id: user.id, email: user.email, role: user.role, exp: Date.now() + 86400000 * 7 }));
        return new Response(JSON.stringify({ 
          success: true, 
          token: sessionToken, 
          user: { id: user.id, email: user.email, role: user.role } 
        }), { status: 200, headers: corsHeaders });
      }

      // Authentication checkpoint for all protected /api endpoints
      const authUser = getAuthenticatedUser(request);
      if (!authUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Session missing or expired' }), { status: 401, headers: corsHeaders });
      }

      // 6. Auth: Invite Team Member (Admin only)
      if (path === '/api/auth/invite' && method === 'POST') {
        if (authUser.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Forbidden: Only administrators can invite users' }), { status: 403, headers: corsHeaders });
        }

        const body: any = await request.json();
        const { email, role } = body;

        if (!email) {
          return new Response(JSON.stringify({ error: 'Email is required' }), { status: 400, headers: corsHeaders });
        }

        const assignedRole = (role === 'admin' || role === 'analyst') ? role : 'viewer';
        const cleanEmail = email.toLowerCase().trim();

        const existing: any = await env.DB.prepare('SELECT id, password_hash FROM users WHERE email = ?').bind(cleanEmail).first();
        if (existing && existing.password_hash !== 'PENDING_ACTIVATION') {
          return new Response(JSON.stringify({ error: 'A registered account already exists for this email address' }), { status: 400, headers: corsHeaders });
        }

        const inviteToken = 'inv_' + crypto.randomUUID().replace(/-/g, '');
        const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();

        if (existing) {
          await env.DB.prepare(
            'UPDATE users SET role = ?, invite_token = ?, invite_expires_at = ? WHERE id = ?'
          ).bind(assignedRole, inviteToken, expiresAt, existing.id).run();
        } else {
          const userId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
          await env.DB.prepare(
            'INSERT INTO users (id, email, password_hash, role, invite_token, invite_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
          ).bind(userId, cleanEmail, 'PENDING_ACTIVATION', assignedRole, inviteToken, expiresAt).run();
        }

        return new Response(JSON.stringify({ 
          success: true, 
          inviteToken, 
          email: cleanEmail, 
          role: assignedRole, 
          expiresAt 
        }), { status: 201, headers: corsHeaders });
      }

      // 4. Dynamic Records: Get All or by Category (Viewer+)
      if (path === '/api/records' && method === 'GET') {
        const category = url.searchParams.get('category');
        let query = 'SELECT id, category, data_json as dataJson, created_at as createdAt, updated_at as updatedAt FROM dynamic_records';
        let stmt;

        if (category) {
          query += ' WHERE category = ? ORDER BY created_at DESC;';
          stmt = env.DB.prepare(query).bind(category);
        } else {
          query += ' ORDER BY created_at DESC;';
          stmt = env.DB.prepare(query);
        }

        const { results } = await stmt.all();
        return new Response(JSON.stringify(results), { status: 200, headers: corsHeaders });
      }

      // 5. Detainees: Get Normalized Detainees list with latest detention summary (Viewer+)
      if (path === '/api/detainees' && method === 'GET') {
        const limitParam = url.searchParams.get('limit');
        const limit = limitParam ? Math.min(parseInt(limitParam, 10), 10000) : 10000;
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);
        const search = url.searchParams.get('search')?.toLowerCase().trim();

        let query = `
          SELECT 
            d.id, d.jacket_number, d.name, d.age, d.race, d.sex, d.country, d.ice_case_number, d.created_at, d.updated_at,
            dt.id as detention_id, dt.book_date_gcj, dt.departure_date, dt.cell, dt.delivering_agency,
            (SELECT COUNT(*) FROM charges c WHERE c.detention_id = dt.id) as charge_count,
            (SELECT GROUP_CONCAT(c.charge_description, '; ') FROM charges c WHERE c.detention_id = dt.id) as charges_summary,
            (SELECT penpal FROM correspondence cp WHERE cp.detainee_id = d.id LIMIT 1) as penpal
          FROM detainees d
          LEFT JOIN detentions dt ON dt.detainee_id = d.id AND dt.id = (
            SELECT id FROM detentions WHERE detainee_id = d.id ORDER BY book_date_gcj DESC LIMIT 1
          )
        `;

        let stmt;
        if (search) {
          query += ` WHERE LOWER(d.name) LIKE ? OR d.jacket_number LIKE ? OR d.ice_case_number LIKE ? OR LOWER(d.country) LIKE ?`;
          query += ` ORDER BY d.created_at DESC LIMIT ? OFFSET ?;`;
          stmt = env.DB.prepare(query).bind(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, limit, offset);
        } else {
          query += ` ORDER BY d.created_at DESC LIMIT ? OFFSET ?;`;
          stmt = env.DB.prepare(query).bind(limit, offset);
        }

        const { results } = await stmt.all();
        return new Response(JSON.stringify(results), { status: 200, headers: corsHeaders });
      }

      // 6. Detainees: Master-Detail by ID (Viewer+)
      if (path.startsWith('/api/detainees/') && method === 'GET') {
        const detaineeId = path.split('/api/detainees/')[1];
        if (!detaineeId) {
          return new Response(JSON.stringify({ error: 'Detainee ID required' }), { status: 400, headers: corsHeaders });
        }

        const detainee = await env.DB.prepare(
          'SELECT * FROM detainees WHERE id = ?'
        ).bind(detaineeId).first();

        if (!detainee) {
          return new Response(JSON.stringify({ error: 'Detainee not found' }), { status: 404, headers: corsHeaders });
        }

        const detentions = (await env.DB.prepare(
          'SELECT * FROM detentions WHERE detainee_id = ? ORDER BY book_date_gcj DESC'
        ).bind(detaineeId).all()).results || [];

        const detentionIds = detentions.map((d: any) => d.id);
        let charges: any[] = [];
        let legalProceedings: any[] = [];

        if (detentionIds.length > 0) {
          const placeholders = detentionIds.map(() => '?').join(',');
          charges = (await env.DB.prepare(
            `SELECT * FROM charges WHERE detention_id IN (${placeholders})`
          ).bind(...detentionIds).all()).results || [];

          legalProceedings = (await env.DB.prepare(
            `SELECT * FROM legal_proceedings WHERE detention_id IN (${placeholders})`
          ).bind(...detentionIds).all()).results || [];
        }

        const correspondence = (await env.DB.prepare(
          'SELECT * FROM correspondence WHERE detainee_id = ?'
        ).bind(detaineeId).all()).results || [];

        return new Response(JSON.stringify({
          detainee,
          detentions,
          charges,
          legalProceedings,
          correspondence
        }), { status: 200, headers: corsHeaders });
      }

      // 7. Stats: Server-side SQL Aggregations (Viewer+)
      if (path === '/api/stats' && method === 'GET') {
        const today = new Date().toISOString().split('T')[0];

        // Counts
        const totalDynamic = (await env.DB.prepare('SELECT COUNT(*) as c FROM dynamic_records').first<{ c: number }>())?.c ?? 0;
        const totalDetainees = (await env.DB.prepare('SELECT COUNT(*) as c FROM detainees').first<{ c: number }>())?.c ?? 0;
        const totalDetentions = (await env.DB.prepare('SELECT COUNT(*) as c FROM detentions').first<{ c: number }>())?.c ?? 0;
        const totalCharges = (await env.DB.prepare('SELECT COUNT(*) as c FROM charges').first<{ c: number }>())?.c ?? 0;
        const totalLegal = (await env.DB.prepare('SELECT COUNT(*) as c FROM legal_proceedings').first<{ c: number }>())?.c ?? 0;
        const totalCorrespondence = (await env.DB.prepare('SELECT COUNT(*) as c FROM correspondence').first<{ c: number }>())?.c ?? 0;

        // Custody status
        const activeCustody = (await env.DB.prepare(`
          SELECT COUNT(DISTINCT detainee_id) as c FROM detentions
          WHERE departure_date IS NULL 
             OR TRIM(departure_date) = '' 
             OR LOWER(departure_date) IN ('present', 'today', 'ongoing')
             OR departure_date > ?
        `).bind(today).first<{ c: number }>())?.c ?? 0;

        const releasedCustody = (await env.DB.prepare(`
          SELECT COUNT(DISTINCT detainee_id) as c FROM detentions
          WHERE departure_date IS NOT NULL 
            AND TRIM(departure_date) != '' 
            AND LOWER(departure_date) NOT IN ('present', 'today', 'ongoing')
            AND departure_date <= ?
        `).bind(today).first<{ c: number }>())?.c ?? 0;

        const penpalCount = (await env.DB.prepare(`
          SELECT COUNT(DISTINCT detainee_id) as c FROM correspondence
          WHERE penpal IS NOT NULL AND TRIM(penpal) != ''
        `).first<{ c: number }>())?.c ?? 0;

        // Top countries
        const topCountries = (await env.DB.prepare(`
          SELECT COALESCE(NULLIF(TRIM(country), ''), 'Unknown') as country, COUNT(*) as count
          FROM detainees
          GROUP BY country
          ORDER BY count DESC
          LIMIT 5
        `).all<{ country: string; count: number }>()).results || [];

        // Top agencies
        const topAgencies = (await env.DB.prepare(`
          SELECT COALESCE(NULLIF(TRIM(delivering_agency), ''), 'Unknown') as agency, COUNT(*) as count
          FROM detentions
          GROUP BY agency
          ORDER BY count DESC
          LIMIT 5
        `).all<{ agency: string; count: number }>()).results || [];

        // Sex breakdown
        const sexDistribution = (await env.DB.prepare(`
          SELECT COALESCE(NULLIF(TRIM(sex), ''), 'Unknown') as sex, COUNT(*) as count
          FROM detainees
          GROUP BY sex
          ORDER BY count DESC
        `).all<{ sex: string; count: number }>()).results || [];

        // Recent aggregate rollups
        const rollups = (await env.DB.prepare(`
          SELECT * FROM aggregate_rollups ORDER BY snapshot_date DESC LIMIT 7
        `).all()).results || [];

        return new Response(JSON.stringify({
          totalDynamic,
          counts: {
            detainees: totalDetainees,
            detentions: totalDetentions,
            charges: totalCharges,
            legal_proceedings: totalLegal,
            correspondence: totalCorrespondence
          },
          currentCount: activeCustody,
          releasedCount: releasedCustody,
          withPenpalCount: penpalCount,
          topCountries: topCountries.map(r => [r.country, r.count]),
          topAgencies: topAgencies.map(r => [r.agency, r.count]),
          sexDistribution: sexDistribution.map(r => [r.sex, r.count]),
          rollups
        }), { status: 200, headers: corsHeaders });
      }

      // 8. Batch Ingest & Relational Normalization (Analyst+)
      if (path === '/api/records/batch' && method === 'POST') {
        if (authUser.role !== 'admin' && authUser.role !== 'analyst') {
          return new Response(JSON.stringify({ error: 'Forbidden: Ingestion requires analyst or admin permissions' }), { status: 403, headers: corsHeaders });
        }

        const body: any = await request.json();
        const { category, rows } = body;

        if (!category || !rows || !Array.isArray(rows)) {
          return new Response(JSON.stringify({ error: 'Category and rows array required' }), { status: 400, headers: corsHeaders });
        }

        const statements: D1PreparedStatement[] = [];

        for (let idx = 0; idx < rows.length; idx++) {
          const row = rows[idx];
          const dynamicId = `rec_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`;
          const normalized = normalizeSpreadsheetRow(row);

          // 1. Raw Staging Insert
          statements.push(
            env.DB.prepare(
              'INSERT INTO dynamic_records (id, category, data_json, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
            ).bind(dynamicId, category, normalized.rawJson)
          );

          // 2. Entity Resolution & Relational Normalization
          const d = normalized.detainee;
          const dt = normalized.detention;
          const detaineeId = `det_${d.jacket_number || d.ice_case_number || (d.name ? d.name.replace(/\s+/g, '_') : 'unk')}_${Math.random().toString(36).substring(2, 7)}`;
          const detentionId = `dtn_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;

          // Insert detainee
          statements.push(
            env.DB.prepare(`
              INSERT INTO detainees (id, jacket_number, name, age, race, sex, country, ice_case_number, is_uncharged, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO UPDATE SET
                age = COALESCE(excluded.age, detainees.age),
                updated_at = CURRENT_TIMESTAMP;
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

          // Insert detention
          statements.push(
            env.DB.prepare(`
              INSERT INTO detentions (id, detainee_id, book_date_gcj, departure_date, cell, days_in_gcj, days_prior_facility, came_from, sent_to_note, delivering_agency, duplicate_jacket_returned, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
            `).bind(
              detentionId,
              detaineeId,
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

          // Insert charges
          for (const charge of normalized.charges) {
            statements.push(
              env.DB.prepare(
                'INSERT INTO charges (detention_id, charge_description) VALUES (?, ?)'
              ).bind(detentionId, charge)
            );
          }

          // Insert legal proceedings if present
          if (normalized.legal.judge_ordered || normalized.legal.decision_date || normalized.legal.notes) {
            statements.push(
              env.DB.prepare(
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

          // Insert correspondence if present
          if (normalized.correspondence.penpal || normalized.correspondence.loc_note) {
            statements.push(
              env.DB.prepare(
                'INSERT INTO correspondence (detainee_id, penpal, loc_note) VALUES (?, ?, ?)'
              ).bind(
                detaineeId,
                normalized.correspondence.penpal || null,
                normalized.correspondence.loc_note || null
              )
            );
          }
        }

        // Execute in chunks of up to 80 statements to respect D1 limits
        const CHUNK_SIZE = 80;
        for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
          const chunk = statements.slice(i, i + CHUNK_SIZE);
          await env.DB.batch(chunk);
        }

        return new Response(JSON.stringify({ success: true, count: rows.length }), { status: 200, headers: corsHeaders });
      }

      // 9. Records: Clear Database (Admin only)
      if (path === '/api/records' && method === 'DELETE') {
        if (authUser.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Forbidden: Admin role required to reset database' }), { status: 403, headers: corsHeaders });
        }
        await env.DB.batch([
          env.DB.prepare('DELETE FROM dynamic_records;'),
          env.DB.prepare('DELETE FROM correspondence;'),
          env.DB.prepare('DELETE FROM legal_proceedings;'),
          env.DB.prepare('DELETE FROM charges;'),
          env.DB.prepare('DELETE FROM detentions;'),
          env.DB.prepare('DELETE FROM detainees;')
        ]);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
      }

      // 10. Records: Delete By Category (Admin only)
      if (path.startsWith('/api/records/category/') && method === 'DELETE') {
        if (authUser.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Forbidden: Admin role required to delete category records' }), { status: 403, headers: corsHeaders });
        }
        const category = decodeURIComponent(path.split('/api/records/category/')[1] || '');
        if (!category) {
          return new Response(JSON.stringify({ error: 'Category required' }), { status: 400, headers: corsHeaders });
        }
        await env.DB.prepare('DELETE FROM dynamic_records WHERE category = ?;').bind(category).run();
        return new Response(JSON.stringify({ success: true, category }), { status: 200, headers: corsHeaders });
      }

      // 11. Maintenance: Run 1-Year Retention Purge & Rollup (Admin only)
      if (path === '/api/maintenance/purge' && method === 'POST') {
        if (authUser.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Forbidden: Admin role required to trigger retention purge' }), { status: 403, headers: corsHeaders });
        }
        const result = await runRetentionJob(env.DB);
        return new Response(JSON.stringify({ success: true, result }), { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: 'Internal Server Error', details: err.message }), { status: 500, headers: corsHeaders });
    }
  }
};
