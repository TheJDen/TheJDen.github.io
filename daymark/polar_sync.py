"""Open Daymark Polar v4 importer. Secrets stay in GitHub Actions, not the public site."""
import base64
import datetime as dt
import json
import os
import urllib.parse
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT="https://www.polaraccesslink.com/v4/data"
TOKEN="https://auth.polar.com/oauth/token"
DATA=Path(__file__).with_name("data.json")
REDIRECT="https://thejden.github.io/daymark/polar-callback.html"

def request(url, token=None, form=None, basic=None):
    headers={"Accept":"application/json"}
    data=None
    if token: headers["Authorization"]="Bearer "+token
    if basic:
        headers["Authorization"]="Basic "+base64.b64encode(":".join(basic).encode()).decode()
    if form is not None:
        headers["Content-Type"]="application/x-www-form-urlencoded"
        data=urllib.parse.urlencode(form).encode()
    req=urllib.request.Request(url,data=data,headers=headers)
    with urllib.request.urlopen(req,timeout=40) as r:return json.load(r)

def upsert(db,id,label,components,day,values,record_id=None):
    m=next((m for m in db["metrics"] if m["id"]==id),None)
    if m is None:
        m={"id":id,"label":label,"group":"Polar","kind":"numeric","components":components,
           "source":"Polar Flow (AccessLink v4)","classification":"device-recorded","records":[]}
        db["metrics"].append(m)
    match=next((r for r in m["records"] if r["date"]==day and r.get("recordId")==record_id),None)
    if match:match["values"]=values
    else:
        record={"date":day,"values":values}
        if record_id:record["recordId"]=record_id
        m["records"].append(record)

def main():
    now=dt.datetime.now(ZoneInfo("America/Los_Angeles"))
    if os.getenv("GITHUB_EVENT_NAME")=="schedule" and now.hour!=23:
        print("Outside 11 PM Pacific window")
        return
    client=os.environ["POLAR_CLIENT_ID"]
    secret=os.environ["POLAR_CLIENT_SECRET"]
    refresh=os.getenv("POLAR_REFRESH_TOKEN")
    auth_code=os.getenv("POLAR_AUTH_CODE")
    if refresh:
        form={"grant_type":"refresh_token","refresh_token":refresh}
    elif auth_code:
        form={"grant_type":"authorization_code","code":auth_code,"redirect_uri":REDIRECT}
    else:
        print("No authorization yet; set POLAR_AUTH_CODE as a GitHub secret and run workflow")
        return
    tokens=request(TOKEN,form=form,basic=(client,secret))
    # Token refresh may rotate the refresh token. Update encrypted GitHub secret
    # BEFORE publishing or making further API requests.
    new_refresh=tokens.get("refresh_token")
    if not new_refresh:raise RuntimeError("Polar did not return refresh token")
    if not os.getenv("GH_TOKEN"):raise RuntimeError("DAYMARK_GH_TOKEN required to rotate refresh token")
    import subprocess
    subprocess.run(["gh","secret","set","POLAR_REFRESH_TOKEN","--repo",os.environ["GITHUB_REPOSITORY"],"--body",new_refresh],
                   check=True,env={**os.environ,"GH_TOKEN":os.environ["GH_TOKEN"]},capture_output=True)
    token=tokens["access_token"]
    db=json.loads(DATA.read_text())
    start=(now.date()-dt.timedelta(days=8)).isoformat()
    end=(now.date()+dt.timedelta(days=1)).isoformat()
    q=urllib.parse.urlencode({"from":start,"to":end})
    sessions=request(ROOT+"/training-sessions/list?"+q,token)
    for s in sessions.get("trainingSessions",[]):
        date=str(s.get("startTime",""))[:10]
        sid=(s.get("identifier") or {}).get("id")
        if not date or not sid:continue
        duration=s.get("durationMillis")
        if isinstance(duration,(int,float)):
            upsert(db,"polar_workout_duration","Polar workout duration",
                   [{"key":"value","label":"Duration","unit":"min","precision":1}],date,
                   {"value":round(duration/60000,1)},str(sid))
        hrv={k:s[source] for source,k in [("hrAvg","average"),("hrMax","maximum")] if isinstance(s.get(source),(int,float))}
        if hrv:
            upsert(db,"polar_workout_hr","Polar workout heart rate",
                   [{"key":"average","label":"Average","unit":"bpm","precision":0},
                    {"key":"maximum","label":"Maximum","unit":"bpm","precision":0}],date,hrv,str(sid))
    # Activity endpoint without features returns dates only. Don't invent step counts.
    activity=request(ROOT+"/activity/list?"+q,token)
    print("Polar activity days available:",len(activity.get("activities",{}).get("activityDays",[])))
    for m in db["metrics"]:m["records"].sort(key=lambda r:(r["date"],r.get("recordId","")))
    db["updatedOn"]=now.date().isoformat()
    DATA.write_text(json.dumps(db,indent=2,ensure_ascii=False)+"\n")
    print("Imported",len(sessions.get("trainingSessions",[])),"training sessions")
if __name__=="__main__":main()
