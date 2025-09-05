exports.handler = async (event) => {
  const SITE = process.env.SITE_URL || 'https://blackgrid-prod.netlify.app';
  const WEBHOOK = process.env.SLACK_WEBHOOK_URL;
  const LOOKBACK_H = parseInt(process.env.DIGEST_LOOKBACK_H || '24',10);
  const LIMIT = parseInt(process.env.DIGEST_LIMIT || '250',10);
  const debug = (event.queryStringParameters||{}).debug==='1';

  const { getStore } = await import('@netlify/blobs');
  const store = getStore({ name:'blackgrid-alerts' });
  const state = await store.get('state.json', { type:'json' }) || {};

  const r = await fetch(`${SITE}/.netlify/functions/feeds?limit=${LIMIT}`);
  const j = await r.json();
  const since = Date.now() - LOOKBACK_H*3600*1000;
  const inWin = (j.items||[]).filter(it => (it.ts||0) >= since);

  const uk = inWin.filter(it => ['UK','EU'].includes(it.country)).slice(0, 15);
  const gl = inWin.filter(it => !['UK','EU'].includes(it.country)).slice(0, 15);
  const line = it => `• ${it.title} (${it.country||'World'})\n${it.link}`;
  const text =
`🗞️ *BlackGrid Daily Digest* (last ${LOOKBACK_H}h)

*UK & EU*
${uk.length ? uk.map(line).join('\n') : '• No major UK/EU items'}

*Global*
${gl.length ? gl.map(line).join('\n') : '• No major global items'}

Full stream: ${SITE}/news`;

  if (WEBHOOK) { try { await fetch(WEBHOOK, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text }) }); state.lastDigestSlack = Date.now(); } catch {} }
  state.lastDailyDigest = Date.now();
  await store.set('state.json', JSON.stringify(state));

  const body = { ok:true, uk_eu: uk.length, world: gl.length, totalWindow: inWin.length };
  return { statusCode: debug ? 200 : 204, headers: debug?{'Content-Type':'application/json'}:{}, body: debug?JSON.stringify(body):undefined };
};
