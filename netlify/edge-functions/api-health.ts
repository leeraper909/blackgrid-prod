const RL_COOKIE = 'rl';
const LIMIT  = Number(Deno.env.get('RL_LIMIT')  || 60);
const WINDOW = Number(Deno.env.get('RL_WINDOW') || 60);
const SECRET = Deno.env.get('RL_SECRET') || 'dev-secret';
const ALLOW  = (Deno.env.get('ALLOW_IPS') || '')
  .split(',')
  .map(s=>s.trim())
  .filter(Boolean);

function clientIp(req: Request) {
  const h = req.headers;
  return h.get('x-nf-client-connection-ip')
      || (h.get('x-forwarded-for')||'').split(',')[0].trim()
      || h.get('x-real-ip')
      || '';
}

function getCookie(req: Request) {
  const c = req.headers.get('cookie') || '';
  const m = c.match(new RegExp(`${RL_COOKIE}=([^;]+)`));
  return m ? m[1] : '';
}

async function hmac(v: string) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(v));
  return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

export default async (req: Request, ctx: any) => {
  // Allow-list bypass
  const ip = clientIp(req);
  if (ip && ALLOW.includes(ip)) {
    const url = new URL('/.netlify/functions/healthcheck', req.url);
    const r = await fetch(url.toString(), { headers: req.headers });
    const h = new Headers(r.headers);
    h.set('x-api-proxy', '1');
    h.set('x-rl-bypass', 'allow_ip');
    return new Response(r.body, { status: r.status, headers: h });
  }

  // Sliding-window cookie counter
  const now = Math.floor(Date.now()/1000);
  let windowStart = now - (now % WINDOW);
  let count = 0;

  const v = getCookie(req); // window.count.sig
  if (v) {
    const [ws, c, sig] = v.split('.');
    if (ws && c && sig && await hmac(`${ws}.${c}`) === sig) {
      const parsedWs = Number(ws);
      if (parsedWs >= windowStart) { windowStart = parsedWs; count = Number(c) || 0; }
    }
  }

  if (now - windowStart >= WINDOW) { windowStart = now - (now % WINDOW); count = 0; }
  count += 1;

  // Over limit
  if (count > LIMIT) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-ratelimit-limit': String(LIMIT),
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(windowStart + WINDOW),
        'retry-after': String(Math.max(1, (windowStart + WINDOW) - now)),
        'x-api-proxy': '1',
        'x-rl-debug': '1'
      }
    });
  }

  // Update cookie for this window
  const sig = await hmac(`${windowStart}.${count}`);
  const cookie = `${RL_COOKIE}=${windowStart}.${count}.${sig}; Max-Age=${WINDOW+5}; Path=/api; Secure; SameSite=Lax; HttpOnly`;

  // Proxy to the function
  const url = new URL('/.netlify/functions/healthcheck', req.url);
  const r = await fetch(url.toString(), { headers: req.headers });
  const h = new Headers(r.headers);
  h.append('Set-Cookie', cookie);
  h.set('x-ratelimit-limit', String(LIMIT));
  h.set('x-ratelimit-remaining', String(Math.max(0, LIMIT - count)));
  h.set('x-ratelimit-reset', String(windowStart + WINDOW));
  h.set('x-api-proxy','1');
  h.set('x-rl-debug','1');
  return new Response(r.body, { status: r.status, headers: h });
};
