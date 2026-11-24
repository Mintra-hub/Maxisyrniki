// Maxisyrniki orders API (Cloudflare Worker)
//   GET  /api/me     -> saved profile + last order of a Telegram user
//   POST /api/order  -> validates order, recalculates prices, saves to D1,
//                       sends notification to the private orders chat
// Secrets / vars (see wrangler.toml and README):
//   BOT_TOKEN (secret), ORDERS_CHAT_ID, ALLOWED_ORIGIN, NOTIFY_LANG
import { PRODUCTS, MAX_QTY } from '../../docs/catalog.js';

const LABELS = {
  ru: { bonus: 'ПОДАРОК', bonusDropped: 'Клиент выиграл подарок, но уже получал его раньше: в заказ не добавлен', order: 'Новый заказ', total: 'Итого', when: 'Когда', comment: 'Комментарий', guest: 'с сайта (гость)', tg: 'через Telegram', write: '💬 Написать клиенту', map: '🗺 Карта', thanks: '✅ Спасибо! Заказ #{id} принят, скоро свяжемся для подтверждения.' },
  en: { bonus: 'GIFT', bonusDropped: 'Customer won the gift but already received it before: not added', order: 'New order', total: 'Total', when: 'When', comment: 'Comment', guest: 'website (guest)', tg: 'via Telegram', write: '💬 Message customer', map: '🗺 Map', thanks: '✅ Thank you! Order #{id} received, we will contact you soon.' },
  th: { bonus: 'ของขวัญ', bonusDropped: 'ลูกค้าเคยได้รับของขวัญแล้ว จึงไม่ได้เพิ่มในคำสั่งซื้อนี้', order: 'คำสั่งซื้อใหม่', total: 'รวม', when: 'เวลา', comment: 'หมายเหตุ', guest: 'จากเว็บไซต์ (ไม่ได้ล็อกอิน)', tg: 'ผ่าน Telegram', write: '💬 ทักลูกค้า', map: '🗺 แผนที่', thanks: '✅ ขอบคุณค่ะ! ได้รับคำสั่งซื้อ #{id} แล้ว จะติดต่อกลับเร็วๆ นี้ค่ะ' },
};

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    try {
      if (url.pathname === '/api/me' && req.method === 'GET') return json(await me(req, env), 200, cors);
      if (url.pathname === '/api/order' && req.method === 'POST') return json(await order(req, env), 200, cors);
      return json({ ok: false, error: 'not_found' }, 404, cors);
    } catch (e) {
      if (e instanceof HttpError) return json({ ok: false, error: e.message }, e.status, cors);
      console.error(e);
      return json({ ok: false, error: 'server_error' }, 500, cors);
    }
  },
};

// ---------- handlers ----------
async function me(req, env) {
  const user = await verifyInitData(req.headers.get('X-Tg-Init-Data'), env.BOT_TOKEN);
  if (!user) throw new HttpError(401, 'unauthorized');
  const profile = await env.DB.prepare('SELECT name, phone, address FROM customers WHERE tg_id = ?').bind(user.id).first();
  const last = await env.DB.prepare('SELECT items FROM orders WHERE tg_id = ? ORDER BY id DESC LIMIT 1').bind(user.id).first();
  return { ok: true, profile: profile || null, lastItems: last ? JSON.parse(last.items).map(({ id, v, opt, qty }) => ({ id, ...(v ? { v } : {}), ...(opt ? { opt: true } : {}), qty })) : [] };
}

async function order(req, env) {
  const initData = req.headers.get('X-Tg-Init-Data');
  const user = initData ? await verifyInitData(initData, env.BOT_TOKEN) : null;
  if (initData && !user) throw new HttpError(401, 'unauthorized');

  let body;
  try { body = await req.json(); } catch { throw new HttpError(400, 'bad_json'); }
  const name = clean(body.name, 80), phone = clean(body.phone, 30), address = clean(body.address, 400);
  const when = clean(body.when, 80), comment = clean(body.comment, 300);
  const lang = ['en', 'ru', 'th'].includes(body.lang) ? body.lang : 'en';
  if (!name || !phone || !address) throw new HttpError(400, 'missing_fields');
  if (!/^[+\d][\d\s()-]{5,}$/.test(phone)) throw new HttpError(400, 'bad_phone');

  // prices are taken from the catalog, never from the browser
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 30) throw new HttpError(400, 'bad_items');
  let items = body.items.map((it) => {
    const p = PRODUCTS.find((x) => x.id === it?.id);
    const qty = Number(it?.qty);
    if (!p || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new HttpError(400, 'bad_items');
    const v = p.variants ? p.variants.find((x) => x.id === it.v) : null;
    if (p.variants && !v) throw new HttpError(400, 'bad_items');
    if (it.opt !== undefined && typeof it.opt !== 'boolean') throw new HttpError(400, 'bad_items');
    if (it.opt && !p.option) throw new HttpError(400, 'bad_items');
    const opt = !!it.opt;
    return { id: p.id, v: v?.id, opt, qty, price: p.price + (opt ? p.option.price : 0), p, variant: v };
  });
  // balloon gift: max one, only together with a paid item, once per customer
  const bonusLines = items.filter((i) => i.p.bonus);
  if (bonusLines.length > 1 || bonusLines.some((i) => i.qty !== 1)) throw new HttpError(400, 'bad_items');
  if (!items.some((i) => !i.p.bonus)) throw new HttpError(400, 'bonus_only');
  const phoneNorm = phone.replace(/\D/g, '').slice(-9);
  let bonusDropped = false;
  if (bonusLines.length) {
    const used = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM orders WHERE bonus = 1 AND (phone_norm = ? OR (? IS NOT NULL AND tg_id = ?))'
    ).bind(phoneNorm, user?.id ?? null, user?.id ?? null).first();
    if (used?.n) { bonusDropped = true; items = items.filter((i) => !i.p.bonus); }
  }
  const hasBonus = items.some((i) => i.p.bonus);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  // simple anti-spam: max orders per hour per customer / IP
  const ip = req.headers.get('CF-Connecting-IP') || '';
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM orders WHERE created_at > datetime('now', '-1 hour') AND (ip = ? OR (? IS NOT NULL AND tg_id = ?))"
  ).bind(ip, user?.id ?? null, user?.id ?? null).first();
  if ((recent?.n ?? 0) >= (user ? 10 : 5)) throw new HttpError(429, 'too_many_orders');

  const stored = JSON.stringify(items.map(({ id, v, opt, qty, price }) => ({ id, v, ...(opt ? { opt } : {}), qty, price })));
  const res = await env.DB.prepare(
    'INSERT INTO orders (tg_id, name, phone, address, when_text, comment, items, total, lang, ip, phone_norm, bonus) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id'
  ).bind(user?.id ?? null, name, phone, address, when, comment, stored, total, lang, ip, phoneNorm, hasBonus ? 1 : 0).first();
  const orderId = res.id;

  if (user) {
    await env.DB.prepare(
      `INSERT INTO customers (tg_id, name, phone, address, username, updated_at) VALUES (?,?,?,?,?,datetime('now'))
       ON CONFLICT(tg_id) DO UPDATE SET name=excluded.name, phone=excluded.phone, address=excluded.address, username=excluded.username, updated_at=excluded.updated_at`
    ).bind(user.id, name, phone, address, user.username || null).run();
  }

  // notify the private orders chat
  const L = LABELS[env.NOTIFY_LANG] || LABELS.ru;
  const nl = env.NOTIFY_LANG in LABELS ? env.NOTIFY_LANG : 'ru';
  const optLabel = (i) => (!i.p.option ? '' : i.opt ? ` ${i.p.option.icon} <b>${h(i.p.option.short[nl]).toUpperCase()}</b>` : ` ${i.p.option.offIcon} ${h(i.p.option.off[nl])}`);
  const lines = items.map((i) => i.p.bonus ? `🎁 <b>${L.bonus}</b>: ${h(i.p.desc[nl])} = 0 ฿` : `• ${h(i.p.name[nl])}${i.variant ? ' — ' + h(i.variant.name[nl]) : ''}${optLabel(i)} × ${i.qty} = ${i.price * i.qty} ฿`);
  const who = user
    ? `${L.tg}${user.username ? ' · @' + h(user.username) : ''}`
    : L.guest;
  const text = [
    `🛒 <b>${L.order} #${orderId}</b>`,
    '',
    ...lines,
    bonusDropped && `⚠️ ${L.bonusDropped}`,
    `💰 <b>${L.total}: ${total} ฿</b>`,
    '',
    `👤 ${h(name)}`,
    `📞 ${h(phone)}`,
    `📍 ${h(address)}`,
    when && `🕒 ${L.when}: ${h(when)}`,
    comment && `💬 ${L.comment}: ${h(comment)}`,
    `🌐 ${who} · ${lang.toUpperCase()}`,
  ].filter((x) => x !== '' && x != null && x !== false).join('\n').replace(/\n(?=💰|👤)/g, '\n\n');

  const buttons = [];
  if (user?.username) buttons.push({ text: L.write, url: `https://t.me/${user.username}` });
  const mapUrl = /^https?:\/\//i.test(address) ? address : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  buttons.push({ text: L.map, url: mapUrl });

  const sent = await tgCall(env, 'sendMessage', {
    chat_id: env.ORDERS_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [buttons] },
  });
  if (!sent.ok) console.error('notify failed', sent.description);

  // confirmation to the customer (works if they have started the bot)
  if (user) {
    await tgCall(env, 'sendMessage', { chat_id: user.id, text: (LABELS[lang] || LABELS.en).thanks.replace('{id}', orderId) }).catch(() => {});
  }

  return { ok: true, orderId, total, bonusDropped };
}

// ---------- Telegram Mini App auth ----------
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export async function verifyInitData(initData, botToken, maxAgeSec = 86400 * 7) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheck = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const enc = new TextEncoder();
  const secret = await hmac(enc.encode('WebAppData'), enc.encode(botToken));
  const sig = toHex(await hmac(secret, enc.encode(dataCheck)));
  if (!safeEqual(sig, hash)) return null;
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null');
    return user && Number.isInteger(user.id) ? user : null;
  } catch { return null; }
}

async function hmac(keyBytes, msgBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, msgBytes));
}
const toHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------- utils ----------
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const clean = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, max) : '');
const h = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function tgCall(env, method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  return r.json().catch(() => ({ ok: false }));
}

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || allowed.includes('*');
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] || '',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Tg-Init-Data',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
