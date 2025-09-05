const ORIGIN = process.env.SITE_URL?.replace(/\/$/,'') || '';
exports.guard = (event) => {
  const o = (event.headers?.origin||'').replace(/\/$/,'');
  const r = (event.headers?.referer||'').replace(/\/$/,'');
  const ok = ORIGIN && (o===ORIGIN || r.startsWith(ORIGIN));
  return { ok, headers: { 'Access-Control-Allow-Origin': ok ? ORIGIN : 'https://example.invalid',
                          'Vary':'Origin' } };
};
exports.wrap = (event, res) => {
  const { headers } = exports.guard(event);
  return { ...res, headers: { ...(res.headers||{}), ...headers } };
};
