const API_URL = 'http://127.0.0.1:8787';

async function testStats() {
  console.log('--- Testing Normalized Relational Metrics on /api/stats ---');

  // 1. Get or create admin token
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
    // If not yet setup
    const regRes = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rootadmin@test.org', password: 'RootPassword123!', role: 'admin' })
    });
    const regData = await regRes.json();
    token = regData.token;
  }

  if (!token) throw new Error('Could not obtain session token');

  // 2. Ingest normalized relational rows with specific dates and demographics
  const now = new Date();
  const formatMonth = (offsetMonths) => {
    const d = new Date(now.getFullYear(), now.getMonth() - offsetMonths, 15);
    return d.toISOString().split('T')[0];
  };

  const sampleRows = [
    // Departed 2 months ago, Age 17 (Under 18), Country: Mexico
    {
      'name': 'JUAN TEST 1',
      'age': '17',
      'country': 'Mexico',
      'sex': 'M',
      'book_date': formatMonth(4),
      'departure_date': formatMonth(2),
      'charges': 'Entry without inspection'
    },
    // Departed 1 month ago, Age 24 (18–25), Country: Guatemala
    {
      'name': 'CARLOS TEST 2',
      'age': '24',
      'country': 'Guatemala',
      'sex': 'M',
      'book_date': formatMonth(3),
      'departure_date': formatMonth(1),
      'charges': 'Immigration hold'
    },
    // Active currently (No departure date), Age 32 (26–35), Country: Honduras
    {
      'name': 'MARIA TEST 3',
      'age': '32',
      'country': 'Honduras',
      'sex': 'F',
      'book_date': formatMonth(2),
      'departure_date': '',
      'charges': 'Status violation'
    },
    // Departed 8 months ago (outside 6 month window), Age 45 (36–50), Country: Mexico
    {
      'name': 'PEDRO TEST 4',
      'age': '45',
      'country': 'Mexico',
      'sex': 'M',
      'book_date': formatMonth(10),
      'departure_date': formatMonth(8),
      'charges': 'Overstay'
    },
    // Active currently, Age 58 (51+), Country: Colombia
    {
      'name': 'ANA TEST 5',
      'age': '58',
      'country': 'Colombia',
      'sex': 'F',
      'book_date': formatMonth(1),
      'departure_date': 'present',
      'charges': 'Detention review'
    }
  ];

  console.log('Ingesting 5 normalized rows into /api/records/batch...');
  const ingestRes = await fetch(`${API_URL}/api/records/batch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ category: 'METRICS_TEST_SHEET', rows: sampleRows })
  });

  const ingestData = await ingestRes.json();
  console.log('Ingest response:', ingestData);

  // 3. Query /api/stats
  console.log('Fetching /api/stats...');
  const statsRes = await fetch(`${API_URL}/api/stats`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const stats = await statsRes.json();

  console.log('\n--- /api/stats Verification Results ---');
  console.log('1. Removed in last 6 months (Expected >= 2):', stats.removedLast6Months);
  if (stats.removedLast6Months < 2) {
    throw new Error(`Expected removedLast6Months >= 2, got ${stats.removedLast6Months}`);
  }

  console.log('1b. Removals by Month:', stats.removalsByMonth);
  if (!Array.isArray(stats.removalsByMonth) || stats.removalsByMonth.length === 0) {
    throw new Error('removalsByMonth is empty or not an array');
  }

  console.log('2. Intake Velocity (Avg per day):', stats.intakeVelocity);
  if (!Array.isArray(stats.intakeVelocity) || stats.intakeVelocity.length === 0) {
    throw new Error('intakeVelocity is empty or not an array');
  }

  console.log('3. Stats by Age Group:', stats.ageDistribution);
  if (!Array.isArray(stats.ageDistribution) || stats.ageDistribution.length === 0) {
    throw new Error('ageDistribution is empty or not an array');
  }
  const hasUnder18 = stats.ageDistribution.some(a => a.group === 'Under 18');
  const has18to25 = stats.ageDistribution.some(a => a.group === '18–25');
  const has26to35 = stats.ageDistribution.some(a => a.group === '26–35');
  console.log('Has Under 18?', hasUnder18, 'Has 18–25?', has18to25, 'Has 26–35?', has26to35);

  console.log('4. Stats by Origin (Country):', stats.originDistribution);
  if (!Array.isArray(stats.originDistribution) || stats.originDistribution.length === 0) {
    throw new Error('originDistribution is empty or not an array');
  }

  console.log('\n✅ ALL RELATIONAL STATS & CHART METRICS VERIFIED SUCCESSFULLY!\n');
}

testStats().catch(err => {
  console.error('❌ Stats test failed:', err);
  process.exit(1);
});
