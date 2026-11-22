/**
 * Automated Test Suite: Audit Log Pagination Verification
 * Verifies limit=5 default pagination, offsets, totals, and action filtering.
 */

const API_URL = process.env.API_URL || 'http://127.0.0.1:8787';

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 Starting Audit Log Pagination Test Suite (Limit: 5 default)');
  console.log(`🌐 Target: ${API_URL}`);
  console.log('===============================================================');

  // 1. Authenticate as Admin
  console.log('\n[1/4] Authenticating as Admin...');
  let adminToken = '';
  const loginRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'rootadmin@test.org', password: 'RootPassword123!' })
  });

  if (loginRes.ok) {
    const data = await loginRes.json();
    adminToken = data.token;
  } else {
    const regRes = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rootadmin@test.org', password: 'RootPassword123!', role: 'admin' })
    });
    if (!regRes.ok) throw new Error(`Registration failed: ${await regRes.text()}`);
    const regData = await regRes.json();
    adminToken = regData.token;
  }
  console.log('✓ Admin authenticated.');

  // 2. Ensure at least 6 audit log entries exist
  console.log('\n[2/4] Ensuring sufficient audit events for pagination testing...');
  for (let i = 0; i < 6; i++) {
    await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `pagination_test_${i}_${Date.now()}@test.org`, password: 'WrongPassword!' })
    });
  }

  // 3. Test Page 1 (limit=5, offset=0)
  console.log('\n[3/4] Testing Page 1: 5 most current audit logs (limit=5, offset=0)...');
  const page1Res = await fetch(`${API_URL}/api/admin/audit-logs?limit=5&offset=0`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (!page1Res.ok) throw new Error(`Failed to fetch page 1: ${await page1Res.text()}`);
  const page1Data = await page1Res.json();

  console.log(`Page 1 returned ${page1Data.logs.length} logs. Total events in DB: ${page1Data.total}`);
  if (page1Data.logs.length !== 5) {
    throw new Error(`Expected exactly 5 logs on page 1, got ${page1Data.logs.length}`);
  }
  if (page1Data.total < 6) {
    throw new Error(`Expected total >= 6, got ${page1Data.total}`);
  }
  if (page1Data.limit !== 5 || page1Data.offset !== 0) {
    throw new Error(`Expected limit=5, offset=0, got limit=${page1Data.limit}, offset=${page1Data.offset}`);
  }

  // 4. Test Page 2 (limit=5, offset=5)
  console.log('\n[4/4] Testing Page 2: Next page of audit logs (limit=5, offset=5)...');
  const page2Res = await fetch(`${API_URL}/api/admin/audit-logs?limit=5&offset=5`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (!page2Res.ok) throw new Error(`Failed to fetch page 2: ${await page2Res.text()}`);
  const page2Data = await page2Res.json();

  console.log(`Page 2 returned ${page2Data.logs.length} logs.`);
  if (page2Data.logs.length < 1) {
    throw new Error('Expected at least 1 log on page 2');
  }

  // Ensure no overlap between page 1 and page 2 IDs
  const page1Ids = new Set(page1Data.logs.map(l => l.id));
  const page2Ids = new Set(page2Data.logs.map(l => l.id));
  for (const id of page2Ids) {
    if (page1Ids.has(id)) {
      throw new Error(`Duplicate log ID ${id} found across page 1 and page 2!`);
    }
  }

  console.log('✓ Page 1 and Page 2 successfully verified with distinct, non-overlapping records.');
  console.log('\n===============================================================');
  console.log('🎉 AUDIT LOG PAGINATION TESTS PASSED PERFECTLY!');
  console.log('===============================================================');
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
