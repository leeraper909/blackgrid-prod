exports.handler = async () => {
  const base = process.env.URL || process.env.DEPLOY_URL || "";
  const paths = ["/", "/map", "/news", "/_forms/digest.html", "/data/feeds.json"];
  const checks = [];
  try {
    for (const p of paths) {
      const r = await fetch(base + p, { redirect: "manual" });
      const detail = p === "/data/feeds.json" ? await r.json().catch(()=>null) : undefined;
      checks.push({ path: p, status: r.status, ...(detail ? { detail: { count: detail.count, updatedAt: detail.updatedAt } } : {}) });
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, checks, updatedAt: new Date().toISOString() }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
