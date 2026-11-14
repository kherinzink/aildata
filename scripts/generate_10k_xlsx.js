const XLSX = require('xlsx');

const firstNames = ["ALEX", "JORDAN", "SAM", "MORGAN", "TAYLOR", "CASEY", "RILEY", "JAMIE", "AVERY", "PEYTON", "CHRIS", "PAT", "DREW", "REESE", "SKYLAR", "DAKOTA", "CAMERON", "KENDALL", "QUINN", "REAGAN"];
const lastNames = ["SMITH", "JOHNSON", "WILLIAMS", "BROWN", "JONES", "GARCIA", "MILLER", "DAVIS", "RODRIGUEZ", "MARTINEZ", "HERNANDEZ", "LOPEZ", "GONZALEZ", "WILSON", "ANDERSON", "THOMAS", "TAYLOR", "MOORE", "JACKSON", "MARTIN"];
const countries = ["MEXICO", "GUATEMALA", "HONDURAS", "EL SALVADOR", "COLOMBIA", "CUBA", "HAITI", "VENEZUELA", "BRAZIL", "INDIA", "CHINA", "VIETNAM", "PHILIPPINES", "NIGERIA", "KENYA", "UKRAINE", "POLAND", "RUSSIA", "IRAQ", "SOMALIA"];
const agencies = ["Greene County Jail", "Metro Detention Center", "North Facility", "County Sheriff", "Federal Holding", "District Marshal"];
const cells = ["A-1", "A-2", "B-1", "B-2", "C-3", "D-4", "E-1", "F-2", "HOLD-1", "SEC-2"];
const charges = ["Immigration Violation", "Administrative Hold", "Transit Violation", "Border Processing", "Re-entry Violation"];
const penpals = ["Jane Doe (Friend)", "Mary Smith (Family)", "Support Network Local", "ACLU Volunteer", "Penpal Coalition", "None"];

const aoa = [];
aoa.push(["Jail Tracker Export Report", "", "", "", "", "", "", "", "", "", "", "", ""]);
aoa.push([
  "Name (From Jail Tracker)",
  "Book Date in GCJ",
  "Departure Date",
  "Jacket Number",
  "ICE Case Number/A#",
  "Cell",
  "Age",
  "Race",
  "Sex",
  "Delivering Agency",
  "Country",
  "Charges",
  "Penpal"
]);

for (let i = 1; i <= 10000; i++) {
  const fn = firstNames[i % firstNames.length];
  const ln = lastNames[(i * 7) % lastNames.length];
  const name = `${fn} ${ln} ${i}`;
  const jacket = String(100000 + i);
  const iceNum = `A${String(200000000 + i)}`;
  const country = countries[(i * 3) % countries.length];
  const agency = agencies[i % agencies.length];
  const cell = cells[i % cells.length];
  const charge = charges[i % charges.length];
  const penpal = penpals[i % penpals.length];
  const age = String(20 + (i % 45));
  const sex = i % 2 === 0 ? "M" : "F";
  const bookDate = `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
  const depDate = i % 3 === 0 ? `2026-03-${String((i % 28) + 1).padStart(2, '0')}` : "Present";

  aoa.push([
    name,
    bookDate,
    depDate,
    jacket,
    iceNum,
    cell,
    age,
    "H",
    sex,
    agency,
    country,
    charge,
    penpal
  ]);
}

const worksheet = XLSX.utils.aoa_to_sheet(aoa);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "Detainees_10k");

XLSX.writeFile(workbook, "test_10000.xlsx");
console.log("Successfully regenerated test_10000.xlsx with correct range:1 header structure!");
