export default async (req: Request, ctx: any) => {
  const url = new URL(req.url);
  const p = url.pathname;

  // 1) Block JSON/CSV exports inside /trial/*
  if (/\.(json|csv)(\?.*)?$/i.test(p)) {
    return new Response('export disabled in demo', {
      status: 403,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  }

  // 2) Click-through gate
  const ok = req.headers.get('cookie')?.includes('trial_ok=1') || url.searchParams.get('ok') === '1';
  if (ok) {
    const res = await ctx.next();
    const h = new Headers(res.headers);
    // set cookie when arriving with ?ok=1
    if (url.searchParams.get('ok') === '1') {
      h.append('set-cookie', 'trial_ok=1; Path=/trial; Max-Age=86400; Secure; SameSite=Lax');
      h.set('location', url.origin + '/trial/'); // bounce back to clean URL
      return new Response(null, { status: 302, headers: h });
    }
    return new Response(res.body, { status: res.status, headers: h });
  }

  // 3) Gate page
  const gate = `<!doctype html><meta charset="utf-8">
    <meta name="robots" content="noindex">
    <title>Demo Gate</title>
    <style>
      body{font:16px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:2rem;background:#f6f7f9}
      .card{max-width:640px;margin:auto;background:#fff;padding:1.25rem 1.5rem;border:1px solid #ddd;border-radius:12px}
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
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store, max-age=0' }
  });
};
