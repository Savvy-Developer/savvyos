#!/usr/bin/env python3
"""Download US county FIPS data and generate SQL seed for us_counties table."""
import csv, io, urllib.request

URL = "https://raw.githubusercontent.com/kjhealy/fips-codes/master/state_and_county_fips_master.csv"

with urllib.request.urlopen(URL) as resp:
    data = resp.read().decode("utf-8")

reader = csv.DictReader(io.StringIO(data))

# Collect counties grouped by state
counties_by_state = {}
for row in reader:
    fips = row["fips"].strip()
    name = row["name"].strip()
    state = row["state"].strip()
    # Skip state-level rows (fips ends in 000) and national row
    if not state or state == "NA":
        continue
    if fips.endswith("000"):
        continue
    # Skip non-county entries (independent cities, etc. that are not counties)
    if not name:
        continue
    counties_by_state.setdefault(state, []).append(name)

# Build SQL
lines = []
lines.append("-- US Counties seed data")
lines.append("-- Generated from Census Bureau FIPS codes")
lines.append("")

for state_code in sorted(counties_by_state.keys()):
    for county_name in sorted(counties_by_state[state_code]):
        safe = county_name.replace("'", "''")
        lines.append(
            f"INSERT INTO us_counties (stateCode, name) SELECT '{state_code}', '{safe}' "
            f"WHERE NOT EXISTS (SELECT 1 FROM us_counties WHERE stateCode='{state_code}' AND name='{safe}');"
        )

sql = "\n".join(lines)
with open("/home/ubuntu/savvyos/scripts/county-seed.sql", "w") as f:
    f.write(sql)

total = sum(len(v) for v in counties_by_state.values())
print(f"Generated seed for {total} counties across {len(counties_by_state)} states.")
