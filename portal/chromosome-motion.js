/* The original DR Mark cinematic chromosome returns: centre-screen arrival,
   gold particle trail, orbital pedestal, gentle continuous float and parallax.
   Kept separate from the authenticated portal code so login/submissions are unaffected. */
(() => {
  'use strict';
  const app = document.getElementById('app');
  if (!app) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const seen = new Set();
  const image = 'assets/k_chromosome.png';
  const easing = 'cubic-bezier(.16,1,.3,1)';
  let scheduled = false;
  let activeRun = null;

  function stageHTML(scene) {
    return `<div class="cm-stage" data-cm-scene="${scene}" role="button" tabindex="0"
        title="Replay the original chromosome animation" aria-label="Replay the gold chromosome animation">
      <div class="cm-pedestal" aria-hidden="true"></div>
      <div class="cm-orbit" aria-hidden="true"></div>
      <div class="cm-fly"><div class="cm-idle"><div class="cm-parallax">
        <img src="${image}" alt="DR Mark's golden chromosome">
      </div></div></div>
    </div>`;
  }

  function sparkleTrail(fly, duration) {
    const canvas = document.createElement('canvas');
    canvas.className = 'cm-dust';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth, height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    document.body.append(canvas);
    const g = canvas.getContext('2d');
    if (!g) { canvas.remove(); return; }
    g.scale(dpr,dpr);
    let bits = [], started = null;
    const density = width < 700 ? 2 : 4;
    const step = now => {
      if (!fly.isConnected) { canvas.remove(); return; }
      if (started === null) started = now;
      const progress = Math.min((now - started) / duration, 1);
      g.clearRect(0, 0, width, height);
      if (progress < 0.88) {
        const b = fly.getBoundingClientRect();
        for (let i=0; i<density; i++) bits.push({
          x:b.left+b.width*(.22+Math.random()*.56),
          y:b.top+b.height*(.22+Math.random()*.56),
          vx:(Math.random()-.5)*1.35, vy:(Math.random()-.5)*1.2+.28,
          life:1, size:1+Math.random()*2.3, alpha:.82*(1-progress*.52)
        });
      }
      bits = bits.filter(p=>p.life>0);
      for (const p of bits) {
        p.x += p.vx; p.y += p.vy; p.life -= .024;
        g.globalAlpha = Math.max(p.life,0)*p.alpha;
        g.fillStyle = '#e7ba64';
        g.fillRect(p.x,p.y,p.size,p.size);
      }
      g.globalAlpha = 1;
      if (progress < 1 || bits.length) requestAnimationFrame(step);
      else canvas.remove();
    };
    requestAnimationFrame(step);
  }

  // The curtain guarantees a text-free centre-screen entrance. Every
  // animation ends exactly at the underlying unanimated style.
  function stopRun(run, completed=false) {
    if (!run || run.stopped) return;
    run.stopped=true;
    if (activeRun === run) activeRun=null;
    run.animations.forEach(a=>{ try { a.cancel(); } catch (_) {} });
    run.curtain.remove();
    document.querySelectorAll('.cm-dust').forEach(el=>el.remove());
    run.stage.classList.remove('cm-arriving');
    run.stage.removeAttribute('aria-busy');
    if (completed && run.stage.isConnected) run.idle.classList.add('cm-settled');
  }

  function play(stage) {
    if (!stage.isConnected || !stage.closest('.hero')) return;
    if (activeRun) stopRun(activeRun);
    const fly=stage.querySelector('.cm-fly'),idle=stage.querySelector('.cm-idle');
    const copy=stage.closest('.hero').querySelector('.hero-copy');
    if (!fly || !idle || !copy) return;
    idle.classList.remove('cm-floating','cm-settled');
    stage.classList.add('cm-arriving');
    stage.setAttribute('aria-busy','true');
    stage.querySelector('.cm-parallax').style.transform='';
    if (reduced.matches) {
      stage.classList.remove('cm-arriving');
      stage.removeAttribute('aria-busy');
      idle.classList.add('cm-settled');
      return;
    }

    const curtain=document.createElement('div');
    curtain.className='cm-curtain';
    curtain.setAttribute('aria-hidden','true');
    document.body.append(curtain);
    const r=fly.getBoundingClientRect();
    if (r.width<10 || r.height<10) {
      curtain.remove(); stage.classList.remove('cm-arriving');
      stage.removeAttribute('aria-busy'); idle.classList.add('cm-settled'); return;
    }

    const duration=innerWidth<700?2950:3750;
    const scale=Math.min(innerHeight*.95/r.height,innerWidth*.72/r.width,4.25);
    const dx=innerWidth/2-(r.left+r.width/2),dy=innerHeight/2-(r.top+r.height/2);
    const centered='translate3d('+dx+'px,'+dy+'px,0) scale('+scale+')';
    // No rebound, impact rings, magnet snap, or hand-off position jump.
    const move=fly.animate([
      {offset:0,opacity:0,transform:centered},
      {offset:.09,opacity:1,transform:centered},
      {offset:.24,opacity:1,transform:centered,easing:'cubic-bezier(.45,0,.55,1)'},
      {offset:1,opacity:1,transform:'none'}
    ],{duration,easing:'linear',fill:'both'});
    const reveal=curtain.animate([
      {offset:0,opacity:1},{offset:.28,opacity:1},
      {offset:.43,opacity:.85},{offset:.68,opacity:.26},
      {offset:.94,opacity:0},{offset:1,opacity:0}
    ],{duration,easing:'linear',fill:'both'});
    const words=copy.animate([
      {offset:0,opacity:0,transform:'translate3d(-18px,0,0)'},
      {offset:.30,opacity:0,transform:'translate3d(-18px,0,0)'},
      {offset:.80,opacity:1,transform:'none'},
      {offset:1,opacity:1,transform:'none'}
    ],{duration,easing:'linear',fill:'both'});
    const ornaments=[...stage.querySelectorAll('.cm-orbit,.cm-pedestal')].map(node=>node.animate([
      {offset:0,opacity:0},{offset:.53,opacity:0},
      {offset:.92,opacity:1},{offset:1,opacity:1}
    ],{duration,easing:'linear',fill:'both'}));
    const run={stage,idle,curtain,animations:[move,reveal,words,...ornaments],stopped:false};
    activeRun=run;
    sparkleTrail(fly,duration);
    move.finished.then(()=>stopRun(run,true)).catch(()=>{});
  }

  function install(img, scene) {
    const holder = document.createElement('div');
    holder.innerHTML = stageHTML(scene);
    const stage = holder.firstElementChild;
    img.replaceWith(stage);
    stage.addEventListener('click',()=>play(stage));
    stage.addEventListener('keydown',event=>{
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); play(stage);
      }
    });
    const parallax = stage.querySelector('.cm-parallax');
    stage.addEventListener('pointermove', event=>{
      if(reduced.matches || stage.classList.contains('cm-arriving') || window.innerWidth<900 || event.pointerType !== 'mouse')return;
      const rect=stage.getBoundingClientRect();
      const x=(event.clientX-(rect.left+rect.width/2))/rect.width;
      const y=(event.clientY-(rect.top+rect.height/2))/rect.height;
      parallax.style.transform = `rotateY(${x*14}deg) rotateX(${-y*10}deg)`;
    });
    stage.addEventListener('pointerleave',()=>{parallax.style.transform='';});
    const heroScene = scene === 'teacher' || scene === 'student';
    if (!heroScene || reduced.matches || seen.has(scene)) {
      stage.querySelector('.cm-idle').classList.add(heroScene ? 'cm-settled' : 'cm-floating');
    } else {
      seen.add(scene);
      play(stage);
    }
  }

  function enhance() {
    if (activeRun && !activeRun.stage.isConnected) stopRun(activeRun);
    const login = app.querySelector('.login-brand > img');
    if(login) install(login,'login');
    app.querySelectorAll('.teacher-hero > img.hero-mark, .student-hero > img.hero-mark')
      .forEach(img=>install(img,img.closest('.teacher-hero')?'teacher':'student'));
  }
  function queue() {
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(()=>{scheduled=false;enhance();});
  }
  new MutationObserver(queue).observe(app,{childList:true,subtree:true});
  enhance();
})();
