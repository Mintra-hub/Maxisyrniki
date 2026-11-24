// A small balloon that slowly drifts over the page.
// Tap/click -> it dashes away from the finger. After `taps` hits -> onWin().
export function startBalloon({ taps = 5, onHit, onWin, paused = () => false }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W = 52, H = 84;          // balloon box incl. string
  const BASE = reduce ? 14 : 28; // calm drift speed, px/s
  const DASH = 950;              // speed right after a tap, px/s

  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'balloon';
  el.setAttribute('aria-label', 'Balloon');
  el.innerHTML = `<svg viewBox="0 0 52 84" width="${W}" height="${H}" aria-hidden="true">
    <defs><radialGradient id="bg" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#ff9a8f"/><stop offset=".55" stop-color="#ec5a50"/><stop offset="1" stop-color="#c63d37"/></radialGradient></defs>
    <path class="str" d="M26 58 q-5 7 0 13 q5 6 0 13" fill="none" stroke="#9a7461" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M26 2 C40 2 49 13 49 26 C49 42 36 54 26 56 C16 54 3 42 3 26 C3 13 12 2 26 2Z" fill="url(#bg)"/>
    <path d="M22 56 L30 56 L28 60 L24 60Z" fill="#c63d37"/>
    <ellipse cx="17" cy="17" rx="5" ry="8" fill="#fff" opacity=".45" transform="rotate(-25 17 17)"/>
    <text x="26" y="34" text-anchor="middle" font-size="15" fill="#fff" opacity=".9">♥</text>
  </svg>`;
  document.body.appendChild(el);

  const bounds = () => {
    const top = (document.querySelector('.top')?.offsetHeight || 64) + 6;
    const bar = document.querySelector('#cartbar');
    const bottom = innerHeight - (bar && !bar.hidden ? 84 : 12) - H;
    return { minX: 6, maxX: innerWidth - W - 6, minY: top, maxY: Math.max(top + 40, bottom) };
  };

  let b = bounds();
  let x = b.minX + Math.random() * (b.maxX - b.minX);
  let y = b.maxY;                               // rises from the bottom
  let ang = -Math.PI / 2 + (Math.random() - 0.5);
  let vx = Math.cos(ang) * BASE, vy = Math.sin(ang) * BASE;
  let hits = 0, done = false, last = performance.now(), t = 0, squash = 0;
  el.style.transform = `translate3d(${x}px,${y}px,0)`;

  function frame(now) {
    if (done) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const hidden = paused();
    el.style.visibility = hidden ? 'hidden' : '';
    if (!hidden) {
      t += dt;
      b = bounds();
      // gentle wandering: slowly rotate heading
      ang = Math.atan2(vy, vx) + Math.sin(t * 0.7) * 0.35 * dt + (Math.random() - 0.5) * 0.6 * dt;
      let speed = Math.hypot(vx, vy);
      speed = BASE + (speed - BASE) * Math.exp(-3.2 * dt);   // dash slows down back to drift
      vx = Math.cos(ang) * speed; vy = Math.sin(ang) * speed;
      x += vx * dt; y += vy * dt;
      if (x < b.minX) { x = b.minX; vx = Math.abs(vx); }
      if (x > b.maxX) { x = b.maxX; vx = -Math.abs(vx); }
      if (y < b.minY) { y = b.minY; vy = Math.abs(vy); }
      if (y > b.maxY) { y = b.maxY; vy = -Math.abs(vy); }
      squash = Math.max(0, squash - dt * 4);
      const bob = reduce ? 0 : Math.sin(t * 1.8) * 4;
      const tilt = Math.max(-25, Math.min(25, vx * 0.04)) + (reduce ? 0 : Math.sin(t * 1.3) * 4);
      const sx = 1 + squash * 0.25, sy = 1 - squash * 0.2;
      el.style.transform = `translate3d(${x}px,${y + bob}px,0) rotate(${tilt}deg) scale(${sx},${sy})`;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  el.addEventListener('pointerdown', (e) => {
    if (done) return;
    e.preventDefault();
    hits++;
    onHit?.(hits);
    if (hits >= taps) {          // last tap: the balloon bursts
      done = true;
      burst(x + W / 2, y + 26);
      el.classList.add('burst');
      setTimeout(() => el.remove(), 250);
      setTimeout(() => onWin?.(), 350);
      return;
    }
    // dash away from the finger, with some randomness
    const cx = x + W / 2, cy = y + H / 3;
    let a = Math.atan2(cy - e.clientY, cx - e.clientX);
    if (!isFinite(a) || (cx === e.clientX && cy === e.clientY)) a = Math.random() * Math.PI * 2;
    a += (Math.random() - 0.5) * 1.2;
    vx = Math.cos(a) * DASH; vy = Math.sin(a) * DASH;
    squash = 1;
    pop(e.clientX, e.clientY);
  });

  // "POP!" text + red rubber pieces flying out
  function burst(cx, cy) {
    const word = document.createElement('span');
    word.className = 'b-bang';
    word.textContent = 'POP!';
    word.style.left = cx + 'px'; word.style.top = cy + 'px';
    document.body.appendChild(word);
    setTimeout(() => word.remove(), 800);
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('i');
      s.className = 'b-shard';
      const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4, d = 50 + Math.random() * 50;
      s.style.left = cx + 'px'; s.style.top = cy + 'px';
      s.style.setProperty('--dx', Math.cos(a) * d + 'px');
      s.style.setProperty('--dy', Math.sin(a) * d + 'px');
      s.style.setProperty('--r', Math.random() * 360 + 'deg');
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 600);
    }
  }

  function pop(px, py) {
    const s = document.createElement('span');
    s.className = 'b-pop';
    s.textContent = '♥';
    s.style.left = px + 'px'; s.style.top = py + 'px';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }

  return { stop() { done = true; el.remove(); } };
}

// Simple confetti burst for the win screen
export function confetti(n = 60) {
  const colors = ['#e8564f', '#f5a623', '#7cb342', '#9b59b6', '#2aabee', '#f3d27a'];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.setProperty('--dx', (Math.random() - 0.5) * 160 + 'px');
    c.style.setProperty('--r', Math.random() * 720 - 360 + 'deg');
    c.style.animationDelay = Math.random() * 0.4 + 's';
    c.style.animationDuration = 1.6 + Math.random() * 1.2 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3400);
  }
}
