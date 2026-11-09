"""Import selected Polar AccessLink v3 observations into Daymark.
Requires POLAR_ACCESS_TOKEN and POLAR_USER_ID as GitHub Actions secrets.
Only publishes exercise summaries and daily steps. No GPS, raw HR samples, or identity.
"""
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

BASE = "https://www.polaraccesslink.com/v3"
DATA = Path(__file__).with_name("data.json")

def get(path, token):
    req = urllib.request.Request(BASE + path, headers={
        "Authorization": "Bearer " + token, "Accept": "application/json"
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise RuntimeError("Polar API returned HTTP " + str(exc.code)) from None

def metric(db, mid, label, group, components, kind="numeric"):
    found = next((m for m in db["metrics"] if m["id"] == mid), None)
    if found:
        return found
    found = dict(id=mid, label=label, group=group, kind=kind,
                 components=components, source="Polar Flow (AccessLink)",
                 classification="device-recorded", records=[])
    db["metrics"].append(found)
    return found

def upsert(m, date, values, record_id=None):
    if not date or not values:
        return
    records = m["records"]
    for rec in records:
        if rec.get("date") == date and rec.get("recordId") == record_id:
            rec["values"] = values
            return
    rec = {"date": date, "values": values}
    if record_id:
        rec["recordId"] = record_id
    records.append(rec)

def main():
    local = dt.datetime.now(ZoneInfo("America/Los_Angeles"))
    if os.getenv("GITHUB_EVENT_NAME") == "schedule" and local.hour != 23:
        print("Not 11 PM Pacific; skipping DST alternate schedule")
        return
    token = os.getenv("POLAR_ACCESS_TOKEN")
    uid = os.getenv("POLAR_USER_ID")
    if not token or not uid:
        print("Polar credentials not configured; no data changed")
        return
    db = json.loads(DATA.read_text())
    steps = metric(db, "polar_steps", "Polar steps", "Activity",
                   [{"key":"value","label":"Steps","unit":"steps","precision":0}])
    workouts = metric(db, "polar_workout_duration", "Workout duration", "Exercise",
                      [{"key":"value","label":"Duration","unit":"min","precision":1}])
    hr = metric(db, "polar_workout_hr", "Workout heart rate", "Exercise",
                [{"key":"average","label":"Average","unit":"bpm","precision":0},
                 {"key":"maximum","label":"Maximum","unit":"bpm","precision":0}])
    # Polar activity is keyed by date; request the past week to catch late uploads.
    for days_ago in range(8):
        day = (local.date()-dt.timedelta(days=days_ago)).isoformat()
        a = get("/users/activities/" + day, token)
        if isinstance(a, dict) and isinstance(a.get("active_steps"), (int,float)):
            upsert(steps, day, {"value":a["active_steps"]})
    # Exercise list contains sessions available to the authorized user.
    items = get("/exercises?limit=100", token)
    if isinstance(items, list):
        for e in items:
            if not isinstance(e, dict):
                continue
            stamp = e.get("start_time") or e.get("start_time_utc") or ""
            date = stamp[:10]
            eid = str(e.get("id") or e.get("exercise_id") or "")
            if not date or not eid:
                continue
            duration = e.get("duration")
            # Polar uses ISO 8601 durations (PT1H20M...). Parse conservatively.
            if isinstance(duration,str) and duration.startswith("PT"):
                import re
                match = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?",duration)
                if match:
                    h,m,s=match.groups()
                    minutes=round(int(h or 0)*60+int(m or 0)+float(s or 0)/60,1)
                    upsert(workouts,date,{"value":minutes},eid)
            hrv=e.get("heart_rate") or {}
            if isinstance(hrv,dict):
                values={}
                for source,target in [("average","average"),("maximum","maximum")]:
                    if isinstance(hrv.get(source),(int,float)):
                        values[target]=hrv[source]
                if values:
                    upsert(hr,date,values,eid)
    for m in db["metrics"]:
        m["records"].sort(key=lambda r:(r.get("date",""),r.get("recordId","")))
    db["updatedOn"]=local.date().isoformat()
    DATA.write_text(json.dumps(db,indent=2,ensure_ascii=False)+"\n")
    print("Polar sync completed; published only selected summaries")

if __name__=="__main__":
    main()
