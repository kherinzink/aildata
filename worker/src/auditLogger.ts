// ============================================================================
// Worker Audit Logger Utility
// Records security and administrative events to the immutable audit_logs table
// ============================================================================

export async function recordAuditLog(
  db: D1Database,
  actor: { id?: string; email?: string } | null,
  action: string,
  targetId?: string | null,
  metadata?: Record<string, any> | null,
  request?: Request
): Promise<void> {
  try {
    const ip = request?.headers.get('CF-Connecting-IP') || 
               request?.headers.get('X-Forwarded-For') || 
               'unknown';
    
    await db.prepare(
      `INSERT INTO audit_logs (actor_id, actor_email, action, target_id, metadata, ip_address) 
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      actor?.id || null,
      actor?.email || 'unauthenticated',
      action,
      targetId || null,
      metadata ? JSON.stringify(metadata) : null,
      ip
    ).run();
  } catch (err) {
    console.error('Failed to record audit log:', err);
  }
}
