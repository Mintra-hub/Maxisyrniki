// Local test of the worker logic without Cloudflare: node worker/test.mjs
import worker, { verifyInitData } from './src/index.js';
import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';

const BOT_TOKEN = '123456:TEST-TOKEN';
const env = { BOT_TOKEN, ORDERS_CHAT_ID: '-100500', ALLOWED_ORIGIN: 'https://shop.example', NOTIFY_LANG: 'ru' };

// fake D1
const db = { customers: new Map(), orders: [] };
env.DB = {
  prepare(sql) {
    let args = [];
    const stmt = {
      bind: (...a) => { args = a; return stmt; },
      async first() {
        if (sql.includes('bonus = 1')) return { n: db.orders.filter((o) => o.bonus === 1 && (o.phone_norm === args[0] || (args[2] && o.tg_id === args[2]))).length };
        if (sql.startsWith('SELECT COUNT')) return { n: db.orders.filter((o) => o.ip === args[0] || (args[2] && o.tg_id === args[2])).length };
        if (sql.startsWith('INSERT INTO orders')) { const id = db.orders.length + 1; db.orders.push({ id, tg_id: args[0], items: args[6], total: args[7], ip: args[9], phone_norm: args[10], bonus: args[11] }); return { id }; }
        if (sql.startsWith('SELECT name')) return db.customers.get(args[0]) || null;
        if (sql.startsWith('SELECT items')) return [...db.orders].reverse().find((o) => o.tg_id === args[0]) || null;
        throw new Error('unexpected sql ' + sql);
      },
      async run() { db.customers.set(args[0], { name: args[1], phone: args[2], address: args[3] }); },
    };
    return stmt;
  },
};

// fake Telegram API
const sent = [];
globalThis.fetch = async (url, opts) => { sent.push({ url, body: JSON.parse(opts.body) }); return new Response('{"ok":true}'); };

function makeInitData(user, token = BOT_TOKEN, authDate = Math.floor(Date.now() / 1000)) {
  const p = new URLSearchParams({ auth_date: String(authDate), query_id: 'AAA', user: JSON.stringify(user) });
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  p.set('hash', createHmac('sha256', secret).update(dcs).digest('hex'));
  return p.toString();
}
const call = (path, { body, init, method, ip = '1.2.3.4' } = {}) => worker.fetch(new Request('https://w.dev' + path, {
  method: method || (body ? 'POST' : 'GET'),
  headers: { Origin: 'https://shop.example', 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...(init ? { 'X-Tg-Init-Data': init } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}), env);

const user = { id: 42, first_name: 'Anna', username: 'anna_test', language_code: 'ru' };
const good = makeInitData(user);

// 1. auth validation
assert.equal((await verifyInitData(good, BOT_TOKEN)).id, 42);
assert.equal(await verifyInitData(makeInitData(user, '999:OTHER'), BOT_TOKEN), null, 'wrong token rejected');
assert.equal(await verifyInitData(good.replace('Anna', 'Evil'), BOT_TOKEN), null, 'tampered data rejected');
assert.equal(await verifyInitData(makeInitData(user, BOT_TOKEN, 1000), BOT_TOKEN), null, 'old data rejected');

// 2. CORS preflight
let r = await call('/api/order', { method: 'OPTIONS' });
assert.equal(r.status, 204);
assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://shop.example');

// 3. guest order, price is recalculated on server (client "price" ignored)
r = await call('/api/order', { body: { name: 'Bob', phone: '+66 81 234 5678', address: 'Soi 5 <b>', lang: 'en', items: [{ id: 'syrniki', v: 'mango', qty: 2, price: 1 }, { id: 'syrniki', v: 'grape', opt: true, qty: 1 }, { id: 'sourcream', qty: 1 }] } });
let j = await r.json();
assert.equal(r.status, 200, JSON.stringify(j));
assert.equal(j.total, 720); // 2x200 + 1x(200+20 opt) + 100
const msg = sent.at(-1).body;
assert.equal(msg.chat_id, '-100500');
assert.ok(msg.text.includes('Сырники — Манго ❄️ замороженные × 2 = 400 ฿'), msg.text);
  assert.ok(msg.text.includes('Сырники — Виноград 🔥 <b>ПРИГОТОВИТЬ</b> × 1 = 220 ฿'), msg.text);
assert.ok(msg.text.includes('Soi 5 &lt;b&gt;'), 'html escaped');
console.log('--- notification preview ---\n' + msg.text + '\n----------------------------');

// 4. bad input
assert.equal((await call('/api/order', { body: { name: 'X', phone: '+66812345678', address: 'a', items: [{ id: 'jam', v: 'kiwi', opt: true, qty: 1 }] } })).status, 400, 'option only where product has one');
assert.equal((await call('/api/order', { body: { name: 'X', phone: '+661', address: 'a', items: [{ id: 'syrniki', qty: 1 }] } })).status, 400, 'short phone');
assert.equal((await call('/api/order', { body: { name: 'X', phone: '+66812345678', address: 'a', items: [{ id: 'syrniki', v: 'pizza', qty: 1 }] } })).status, 400, 'bad variant');
assert.equal((await call('/api/order', { body: { name: 'X', phone: '+66812345678', address: 'a', items: [{ id: 'jam', v: 'kiwi', qty: 999 }] } })).status, 400, 'qty limit');
assert.equal((await call('/api/order', { body: { name: 'X', phone: '+66812345678', address: 'a', items: [{ id: 'jam', v: 'kiwi', qty: 1 }] }, init: good.replace('Anna', 'Evil') })).status, 401, 'forged auth');

// 5. Telegram user order -> profile saved, confirmation sent, /api/me works
sent.length = 0;
r = await call('/api/order', { init: good, body: { name: 'Anna', phone: '+66812345678', address: 'https://maps.app.goo.gl/abc', lang: 'ru', items: [{ id: 'jam', v: 'kiwi', qty: 1 }] } });
assert.equal(r.status, 200);
assert.equal(sent.length, 2, 'group + customer message');
assert.equal(sent[1].body.chat_id, 42);
assert.deepEqual(sent[0].body.reply_markup.inline_keyboard[0].map((b) => b.url), ['https://t.me/anna_test', 'https://maps.app.goo.gl/abc']);
r = await call('/api/me', { init: good });
j = await r.json();
assert.equal(j.profile.phone, '+66812345678');
assert.deepEqual(j.lastItems, [{ id: 'jam', v: 'kiwi', qty: 1 }]);
assert.equal((await call('/api/me')).status, 401, 'me requires auth');

// 6. rate limit for guests (5/hour per IP)
for (let i = 0; i < 4; i++) await call('/api/order', { body: { name: 'B', phone: '+66812345678', address: 'a', items: [{ id: 'cottage', qty: 1 }] } });
assert.equal((await call('/api/order', { body: { name: 'B', phone: '+66812345678', address: 'a', items: [{ id: 'cottage', qty: 1 }] } })).status, 429);

// 6b. yogurt option: no fruits, same price
sent.length = 0;
r = await call('/api/order', { ip: '7.7.7.7', body: { name: 'Y', phone: '+66812345670', address: 'a', items: [{ id: 'yogurt', qty: 1 }, { id: 'yogurt', opt: true, qty: 2 }] } });
j = await r.json();
assert.equal(j.total, 300, 'no-fruit yogurt costs the same');
assert.ok(sent[0].body.text.includes('Греческий йогурт 🍓 150 г йогурта + 50 г фруктов × 1 = 100 ฿'), sent[0].body.text);
assert.ok(sent[0].body.text.includes('Греческий йогурт 🥣 <b>БЕЗ ФРУКТОВ, 200 Г ЙОГУРТА</b> × 2 = 200 ฿'), sent[0].body.text);
console.log('--- yogurt lines ---\n' + sent[0].body.text.split('\n').filter((l) => l.includes('йогурт')).join('\n'));

// 7. balloon gift: free, once per phone, never alone
const gift = (phone, ip, extra = [{ id: 'cottage', qty: 1 }]) => call('/api/order', { ip, body: { name: 'G', phone, address: 'a', items: [...extra, { id: 'bonus', qty: 1 }] } });
assert.equal((await gift('+66 90 000 0001', '9.9.9.1', [])).status, 400, 'gift alone is rejected');
assert.equal((await call('/api/order', { ip: '9.9.9.1', body: { name: 'G', phone: '+66900000001', address: 'a', items: [{ id: 'cottage', qty: 1 }, { id: 'bonus', qty: 2 }] } })).status, 400, 'only one gift');
sent.length = 0;
r = await gift('+66 90 000 0001', '9.9.9.2');
j = await r.json();
assert.equal(r.status, 200); assert.equal(j.total, 200); assert.equal(j.bonusDropped, false);
assert.ok(sent[0].body.text.includes('🎁 <b>ПОДАРОК</b>: Сметана-топинг в соуснике = 0 ฿'), sent[0].body.text);
console.log('--- gift notification ---\n' + sent[0].body.text);
sent.length = 0;
r = await gift('090-000-0001', '9.9.9.3');   // same number, other format
j = await r.json();
assert.equal(j.bonusDropped, true, 'second gift for same phone is dropped');
assert.ok(sent[0].body.text.includes('⚠️ Клиент выиграл подарок'), sent[0].body.text);
assert.ok(!sent[0].body.text.includes('ПОДАРОК</b>:'));

console.log('All worker tests passed ✔');
