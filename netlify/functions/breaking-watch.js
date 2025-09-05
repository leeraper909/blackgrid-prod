exports.handler = async (event) => {
  const SITE = process.env.SITE_URL || 'https://blackgrid-prod.netlify.app';
  const WEBHOOK = process.env.SLACK_WEBHOOK_URL;
  const WINDOW_MIN = parseInt(process.env.BREAKING_WINDOW_MIN || '20',10);
  const LIMIT = parseInt(process.env.BREAKING_LIMIT || '160',10);
  const keywords = (process.env.CRITICAL_KEYWORDS || 'cve-,0day,actively exploited,ransomware,fortinet,citrix,ivanti,moveit,exchange')
    .split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  const debug = (event.queryStringParameters||{}).debug==='1';
  const now = Date.now();

  const { getStore } = await import('@netlify/blobs');
  const store = getStore({ name:'blackgrid-alerts' });
  const alerted = await store.get('alerted.json', { type:'json' }) || {};      // { link: ts }
  const state   = await store.get('state.json',   { type:'json' }) || {};

  // expire > 7 days
  for (const [k,ts] of Object.entries(alerted)) if (now - ts > 7*864e5) delete alerted[k];

  const fr = await fetch(`${SITE}/.netlify/functions/feeds?region=all&limit=${LIMIT}`);
  const { items=[] } = await fr.json();
  const fresh = items.filter(it => now - (it.ts||0) <= WINDOW_MIN*60*1000);

  const hit = it => {
    const t=(it.title||'').toLowerCase();
    return keywords.some(k => t.includes(k)) && !alerted[it.link];
  };
  const hits = fresh.filter(hit);

  if (hits.length && WEBHOOK) {
    const lines = hits.map(it => `• ${it.title} (${it.country||'World'})\n${it.link}`).join('\n');
    const text = `<!here> ⚠️ *Critical cyber update (${hits.length})*\n${lines}\n\nMore: ${SITE}/news`;
    try { await fetch(WEBHOOK, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text }) }); state.lastSlackPost = now; } catch {}
  }

  hits.forEach(it => { alerted[it.link] = now; });
  state.lastBreakingWatch = now; state.lastFreshCount = fresh.length; state.lastHitCount = hits.length;
  await store.set('alerted.json', JSON.stringify(alerted));
  await store.set('state.json',   JSON.stringify(state));

  const body = { ok:true, windowMin: WINDOW_MIN, examined: items.length, fresh: fresh.length, hits: hits.length, sample: hits.slice(0,3) };
  return { statusCode: debug ? 200 : 204, headers: debug?{'Content-Type':'application/json'}:{}, body: debug?JSON.stringify(body):undefined };
};
