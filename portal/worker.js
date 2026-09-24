const BACKEND=window.DR_MARK_BACKEND;
const params=new URLSearchParams(location.search);
const jobId=params.get("job")||"";
const token=params.get("token")||"";
const endpoint=`${BACKEND.supabaseUrl}/functions/v1/portal-checker-worker`;
const sbWorker=window.supabase.createClient(BACKEND.supabaseUrl,BACKEND.supabaseKey,{auth:{persistSession:false,autoRefreshToken:false}});
const $=s=>document.querySelector(s);

async function call(action,extra={}){
  const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","apikey":BACKEND.supabaseKey},body:JSON.stringify({action,job_id:jobId,token,...extra})});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok||data.error)throw new Error(data.error||`Checker service returned ${r.status}`);
  return data;
}
function setStatus(t){$("#status").textContent=t}
function fail(e){$("#loading").hidden=true;$("#workspace").hidden=true;$("#error").hidden=false;$("#error").textContent=e.message||String(e);setStatus("Unavailable")}

async function openJob(){
  if(!jobId||!token)throw new Error("This checker link is incomplete.");
  const data=await call("open");
  const j=data.job;
  $("#jobId").textContent=`#${j.id.slice(0,8).toUpperCase()}`;
  $("#student").textContent=j.student_name?`${j.student_name}${j.student_code?` (${j.student_code})`:""}`:"Student";
  $("#subject").textContent=j.subject;
  $("#paper").textContent=j.paper_type;
  if(j.paper_hint){$("#hint").textContent=j.paper_hint;$("#hintWrap").hidden=false}
  $("#sourceLink").href=data.source_url;
  $("#sourceLink").download=j.source_file_name||"submitted-paper.pdf";
  $("#loading").hidden=true;$("#workspace").hidden=false;setStatus("Checking");
}

document.addEventListener("click",async e=>{
  const b=e.target.closest("[data-status]");if(!b)return;
  const old=b.textContent;b.disabled=true;b.textContent="Updating...";
  try{await call("status",{status:b.dataset.status});setStatus(b.dataset.status.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase()));}
  catch(err){alert(err.message)}finally{b.disabled=false;b.textContent=old}
});

$("#resultForm").addEventListener("submit",async e=>{
  e.preventDefault();const btn=$("#completeBtn"),file=$("#resultFile").files[0];
  if(!file)return;if(file.type&&file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf")){alert("Please upload a PDF report.");return}
  btn.disabled=true;btn.textContent="Uploading report...";
  try{
    const prep=await call("prepare_upload",{file_name:file.name});
    const {error}=await sbWorker.storage.from(BACKEND.storageBucket).uploadToSignedUrl(prep.upload_path,prep.upload_token,file,{contentType:file.type||"application/pdf"});
    if(error)throw error;
    await call("complete",{result_path:prep.upload_path,result_file_name:file.name,mark_awarded:$("#mark").value,mark_total:$("#total").value,student_message:$("#message").value});
    setStatus("Completed");
    $("#resultForm").innerHTML='<p><b>Report uploaded successfully.</b></p><p class="muted">The student portal now shows this paper as completed.</p>';
    $(".actions").querySelectorAll("button").forEach(x=>x.disabled=true);
  }catch(err){alert(err.message);btn.disabled=false;btn.textContent="Upload report and complete"}
});

openJob().catch(fail);
