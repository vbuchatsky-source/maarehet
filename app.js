import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const sb = createClient(window.SB_URL, window.SB_ANON);
const DS=480, DE=1260, SLOT=30, DAYS=["א","ב","ג","ד","ה","ו","שבת"];
const PAL=["#fff700","#ededed","#3da9f4","#f4b084","#f79696","#fff2cc","#e2eafc","#b6d7a8","#d5a6bd","#ffe599","#a4c2f4","#f9cb9c","#b4a7d6","#a2c4c9"];
const NOTES=["☀️ יוליה בוקר","🌇 יוליה ערב","🌙 יוליה לילה"];
const LF=["schedule_id","template_id","day","start_time","end_time","title","person","color","notes","is_oneoff","cancelled","hide_time","breakdown","week_start"];
const $=s=>document.querySelector(s), esc=s=>(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const toM=t=>{const[h,m]=String(t).split(":").map(Number);return (h||0)*60+(m||0)}, toT=m=>String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
const snap=m=>Math.round(m/SLOT)*SLOT, clamp=m=>Math.max(DS,Math.min(DE,m));
let RH=+localStorage.getItem("rowH")||32, COLW=JSON.parse(localStorage.getItem("colW")||"null")||[1,1,1,1,1,1,1];
const ymd=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const sun=off=>{const t=new Date();t.setHours(12,0,0,0);t.setDate(t.getDate()-t.getDay()+7*off);return ymd(t)};
const dOf=(w,i)=>{const t=new Date(w+"T12:00:00");t.setDate(t.getDate()+i);return t};const dm=t=>t.getDate()+"."+(t.getMonth()+1);
const wkTitle=w=>`${w===sun(0)?"השבוע":w===sun(1)?"שבוע הבא":"שבוע"} \u2066${dm(dOf(w,0))}–${dm(dOf(w,6))}\u2069`;
let S={week:sun(+(localStorage.getItem("weekTab")||0))===sun(1)?sun(1):sun(0),hasNext:false,schedules:[],templates:[],lessons:[],active:null,editor:false,sel:new Set(),hist:[],hl:new Set(),undoing:false,editing:null};
const toast=t=>{const e=$("#toast");e.textContent=t;e.classList.add("on");setTimeout(()=>e.classList.remove("on"),2200)};
const err=(r)=>{if(r.error){console.error(r.error);toast("שגיאה: "+r.error.message);throw r.error}return r.data};
const pick=l=>Object.fromEntries(LF.map(k=>[k,l[k]]));

// ---------- history ----------
function push(){if(S.undoing)return;S.hist.push(JSON.parse(JSON.stringify(S.lessons)));if(S.hist.length>50)S.hist.shift();$("#undoBtn").disabled=false}
async function undo(){if(!S.hist.length||S.undoing)return;S.undoing=true;const snapL=S.hist.pop();const cur=new Map(S.lessons.map(l=>[l.id,l]));const old=new Map(snapL.map(l=>[l.id,l]));
 try{const del=[...cur.keys()].filter(id=>!old.has(id));if(del.length)err(await sb.from("lessons").delete().in("id",del));
  const ups=snapL.filter(l=>!cur.has(l.id)||JSON.stringify(pick(cur.get(l.id)))!==JSON.stringify(pick(l)));if(ups.length)err(await sb.from("lessons").upsert(ups.map(l=>({id:l.id,...pick(l)}))));
  S.lessons=snapL;render()}finally{S.undoing=false;$("#undoBtn").disabled=!S.hist.length}}

// ---------- data ops ----------
async function createLessons(arr){push();const rows=err(await sb.from("lessons").insert(arr.map(x=>({...pick(x),week_start:x.week_start||S.week}))).select());S.lessons.push(...rows);render();return rows}
async function updLessons(ids,patch,noHist){if(!noHist)push();S.lessons.forEach(l=>{if(ids.includes(l.id))Object.assign(l,patch)});render();err(await sb.from("lessons").update(patch).in("id",ids))}
async function updEach(list){push();list.forEach(([id,p])=>Object.assign(S.lessons.find(l=>l.id===id),p));render();await Promise.all(list.map(([id,p])=>sb.from("lessons").update(p).eq("id",id).then(err)))}
async function delLessons(ids){push();S.lessons=S.lessons.filter(l=>!ids.includes(l.id));ids.forEach(i=>S.sel.delete(i));render();err(await sb.from("lessons").delete().in("id",ids))}
const nw=t=>esc(t).replace(/(\S+ )?\d{1,2}:\d{2}(-\d{1,2}:\d{2})?/g,m=>`<span class="nw">${m}</span>`);
function fit(root){root.querySelectorAll(".L").forEach(el=>{let f=el.classList.contains("note")?16:15;el.style.fontSize=f+"px";
 while(f>9&&(el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1)){f-=.5;el.style.fontSize=f+"px"}})}
addEventListener("resize",()=>fit($("#grid")));
const shiftBD=(bd,d)=>(bd||[]).map(b=>({...b,start_time:toT(toM(b.start_time)+d),end_time:toT(toM(b.end_time)+d)}));

async function loadAll(){
 const[a,b]=await Promise.all([sb.from("schedules").select("*").order("created_at"),sb.from("lesson_templates").select("*").order("order")]);
 S.schedules=err(a);S.templates=err(b);
 let vis=S.schedules.filter(s=>!s.archived);
 if(!vis.length&&S.editor){const r=err(await sb.from("schedules").insert({name:"מערכת ראשית"}).select());S.schedules.push(...r);vis=r}
 const saved=localStorage.getItem("activeScheduleId");S.active=vis.find(s=>s.id===saved)?saved:vis[0]?.id;await loadLessons()}
async function loadLessons(){S.lessons=S.active?err(await sb.from("lessons").select("*").eq("schedule_id",S.active).eq("week_start",S.week)):[];
 S.hasNext=S.active?!!err(await sb.from("lessons").select("id").eq("schedule_id",S.active).eq("week_start",sun(1)).limit(1)).length:false;S.hist=[];S.sel.clear();$("#undoBtn").disabled=true;localStorage.setItem("activeScheduleId",S.active||"");subscribe();renderAll()}
let chan;function subscribe(){if(chan)sb.removeChannel(chan);if(!S.active)return;chan=sb.channel("l"+S.active).on("postgres_changes",{event:"*",schema:"public",table:"lessons"},p=>{
 if(p.eventType==="DELETE"){S.lessons=S.lessons.filter(l=>l.id!==p.old.id)}else{const n=p.new;if(n.schedule_id!==S.active||n.week_start!==S.week)return;const i=S.lessons.findIndex(l=>l.id===n.id);if(i>=0){if(S.drag)return;S.lessons[i]=n}else S.lessons.push(n)}render()}).subscribe()}

// ---------- layout ----------
function layout(ls){const out=new Map();for(let d=0;d<7;d++){const day=ls.filter(l=>l.day===d).sort((a,b)=>toM(a.start_time)-toM(b.start_time)||toM(b.end_time)-toM(a.end_time));
 let cl=[],end=-1;const flush=()=>{const cols=[];cl.forEach(l=>{let c=cols.findIndex(e=>e<=toM(l.start_time));if(c<0){c=cols.length;cols.push(0)}cols[c]=toM(l.end_time);out.set(l.id,{c,n:0})});cl.forEach(l=>out.get(l.id).n=cols.length);cl=[]};
 day.forEach(l=>{if(toM(l.start_time)>=end&&cl.length)flush();cl.push(l);end=Math.max(end,toM(l.end_time))});flush();
}return out}

// ---------- render ----------
function renderAll(){document.body.classList.toggle("editor",S.editor);renderHeader();renderSide();render()}
function renderHeader(){const vis=S.schedules.filter(s=>!s.archived),ar=S.schedules.filter(s=>s.archived);
 $("#schedSel").innerHTML=vis.map(s=>`<option value="${s.id}" ${s.id===S.active?"selected":""}>${esc(s.name)}</option>`).join("")+(S.editor&&ar.length?`<optgroup label="ארכיון (בחר לשחזור)">${ar.map(s=>`<option value="r:${s.id}">${esc(s.name)}</option>`).join("")}</optgroup>`:"");
 $("#filterSel").innerHTML=`<option value="">כל החוגים</option>`+S.templates.map(t=>`<option value="${t.id}" ${S.hl.size===1&&S.hl.has(t.id)?"selected":""}>${esc(t.title)}</option>`).join("")}
function renderSide(){$("#tplList").innerHTML=S.templates.map(t=>`<div class="tpl" draggable="true" data-tpl="${t.id}" style="background:${t.color||"#eee"}"><input type="checkbox" data-hl="${t.id}" ${S.hl.has(t.id)?"checked":""} title="הדגש"><span>${esc(t.title)}</span><button class="e" data-et="${t.id}" title="ערוך">✎</button></div>`).join("");
 $("#noteList").innerHTML=NOTES.map(n=>`<div class="note" draggable="true" data-note="${esc(n)}">${esc(n)}</div>`).join("")}
function gridHTML(g,lessons,week){const H=(DE-DS)/SLOT*RH;g.style.gridTemplateColumns=`56px ${COLW.map(w=>w+"fr").join(" ")}`;g.style.setProperty("--rh",RH+"px");
 let h=`<div class="hd"><button id="eqW" class="ed small" title="שווה עובי" aria-label="שווה עובי">≡</button></div>`+DAYS.map((d,i)=>`<div class="hd">${d}<span class="dt">${dm(dOf(week,i))}</span>${i<6?`<div class="cr ed" data-cr="${i}" title="גרור לשינוי רוחב"></div>`:""}</div>`).join("");
 h+=`<div class="tc" style="height:${H}px">`;for(let m=DS+SLOT;m<DE;m+=SLOT)h+=`<div class="tl" style="top:${(m-DS)/SLOT*RH}px">${toT(m)}</div><div class="rr ed" data-rr="${(m-DS)/SLOT}" style="top:${(m-DS)/SLOT*RH}px" title="גרור לשינוי גובה השורות"></div>`;h+=`</div>`;
 const seen=new Set(),ls=lessons.filter(l=>!seen.has(l.id)&&seen.add(l.id)),lay=layout(ls);
 for(let d=0;d<7;d++){h+=`<div class="dc" data-day="${d}" style="height:${H}px">`;
  ls.filter(l=>l.day===d).forEach(l=>{const s=clamp(toM(l.start_time)),e=Math.max(s+SLOT,clamp(toM(l.end_time))),p=lay.get(l.id)||{c:0,n:1},w=100/p.n;
   const cls=["L",l.cancelled?"cx":"",S.sel.has(l.id)?"sel":"",l.is_oneoff&&l.hide_time&&e-s<=SLOT?"note":"",S.hl.size?(S.hl.has(l.template_id)?"hl":"dim"):""].join(" ");
   const bd=(l.breakdown||[]).length?`<div class="t">${l.breakdown.map(b=>esc(`${b.person||""} ${b.start_time}-${b.end_time}`)).join("<br>")}</div>`:"";
   h+=`<div class="${cls}" data-id="${l.id}" style="top:${(s-DS)/SLOT*RH+1}px;height:${(e-s)/SLOT*RH-2}px;right:calc(${p.c*w}% + 2px);width:calc(${w}% - 4px);background:${l.color||"#eee"}"><div class="h a"></div>${nw(l.title)}${l.person&&!(l.is_oneoff&&l.hide_time)?`<div class="n">${esc(l.person)}</div>`:""}${l.hide_time?"":`<div class="t">${l.start_time}-${l.end_time}</div>`}${l.notes?`<div class="n">${nw(l.notes)}</div>`:""}${bd}${l.cancelled?`<span class="bdg">בוטל</span>`:""}<div class="h b"></div></div>`});
  h+=`</div>`}
 return h}
function render(){const g=$("#grid");$("#wkT").textContent=wkTitle(S.week);document.querySelectorAll("[data-wk]").forEach(b=>b.classList.toggle("on",b.dataset.wk==(S.week===sun(1)?1:0)));
 $("#mkNext").classList.toggle("hidden",!(S.editor&&!S.hasNext));
 g.innerHTML=gridHTML(g,S.lessons,S.week);fit(g);renderPanel()}

// ---------- row/col resize ----------
$("#grid").addEventListener("pointerdown",e=>{const t=e.target;if(!S.editor)return;
 if(t.dataset.rr){e.preventDefault();const k=+t.dataset.rr,top=$("#grid .tc").getBoundingClientRect().top;
  const mv=ev=>{RH=Math.max(16,Math.min(90,Math.round((ev.clientY-top)/k)));render()};const up=()=>{removeEventListener("pointermove",mv);removeEventListener("pointerup",up);localStorage.setItem("rowH",RH)};addEventListener("pointermove",mv);addEventListener("pointerup",up)}
 if(t.dataset.cr){e.preventDefault();const i=+t.dataset.cr,x0=e.clientX,w0=[...COLW],tot=w0.reduce((a,b)=>a+b),px=$("#grid").getBoundingClientRect().width-56;
  const mv=ev=>{const d=(x0-ev.clientX)/px*tot;const a=w0[i]+d,b=w0[i+1]-d;if(a<.3||b<.3)return;COLW[i]=a;COLW[i+1]=b;render()};const up=()=>{removeEventListener("pointermove",mv);removeEventListener("pointerup",up);localStorage.setItem("colW",JSON.stringify(COLW))};addEventListener("pointermove",mv);addEventListener("pointerup",up)}
 if(t.id==="eqW"){COLW=[1,1,1,1,1,1,1];localStorage.removeItem("colW");render()}});
// ---------- pointer drag / resize ----------
const colAt=(x,y)=>document.elementsFromPoint(x,y).find(e=>e.classList?.contains("dc"));
const minAt=(col,y)=>DS+(y-col.getBoundingClientRect().top)/RH*SLOT;
$("#grid").addEventListener("pointerdown",e=>{const el=e.target.closest(".L");if(!el||!S.editor||e.button!==0)return;const l=S.lessons.find(x=>x.id===el.dataset.id);
 const mode=e.target.classList.contains("a")?"top":e.target.classList.contains("b")?"bot":"move";const col=el.parentElement,r=el.getBoundingClientRect();
 S.drag={l,el,mode,x0:e.clientX,y0:e.clientY,grab:minAt(col,e.clientY)-toM(l.start_time),moved:false,copy:e.ctrlKey||e.metaKey,orig:{...l}};el.setPointerCapture(e.pointerId)});
$("#grid").addEventListener("pointermove",e=>{const D=S.drag;if(!D)return;if(!D.moved&&Math.hypot(e.clientX-D.x0,e.clientY-D.y0)<5)return;D.moved=true;const el=D.el;
 if(D.mode==="move"){el.classList.add("drag");el.style.transform=`translate(${e.clientX-D.x0}px,${e.clientY-D.y0}px)`}
 else{const col=el.parentElement,m=snap(clamp(minAt(col,e.clientY)));const s=toM(D.l.start_time),en=toM(D.l.end_time);
  if(D.mode==="top")D.ns=Math.min(m,en-SLOT),D.ne=en;else D.ns=s,D.ne=Math.max(m,s+SLOT);
  el.style.top=(D.ns-DS)/SLOT*RH+1+"px";el.style.height=(D.ne-D.ns)/SLOT*RH-2+"px"}});
let rzT;
const openEdit=e=>{const el=e.target.closest(".L");if(!el||!S.editor)return;e.preventDefault();S.sel.clear();S.editing=el.dataset.id;$("#panel").dataset.k="";S.pPos=S.pPos||null;render()};
$("#grid").addEventListener("contextmenu",openEdit);$("#grid").addEventListener("dblclick",openEdit);
$("#grid").addEventListener("pointerup",async e=>{const D=S.drag;if(!D)return;S.drag=null;
 if(!D.moved){if(e.ctrlKey||e.metaKey){S.sel.has(D.l.id)?S.sel.delete(D.l.id):S.sel.add(D.l.id);if(S.editing&&!S.sel.has(S.editing))S.sel.add(S.editing);S.editing=null}else{S.sel=new Set([D.l.id])}render();return}
 if(D.mode==="move"){const col=colAt(e.clientX,e.clientY);if(!col){render();return}const dur=toM(D.l.end_time)-toM(D.l.start_time);
  let s=snap(minAt(col,e.clientY)-D.grab);s=Math.max(DS,Math.min(DE-dur,s));const delta=s-toM(D.l.start_time);
  const patch={day:+col.dataset.day,start_time:toT(s),end_time:toT(s+dur),breakdown:shiftBD(D.l.breakdown,delta)};
  if(D.copy)await createLessons([{...D.l,...patch}]);else{if(patch.day===D.l.day&&!delta){render();return}await updLessons([D.l.id],patch)}}
 else{const patch={start_time:toT(D.ns),end_time:toT(D.ne)};push();Object.assign(D.l,patch);render();clearTimeout(rzT);rzT=setTimeout(()=>sb.from("lessons").update(patch).eq("id",D.l.id).then(err),400)}});

// ---------- sidebar drag (HTML5) ----------
document.addEventListener("dragstart",e=>{const t=e.target;let p=null;if(t.dataset?.tpl)p={tpl:t.dataset.tpl};else if(t.dataset?.note)p={note:t.dataset.note};else if(t.id==="oneoff")p={oneoff:1};if(p)e.dataTransfer.setData("text/plain",JSON.stringify(p))});
$("#grid").addEventListener("dragover",e=>{const c=e.target.closest(".dc");if(c){e.preventDefault();c.classList.add("over")}});
$("#grid").addEventListener("dragleave",e=>e.target.closest(".dc")?.classList.remove("over"));
$("#grid").addEventListener("drop",async e=>{const c=e.target.closest(".dc");if(!c)return;e.preventDefault();c.classList.remove("over");let p;try{p=JSON.parse(e.dataTransfer.getData("text/plain"))}catch{return}
 const s=Math.min(DE-60,Math.max(DS,Math.floor(minAt(c,e.clientY)/SLOT)*SLOT));const base={schedule_id:S.active,day:+c.dataset.day,start_time:toT(s),end_time:toT(s+60),breakdown:[],cancelled:false,hide_time:false,is_oneoff:false};
 if(p.tpl){const t=S.templates.find(x=>x.id===p.tpl);await createLessons([{...base,template_id:t.id,title:t.title,person:t.person,color:t.color,notes:t.notes}])}
 else if(p.note)await createLessons([{...base,end_time:toT(s+30),title:p.note,person:"יוליה",color:"#e2eafc",is_oneoff:true,hide_time:true}]);
 else await createLessons([{...base,title:"אירוע חד פעמי",color:"#fff700",is_oneoff:true}])});

// ---------- panels ----------
const pal=(cur,attr)=>`<div class="pal">${PAL.map(c=>`<div class="sw ${c===cur?"on":""}" ${attr}="${c}" style="background:${c}"></div>`).join("")}</div>`;
function renderPanel(){const P=$("#panel");if(!S.editor){P.classList.add("hidden");return}
 if(S.sel.size>=2){P.classList.remove("hidden");P.dataset.k="multi";P.innerHTML=`<b>${S.sel.size} פריטים נבחרו</b><label>צבע</label>${pal(null,"data-mc")}
 <div class="row"><button data-m="hide">הסתר זמן</button><button data-m="show">הצג זמן</button><button data-m="cx">בטל</button><button data-m="uncx">החזר ביטול</button></div><div class="row"><button data-m="del" style="color:#c00">🗑 מחק</button><button data-m="close">סגור</button></div>`;return}
 const l=S.lessons.find(x=>x.id===S.editing);if(!l){P.classList.add("hidden");P.dataset.k="";return}
 if(P.dataset.k===l.id&&!P.classList.contains("hidden"))return;P.dataset.k=l.id;P.classList.remove("hidden");
 P.innerHTML=`<div class="ph"><b>עריכה מהירה</b><button id="eClose" class="x" aria-label="סגור">×</button></div><div class="pb">
 <label>שם החוג</label><textarea id="eT" rows="2">${esc(l.title)}</textarea><label>שם האדם</label><input type="text" id="eP" value="${esc(l.person)}"><label>הערות</label><textarea id="eN" rows="2">${esc(l.notes)}</textarea>
 <label>צבע</label>${pal(l.color,"data-c")}<div class="g2"><div><label>שעת התחלה</label><input type="text" dir="ltr" inputmode="numeric" placeholder="HH:MM" id="eS" value="${l.start_time}"></div><div><label>שעת סיום</label><input type="text" dir="ltr" inputmode="numeric" placeholder="HH:MM" id="eE" value="${l.end_time}"></div></div>
 <div class="sep"></div><div id="bdBox"></div><button id="bdAdd" class="lnk">+ פילוח מדריכים לפי שעות</button><div class="sep"></div>
 <button id="eH" class="tg ${l.hide_time?"on":""}">👁 הסתר זמן</button><button id="eX" class="tg ${l.cancelled?"on":""}">📅 בוטל השבוע</button>
 <div class="g2 ft"><button id="eDel" class="red">🗑 מחק</button><button id="eSave" class="blk">שמור</button></div><div id="eMsg" class="emsg"></div></div>`;
 P.dataset.color=l.color||"";S.bd=JSON.parse(JSON.stringify(l.breakdown||[]));drawBD();if(S.pPos){P.style.left=S.pPos[0]+"px";P.style.top=S.pPos[1]+"px"}}
function drawBD(){$("#bdBox").innerHTML=S.bd.map((b,i)=>`<div class="bdr"><input type="text" placeholder="מדריך" data-bp="${i}" value="${esc(b.person)}"><input type="text" dir="ltr" placeholder="HH:MM" data-bs="${i}" value="${b.start_time}"><input type="text" dir="ltr" placeholder="HH:MM" data-be="${i}" value="${b.end_time}"><button data-bx="${i}" class="x">×</button></div>`).join("")}
function readBD(){$("#bdBox").querySelectorAll("input").forEach(x=>{const i=x.dataset.bp??x.dataset.bs??x.dataset.be;const k=x.dataset.bp!=null?"person":x.dataset.bs!=null?"start_time":"end_time";S.bd[i][k]=x.value})}
function validateBD(bd,s,e){if(!bd.length)return null;const L=bd.map(b=>[toM(b.start_time),toM(b.end_time)]).sort((a,b)=>a[0]-b[0]);
 if(L[0][0]!==s)return"הקטע הראשון חייב להתחיל בשעת תחילת השיעור";for(let i=0;i<L.length;i++){if(L[i][1]<=L[i][0])return"קטע עם סיום לפני התחלה";if(L[i][0]<s||L[i][1]>e)return"קטע מחוץ לטווח השיעור";if(i&&L[i][0]!==L[i-1][1])return"אסור פערים או חפיפות בין קטעים"}
 if(L.at(-1)[1]!==e)return"הקטע האחרון חייב להסתיים בשעת סיום השיעור";return null}
async function saveEdit(){const l=S.lessons.find(x=>x.id===S.editing);if(!l)return;let s=toM($("#eS").value||l.start_time),e=toM($("#eE").value||l.end_time);s=clamp(s);e=clamp(e);if(e<=s)e=Math.min(DE,s+SLOT);
 readBD();const bd=S.bd.filter(b=>b.start_time&&b.end_time).sort((a,b)=>toM(a.start_time)-toM(b.start_time));const ve=validateBD(bd,s,e);if(ve){$("#eMsg").textContent=ve;return}
 const p={breakdown:bd,title:$("#eT").value,person:$("#eP").value||null,notes:$("#eN").value||null,color:$("#panel").dataset.color||null,start_time:toT(s),end_time:toT(e),hide_time:$("#eH").classList.contains("on"),cancelled:$("#eX").classList.contains("on")};
 S.editing=null;$("#panel").dataset.k="";if(Object.keys(p).some(k=>JSON.stringify(p[k]??null)!==JSON.stringify(l[k]??null)))await updLessons([l.id],p);else render()}
$("#panel").addEventListener("click",async e=>{const t=e.target;
 if(t.dataset.c){$("#panel").dataset.color=t.dataset.c;$("#panel").querySelectorAll(".sw").forEach(s=>s.classList.toggle("on",s===t))}
 if(t.id==="eH"||t.id==="eX")t.classList.toggle("on");
 if(t.id==="bdAdd"){readBD();const l=S.lessons.find(x=>x.id===S.editing);const st=S.bd.length?S.bd.at(-1).end_time:$("#eS").value;S.bd.push({person:"",start_time:st,end_time:$("#eE").value});drawBD()}
 if(t.dataset.bx!=null){readBD();S.bd.splice(+t.dataset.bx,1);drawBD()}
 if(t.id==="eSave")saveEdit();if(t.id==="eClose"){S.editing=null;$("#panel").dataset.k="";render()}if(t.id==="eDel"){const id=S.editing;S.editing=null;$("#panel").dataset.k="";delLessons([id])}
 const ids=[...S.sel];if(t.dataset.mc)updLessons(ids,{color:t.dataset.mc});
 const m=t.dataset.m;if(m==="hide")updLessons(ids,{hide_time:true});if(m==="show")updLessons(ids,{hide_time:false});if(m==="cx")updLessons(ids,{cancelled:true});if(m==="uncx")updLessons(ids,{cancelled:false});
 if(m==="del")delLessons(ids);if(m==="close"){S.sel.clear();render()}});
$("#panel").addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.tagName!=="TEXTAREA"){e.preventDefault();saveEdit()}if(e.key==="Escape"){S.editing=null;$("#panel").dataset.k="";render()}});
$("#panel").addEventListener("pointerdown",e=>{if(!e.target.closest(".ph")||e.target.closest("button"))return;const P=$("#panel"),r=P.getBoundingClientRect(),dx=e.clientX-r.left,dy=e.clientY-r.top;
 const mv=ev=>{S.pPos=[ev.clientX-dx,ev.clientY-dy];P.style.left=S.pPos[0]+"px";P.style.top=S.pPos[1]+"px"};const up=()=>{removeEventListener("pointermove",mv);removeEventListener("pointerup",up)};addEventListener("pointermove",mv);addEventListener("pointerup",up)});
document.addEventListener("pointerdown",e=>{if(e.button!==0)return;if(S.editing&&!e.target.closest("#panel")&&!e.target.closest(".L")&&!e.target.closest("#modal"))saveEdit()});

// ---------- modal helpers ----------
function modal(html){$("#modalIn").onclick=null;$("#modalIn").innerHTML=html;$("#modal").classList.remove("hidden");return $("#modalIn")}
const closeModal=()=>$("#modal").classList.add("hidden");
$("#modal").addEventListener("pointerdown",e=>{if(e.target.id==="modal")closeModal()});
function ask(title,val){return new Promise(res=>{const m=modal(`<b>${title}</b><input id="aV" value="${esc(val||"")}" style="margin:10px 0"><div class="row"><button id="aOk" class="dark" style="width:auto">אישור</button><button id="aNo">ביטול</button></div>`);
 m.querySelector("#aV").focus();m.querySelector("#aOk").onclick=()=>{closeModal();res(m.querySelector("#aV").value.trim())};m.querySelector("#aNo").onclick=()=>{closeModal();res(null)};m.querySelector("#aV").onkeydown=e=>{if(e.key==="Enter")m.querySelector("#aOk").click()}})}

// ---------- templates ----------
function tplDialog(t){t=t||{title:"",person:"",color:PAL[2],notes:""};let color=t.color;
 const m=modal(`<b>${t.id?"עריכת חוג":"חוג חדש"}</b><label>שם</label><input id="tT" value="${esc(t.title)}"><label>אדם</label><input id="tP" value="${esc(t.person)}"><label>הערות</label><input id="tN" value="${esc(t.notes)}"><label>צבע</label>${pal(color,"data-tc")}
 <div class="row"><button id="tOk" class="dark" style="width:auto">שמור</button>${t.id?`<button id="tDel" style="color:#c00">מחק</button>`:""}${t.id?`<button id="tUp">▲</button><button id="tDn">▼</button>`:""}<button id="tNo">ביטול</button></div>`);
 m.onclick=async e=>{const x=e.target;if(x.dataset.tc){color=x.dataset.tc;m.querySelectorAll(".sw").forEach(s=>s.classList.toggle("on",s===x))}
  if(x.id==="tNo")closeModal();
  if(x.id==="tOk"){const p={title:m.querySelector("#tT").value.trim(),person:m.querySelector("#tP").value||null,notes:m.querySelector("#tN").value||null,color};if(!p.title)return toast("נדרש שם");closeModal();
   if(t.id){err(await sb.from("lesson_templates").update(p).eq("id",t.id));Object.assign(t,p);const ids=S.lessons.filter(l=>l.template_id===t.id).map(l=>l.id);
    err(await sb.from("lessons").update(p).eq("template_id",t.id));if(ids.length){push();S.lessons.forEach(l=>{if(l.template_id===t.id)Object.assign(l,p)})}}
   else{p.order=S.templates.length;S.templates.push(...err(await sb.from("lesson_templates").insert(p).select()))}renderAll()}
  if(x.id==="tDel"&&confirm("למחוק את החוג? שיעורים קיימים יישארו")){closeModal();err(await sb.from("lesson_templates").delete().eq("id",t.id));S.templates=S.templates.filter(y=>y!==t);renderAll()}
  if(x.id==="tUp"||x.id==="tDn"){const i=S.templates.indexOf(t),j=i+(x.id==="tUp"?-1:1);if(j<0||j>=S.templates.length)return;[S.templates[i],S.templates[j]]=[S.templates[j],S.templates[i]];
   await Promise.all(S.templates.map((y,k)=>(y.order=k,sb.from("lesson_templates").update({order:k}).eq("id",y.id))));renderSide()}}}
$("#tplNew").onclick=()=>tplDialog();
$("#side").addEventListener("click",e=>{if(e.target.dataset.et)tplDialog(S.templates.find(t=>t.id===e.target.dataset.et))});
$("#side").addEventListener("change",e=>{const id=e.target.dataset.hl;if(id){e.target.checked?S.hl.add(id):S.hl.delete(id);renderHeader();render()}});
$("#filterSel").onchange=e=>{S.hl=new Set(e.target.value?[e.target.value]:[]);renderSide();render()};

// ---------- schedules ----------
$("#schedSel").onchange=async e=>{const v=e.target.value;if(v.startsWith("r:")){const id=v.slice(2);err(await sb.from("schedules").update({archived:false}).eq("id",id));S.schedules.find(s=>s.id===id).archived=false;S.active=id}else S.active=v;await loadLessons()};
$("#schedNew").onclick=async()=>{const n=await ask("שם המערכת החדשה","");if(!n)return;const r=err(await sb.from("schedules").insert({name:n}).select());S.schedules.push(...r);S.active=r[0].id;await loadLessons()};
$("#schedDup").onclick=async()=>{const cur=S.schedules.find(s=>s.id===S.active);const n=await ask("שם לעותק",cur.name+" (עותק)");if(!n)return;
 const r=err(await sb.from("schedules").insert({name:n,description:cur.description}).select());S.schedules.push(...r);if(S.lessons.length)err(await sb.from("lessons").insert(S.lessons.map(l=>({...pick(l),schedule_id:r[0].id}))));S.active=r[0].id;await loadLessons()};
$("#schedRename").onclick=async()=>{const cur=S.schedules.find(s=>s.id===S.active);const n=await ask("שם חדש",cur.name);if(!n)return;err(await sb.from("schedules").update({name:n}).eq("id",cur.id));cur.name=n;renderHeader()};
$("#schedArch").onclick=async()=>{const vis=S.schedules.filter(s=>!s.archived);if(vis.length<2)return toast("לא ניתן לארכב את המערכת האחרונה");if(!confirm("להעביר לארכיון?"))return;
 err(await sb.from("schedules").update({archived:true}).eq("id",S.active));S.schedules.find(s=>s.id===S.active).archived=true;S.active=S.schedules.find(s=>!s.archived).id;await loadLessons()};

// ---------- keyboard, undo, screenshot ----------
$("#undoBtn").onclick=undo;
document.addEventListener("keydown",e=>{if(!S.editor)return;const inF=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName);if(inF)return;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"||(e.ctrlKey||e.metaKey)&&e.code==="KeyZ"){e.preventDefault();undo()}
 if(e.key==="Delete"||e.key==="Backspace"){const ids=S.sel.size?[...S.sel]:S.editing?[S.editing]:[];if(ids.length){e.preventDefault();S.editing=null;$("#panel").dataset.k="";delLessons(ids)}}
 if(e.key==="Escape"){S.sel.clear();S.editing=null;render()}});
$("#shotBtn").onclick=async()=>{const hl=S.hl,sel=S.sel;S.hl=new Set();S.sel=new Set();
 const box=document.createElement("div");box.style.cssText="position:absolute;left:0;top:0;width:1400px;background:#fff;z-index:-1";document.body.appendChild(box);
 try{for(const w of [sun(0),sun(1)]){const ls=w===S.week?S.lessons:err(await sb.from("lessons").select("*").eq("schedule_id",S.active).eq("week_start",w));if(!ls.length&&w!==sun(0))continue;
   const t=document.createElement("div");t.className="wkT";t.textContent=wkTitle(w);box.appendChild(t);const g=document.createElement("div");g.className="gridX";g.style.cssText="display:grid;position:relative";
   g.innerHTML=gridHTML(g,ls,w);g.querySelectorAll(".rr,.cr,#eqW,.h").forEach(e=>e.remove());g.querySelectorAll(".hd").forEach(e=>e.style.position="static");box.appendChild(g);fit(g)}
  const c=await html2canvas(box,{scale:2,backgroundColor:"#fff",width:1400,windowWidth:1400,x:0,y:0,scrollX:0,scrollY:0});window._shot=c.toDataURL("image/png");const blob=await new Promise(r=>c.toBlob(r,"image/png"));
  try{await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);toast("התמונה הועתקה")}catch{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="schedule.png";a.click();toast("התמונה הורדה")}}
 finally{box.remove();S.hl=hl;S.sel=sel;render()}};
document.querySelectorAll("[data-wk]").forEach(b=>b.onclick=async()=>{const o=+b.dataset.wk;localStorage.setItem("weekTab",o);S.week=sun(o);S.editing=null;await loadLessons()});
$("#mkNext").onclick=async()=>{const src=err(await sb.from("lessons").select("*").eq("schedule_id",S.active).eq("week_start",sun(0)));
 if(src.length)err(await sb.from("lessons").insert(src.map(l=>({...pick(l),week_start:sun(1)}))));localStorage.setItem("weekTab",1);S.week=sun(1);await loadLessons();toast("שבוע הבא נוצר כהעתק")};

// ---------- auth ----------
async function refreshAuth(){const{data:{session}}=await sb.auth.getSession();let ed=false;
 if(session){const r=await sb.from("editors").select("email");ed=!!(r.data&&r.data.length)}
 S.editor=ed;$("#who").textContent=session?session.user.email+(ed?"":" (צפייה בלבד)"):"";$("#loginBtn").textContent=session?"יציאה":"כניסה"}
$("#loginBtn").onclick=async()=>{const{data:{session}}=await sb.auth.getSession();if(session){await sb.auth.signOut();await refreshAuth();renderAll();return}
 const RD=location.origin+location.pathname;
 const m=modal(`<h3 style="margin:0 0 10px">כניסת עורכים</h3><label>אימייל</label><input id="lE" type="email" dir="ltr" autocomplete="email">
 <div class="row"><button id="lM" class="dark" style="width:100%">שלחו לי קישור כניסה</button></div>
 ${window.GOOGLE_ON?`<div class="row"><button id="lG" style="width:100%">כניסה עם Google</button></div>`:""}
 <details style="margin-top:12px"><summary style="cursor:pointer;font-size:13px;color:#555">כניסה עם סיסמה</summary><label>סיסמה</label><input id="lP" type="password" dir="ltr">
 <div class="row"><button id="lOk">כניסה</button><button id="lF" class="small">שכחתי סיסמה</button></div></details>
 <div class="row"><button id="lNo" class="small">ביטול</button></div><div id="lMsg" style="font-size:13px;margin-top:6px"></div>`);
 const em=()=>m.querySelector("#lE").value.trim(),msg=t=>m.querySelector("#lMsg").textContent=t;
 m.querySelector("#lNo").onclick=closeModal;m.querySelector("#lP").onkeydown=e=>{if(e.key==="Enter")m.querySelector("#lOk").click()};
 m.querySelector("#lM").onclick=async()=>{if(!em())return msg("הזן אימייל");const r=await sb.auth.signInWithOtp({email:em(),options:{shouldCreateUser:false,emailRedirectTo:RD}});msg(r.error?"לא ניתן לשלוח (האם האימייל מורשה?)":"נשלח קישור כניסה לאימייל שלך")};
 m.querySelector("#lG")?.addEventListener("click",()=>sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:RD}}));
 m.querySelector("#lF").onclick=async()=>{if(!em())return msg("הזן אימייל");await sb.auth.resetPasswordForEmail(em(),{redirectTo:RD});msg("נשלח קישור לאיפוס")};
 m.querySelector("#lOk").onclick=async()=>{const r=await sb.auth.signInWithPassword({email:em(),password:m.querySelector("#lP").value});if(r.error)return msg("כניסה נכשלה");closeModal();await refreshAuth();await loadAll()}};
sb.auth.onAuthStateChange(async ev=>{if(ev==="SIGNED_IN"&&!S.editor){await refreshAuth();await loadAll()}});
sb.auth.onAuthStateChange(async ev=>{if(ev==="PASSWORD_RECOVERY"){setTimeout(async()=>{const p=await ask("בחר סיסמה חדשה (8 תווים לפחות)","");if(p&&p.length>=8){const r=await sb.auth.updateUser({password:p});toast(r.error?"שגיאה: "+r.error.message:"הסיסמה נשמרה");await refreshAuth();renderAll()}},300)}});

await refreshAuth();await loadAll();
