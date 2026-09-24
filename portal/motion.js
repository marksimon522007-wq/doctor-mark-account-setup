/* Motion language: one easing, transform/opacity only. */
const EASE="cubic-bezier(.16,1,.3,1)",$=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches,desk=()=>innerWidth>900&&matchMedia("(hover:hover)").matches;

/* The hero chromosome (#kfly) is the ONLY chromosome: it is animated with transform from
   screen-centre/large to its natural spot, so there is no clone and no handoff. */
function intro(){
 const k=$("#kfly");
 if(reduced||!k){document.body.classList.remove("pre");hero();return}
 const T=innerWidth<700?2600:3800,r=k.getBoundingClientRect(),s0=Math.min(innerHeight*1.05/r.height,5),
  dx=innerWidth/2-(r.left+r.width/2),dy=innerHeight/2-(r.top+r.height/2);
 const rev=(e,d,y=20,u=900)=>e.animate([{opacity:0,transform:`translateY(${y}px)`,filter:"blur(5px)"},{opacity:1,transform:"none",filter:"blur(0)"}],{duration:u,delay:d,easing:EASE,fill:"backwards"});
 rev($("#side"),T*.2,0,1000);rev($("#top"),T*.3,0);
 $$("[data-r]").forEach((e,i)=>rev(e,T*.35+i*110));
 $$(".pedestal,.orbit").forEach(e=>e.animate([{opacity:0},{opacity:1}],{duration:900,delay:T*.7,fill:"backwards"}));
 document.body.classList.remove("pre");
 const big=`translate3d(${dx}px,${dy}px,0) scale(${s0}) rotate3d(0,1,0,-18deg)`;
 /* fade in big at centre, brief hold, then one continuous eased move + shrink to the final spot */
 const a=k.animate([{transform:big,opacity:0,offset:0},{transform:big,opacity:1,offset:.12},{transform:big,opacity:1,offset:.2,easing:"cubic-bezier(.45,0,.12,1)"},{transform:"translate3d(0,0,0) scale(1) rotate3d(0,1,0,0)",opacity:1,offset:1}],{duration:T,easing:"linear"});
 /* gold dust trail (canvas, small particle count) */
 const cv=$("#trail"),g=cv.getContext("2d");cv.width=innerWidth;cv.height=innerHeight;let P=[];const t0=performance.now();
 (function f(n){const t=n-t0,p=Math.min(t/T,1);g.clearRect(0,0,cv.width,cv.height);
  if(t<T*.85){const b=k.getBoundingClientRect();for(let i=0;i<(innerWidth<700?1:3);i++)P.push({x:b.left+b.width*(.3+Math.random()*.4),y:b.top+b.height*(.2+Math.random()*.6),vx:(Math.random()-.5)*.5,vy:Math.random()*.5,l:1,s:1+Math.random()*1.6,a:.65*(1-p)})}
  P=P.filter(q=>q.l>0);for(const q of P){q.x+=q.vx;q.y+=q.vy;q.l-=.03;g.globalAlpha=Math.max(q.l,0)*q.a;g.fillStyle="#c9a04a";g.fillRect(q.x,q.y,q.s,q.s)}
  t<T+700?requestAnimationFrame(f):g.clearRect(0,0,cv.width,cv.height)})(t0);
 a.finished.then(land).catch(()=>{});hero(true);
}
function land(){const s=$(".stage");if(!s)return;[0,150].forEach(d=>{const r=document.createElement("div");r.className="ring";s.appendChild(r);r.animate([{opacity:.5,transform:"scale(.5)"},{opacity:0,transform:"scale(1.7)"}],{duration:550,delay:d,easing:"ease-out"}).finished.then(()=>r.remove())});$(".kidle")?.classList.add("on")}
function hero(wait){if(!$(".kidle"))return;if(!wait&&!reduced)$(".kidle").classList.add("on")}
addEventListener("mousemove",e=>{const p=$(".kpar");if(!p||!desk()||reduced)return;p.style.transform=`rotateY(${(e.clientX/innerWidth-.5)*14}deg) rotateX(${(.5-e.clientY/innerHeight)*10}deg)`});

/* buttons: gold ripple from cursor */
document.addEventListener("pointerdown",e=>{const b=e.target.closest(".btn");if(!b||reduced)return;const r=b.getBoundingClientRect(),s=Math.max(r.width,r.height)*2,x=document.createElement("span");x.className="rp";x.style.cssText=`width:${s}px;height:${s}px;left:${e.clientX-r.left-s/2}px;top:${e.clientY-r.top-s/2}px`;b.appendChild(x);setTimeout(()=>x.remove(),650)});
/* card tilt (desktop only, small angles) */
document.addEventListener("mousemove",e=>{if(!desk()||reduced)return;const c=e.target.closest?.(".card");$$(".card[data-t]").forEach(x=>{if(x!==c){x.style.transform="";delete x.dataset.t}});if(!c)return;const r=c.getBoundingClientRect();c.dataset.t=1;c.style.transform=`perspective(700px) rotateY(${((e.clientX-r.left)/r.width-.5)*6}deg) rotateX(${(.5-(e.clientY-r.top)/r.height)*6}deg) translateZ(4px)`});
/* stagger children of a freshly rendered view */
function stagger(root){if(reduced)return;$$(".card,.row",root).slice(0,24).forEach((e,i)=>e.animate([{opacity:0,transform:"translateY(14px)"},{opacity:1,transform:"none"}],{duration:500,delay:i*35,easing:EASE,fill:"backwards"}))}
function toast(m,err){const t=document.createElement("div");t.className="toast"+(err?" err":"");t.textContent=m;$("#toasts").appendChild(t);if(!reduced){t.animate([{opacity:0,transform:"translateX(30px)"},{opacity:1,transform:"none"}],{duration:400,easing:EASE});t.animate([{transform:"translateX(-120%)",background:"#e2b86a33",offset:0},{transform:"translateX(120%)",offset:1}].map(k=>k),{duration:0})}setTimeout(()=>{t.animate([{opacity:1},{opacity:0}],{duration:250}).finished.then(()=>t.remove())},3200)}
function openM(m){m.hidden=false;if(reduced)return;m.animate([{opacity:0},{opacity:1}],{duration:300});$(".mc",m).animate([{opacity:0,transform:"translateZ(-120px) scale(.94)",filter:"blur(6px)"},{opacity:1,transform:"none",filter:"blur(0)"}],{duration:350,easing:EASE})}
async function closeM(m){if(!reduced){m.animate([{opacity:1},{opacity:0}],{duration:220});await $(".mc",m).animate([{opacity:1},{opacity:0,transform:"scale(.96)"}],{duration:220}).finished}m.hidden=true;m.innerHTML=""}

/* Cell division: the K splits in two and one copy flies off to the student list */
function divide(){if(reduced)return;[-1,1].forEach(s=>{const i=document.createElement("img");i.src="assets/k_chromosome.png";i.className="ov";document.body.appendChild(i);i.animate([{opacity:0,transform:"scale(1.6)"},{opacity:1,transform:"scale(1.6)",offset:.25},{opacity:1,transform:`translateX(${s*45}px) scale(1.6)`,offset:.5},{opacity:s>0?0:0,transform:`translateX(${s*(innerWidth/2-140)}px) translateY(-30vh) scale(.3)`}],{duration:1400,easing:EASE}).finished.then(()=>i.remove())})}
function countUp(){$$(".cu").forEach(e=>{const v=+e.dataset.v;if(reduced)return;const t0=performance.now();(function f(n){const p=Math.min((n-t0)/1200,1);e.textContent=Math.round(v*(1-Math.pow(1-p,3))*10)/10;p<1&&requestAnimationFrame(f)})(t0)})}
