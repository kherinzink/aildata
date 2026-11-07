import sqlite3
import json
import os

db_path = os.path.join(os.path.dirname(__file__), '../aildata.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 1. Create normalized relational tables
cursor.executescript('''
DROP TABLE IF EXISTS charges;
DROP TABLE IF EXISTS legal_proceedings;
DROP TABLE IF EXISTS correspondence;
DROP TABLE IF EXISTS detentions;
DROP TABLE IF EXISTS detainees;

CREATE TABLE detainees (
    id TEXT PRIMARY KEY,
    jacket_number TEXT,
    name TEXT,
    age TEXT,
    race TEXT,
    sex TEXT,
    country TEXT,
    ice_case_number TEXT
);

CREATE TABLE detentions (
    id TEXT PRIMARY KEY,
    detainee_id TEXT,
    book_date_gcj TEXT,
    departure_date TEXT,
    cell TEXT,
    days_in_gcj TEXT,
    days_prior_facility TEXT,
    came_from TEXT,
    sent_to_note TEXT,
    delivering_agency TEXT,
    duplicate_jacket_returned TEXT,
    FOREIGN KEY(detainee_id) REFERENCES detainees(id)
);

CREATE TABLE charges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    detention_id TEXT,
    charge_description TEXT,
    FOREIGN KEY(detention_id) REFERENCES detentions(id)
);

CREATE TABLE legal_proceedings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    detention_id TEXT,
    judge_ordered TEXT,
    decision_date TEXT,
    day_wait TEXT,
    notes TEXT,
    FOREIGN KEY(detention_id) REFERENCES detentions(id)
);

CREATE TABLE correspondence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    detainee_id TEXT,
    penpal TEXT,
    loc_note TEXT,
    FOREIGN KEY(detainee_id) REFERENCES detainees(id)
);
''')

# 2. Fetch flat dynamic records from dynamic_records table
cursor.execute("SELECT id, data_json FROM dynamic_records;")
rows = cursor.fetchall()

print(f"Migrating {len(rows)} flat records into normalized relational schema...")

migrated_count = 0
for raw_id, data_json in rows:
    try:
        data = json.loads(data_json)
    except:
        continue

    name = data.get('Name (From Jail Tracker)', 'UNKNOWN')
    jacket = data.get('Jacket Number', f'jacket_{migrated_count}')
    detainee_id = f"det_{jacket}_{migrated_count}"

    # Insert Detainee
    cursor.execute('''
        INSERT OR IGNORE INTO detainees (id, jacket_number, name, age, race, sex, country, ice_case_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        detainee_id,
        jacket,
        name,
        data.get('Age'),
        data.get('Race'),
        data.get('Sex'),
        data.get('Country'),
        data.get('ICE Case Number/A#')
    ))

    # Insert Detention Booking
    detention_id = f"booking_{detainee_id}"
    cursor.execute('''
        INSERT OR IGNORE INTO detentions (id, detainee_id, book_date_gcj, departure_date, cell, days_in_gcj, days_prior_facility, came_from, sent_to_note, delivering_agency, duplicate_jacket_returned)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        detention_id,
        detainee_id,
        data.get('Book Date in GCJ'),
        data.get('Departure date (or today)'),
        data.get('Cell'),
        data.get('Days in GCJ'),
        data.get('Days Prior Facility'),
        data.get('Came From'),
        data.get('Sent To (or note)'),
        data.get('Delivering Agency'),
        data.get('Duplicate Jacket # (came back?)')
    ))

    # Insert Charges
    charges = data.get('Charges')
    if charges:
        for charge in str(charges).split(';'):
            if charge.strip():
                cursor.execute('INSERT INTO charges (detention_id, charge_description) VALUES (?, ?)', (detention_id, charge.strip()))

    # Insert Legal Proceedings
    cursor.execute('''
        INSERT INTO legal_proceedings (detention_id, judge_ordered, decision_date, day_wait, notes)
        VALUES (?, ?, ?, ?, ?)
    ''', (
        detention_id,
        data.get('Judge ordered?'),
        data.get('Decision date?'),
        data.get('Day wait'),
        data.get('Notes for habeas, ongoing etc')
    ))

    # Insert Correspondence
    cursor.execute('''
        INSERT INTO correspondence (detainee_id, penpal, loc_note)
        VALUES (?, ?, ?)
    ''', (
        detainee_id,
        data.get('Penpal'),
        data.get('LocNote & Fmr. Penpal')
    ))

    migrated_count += 1

conn.commit()

# Verify counts
for table in ['detainees', 'detentions', 'charges', 'legal_proceedings', 'correspondence']:
    cursor.execute(f"SELECT COUNT(*) FROM {table};")
    print(f"Table '{table}': {cursor.fetchone()[0]} rows")

conn.close()
print("Relational migration complete successfully!")
