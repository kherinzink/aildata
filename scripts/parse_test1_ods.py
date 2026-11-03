import pandas as pd
import json
import sqlite3

ods_path = '/mnt/c/Users/khani/OneDrive/test1.ods'

# Read Sheet1
df = pd.read_excel(ods_path, sheet_name='Sheet1', engine='odf')
print(f"Total rows in Sheet1: {len(df)}")
print("Columns:", df.columns.tolist())

# Clean up DataFrame (replace NaN with None/empty string)
df = df.where(pd.notnull(df), None)

records = []
for idx, row in df.iterrows():
    record_dict = row.to_dict()
    records.append(record_dict)

print(json.dumps(records[:2], indent=2))
