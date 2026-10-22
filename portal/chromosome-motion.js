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

  function landing(stage) {
    for (const delay of [0,140]) {
      const ring = document.createElement('span');
      ring.className = 'cm-arrival-ring';
      stage.append(ring);
      ring.animate([
        {opacity:.66,transform:'translate(-50%,-50%) scale(.48)'},
        {opacity:0,transform:'translate(-50%,-50%) scale(1.48)'}
      ],{duration:640,delay,easing:'ease-out',fill:'forwards'}).finished
        .then(()=>ring.remove()).catch(()=>ring.remove());
    }
  }

  function play(stage) {
    const fly = stage.querySelector('.cm-fly');
    const idle = stage.querySelector('.cm-idle');
    if (!fly || !idle) return;
    const old = fly.getAnimations()[0];
    if (old) old.cancel();
    idle.classList.remove('cm-floating');
    if (reduced.matches || !stage.isConnected) { idle.classList.add('cm-floating'); return; }
    const r = fly.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) { idle.classList.add('cm-floating'); return; }
    const duration = window.innerWidth < 700 ? 2600 : 3800;
    const scale = Math.min(window.innerHeight*1.02/r.height, 4.7);
    const dx = window.innerWidth/2-(r.left+r.width/2);
    const dy = window.innerHeight/2-(r.top+r.height/2);
    const big = `translate3d(${dx}px,${dy}px,0) scale(${scale}) rotateY(-18deg)`;
    const anim = fly.animate([
      {opacity:0,transform:big,offset:0},
      {opacity:1,transform:big,offset:.12},
      {opacity:1,transform:big,offset:.20,easing:'cubic-bezier(.45,0,.12,1)'},
      {opacity:1,transform:'translate3d(0,0,0) scale(1) rotateY(0)',offset:1}
    ],{duration,easing:'linear',fill:'both'});
    sparkleTrail(fly,duration);
    anim.finished.then(()=>{
      anim.cancel();
      if (stage.isConnected) { idle.classList.add('cm-floating'); landing(stage); }
    }).catch(()=>{});
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
      if(reduced.matches || window.innerWidth<900 || event.pointerType !== 'mouse')return;
      const rect=stage.getBoundingClientRect();
      const x=(event.clientX-(rect.left+rect.width/2))/rect.width;
      const y=(event.clientY-(rect.top+rect.height/2))/rect.height;
      parallax.style.transform = `rotateY(${x*14}deg) rotateX(${-y*10}deg)`;
    });
    stage.addEventListener('pointerleave',()=>{parallax.style.transform='';});
    if (scene === 'login' || reduced.matches || seen.has(scene)) {
      stage.querySelector('.cm-idle').classList.add('cm-floating');
    } else {
      seen.add(scene);
      requestAnimationFrame(()=>setTimeout(()=>{if(stage.isConnected)play(stage);},130));
    }
  }

  function enhance() {
    const login = app.querySelector('.login-brand > img');
    if(login) install(login,'login');
    app.querySelectorAll('.teacher-hero > img.hero-mark, .student-hero > img.hero-mark')
      .forEach(img=>install(img,img.closest('.teacher-hero')?'teacher':'student'));
  }
  function queue() {
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;enhance();});
  }
  new MutationObserver(queue).observe(app,{childList:true,subtree:true});
  enhance();
})();
