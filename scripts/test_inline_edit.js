/**
 * Integration Test: Inline Cell Editing on Relational Entities
 * Run: node scripts/test_inline_edit.js
 */

const API_URL = process.env.API_URL || 'http://127.0.0.1:8787';

async function runTest() {
  console.log('🧪 Starting Inline Cell Editing Test Suite...');

  // 1. Authenticate as Admin
  const loginRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'rootadmin@test.org', password: 'RootPassword123!' })
  });
  if (!loginRes.ok) throw new Error('Admin login failed');
  const { token } = await loginRes.json();
  console.log('✓ Admin authenticated.');

  // 2. Fetch existing detainees or create one
  const detaineesRes = await fetch(`${API_URL}/api/detainees?limit=1`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const detainees = await detaineesRes.json();
  if (!detainees || detainees.length === 0) {
    throw new Error('No detainees found to test editing');
  }

  const targetDetainee = detainees[0];
  console.log(`Target Detainee: ${targetDetainee.name} (ID: ${targetDetainee.id})`);

  // 3. Test In-Place Edit on Demographics (Age & Country)
  console.log('\n[1/3] Updating demographic fields via PATCH /api/detainees/:id...');
  const patchDemoRes = await fetch(`${API_URL}/api/detainees/${targetDetainee.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      age: '42',
      country: 'Costa Rica'
    })
  });

  if (!patchDemoRes.ok) {
    const err = await patchDemoRes.text();
    throw new Error(`Demographic patch failed: ${err}`);
  }
  console.log('✓ Demographic patch accepted.');

  // 4. Test In-Place Edit on Custody / Detention Fields (Departure Date & Cell)
  console.log('\n[2/3] Updating detention stay fields (Departure Date & Cell)...');
  const patchStayRes = await fetch(`${API_URL}/api/detainees/${targetDetainee.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      departure_date: '2026-11-20',
      cell: 'Pod C - Cell 210'
    })
  });

  if (!patchStayRes.ok) {
    const err = await patchStayRes.text();
    throw new Error(`Detention patch failed: ${err}`);
  }
  console.log('✓ Detention patch accepted.');

  // 5. Test In-Place Edit on Charges
  console.log('\n[3/3] Updating charges...');
  const patchChargesRes = await fetch(`${API_URL}/api/detainees/${targetDetainee.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      charges: '8 U.S.C. 1325 - Unlawful Entry; Failure to Appear'
    })
  });

  if (!patchChargesRes.ok) {
    const err = await patchChargesRes.text();
    throw new Error(`Charges patch failed: ${err}`);
  }
  console.log('✓ Charges patch accepted.');

  // 6. Verify with GET /api/detainees/:id
  console.log('\nVerifying updated record via GET /api/detainees/:id...');
  const detailRes = await fetch(`${API_URL}/api/detainees/${targetDetainee.id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const detail = await detailRes.json();

  console.log('Verified Profile:', {
    age: detail.detainee.age,
    country: detail.detainee.country,
    departure_date: detail.detentions[0]?.departure_date,
    cell: detail.detentions[0]?.cell,
    charges: detail.charges.map(c => c.charge_description)
  });

  if (detail.detainee.age !== '42') throw new Error(`Expected age '42', got '${detail.detainee.age}'`);
  if (detail.detainee.country !== 'Costa Rica') throw new Error(`Expected country 'Costa Rica', got '${detail.detainee.country}'`);
  if (detail.detentions[0]?.departure_date !== '2026-11-20') throw new Error(`Expected departure_date '2026-11-20', got '${detail.detentions[0]?.departure_date}'`);
  if (detail.detentions[0]?.cell !== 'Pod C - Cell 210') throw new Error(`Expected cell 'Pod C - Cell 210', got '${detail.detentions[0]?.cell}'`);
  if (detail.charges.length !== 2) throw new Error(`Expected 2 charges, got ${detail.charges.length}`);

  console.log('\n🎉 ALL INLINE EDIT TESTS PASSED PERFECTLY!\n');
}

runTest().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
