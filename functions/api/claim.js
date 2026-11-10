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

/* POST /api/claim – after payment, verifies it with Razorpay and returns the unlock code(s) for the device that placed the order.
   Safe to call again. With mail:true (first call only) it also emails the codes + a restore link. */
export async function onRequestPost({ request, env }) {
  try {
    let b; try { b = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const v = await verifyPay(env, String(b.order_id || ''), String(b.payment_id || '')); if (v.err) return v.err;
    const codes = [], names = [];
    for (const ix of v.ixs) { codes.push(await makeCode(v.n.book, v.bk[ix].k, v.n.dev, ix)); names.push(v.bk[ix].n || ('Product ' + ix)); }
    if (!codes.length) return json({ error: 'No products found for this payment' }, 400);
    let mailed = false;
    if (b.mail) {
      const to = v.n.email || v.pay.email, page = /^\/([a-z0-9_-]+\/)*([a-z0-9_-]+\.html)?$/i.test(String(b.page || '')) ? b.page : '/';
      const link = new URL(request.url).origin + page + '?o=' + v.o.id + '&p=' + v.pay.id;
      mailed = await sendMail(env, to, 'Your unlock code – ' + (v.bk.title || 'your purchase'),
        '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#111"><h2>Thank you for your purchase! 🎉</h2><p>Your tests are already unlocked in the browser where you paid. Keep this email – it lets you unlock on another phone or browser too.</p>' +
        '<p><b>Your code' + (codes.length > 1 ? 's' : '') + '</b> (for the device you paid from):</p><table cellpadding="6" style="border-collapse:collapse">' + codes.map((c, i) => '<tr><td style="border:1px solid #ddd">' + esc(names[i]) + '</td><td style="border:1px solid #ddd;font-family:monospace;font-weight:bold">' + esc(c) + '</td></tr>').join('') + '</table>' +
        '<p style="margin-top:18px"><b>Using Chrome / Safari instead of the Facebook or Instagram app?</b> Open this link in your normal browser to unlock there:</p><p><a href="' + esc(link) + '" style="background:#2f5bea;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">Unlock in this browser</a></p>' +
        '<p style="color:#666;font-size:13px">The link works on up to 3 devices/browsers. Please don’t share it. Payment ID: ' + esc(v.pay.id) + '</p></div>');
    }
    return json({ codes, mailed });
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
}
