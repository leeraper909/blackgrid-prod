exports.handler = async () => {
  try {
    const base = process.env.URL || process.env.DEPLOY_URL || "";
    const resp = await fetch(`${base}/data/feeds.json`, { redirect: "follow" });
    const body = await resp.text();
    return {
      statusCode: resp.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=600, stale-if-error=86400"
      },
      body
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: String(e) }) }; 
  }
};
