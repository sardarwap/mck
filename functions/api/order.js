const AL = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function norm(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function fmt(s) { return s.replace(/(.{4})(?=.)/g, '$1-'); }
function toB32(by, n) { let o = '', bits = 0, v = 0; for (let i = 0; i < by.length && o.length < n; i++) { v = (v << 8) | by[i]; bits += 8; while (bits >= 5 && o.length < n) { o += AL[(v >>> (bits - 5)) & 31]; bits -= 5; } v &= (1 << bits) - 1; } return o; }
function mix(a, b, sg) { let o = ''; for (let i = 0; i < 12; i++) o += AL[(AL.indexOf(a[i]) + sg * AL.indexOf(b[i]) + 64) % 32]; return o; }
async function sha(s) { return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }
async function makeCode(bookId, bk, dev, ix) { const c = mix(bk, toB32(await sha(bookId + (ix ? '#' + ix : '') + ':' + norm(dev)), 12), 1); return ix ? AL[ix] + '-' + fmt(c) : fmt(c); }
function json(o, st) { return new Response(JSON.stringify(o), { status: st || 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }); }
function getBooks(env) { try { return JSON.parse(env.BOOKS); } catch (e) { return null; } }
async function rz(env, path, method, body) {
  const r = await fetch('https://api.razorpay.com/v1' + path, { method, headers: { authorization: 'Basic ' + btoa(env.RZP_KEY_ID + ':' + env.RZP_KEY_SECRET), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.description) || ('Razorpay error ' + r.status));
  return j;
}
async function verifyPay(env, oid, pid) {
  if (!/^order_[A-Za-z0-9]+$/.test(oid) || !/^pay_[A-Za-z0-9]+$/.test(pid)) return { err: json({ error: 'Invalid payment reference' }, 400) };
  const B = getBooks(env); if (!B) return { err: json({ error: 'Not configured' }, 500) };
  let pay = await rz(env, '/payments/' + pid, 'GET');
  if (pay.order_id !== oid) return { err: json({ error: 'Payment does not match order' }, 403) };
  if (pay.status === 'authorized') pay = await rz(env, '/payments/' + pid + '/capture', 'POST', { amount: pay.amount, currency: pay.currency });
  if (pay.status !== 'captured') return { err: json({ error: 'Payment is not completed yet (' + pay.status + ')' }, 402) };
  const o = await rz(env, '/orders/' + oid, 'GET');
  if (o.amount !== pay.amount) return { err: json({ error: 'Amount mismatch' }, 403) };
  const n = o.notes || {}, bk = B[n.book]; if (!bk) return { err: json({ error: 'Unknown book' }, 400) };
  return { pay, o, n, bk, ixs: String(n.ix || '').split(',').map(Number).filter(i => bk[i]) };
}
async function sendMail(env, to, subject, html) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM || !to) return false;
  try { const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html }) }); return r.ok; } catch (e) { return false; }
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* POST /api/order  – creates a Razorpay order. Prices come from the BOOKS secret, never from the browser. */
export async function onRequestPost({ request, env }) {
  try {
    let b; try { b = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const B = getBooks(env);
    if (!B || !env.RZP_KEY_ID || !env.RZP_KEY_SECRET) return json({ error: 'Online payment is not set up yet. Please use UPI and WhatsApp us.' }, 500);
    const bk = B[b.book]; if (!bk) return json({ error: 'Unknown book' }, 400);
    const dev = norm(b.dev);
    if (dev.length !== 8 || [...dev].some(c => AL.indexOf(c) < 0)) return json({ error: 'Invalid device ID' }, 400);
    const email = String(b.email || '').trim().slice(0, 120);
    if (email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) return json({ error: 'Please enter a valid email address' }, 400);
    const ixs = [...new Set((Array.isArray(b.ix) ? b.ix : [b.ix]).map(Number))];
    if (!ixs.length || ixs.length > 32 || ixs.some(i => !Number.isInteger(i) || !bk[i])) return json({ error: 'Unknown product' }, 400);
    const amount = ixs.reduce((a, i) => a + Math.round(bk[i].p * 100), 0);
    if (amount < 100) return json({ error: 'Invalid amount' }, 400);
    const o = await rz(env, '/orders', 'POST', { amount, currency: 'INR', receipt: ('qb' + Date.now()).slice(0, 40), notes: { book: String(b.book), ix: ixs.join(','), dev, email } });
    return json({ key: env.RZP_KEY_ID, order_id: o.id, amount });
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
}
