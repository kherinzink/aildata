/**
 * Automated Test Suite: Separated Staging & Relational Deletions
 * Tests category-level and global-level separated deletions and RBAC.
 */

const API_URL = process.env.API_URL || 'http://127.0.0.1:8787';

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 Starting Separated Staging & Relational Deletions Test Suite');
  console.log(`🌐 Target: ${API_URL}`);
  console.log('===============================================================');

  // 1. Authenticate as Admin
  console.log('\n[1/7] Authenticating as Admin...');
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

  // Create a viewer for RBAC testing
  const viewerEmail = `viewer_${Date.now()}@example.org`;
  const inviteRes = await fetch(`${API_URL}/api/auth/invite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: viewerEmail, role: 'viewer' })
  });
  const inviteData = await inviteRes.json();
  const actRes = await fetch(`${API_URL}/api/auth/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: inviteData.inviteToken, password: 'ViewerPassword123!' })
  });
  const actData = await actRes.json();
  const viewerToken = actData.token;
  console.log('✓ Viewer authenticated.');

  // 2. Baseline reset
  console.log('\n[2/7] Baseline reset...');
  const resetRes = await fetch(`${API_URL}/api/records?scope=all`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (!resetRes.ok) throw new Error('Failed baseline reset');
  console.log('✓ Database clean baseline established.');

  // 3. Ingest test records under two categories
  console.log('\n[3/7] Ingesting test records for category_alpha and category_beta...');
  const alphaRows = [
    { 'Jacket #': 'JKT-A1', 'Name': 'Alpha Detainee 1', 'Age': '29', 'Sex': 'M', 'Country': 'Mexico', 'Book Date': '2026-01-10' },
    { 'Jacket #': 'JKT-A2', 'Name': 'Alpha Detainee 2', 'Age': '34', 'Sex': 'F', 'Country': 'Honduras', 'Book Date': '2026-02-15' }
  ];
  const betaRows = [
    { 'Jacket #': 'JKT-B1', 'Name': 'Beta Detainee 1', 'Age': '42', 'Sex': 'M', 'Country': 'Guatemala', 'Book Date': '2026-03-20' },
    { 'Jacket #': 'JKT-B2', 'Name': 'Beta Detainee 2', 'Age': '25', 'Sex': 'F', 'Country': 'El Salvador', 'Book Date': '2026-04-05' }
  ];

  await fetch(`${API_URL}/api/records/batch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'category_alpha', rows: alphaRows })
  });
  await fetch(`${API_URL}/api/records/batch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'category_beta', rows: betaRows })
  });

  // Check categories endpoint
  const catRes = await fetch(`${API_URL}/api/records/categories`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const categories = await catRes.json();
  console.log('Categories returned:', categories);
  const alpha = categories.find(c => c.category === 'category_alpha');
  const beta = categories.find(c => c.category === 'category_beta');
  if (!alpha || alpha.stagingCount !== 2 || alpha.detentionCount !== 2) {
    throw new Error(`Unexpected alpha counts: ${JSON.stringify(alpha)}`);
  }
  if (!beta || beta.stagingCount !== 2 || beta.detentionCount !== 2) {
    throw new Error(`Unexpected beta counts: ${JSON.stringify(beta)}`);
  }
  console.log('✓ Ingestion confirmed: Both categories have staging=2, relational=2.');

  // 4. Test Per-Category Staging Deletion (scope=staging)
  console.log('\n[4/7] Testing category staging deletion on category_alpha (scope=staging)...');
  const delStagingRes = await fetch(`${API_URL}/api/records/category/category_alpha?scope=staging`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (!delStagingRes.ok) throw new Error(`Failed to delete staging: ${await delStagingRes.text()}`);

  const catRes2 = await fetch(`${API_URL}/api/records/categories`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const categories2 = await catRes2.json();
  const alpha2 = categories2.find(c => c.category === 'category_alpha');
  const beta2 = categories2.find(c => c.category === 'category_beta');
  console.log('Categories after category_alpha staging deletion:', categories2);
  if (alpha2) {
    throw new Error(`Expected category_alpha to no longer appear in imported categories list once staging is deleted, but found: ${JSON.stringify(alpha2)}`);
  }
  if (!beta2 || beta2.stagingCount !== 2 || beta2.detentionCount !== 2) {
    throw new Error(`Expected category_beta to remain in categories with staging=2, detention=2, got: ${JSON.stringify(beta2)}`);
  }

  // Verify relational detainee list STILL contains alpha detainees (safely orphaned without removal)
  const detaineesRes = await fetch(`${API_URL}/api/detainees`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const detaineesData = await detaineesRes.json();
  const alphaDetainee = detaineesData.results.find(d => d.name === 'Alpha Detainee 1');
  if (!alphaDetainee) throw new Error('Alpha detainee was prematurely removed from relational database!');
  
  // Verify that the detention record was safely orphaned (detention.category is null)
  const alphaDetailRes = await fetch(`${API_URL}/api/detainees/${alphaDetainee.id}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const alphaDetail = await alphaDetailRes.json();
  if (alphaDetail.detentions.length === 0) throw new Error('Alpha detainee lost their detention record!');
  if (alphaDetail.detentions[0].category !== null) {
    throw new Error(`Expected detention.category to be null (safely orphaned), got: ${alphaDetail.detentions[0].category}`);
  }
  console.log('✓ Staging deletion verified: category removed from active import list, normalized detention safely orphaned (category=null) without being removed.');

  // 5. Test Per-Category Relational Deletion (scope=relational)
  console.log('\n[5/7] Testing category relational deletion on category_beta (scope=relational)...');
  const delRelationalRes = await fetch(`${API_URL}/api/records/category/category_beta?scope=relational`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (!delRelationalRes.ok) throw new Error(`Failed to delete relational: ${await delRelationalRes.text()}`);

  const catRes3 = await fetch(`${API_URL}/api/records/categories`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const categories3 = await catRes3.json();
  const beta3 = categories3.find(c => c.category === 'category_beta');
  console.log('category_beta after relational deletion (staging remains):', beta3);
  if (!beta3 || beta3.stagingCount !== 2 || beta3.detentionCount !== 0) {
    throw new Error(`Expected stagingCount=2 and detentionCount=0 for beta, got: ${JSON.stringify(beta3)}`);
  }

  // Verify beta detainees are gone from relational detainees
  const detaineesRes2 = await fetch(`${API_URL}/api/detainees`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const detaineesData2 = await detaineesRes2.json();
  const betaDetaineeExists = detaineesData2.results.some(d => d.name === 'Beta Detainee 1');
  if (betaDetaineeExists) throw new Error('Beta detainee still exists in relational database after relational delete!');
  console.log('✓ Relational deletion verified: detentions/detainees cleared, raw staging records remain intact.');

  // 6. Test RBAC Protection
  console.log('\n[6/7] Testing RBAC: Non-admin cannot invoke deletion endpoints...');
  const unauthDel = await fetch(`${API_URL}/api/records?scope=staging`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${viewerToken}` }
  });
  if (unauthDel.status !== 403) throw new Error(`Expected 403 for viewer delete, got ${unauthDel.status}`);

  const unauthCatDel = await fetch(`${API_URL}/api/records/category/category_alpha?scope=staging`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${viewerToken}` }
  });
  if (unauthCatDel.status !== 403) throw new Error(`Expected 403 for viewer category delete, got ${unauthCatDel.status}`);
  console.log('✓ RBAC verified: Viewers are forbidden (403) from executing deletions.');

  // 7. Test Global Maintenance Scopes & Audit Logs
  console.log('\n[7/7] Testing global maintenance scopes (scope=staging and scope=all)...');
  // Purge remaining staging
  const globalStagingRes = await fetch(`${API_URL}/api/records?scope=staging`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (!globalStagingRes.ok) throw new Error('Failed to purge global staging');

  const statsRes = await fetch(`${API_URL}/api/stats`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const stats = await statsRes.json();
  if (stats.totalDynamic !== 0) throw new Error(`Expected totalDynamic=0 after global staging purge, got ${stats.totalDynamic}`);
  if (stats.counts.detainees !== 2) throw new Error(`Expected 2 remaining alpha detainees, got ${stats.counts.detainees}`);
  console.log('✓ Global staging purge verified: totalDynamic=0, remaining relational detainees intact.');

  // Full reset
  const globalFullRes = await fetch(`${API_URL}/api/records?scope=all`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (!globalFullRes.ok) throw new Error('Failed full database reset');

  const statsRes2 = await fetch(`${API_URL}/api/stats`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const stats2 = await statsRes2.json();
  if (stats2.totalDynamic !== 0 || stats2.counts.detainees !== 0) {
    throw new Error(`Expected complete 0 counts after full reset, got ${JSON.stringify(stats2)}`);
  }
  console.log('✓ Full database reset verified.');

  // Verify Audit Logs
  const auditRes = await fetch(`${API_URL}/api/admin/audit-logs`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  console.log('Audit response status:', auditRes.status);
  const auditData = await auditRes.json();
  console.log('Audit data payload:', auditData);
  const actions = (auditData.logs || []).map(l => l.action);
  console.log('Audit actions recorded:', actions.slice(0, 8));
  if (!actions.includes('CATEGORY_STAGING_DELETED')) throw new Error('Missing CATEGORY_STAGING_DELETED in audit logs');
  if (!actions.includes('CATEGORY_RELATIONAL_DELETED')) throw new Error('Missing CATEGORY_RELATIONAL_DELETED in audit logs');
  if (!actions.includes('DATABASE_STAGING_PURGED')) throw new Error('Missing DATABASE_STAGING_PURGED in audit logs');
  if (!actions.includes('DATABASE_CLEARED')) throw new Error('Missing DATABASE_CLEARED in audit logs');
  console.log('✓ Audit logging verified for all deletion actions.');

  console.log('\n===============================================================');
  console.log('🎉 ALL SEPARATED DELETION TESTS PASSED SUCCESSFULLY!');
  console.log('===============================================================');
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
