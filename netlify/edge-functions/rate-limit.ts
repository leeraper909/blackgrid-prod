// Config via env
const LIMIT_PER_MIN   = Number(Deno.env.get('RL_LIMIT') || 60);
const WINDOW_SECONDS  = Number(Deno.env.get('RL_WINDOW') || 60);
const RL_COOKIE       = Deno.env.get('RL_COOKIE') || 'rl';
const RL_SECRET       = Deno.env.get('RL_SECRET') || 'change-me';
const ALLOW_IPS_RAW   = (Deno.env.get('ALLOW_IPS') || '').trim(); // comma-separated exact IPs

const enc = new TextEncoder();

function b64url(u8: Uint8Array) {
  let s = btoa(String.fromCharCode(...u8));
  return s.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function hmac(data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(RL_SECRET), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return b64url(new Uint8Array(sig));
}

function parseCookies(h: Headers) {
  const out: Record<string,string> = {};
  const c = h.get('cookie') || '';
  for (const part of c.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (!k) continue;
    out[k] = rest.join('=');
  }
  return out;
}

function ipFrom(req: Request, ctx: any): string {
  return (ctx.ip || req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}

function inAllowList(ip: string): boolean {
  if (!ALLOW_IPS_RAW) return false;
  return ALLOW_IPS_RAW.split(',').map(s => s.trim()).filter(Boolean).includes(ip);
}

export default async (req: Request, ctx: any) => {
  const url = new URL(req.url);
  if (!url.pathname.startsWith('/api/')) return await ctx.next();

  const ip = ipFrom(req, ctx);
  if (inAllowList(ip)) return await ctx.next();

  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % WINDOW_SECONDS);
  const cookies = parseCookies(req.headers);
  const current = cookies[RL_COOKIE];

  let count = 0;
  let expectedSig = '';
  const payload = (v: number) => `${ip}.${windowStart}.${v}`;

  if (current) {
    const [startStr, countStr, sig] = current.split('.');
    const start = Number(startStr);
    const c     = Number(countStr);
    expectedSig = await hmac(`${ip}.${start}.${c}`);
    if (sig === expectedSig && start === windowStart) {
      count = c;
    } // else: invalid or stale -> reset
  }

  count += 1;

  if (count > LIMIT_PER_MIN) {
    const retryAfter = WINDOW_SECONDS - (now - windowStart);
    return new Response(JSON.stringify({
      error: 'rate_limited',
      limit: LIMIT_PER_MIN,
      retry_after: retryAfter
    }), {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store, max-age=0',
        'retry-after': String(retryAfter),
        'x-ratelimit-limit': String(LIMIT_PER_MIN),
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(windowStart + WINDOW_SECONDS)
      }
    });
  }

  const sig = await hmac(payload(count));
  const cookieVal = `${windowStart}.${count}.${sig}`;
  const maxAge = WINDOW_SECONDS + 5;

  const res = await ctx.next();
  const headers = new Headers(res.headers);
  headers.set('Set-Cookie', `${RL_COOKIE}=${cookieVal}; Max-Age=${maxAge}; Path=/api; Secure; SameSite=Lax; HttpOnly`);
  headers.set('x-ratelimit-limit', String(LIMIT_PER_MIN));
  headers.set('x-ratelimit-remaining', String(Math.max(0, LIMIT_PER_MIN - count)));
  headers.set('x-ratelimit-reset', String(windowStart + WINDOW_SECONDS));

  return new Response(res.body, { status: res.status, headers });
};
