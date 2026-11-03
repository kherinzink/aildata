import pandas as pd
import json
import sqlite3
import os

ods_path = '/mnt/c/Users/khani/OneDrive/test1.ods'
db_path = os.path.join(os.path.dirname(__file__), '../aildata.db')

print(f"Reading ODS from: {ods_path}")
df = pd.read_excel(ods_path, sheet_name='Sheet1', engine='odf')
df = df.where(pd.notnull(df), None)

# Ensure database directory exists
os.makedirs(os.path.dirname(db_path), exist_ok=True)
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Create table matching migrations.ts
cursor.execute('''
  CREATE TABLE IF NOT EXISTS dynamic_records (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    data_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
''')

count = 0
for idx, row in df.iterrows():
    # Convert all values to string/native types to avoid serialization issues
    row_dict = {}
    for k, v in row.items():
        if v is not None:
            row_dict[str(k)] = str(v)
        else:
            row_dict[str(k)] = ""
            
    name = row_dict.get('Name (From Jail Tracker)', f'Record_{idx}')
    record_id = f'det_{idx}_{hash(name) & 0xffffffff}'
    category = 'detainee_record'
    data_json = json.dumps(row_dict)
    
    cursor.execute('''
      INSERT OR REPLACE INTO dynamic_records (id, category, data_json, created_at, updated_at)
      VALUES (?, ?, ?, datetime("now"), datetime("now"));
    ''', (record_id, category, data_json))
    count += 1

conn.commit()
conn.close()
print(f"Successfully imported {count} records from test1.ods into {db_path}!")
