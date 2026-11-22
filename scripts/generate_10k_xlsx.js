const XLSX = require('xlsx');

// Comprehensive, culturally-grounded name pools
const NAME_POOLS = {
  hispanic: {
    firstMale: [
      "CARLOS", "JUAN", "JOSE", "MIGUEL", "LUIS", "ALEJANDRO", "FRANCISCO", "JORGE", "DIEGO", "MATEO",
      "EMMANUEL", "JESUS", "ANGEL", "HECTOR", "JAVIER", "FERNANDO", "RICARDO", "EDUARDO", "MARIO", "ROBERTO",
      "OSCAR", "MANUEL", "CRISTIAN", "RAFAEL", "RODRIGO", "SERGIO", "ANDRES", "ESTEBAN", "GONZALO", "VICTOR",
      "HUGO", "PEDRO", "RUBEN", "SALVADOR", "RAUL", "ARTURO", "IGNACIO", "GUSTAVO", "JULIO", "CESAR",
      "GABRIEL", "MARCO", "ALFONSO", "ADRIAN", "GUILLERMO", "RAMON", "ENRIQUE", "ARMANDO", "JAIME", "ALFREDO"
    ],
    firstFemale: [
      "MARIA", "GUADALUPE", "JUANA", "ANA", "CARMEN", "ROSA", "SOFIA", "CAMILA", "VALENTINA", "ISABELLA",
      "DANIELA", "GABRIELA", "MARIANA", "FERNANDA", "VALERIA", "XIMENA", "LUCIANA", "NATALIA", "ELENA", "CLAUDIA",
      "PATRICIA", "TERESA", "LAURA", "MONICA", "SILVIA", "VERONICA", "ALEJANDRA", "ADRIANA", "LETICIA", "YOLANDA",
      "BEATRIZ", "GLORIA", "MARTHA", "IRENE", "ROCIO", "LUCIA", "CECILIA", "PAOLA", "ESPERANZA", "LORENA"
    ],
    last: [
      "HERNANDEZ", "GARCIA", "MARTINEZ", "LOPEZ", "GONZALEZ", "RODRIGUEZ", "PEREZ", "SANCHEZ", "RAMIREZ", "FLORES",
      "GOMEZ", "MORALES", "VAZQUEZ", "REYES", "JIMENEZ", "TORRES", "DIAZ", "GUTIERREZ", "RUIZ", "MENDOZA",
      "AGUILAR", "ORTIZ", "MORENO", "CASTILLO", "ALVAREZ", "ROMERO", "MENDEZ", "CHAVEZ", "RIVERA", "RAMOS",
      "DOMINGUEZ", "HERRERA", "MEDINA", "CASTRO", "VARGAS", "GUZMAN", "VELAZQUEZ", "MUNOZ", "CONTRERAS", "SALAZAR",
      "DELGADO", "ORTEGA", "SILVA", "GUERRERO", "ESTRADA", "SOTO", "CORTEZ", "MALDONADO", "ROJAS", "NAVARRO"
    ],
    countries: [
      "MEXICO", "GUATEMALA", "HONDURAS", "EL SALVADOR", "COLOMBIA", "VENEZUELA", "NICARAGUA", "ECUADOR", "CUBA", "DOMINICAN REPUBLIC"
    ]
  },
  angloEuro: {
    firstMale: [
      "JAMES", "JOHN", "ROBERT", "MICHAEL", "WILLIAM", "DAVID", "RICHARD", "JOSEPH", "THOMAS", "CHARLES",
      "CHRISTOPHER", "DANIEL", "MATTHEW", "ANTHONY", "MARK", "DONALD", "STEVEN", "PAUL", "ANDREW", "JOSHUA",
      "KENNETH", "KEVIN", "BRIAN", "GEORGE", "TIMOTHY", "RONALD", "EDWARD", "JASON", "JEFFREY", "RYAN",
      "JACOB", "GARY", "NICHOLAS", "ERIC", "JONATHAN", "STEPHEN", "LARRY", "JUSTIN", "SCOTT", "BRANDON"
    ],
    firstFemale: [
      "MARY", "PATRICIA", "JENNIFER", "LINDA", "ELIZABETH", "BARBARA", "SUSAN", "JESSICA", "SARAH", "KAREN",
      "LISA", "NANCY", "BETTY", "MARGARET", "SANDRA", "ASHLEY", "KIMBERLY", "EMILY", "DONNA", "MICHELLE",
      "CAROL", "AMANDA", "MELISSA", "DEBORAH", "STEPHANIE", "REBECCA", "SHARON", "LAURA", "CYNTHIA", "KATHLEEN"
    ],
    last: [
      "SMITH", "JOHNSON", "WILLIAMS", "BROWN", "JONES", "MILLER", "DAVIS", "WILSON", "ANDERSON", "TAYLOR",
      "THOMAS", "MOORE", "JACKSON", "MARTIN", "LEE", "WHITE", "HARRIS", "CLARK", "LEWIS", "ROBINSON",
      "WALKER", "YOUNG", "ALLEN", "KING", "WRIGHT", "SCOTT", "TORRES", "NGUYEN", "HILL", "GREEN",
      "ADAMS", "BAKER", "NELSON", "CARTER", "MITCHELL", "ROBERTS", "TURNER", "PHILLIPS", "CAMPBELL", "PARKER",
      "KOWALSKI", "NOWAK", "SHEVCHENKO", "BONDARENKO", "IVANOV", "PETROV", "SMIRNOV", "MUELLER", "SCHMIDT", "WEBER"
    ],
    countries: [
      "UNITED STATES", "CANADA", "UNITED KINGDOM", "UKRAINE", "POLAND", "RUSSIA", "GERMANY", "ROMANIA", "IRELAND"
    ]
  },
  african: {
    firstMale: [
      "CHUKWUMA", "EMEKA", "OLUMIDE", "BABATUNDE", "KWAME", "KOFI", "OSEI", "MENSAH", "JUMA", "OMONDI",
      "KAMAU", "KIPCHOGE", "ABDI", "FARAH", "HASSAN", "MOHAMED", "BEKELE", "TADESSE", "SAMUEL", "EMMANUEL",
      "IBRAHIM", "MUSA", "AHMED", "DIALLO", "TRAORE", "KEITA", "SOW", "TOURE", "BAH", "BARRY"
    ],
    firstFemale: [
      "CHIOMA", "NGOZI", "AMAKA", "IFEOMA", "ABENA", "AKUA", "AFIA", "WANJIKU", "NYAMBURA", "ACHIENG",
      "AMINA", "FADUMA", "ASHA", "HALIMA", "ALMAZ", "TIGIST", "FATOUMATA", "MARIAM", "AISSATOU", "ZAINAB"
    ],
    last: [
      "ADEYEMI", "OKAFOR", "BALOGUN", "MENSAH", "OWUSU", "ASANTE", "OCHIENG", "MWANGI", "KIMANI", "WARSAME",
      "JAMA", "GHEDI", "TESFAYE", "HAILE", "TRAORE", "DIALLO", "CISSE", "CAMARA", "NDIAYE", "DIOP",
      "KABORE", "OUEDRAOGO", "BAH", "BARRY", "CONTE", "SYLLA", "KAMARA", "BANGURA", "SESAY", "KOROMA"
    ],
    countries: [
      "NIGERIA", "GHANA", "KENYA", "ETHIOPIA", "SOMALIA", "CAMEROON", "HAITI", "JAMAICA", "GUINEA", "SENEGAL"
    ]
  },
  asian: {
    firstMale: [
      "WEI", "MING", "JUN", "HAO", "CHEN", "JIAN", "LEI", "YANG", "BO", "TAO",
      "RAJESH", "AMIT", "VIKRAM", "SURESH", "RAMESH", "ARJUN", "SANJAY", "DEEPAK", "MANOJ", "RAHUL",
      "MINH", "DUNG", "TUAN", "HAI", "NAM", "THANG", "HUNG", "DUC", "HOANG", "QUAN",
      "JOSE", "JUAN", "MARK", "ANGELO", "PAOLO", "CHRISTIAN", "GABRIEL", "MIGUEL", "JAYSON", "RONALDO"
    ],
    firstFemale: [
      "MEI", "YAN", "FANG", "JING", "LI", "XIU", "HUA", "YING", "TING", "DAN",
      "PRIYA", "SUNITA", "ANANYA", "DEEPA", "KAVITA", "POOJA", "NEHA", "RANI", "SHREYA", "GEETA",
      "LINH", "HUONG", "MAI", "LAN", "PHUONG", "THU", "TRANG", "NGOC", "HOA", "ANH",
      "MARIA", "ANGELA", "CRISTINA", "JOY", "MARY", "GRACE", "BEA", "JASMINE", "PATRICIA", "DIANA"
    ],
    last: [
      "WANG", "LI", "ZHANG", "LIU", "CHEN", "YANG", "HUANG", "ZHAO", "WU", "ZHOU",
      "PATEL", "SHARMA", "SINGH", "KUMAR", "RAO", "GUPTA", "VERMA", "DESHMUKH", "NAIR", "CHOUDHURY",
      "NGUYEN", "TRAN", "LE", "PHAM", "HOANG", "VU", "VO", "DANG", "BUI", "DO",
      "SANTOS", "REYES", "CRUZ", "BAUTISTA", "DELA CRUZ", "GARCIA", "MENDOZA", "RAMOS", "FLORES", "GONZALES"
    ],
    countries: [
      "CHINA", "INDIA", "VIETNAM", "PHILIPPINES", "PAKISTAN", "BANGLADESH", "NEPAL", "CAMBODIA"
    ]
  }
};

const MIDDLE_INITIALS = ["A.", "B.", "C.", "D.", "E.", "F.", "G.", "H.", "J.", "L.", "M.", "N.", "P.", "R.", "S.", "T.", "V.", ""];

const AGENCIES = [
  "ICE Enforcement and Removal Operations",
  "Greene County Sheriff's Office",
  "US Border Patrol - RGV Sector",
  "Homeland Security Investigations (HSI)",
  "Springfield Police Department",
  "Missouri State Highway Patrol",
  "US Marshals Service - Western MO",
  "Federal Bureau of Prisons Transfer",
  "Metro Detention Inter-Agency Transport"
];

const CELLS = [
  "Pod A - Cell 102", "Pod A - Cell 105", "Pod A - Cell 118", "Pod A - Cell 204",
  "Pod B - Cell 101", "Pod B - Cell 112", "Pod B - Cell 208", "Pod B - Cell 219",
  "Pod C - Cell 004", "Pod C - Cell 015", "Pod C - Cell 108", "Pod C - Cell 202",
  "Unit D - Cell 110", "Unit D - Cell 122", "Unit D - Cell 205",
  "Medical Housing - Bed 3", "Medical Observation - Bed 6",
  "Holding Tank 2", "Holding Tank 4", "Intake Staging A", "Administrative Segregation 1"
];

const CHARGES_POOL = [
  "8 U.S.C. 1325 - Unlawful Entry by Alien",
  "8 U.S.C. 1326 - Re-entry of Removed Alien",
  "Immigration Detainer - Form I-247A",
  "Administrative Warrant for Arrest of Alien",
  "Notice to Appear (NTA) - INA 240 Proceedings",
  "8 U.S.C. 1182 - Inadmissible Alien",
  "Operating Motor Vehicle Without Valid License",
  "Failure to Appear - Municipal Court",
  "Expedited Removal Order - 8 U.S.C. 1225",
  "Reinstatement of Prior Order of Removal - 8 U.S.C. 1231"
];

const PENPALS_POOL = [
  "Sarah",
  "James",
  "Brad",
  "Tim",
  "Susan",
  "Tracy",
  "None", "None", "None", "None", "None", "None", "None", "None" // Majority None
];

const JUDGE_ORDERS = [
  "Removal",
  "VolDep",
  "Old EOIR",
  "No EOIR",
  "Pending",
  "Other"
];

// Seeded pseudorandom generator for deterministic, organic-feeling variance
let seed = 123456789;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

const aoa = [];
// Banner row
aoa.push(["Jail Tracker Custody & Inmate Management Master Export", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
// Header row
aoa.push([
  "Name (From Jail Tracker)",
  "Book Date in GCJ",
  "Departure date (or today)",
  "Jacket Number",
  "ICE Case Number/A#",
  "Cell",
  "Age",
  "Race",
  "Sex",
  "Delivering Agency",
  "Country",
  "Charges",
  "Penpal",
  "Judge ordered?"
]);

const baseDate = new Date(2023, 5, 1).getTime();
const todayDate = new Date(2026, 10, 15).getTime();

for (let i = 1; i <= 10000; i++) {
  // 1. Pick region weighted to real detention demographics
  const roll = rand();
  let poolKey = 'hispanic';
  let race = 'H';

  if (roll < 0.70) {
    poolKey = 'hispanic';
    race = 'H';
  } else if (roll < 0.82) {
    poolKey = 'angloEuro';
    race = rand() < 0.85 ? 'W' : 'B';
  } else if (roll < 0.92) {
    poolKey = 'african';
    race = 'B';
  } else {
    poolKey = 'asian';
    race = 'A';
  }

  const pool = NAME_POOLS[poolKey];
  const sex = rand() < 0.82 ? 'M' : 'F';
  const first = sex === 'M' ? pick(pool.firstMale) : pick(pool.firstFemale);
  const mid = pick(MIDDLE_INITIALS);
  
  // Double last name chance for Hispanic records (very common in law enforcement records)
  let last = pick(pool.last);
  if (poolKey === 'hispanic' && rand() < 0.28) {
    const secondLast = pick(pool.last);
    if (secondLast !== last) {
      last = `${last}-${secondLast}`;
    }
  }

  const name = mid ? `${first} ${mid} ${last}` : `${first} ${last}`;
  const country = pick(pool.countries);

  // Jacket: realistic 6-digit identifier
  const jacket = String(300000 + randInt(1, 499999));
  // A-number: 9 digits
  const iceCaseNumber = `A${String(randInt(200000000, 299999999))}`;

  // Age: natural bell curve (19 to 68)
  const age = String(randInt(19, 28) + randInt(0, 20) + (rand() < 0.1 ? randInt(5, 20) : 0));

  // Dates: realistic booking within last 2.5 years
  const bookTime = baseDate + rand() * (todayDate - baseDate - 10 * 86400000);
  const bookDateObj = new Date(bookTime);
  const bookDate = bookDateObj.toISOString().split('T')[0];

  // 42% currently in custody ('Present') vs 58% departed/released
  let depDate = 'Present';
  if (rand() < 0.58) {
    const daysInCustody = randInt(2, 280);
    const depTime = Math.min(bookTime + daysInCustody * 86400000, todayDate);
    depDate = new Date(depTime).toISOString().split('T')[0];
  }

  const cell = depDate === 'Present' ? pick(CELLS) : 'RELEASED / TRANSFERRED';
  const agency = pick(AGENCIES);

  // Charges: realistic single or multi-charge combinations, or uncharged hold
  let chargeStr = '';
  if (rand() < 0.03) {
    const chargeRoll = rand();
    if (chargeRoll < 0.10) {
      chargeStr = 'Administrative Immigrant Hold (No Formal Charges Filed)';
    } else if (chargeRoll < 0.65) {
      chargeStr = pick(CHARGES_POOL);
    } else {
      // Multi-charge combination
      const c1 = pick(CHARGES_POOL);
      let c2 = pick(CHARGES_POOL);
      while (c2 === c1) c2 = pick(CHARGES_POOL);
      chargeStr = `${c1}; ${c2}`;
    }
  }

  const penpal = pick(PENPALS_POOL);
  const judgeOrder = pick(JUDGE_ORDERS);

  aoa.push([
    name,
    bookDate,
    depDate,
    jacket,
    iceCaseNumber,
    cell,
    age,
    race,
    sex,
    agency,
    country,
    chargeStr,
    penpal,
    judgeOrder
  ]);
}

const worksheet = XLSX.utils.aoa_to_sheet(aoa);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "Detainees_10k");

XLSX.writeFile(workbook, "test_10000.xlsx");
console.log("Successfully generated realistic test_10000.xlsx with 10,000 diverse records!");
