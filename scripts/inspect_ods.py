import pandas as pd
import sys

ods_path = '/mnt/c/Users/khani/OneDrive/test1.ods'

try:
    xl = pd.ExcelFile(ods_path, engine='odf')
    print("Sheet names:", xl.sheet_names)
    for sheet in xl.sheet_names:
        df = xl.parse(sheet)
        print(f"\n--- Sheet: {sheet} ---")
        print("Columns:", df.columns.tolist())
        print(f"Row count: {len(df)}")
        print("First 5 rows:")
        print(df.head(5))
except Exception as e:
    print(f"Error reading ODS: {e}", file=sys.stderr)
