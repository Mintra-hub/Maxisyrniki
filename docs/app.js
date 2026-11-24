import { PRODUCTS, MAX_QTY, BALLOON_TAPS } from './catalog.js';
import { startBalloon, confetti } from './balloon.js';
import { STR, LANGS } from './i18n.js';
import { CONFIG } from './config.js';

const tg = window.Telegram?.WebApp;
const inTg = !!(tg && tg.initData);
const DEMO = !CONFIG.API_URL || CONFIG.API_URL.includes('YOUR');

// ---------- storage (safe: works in private mode too) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('mx_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('mx_' + k, JSON.stringify(v)); } catch {} },
};

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const prod = (id) => PRODUCTS.find((p) => p.id === id);
const variant = (p, vid) => p?.variants?.find((v) => v.id === vid);
const money = (n) => `${n.toLocaleString('en-US')} ฿`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const haptic = (type = 'light') => { try { tg?.HapticFeedback?.impactOccurred(type); } catch {} };

function pickLang() {
  const saved = store.get('lang');
  if (LANGS.includes(saved)) return saved;
  const code = (tg?.initDataUnsafe?.user?.language_code || navigator.language || 'en').slice(0, 2).toLowerCase();
  return LANGS.includes(code) ? code : 'en';
}
let lang = pickLang();
const t = (k, vars = {}) => (STR[lang][k] ?? STR.en[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => vars[n] ?? '');

// ---------- state ----------
const validLine = (l) => {
  const p = prod(l?.id);
  return p && (!p.variants || variant(p, l.v)) && (!l.opt || !!p.option) && Number.isInteger(l.qty) && l.qty > 0 && (!p.bonus || l.qty === 1);
};
let cart = store.get('cart', []).filter(validLine);
let profile = { name: '', phone: '', address: '', ...store.get('profile', {}) };
const notBonus = (l) => !prod(l.id)?.bonus;
let lastItems = store.get('lastItems', []).filter(validLine).filter(notBonus);
const selected = {};   // productId -> chosen variant id
const optSel = {};    // productId -> true if the product's option switch is on

const unitPrice = (l) => { const p = prod(l.id); return p.price + (l.opt && p.option ? p.option.price : 0); };
const cartCount = () => cart.reduce((s, l) => s + l.qty, 0);
const cartTotal = () => cart.reduce((s, l) => s + unitPrice(l) * l.qty, 0);
const saveCart = () => store.set('cart', cart);
const toItem = ({ id, v, opt, qty }) => ({ id, ...(v ? { v } : {}), ...(opt ? { opt: true } : {}), qty });

const findLine = (id, v, opt) => cart.find((l) => l.id === id && (l.v || null) === (v || null) && !!l.opt === !!opt);
function addToCart(id, v, qty = 1, opt = false) {
  const line = findLine(id, v, opt);
  if (line) line.qty = Math.min(MAX_QTY, line.qty + qty);
  else cart.push(toItem({ id, v, opt, qty }));
  saveCart();
}
// current selection on a product card: [variant, opt]
const cardSel = (p) => [p.variants ? (selected[p.id] ?? p.variants[0].id) : null, !!(p.option && optSel[p.id])];
function changeQty(i, d) {
  cart[i].qty = Math.min(MAX_QTY, cart[i].qty + d);
  if (cart[i].qty <= 0) cart.splice(i, 1);
  saveCart();
}

// ---------- rendering ----------
function renderStatic() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll('[data-ph]').forEach((el) => { el.placeholder = t(el.dataset.ph); });
  $('#lang').innerHTML = LANGS.map((l) => `<button data-lang="${l}" aria-pressed="${l === lang}">${l.toUpperCase()}</button>`).join('');
}

function renderProducts() {
  $('#products').innerHTML = PRODUCTS.filter((p) => !p.hidden).map((p) => {
    const [sel, opt] = cardSel(p);
    const qty = findLine(p.id, sel, opt)?.qty || 0;
    const countVariant = (vid) => cart.filter((l) => l.id === p.id && l.v === vid).reduce((s, l) => s + l.qty, 0);
    const cookToggle = p.option
      ? `<button type="button" class="cook${opt ? ' on' : ''}" data-opt="${p.id}" role="switch" aria-checked="${opt}">
           <span class="sw" aria-hidden="true"></span>
           <span class="cook-t">${p.option.icon}&nbsp;${esc(p.option.name[lang])}${p.option.price ? ` <b>+${money(p.option.price)}</b>` : ''}<small>${opt ? esc(p.option.hint[lang]) : p.option.offIcon + ' ' + esc(p.option.off[lang])}</small></span>
         </button>`
      : '';
    const chips = p.variants
      ? `<div class="chips" role="radiogroup" aria-label="${esc(t('chooseFlavor'))}">${p.variants.map((v) => {
          const n = countVariant(v.id);
          return `<button type="button" class="chip${v.id === sel ? ' on' : ''}" data-p="${p.id}" data-v="${v.id}" role="radio" aria-checked="${v.id === sel}"><i style="background:${v.color}"></i>${esc(v.name[lang])}${n ? `<em>${n}</em>` : ''}</button>`;
        }).join('')}</div>`
      : '';
    const pname = esc(p.name[lang]) + (p.variants ? ' · ' + esc(variant(p, sel).name[lang]) : '') + (opt ? ' · ' + esc(p.option.short[lang]) : '');
    const control = qty
      ? `<div class="stepper">
           <button type="button" data-dec="${p.id}" aria-label="−1 ${pname}">−</button>
           <span aria-live="polite">${qty}</span>
           <button type="button" data-add="${p.id}" aria-label="+1 ${pname}">+</button>
         </div>`
      : `<button class="add" data-add="${p.id}" aria-label="${esc(t('add'))}: ${pname}">+ ${esc(t('add'))}</button>`;
    return `<article class="card">
      <div class="pic"><img src="${p.img}" alt="${esc(p.name[lang])}" loading="lazy">${p.isNew ? `<span class="new">${esc(t('new'))}</span>` : ''}</div>
      <div class="info-p">
        <h3>${esc(p.name[lang])}</h3>
        <p class="desc">${esc(p.desc[lang])}</p>
        ${chips}
        ${cookToggle}
        <div class="buy">
          <span class="price">${money(p.price + (opt ? p.option.price : 0))}</span>
          ${control}
        </div>
      </div>
    </article>`;
  }).join('');
}

function renderCartBar() {
  const n = cartCount();
  $('#cartbar').hidden = n === 0;
  $('#cartCount').textContent = n;
  $('#cartSum').textContent = money(cartTotal());
}

function renderLines() {
  $('#lines').innerHTML = cart.length
    ? cart.map((l, i) => {
        const p = prod(l.id), v = variant(p, l.v);
        if (p.bonus) return `<div class="line bonus">
          <img src="${p.img}" alt="">
          <div class="nm">🎁 ${esc(p.name[lang])}<small>${esc(p.desc[lang])}</small></div>
          <span class="free">${esc(t('free'))}</span>
        </div>`;
        return `<div class="line">
          <img src="${p.img}" alt="">
          <div class="nm">${esc(p.name[lang])}${v ? ` · ${esc(v.name[lang])}` : ''}${p.option ? `<span class="tag${l.opt ? ' hot' : ''}">${l.opt ? p.option.icon + ' ' + esc(p.option.short[lang]) + (p.option.price ? ' +' + money(p.option.price) : '') : p.option.offIcon + ' ' + esc(p.option.off[lang])}</span>` : ''}<small>${money(unitPrice(l) * l.qty)}</small></div>
          <div class="step"><button type="button" data-q="${i}" data-d="-1" aria-label="−">−</button><span>${l.qty}</span><button type="button" data-q="${i}" data-d="1" aria-label="+">+</button></div>
        </div>`;
      }).join('')
    : `<p class="empty">${esc(t('emptyCart'))}</p>`;
  const btn = $('#submitBtn');
  if (!btn.dataset.busy) btn.textContent = t('placeOrder', { sum: money(cartTotal()) });
  const onlyBonus = cart.length > 0 && cart.every((l) => !notBonus(l));
  $('#bonusHint').hidden = !onlyBonus;
  btn.disabled = cart.length === 0 || onlyBonus || !!btn.dataset.busy;
}

// ---------- balloon gift ----------
function winBonus() {
  store.set('bonusWon', true);
  if (!cart.some((l) => prod(l.id).bonus)) { cart.push({ id: 'bonus', qty: 1 }); saveCart(); }
  try { tg?.HapticFeedback?.notificationOccurred('success'); } catch {}
  renderCartBar(); renderLines();
  closeSheet();
  openSheet($('#gift'));
  confetti();
}
function maybeStartBalloon() {
  if (store.get('bonusWon')) return;
  startBalloon({
    taps: BALLOON_TAPS,
    paused: () => !!openSheetEl || document.hidden,
    onHit: () => haptic('rigid'),
    onWin: winBonus,
  });
}

function renderHello() {
  const name = profile.name || tg?.initDataUnsafe?.user?.first_name;
  const show = inTg && name;
  $('#hello').hidden = !show;
  if (show) $('#helloTitle').textContent = t('hello', { name });
  $('#repeatBtn').hidden = !(show && lastItems.length);
}

function renderAll() { renderStatic(); renderProducts(); renderCartBar(); renderLines(); renderHello(); }

// ---------- sheets ----------
let openSheetEl = null;
function openSheet(el) {
  openSheetEl = el; el.hidden = false; document.body.style.overflow = 'hidden';
  if (inTg) { tg.BackButton.show(); }
}
function closeSheet() {
  if (!openSheetEl) return;
  openSheetEl.hidden = true; openSheetEl = null; document.body.style.overflow = '';
  if (inTg) tg.BackButton.hide();
}
function openCart() {
  const f = $('#form');
  for (const k of ['name', 'phone', 'address']) if (!f[k].value) f[k].value = profile[k] || '';
  if (!f.name.value && tg?.initDataUnsafe?.user) f.name.value = [tg.initDataUnsafe.user.first_name, tg.initDataUnsafe.user.last_name].filter(Boolean).join(' ');
  $('#formErr').hidden = true;
  renderLines();
  openSheet($('#sheet'));
}

let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 1400);
}

// ---------- API ----------
async function api(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (inTg) headers['X-Tg-Init-Data'] = tg.initData;
  const r = await fetch(CONFIG.API_URL.replace(/\/$/, '') + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) throw new Error(data.error || 'HTTP ' + r.status);
  return data;
}

async function loadMe() {
  if (!inTg || DEMO) return;
  try {
    const { profile: p, lastItems: li } = await api('/api/me');
    if (p) { profile = { ...profile, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v)) }; store.set('profile', profile); }
    if (Array.isArray(li)) { lastItems = li.filter(validLine).filter(notBonus); store.set('lastItems', lastItems); }
    renderHello();
  } catch (e) { console.warn('me:', e.message); }
}

async function submitOrder(e) {
  e.preventDefault();
  const f = $('#form');
  const data = Object.fromEntries(['name', 'phone', 'address', 'when', 'comment'].map((k) => [k, f[k].value.trim()]));
  const missing = ['name', 'phone', 'address'].filter((k) => !data[k]);
  ['name', 'phone', 'address'].forEach((k) => f[k].classList.toggle('bad', missing.includes(k)));
  if (missing.length) { $('#formErr').textContent = t('required'); $('#formErr').hidden = false; f[missing[0]].focus(); return; }
  $('#formErr').hidden = true;

  const btn = $('#submitBtn');
  btn.dataset.busy = '1'; btn.disabled = true; btn.textContent = t('sending');
  const items = cart.map(toItem);
  try {
    let res;
    if (DEMO) { await new Promise((r) => setTimeout(r, 600)); res = { orderId: Math.floor(100 + Math.random() * 900) }; console.info('DEMO order', { ...data, items, lang }); }
    else res = await api('/api/order', { ...data, items, lang });
    profile = { name: data.name, phone: data.phone, address: data.address };
    store.set('profile', profile);
    lastItems = items.filter(notBonus); store.set('lastItems', lastItems);
    cart = []; saveCart();
    f.when.value = ''; f.comment.value = '';
    try { tg?.HapticFeedback?.notificationOccurred('success'); } catch {}
    closeSheet();
    $('#doneText').textContent = t('doneText', { id: res.orderId }) + (res.bonusDropped ? ' ' + t('bonusDropped') : '');
    $('#doneDemo').hidden = !DEMO;
    renderProducts(); renderCartBar(); renderHello();
    openSheet($('#done'));
  } catch (err) {
    console.error(err);
    $('#formErr').textContent = t('error'); $('#formErr').hidden = false;
    try { tg?.HapticFeedback?.notificationOccurred('error'); } catch {}
  } finally {
    delete btn.dataset.busy; renderLines();
  }
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('button,[data-close]');
  if (!el) return;
  if (el.dataset.lang) { lang = el.dataset.lang; store.set('lang', lang); renderAll(); return; }
  if (el.dataset.v && el.dataset.p) { selected[el.dataset.p] = el.dataset.v; haptic('soft'); renderProducts(); return; }
  if (el.dataset.opt) { optSel[el.dataset.opt] = !optSel[el.dataset.opt]; haptic('soft'); renderProducts(); return; }
  if (el.dataset.add) {
    const p = prod(el.dataset.add);
    const [v, opt] = cardSel(p);
    const first = !findLine(p.id, v, opt);
    addToCart(p.id, v, 1, opt);
    haptic(); if (first) toast('✓ ' + t('added'));
    renderProducts(); renderCartBar(); renderLines(); return;
  }
  if (el.dataset.dec) {
    const p = prod(el.dataset.dec);
    const [v, opt] = cardSel(p);
    const i = cart.indexOf(findLine(p.id, v, opt));
    if (i >= 0) changeQty(i, -1);
    haptic('soft');
    renderProducts(); renderCartBar(); renderLines(); return;
  }
  if (el.dataset.q !== undefined) { changeQty(+el.dataset.q, +el.dataset.d); haptic('soft'); renderLines(); renderCartBar(); renderProducts(); return; }
  if (el.hasAttribute('data-close')) { closeSheet(); return; }
});
$('#openCart').addEventListener('click', openCart);
$('#form').addEventListener('submit', submitOrder);
$('#form').addEventListener('input', (e) => e.target.classList.remove('bad'));
$('#repeatBtn').addEventListener('click', () => { lastItems.forEach((l) => addToCart(l.id, l.v, l.qty, l.opt)); renderAll(); openCart(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

// ---------- Telegram Mini App setup ----------
if (inTg) {
  tg.ready();
  tg.expand();
  try { tg.setHeaderColor('#fcf5ea'); tg.setBackgroundColor('#fcf5ea'); } catch {}
  tg.BackButton.onClick(closeSheet);
  if (tg.isVersionAtLeast?.('6.9') && tg.requestContact) {
    const b = $('#tgPhone'); b.hidden = false;
    b.addEventListener('click', () => tg.requestContact((ok, resp) => {
      const ph = resp?.responseUnsafe?.contact?.phone_number;
      if (ok && ph) { $('#form').phone.value = ph.startsWith('+') ? ph : '+' + ph; $('#form').phone.classList.remove('bad'); }
    }));
  }
} else if (CONFIG.BOT_USERNAME) {
  const a = $('#tgCta'); a.hidden = false;
  a.href = `https://t.me/${CONFIG.BOT_USERNAME}${CONFIG.MINI_APP_NAME ? '/' + CONFIG.MINI_APP_NAME : ''}`;
}
if (CONFIG.CHANNEL_URL) { const c = $('#channelLink'); c.href = CONFIG.CHANNEL_URL; c.hidden = false; }

renderAll();
loadMe();
setTimeout(maybeStartBalloon, 2500); // appears a bit later, not right in the face
