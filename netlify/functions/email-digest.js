exports.handler = async (event) => {
  const SITE = process.env.SITE_URL || 'https://blackgrid-prod.netlify.app';
  const SG_KEY = process.env.SENDGRID_API_KEY;
  const FROM   = process.env.SENDGRID_FROM;
  const TOs    = (process.env.SENDGRID_TO || '').split(',').map(s=>s.trim()).filter(Boolean);
  const LOOKBACK_H = parseInt(process.env.DIGEST_LOOKBACK_H || '24', 10);
  const debug = (event.queryStringParameters||{}).debug === '1';

  try {
    const r = await fetch(`${SITE}/.netlify/functions/feeds?limit=500`);
    const j = await r.json();
    const since = Date.now() - LOOKBACK_H*3600*1000;
    const inWin = (j.items||[]).filter(it => (it.ts||0) >= since);

    const uk = inWin.filter(it => ['UK','EU'].includes(it.country)).slice(0, 20);
    const gl = inWin.filter(it => !['UK','EU'].includes(it.country)).slice(0, 20);
    const line = it => `• ${it.title} — ${it.country||'World'}\n  ${it.link}`;
    const text =
`🗞️ BlackGrid Daily Digest (last ${LOOKBACK_H}h)

UK & EU:
${uk.length ? uk.map(line).join('\n') : '• No major UK/EU items'}

Global:
${gl.length ? gl.map(line).join('\n') : '• No major global items'}

Full stream: ${SITE}/news`;

    let sent=false, resp=200;
    if (SG_KEY && FROM && TOs.length) {
      const body = {
        personalizations: [{ to: TOs.map(e=>({email:e})), subject: 'BlackGrid Daily Digest' }],
        from: { email: FROM },
        content: [{ type: 'text/plain', value: text }]
      };
      const s = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method:'POST',
        headers: { 'Authorization':`Bearer ${SG_KEY}`, 'Content-Type':'application/json' },
        body: JSON.stringify(body)
      });
      sent = s.status===202; resp = s.status;
    }
    const out = { ok:true, sent, count_window: inWin.length, uk_eu: uk.length, world: gl.length };
    return { statusCode: debug ? 200 : 204, headers: debug?{'Content-Type':'application/json'}:{}, body: debug?JSON.stringify(out):undefined };
  } catch (e) {
    return { statusCode: 200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
};
