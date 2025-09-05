const COOKIE = 'trial_ok';

function hasOkCookie(h: Headers) {
  const c = h.get('cookie') || '';
  return c.split(';').some(p => p.trim().startsWith(`${COOKIE}=1`));
}

function setOkCookieHeaders(pathname: string) {
  const maxAge = 1800; // 30 min
  return {
    'Set-Cookie': `${COOKIE}=1; Max-Age=${maxAge}; Path=/trial; Secure; SameSite=Lax`,
    'Location': pathname
  };
}

export default async (req: Request, ctx: any) => {
  const url = new URL(req.url);
  if (!url.pathname.startsWith('/trial/')) return await ctx.next();

  if (hasOkCookie(req.headers)) return await ctx.next();

  if (url.searchParams.get('ok') === '1') {
    return new Response(null, { status: 302, headers: setOkCookieHeaders(url.pathname) });
  }

  const gate = `<!doctype html><meta charset="utf-8"><title>Trial Notice</title>
  <style>
    body{font-family:system-ui;margin:3rem;line-height:1.5}
    .card{max-width:640px;padding:1.25rem;border:1px solid #ddd;border-radius:12px}
    a.button{display:inline-block;margin-top:1rem;padding:.6rem 1rem;border:1px solid #444;border-radius:10px;text-decoration:none;color:#111}
  </style>
  <div class="card">
    <h1>Trial / Demo Area</h1>
    <p>You’re entering a demonstration area. Data shown here is synthetic and for testing only.</p>
    <p>By continuing, you agree not to scrape, probe, or attempt to bypass controls.</p>
    <a class="button" href="?ok=1">I agree — continue</a>
  </div>`;
  return new Response(gate, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, max-age=0'
    }
  });
};
