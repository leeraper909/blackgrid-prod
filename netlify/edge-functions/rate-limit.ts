const enc = new TextEncoder();
const RL_COOKIE = "rl";
const LIMIT = parseInt(Deno.env.get("RL_LIMIT") || "60", 10);
const WINDOW = parseInt(Deno.env.get("RL_WINDOW") || "60", 10);
const SECRET = Deno.env.get("RL_SECRET") || "dev-secret";

function b64url(bytes: ArrayBuffer) {
  let s = "";
  const a = new Uint8Array(bytes);
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/,"");
}
async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64url(mac);
}
function parseCookie(raw: string | null) {
  if (!raw) return null;
  const m = raw.match(new RegExp(`(?:^|;\\s*)${RL_COOKIE}=([^;]+)`));
  if (!m) return null;
  const [ts, c, sig] = m[1].split(".");
  const tsNum = parseInt(ts || "0", 10);
  const countNum = parseInt(c || "0", 10);
  if (!Number.isFinite(tsNum) || !Number.isFinite(countNum) || !sig) return null;
  return { ts: tsNum, count: countNum, sig };
}

export default async (req: Request) => {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / WINDOW) * WINDOW;

  let count = 0;
  const parsed = parseCookie(req.headers.get("cookie"));
  if (parsed) {
    const goodSig = await hmac(`${parsed.ts}.${parsed.count}`);
    if (parsed.sig === goodSig && parsed.ts === windowStart) {
      count = parsed.count;
    }
  }

  count += 1;

  const sig = await hmac(`${windowStart}.${count}`);
  const cookieVal = `${RL_COOKIE}=${windowStart}.${count}.${sig}; Max-Age=${WINDOW + 5}; Path=/api; Secure; SameSite=Lax; HttpOnly`;
  const resetAt = windowStart + WINDOW;

  if (count > LIMIT) {
    const retry = Math.max(1, resetAt - now);
    const headers = {
      "content-type": "application/json",
      "x-ratelimit-limit": String(LIMIT),
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": String(resetAt),
      "retry-after": String(retry),
      "set-cookie": cookieVal,
    };
    return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers });
  }

  const url = new URL(req.url);
  url.pathname = "/.netlify/functions/healthcheck";
  const upstream = await fetch(new Request(url.toString(), req));
  const headers = new Headers(upstream.headers);
  headers.set("x-ratelimit-limit", String(LIMIT));
  headers.set("x-ratelimit-remaining", String(Math.max(0, LIMIT - count)));
  headers.set("x-ratelimit-reset", String(resetAt));
  headers.append("set-cookie", cookieVal);
  return new Response(upstream.body, { status: upstream.status, headers });
};
