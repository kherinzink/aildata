/**
 * Automated Test Suite: Ingestion Deduplication, Conflict Detection & Curation
 * Run: node scripts/test_deduplication_suite.js
 */

const API_URL = process.env.API_URL || 'http://127.0.0.1:8787';

async function runTestSuite() {
  console.log('===============================================================');
  console.log('🧪 Starting Ingestion Deduplication & Curation Test Suite');
  console.log(`🌐 Target: ${API_URL}`);
  console.log('===============================================================');

  // 1. Authenticate as Admin
  console.log('\n[1/5] Authenticating with test worker...');
  let token = '';
  const loginRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'rootadmin@test.org', password: 'RootPassword123!' })
  });

  if (loginRes.ok) {
    const data = await loginRes.json();
    token = data.token;
  } else {
    const regRes = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rootadmin@test.org', password: 'RootPassword123!', role: 'admin' })
    });
    if (!regRes.ok) {
      const err = await regRes.text();
      throw new Error(`Failed to authenticate: ${err}`);
    }
    const regData = await regRes.json();
    token = regData.token;
  }

  console.log('✓ Successfully authenticated!');

  // 2. Clean records to ensure a fresh baseline
  console.log('\n[2/5] Resetting test database state...');
  const resetRes = await fetch(`${API_URL}/api/records`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!resetRes.ok) throw new Error('Failed to reset records');
  console.log('✓ Database reset.');

  // 3. Ingest Initial Baseline Records
  console.log('\n[3/5] Ingesting baseline records...');
  const baselineRows = [
    {
      'Jacket Number': 'JKT-1001',
      'Name': 'DOE, JOHN',
      'Age': '30',
      'Sex': 'M',
      'Race': 'W',
      'Country': 'Mexico',
      'ICE Case Number/A#': 'A091-111-222',
      'Book Date in GCJ': '2024-01-10',
      'Cell': 'Pod 1',
      'Charges': 'Entry without inspection'
    },
    {
      'Jacket Number': 'JKT-1002',
      'Name': 'SMITH, ALICE',
      'Age': '25',
      'Sex': 'F',
      'Race': 'W',
      'Country': 'Canada',
      'ICE Case Number/A#': 'A092-333-444',
      'Book Date in GCJ': '2024-02-15',
      'Cell': 'Pod 2',
      'Charges': 'Visa overstay'
    }
  ];

  const ingestRes = await fetch(`${API_URL}/api/records/commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      category: 'baseline_test',
      cleanRows: baselineRows.map((r, idx) => ({
        rowIndex: idx,
        normalized: {
          detainee: {
            jacket_number: r['Jacket Number'],
            name: r['Name'],
            age: r['Age'],
            sex: r['Sex'],
            race: r['Race'],
            country: r['Country'],
            ice_case_number: r['ICE Case Number/A#']
          },
          detention: {
            book_date_gcj: r['Book Date in GCJ'],
            cell: r['Cell']
          },
          charges: [r['Charges']],
          legal: {},
          correspondence: {},
          rawJson: JSON.stringify(r)
        },
        rawJson: JSON.stringify(r)
      })),
      curatedDecisions: []
    })
  });

  const ingestData = await ingestRes.json();
  if (!ingestRes.ok) throw new Error(JSON.stringify(ingestData));
  console.log(`✓ Baseline ingested: ${ingestData.insertedDetainees} detainees, ${ingestData.insertedDetentions} stays.`);

  // 4. Test Pre-Flight Analysis Endpoint (/api/records/analyze)
  console.log('\n[4/5] Testing /api/records/analyze with duplicate and conflict scenarios...');
  const testSheetRows = [
    // Scenario 1: Exact Duplicate of Detainee 1
    {
      'Jacket Number': 'JKT-1001',
      'Name': 'DOE, JOHN',
      'Age': '30',
      'Sex': 'M',
      'Race': 'W',
      'Country': 'Mexico',
      'ICE Case Number/A#': 'A091-111-222',
      'Book Date in GCJ': '2024-01-10',
      'Cell': 'Pod 1',
      'Charges': 'Entry without inspection'
    },
    // Scenario 2: Stay Update for Detainee 1 (New departure date, new cell, new charge)
    {
      'Jacket Number': 'JKT-1001',
      'Name': 'DOE, JOHN',
      'Age': '30',
      'Sex': 'M',
      'Country': 'Mexico',
      'ICE Case Number/A#': 'A091-111-222',
      'Book Date in GCJ': '2024-01-10',
      'Departure date (or today)': '2024-03-01',
      'Cell': 'Pod 4',
      'Charges': 'Entry without inspection; Re-entry after removal'
    },
    // Scenario 3: Repeat Booking Stay for Detainee 2 (Same person, new booking date)
    {
      'Jacket Number': 'JKT-1002',
      'Name': 'SMITH, ALICE',
      'Age': '26',
      'Sex': 'F',
      'Country': 'Canada',
      'Book Date in GCJ': '2024-05-20',
      'Cell': 'Pod 3',
      'Charges': 'Unlawful presence'
    },
    // Scenario 4: Demographic Conflict (Same jacket number JKT-1001, but completely different person)
    {
      'Jacket Number': 'JKT-1001',
      'Name': 'GARCIA, MARIA',
      'Age': '42',
      'Sex': 'F',
      'Country': 'Honduras',
      'Book Date in GCJ': '2024-06-01',
      'Cell': 'Pod 5',
      'Charges': 'Immigration hold'
    },
    // Scenario 5: Clean New Person
    {
      'Jacket Number': 'JKT-2005',
      'Name': 'KOWALSKI, JAN',
      'Age': '38',
      'Sex': 'M',
      'Country': 'Poland',
      'Book Date in GCJ': '2024-06-15',
      'Cell': 'Pod 1',
      'Charges': 'Visa overstay'
    }
  ];

  const analyzeRes = await fetch(`${API_URL}/api/records/analyze`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      category: 'second_sheet_import',
      rows: testSheetRows
    })
  });

  if (!analyzeRes.ok) {
    const err = await analyzeRes.text();
    throw new Error(`Analyze endpoint failed: ${err}`);
  }

  const analysis = await analyzeRes.json();
  console.log('✓ Analysis response received:');
  console.log(`  - Total Rows: ${analysis.summary.totalRows}`);
  console.log(`  - Clean Rows: ${analysis.summary.cleanCount}`);
  console.log(`  - Flagged for Review: ${analysis.summary.flaggedCount}`);
  console.log(`  - Exact Duplicates: ${analysis.summary.exactDuplicatesCount}`);
  console.log(`  - Stay Updates: ${analysis.summary.stayUpdatesCount}`);
  console.log(`  - Repeat Bookings: ${analysis.summary.repeatBookingsCount}`);
  console.log(`  - Key Conflicts: ${analysis.summary.conflictsCount}`);

  // Assertions on Analysis Results
  if (analysis.summary.cleanCount !== 1) {
    throw new Error(`Expected 1 clean row, got ${analysis.summary.cleanCount}`);
  }
  if (analysis.summary.exactDuplicatesCount !== 1) {
    throw new Error(`Expected 1 exact duplicate, got ${analysis.summary.exactDuplicatesCount}`);
  }
  if (analysis.summary.stayUpdatesCount !== 1) {
    throw new Error(`Expected 1 stay update, got ${analysis.summary.stayUpdatesCount}`);
  }
  if (analysis.summary.repeatBookingsCount !== 1) {
    throw new Error(`Expected 1 repeat booking, got ${analysis.summary.repeatBookingsCount}`);
  }
  if (analysis.summary.conflictsCount !== 1) {
    throw new Error(`Expected 1 conflict, got ${analysis.summary.conflictsCount}`);
  }

  // 5. Test Curated Commit (/api/records/commit)
  console.log('\n[5/5] Testing /api/records/commit with curated analyst decisions...');
  const flagged = analysis.flaggedItems;
  const decisions = [
    // 1. Skip exact duplicate
    {
      id: flagged[0].id,
      rowIndex: flagged[0].rowIndex,
      action: 'skip',
      chosenSource: 'existing',
      incomingRow: testSheetRows[0]
    },
    // 2. Merge stay update (overwrite database stay with departure date and new charge)
    {
      id: flagged[1].id,
      rowIndex: flagged[1].rowIndex,
      action: 'merge',
      chosenSource: 'incoming',
      targetDetaineeId: flagged[1].existingDetainee.id,
      targetDetentionId: flagged[1].existingDetention.id,
      incomingRow: testSheetRows[1]
    },
    // 3. Merge repeat booking (adds 2nd stay to Detainee 2 without creating new detainee)
    {
      id: flagged[2].id,
      rowIndex: flagged[2].rowIndex,
      action: 'merge',
      chosenSource: 'incoming',
      targetDetaineeId: flagged[2].existingDetainee.id,
      incomingRow: testSheetRows[2]
    },
    // 4. Split conflict (creates separate person because jacket was recycled)
    {
      id: flagged[3].id,
      rowIndex: flagged[3].rowIndex,
      action: 'create_new',
      chosenSource: 'incoming',
      incomingRow: testSheetRows[3]
    }
  ];

  const commitRes = await fetch(`${API_URL}/api/records/commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      category: 'second_sheet_import',
      cleanRows: analysis.cleanRows,
      curatedDecisions: decisions
    })
  });

  if (!commitRes.ok) {
    const err = await commitRes.text();
    throw new Error(`Commit endpoint failed: ${err}`);
  }

  const commitResult = await commitRes.json();
  console.log('✓ Commit response received:');
  console.log(`  - Inserted Detainees: ${commitResult.insertedDetainees}`);
  console.log(`  - Updated Detainees: ${commitResult.updatedDetainees}`);
  console.log(`  - Inserted Stays: ${commitResult.insertedDetentions}`);
  console.log(`  - Updated Stays: ${commitResult.updatedDetentions}`);
  console.log(`  - Skipped Duplicates: ${commitResult.skippedRows}`);

  // Assertions:
  // Clean row (1) + Split conflict (1) = 2 inserted detainees
  // Stay update (1) + Repeat booking (1) = 2 updated detainees
  // Skipped = 1
  if (commitResult.skippedRows !== 1) {
    throw new Error(`Expected 1 skipped row, got ${commitResult.skippedRows}`);
  }
  if (commitResult.insertedDetainees !== 2) {
    throw new Error(`Expected 2 inserted detainees, got ${commitResult.insertedDetainees}`);
  }
  if (commitResult.updatedDetainees !== 2) {
    throw new Error(`Expected 2 updated detainees, got ${commitResult.updatedDetainees}`);
  }

  // Verify total detainees in DB (2 baseline + 2 new = 4 total)
  const detaineesRes = await fetch(`${API_URL}/api/detainees`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const detaineesData = await detaineesRes.json();
  console.log(`\nVerified Total Detainees in DB: ${detaineesData.length} (Expected 4)`);
  if (detaineesData.length !== 4) {
    throw new Error(`Expected exactly 4 detainees in DB, found ${detaineesData.length}`);
  }

  // Verify Detainee 1 has updated departure date
  const doeDetainee = detaineesData.find(d => d.name === 'DOE, JOHN');
  if (!doeDetainee) throw new Error('DOE, JOHN not found');
  const doeDetailRes = await fetch(`${API_URL}/api/detainees/${doeDetainee.id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const doeDetail = await doeDetailRes.json();
  console.log(`Verified DOE, JOHN Detentions Count: ${doeDetail.detentions.length} (Expected 1)`);
  console.log(`Verified DOE, JOHN Departure Date: ${doeDetail.detentions[0].departure_date} (Expected 2024-03-01)`);
  console.log(`Verified DOE, JOHN Charges Count: ${doeDetail.charges.length} (Expected 2 charges: initial + re-entry)`);

  if (doeDetail.detentions.length !== 1) {
    throw new Error(`Expected DOE, JOHN to have 1 stay, got ${doeDetail.detentions.length}`);
  }
  if (doeDetail.detentions[0].departure_date !== '2024-03-01') {
    throw new Error(`Expected departure_date to be '2024-03-01', got ${doeDetail.detentions[0].departure_date}`);
  }
  if (doeDetail.charges.length !== 2) {
    throw new Error(`Expected 2 charges, got ${doeDetail.charges.length}`);
  }

  // Verify Detainee 2 (SMITH, ALICE) has 2 detentions (repeat booking) under the same profile
  const smithDetainee = detaineesData.find(d => d.name === 'SMITH, ALICE');
  if (!smithDetainee) throw new Error('SMITH, ALICE not found');
  const smithDetailRes = await fetch(`${API_URL}/api/detainees/${smithDetainee.id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const smithDetail = await smithDetailRes.json();
  console.log(`Verified SMITH, ALICE Detentions Count: ${smithDetail.detentions.length} (Expected 2 repeat stays)`);
  if (smithDetail.detentions.length !== 2) {
    throw new Error(`Expected SMITH, ALICE to have 2 stays, got ${smithDetail.detentions.length}`);
  }

  console.log('\n===============================================================');
  console.log('🎉 ALL DEDUPLICATION & CURATION TESTS PASSED PERFECTLY!');
  console.log('===============================================================');
}

runTestSuite().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
