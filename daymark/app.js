(()=>{"use strict";
const $=id=>document.getElementById(id);
const NS="http://www.w3.org/2000/svg",MS=86400000;
const palette=["#2d7b70","#dc8a4f","#547da9","#a4769b","#c1a04e"];
const GROUPS=["Body composition","Activity","Training","Recovery","Vitals","Nutrition"];
let db,selected="weight",windowDays="90",componentKey=null,sessionView=false;
const el=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!==undefined&&txt!==null)n.textContent=txt;if(cls)n.className=cls;return n};
const svg=(tag,attrs={},label)=>{const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(label!==undefined)n.textContent=label;return n};
const dateMs=d=>Date.parse(d+"T12:00:00Z");
const dateText=d=>new Intl.DateTimeFormat("en-US",{timeZone:"UTC",month:"short",day:"numeric",year:"numeric"}).format(new Date(dateMs(d)));
const shortDate=t=>new Intl.DateTimeFormat("en-US",{timeZone:"UTC",month:"short",day:"numeric"}).format(new Date(t));
const today=()=>{const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const o={};for(const p of parts)o[p.type]=p.value;return o.year+"-"+o.month+"-"+o.day};
const fmt=(v,p=0)=>typeof v==="number"?v.toLocaleString("en-US",{maximumFractionDigits:p,minimumFractionDigits:p}):String(v);
const comp=(m,key)=>m.components.find(c=>c.key===key)||m.components[0];
const unit=(c,v)=>fmt(v,c.precision??0)+(c.unit?" "+c.unit:"");
const valid=m=>(m.records||[]).filter(r=>r.date&&r.values&&Object.values(r.values).some(v=>typeof v==="number"&&Number.isFinite(v)||typeof v==="string"&&v.trim())).slice().sort((a,b)=>a.date.localeCompare(b.date)||(a.recordId||"").localeCompare(b.recordId||""));
const onlyZeros=m=>{const n=valid(m).flatMap(r=>Object.values(r.values).filter(v=>typeof v==="number"));return n.length>0&&n.every(v=>v===0)};
const kind=m=>m.id==="weight"?"Body composition":m.id.startsWith("polar_nightly")||m.id==="polar_ans_status"||m.id==="polar_recovery_indicator"||m.id.startsWith("polar_sleep")?"Recovery":m.id.startsWith("polar_")?"Training":m.group==="Polar"?"Training":m.group;
const metric=()=>db.metrics.find(m=>m.id===selected);
const isSessions=m=>["polar_workout_duration","polar_workout_calories","polar_workout_hr","polar_workout_distance","polar_training_load","polar_cardio_load","polar_workout_hr_zones","polar_recovery_time"].includes(m.id);
const isDailySum=m=>["polar_workout_duration","polar_workout_calories","polar_workout_hr_zones"].includes(m.id);
const isBar=m=>["steps","distance","active_energy","polar_steps","polar_workout_duration","polar_workout_calories","polar_workout_hr_zones","polar_sleep_duration","polar_sleep_rem","polar_sleep_light","polar_sleep_deep","polar_sleep_wake"].includes(m.id);
const isInterval=m=>m.id==="polar_workout_hr";
const isStack=m=>m.id==="polar_workout_hr_zones";
const colorFor=i=>palette[i%palette.length];
const inWindow=(rows)=>{if(windowDays==="all")return rows;const threshold=dateMs(today())-(Number(windowDays)-1)*MS;return rows.filter(r=>dateMs(r.date)>=threshold)};
const last=m=>valid(m).at(-1);
function textNode(parent,tag,t,cls){const n=el(tag,t,cls);parent.append(n);return n}
function showCards(){
 const cards=$("cards");cards.replaceChildren();
 for(const id of ["weight","steps","distance","active_energy"]){
  const m=db.metrics.find(x=>x.id===id);if(!m)continue;
  const record=last(m),c=m.components[0],card=el("button",null,"overview-card");
  card.type="button";
  textNode(card,"span",m.label,"small-label");
  textNode(card,"strong",record?unit(c,record.values[c.key]):"—","big-number");
  textNode(card,"span",record?shortDate(dateMs(record.date)):"—","card-date");
  card.title=[m.label,record?"Recorded "+dateText(record.date):"No observations",record?.status==="partial"?"Partial-day reading":null,m.lastSyncedOn?"Imported "+dateText(m.lastSyncedOn):null,m.source].filter(Boolean).join(" · ");
  card.addEventListener("click",()=>choose(m.id));
  cards.append(card);
 }
}
function showGroups(){
 const host=$("groups");host.replaceChildren();
 const populated=db.metrics.filter(m=>valid(m).length>0&&!onlyZeros(m));
 for(const group of GROUPS){
  const items=populated.filter(m=>kind(m)===group);if(!items.length)continue;
  const section=el("div",null,"metric-group");textNode(section,"h3",group,"group-label");
  for(const m of items){
   const item=el("button",null,"metric-link"+(m.id===selected?" active":""));
   item.type="button";item.dataset.id=m.id;
   textNode(item,"span",m.label,"metric-link-title");
   item.title=valid(m).length+" "+(isSessions(m)?"sessions":"observations")+" · "+m.source;
   item.addEventListener("click",()=>choose(m.id));section.append(item);
  }host.append(section);
 }
 const zeroOnly=db.metrics.filter(m=>onlyZeros(m));
 if(zeroOnly.length){
  const detail=el("details",null,"planned");detail.append(el("summary",zeroOnly.length+" zero-only metrics"));
  for(const m of zeroOnly)textNode(detail,"div",m.label+" (only zero values recorded)","planned-item");
  host.append(detail);
 }
 const empty=db.metrics.filter(m=>!valid(m).length);
 if(empty.length){
  const details=el("details",null,"planned"),sum=el("summary",empty.length+" planned metrics");
  details.append(sum);for(const m of empty)textNode(details,"div",m.label,"planned-item");host.append(details);
 }
}
function choose(id){
 if(!db.metrics.some(m=>m.id===id&&valid(m).length))return;
 selected=id;componentKey=null;sessionView=false;
 windowDays=id==="weight"?"90":"30";$("range").value=windowDays;
 history.replaceState(null,"","#metric="+encodeURIComponent(id));
 showGroups();render();
 if(!window.matchMedia("(min-width: 840px)").matches)$("chart").scrollIntoView({behavior:"smooth",block:"center"});
}
function summary(m,rows){
 const host=$("summary");host.replaceChildren();
 const all=valid(m),head=all.at(-1);
 host.textContent=all.length+" "+(isSessions(m)?"sessions":"readings")+(head?" · "+shortDate(dateMs(head.date)):"");
 host.title=(head?"Latest observation: "+dateText(head.date):"No observations")+(m.lastSyncedOn?" · Imported: "+dateText(m.lastSyncedOn):"");
}
function findPoints(m,rows){
 let key=componentKey||m.components[0].key;
 let components=(m.id==="polar_workout_hr"||isStack(m))?m.components:[comp(m,key)];
 if(m.id==="polar_workout_hr"&&!sessionView){
  const durations=new Map(valid(db.metrics.find(x=>x.id==="polar_workout_duration")||{records:[]}).map(r=>[r.recordId,r.values.value]));
  const grouped=new Map();
  for(const r of rows){
   let b=grouped.get(r.date);
   if(!b){b={date:r.date,values:{},count:0,weightedSum:0,totalMinutes:0};grouped.set(r.date,b)}
   b.count++;
   const ave=r.values.average,mx=r.values.maximum,duration=durations.get(r.recordId);
   if(typeof mx==="number")b.values.maximum=Math.max(mx,b.values.maximum===undefined?mx:b.values.maximum);
   if(typeof ave==="number"&&typeof duration==="number"&&duration>0){b.weightedSum+=ave*duration;b.totalMinutes+=duration}
  }
  for(const b of grouped.values()){
   if(b.totalMinutes>0)b.values.average=b.weightedSum/b.totalMinutes;
  }
  return {rows:[...grouped.values()].sort((a,b)=>a.date.localeCompare(b.date)),components,derived:true};
 }
 if(isDailySum(m)){
  const byDate=new Map();
  for(const r of rows){let b=byDate.get(r.date);if(!b){b={date:r.date,values:{},count:0,status:r.status};byDate.set(r.date,b)}b.count++;
   for(const c of components){const v=r.values[c.key];if(typeof v==="number"&&Number.isFinite(v))b.values[c.key]=(b.values[c.key]||0)+v}
  }
  return {rows:[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)),components,derived:true};
 }
 return {rows,components,derived:false};
}
function renderTable(m,rows,components){
 $("head").replaceChildren();$("rows").replaceChildren();
 const tr=el("tr");textNode(tr,"th","Date");
 if(isSessions(m))textNode(tr,"th","Session");
 for(const c of components)textNode(tr,"th",c.label+(c.unit?" ("+c.unit+")":""));
 $("head").append(tr);
 for(const r of rows.slice(-12).reverse()){
  const tr=el("tr");textNode(tr,"td",dateText(r.date)+(r.status==="partial"?" *":""));
  if(isSessions(m))textNode(tr,"td",r.recordId?"#"+r.recordId.slice(0,7):"—");
  for(const c of components){const v=r.values[c.key];textNode(tr,"td",typeof v==="number"?fmt(v,c.precision??0):v===undefined?"—":String(v))}
  $("rows").append(tr);
 }
}
function labels(m,chartRows,derived){
 $("plot-title").textContent=m.label;
 $("plot-desc").textContent=m.description||(["polar_workout_hr","polar_workout_hr_zones"].includes(m.id)?"Measurements recorded by Polar during workouts.":"Dated measurements from "+m.source+".");
 $("source-label").textContent=m.classification.replace(/-/g," ")+" · "+m.source;
 let note=isInterval(m)&&!sessionView?"Each day shows the duration-weighted average HR across recorded sessions and the highest recorded workout peak. No missing sessions or days are invented.":derived?"Daily totals are computed from recorded sessions. No missing days are filled in.":isInterval(m)?"Each paired set shows one workout's average and maximum heart rate. Same-day sessions are offset for visibility; horizontal position does not represent time of day.":m.id==="weight"?"Dots are original weigh-ins. The 7-day average is calculated from observed weigh-ins only, and is not written to the dataset.":"Every plotted mark corresponds to an actual source observation.";
 if(m.id==="polar_recovery_indicator")note+=" Polar's recovery indicator is an ordinal scale, not a clinical diagnosis.";
 if(m.id==="polar_workout_hr_zones")note+=" Zone labels follow Polar's recorded exercise profiles; heart-rate boundaries can differ by workout.";
 if(m.lastSyncedOn)note+=" Source last imported "+dateText(m.lastSyncedOn)+".";
 if(chartRows.some(r=>r.status==="partial"))note+=" * Includes a partial-day value.";
 $("note").textContent=note;
}
function render(){
 const m=metric();if(!m)return;
 $("range").value=windowDays;
 const raws=inWindow(valid(m)),data=findPoints(m,raws),components=data.components;
 $("component-controls").replaceChildren();
 if(m.components.length>1&&!isInterval(m)&&!isStack(m)){
  const select=el("select");select.setAttribute("aria-label","Component");
  for(const c of m.components){const opt=el("option",c.label+(c.unit?" · "+c.unit:""));opt.value=c.key;select.append(opt)}
  select.value=componentKey||m.components[0].key;
  select.addEventListener("change",()=>{componentKey=select.value;render()});
  $("component-controls").append(select);
 }
 labels(m,data.rows,data.derived);summary(m,raws);renderTable(m,raws,components);
 $("plot-options").replaceChildren();
 const opts=$("plot-options");
 if(m.id==="weight"){
  const row=el("label",null,"checkbox-label"),check=el("input");check.type="checkbox";check.checked=true;check.id="avg-visible";
  row.append(check,document.createTextNode("7-day average"));
  check.addEventListener("change",()=>draw(m,data,check.checked));
  opts.append(row);
 }
 if(m.id==="polar_workout_hr"){
  const row=el("label",null,"checkbox-label"),check=el("input");check.type="checkbox";check.checked=sessionView;
  row.append(check,document.createTextNode("Individual workouts"));
  check.addEventListener("change",()=>{sessionView=check.checked;render()});
  opts.append(row);
 }
 draw(m,data,true);
}
function makeTip(host){
 const tip=el("div",null,"chart-tip");tip.hidden=true;host.append(tip);
 function show(event,message){
  tip.textContent=message;tip.hidden=false;
  const b=host.getBoundingClientRect();
  tip.style.left=Math.min(Math.max(event.clientX-b.left,95),Math.max(95,b.width-95))+"px";
  tip.style.top=Math.max(40,event.clientY-b.top-12)+"px";
 }
 return {tip,show,hide:()=>tip.hidden=true};
}
function draw(m,data,showAvg){
 const root=$("chart");root.replaceChildren();$("legend").replaceChildren();
 const series=data.components,rows=data.rows;
 if(!rows.length){textNode(root,"div","No recorded observations in this period. Try a longer date range.","empty");return}
 const bar=isBar(m),interval=isInterval(m),stack=isStack(m);
 const entries=rows.flatMap(r=>series.filter(c=>typeof r.values[c.key]==="number"&&Number.isFinite(r.values[c.key])).map(c=>({date:r.date,value:r.values[c.key],record:r,comp:c})));
 if(!entries.length){textNode(root,"div","No numerical values for this metric.","empty");return}
 const w=900,h=340,L=78,R=22,T=20,B=48;
 const todays=dateMs(today()),tFirst=Math.min(...rows.map(r=>dateMs(r.date)));
 const xMin=windowDays==="all"?Math.min(tFirst,todays-6*MS):todays-(Number(windowDays)-1)*MS;
 const xMax=Math.max(todays,tFirst);
 const xmin=xMin-MS*.5,xmax=xMax+MS*.5;
 const x=t=>L+(t-xmin)/(xmax-xmin)*(w-L-R);
 const allValues=entries.map(e=>e.value);
 if(stack){const sums=rows.map(r=>series.reduce((sum,c)=>sum+(Number(r.values[c.key])||0),0));allValues.push(...sums)}
 let lo=Math.min(...allValues),hi=Math.max(...allValues);
 if(bar){lo=0;hi=Math.max(1,hi*1.13)}
 else if(m.id==="polar_recovery_indicator"){lo=0;hi=6}
 else if(m.id==="polar_ans_status"){lo=-10;hi=10}
 else {const gap=(hi-lo)||Math.max(1,Math.abs(hi)*.05);lo-=gap*.2;hi+=gap*.2}
 if(hi<=lo)hi=lo+1;
 const y=v=>T+(hi-v)/(hi-lo)*(h-T-B),plot=svg("svg",{viewBox:"0 0 "+w+" "+h,role:"img","aria-label":m.label+" observations",class:"plot-svg"});
 const axis=svg("g");plot.append(axis);
 for(let i=0;i<=4;i++){
  const val=lo+(hi-lo)*i/4,yy=y(val);
  axis.append(svg("line",{x1:L,x2:w-R,y1:yy,y2:yy,stroke:"#e8eeec","stroke-width":1}));
  axis.append(svg("text",{x:L-11,y:yy+4,"text-anchor":"end",fill:"#72847e","font-size":12},fmt(val,Math.abs(hi-lo)<12?1:0)));
 }
 const span=xMax-xMin,nticks=Math.min(5,Math.max(2,Math.floor(span/MS/7)+2));
 for(let i=0;i<nticks;i++){
  const t=xMin+(xMax-xMin)*i/Math.max(1,nticks-1);
  axis.append(svg("text",{x:x(t),y:h-16,"text-anchor":i===0?"start":i===nticks-1?"end":"middle",fill:"#72847e","font-size":12},shortDate(t)));
 }
 const live=el("div",null,"sr-only");live.id="chart-accessible-detail";live.setAttribute("aria-live","polite");root.append(live);
 const selection=el("div",null,"point-detail");selection.hidden=true;
 const message=el("span"),dismiss=el("button","Close","point-dismiss");
 dismiss.type="button";dismiss.addEventListener("click",()=>{selection.hidden=true});
 selection.append(message,dismiss);root.append(selection);
 const tool=makeTip(root);
 function mark(node,message){
  node.setAttribute("tabindex","0");node.setAttribute("role","graphics-symbol");node.setAttribute("aria-label",message);
  node.append(svg("title",{},message));node.addEventListener("pointermove",ev=>tool.show(ev,message));
  node.addEventListener("pointerleave",tool.hide);
  node.addEventListener("click",()=>{selection.hidden=false;selection.children[0].textContent=message;tool.hide()});
  node.addEventListener("focus",()=>{const live=$("chart-accessible-detail");if(live)live.textContent=message});
  plot.append(node);
 }
 function legend(label,color){
  const chip=el("span",null,"legend-chip"),sw=el("i");sw.style.background=color;chip.append(sw,document.createTextNode(label));$("legend").append(chip);
 }
 const dates=[...new Set(rows.map(r=>r.date))].sort();
 const byDate=new Map(dates.map(d=>[d,rows.filter(r=>r.date===d)]));
 const dayWidth=(w-L-R)/((xmax-xmin)/MS);const bw=Math.max(2,Math.min(32,dayWidth*.70));
 if(stack){
  for(const r of rows){
   const px=x(dateMs(r.date));let cumulative=0;
   for(let i=0;i<series.length;i++){
    const c=series[i],v=r.values[c.key];if(typeof v!=="number")continue;
    const yBottom=y(cumulative),yTop=y(cumulative+v);
    const node=svg("rect",{x:px-bw/2,y:yTop,width:bw,height:Math.max(1,yBottom-yTop),rx:2,fill:colorFor(i)});
    mark(node,dateText(r.date)+" · "+c.label+": "+unit(c,v)+" · "+r.count+" recorded workout(s)");
    cumulative+=v;
   }
  }
 }else if(bar){
  for(const r of rows){
   const value=r.values[series[0].key];if(typeof value!=="number")continue;
   const c=series[0],px=x(dateMs(r.date));
   const node=svg("rect",{x:px-bw/2,y:y(value),width:bw,height:Math.max(1,y(0)-y(value)),rx:3,fill:colorFor(0)});
   mark(node,dateText(r.date)+(r.status==="partial"?" · partial day":"")+" · "+m.label+": "+unit(c,value)+(r.count?" · "+r.count+" sessions":""));
  }
 }else if(interval){
  for(const date of dates){
   const group=byDate.get(date),n=group.length;
   group.forEach((r,j)=>{
    const a=r.values.average,b=r.values.maximum;if(typeof a!=="number"&&typeof b!=="number")return;
    const px=x(dateMs(date))+(j-(n-1)/2)*Math.min(8,dayWidth/Math.max(1,n));
    const lower=typeof a==="number"?a:b,upper=typeof b==="number"?b:a;
    const msg=r.count&&!sessionView?dateText(date)+" · "+r.count+" recorded workout(s) · duration-weighted mean "+(typeof a==="number"?fmt(a,1):"—")+" bpm · highest peak "+(b??"—")+" bpm":dateText(date)+" · session #"+(j+1)+" of "+n+" · average "+(a??"—")+" bpm · maximum "+(b??"—")+" bpm";
    if(a!==undefined&&b!==undefined){const bar=svg("line",{x1:px,x2:px,y1:y(lower),y2:y(upper),stroke:"#93aaa5","stroke-width":2});mark(bar,msg)}
    if(typeof a==="number")mark(svg("circle",{cx:px,cy:y(a),r:4.5,fill:colorFor(0),stroke:"#fff","stroke-width":1.5}),msg);
    if(typeof b==="number")mark(svg("circle",{cx:px,cy:y(b),r:4.5,fill:colorFor(1),stroke:"#fff","stroke-width":1.5}),msg);
   });
  }
 }else{
  const c=series[0],points=rows.filter(r=>typeof r.values[c.key]==="number");
  for(const date of dates){
   const group=byDate.get(date).filter(r=>typeof r.values[c.key]==="number"),n=group.length;
   group.forEach((r,j)=>{
    const v=r.values[c.key],px=x(dateMs(date))+(j-(n-1)/2)*Math.min(8,dayWidth/Math.max(1,n));
    mark(svg("circle",{cx:px,cy:y(v),r:4.8,fill:colorFor(0),stroke:"#fff","stroke-width":1.6}),dateText(date)+" · "+c.label+": "+unit(c,v)+(n>1?" · recorded session "+(j+1)+" of "+n:""));
   });
  }
  if(m.id==="weight"&&showAvg&&points.length>1){
   const avg=points.map(r=>{const end=dateMs(r.date),sample=points.filter(o=>dateMs(o.date)>=end-6*MS&&dateMs(o.date)<=end);return {date:r.date,mean:sample.reduce((sum,o)=>sum+o.values[c.key],0)/sample.length}});
   const d=avg.map((a,i)=>(i?"L":"M")+x(dateMs(a.date)).toFixed(2)+" "+y(a.mean).toFixed(2)).join(" ");
   plot.append(svg("path",{d,stroke:colorFor(1),"stroke-width":2.6,fill:"none","stroke-linecap":"round","stroke-linejoin":"round","pointer-events":"none"}));
   legend("7-day observed average",colorFor(1));
  }
 }
 if(interval){legend(sessionView?"Workout average":"Daily duration-weighted mean",colorFor(0));legend(sessionView?"Workout maximum":"Daily highest workout peak",colorFor(1))}
 else if(stack)series.forEach((c,i)=>legend(c.label,colorFor(i)));
 else legend(series[0].label,colorFor(0));
 root.prepend(plot);
}
function start(x){
 db=x;
 const fromHash=decodeURIComponent(location.hash.replace(/^#metric=/,""));
 if(location.hash.startsWith("#metric=")&&db.metrics.some(m=>m.id===fromHash&&valid(m).length))selected=fromHash;
 $("range").addEventListener("change",ev=>{windowDays=ev.target.value;render()});
 $("update").textContent=db.updatedOn?shortDate(dateMs(db.updatedOn)):"—";
 $("update").title=db.updatedOn?"Dataset last updated "+dateText(db.updatedOn):"No dataset update date";
 showCards();showGroups();render();
}
fetch("./data.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("Data file unavailable");return r.json()}).then(start)
.catch(e=>{textNode($("chart"),"p","Couldn't load the measurements: "+e.message,"empty")});
})();
