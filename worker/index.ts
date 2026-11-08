export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
}

// Web Crypto PBKDF2 password hashing helper for Cloudflare Workers
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json'
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 1. Auth: Register User (Email + Password)
      if (path === '/api/auth/register' && method === 'POST') {
        const body: any = await request.json();
        const { email, password, role } = body;

        if (!email || !password) {
          return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400, headers: corsHeaders });
        }

        const userId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const passwordHash = await hashPassword(password);
        const userRole = role || 'viewer';

        try {
          await env.DB.prepare(
            'INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)'
          ).bind(userId, email.toLowerCase().trim(), passwordHash, userRole).run();

          return new Response(JSON.stringify({ success: true, userId, email, role: userRole }), { status: 201, headers: corsHeaders });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: 'Email already registered or invalid data', details: err.message }), { status: 400, headers: corsHeaders });
        }
      }

      // 2. Auth: Login User (Email + Password -> Token)
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

        // Generate session token
        const token = btoa(JSON.stringify({ id: user.id, email: user.email, role: user.role, exp: Date.now() + 86400000 }));

        return new Response(JSON.stringify({ success: true, token, user }), { status: 200, headers: corsHeaders });
      }

      // 3. Records: Get All Records
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

      // 4. Records: Batch Insert
      if (path === '/api/records/batch' && method === 'POST') {
        const body: any = await request.json();
        const { category, rows } = body;

        if (!category || !rows || !Array.isArray(rows)) {
          return new Response(JSON.stringify({ error: 'Category and rows array required' }), { status: 400, headers: corsHeaders });
        }

        const statements = rows.map((row, idx) => {
          const id = `rec_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`;
          const dataJson = JSON.stringify(row);
          return env.DB.prepare(
            'INSERT INTO dynamic_records (id, category, data_json, created_at, updated_at) VALUES (?, ?, ?, datetime("now"), datetime("now"));'
          ).bind(id, category, dataJson);
        });

        await env.DB.batch(statements);
        return new Response(JSON.stringify({ success: true, count: rows.length }), { status: 200, headers: corsHeaders });
      }

      // 5. Records: Clear Database
      if (path === '/api/records' && method === 'DELETE') {
        await env.DB.prepare('DELETE FROM dynamic_records;').run();
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
      }

      // 6. Records: Delete By Category
      if (path.startsWith('/api/records/category/') && method === 'DELETE') {
        const category = decodeURIComponent(path.split('/').pop() || '');
        if (!category) {
          return new Response(JSON.stringify({ error: 'Category required' }), { status: 400, headers: corsHeaders });
        }
        await env.DB.prepare('DELETE FROM dynamic_records WHERE category = ?;').bind(category).run();
        return new Response(JSON.stringify({ success: true, category }), { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: 'Internal Server Error', details: err.message }), { status: 500, headers: corsHeaders });
    }
  }
};
