import { normalizeSpreadsheetRow, NormalizedEntity, normalizeJudgeOrdered } from './src/normalizer';
import { runRetentionJob } from './src/retention';
import { analyzeSpreadsheetRows, commitCuratedIngestion } from './src/deduplicator';

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
}

const DEFAULT_JWT_SECRET = 'aildata_secure_edge_hmac_secret_2026_primary_key';

// Base64URL encoding/decoding utilities (standard Web Crypto compatible)
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Generate a 16-byte cryptographically secure random salt in hex
function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Web Crypto PBKDF2 password hashing helper (100,000 iterations)
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

// Cryptographic HMAC-SHA256 Token Signing
async function createSignedToken(payload: Record<string, any>, secret: string = DEFAULT_JWT_SECRET): Promise<string> {
  const enc = new TextEncoder();
  const payloadB64 = toBase64Url(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
  const sigB64 = toBase64Url(new Uint8Array(sig));
  return `${payloadB64}.${sigB64}`;
}

// Cryptographic HMAC-SHA256 Token Verification
async function verifySignedToken(token: string, secret: string = DEFAULT_JWT_SECRET): Promise<{ id: string; email: string; role: string } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = fromBase64Url(sigB64);
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes.buffer as ArrayBuffer, enc.encode(payloadB64));
    if (!valid) return null;

    const payloadJson = new TextDecoder().decode(fromBase64Url(payloadB64));
    const payload = JSON.parse(payloadJson);
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Extract and verify signed session token
async function getAuthenticatedUser(request: Request, env: Env): Promise<{ id: string; email: string; role: string } | null> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    const secret = env.JWT_SECRET || DEFAULT_JWT_SECRET;
    return await verifySignedToken(token, secret);
  } catch {
    return null;
  }
}

// Strict Origin-Restricted CORS
function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowedOrigins = [
    'https://aildata-web.pages.dev',
    'http://localhost:8081',
    'http://localhost:19006',
    'http://localhost:3000'
  ];

  let allowOrigin = 'https://aildata-web.pages.dev';
  if (origin) {
    if (allowedOrigins.includes(origin) || origin.endsWith('.aildata-web.pages.dev')) {
      allowOrigin = origin;
    }
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
}

export default {
  // Cloudflare Workers Scheduled Cron Trigger Handler (Daily at 03:00 UTC)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runRetentionJob(env.DB));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const corsHeaders = getCorsHeaders(request);
    const jwtSecret = env.JWT_SECRET || DEFAULT_JWT_SECRET;

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
    <p>Connected to Cloudflare D1 with Role-Based Access Control, HMAC token signatures, and automated 1-year retention lifecycle.</p>
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

      // 2. Auth: Login (Public with rate limiting & transparent salt upgrade)
      if (path === '/api/auth/login' && method === 'POST') {
        const body: any = await request.json();
        const { email, password } = body;

        if (!email || !password) {
          return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400, headers: corsHeaders });
        }

        const cleanEmail = email.toLowerCase().trim();

        // Check brute-force lock
        const lockRes: any = await env.DB.prepare(
          'SELECT attempt_count, locked_until FROM failed_logins WHERE identifier = ?'
        ).bind(cleanEmail).first();

        if (lockRes && lockRes.locked_until && new Date(lockRes.locked_until).getTime() > Date.now()) {
          const remainingMinutes = Math.max(1, Math.ceil((new Date(lockRes.locked_until).getTime() - Date.now()) / 60000));
          return new Response(JSON.stringify({ 
            error: `Account temporarily locked due to too many failed attempts. Please try again in ${remainingMinutes} minute(s).` 
          }), { status: 429, headers: corsHeaders });
        }

        const user: any = await env.DB.prepare(
          'SELECT id, email, role, status, password_hash, salt FROM users WHERE email = ?'
        ).bind(cleanEmail).first();

        let passwordValid = false;
        let needsSaltUpgrade = false;

        if (user) {
          if (user.salt) {
            // Modern format: unique per-user salt
            const hash = await hashPassword(password, user.salt);
            passwordValid = (hash === user.password_hash);
          } else {
            // Backward-compatible check against legacy static salt
            const legacyHash = await hashPassword(password, 'aildata_salt');
            if (legacyHash === user.password_hash) {
              passwordValid = true;
              needsSaltUpgrade = true;
            }
          }
        }

        if (!user || !passwordValid) {
          // Increment failed attempt counter
          const attempts = (lockRes?.attempt_count || 0) + 1;
          if (attempts >= 5) {
            await env.DB.prepare(`
              INSERT INTO failed_logins (identifier, attempt_count, locked_until, last_attempt)
              VALUES (?, ?, datetime('now', '+15 minutes'), CURRENT_TIMESTAMP)
              ON CONFLICT(identifier) DO UPDATE SET
                attempt_count = excluded.attempt_count,
                locked_until = excluded.locked_until,
                last_attempt = CURRENT_TIMESTAMP;
            `).bind(cleanEmail, attempts).run();
          } else {
            await env.DB.prepare(`
              INSERT INTO failed_logins (identifier, attempt_count, last_attempt)
              VALUES (?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(identifier) DO UPDATE SET
                attempt_count = excluded.attempt_count,
                last_attempt = CURRENT_TIMESTAMP;
            `).bind(cleanEmail, attempts).run();
          }

          return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401, headers: corsHeaders });
        }

        // Check if account has been deactivated or suspended
        if (user.status === 'suspended') {
          return new Response(JSON.stringify({ 
            error: 'Account has been deactivated. Please contact an administrator.' 
          }), { status: 403, headers: corsHeaders });
        }

        // On successful authentication, clear any failed login lock
        if (lockRes) {
          await env.DB.prepare('DELETE FROM failed_logins WHERE identifier = ?').bind(cleanEmail).run();
        }

        // Transparently upgrade legacy salt to unique random salt
        if (needsSaltUpgrade) {
          const newSalt = generateSalt();
          const newHash = await hashPassword(password, newSalt);
          await env.DB.prepare('UPDATE users SET password_hash = ?, salt = ?, last_login = CURRENT_TIMESTAMP WHERE id = ?').bind(newHash, newSalt, user.id).run();
        } else {
          await env.DB.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').bind(user.id).run();
        }

        // Issue cryptographically signed HMAC token
        const token = await createSignedToken(
          { id: user.id, email: user.email, role: user.role, status: user.status || 'active', exp: Date.now() + 86400000 * 7 },
          jwtSecret
        );

        return new Response(JSON.stringify({ 
          success: true, 
          token, 
          user: { id: user.id, email: user.email, role: user.role, status: user.status || 'active' } 
        }), { status: 200, headers: corsHeaders });
      }

      // 3. Auth: Register (Admin only, except when 0 users exist to bootstrap initial admin)
      if (path === '/api/auth/register' && method === 'POST') {
        const caller = await getAuthenticatedUser(request, env);
        
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

        const assignedRole = totalUsers === 0 ? 'admin' : ((role === 'admin' || role === 'analyst') ? role : 'viewer');
        const userId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const salt = generateSalt();
        const passwordHash = await hashPassword(password, salt);

        try {
          await env.DB.prepare(
            'INSERT INTO users (id, email, password_hash, salt, role, status) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(userId, email.toLowerCase().trim(), passwordHash, salt, assignedRole, 'active').run();

          // Only issue an auto-login token if this was first-time setup (0 existing users)
          const token = totalUsers === 0
            ? await createSignedToken(
                { id: userId, email: email.toLowerCase().trim(), role: assignedRole, status: 'active', exp: Date.now() + 86400000 * 7 },
                jwtSecret
              )
            : undefined;

          return new Response(JSON.stringify({ 
            success: true, 
            token, 
            user: { id: userId, email: email.toLowerCase().trim(), role: assignedRole, status: 'active' } 
          }), { status: 201, headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: 'Email already registered or invalid data' }), { status: 400, headers: corsHeaders });
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

        const salt = generateSalt();
        const passwordHash = await hashPassword(password, salt);
        await env.DB.prepare(
          'UPDATE users SET password_hash = ?, salt = ?, invite_token = NULL, invite_expires_at = NULL, status = ?, last_login = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(passwordHash, salt, 'active', user.id).run();

        const sessionToken = await createSignedToken(
          { id: user.id, email: user.email, role: user.role, status: 'active', exp: Date.now() + 86400000 * 7 },
          jwtSecret
        );

        return new Response(JSON.stringify({ 
          success: true, 
          token: sessionToken, 
          user: { id: user.id, email: user.email, role: user.role, status: 'active' } 
        }), { status: 200, headers: corsHeaders });
      }

      // Authentication checkpoint for all protected /api endpoints
      const authUser = await getAuthenticatedUser(request, env);
      if (!authUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Session missing, invalid, or expired' }), { status: 401, headers: corsHeaders });
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

      // ======================================================================
      // Admin User Management Endpoints (Admin role strictly required)
      // ======================================================================

      // 6a. Admin: List All Users with Status and Lock Metrics
      if (path === '/api/admin/users' && method === 'GET') {
        if (authUser.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Forbidden: Administrator privileges required' }), { status: 403, headers: corsHeaders });
        }

        const { results } = await env.DB.prepare(`
          SELECT 
            u.id, 
            u.email, 
            u.role, 
            COALESCE(u.status, 'active') as status,
            u.created_at, 
            u.last_login,
            u.invite_expires_at,
            CASE WHEN u.password_hash = 'PENDING_ACTIVATION' THEN 1 ELSE 0 END as is_pending_invite,
            COALESCE(fl.attempt_count, 0) as failed_attempts,
            fl.locked_until,
            CASE WHEN fl.locked_until IS NOT NULL AND datetime(fl.locked_until) > datetime('now') THEN 1 ELSE 0 END as is_locked
          FROM users u
          LEFT JOIN failed_logins fl ON LOWER(fl.identifier) = LOWER(u.email)
          ORDER BY u.created_at DESC;
        `).all();

        return new Response(JSON.stringify({ users: results || [] }), { status: 200, headers: corsHeaders });
      }

      // 6b. Admin: Update User Role (Promote / Demote)
      if (path.startsWith('/api/admin/users/') && path.endsWith('/role') && (method === 'PATCH' || method === 'PUT')) {
        if (authUser.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Forbidden: Administrator privileges required' }), { status: 403, headers: corsHeaders });
        }

        const userId = path.split('/api/admin/users/')[1].replace('/role', '');
        const body: any = await request.json();
        const { role: newRole } = body;

        if (!['admin', 'analyst', 'viewer'].includes(newRole)) {
          return new Response(JSON.stringify({ error: 'Invalid role specified. Must be admin, analyst, or viewer.' }), { status: 400, headers: corsHeaders });
        }

        const targetUser: any = await env.DB.prepare('SELECT id, email, role, status FROM users WHERE id = ?').bind(userId).first();
        if (!targetUser) {
          return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: corsHeaders });
        }

        // Prevent demoting the last active administrator
        if (targetUser.role === 'admin' && newRole !== 'admin') {
          const adminCountRes = await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND COALESCE(status, 'active') = 'active'").first<{ count: number }>();
          if ((adminCountRes?.count ?? 0) <= 1) {
            return new Response(JSON.stringify({ error: 'Cannot demote the only remaining active administrator.' }), { status: 400, headers: corsHeaders });
          }
        }

        await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(newRole, userId).run();

        return new Response(JSON.stringify({ 
          success: true, 
          user: { id: userId, email: targetUser.email, role: newRole } 
        }), { status: 200, headers: corsHeaders });
      }

      // 6c. Admin: Update User Status (Activate / Suspend)
      if (path.startsWith('/api/admin/users/') && path.endsWith('/status') && (method === 'PATCH' || method === 'PUT')) {
        if (authUser.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Forbidden: Administrator privileges required' }), { status: 403, headers: corsHeaders });
        }

        const userId = path.split('/api/admin/users/')[1].replace('/status', '');
        const body: any = await request.json();
        const { status: newStatus } = body;

        if (!['active', 'suspended'].includes(newStatus)) {
          return new Response(JSON.stringify({ error: 'Invalid status specified. Must be active or suspended.' }), { status: 400, headers: corsHeaders });
        }

        const targetUser: any = await env.DB.prepare('SELECT id, email, role, status FROM users WHERE id = ?').bind(userId).first();
        if (!targetUser) {
          return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: corsHeaders });
        }

        // Guard: Admin cannot suspend their own account
        if (targetUser.id === authUser.id && newStatus === 'suspended') {
          return new Response(JSON.stringify({ error: 'You cannot suspend your own administrator account.' }), { status: 400, headers: corsHeaders });
        }

        // Guard: Cannot suspend the last active administrator
        if (targetUser.role === 'admin' && newStatus === 'suspended') {
          const adminCountRes = await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND COALESCE(status, 'active') = 'active'").first<{ count: number }>();
          if ((adminCountRes?.count ?? 0) <= 1) {
            return new Response(JSON.stringify({ error: 'Cannot suspend the only remaining active administrator.' }), { status: 400, headers: corsHeaders });
          }
        }

        await env.DB.prepare('UPDATE users SET status = ? WHERE id = ?').bind(newStatus, userId).run();

        return new Response(JSON.stringify({ 
          success: true, 
          user: { id: userId, email: targetUser.email, status: newStatus } 
        }), { status: 200, headers: corsHeaders });
      }

      // 6d. Admin: Unlock Rate-Limited / Brute-Force Locked Account
      if (path.startsWith('/api/admin/users/') && path.endsWith('/unlock') && method === 'POST') {
        if (authUser.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Forbidden: Administrator privileges required' }), { status: 403, headers: corsHeaders });
        }

        const userId = path.split('/api/admin/users/')[1].replace('/unlock', '');
        const targetUser: any = await env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(userId).first();
        if (!targetUser) {
          return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: corsHeaders });
        }

        await env.DB.prepare('DELETE FROM failed_logins WHERE LOWER(identifier) = LOWER(?)').bind(targetUser.email).run();

        return new Response(JSON.stringify({ 
          success: true, 
          message: `Account for ${targetUser.email} has been unlocked.` 
        }), { status: 200, headers: corsHeaders });
      }

      // 6e. Admin: Re-issue / Reset Activation or Password Link
      if (path.startsWith('/api/admin/users/') && path.endsWith('/reset-invite') && method === 'POST') {
        if (authUser.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Forbidden: Administrator privileges required' }), { status: 403, headers: corsHeaders });
        }

        const userId = path.split('/api/admin/users/')[1].replace('/reset-invite', '');
        const targetUser: any = await env.DB.prepare('SELECT id, email, role FROM users WHERE id = ?').bind(userId).first();
        if (!targetUser) {
          return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: corsHeaders });
        }

        const inviteToken = 'inv_' + crypto.randomUUID().replace(/-/g, '');
        const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();

        await env.DB.batch([
          env.DB.prepare('UPDATE users SET password_hash = ?, invite_token = ?, invite_expires_at = ? WHERE id = ?')
            .bind('PENDING_ACTIVATION', inviteToken, expiresAt, userId),
          env.DB.prepare('DELETE FROM failed_logins WHERE LOWER(identifier) = LOWER(?)')
            .bind(targetUser.email)
        ]);

        return new Response(JSON.stringify({ 
          success: true, 
          inviteToken, 
          email: targetUser.email, 
          role: targetUser.role, 
          expiresAt 
        }), { status: 200, headers: corsHeaders });
      }

      // 6f. Admin: Direct Manual Password Reset
      if (path.startsWith('/api/admin/users/') && path.endsWith('/password') && method === 'POST') {
        if (authUser.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Forbidden: Administrator privileges required' }), { status: 403, headers: corsHeaders });
        }

        const userId = path.split('/api/admin/users/')[1].replace('/password', '');
        const body: any = await request.json();
        const { password } = body;

        if (!password || password.length < 8) {
          return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), { status: 400, headers: corsHeaders });
        }

        const targetUser: any = await env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(userId).first();
        if (!targetUser) {
          return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: corsHeaders });
        }

        const salt = generateSalt();
        const passwordHash = await hashPassword(password, salt);

        await env.DB.batch([
          env.DB.prepare('UPDATE users SET password_hash = ?, salt = ?, invite_token = NULL, invite_expires_at = NULL WHERE id = ?')
            .bind(passwordHash, salt, userId),
          env.DB.prepare('DELETE FROM failed_logins WHERE LOWER(identifier) = LOWER(?)')
            .bind(targetUser.email)
        ]);

        return new Response(JSON.stringify({ 
          success: true, 
          message: `Password successfully updated for ${targetUser.email}.` 
        }), { status: 200, headers: corsHeaders });
      }

      // 6g. Admin: Permanently Delete User
      if (path.startsWith('/api/admin/users/') && method === 'DELETE') {
        if (authUser.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Forbidden: Administrator privileges required' }), { status: 403, headers: corsHeaders });
        }

        const userId = path.split('/api/admin/users/')[1];
        if (!userId) {
          return new Response(JSON.stringify({ error: 'User ID is required' }), { status: 400, headers: corsHeaders });
        }

        const targetUser: any = await env.DB.prepare('SELECT id, email, role FROM users WHERE id = ?').bind(userId).first();
        if (!targetUser) {
          return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: corsHeaders });
        }

        // Prevent admin from deleting their own account
        if (targetUser.id === authUser.id) {
          return new Response(JSON.stringify({ error: 'You cannot delete your own account.' }), { status: 400, headers: corsHeaders });
        }

        // Prevent deleting the last administrator
        if (targetUser.role === 'admin') {
          const adminCountRes = await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").first<{ count: number }>();
          if ((adminCountRes?.count ?? 0) <= 1) {
            return new Response(JSON.stringify({ error: 'Cannot delete the only remaining administrator.' }), { status: 400, headers: corsHeaders });
          }
        }

        await env.DB.batch([
          env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId),
          env.DB.prepare('DELETE FROM failed_logins WHERE LOWER(identifier) = LOWER(?)').bind(targetUser.email)
        ]);

        return new Response(JSON.stringify({ 
          success: true, 
          message: `User ${targetUser.email} has been permanently deleted.` 
        }), { status: 200, headers: corsHeaders });
      }

      // 7. Dynamic Records: Get All or by Category (Viewer+)
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

      // 8. Detainees: Get Normalized Detainees list with latest detention summary (Viewer+)
      if (path === '/api/detainees' && method === 'GET') {
        const limitParam = url.searchParams.get('limit');
        const limit = limitParam ? Math.min(parseInt(limitParam, 10), 10000) : 500;
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);
        const search = url.searchParams.get('search')?.toLowerCase().trim();

        let query = `
          SELECT 
            d.id, d.jacket_number, d.name, d.age, d.race, d.sex, d.country, d.ice_case_number, d.created_at, d.updated_at,
            dt.id as detention_id, dt.book_date_gcj, dt.departure_date, dt.cell, dt.delivering_agency,
            (SELECT COUNT(*) FROM charges c WHERE c.detention_id = dt.id) as charge_count,
            (SELECT GROUP_CONCAT(c.charge_description, '; ') FROM charges c WHERE c.detention_id = dt.id) as charges_summary,
            (SELECT judge_ordered FROM legal_proceedings lp WHERE lp.detention_id = dt.id LIMIT 1) as judge_ordered,
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

      // 9. Detainees: Master-Detail by ID (Viewer+)
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

      // 9b. Detainees: Update Detainee & Detention In-Place (Analyst+)
      if (path.startsWith('/api/detainees/') && (method === 'PATCH' || method === 'PUT')) {
        if (authUser.role !== 'admin' && authUser.role !== 'analyst') {
          return new Response(JSON.stringify({ error: 'Forbidden: Editing detainee records requires analyst or admin permissions' }), { status: 403, headers: corsHeaders });
        }

        const detaineeId = path.split('/api/detainees/')[1];
        if (!detaineeId) {
          return new Response(JSON.stringify({ error: 'Detainee ID required' }), { status: 400, headers: corsHeaders });
        }

        const body: any = await request.json();
        const statements: D1PreparedStatement[] = [];

        // 1. Detainee profile updates
        const detaineeFields: Record<string, string> = {
          name: 'name',
          jacket_number: 'jacket_number',
          country: 'country',
          age: 'age',
          sex: 'sex',
          race: 'race',
          ice_case_number: 'ice_case_number'
        };

        const detaineeUpdates: string[] = [];
        const detaineeParams: any[] = [];
        for (const [key, col] of Object.entries(detaineeFields)) {
          if (body[key] !== undefined) {
            detaineeUpdates.push(`${col} = ?`);
            detaineeParams.push(body[key] !== null && String(body[key]).trim() !== '' ? String(body[key]).trim() : null);
          }
        }

        if (detaineeUpdates.length > 0) {
          detaineeUpdates.push('updated_at = CURRENT_TIMESTAMP');
          detaineeParams.push(detaineeId);
          statements.push(
            env.DB.prepare(
              `UPDATE detainees SET ${detaineeUpdates.join(', ')} WHERE id = ?`
            ).bind(...detaineeParams)
          );
        }

        // 2. Detention stay updates
        const detentionFields: Record<string, string> = {
          book_date_gcj: 'book_date_gcj',
          departure_date: 'departure_date',
          cell: 'cell',
          delivering_agency: 'delivering_agency'
        };

        const hasDetentionFields = Object.keys(detentionFields).some(k => body[k] !== undefined);
        const hasCharges = body.charges !== undefined;

        if (hasDetentionFields || hasCharges) {
          // Identify target detention (explicit ID or latest stay)
          let targetDetentionId = body.detention_id;
          if (!targetDetentionId) {
            const latestStay = await env.DB.prepare(
              'SELECT id FROM detentions WHERE detainee_id = ? ORDER BY book_date_gcj DESC, created_at DESC LIMIT 1'
            ).bind(detaineeId).first<{ id: string }>();
            targetDetentionId = latestStay?.id;
          }

          if (targetDetentionId) {
            if (hasDetentionFields) {
              const detentionUpdates: string[] = [];
              const detentionParams: any[] = [];
              for (const [key, col] of Object.entries(detentionFields)) {
                if (body[key] !== undefined) {
                  detentionUpdates.push(`${col} = ?`);
                  detentionParams.push(body[key] !== null && String(body[key]).trim() !== '' ? String(body[key]).trim() : null);
                }
              }

              if (detentionUpdates.length > 0) {
                detentionParams.push(targetDetentionId);
                statements.push(
                  env.DB.prepare(
                    `UPDATE detentions SET ${detentionUpdates.join(', ')} WHERE id = ?`
                  ).bind(...detentionParams)
                );
              }
            }

            // Update charges if provided
            if (hasCharges) {
              statements.push(
                env.DB.prepare('DELETE FROM charges WHERE detention_id = ?').bind(targetDetentionId)
              );

              const rawCharges: string[] = Array.isArray(body.charges)
                ? body.charges
                : String(body.charges || '').split(/[;\n]/).map(c => c.trim()).filter(Boolean);

              for (const ch of rawCharges) {
                statements.push(
                  env.DB.prepare('INSERT INTO charges (detention_id, charge_description) VALUES (?, ?)').bind(targetDetentionId, ch)
                );
              }
            }
          }
        }

        // 3. Correspondence (penpal) updates
        if (body.penpal !== undefined) {
          const penpalVal = body.penpal !== null && String(body.penpal).trim() !== '' ? String(body.penpal).trim() : null;
          const existingCorr = await env.DB.prepare(
            'SELECT id FROM correspondence WHERE detainee_id = ? LIMIT 1'
          ).bind(detaineeId).first<{ id: number }>();

          if (existingCorr) {
            statements.push(
              env.DB.prepare('UPDATE correspondence SET penpal = ? WHERE detainee_id = ?').bind(penpalVal, detaineeId)
            );
          } else if (penpalVal) {
            statements.push(
              env.DB.prepare('INSERT INTO correspondence (detainee_id, penpal) VALUES (?, ?)').bind(detaineeId, penpalVal)
            );
          }
        }

        // 4. Legal Proceedings (decision_date) updates
        if (body.decision_date !== undefined) {
          const decVal = body.decision_date !== null && String(body.decision_date).trim() !== '' ? String(body.decision_date).trim() : null;
          const existingProc = await env.DB.prepare(
            'SELECT lp.id FROM legal_proceedings lp JOIN detentions d ON lp.detention_id = d.id WHERE d.detainee_id = ? LIMIT 1'
          ).bind(detaineeId).first<{ id: number }>();

          if (existingProc) {
            statements.push(
              env.DB.prepare('UPDATE legal_proceedings SET decision_date = ? WHERE id = ?').bind(decVal, existingProc.id)
            );
          } else {
            const detentionForProc = await env.DB.prepare(
              'SELECT id FROM detentions WHERE detainee_id = ? ORDER BY book_date_gcj DESC, created_at DESC LIMIT 1'
            ).bind(detaineeId).first<{ id: string }>();

            if (detentionForProc && decVal) {
              statements.push(
                env.DB.prepare('INSERT INTO legal_proceedings (detention_id, decision_date) VALUES (?, ?)').bind(detentionForProc.id, decVal)
              );
            }
          }
        }

        // 5. Legal Proceedings (judge_ordered) updates
        if (body.judge_ordered !== undefined) {
          const judgeVal = body.judge_ordered !== null && String(body.judge_ordered).trim() !== '' ? normalizeJudgeOrdered(String(body.judge_ordered)) : null;
          const existingProc = await env.DB.prepare(
            'SELECT lp.id FROM legal_proceedings lp JOIN detentions d ON lp.detention_id = d.id WHERE d.detainee_id = ? LIMIT 1'
          ).bind(detaineeId).first<{ id: number }>();

          if (existingProc) {
            statements.push(
              env.DB.prepare('UPDATE legal_proceedings SET judge_ordered = ? WHERE id = ?').bind(judgeVal, existingProc.id)
            );
          } else {
            const detentionForProc = await env.DB.prepare(
              'SELECT id FROM detentions WHERE detainee_id = ? ORDER BY book_date_gcj DESC, created_at DESC LIMIT 1'
            ).bind(detaineeId).first<{ id: string }>();

            if (detentionForProc) {
              statements.push(
                env.DB.prepare('INSERT INTO legal_proceedings (detention_id, judge_ordered) VALUES (?, ?)').bind(detentionForProc.id, judgeVal)
              );
            }
          }
        }

        if (statements.length > 0) {
          await env.DB.batch(statements);
        }

        return new Response(JSON.stringify({ success: true, detaineeId }), { status: 200, headers: corsHeaders });
      }

      // 10. Stats: Server-side SQL Aggregations (Viewer+)
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

        // Metric 1: Removed in last 6 months (Distinct departed detainees)
        const removedLast6MonthsRes = await env.DB.prepare(`
          SELECT COUNT(DISTINCT detainee_id) as c FROM detentions
          WHERE departure_date IS NOT NULL 
            AND TRIM(departure_date) != '' 
            AND LOWER(departure_date) NOT IN ('present', 'today', 'ongoing')
            AND departure_date >= date('now', '-6 months')
            AND departure_date <= ?
        `).bind(today).first<{ c: number }>();
        const removedLast6Months = removedLast6MonthsRes?.c ?? 0;

        // Metric 1b: Removals broken down by month (last 6 months)
        const removalsByMonthRaw = (await env.DB.prepare(`
          SELECT 
            substr(departure_date, 1, 7) as month,
            COUNT(DISTINCT detainee_id) as count
          FROM detentions
          WHERE departure_date IS NOT NULL 
            AND TRIM(departure_date) != '' 
            AND LOWER(departure_date) NOT IN ('present', 'today', 'ongoing')
            AND departure_date >= date('now', '-6 months')
            AND departure_date <= ?
          GROUP BY month
          ORDER BY month ASC
        `).bind(today).all<{ month: string; count: number }>()).results || [];

        // Metric 2: Average new per day per month (Intake velocity from detentions)
        const intakeVelocityRaw = (await env.DB.prepare(`
          SELECT 
            substr(book_date_gcj, 1, 7) as month,
            COUNT(*) as total,
            COUNT(DISTINCT substr(book_date_gcj, 1, 10)) as active_days
          FROM detentions
          WHERE book_date_gcj IS NOT NULL 
            AND TRIM(book_date_gcj) != ''
            AND book_date_gcj >= date('now', '-6 months')
            AND book_date_gcj <= ?
          GROUP BY month
          ORDER BY month ASC
        `).bind(today).all<{ month: string; total: number; active_days: number }>()).results || [];

        const intakeVelocity = intakeVelocityRaw.map(r => ({
          month: r.month,
          total: r.total,
          avgPerDay: Number(((r.total / Math.max(r.active_days || 1, 1))).toFixed(1))
        }));

        // Metric 3: Stats by age group (from normalized detainees)
        const ageDistributionRaw = (await env.DB.prepare(`
          SELECT 
            CASE 
              WHEN age IS NULL OR TRIM(age) = '' OR CAST(age AS INT) <= 0 THEN 'Unknown'
              WHEN CAST(age AS INT) < 18 THEN 'Under 18'
              WHEN CAST(age AS INT) BETWEEN 18 AND 25 THEN '18–25'
              WHEN CAST(age AS INT) BETWEEN 26 AND 35 THEN '26–35'
              WHEN CAST(age AS INT) BETWEEN 36 AND 50 THEN '36–50'
              WHEN CAST(age AS INT) >= 51 THEN '51+'
              ELSE 'Unknown'
            END as age_group,
            COUNT(*) as count
          FROM detainees
          GROUP BY age_group
          ORDER BY 
            CASE age_group
              WHEN 'Under 18' THEN 1
              WHEN '18–25' THEN 2
              WHEN '26–35' THEN 3
              WHEN '36–50' THEN 4
              WHEN '51+' THEN 5
              ELSE 6
            END
        `).all<{ age_group: string; count: number }>()).results || [];

        const totalAgeCount = ageDistributionRaw.reduce((acc, curr) => acc + curr.count, 0) || 1;
        const ageDistribution = ageDistributionRaw.map(r => ({
          group: r.age_group,
          count: r.count,
          percentage: Number(((r.count / totalAgeCount) * 100).toFixed(1))
        }));

        // Metric 4: Stats by origin (country from normalized detainees)
        const allCountriesRaw = (await env.DB.prepare(`
          SELECT 
            COALESCE(NULLIF(TRIM(country), ''), 'Unknown') as country, 
            COUNT(*) as count
          FROM detainees
          GROUP BY country
          ORDER BY count DESC
        `).all<{ country: string; count: number }>()).results || [];

        const totalOriginCount = allCountriesRaw.reduce((acc, curr) => acc + curr.count, 0) || 1;
        const topOrigins = allCountriesRaw.slice(0, 5);
        const otherOriginsCount = allCountriesRaw.slice(5).reduce((acc, curr) => acc + curr.count, 0);

        const originDistribution = topOrigins.map(r => ({
          country: r.country,
          count: r.count,
          percentage: Number(((r.count / totalOriginCount) * 100).toFixed(1))
        }));
        if (otherOriginsCount > 0) {
          originDistribution.push({
            country: 'Other',
            count: otherOriginsCount,
            percentage: Number(((otherOriginsCount / totalOriginCount) * 100).toFixed(1))
          });
        }

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
          removedLast6Months,
          removalsByMonth: removalsByMonthRaw,
          intakeVelocity,
          ageDistribution,
          originDistribution,
          topCountries: topCountries.map(r => [r.country, r.count]),
          topAgencies: topAgencies.map(r => [r.agency, r.count]),
          sexDistribution: sexDistribution.map(r => [r.sex, r.count]),
          rollups
        }), { status: 200, headers: corsHeaders });
      }

      // 10b. Pre-Flight Analysis for Curation & Deduplication (Analyst+)
      if (path === '/api/records/analyze' && method === 'POST') {
        if (authUser.role !== 'admin' && authUser.role !== 'analyst') {
          return new Response(JSON.stringify({ error: 'Forbidden: Analysis requires analyst or admin permissions' }), { status: 403, headers: corsHeaders });
        }

        const body: any = await request.json();
        const { category, rows } = body;

        if (!category || !rows || !Array.isArray(rows)) {
          return new Response(JSON.stringify({ error: 'Category and rows array required' }), { status: 400, headers: corsHeaders });
        }

        const analysis = await analyzeSpreadsheetRows(env.DB, category, rows);
        return new Response(JSON.stringify(analysis), { status: 200, headers: corsHeaders });
      }

      // 10c. Curated Ingestion Commit (Analyst+)
      if (path === '/api/records/commit' && method === 'POST') {
        if (authUser.role !== 'admin' && authUser.role !== 'analyst') {
          return new Response(JSON.stringify({ error: 'Forbidden: Ingestion requires analyst or admin permissions' }), { status: 403, headers: corsHeaders });
        }

        const body: any = await request.json();
        const { category, cleanRows, curatedDecisions } = body;

        if (!category || !Array.isArray(cleanRows) || !Array.isArray(curatedDecisions)) {
          return new Response(JSON.stringify({ error: 'category, cleanRows, and curatedDecisions arrays are required' }), { status: 400, headers: corsHeaders });
        }

        const result = await commitCuratedIngestion(env.DB, {
          category,
          cleanRows,
          curatedDecisions
        });

        return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
      }

      // 11. Batch Ingest & Relational Normalization (Analyst+)
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
              INSERT INTO detentions (id, detainee_id, category, book_date_gcj, departure_date, cell, days_in_gcj, days_prior_facility, came_from, sent_to_note, delivering_agency, duplicate_jacket_returned, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
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

      // 12. Records: Clear Database (Admin only)
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
          env.DB.prepare('DELETE FROM detainees;'),
          env.DB.prepare('DELETE FROM aggregate_rollups;')
        ]);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
      }

      // 13. Records: Delete By Category (Admin only - fully cascades across normalized tables)
      if (path.startsWith('/api/records/category/') && method === 'DELETE') {
        if (authUser.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Forbidden: Admin role required to delete category records' }), { status: 403, headers: corsHeaders });
        }
        const category = decodeURIComponent(path.split('/api/records/category/')[1] || '');
        if (!category) {
          return new Response(JSON.stringify({ error: 'Category required' }), { status: 400, headers: corsHeaders });
        }

        await env.DB.batch([
          // 1. Delete raw staging records for this category
          env.DB.prepare('DELETE FROM dynamic_records WHERE category = ?;').bind(category),
          // 2. Delete charges linked to detentions in this category
          env.DB.prepare(`
            DELETE FROM charges 
            WHERE detention_id IN (SELECT id FROM detentions WHERE category = ?)
          `).bind(category),
          // 3. Delete legal proceedings linked to detentions in this category
          env.DB.prepare(`
            DELETE FROM legal_proceedings 
            WHERE detention_id IN (SELECT id FROM detentions WHERE category = ?)
          `).bind(category),
          // 4. Delete detentions in this category
          env.DB.prepare('DELETE FROM detentions WHERE category = ?;').bind(category),
          // 5. Delete correspondence for detainees who no longer have detentions
          env.DB.prepare(`
            DELETE FROM correspondence 
            WHERE detainee_id NOT IN (SELECT DISTINCT detainee_id FROM detentions)
          `),
          // 6. Delete orphaned detainees who no longer have detentions
          env.DB.prepare(`
            DELETE FROM detainees 
            WHERE id NOT IN (SELECT DISTINCT detainee_id FROM detentions)
          `)
        ]);

        return new Response(JSON.stringify({ success: true, category }), { status: 200, headers: corsHeaders });
      }

      // 14. Maintenance: Run 1-Year Retention Purge & Rollup (Admin only)
      if (path === '/api/maintenance/purge' && method === 'POST') {
        if (authUser.role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Forbidden: Admin role required to trigger retention purge' }), { status: 403, headers: corsHeaders });
        }
        const result = await runRetentionJob(env.DB);
        return new Response(JSON.stringify({ success: true, result }), { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });

    } catch (err: any) {
      console.error('API Error:', err);
      return new Response(JSON.stringify({ error: 'An unexpected internal error occurred.' }), { status: 500, headers: corsHeaders });
    }
  }
};
