const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// 1. Read first few rows from existing ~/test_10000.xlsx or test_10000.xlsx
const sourcePaths = [
  path.join(process.env.HOME || '/home/eric', 'test_10000.xlsx'),
  path.join(__dirname, '../test_10000.xlsx')
];

let sourceWb = null;
let sourcePathUsed = null;

for (const p of sourcePaths) {
  if (fs.existsSync(p)) {
    try {
      sourceWb = XLSX.readFile(p);
      sourcePathUsed = p;
      break;
    } catch (e) {
      // Continue to next path
    }
  }
}

if (!sourceWb) {
  console.error("Could not find test_10000.xlsx to seed comparison records. Please run scripts/generate_10k_xlsx.js first.");
  process.exit(1);
}

console.log("Using baseline file from:", sourcePathUsed);
const sourceSheet = sourceWb.Sheets[sourceWb.SheetNames[0]];
const sourceRows = XLSX.utils.sheet_to_json(sourceSheet, { header: 1 });

// Header is at row index 1 (0-based)
const headerRow = sourceRows[1];
console.log("Detected Header Row:", headerRow);

// Extract baseline detainees from sourceRows (skipping banner row 0 and header row 1)
const baseDetainees = [];
for (let r = 2; r < Math.min(sourceRows.length, 50); r++) {
  const row = sourceRows[r];
  if (!row || !row[0]) continue;
  baseDetainees.push({
    name: String(row[0] || '').trim(),
    bookDate: String(row[1] || '').trim(),
    depDate: String(row[2] || '').trim(),
    jacket: String(row[3] || '').trim(),
    iceCase: String(row[4] || '').trim(),
    cell: String(row[5] || '').trim(),
    age: String(row[6] || '').trim(),
    race: String(row[7] || '').trim(),
    sex: String(row[8] || '').trim(),
    agency: String(row[9] || '').trim(),
    country: String(row[10] || '').trim(),
    charges: String(row[11] || '').trim(),
    penpal: String(row[12] || '').trim(),
    judgeOrder: String(row[13] || '').trim()
  });
}

console.log(`Loaded ${baseDetainees.length} baseline candidates from test_10000.xlsx`);

// Find a person currently 'Present' for the Stay Update test
const activeDetainee = baseDetainees.find(d => d.depDate.toLowerCase() === 'present') || baseDetainees[2];
// Find a person already released for Repeat Booking test
const departedDetainee = baseDetainees.find(d => d.depDate.toLowerCase() !== 'present' && d.depDate.length > 5) || baseDetainees[0];
// Use another person for Exact Duplicate test
const exactDetainee = baseDetainees.find(d => d.jacket !== activeDetainee.jacket && d.jacket !== departedDetainee.jacket) || baseDetainees[1];
// Use another person for Key Conflict test (Jacket recycling)
const conflictDetainee = baseDetainees.find(d => d.jacket !== activeDetainee.jacket && d.jacket !== departedDetainee.jacket && d.jacket !== exactDetainee.jacket) || baseDetainees[3];
// Use another person for Ambiguous Match (Name + Country match without jacket)
const ambiguousDetainee = baseDetainees.find(d => d.jacket !== activeDetainee.jacket && d.jacket !== departedDetainee.jacket && d.jacket !== exactDetainee.jacket && d.jacket !== conflictDetainee.jacket) || baseDetainees[4];

console.log("\nSeeding Target Entities for Comparison Tests:");
console.log(`- Exact Duplicate Candidate: ${exactDetainee.name} (Jacket: ${exactDetainee.jacket})`);
console.log(`- Stay Update Candidate:     ${activeDetainee.name} (Jacket: ${activeDetainee.jacket})`);
console.log(`- Repeat Booking Candidate:  ${departedDetainee.name} (Jacket: ${departedDetainee.jacket})`);
console.log(`- Key Conflict Candidate:    ${conflictDetainee.name} (Jacket: ${conflictDetainee.jacket})`);
console.log(`- Ambiguous Match Candidate: ${ambiguousDetainee.name} (Country: ${ambiguousDetainee.country})`);

const aoa = [];
// Banner row
aoa.push(["Jail Tracker Custody & Inmate Management Follow-up & Audit Batch", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
// Header row
aoa.push([...headerRow]);

const testLog = [];

// ---------------------------------------------------------------------------
// 1. EXACT DUPLICATE (Violates uniqueness -> Prompts skip)
// ---------------------------------------------------------------------------
aoa.push([
  exactDetainee.name,
  exactDetainee.bookDate,
  exactDetainee.depDate,
  exactDetainee.jacket,
  exactDetainee.iceCase,
  exactDetainee.cell,
  exactDetainee.age,
  exactDetainee.race,
  exactDetainee.sex,
  exactDetainee.agency,
  exactDetainee.country,
  exactDetainee.charges,
  exactDetainee.penpal,
  exactDetainee.judgeOrder
]);
testLog.push({
  rowNum: aoa.length,
  testType: "EXACT_DUPLICATE",
  expectedBadge: "🔵 Exact Duplicate Stay",
  description: `Exact copy of ${exactDetainee.name} (Jacket ${exactDetainee.jacket}). Tests automatic duplicate detection and SKIP recommendation.`
});

// ---------------------------------------------------------------------------
// 2. STAY UPDATE / ENRICHMENT (Departure Date Added, Cell Changed, New Charge)
// ---------------------------------------------------------------------------
aoa.push([
  activeDetainee.name,
  activeDetainee.bookDate,
  "2026-11-12", // Updated: Released today
  activeDetainee.jacket,
  activeDetainee.iceCase,
  "RELEASED / TRANSFERRED", // Updated from cell
  activeDetainee.age,
  activeDetainee.race,
  activeDetainee.sex,
  activeDetainee.agency,
  activeDetainee.country,
  `${activeDetainee.charges}; 8 U.S.C. 1326 - Re-entry of Removed Alien`, // Added new charge
  activeDetainee.penpal,
  "Order of Removal Issued" // Updated legal order
]);
testLog.push({
  rowNum: aoa.length,
  testType: "STAY_UPDATE",
  expectedBadge: "🟡 Stay Update / Enriched Data",
  description: `Updates ${activeDetainee.name} (Jacket ${activeDetainee.jacket}) from 'Present' to released with new charge. Tests MERGE decision with side-by-side diff highlighting.`
});

// ---------------------------------------------------------------------------
// 3. REPEAT BOOKING STAY (Same Person, Brand New Booking Date / Recidivism)
// ---------------------------------------------------------------------------
aoa.push([
  departedDetainee.name,
  "2026-11-05", // Brand new booking date
  "Present",
  departedDetainee.jacket,
  departedDetainee.iceCase,
  "Pod B - Cell 112",
  String(parseInt(departedDetainee.age || '30', 10) + 1), // Age incremented (+1)
  departedDetainee.race,
  departedDetainee.sex,
  "Homeland Security Investigations (HSI)",
  departedDetainee.country,
  "8 U.S.C. 1325 - Unlawful Entry by Alien",
  "None",
  "Bond Redetermination Pending"
]);
testLog.push({
  rowNum: aoa.length,
  testType: "REPEAT_BOOKING",
  expectedBadge: "🟣 Repeat Booking (Recidivism)",
  description: `Re-books ${departedDetainee.name} (Jacket ${departedDetainee.jacket}) with new 2026 booking date. Tests repeat stay tracking linked to the existing detainee profile.`
});

// ---------------------------------------------------------------------------
// 4. KEY CONFLICT (Jacket Recycled to Completely Different Person)
// ---------------------------------------------------------------------------
aoa.push([
  conflictDetainee.sex === 'M' ? "STEPHANIE M. CONTE" : "GUILLERMO A. MENDEZ",
  "2026-11-01",
  "Present",
  conflictDetainee.jacket, // Reused Jacket number
  "A299887766", // Different ICE case
  "Pod C - Cell 202",
  "22",
  conflictDetainee.sex === 'M' ? "B" : "H",
  conflictDetainee.sex === 'M' ? "F" : "M", // Opposite sex
  "Springfield Police Department",
  conflictDetainee.sex === 'M' ? "GUINEA" : "COLOMBIA",
  "Operating Motor Vehicle Without Valid License; Failure to Appear - Municipal Court",
  "Midwest Immigrant Defense Project",
  "Case Continued for Master Calendar"
]);
testLog.push({
  rowNum: aoa.length,
  testType: "KEY_CONFLICT",
  expectedBadge: "🔴 High Conflict (Jacket Reused?)",
  description: `Reuses Jacket #${conflictDetainee.jacket} with conflicting demographic profile (different name, sex, country). Tests high-severity warning and SPLIT AS NEW PERSON recommendation.`
});

// ---------------------------------------------------------------------------
// 5. AMBIGUOUS MATCH (Same Name & Country, Missing Jacket / ICE #)
// ---------------------------------------------------------------------------
aoa.push([
  ambiguousDetainee.name, // Same name
  "2026-10-30",
  "Present",
  "", // Blank Jacket #
  "", // Blank ICE Case #
  "Intake Staging A",
  ambiguousDetainee.age,
  ambiguousDetainee.race,
  ambiguousDetainee.sex,
  "Greene County Sheriff's Office",
  ambiguousDetainee.country, // Same Country
  "Immigration Detainer - Form I-247A",
  "None",
  "None Recorded"
]);
testLog.push({
  rowNum: aoa.length,
  testType: "AMBIGUOUS_MATCH",
  expectedBadge: "🟠 Name & Country Match (Ambiguous)",
  description: `Matches ${ambiguousDetainee.name} by Name + Country (${ambiguousDetainee.country}), but Jacket and ICE # are blank. Tests ambiguous match warning.`
});

// ---------------------------------------------------------------------------
// 6. MULTIPLE IN-BATCH DUPLICATE (Two rows in this spreadsheet for same person)
// ---------------------------------------------------------------------------
aoa.push([
  "VALENTINA L. ROJAS-HERRERA",
  "2026-11-02",
  "Present",
  "889901",
  "A288112233",
  "Pod A - Cell 118",
  "24",
  "H",
  "F",
  "ICE Enforcement and Removal Operations",
  "COLOMBIA",
  "8 U.S.C. 1325 - Unlawful Entry by Alien",
  "None",
  "None Recorded"
]);
aoa.push([
  "VALENTINA L. ROJAS-HERRERA",
  "2026-11-02",
  "Present",
  "889901",
  "A288112233",
  "Pod A - Cell 118",
  "24",
  "H",
  "F",
  "ICE Enforcement and Removal Operations",
  "COLOMBIA",
  "8 U.S.C. 1325 - Unlawful Entry by Alien; Expedited Removal Order - 8 U.S.C. 1225",
  "None",
  "Order of Removal Issued"
]);
testLog.push({
  rowNum: aoa.length - 1,
  testType: "IN_BATCH_DUPLICATE",
  expectedBadge: "🟡 Stay Update / Enriched Data",
  description: `Two consecutive entries in this file for Jacket 889901. The second row adds removal order charges.`
});

// ---------------------------------------------------------------------------
// 7. A DOZEN CLEAN NEW INTAKES (To verify clean batching works alongside)
// ---------------------------------------------------------------------------
const cleanIntakes = [
  ["ALEJANDRO R. MENDOZA-CRUZ", "2026-11-08", "Present", "890101", "A290111001", "Pod A - Cell 105", "29", "H", "M", "US Border Patrol - RGV Sector", "MEXICO", "8 U.S.C. 1325 - Unlawful Entry by Alien", "None", "None Recorded"],
  ["KWAME K. MENSAH", "2026-11-09", "Present", "890102", "A290111002", "Pod B - Cell 208", "33", "B", "M", "ICE Enforcement and Removal Operations", "GHANA", "Notice to Appear (NTA) - INA 240 Proceedings", "None", "Bond Redetermination Pending"],
  ["ANANYA P. SHARMA", "2026-11-10", "Present", "890103", "A290111003", "Unit D - Cell 110", "26", "A", "F", "HSI - Kansas City Field Office", "INDIA", "8 U.S.C. 1182 - Inadmissible Alien", "Community Legal Support Network", "Case Continued for Master Calendar"],
  ["DMYTRO V. SHEVCHENKO", "2026-11-11", "Present", "890104", "A290111004", "Pod C - Cell 004", "31", "W", "M", "Greene County Sheriff's Office", "UKRAINE", "Administrative Warrant for Arrest of Alien", "None", "None Recorded"],
  ["FATOU B. TOURE", "2026-11-12", "Present", "890105", "A290111005", "Pod B - Cell 219", "22", "B", "F", "ICE Enforcement and Removal Operations", "SENEGAL", "Expedited Removal Order - 8 U.S.C. 1225", "None", "Order of Removal Issued"],
  ["MATEO J. MORALES-SILVA", "2026-11-13", "Present", "890106", "A290111006", "Pod A - Cell 204", "25", "H", "M", "Missouri State Highway Patrol", "GUATEMALA", "Operating Motor Vehicle Without Valid License", "None", "None Recorded"],
  ["JONATHAN E. SMITH", "2026-11-14", "Present", "890107", "A290111007", "Pod C - Cell 015", "45", "W", "M", "Federal Bureau of Prisons Transfer", "CANADA", "8 U.S.C. 1182 - Inadmissible Alien", "Family Support - Brother (Contacted)", "Habeas Corpus Petition Pending"],
  ["XIMENA C. GUZMAN", "2026-11-15", "Present", "890108", "A290111008", "Medical Housing - Bed 3", "52", "H", "F", "US Marshals Service - Western MO", "VENEZUELA", "Administrative Immigrant Hold (No Formal Charges Filed)", "Faith Community Penpal Volunteer", "Withholding of Removal Granted"]
];

cleanIntakes.forEach(row => aoa.push(row));

// Generate the workbook
const ws = XLSX.utils.aoa_to_sheet(aoa);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Monthly_Followup_Audit");

// Save to home directory (~/test_10000_comparison.xlsx) and local workspace (./test_10000_comparison.xlsx)
const homePath = path.join(process.env.HOME || '/home/eric', 'test_10000_comparison.xlsx');
const localPath = path.join(__dirname, '../test_10000_comparison.xlsx');

XLSX.writeFile(wb, homePath);
XLSX.writeFile(wb, localPath);

console.log("\n==========================================================================");
console.log("✅ Successfully Generated Comparison Test Spreadsheets:");
console.log(`   1. ${homePath}`);
console.log(`   2. ${localPath}`);
console.log(`   Total Rows in Sheet: ${aoa.length - 2} (plus header and banner)`);
console.log("==========================================================================");

console.log("\n📋 Test Scenarios Embedded in this Spreadsheet:");
testLog.forEach((t, i) => {
  console.log(`\n[Test #${i + 1}] Spreadsheet Row ${t.rowNum}: ${t.expectedBadge}`);
  console.log(`         Type: ${t.testType}`);
  console.log(`         Details: ${t.description}`);
});
console.log(`\n[Clean Rows] Spreadsheet Rows ${aoa.length - cleanIntakes.length + 1} to ${aoa.length}:`);
console.log(`         ${cleanIntakes.length} Clean New Detainee Intakes (ready for direct ingestion without conflicts)`);
console.log("==========================================================================\n");
