"""Open Daymark Polar v4 importer. Secrets stay in GitHub Actions, not the public site."""
import base64
import datetime as dt
import json
import os
import urllib.parse
import urllib.error
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
    try:
        with urllib.request.urlopen(req,timeout=40) as r:return json.load(r)
    except urllib.error.HTTPError as e:
        # Show only allowlisted error fields, never token, URL parameters, or raw data.
        detail=""
        if e.code == 400:
            try:
                body=json.loads(e.read(4096).decode("utf-8"))
                if isinstance(body,dict):
                    detail="; "+str({k:body[k] for k in ("error","error_description","code","message") if k in body})[:350]
            except (ValueError,UnicodeError):
                pass
        raise RuntimeError(f"Polar API rejected request (HTTP {e.code}); endpoint: {urllib.parse.urlsplit(url).path}{detail}") from None

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
    # Polar v4 live API expects local ISO date-times WITHOUT UTC offset or Z.
    # Use a completed date window, preserving the last eight local days.
    end=now.replace(tzinfo=None)
    start=end-dt.timedelta(days=8)
    q=urllib.parse.urlencode({"from":start.isoformat(timespec="seconds"),"to":end.isoformat(timespec="seconds")})
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
    # Activity is optional: a failure here should not prevent workout import.
    try:
        activity=request(ROOT+"/activity/list?"+q,token)
        print("Polar activity response received:",isinstance(activity,dict))
    except RuntimeError as e:
        print("Polar activity unavailable:",e)

    # Additional workout summary measurements. Keep GPS, names, notes, and raw
    # biometric samples private; the public dataset contains only selected values.
    for session in sessions.get("trainingSessions",[]):
        date=str(session.get("startTime",""))[:10]
        sid=(session.get("identifier") or {}).get("id")
        if not date or not sid:continue
        def workout(mid,label,source,unit,precision=1,scale=1):
            value=session.get(source)
            if isinstance(value,(int,float)) and not isinstance(value,bool):
                upsert(db,mid,label,[{"key":"value","label":label,"unit":unit,"precision":precision}],
                       date,{"value":round(value*scale,precision)},str(sid))
        workout("polar_workout_distance","Polar workout distance","distanceMeters","km",2,.001)
        workout("polar_workout_calories","Polar workout energy","calories","kcal",0)
        workout("polar_training_load","Polar training load","trainingLoad","",1)
        workout("polar_recovery_time","Polar recovery time","recoveryTimeMillis","h",1,1/3600000)
        # Session type is a categorical observation, not a generated score.
        name=session.get("sport") or session.get("sportName")
        if isinstance(name,str) and name.strip():
            upsert(db,"polar_workout_sport","Polar workout sport",
                   [{"key":"value","label":"Sport","unit":"","precision":0}],
                   date,{"value":name},str(sid))
            next(m for m in db["metrics"] if m["id"]=="polar_workout_sport")["kind"]="categorical"

    # The following endpoints are available under the four scopes originally
    # granted by the user. An empty response means no observation, not zero.
    def optional(path):
        try:
            return request(ROOT+path,token)
        except RuntimeError as exc:
            print("Optional Polar dataset unavailable:",str(exc)[:220])
            return {}
    def number(value):
        try:
            if isinstance(value,bool) or value is None:return None
            v=float(value)
            return v if v==v and abs(v)<1e12 else None
        except (ValueError,TypeError):return None
    def scalar(mid,label,day,value,unit,precision=1,record_id=None,scale=1):
        v=number(value)
        if v is None:return
        upsert(db,mid,label,[{"key":"value","label":label,"unit":unit,"precision":precision}],
               day,{"value":round(v*scale,precision)},record_id)
    def duration_hours(value):
        if not isinstance(value,str):return None
        import re
        match=re.fullmatch(r"(?:(\\d+)H)?(?:(\\d+)M)?(?:(\\d+(?:\\.\\d+)?)S)?",value.removeprefix("PT").removesuffix("s"))
        if not match:return None
        h,m,sec=match.groups()
        return round(int(h or 0)+int(m or 0)/60+float(sec or 0)/3600,2)

    # Detailed activity, sleep and recovery features require one-day windows.
    for offset in range(8):
        day=now.date()-dt.timedelta(days=offset)
        tomorrow=day+dt.timedelta(days=1)
        qday=urllib.parse.urlencode({"from":day.isoformat()+"T00:00:00",
                                    "to":tomorrow.isoformat()+"T00:00:00"})
        # Daily activity samples: derive steps only when a single device's
        # step samples are present. Multiple devices must not be added together.
        act=optional("/activity/list?"+qday+"&features=samples")
        for a in (act.get("activities") or {}).get("activityDays",[]):
            date=a.get("date")
            if not date:continue
            devices=a.get("activitiesPerDevice") or []
            if len(devices)!=1:continue
            totals=[]
            for sample in devices[0].get("activitySamples") or []:
                steps=(sample.get("stepSamples") or {}).get("steps") or []
                if steps and all(isinstance(x,(int,float)) and x>=0 for x in steps):
                    totals.append(sum(steps))
            if totals:
                scalar("polar_steps","Polar daily steps",date,sum(totals),"steps",0)
        sleep=optional("/sleeps?"+qday+"&features=sleep-evaluation,sleep-score")
        for night in sleep.get("nightSleeps",[]):
            date=night.get("sleepDate")
            if not date:continue
            evaluation=night.get("sleepEvaluation") or {}
            hours=duration_hours(evaluation.get("asleepDuration"))
            if hours is not None:scalar("polar_sleep_duration","Polar sleep duration",date,hours,"h",2)
            score=night.get("sleepScore") or {}
            scalar("polar_sleep_score","Polar sleep score",date,score.get("sleepScore"),"points",0)
            phases=evaluation.get("phaseDurations") or {}
            for field,label in (("rem","REM"),("light","Light"),("deep","Deep"),("wake","Awake")):
                h=duration_hours(phases.get(field))
                if h is not None:scalar("polar_sleep_"+field,"Polar "+label+" sleep",date,h,"h",2)
            analysis=evaluation.get("analysis") or {}
            scalar("polar_sleep_efficiency","Polar sleep efficiency",date,analysis.get("efficiencyPercent"),"%",1)
        recharge=optional("/nightly-recharge-results?"+qday)
        for night in (recharge.get("nightlyRechargeResults") or {}).get("nightlyRechargeResults",[]):
            date=night.get("sleepResultDate")
            if not date:continue
            for field,mid,label,unit,precision in (
                ("meanNightlyRecoveryRmssd","polar_nightly_hrv","Polar nightly HRV (RMSSD)","ms",1),
                ("meanNightlyRecoveryRri","polar_nightly_rri","Polar nightly R-R interval","ms",1),
                ("ansStatus","polar_ans_status","Polar ANS status","",2),
                ("recoveryIndicator","polar_recovery_indicator","Polar recovery indicator","",0)):
                scalar(mid,label,date,night.get(field),unit,precision)

    for m in db["metrics"]:m["records"].sort(key=lambda r:(r["date"],r.get("recordId","")))
    db["updatedOn"]=now.date().isoformat()
    DATA.write_text(json.dumps(db,indent=2,ensure_ascii=False)+"\n")
    print("Imported",len(sessions.get("trainingSessions",[])),"training sessions")
if __name__=="__main__":main()
