exports.handler = async () => {
  const host = process.env.SITE_URL || '';
  async function head(p){ try{ const r = await fetch(host+p); return r.status; }catch{ return 'ERR'; } }
  const checks = [
    { path:'/news',  status: await head('/news') },
    { path:'/map',   status: await head('/map') },
    { path:'/_forms/digest.html', status: await head('/_forms/digest.html') },
  ];
  let detail = {};
  try {
    const r = await fetch((host||'') + '/.netlify/functions/feeds');
    detail = await r.json();
    checks.push({ path:'/.netlify/functions/feeds', status:r.status, detail:{ count: detail.count, updatedAt: detail.updatedAt } });
  } catch {}
  const ok = checks.every(c => c.status === 200);
  return { statusCode: ok?200:503, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}, body: JSON.stringify({ ok, checks, updatedAt:new Date().toISOString() }) };
};
