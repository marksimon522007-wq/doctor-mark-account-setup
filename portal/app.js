import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm';

const CFG = window.DR_MARK_CONFIG;
// Keep each browser tab's login independent. Supabase normally shares its auth
// session in localStorage, which let a student test tab replace the teacher JWT
// while the teacher dashboard was still open, triggering a correct RLS denial.
// sessionStorage survives page refreshes but cannot overwrite another tab's login.
const authStorage = window.sessionStorage;
const tabIdentityKey = 'drmark.portal.auth-tab-id.v2';
let tabIdentity = authStorage.getItem(tabIdentityKey);
if (!tabIdentity) {
  tabIdentity = window.crypto.randomUUID();
  authStorage.setItem(tabIdentityKey, tabIdentity);
}
const sb = createClient(CFG.supabaseUrl, CFG.publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: authStorage,
    storageKey: `drmark-portal-${tabIdentity}`
  }
});
const root = document.getElementById('app');
const modalRoot = document.getElementById('modal');
const toastRoot = document.getElementById('toast');
const $ = id => document.getElementById(id);
const state = {
  user: null, profile: null, student: null, settings: {}, students: [], assignments: [],
  submissions: [], messages: [], reminders: [], parents: [], parentView: null, templates: [], roleChoice: 'student',
  filter: 'all', groupFilter: 'all', studentSearch: '', busy: false, booted: false
};
const GOLD = '#d5b46c';
const STUDY_GROUPS=Object.freeze([
  {id:'OL',label:'O Level Biology'},
  {id:'AS',label:'AS Biology'},
  {id:'A2',label:'A2 Biology'},
  {id:'AS_A2',label:'AS + A2 Biology'}
]);
const STUDY_GROUP_IDS=new Set(STUDY_GROUPS.map(g=>g.id));
const groupName=id=>STUDY_GROUPS.find(g=>g.id===id)?.label||id;
function groupCheckboxes(selected=[],name='study_groups'){
  return STUDY_GROUPS.map(g=>`<label class="checkline"><input type="checkbox" name="${esc(name)}" value="${g.id}" ${selected.includes(g.id)?'checked':''}> ${esc(g.label)}</label>`).join('');
}
function validateGroups(groups) {
  if(groups.some(g=>!STUDY_GROUP_IDS.has(g)))throw Error('Select only the four Biology groups.');
  return [...new Set(groups)];
}
function daysUntilExam(date) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return null;
  const today=zoneParts(new Date()),[year,month,day]=date.split('-').map(Number);
  const calendar=Date.UTC(year,month-1,day);
  if(!Number.isFinite(calendar) || new Date(calendar).toISOString().slice(0,10)!==date)return null;
  return Math.round((calendar-Date.UTC(+today.year,+today.month-1,+today.day))/86400000);
}

const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text = x => String(x ?? '').trim();
function toast(message, bad=false) {
  clearTimeout(toast.timer);
  toastRoot.textContent = message;
  toastRoot.className = 'toast' + (bad ? ' error' : '');
  toastRoot.hidden = false;
  toast.timer = setTimeout(() => toastRoot.hidden = true, 5500);
}
function errorText(e) {
  const s = e?.message || String(e || 'Please try again.');
  if (/duplicate key/i.test(s)) return 'This work was already marked as sent. Refreshing your dashboard may help.';
  return s.length > 300 ? s.slice(0,300) : s;
}
function ok(x) { if (x?.error) throw x.error; return x.data; }
const safeUrl = raw => { try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
function zoneParts(d=new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone:CFG.teacherTimeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'}).formatToParts(d);
  return Object.fromEntries(parts.map(p=>[p.type,p.value]));
}
function localISO(day,time) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^\d{2}:\d{2}$/.test(time)) throw Error('Enter a valid deadline.');
  const [y,m,d] = day.split('-').map(Number),[hh,mm] = time.split(':').map(Number);
  const target=Date.UTC(y,m-1,d,hh,mm),test=new Date(target);
  if(test.getUTCFullYear()!==y||test.getUTCMonth()!==m-1||test.getUTCDate()!==d||hh>23||mm>59) throw Error('Invalid date or time.');
  let epoch=target;
  for(let n=0;n<4;n++){
    const p=zoneParts(new Date(epoch));
    const shown=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
    epoch += target-shown;
  }
  const verify=zoneParts(new Date(epoch));
  if(`${verify.year}-${verify.month}-${verify.day} ${verify.hour}:${verify.minute}`!==`${day} ${time}`) throw Error('This local time is not valid in Cairo.');
  return new Date(epoch).toISOString();
}
const futureDate = (days=1) => { const p=zoneParts(new Date(Date.now()+86400000*days));return `${p.year}-${p.month}-${p.day}`; };
function fmt(value, short=false) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB',{timeZone:CFG.teacherTimeZone,day:'numeric',month:'short', ...(short?{}:{year:'numeric'}),hour:'2-digit',minute:'2-digit',hour12:true}).format(new Date(value));
}
const remaining = due => Math.round((new Date(due).getTime()-Date.now())/60000);
function timeLeft(due){const n=remaining(due);if(n<=0)return 'Deadline passed';if(n<60)return `${n} min left`;if(n<1440)return `${Math.floor(n/60)}h ${n%60}m left`;return `${Math.ceil(n/1440)} day${n<2880?'':'s'} left`;}
function firstName(raw){return text(raw).replace(/^dr\.?\s+/i,'').split(/\s+/)[0]||'Future Doctor';}
function dr(raw){return 'Dr. '+firstName(raw);}
function greeting(raw){
  const hour=+zoneParts().hour,name=dr(raw);
  if(hour>=5 && hour<12)return [`Good morning, ${name}!`, 'A fresh day. A fresh opportunity.'];
  if(hour>=12 && hour<17)return [`Good afternoon, ${name}!`, 'A little progress today goes a long way.'];
  if(hour>=17 && hour<22)return [`Good evening, ${name}!`, 'Another day, another step closer to your white coat.'];
  return [`Late-night study session, ${name}?`, 'Your dreams matter. Your rest does too.'];
}
function status(a){
  const s=state.submissions.find(x=>x.assignment_id===a.id);
  if (s) return s.late?'late':'submitted';
  if(a.status==='archived') return 'archived';
  const n=remaining(a.due_at);return n<=0?'overdue':n<=120?'soon':'pending';
}
const matchingSubmission = id => state.submissions.find(s=>s.assignment_id===id);
function chip(st){const labels={pending:'To do',soon:'Due soon',overdue:'Overdue',submitted:'Sent',late:'Sent late',archived:'Archived'};const klass={submitted:'good',late:'good',soon:'warn',overdue:'bad',archived:'neutral',pending:'neutral'};return `<span class="chip ${klass[st]||'neutral'}">${labels[st]||esc(st)}</span>`;}
function studentEmail(code) {return text(code).toLowerCase().replace(/[^a-z0-9._-]/g,'-')+'@students.drmark.local';}
function parentEmail(code) {return text(code).toLowerCase().replace(/[^a-z0-9._-]/g,'-')+'@parents.drmark.local';}
function generateString(length=10){const letters='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';const bytes=new Uint8Array(length);crypto.getRandomValues(bytes);return Array.from(bytes,n=>letters[n%letters.length]).join('');}
function loadScreen(message='Opening your portal...') {root.innerHTML=`<div class="initial"><div class="spinner"></div><span>${esc(message)}</span></div>`;}
function showLogin(message='') {
  state.user=null;state.profile=null;state.student=null;state.parentView=null;
  const teacher=state.roleChoice==='teacher', parent=state.roleChoice==='parent';
  root.innerHTML=`<main class="login-wrap"><div class="login-brand"><img src="assets/k_chromosome.png" alt="Dr Mark logo"><div class="eyebrow">YOUR PATH TO THE WHITE COAT</div><h1>DR Mark Portal</h1><p>Small steps. Remarkable futures.</p></div>
  <section class="panel login-panel"><h2>Welcome back</h2><p class="tagline">A private learning space made just for you.</p>
  <div class="tabs" role="tablist" aria-label="Choose your login type"><button type="button" data-action="mode" data-mode="student" class="${!teacher&&!parent?'on':''}">Student</button><button type="button" data-action="mode" data-mode="parent" class="${parent?'on':''}">Parent</button><button type="button" data-action="mode" data-mode="teacher" class="${teacher?'on':''}">Teacher</button></div>
  ${message?`<div class="notice danger" role="alert" style="margin-bottom:16px">${esc(message)}</div>`:''}
  <form id="login-form" class="form-stack">
  <label class="field">${teacher?'Teacher email':parent?'Parent code':'Student code'}<input name="identity" ${teacher?'type="email"':'type="text"'} autocomplete="username" placeholder="${teacher?'name@example.com':parent?'PM-XXXXXXXX':'DM-XXXXXXX'}" required></label>
  <label class="field">Password<input name="password" type="password" autocomplete="current-password" minlength="6" required></label>
  <button class="button primary full" type="submit">Sign in securely</button></form>
  <p class="fineprint" style="margin-top:20px">${parent?'Enter the private code and password sent to you by Dr Mark.':'Login details are provided privately by Dr Mark. Public sign-up is disabled.'}</p></section>
  <p class="fineprint" style="margin-top:22px;text-align:center">One step closer to your white coat.</p></main>`;
}
async function boot() {
  if(state.booted)return;state.booted=true;
  loadScreen();
  try{
    const {data:{session}}=await sb.auth.getSession();
    if(!session){showLogin();return;}
    await authorize();
  }catch(e){console.error(e);showLogin('We could not restore your session. Please sign in.');}
}

/* Changes are written to Supabase immediately. These listeners make updates
   appear promptly in other open teacher/student browser tabs, while retaining
   a lightweight foreground polling fallback for dropped connections. */
let portalLiveChannel=null;
let portalLiveUser=null;
let portalLiveTimer=null;
function stopPortalLiveSync() {
  clearTimeout(portalLiveTimer);
  if(portalLiveChannel) { void sb.removeChannel(portalLiveChannel); portalLiveChannel=null; }
  portalLiveUser=null;
}
function queuePortalLiveReload() {
  if(!state.profile || state.busy || document.visibilityState==='hidden' || !modalRoot.hidden)return;
  clearTimeout(portalLiveTimer);
  portalLiveTimer=setTimeout(()=>{
    if(!state.profile || state.busy || !modalRoot.hidden || document.visibilityState==='hidden')return;
    reload().catch(err=>console.warn('Portal refresh was delayed:',err));
  },550);
}
function startPortalLiveSync() {
  if(!state.user)return;
  if(portalLiveChannel && portalLiveUser===state.user.id)return;
  stopPortalLiveSync();
  portalLiveUser=state.user.id;
  let channel=sb.channel('drmark-live-'+state.user.id+'-'+crypto.randomUUID());
  for(const table of ['portal_assignments','portal_submissions','portal_students','portal_messages','portal_parent_links','portal_homework_templates']){
    channel=channel.on('postgres_changes',{event:'*',schema:'public',table},queuePortalLiveReload);
  }
  portalLiveChannel=channel.subscribe();
}

async function authorize() {
  loadScreen('Preparing your personal workspace...');
  const {data:{user},error}=await sb.auth.getUser();
  if(error||!user){showLogin('Your session has expired. Please sign in.');return;}
  const p=ok(await sb.from('portal_profiles').select('id,role,full_name').eq('id',user.id).maybeSingle());
  if(!p||!['teacher','student','parent'].includes(p.role)){
    await sb.auth.signOut();showLogin('This account has no Portal access. Your MCQ application login is a separate service.');return;
  }
  state.user=user;state.profile=p;state.roleChoice=p.role;
  await reload(false);
  startPortalLiveSync();
}
async function reload(withToast=false){
  if(state.profile?.role==='parent'){
    await loadParentView();
    if(withToast && state.parentView)toast('Homework status updated.');
    return;
  }
  const queries=[
    sb.from('portal_settings').select('brand_name,teacher_name,subjects,default_due_time,whatsapp_number').eq('id',1).maybeSingle(),
    sb.from('portal_students').select('id,name,code,subjects,study_groups,exam_date,auth_user_id,is_active,created_at').order('created_at',{ascending:false}),
    sb.from('portal_assignments').select('id,student_id,title,subject,topic,instructions,due_at,marks,priority,external_link,status,created_at,batch_id').order('due_at',{ascending:true}),
    sb.from('portal_submissions').select('id,assignment_id,student_id,note,submitted_at,late,status,score,max_score,feedback,reviewed_at').order('submitted_at',{ascending:false}),
    sb.from('portal_messages').select('id,student_id,body,created_at').order('created_at',{ascending:false}).limit(250),
    sb.from('portal_deadline_reminders').select('id,assignment_id,student_id,kind,created_at').order('created_at',{ascending:false}).limit(250),
    state.profile.role==='teacher'
      ? sb.from('portal_parent_links').select('id,student_id,code,display_name,is_active,created_at').order('created_at',{ascending:false})
      : Promise.resolve({data:[],error:null}),
    state.profile.role==='teacher'
      ? sb.from('portal_homework_templates').select('id,title,subject,instructions,external_link,created_at').order('created_at',{ascending:false}).limit(120)
      : Promise.resolve({data:[],error:null})
  ];
  const r=await Promise.all(queries),data=r.map(ok);
  [state.settings,state.students,state.assignments,state.submissions,state.messages,state.reminders,state.parents,state.templates]=[data[0]||{},data[1]||[],data[2]||[],data[3]||[],data[4]||[],data[5]||[],data[6]||[],data[7]||[]];
  if(state.profile.role==='student'){
    state.student=state.students.find(s=>s.auth_user_id===state.user.id);
    if(!state.student||!state.student.is_active) {stopPortalLiveSync();root.innerHTML='<div class="initial" style="flex-direction:column;text-align:center;padding:20px">Your portal account is no longer active. Please contact Dr Mark.<button class="button" data-action="logout">Sign out</button></div>';return;}
  }
  render();
  if(state.profile.role==='student'){announceBrowserReminders();}
  if(withToast)toast('Everything is up to date.');
}

async function portalFunction(slug,body) {
  const {data,error}=await sb.functions.invoke(slug,{body});
  if(error){
    let message=error.message||'Unable to reach DR Mark Portal.';
    try {
      const response=error.context?.clone?.();
      const details=response?await response.json():null;
      if(details?.error)message=details.error;
    }catch{}
    throw Error(message);
  }
  if(!data?.ok)throw Error(data?.error||'The request was not completed.');
  return data;
}
async function loadParentView() {
  try{
    const snapshot=await portalFunction('portal-parent-view',{action:'view'});
    state.parentView=snapshot;
    renderParent();
  }catch(err){
    state.parentView=null;
    root.innerHTML=`<main class="parent-shell parent-unavailable">
      <header class="parent-header"><div class="parent-brand"><img src="assets/k_chromosome.png" alt=""><strong>DR Mark Portal</strong></div></header>
      <div class="parent-panel"><h1>Parent access unavailable</h1>
      <p>${esc(errorText(err))}</p><p>Please contact Dr Mark if you need help.</p>
      <div class="parent-error-buttons"><button type="button" class="button" data-action="refresh">Try again</button>
      <button type="button" class="button ghost" data-action="logout">Sign out</button></div>
      </div></main>`;
  }
}
function renderParent(){
  if(!state.parentView)return;
  const data=state.parentView;
  const tasks=Array.isArray(data.homework)?data.homework:[];
  const completed=tasks.filter(t=>t.marked_sent).length;
  const ordered=[...tasks].sort((a,b)=>Number(a.marked_sent)-Number(b.marked_sent)
    || new Date(a.due_at).getTime()-new Date(b.due_at).getTime());
  const entries=ordered.map(task=>{
    const overdue=!task.marked_sent && new Date(task.due_at).getTime()<Date.now();
    const done=!!task.marked_sent;
    const label=done?'Marked as sent on WhatsApp':overdue?'Deadline passed · Not marked as sent':'Not marked as sent yet';
    const icon=done?'&#10003;':overdue?'!':'&#9711;';
    return `<article class="parent-task">
      <span class="parent-task-icon ${done?'is-done':overdue?'is-overdue':'is-pending'}" aria-hidden="true">${icon}</span>
      <div class="parent-task-text">
        <strong>${esc(task.title)}</strong>
        <span class="parent-task-status ${done?'is-done':overdue?'is-overdue':'is-pending'}">${esc(label)}</span>
        <span class="parent-task-date">Due ${esc(fmt(task.due_at))}</span>
        ${done&&task.marked_at?`<span class="parent-task-date">Marked as sent ${esc(fmt(task.marked_at))}${task.marked_late?' (after the deadline)':''}</span>`:''}
      </div>
    </article>`;
  }).join('');
  root.innerHTML=`<main class="parent-shell">
    <header class="parent-header"><div class="parent-brand"><img src="assets/k_chromosome.png" alt=""><strong>DR Mark Portal</strong></div><button type="button" class="parent-signout" data-action="logout">Sign out</button></header>
    <section class="parent-welcome">
      <span class="parent-eyebrow">PARENT VIEW · READ ONLY</span>
      <h1>Welcome!</h1>
      <p>Here is how ${esc(dr(data.child_name||'your child'))} is doing.</p>
    </section>
    <section class="parent-summary" aria-label="Homework completion">
      <span class="parent-checkmark" aria-hidden="true">&#10003;</span>
      <div class="parent-ratio">${completed} <span>of ${tasks.length}</span></div>
      <p>Homeworks marked as sent</p>
    </section>
    <div class="parent-list-title"><h2>Homework status</h2><button type="button" class="parent-refresh" data-action="refresh">Refresh</button></div>
    <section class="parent-task-list" aria-label="Homework status">
      ${entries||`<div class="parent-empty"><strong>No homework yet.</strong><p>When Dr Mark assigns homework, its status will appear here.</p></div>`}
    </section>
    <footer class="parent-footer">These statuses are based on the student's own checkmark after sending work on WhatsApp, not teacher verification.<p>This page is for viewing only.</p></footer>
  </main>`;
}

async function signIn(form){
  const fd=new FormData(form), identity=text(fd.get('identity')),password=String(fd.get('password')||'');
  const button=form.querySelector('button[type=submit]');button.disabled=true;button.textContent='Signing in...';
  try{
    const email=state.roleChoice==='student'?studentEmail(identity):state.roleChoice==='parent'?parentEmail(identity):identity;
    ok(await sb.auth.signInWithPassword({email,password}));
    await authorize();
  }catch(e){await sb.auth.signOut();showLogin(errorText(e));}
}
async function logout(){stopPortalLiveSync();await sb.auth.signOut();state.user=null;state.profile=null;state.student=null;state.settings={};state.students=[];state.assignments=[];state.submissions=[];state.messages=[];state.reminders=[];state.parents=[];state.templates=[];state.parentView=null;showLogin();toast('Signed out safely.');}
function shell(html){
  const teacher=state.profile.role==='teacher';
  const name=teacher?(state.profile.full_name||'Teacher'):dr(state.student?.name||'Student');
  root.innerHTML=`<div class="shell"><header class="topbar"><div class="brand"><img class="logo" src="assets/k_chromosome.png" alt="Dr Mark logo"><div><strong>DR Mark Portal</strong><span>${teacher?'Teacher workspace':'YOUR PRIVATE STUDY SPACE'}</span></div></div><div class="top-actions"><span class="header-name">${esc(name)}</span><button class="button ghost slim" data-action="logout">Sign out</button></div></header>${html}<footer class="footer"><span>DR Mark Portal &middot; Made for future doctors</span><span>All deadlines use Cairo time</span></footer></div>`;
}
function render(){if(!state.profile){showLogin();return;}if(state.profile.role==='teacher')renderTeacher();else if(state.profile.role==='parent')renderParent();else renderStudent();}
function panelStat(n,label,extra=''){return `<div class="panel"><div class="stat-value">${n}</div><div class="stat-label">${label}</div>${extra?`<div class="tiny-muted">${extra}</div>`:''}</div>`;}
function teacherCard(a){
  const s=matchingSubmission(a.id),st=status(a),name=state.students.find(x=>x.id===a.student_id)?.name||'Student';
  return `<article class="work-card" data-kind="${st}"><div class="split"><div><div class="work-title">${esc(a.title)}</div><div class="work-meta"><span>${esc(name)}</span><span>&middot;</span><span>Due ${esc(fmt(a.due_at))}</span></div></div>${chip(st)}</div>
  ${s?`<div class="submission-detail"><span class="success-dot"></span><span>${esc(dr(name))} marked this as sent ${esc(fmt(s.submitted_at))}${s.late?' (after deadline)':''}.</span></div>${s.note?`<p class="small muted">Student note: ${esc(s.note)}</p>`:''}`:`<p class="list-meta">${esc(timeLeft(a.due_at))}</p>`}
  <div class="button-row"><button class="button slim" data-action="edit-work" data-id="${esc(a.id)}">Edit homework</button>${s?`<button class="button slim ghost" data-action="feedback" data-id="${esc(s.id)}">${s.feedback||s.score!=null?'Edit feedback':'Leave feedback'}</button>`:''}${s?`<button class="button slim ghost reset-checkmark-btn" data-action="reset-submission" data-id="${esc(s.id)}">Reset sent checkmark</button>`:''}<button class="button slim ghost" data-action="archive-work" data-id="${esc(a.id)}">${a.status==='archived'?'Restore':'Archive'}</button><button class="button slim danger" data-action="delete-work" data-id="${esc(a.id)}">Delete permanently</button></div>
  ${s?.feedback?`<p class="small muted">Your feedback: ${esc(s.feedback)}</p>`:''}
  </article>`;
}
function teacherStudentCard(s){
  const work=state.assignments.filter(a=>a.student_id===s.id && a.status!=='archived'),done=work.filter(a=>matchingSubmission(a.id)).length;
  const parentLink=state.parents.find(p=>p.student_id===s.id);
  const assigned=Array.isArray(s.study_groups)?s.study_groups:[];
  return `<article class="panel student-overview"><div class="space-between"><div><div class="student-name">${esc(dr(s.name))}</div><p class="small muted">${esc(s.code)}</p></div>${s.is_active?'<span class="chip good">Active</span>':'<span class="chip neutral">Inactive</span>'}</div>
    <div class="student-group-chips">${assigned.length?assigned.map(id=>`<span class="group-tag">${esc(groupName(id))}</span>`).join(''):'<span class="muted small">No Biology group assigned</span>'}</div>
    <p class="small muted" style="margin-top:14px">${done} of ${work.length} homework tasks submitted</p><div class="progress-track"><span style="width:${work.length?Math.round(done/work.length*100):0}%"></span></div>
    <div class="button-row" style="margin-top:16px"><button class="button slim group-edit-btn" data-action="student-settings" data-id="${esc(s.id)}">Groups &amp; exam date</button><button class="button slim parent-access-btn" data-action="parent-access" data-id="${esc(s.id)}">Parent access${parentLink?(parentLink.is_active?' · On':' · Off'):''}</button><button class="button slim" data-action="reset-pin" data-id="${esc(s.id)}">Reset password</button><button class="button slim ghost" data-action="send-message" data-id="${esc(s.id)}">Message</button><button class="button slim ghost" data-action="toggle-student" data-id="${esc(s.id)}">${s.is_active?'Deactivate':'Reactivate'}</button><button class="button slim danger" data-action="delete-student" data-id="${esc(s.id)}">Delete student</button></div></article>`;
}
function renderTeacher(){
  const active=state.students.filter(s=>s.is_active),works=state.assignments.filter(a=>a.status!=='archived'),done=works.filter(a=>matchingSubmission(a.id)).length,
    overdue=works.filter(a=>status(a)==='overdue').length, waiting=works.length-done,
    filtered=state.assignments.filter(a=>state.filter==='all'?a.status!=='archived':state.filter==='archived'?a.status==='archived':state.filter==='sent'?!!matchingSubmission(a.id):state.filter==='overdue'?status(a)==='overdue':!matchingSubmission(a.id)&&a.status!=='archived');
  const sResults=state.students.filter(s=>(state.groupFilter==='all'||(s.study_groups||[]).includes(state.groupFilter))&&(s.name+' '+s.code).toLowerCase().includes(state.studentSearch.toLowerCase()));
  shell(`<section class="hero teacher-hero"><div class="hero-copy"><div class="eyebrow">TEACHER OVERVIEW</div><h1>Beautifully simple follow-up.</h1><p>Assign in seconds. Trust your students. See exactly who has finished, without managing a pile of PDFs.</p></div><img class="hero-mark" src="assets/k_chromosome.png" alt=""></section>
  <div class="button-row main-actions"><button class="button primary" data-action="new-homework" ${active.length?'':'disabled'}>+ New homework</button><button class="button" data-action="new-student">+ New student</button><button class="button ghost" data-action="templates">Homework templates</button><button class="button ghost" data-action="settings">Settings</button><button class="button ghost" data-action="refresh">Refresh</button></div>
  <section class="panels" aria-label="Overview">${panelStat(active.length,'Active students')}${panelStat(waiting,'Awaiting submission')}${panelStat(done,'Marked as sent')}${panelStat(overdue,'Overdue')}</section>
  <section><div class="section-title"><h2>Homework</h2><span class="muted small">${works.length} assigned tasks</span></div><div class="filters">${[['all','All'],['waiting','Waiting'],['sent','Sent'],['overdue','Overdue'],['archived','Archived']].map(([id,label])=>`<button class="filter ${state.filter===id?'on':''}" data-action="filter" data-filter="${id}">${label}</button>`).join('')}</div>
  <div class="items">${filtered.length?filtered.map(teacherCard).join(''):`<div class="empty"><strong>${state.assignments.length?'Nothing in this category.':'Your next homework starts here.'}</strong><p>Only a title and a deadline are needed. We take care of the rest.</p>${!state.assignments.length?`<button class="button primary" data-action="new-homework" ${active.length?'':'disabled'} style="margin-top:15px">Add first homework</button>`:''}</div>`}</div></section>
  <section><div class="section-title"><h2>Your students</h2><button class="button slim ghost" data-action="new-student">Add student</button></div>
  <div class="group-filter-row" aria-label="Filter students by Biology group">
     <button class="group-filter ${state.groupFilter==='all'?'active':''}" data-action="group-filter" data-group="all">All (${state.students.length})</button>
     ${STUDY_GROUPS.map(g=>`<button class="group-filter ${state.groupFilter===g.id?'active':''}" data-action="group-filter" data-group="${g.id}">${esc(g.label)} (${state.students.filter(s=>(s.study_groups||[]).includes(g.id)).length})</button>`).join('')}
  </div>
  ${state.students.length>5?`<label class="field" style="margin-bottom:15px"><span class="sr-only">Search students</span><input id="student-search" placeholder="Search by name or student code" value="${esc(state.studentSearch)}" autocomplete="off"></label>`:''}
  <div id="student-results">${sResults.length?`<div class="grid2">${sResults.map(teacherStudentCard).join('')}</div>`:`<div class="empty"><strong>${state.students.length?'No matching students yet.':'A personal space for every future doctor.'}</strong><p>Add your first student. Their login code and password will be generated for you.</p></div>`}</div></section>
  <div class="notice footer-note"><strong>WhatsApp-first by design.</strong> PDFs stay in WhatsApp. Only homework details, student checkmarks, notes and timestamps are saved here.</div>`);
}
function studentCard(a){
  const s=matchingSubmission(a.id),st=status(a),remainingMin=remaining(a.due_at),safe=safeUrl(a.external_link),name=state.student?.name||'Student';
  const number=String(state.settings.whatsapp_number||'').replace(/\D/g,'');
  const shareText=`DR Mark homework: ${a.title}\nStudent: ${dr(name)}\nI am sending my answers as a PDF.`;
  const waUrl=number?`https://wa.me/${number}?text=${encodeURIComponent(shareText)}`:`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
  return `<article class="work-card student-task"><div class="split"><div><div class="work-title">${esc(a.title)}</div><div class="work-meta">${a.subject?`<span>${esc(a.subject)}</span><span>&middot;</span>`:''}<span>Due ${esc(fmt(a.due_at))}</span></div></div>${chip(st)}</div>
   ${a.instructions?`<p class="task-instruction">${esc(a.instructions)}</p>`:''}${safe?`<p class="small"><a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">Open teacher's link &nearr;</a></p>`:''}
   ${s?`<div class="sent-state"><span class="sent-symbol">&#10003;</span><div><strong>Another promise kept, ${esc(dr(name))}.</strong><p class="small muted">Marked as sent ${esc(fmt(s.submitted_at))}${s.late?' &middot; after the deadline':''}</p>${s.note?`<p class="small note-saved">Your note: ${esc(s.note)}</p>`:''}${s.feedback?`<p class="small note-saved">Dr Mark: ${esc(s.feedback)}</p>`:''}${s.score!==null&&s.score!==undefined?`<p class="small note-saved">Score: ${esc(s.score)} / ${esc(s.max_score??a.marks)}</p>`:''}</div></div>`:
   `<div class="task-steps"><span class="small muted">${remainingMin>0?`<strong data-due="${esc(a.due_at)}">${esc(timeLeft(a.due_at))}</strong> &middot; `:''}Send your PDF on WhatsApp, then tick below.</span>
   <a class="button whatsapp-link" href="${esc(waUrl)}" target="_blank" rel="noopener noreferrer">Open WhatsApp &nearr;</a></div>
   <div class="quote-card"><span class="quote-mark">&ldquo;</span>There is always an excuse to submit late. And there is always a way to submit on time.<span class="quote-mark">&rdquo;</span></div>
   <label class="field optional-note">Optional note<textarea id="note-${esc(a.id)}" rows="2" maxlength="1500" placeholder="Anything you want Dr Mark to know? (optional)"></textarea></label>
   <label class="submit-check"><input type="checkbox" data-action="submit-work" data-id="${esc(a.id)}"><span>I've sent my work on WhatsApp</span></label>`}
  </article>`;
}

function examCountdown(){
  if(!state.student?.exam_date||!state.user)return '';
  const days=daysUntilExam(state.student.exam_date);
  if(days===null || days<0)return '';
  const key='drmark-exam-countdown-hidden:'+state.user.id+':'+state.student.exam_date;
  let hidden=false;
  try{hidden=localStorage.getItem(key)==='yes';}catch{}
  if(hidden)return `<div class="exam-countdown-reveal"><button class="button ghost slim" data-action="exam-countdown-show">Show my exam countdown</button></div>`;
  const date=new Date(state.student.exam_date+'T12:00:00Z');
  const when=new Intl.DateTimeFormat('en-GB',{timeZone:CFG.teacherTimeZone,day:'numeric',month:'long',year:'numeric'}).format(date);
  const line=days===0?'Your exam is today':days===1?'1 day until your exam':days+' days until your exam';
  return `<section class="exam-countdown" aria-label="Exam countdown">
    <div class="exam-countdown-main">
      <div class="exam-countdown-label">YOUR EXAM COUNTDOWN</div>
      <div class="exam-countdown-count">${days===0?'Today':esc(String(days))}</div>
      <div class="exam-countdown-line">${esc(line)}</div>
      <div class="exam-countdown-date">${esc(when)} · One small step at a time.</div>
    </div>
    <button class="exam-countdown-hide" data-action="exam-countdown-hide" aria-label="Hide exam countdown">Hide</button>
  </section>`;
}
function toggleExamCountdown(hide){
  if(!state.student?.exam_date||!state.user)return;
  const key='drmark-exam-countdown-hidden:'+state.user.id+':'+state.student.exam_date;
  try{
    if(hide)localStorage.setItem(key,'yes');
    else localStorage.removeItem(key);
  }catch{}
  renderStudent();
}

function renderStudent(){
  const name=state.student.name,[hi,sub]=greeting(name);
  const active=state.assignments.filter(a=>a.status!=='archived'),pending=active.filter(a=>!matchingSubmission(a.id)),sent=active.filter(a=>!!matchingSubmission(a.id)),overdue=pending.filter(a=>status(a)==='overdue').length;
  const urgency=pending.filter(a=>remaining(a.due_at)>0&&remaining(a.due_at)<=120);
  const reminders=state.reminders.filter(n=>!state.submissions.some(s=>s.assignment_id===n.assignment_id)).slice(0,10);
  shell(`<section class="hero student-hero"><div class="hero-copy"><div class="eyebrow">YOUR PRIVATE STUDY SPACE</div><h1>${esc(hi)}</h1><p>${esc(sub)}</p><p class="micro-motto">ONE STEP CLOSER TO YOUR WHITE COAT</p></div><img class="hero-mark" src="assets/k_chromosome.png" alt=""></section>
    ${examCountdown()}
    ${urgency.length?`<div class="notice deadline-strip"><strong>Gentle reminder, ${esc(dr(name))}.</strong> ${esc(urgency[0].title)} is due in ${esc(timeLeft(urgency[0].due_at))}.</div>`:''}
    <section class="panels">${panelStat(pending.length,'Still to do')}${panelStat(sent.length,'Promises kept')}${panelStat(overdue,'Past deadline')}</section>
    <section><div class="section-title"><h2>Your homework</h2><button class="button ghost slim" data-action="refresh">Refresh</button></div><div class="items">${pending.length?pending.map(studentCard).join(''):`<div class="empty celebration"><div class="empty-symbol">&#10022;</div><strong>All done, ${esc(dr(name))}.</strong><p>Nothing left to submit. Take a moment to be proud of yourself.</p></div>`}</div></section>
    ${sent.length?`<section><div class="section-title"><h2>Sent on WhatsApp</h2><span class="muted small">Every effort counts</span></div><div class="items">${sent.map(studentCard).join('')}</div></section>`:''}
    <section><div class="section-title"><h2>Messages & reminders</h2></div><div class="items">${reminders.map(r=>{const a=state.assignments.find(x=>x.id===r.assignment_id);return a?`<div class="panel soft mini-message"><span class="chip warn">Reminder</span><div><strong>${esc(a.title)}</strong><p class="muted small">${r.kind==='2h'?'About 2 hours to go':'About a day to go'} &middot; Due ${esc(fmt(a.due_at))}</p></div></div>`:''}).join('')}${state.messages.slice(0,15).map(m=>`<div class="panel soft mini-message"><span class="chip neutral">From Dr Mark</span><div><p>${esc(m.body)}</p><p class="muted small">${esc(fmt(m.created_at))}</p></div></div>`).join('')}${!reminders.length&&!state.messages.length?`<div class="empty"><strong>Nothing new right now.</strong><p>When it's important, you'll see it here.</p></div>`:''}</div>
    <div class="panel soft browser-notify"><div><h3>A gentle nudge</h3><p class="muted small">Enable browser alerts for deadline reminders while this website is open. Reminders are also saved here even if you close it.</p></div><button class="button slim" data-action="enable-alerts">Enable alerts</button></div></section>`);
  refreshCountdowns();
}
function refreshCountdowns(){document.querySelectorAll('[data-due]').forEach(el=>el.textContent=timeLeft(el.getAttribute('data-due')));}
function modal(title,html,footer=''){
  modalRoot.innerHTML=`<section class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="dialog-head"><h2>${esc(title)}</h2><button class="icon-button" type="button" data-action="close-modal" aria-label="Close">&times;</button></div>${html}${footer||''}</section>`;
  modalRoot.hidden=false;
  setTimeout(()=>modalRoot.querySelector('input,textarea,select,button')?.focus(),20);
}
function closeModal(){modalRoot.hidden=true;modalRoot.innerHTML='';}
function footer(label){return `<div class="dialog-footer"><button class="button ghost" type="button" data-action="close-modal">Cancel</button><button class="button primary" type="submit">${esc(label)}</button></div>`;}

function dangerFooter(label) {
  return `<div class="dialog-footer"><button class="button ghost" type="button" data-action="close-modal">Cancel</button><button class="button danger destructive" type="submit">${esc(label)}</button></div>`;
}
function deleteHomeworkModal(id) {
  const a=state.assignments.find(x=>x.id===id);if(!a)return;
  const student=state.students.find(s=>s.id===a.student_id);
  const hasSubmission=!!matchingSubmission(a.id);
  const batch=a.batch_id?state.assignments.filter(w=>w.batch_id===a.batch_id):[a];
  modal('Delete homework permanently',`<form id="delete-homework-form" data-id="${esc(a.id)}" class="form-stack">
    <div class="destructive-warning"><strong>${esc(a.title)}</strong><p>Assigned to ${esc(student?.name||'this student')}. This permanently erases ${hasSubmission?'the sent checkmark and feedback, ':''}deadline reminders and related portal records. It cannot be undone.</p></div>
    ${batch.length>1?`<label class="checkline"><input name="delete_all" type="checkbox"> Delete this same homework for all ${batch.length} assigned students (instead of only ${esc(student?.name||'this student')})</label>`:''}
    <label class="checkline"><input name="understood" type="checkbox" required> I understand this cannot be undone.</label>
    ${dangerFooter('Delete homework permanently')}</form>`);
}
function deleteStudentModal(id) {
  const s=state.students.find(x=>x.id===id);if(!s)return;
  const assigned=state.assignments.filter(a=>a.student_id===s.id).length;
  modal('Delete student permanently',`<form id="delete-student-form" data-id="${esc(s.id)}" class="form-stack">
    <div class="destructive-warning"><strong>${esc(dr(s.name))}</strong><p>This permanently removes this student from DR Mark Portal, their ${assigned} homework assignments, checkmarks, messages, feedback and any linked Portal files. Portal access and linked parent access are removed. If their login is also used by the separate MCQ licensing system, that MCQ account will be kept.</p><p>This action cannot be undone.</p></div>
    <label class="field">Type the student's full name to confirm: <strong>${esc(s.name)}</strong><input name="confirm_name" autocomplete="off" spellcheck="false" placeholder="Enter full name exactly" required></label>
    ${dangerFooter('Delete student permanently')}</form>`);
}


function selectedHomeworkStudents(form) {
  const fd=new FormData(form);
  const selected=new Set(fd.getAll('student_ids').map(String));
  const groups=validateGroups(fd.getAll('recipient_groups').map(String));
  const active=state.students.filter(student=>student.is_active);
  if(fd.get('all_students')==='on')active.forEach(student=>selected.add(student.id));
  for(const student of active){
    if(groups.some(group=>(student.study_groups||[]).includes(group)))selected.add(student.id);
  }
  return active.filter(student=>selected.has(student.id)).map(student=>student.id);
}
function updateRecipientCount(){
  const form=modalRoot.querySelector('#homework-form');
  const label=modalRoot.querySelector('#recipient-count');
  if(!form||!label)return;
  const count=selectedHomeworkStudents(form).length;
  label.textContent=count===0?'Choose at least one student or Biology group.':
    count+' student'+(count===1?'':'s')+' will receive this homework.';
  label.classList.toggle('missing',count===0);
}
function fillHomeworkFromTemplate(templateId){
  const template=state.templates.find(t=>t.id===templateId);
  const form=modalRoot.querySelector('#homework-form');
  if(!template||!form)return;
  for(const [name,value] of Object.entries({
    title:template.title,subject:template.subject||'',
    instructions:template.instructions||'',external_link:template.external_link||''
  })){
    const input=form.elements.namedItem(name);
    if(input)input.value=value;
  }
  const extra=form.querySelector('#homework-extra-details');
  if(extra)extra.open=true;
}
function homeworkTemplatesModal(){
  if(state.profile?.role!=='teacher')return;
  const entries=state.templates.map(t=>`<div class="template-list-item">
    <div><strong>${esc(t.title)}</strong><p class="small muted">${esc(t.subject||'Biology homework')}${t.instructions?' · Saved instructions':''}</p></div>
    <div class="template-buttons"><button class="button slim" type="button" data-action="use-template" data-id="${esc(t.id)}">Use</button>
      <button class="button slim ghost" type="button" data-action="delete-template" data-id="${esc(t.id)}">Delete</button></div>
    </div>`).join('');
  modal('Reusable homework templates',`<p class="helper">Templates are completely optional. You can always write a brand-new homework title and details.</p>
    <div class="template-list">${entries||'<div class="empty"><strong>No templates saved yet.</strong><p>When you assign homework, tick “Save as a template” to reuse its title and details next time.</p></div>'}</div>
    <div class="dialog-footer"><button type="button" class="button ghost" data-action="close-modal">Close</button>
      <button type="button" class="button primary" data-action="new-homework">Write new homework</button></div>`);
}
async function deleteHomeworkTemplate(id){
  await requireMatchingPortalSession('teacher');
  const template=state.templates.find(t=>t.id===id);
  if(!template)throw Error('Template not found. Refresh the page.');
  if(!window.confirm('Delete the saved template “'+template.title+'”? This will NOT delete homework already assigned.'))return;
  const {data,error}=await sb.from('portal_homework_templates').delete().eq('id',id).select('id');
  if(error)throw error;
  if(!data?.length)throw Error('Template could not be deleted.');
  await reload();homeworkTemplatesModal();toast('Template removed. Existing homework was not changed.');
}
function homeworkModal(a=null,templateId=''){
  const day=a?(()=>{const p=zoneParts(new Date(a.due_at));return `${p.year}-${p.month}-${p.day}`;})():futureDate();
  const time=a?(()=>{const p=zoneParts(new Date(a.due_at));return `${p.hour}:${p.minute}`;})():(state.settings.default_due_time||CFG.defaultDueTime).slice(0,5);
  const students=state.students.filter(student=>student.is_active);
  if(!a && !students.length){toast('Add an active student first.',true);return;}
  const template=!a?state.templates.find(t=>t.id===templateId):null;
  const target=a||template||{};
  const individual=students.map(student=>`<label class="checkline"><input type="checkbox" name="student_ids" value="${esc(student.id)}"> ${esc(dr(student.name))}</label>`).join('');
  const groupRecipients=STUDY_GROUPS.map(group=>{
    const count=students.filter(student=>(student.study_groups||[]).includes(group.id)).length;
    return `<label class="checkline"><input type="checkbox" name="recipient_groups" value="${group.id}"> ${esc(group.label)} <span class="muted small">(${count})</span></label>`;
  }).join('');
  const templates=state.templates.map(t=>`<option value="${esc(t.id)}" ${template?.id===t.id?'selected':''}>${esc(t.title)}</option>`).join('');
  modal(a?'Edit homework':'Assign homework',`<form id="homework-form" data-id="${a?esc(a.id):''}" class="form-stack">
    ${!a&&state.templates.length?`<label class="field">Use a saved template <small>Optional</small><select id="homework-template-choice" name="template_id">
      <option value="">Write my own homework</option>${templates}</select></label>`:''}
    <label class="field">Homework title <span class="required">*</span>
      <input name="title" maxlength="180" placeholder="e.g. Biology Paper 2" value="${esc(target.title||'')}" required></label>
    <div class="fields-two"><label class="field">Deadline <span class="required">*</span>
       <input type="date" name="date" value="${day}" required></label>
       <label class="field">Time (Cairo)<input type="time" name="time" value="${time}" required></label></div>
    ${!a?`<details class="advanced homework-recipients" open><summary>Who should receive this homework?</summary>
      <p class="helper">Choose one or more Biology groups, individual students, or everyone. Students in multiple selected groups are assigned only once.</p>
      <label class="checkline all-recipient"><input type="checkbox" name="all_students" id="all-students"> All active students</label>
      <div class="group-choice-list recipient-groups">${groupRecipients}</div>
      <details class="advanced individual-recipient"><summary>Select individual students</summary>
        <div class="selection-list">${individual}</div></details>
      <p class="recipient-count" id="recipient-count">Choose at least one student or Biology group.</p>
    </details>`:''}
    <details id="homework-extra-details" class="advanced" ${(a||template)?'open':''}><summary>Extra details (optional)</summary>
      <div class="form-stack">
      <label class="field">Subject <small>Optional</small><input name="subject" maxlength="90" placeholder="e.g. AS Biology" value="${esc(target.subject||'')}"></label>
      <label class="field">Instructions <small>Optional</small><textarea name="instructions" maxlength="4000" rows="3" placeholder="Optional instructions">${esc(target.instructions||'')}</textarea></label>
      <label class="field">Link to a reference or past paper <small>Optional</small><input name="external_link" type="url" placeholder="https://" value="${esc(target.external_link||'')}"></label>
      </div></details>
    ${!a?`<label class="checkline template-optin"><input type="checkbox" name="save_template">
      Save this title and its optional details as a reusable template</label>`:''}
    <p class="fineprint">Only the homework title, deadline, and recipients are needed. PDFs are sent through WhatsApp.</p>
    ${footer(a?'Save changes':'Assign homework')}</form>`);
  updateRecipientCount();
}
function studentModal(){
  modal('Add future doctor',`<form class="form-stack" id="student-form">
  <label class="field">Student's full name <span class="required">*</span><input name="name" placeholder="e.g. Malak Ahmed" maxlength="140" required></label>
  <p class="helper">A unique student code and a strong password will be generated automatically.</p>
  <details class="advanced"><summary>More details (optional)</summary><div class="form-stack">
  <div class="field"><span class="group-label">Biology group(s) <small>Optional; you can change them later.</small></span><div class="group-choice-list">${groupCheckboxes()}</div></div>
  <label class="field">Subjects (optional)<input name="subjects" placeholder="Biology"></label>
  <label class="field">Exam date (optional)<input type="date" name="exam_date"></label>
  <label class="field">Student phone<input name="phone" type="tel" placeholder="Optional"></label>
  <label class="field">Parent phone<input name="parent_phone" type="tel" placeholder="Optional"></label>
  </div></details>${footer('Create student')}</form>`);
}

function studentSettingsModal(studentId){
  const student=state.students.find(s=>s.id===studentId);
  if(!student)return;
  modal('Biology groups & exam date',`<form id="student-settings-form" data-id="${esc(student.id)}" class="form-stack">
    <p class="helper">Choose the groups that ${esc(dr(student.name))} belongs to. A student can belong to more than one. These choices are used only to select homework recipients.</p>
    <div class="group-choice-list">${groupCheckboxes(student.study_groups||[])}</div>
    <label class="field">Exam date (optional)
      <input type="date" name="exam_date" value="${esc(student.exam_date||'')}"></label>
    <p class="helper">Leave the date empty to hide the countdown from this student's dashboard. The countdown is gentle and can also be hidden by the student.</p>
    ${footer('Save student settings')}</form>`);
}
async function saveStudentSettings(form){
  await requireMatchingPortalSession('teacher');
  const id=text(form.getAttribute('data-id')),student=state.students.find(x=>x.id===id);
  if(!student)throw Error('Student not found. Refresh the dashboard.');
  const fd=new FormData(form);
  const study_groups=validateGroups(fd.getAll('study_groups').map(String));
  const rawDate=text(fd.get('exam_date'));
  if(rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate))throw Error('Enter a valid exam date.');
  const {data,error}=await sb.from('portal_students')
    .update({study_groups,exam_date:rawDate||null}).eq('id',id).select('id');
  if(error)throw error;
  if(!data?.length)throw Error('Student settings were not saved. Please sign in as the teacher.');
  closeModal();await reload();toast('Biology groups and exam date saved.');
}

function credentialsModal(code,pin,name){
  modal('Student access created',`<div class="notice good"><strong>${esc(name)}'s private account is ready.</strong><p>Copy these details now. The password is not saved in the portal dashboard.</p></div>
  <div class="cred"><small>STUDENT CODE</small><code>${esc(code)}</code></div><div class="cred" style="margin-top:10px"><small>TEMPORARY PASSWORD</small><code>${esc(pin)}</code></div>
  <div class="dialog-footer"><button class="button primary" data-action="copy-credentials" data-code="${esc(code)}" data-pin="${esc(pin)}">Copy login details</button><button class="button ghost" data-action="close-modal">Done</button></div>`);
}

function parentCredentialsModal(details){
  modal('Parent login ready',`<div class="notice good"><strong>Parent access for ${esc(dr(details.student_name))} is ready.</strong>
    <p>Share these login details privately with the parent. The password will not be shown again after closing this window.</p></div>
    <div class="cred"><small>PARENT CODE</small><code>${esc(details.code)}</code></div>
    <div class="cred" style="margin-top:10px"><small>PASSWORD</small><code>${esc(details.password)}</code></div>
    <p class="helper" style="margin-top:14px">The parent should choose <strong>Parent</strong> on the DR Mark login page.</p>
    <div class="dialog-footer">
      <button type="button" class="button primary" data-action="copy-parent-login" data-code="${esc(details.code)}" data-password="${esc(details.password)}" data-student="${esc(details.student_name)}">Copy login details</button>
      <button type="button" class="button ghost" data-action="close-modal">Done</button>
    </div>`);
}
function parentAccessModal(studentId){
  const student=state.students.find(s=>s.id===studentId);
  if(!student)return;
  const parent=state.parents.find(p=>p.student_id===studentId);
  const explanation='<p class="helper">Only you can give parent access. The parent can view homework status for this student only, and cannot make changes.</p>';
  if(!parent){
    modal('Parent access · '+dr(student.name),`${explanation}
      <form id="parent-create-form" data-id="${esc(student.id)}" class="form-stack">
        <label class="field">Parent name <small>Optional</small>
          <input name="display_name" maxlength="90" placeholder="Parent" autocomplete="off"></label>
        <p class="helper">We will generate a private login code and password for you to share on WhatsApp.</p>
        <div class="dialog-footer"><button type="button" class="button ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="button primary">Create parent account</button></div>
      </form>`);
    return;
  }
  modal('Parent access · '+dr(student.name),`${explanation}
    <div class="parent-manage-status">
      <div><strong>${esc(parent.display_name)}</strong><div class="small muted">Code: ${esc(parent.code)}</div></div>
      <span class="chip ${parent.is_active?'good':'neutral'}">${parent.is_active?'Access on':'Access off'}</span>
    </div>
    <div class="parent-manage-buttons">
      <button type="button" class="button ${parent.is_active?'ghost':'primary'}" data-action="parent-toggle" data-id="${esc(student.id)}">${parent.is_active?'Turn off parent access':'Turn on parent access'}</button>
      <button type="button" class="button" data-action="parent-reset" data-id="${esc(student.id)}">Reset parent password</button>
      <button type="button" class="button danger" data-action="parent-delete" data-id="${esc(student.id)}">Delete parent account</button>
    </div>
    <p class="fineprint">Turning access off blocks new reads immediately. You can turn it on again later. Deleting the parent account is permanent.</p>
    <div class="dialog-footer"><button type="button" class="button ghost" data-action="close-modal">Done</button></div>`);
}
async function parentCreate(form){
  await requireMatchingPortalSession('teacher');
  const studentId=text(form.getAttribute('data-id'));
  const display_name=text(new FormData(form).get('display_name'))||'Parent';
  const details=await portalFunction('portal-parent-admin',{action:'create_parent',student_id:studentId,display_name});
  await reload();parentCredentialsModal(details);
}
async function parentToggle(studentId){
  await requireMatchingPortalSession('teacher');
  const parent=state.parents.find(p=>p.student_id===studentId);
  if(!parent)throw Error('Parent account not found. Refresh the dashboard.');
  const currentlyOn=parent.is_active;
  if(!window.confirm('Are you sure you want to '+(currentlyOn?'turn off':'turn on')+' parent access?'))return;
  await portalFunction('portal-parent-admin',{action:'set_parent_active',student_id:studentId,is_active:!currentlyOn});
  await reload();parentAccessModal(studentId);
  toast(currentlyOn?'Parent access switched off.':'Parent access switched on.');
}
async function parentReset(studentId){
  await requireMatchingPortalSession('teacher');
  if(!window.confirm('Generate a new parent password? The previous password will stop working for future logins.'))return;
  const details=await portalFunction('portal-parent-admin',{action:'reset_parent',student_id:studentId});
  parentCredentialsModal(details);
}
async function parentDelete(studentId){
  await requireMatchingPortalSession('teacher');
  const student=state.students.find(s=>s.id===studentId);
  if(!window.confirm('Permanently delete the parent account for '+(student?.name||'this student')+'? The parent will lose all portal access.'))return;
  await portalFunction('portal-parent-admin',{action:'delete_parent',student_id:studentId});
  closeModal();await reload();
  toast('Parent account removed from the portal.');
}

function settingsModal(){
  modal('Portal settings',`<form id="settings-form" class="form-stack">
  <label class="field">Your WhatsApp number <small>Optional, international format, e.g. 201234567890</small><input name="whatsapp" inputmode="tel" value="${esc(state.settings.whatsapp_number||'')}" placeholder="Country code + phone"></label>
  <label class="field">Default homework time<input type="time" name="default_time" value="${esc((state.settings.default_due_time||CFG.defaultDueTime).slice(0,5))}"></label>
  <p class="helper">If no WhatsApp number is entered, students can still share a prepared message and choose your chat manually. Neither choice uploads PDFs to this website.</p>
  ${footer('Save settings')}</form>`);
}
function feedbackModal(s){
  modal('Feedback (optional)',`<form id="feedback-form" data-id="${esc(s.id)}" class="form-stack">
  <label class="field">A few words for your student<textarea name="feedback" maxlength="3000" rows="3" placeholder="Something to encourage them, or a tip for next time...">${esc(s.feedback||'')}</textarea></label>
  <div class="fields-two"><label class="field">Mark (optional)<input type="number" name="score" min="0" step="0.5" value="${s.score??''}"></label><label class="field">Out of (optional)<input type="number" name="max_score" min="0.5" step="0.5" value="${s.max_score??''}"></label></div>
  ${footer('Save feedback')}</form>`);
}
function messageModal(studentId){
  const s=state.students.find(x=>x.id===studentId);
  if(!s)return;
  modal(`A note for ${dr(s.name)}`,`<form id="message-form" data-id="${esc(studentId)}" class="form-stack"><label class="field">Your message<textarea name="body" rows="4" maxlength="1500" required placeholder="A small reminder or a word of encouragement..."></textarea></label>${footer('Send message')}</form>`);
}
function resetPinModal(studentId){
  const s=state.students.find(x=>x.id===studentId);if(!s)return;
  const pin=generateString(12);
  modal('Reset student password',`<form id="reset-form" data-id="${esc(studentId)}" class="form-stack"><p class="helper">A new strong password has been generated for ${esc(dr(s.name))}. Resetting will invalidate the previous password for future logins.</p>
  <label class="field">New password<input name="pin" value="${esc(pin)}" minlength="6" maxlength="100" required></label>${footer('Reset password')}</form>`);
}
async function newStudent(form){
  const fd=new FormData(form), name=text(fd.get('name'));
  if(!name)throw Error('A student name is required.');
  const code='DM-'+generateString(7).toUpperCase(),pin=generateString(13);
  const {data,error}=await sb.functions.invoke('portal-student-admin',{body:{action:'create',name,code,pin,subjects:text(fd.get('subjects')).split(',').map(s=>s.trim()).filter(Boolean),study_groups:validateGroups(fd.getAll('study_groups').map(String)),exam_date:text(fd.get('exam_date'))||null,phone:text(fd.get('phone'))||null,parent_phone:text(fd.get('parent_phone'))||null}});
  if(error||!data?.ok)throw Error(data?.error||error?.message||'Could not create this account.');
  await reload();credentialsModal(code,pin,name);
}
// A tab that was opened as teacher must never send a write with a student's JWT.
// RLS remains the final authorization boundary; this provides a helpful error.
async function requireMatchingPortalSession(expectedRole) {
  if (!state.user || state.profile?.role !== expectedRole) {
    throw Error('Please sign in with the correct portal account and try again.');
  }
  const {data,error} = await sb.auth.getUser();
  if (error || !data?.user || data.user.id !== state.user.id) {
    closeModal();
    await sb.auth.signOut();
    state.user=null;state.profile=null;state.student=null;
    showLogin('Your signed-in account changed. Please sign in again to continue.');
    throw Error('The signed-in account changed. Please log in again before saving.');
  }
}

async function createOrEditHomework(form){
  await requireMatchingPortalSession('teacher');
  const fd=new FormData(form), id=text(form.getAttribute('data-id')),
    title=text(fd.get('title')),due_at=localISO(text(fd.get('date')),text(fd.get('time'))),
    link=text(fd.get('external_link'));
  if(!title)throw Error('The homework title is required.');
  if(link&&!safeUrl(link))throw Error('The link needs to start with https:// or http://');
  const base={
    title,due_at,
    subject:text(fd.get('subject'))||null,
    instructions:text(fd.get('instructions')),
    external_link:link||null
  };
  if(id){
    const {data,error}=await sb.from('portal_assignments').update(base).eq('id',id).select('id');
    if(error)throw error;
    if(!data?.length)throw Error('Homework was not updated. Please refresh and try again.');
    closeModal();await reload();toast('Homework updated.');
    return;
  }
  const ids=selectedHomeworkStudents(form);
  if(!ids.length)throw Error('Choose at least one student or Biology group.');
  const batch_id=crypto.randomUUID();
  const rows=ids.map(student_id=>({...base,student_id,batch_id,status:'open',priority:'Normal',marks:10}));
  ok(await sb.from('portal_assignments').insert(rows));
  let templateError='';
  if(fd.get('save_template')==='on'){
    const {error}=await sb.from('portal_homework_templates').insert({
      title,subject:base.subject,instructions:base.instructions,external_link:base.external_link
    });
    if(error)templateError=error.message;
  }
  closeModal();await reload();
  toast(templateError?
    'Homework assigned to '+ids.length+' student(s), but the optional template could not be saved.':
    'Homework assigned to '+ids.length+' student(s).'+(fd.get('save_template')==='on'?' Template saved for next time.':''));
  if(templateError)console.warn('Optional template save failed:',templateError);
}

async function resetSentCheckmark(id){
  await requireMatchingPortalSession('teacher');
  const submission=state.submissions.find(s=>s.id===id);
  if(!submission)throw Error('This checkmark was already removed. Refresh the dashboard.');
  const assignment=state.assignments.find(a=>a.id===submission.assignment_id);
  const student=state.students.find(s=>s.id===submission.student_id);
  if(!window.confirm('Reset the “marked as sent” checkmark for '+(student?.name||'this student')+
    ' · '+(assignment?.title||'homework')+'? This removes the student’s checkmark, optional note, marks and feedback. The student can mark this homework as sent again.'))return;
  const related=state.submissions.filter(s=>s.assignment_id===submission.assignment_id);
  const relatedIds=related.map(s=>s.id);
  const {data:attachments,error:filesError}=await sb.from('portal_submission_files')
    .select('id').in('submission_id',relatedIds).limit(1);
  if(filesError)throw filesError;
  if(attachments?.length)throw Error('One attempt contains a saved file. It cannot be reset through the quick checkmark control; handle the file separately first.');
  const {data,error}=await sb.from('portal_submissions')
    .delete().eq('assignment_id',submission.assignment_id).select('id');
  if(error)throw error;
  if(!data?.length)throw Error('Checkmark was not reset. Refresh and check teacher access.');
  await reload();toast('Sent checkmark reset. The homework is pending again.');
}

async function studentSubmit(checkbox){
  const id=checkbox.getAttribute('data-id'),a=state.assignments.find(x=>x.id===id);
  if(!a||matchingSubmission(id)){checkbox.checked=true;return;}
  checkbox.disabled=true;
  const note=text($('note-'+id)?.value).slice(0,1500);
  try{
    await requireMatchingPortalSession('student');
    ok(await sb.from('portal_submissions').insert({assignment_id:id,student_id:state.student.id,attempt_no:1,note:note||null,status:'submitted'}));
    await reload();toast('Another promise kept, '+dr(state.student.name)+'.');
  }catch(e){checkbox.disabled=false;checkbox.checked=false;toast(errorText(e),true);}
}
async function saveFeedback(form){
  const fd=new FormData(form),id=form.getAttribute('data-id'),feedback=text(fd.get('feedback')),
        scoreVal=text(fd.get('score')),maxVal=text(fd.get('max_score')),
        score=scoreVal===''?null:Number(scoreVal),max_score=maxVal===''?null:Number(maxVal);
  if((score!==null&&max_score===null)||(score!==null&&(!Number.isFinite(score)||score<0))||(max_score!==null&&(!Number.isFinite(max_score)||max_score<=0))||(score!==null&&score>max_score))throw Error('Use a valid mark and maximum, or leave both empty.');
  ok(await sb.from('portal_submissions').update({feedback:feedback||null,score,max_score,status:'reviewed',reviewed_at:new Date().toISOString()}).eq('id',id));
  closeModal();await reload();toast('Feedback saved.');
}
async function saveSettings(form){
  const fd=new FormData(form),number=text(fd.get('whatsapp')).replace(/\D/g,''),default_time=text(fd.get('default_time'))||'17:00';
  if(number&&(number.length<8||number.length>15))throw Error('Use a WhatsApp number including country code, without spaces.');
  ok(await sb.from('portal_settings').update({whatsapp_number:number||null,default_due_time:default_time}).eq('id',1));
  closeModal();await reload();toast('Settings saved.');
}
async function sendMessage(form){
  const student_id=form.getAttribute('data-id'),body=text(new FormData(form).get('body'));
  if(!body)throw Error('Write a message first.');
  ok(await sb.from('portal_messages').insert({student_id,body}));
  closeModal();toast('Message sent to the student portal.');
}
async function resetPin(form){
  const id=form.getAttribute('data-id'),pin=text(new FormData(form).get('pin'));
  const {data,error}=await sb.functions.invoke('portal-student-admin',{body:{action:'reset_pin',student_id:id,pin}});
  if(error||!data?.ok)throw Error(data?.error||error?.message||'Could not reset password.');
  const s=state.students.find(x=>x.id===id);
  credentialsModal(s?.code||'',pin,s?.name||'Student');toast('Password reset. Copy the new password.');
}

async function deleteHomeworkPermanently(form) {
  await requireMatchingPortalSession('teacher');
  const id=text(form.getAttribute('data-id'));
  if (!form.querySelector('input[name="understood"]')?.checked) throw Error('Please acknowledge that this deletion is permanent.');
  const a=state.assignments.find(x=>x.id===id);
  if(!a)throw Error('Homework not found. Refresh the dashboard.');
  const deleteAll=!!a.batch_id&&!!form.querySelector('input[name="delete_all"]')?.checked;
  const {data,error}=await sb.from('portal_assignments').delete()
    .eq(deleteAll?'batch_id':'id',deleteAll?a.batch_id:id).select('id');
  if(error)throw error;
  if(!data?.length)throw Error('Homework was not deleted. Refresh the dashboard and check your login.');
  closeModal();await reload();toast(deleteAll?'Homework permanently removed for all assigned students.':'Homework permanently deleted.');
}
async function deleteStudentPermanently(form) {
  await requireMatchingPortalSession('teacher');
  const id=text(form.getAttribute('data-id'));
  const s=state.students.find(x=>x.id===id);
  if(!s)throw Error('Student not found. Refresh the dashboard.');
  const confirmation=text(new FormData(form).get('confirm_name'));
  if(confirmation.toLowerCase()!==s.name.trim().toLowerCase())throw Error('Please type the student\'s full name exactly.');
  const {data,error}=await sb.functions.invoke('portal-student-admin',{
    body:{action:'delete_student',student_id:id,confirm_name:confirmation}
  });
  if(error||!data?.ok)throw Error(data?.error||error?.message||'Could not delete this student.');
  closeModal();await reload();
  toast(data.preserved_separate_mcq_account?
    'Student permanently removed from this portal. Separate MCQ account and licenses were preserved.':
    'Student account and Portal records permanently deleted.');
}

async function updateStudentStatus(id){
  const s=state.students.find(x=>x.id===id);if(!s)return;
  if(!window.confirm(`${s.is_active?'Deactivate':'Reactivate'} ${s.name}?`))return;
  ok(await sb.from('portal_students').update({is_active:!s.is_active}).eq('id',id));
  await reload();toast('Student status updated.');
}
async function archiveWork(id){
  const a=state.assignments.find(x=>x.id===id);if(!a)return;
  const nowArchived=a.status!=='archived';
  if(!window.confirm(`${nowArchived?'Archive':'Restore'} ${a.title}? ${nowArchived?'It will be hidden from the student, but kept for your records.':''}`))return;
  ok(await sb.from('portal_assignments').update({status:nowArchived?'archived':'open'}).eq('id',id));
  await reload();toast(nowArchived?'Homework archived.':'Homework restored.');
}
function announceBrowserReminders(){
  if(!state.user||!state.student||typeof Notification==='undefined'||Notification.permission!=='granted')return;
  const candidates=[];
  for(const a of state.assignments){
    if(a.status==='archived'||matchingSubmission(a.id))continue;
    const n=remaining(a.due_at);
    if(n>0&&n<=120)candidates.push({key:`2h:${a.id}`,body:`${a.title} is due in ${timeLeft(a.due_at)}. You've got this!`});
    else if(n>120&&n<=1440)candidates.push({key:`24h:${a.id}`,body:`${a.title} is due tomorrow. One step at a time.`});
  }
  for(const item of candidates){
    const k=`drmark-alert:${state.user.id}:${item.key}`;
    if(localStorage.getItem(k))continue;
    try{new Notification('A gentle reminder from Dr Mark',{body:item.body,icon:'assets/k_chromosome.png',tag:item.key});localStorage.setItem(k,'1');}catch(e){console.warn('Browser notifications unavailable',e);}
  }
}
async function enableAlerts(){
  if(!('Notification' in window)){toast('Browser notifications are unavailable on this device.',true);return;}
  if(!window.isSecureContext){toast('Notifications require an HTTPS website.',true);return;}
  const res=await Notification.requestPermission();
  if(res==='granted'){toast('Alerts enabled while the portal is open.');announceBrowserReminders();}
  else toast('You can still see all your reminders inside the portal.');
}
// A single event handler avoids losing actions whenever the dashboard re-renders.
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-action]');if(!el)return;
  const action=el.getAttribute('data-action'),id=el.getAttribute('data-id');
  if(el.tagName==='BUTTON')e.preventDefault();
  if(state.busy&&!['close-modal','mode'].includes(action))return;
  try{
    if(action==='mode'){state.roleChoice=el.getAttribute('data-mode');showLogin();}
    else if(action==='close-modal')closeModal();
    else if(action==='logout')await logout();
    else if(action==='refresh')await reload(true);
    else if(action==='new-student')studentModal();
    else if(action==='new-homework')homeworkModal();
    else if(action==='templates')homeworkTemplatesModal();
    else if(action==='use-template')homeworkModal(null,id);
    else if(action==='delete-template')await deleteHomeworkTemplate(id);
    else if(action==='student-settings')studentSettingsModal(id);
    else if(action==='reset-submission')await resetSentCheckmark(id);
    else if(action==='group-filter'){state.groupFilter=el.getAttribute('data-group')||'all';renderTeacher();}
    else if(action==='exam-countdown-hide')toggleExamCountdown(true);
    else if(action==='exam-countdown-show')toggleExamCountdown(false);
    else if(action==='parent-access')parentAccessModal(id);
    else if(action==='parent-toggle')await parentToggle(id);
    else if(action==='parent-reset')await parentReset(id);
    else if(action==='parent-delete')await parentDelete(id);
    else if(action==='edit-work')homeworkModal(state.assignments.find(a=>a.id===id));
    else if(action==='archive-work')await archiveWork(id);
    else if(action==='delete-work')deleteHomeworkModal(id);
    else if(action==='delete-student')deleteStudentModal(id);
    else if(action==='filter'){state.filter=el.getAttribute('data-filter');renderTeacher();}
    else if(action==='settings')settingsModal();
    else if(action==='feedback')feedbackModal(state.submissions.find(s=>s.id===id));
    else if(action==='reset-pin')resetPinModal(id);
    else if(action==='send-message')messageModal(id);
    else if(action==='toggle-student')await updateStudentStatus(id);
    else if(action==='enable-alerts')await enableAlerts();
    else if(action==='copy-parent-login'){
      const message=`DR Mark Portal · Parent Access
Student: Dr. ${el.getAttribute('data-student')}
Parent code: ${el.getAttribute('data-code')}
Password: ${el.getAttribute('data-password')}
Website: ${location.origin+location.pathname}
Choose "Parent" to sign in.`;
      await navigator.clipboard.writeText(message);
      toast('Parent login details copied. Send them privately on WhatsApp.');
    }
    else if(action==='copy-credentials'){
      const s=`DR Mark Portal\nStudent code: ${el.getAttribute('data-code')}\nPassword: ${el.getAttribute('data-pin')}\nWebsite: ${location.origin+location.pathname}`;
      await navigator.clipboard.writeText(s);toast('Student login details copied.');
    }
  }catch(err){console.error(err);toast(errorText(err),true);}
});
document.addEventListener('change',e=>{
  const el=e.target;
  if(el.id==='all-students'){
    modalRoot.querySelectorAll('input[name=student_ids]').forEach(c=>c.checked=el.checked);
    updateRecipientCount();
  }else if(el.id==='homework-template-choice'){
    if(el.value)fillHomeworkFromTemplate(el.value);
  }else if(el.matches('#homework-form input[name=student_ids], #homework-form input[name=recipient_groups]')){
    updateRecipientCount();
  }else if(el.matches('input[data-action=submit-work]')&&el.checked){void studentSubmit(el);}
});
document.addEventListener('input',e=>{
  if(e.target.id==='student-search' && state.profile?.role==='teacher'){
    state.studentSearch=e.target.value;
    const results=state.students.filter(s=>(state.groupFilter==='all'||(s.study_groups||[]).includes(state.groupFilter))&&(s.name+' '+s.code).toLowerCase().includes(state.studentSearch.toLowerCase()));
    const node=$('student-results');if(node)node.innerHTML=results.length?`<div class="grid2">${results.map(teacherStudentCard).join('')}</div>`:'<div class="empty">No matching students.</div>';
  }
});
document.addEventListener('submit',async e=>{
  const form=e.target;
  if(!['login-form','student-form','homework-form','feedback-form','settings-form','message-form','reset-form','delete-homework-form','delete-student-form','parent-create-form','student-settings-form'].includes(form.id))return;
  e.preventDefault();if(state.busy)return;
  state.busy=true;const button=form.querySelector('button[type=submit]');const original=button?.textContent;
  if(button){button.disabled=true;button.textContent='Saving...';}
  try{
    if(form.id==='login-form')await signIn(form);
    else if(form.id==='student-form')await newStudent(form);
    else if(form.id==='student-settings-form')await saveStudentSettings(form);
    else if(form.id==='parent-create-form')await parentCreate(form);
    else if(form.id==='homework-form')await createOrEditHomework(form);
    else if(form.id==='feedback-form')await saveFeedback(form);
    else if(form.id==='settings-form')await saveSettings(form);
    else if(form.id==='message-form')await sendMessage(form);
    else if(form.id==='reset-form')await resetPin(form);
    else if(form.id==='delete-homework-form')await deleteHomeworkPermanently(form);
    else if(form.id==='delete-student-form')await deleteStudentPermanently(form);
  }catch(err){console.error(err);toast(errorText(err),true);}
  finally{state.busy=false;if(button&&document.contains(button)){button.disabled=false;button.textContent=original;}}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modalRoot.hidden)closeModal();});
modalRoot.addEventListener('click',e=>{if(e.target===modalRoot)closeModal();});
// The portal stores no homework PDFs and caches no private responses.
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
setInterval(()=>{
  if(!state.profile)return;
  refreshCountdowns();
  if(state.profile.role==='student')announceBrowserReminders();
},60_000);
window.addEventListener('focus',queuePortalLiveReload);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')queuePortalLiveReload();});
setInterval(()=>{if(state.profile&&!state.busy&&document.visibilityState==='visible'&&modalRoot.hidden)queuePortalLiveReload();},90_000);
setInterval(()=>{if(state.profile?.role==='parent'&&!state.busy&&document.visibilityState==='visible')queuePortalLiveReload();},45_000);
boot();