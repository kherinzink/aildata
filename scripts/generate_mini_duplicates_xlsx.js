const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// 1. Locate baseline 10,000 dataset
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
    } catch (e) {}
  }
}

if (!sourceWb) {
  console.error("Could not find test_10000.xlsx. Please ensure it exists.");
  process.exit(1);
}

console.log("Reading from baseline file:", sourcePathUsed);
const sourceSheet = sourceWb.Sheets[sourceWb.SheetNames[0]];
const sourceRows = XLSX.utils.sheet_to_json(sourceSheet, { header: 1 });

const bannerRow = sourceRows[0];
const headerRow = sourceRows[1];

// Find specific natural duplicate pairs from the 10,000 dataset
const jackets = new Map();
const names = new Map();

for (let r = 2; r < sourceRows.length; r++) {
  const row = sourceRows[r];
  if (!row || !row[0]) continue;
  const name = String(row[0]).trim();
  const jacket = String(row[3]).trim();

  if (!jackets.has(jacket)) jackets.set(jacket, []);
  jackets.get(jacket).push({ rowIdx: r, data: row });

  if (!names.has(name)) names.set(name, []);
  names.get(name).push({ rowIdx: r, data: row });
}

// 1. Inherent 10K Jacket Collisions
const jacketDups = Array.from(jackets.entries()).filter(([j, list]) => list.length > 1);
const pair1 = jacketDups[0]; // e.g. Jacket 707753 (Ricardo Jimenez vs Teresa Dominguez-Rivera)
const pair2 = jacketDups[1]; // e.g. Jacket 402494 (Ramon Delgado-Ortega vs Hector Diaz-Rivera)

// 2. Inherent 10K Name Collision
const nameDups = Array.from(names.entries()).filter(([n, list]) => list.length > 1);
const namePair = nameDups[0]; // e.g. Esteban N. Contreras

// 3. Early Records for Exact Duplicate, Stay Update, and Repeat Booking
const row2 = sourceRows[2]; // Patricia G. Chavez
const row4 = sourceRows[4]; // Maria E. Salazar-Vargas
const row5 = sourceRows[5]; // Ramon J. Perez

const miniAoa = [];
// Banner row
miniAoa.push([...bannerRow]);
// Header row
miniAoa.push([...headerRow]);

const scenarioLog = [];

// ---------------------------------------------------------------------------
// Item 1: Exact Duplicate of 10K Row 2 (Patricia Chavez)
// ---------------------------------------------------------------------------
miniAoa.push([...row2]);
scenarioLog.push({
  row: miniAoa.length,
  badge: "🔵 Exact Duplicate Stay",
  type: "EXACT_DUPLICATE",
  detainee: `${row2[0]} (Jacket ${row2[3]})`,
  note: "Identical copy of Row 2 from the 10,000 dataset. Triggers exact duplicate detection (suggests SKIP)."
});

// ---------------------------------------------------------------------------
// Item 2: Stay Update of 10K Row 4 (Maria Salazar-Vargas)
// ---------------------------------------------------------------------------
const stayUpdateRow = [...row4];
stayUpdateRow[2] = "2026-11-12"; // Updated from 'Present' to release date
stayUpdateRow[5] = "RELEASED / TRANSFERRED"; // Updated cell
stayUpdateRow[11] = `${row4[11]}; 8 U.S.C. 1326 - Re-entry of Removed Alien`; // Added charge
miniAoa.push(stayUpdateRow);
scenarioLog.push({
  row: miniAoa.length,
  badge: "🟡 Stay Update / Enriched Data",
  type: "STAY_UPDATE",
  detainee: `${row4[0]} (Jacket ${row4[3]})`,
  note: "Updates Row 4 from 'Present' to released with a new charge (suggests MERGE / UPDATE FROM SPREADSHEET)."
});

// ---------------------------------------------------------------------------
// Item 3: Repeat Booking of 10K Row 5 (Ramon Perez)
// ---------------------------------------------------------------------------
const repeatBookingRow = [...row5];
repeatBookingRow[1] = "2026-11-05"; // Brand new booking date
repeatBookingRow[2] = "Present";
repeatBookingRow[5] = "Pod B - Cell 112";
repeatBookingRow[6] = String(parseInt(row5[6] || '39', 10) + 1); // Age +1
repeatBookingRow[11] = "8 U.S.C. 1325 - Unlawful Entry by Alien";
miniAoa.push(repeatBookingRow);
scenarioLog.push({
  row: miniAoa.length,
  badge: "🟣 Repeat Booking (Recidivism)",
  type: "REPEAT_BOOKING",
  detainee: `${row5[0]} (Jacket ${row5[3]})`,
  note: "Re-books Row 5 with a new 2026 stay date for the same detainee profile (suggests MERGE)."
});

// ---------------------------------------------------------------------------
// Items 4 & 5: Natural 10K Jacket Recycling Collision (Jacket 707753)
// ---------------------------------------------------------------------------
const j1RowA = pair1[1][0].data;
const j1RowB = pair1[1][1].data;
miniAoa.push([...j1RowA]);
miniAoa.push([...j1RowB]);
scenarioLog.push({
  row: miniAoa.length - 1,
  badge: "🔴 High Conflict (Jacket Reused?)",
  type: "KEY_CONFLICT",
  detainee: `${j1RowA[0]} & ${j1RowB[0]} (Both have Jacket ${pair1[0]})`,
  note: `Both entries exist in the 10,000 dataset (Rows ${pair1[1][0].rowIdx} & ${pair1[1][1].rowIdx}). Reuses Jacket #${pair1[0]} across different people.`
});

// ---------------------------------------------------------------------------
// Items 6 & 7: Natural 10K Second Jacket Collision (Jacket 402494)
// ---------------------------------------------------------------------------
const j2RowA = pair2[1][0].data;
const j2RowB = pair2[1][1].data;
miniAoa.push([...j2RowA]);
miniAoa.push([...j2RowB]);
scenarioLog.push({
  row: miniAoa.length - 1,
  badge: "🔴 High Conflict (Jacket Reused?)",
  type: "KEY_CONFLICT",
  detainee: `${j2RowA[0]} & ${j2RowB[0]} (Both have Jacket ${pair2[0]})`,
  note: `Second natural jacket collision from the 10,000 dataset (Rows ${pair2[1][0].rowIdx} & ${pair2[1][1].rowIdx}).`
});

// ---------------------------------------------------------------------------
// Items 8 & 9: Natural 10K Name Collision with Different Jackets
// ---------------------------------------------------------------------------
const nRowA = namePair[1][0].data;
const nRowB = namePair[1][1].data;
miniAoa.push([...nRowA]);
miniAoa.push([...nRowB]);
scenarioLog.push({
  row: miniAoa.length - 1,
  badge: "🟠 Name & Country Match / Split",
  type: "AMBIGUOUS_MATCH",
  detainee: `${namePair[0]} (Jacket ${nRowA[3]} vs ${nRowB[3]})`,
  note: `Same name appears in Rows ${namePair[1][0].rowIdx} & ${namePair[1][1].rowIdx} of the 10,000 dataset with different jackets.`
});

// Build workbook
const ws = XLSX.utils.aoa_to_sheet(miniAoa);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Mini_Duplicates_Test");

const homePath = path.join(process.env.HOME || '/home/eric', 'test_duplicates_mini.xlsx');
const localPath = path.join(__dirname, '../test_duplicates_mini.xlsx');

XLSX.writeFile(wb, homePath);
XLSX.writeFile(wb, localPath);

console.log("\n==========================================================================");
console.log("✅ Successfully Generated Mini Duplicate Test Spreadsheet:");
console.log(`   1. ${homePath}`);
console.log(`   2. ${localPath}`);
console.log(`   Total Entries: ${miniAoa.length - 2} rows (ultra lightweight for fast testing)`);
console.log("==========================================================================");

console.log("\n📋 Test Cases in test_duplicates_mini.xlsx:");
scenarioLog.forEach((item, idx) => {
  console.log(`\n[Case #${idx + 1}] Spreadsheet Row ${item.row}: ${item.badge}`);
  console.log(`         Type: ${item.type}`);
  console.log(`         Detainee: ${item.detainee}`);
  console.log(`         Description: ${item.note}`);
});
console.log("==========================================================================\n");
