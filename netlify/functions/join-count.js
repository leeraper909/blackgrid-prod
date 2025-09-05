exports.handler = async () => {
  const siteId = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_API_TOKEN;
  try {
    if (!siteId || !token) throw new Error("missing env");
    const r = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/forms`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const arr = await r.json();
    const form = Array.isArray(arr) ? arr.find(f => f.name === 'digest') : null;
    const count = form ? form.submission_count : null;
    return { statusCode: 200, headers: { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }, body: JSON.stringify({ count }) };
  } catch (_e) {
    return { statusCode: 200, headers: { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }, body: JSON.stringify({ count: null }) };
  }
};
