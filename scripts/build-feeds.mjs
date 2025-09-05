import fs from "node:fs/promises";
import path from "node:path";

const OUT_DIR = "public/data";
const OUT_FILE = path.join(OUT_DIR, "feeds.json");

const sources = [
  "https://hnrss.org/frontpage",
  "https://feeds.bbci.co.uk/news/technology/rss.xml",
  "https://www.bleepingcomputer.com/feed/",
  "https://www.theregister.com/headlines.atom",
];

const geoByHost = {
  "hnrss.org": { country: "World", lat: 20,  lon: 0  },
  "feeds.bbci.co.uk": { country: "UK", lat: 54.8, lon: -4.6 },
  "bleepingcomputer.com": { country: "US", lat: 39, lon: -98 },
  "theregister.com": { country: "World", lat: 20, lon: 0 },
};

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8000;

async function safeFetch(u) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(u, { redirect: "follow", signal: ac.signal, headers: { "User-Agent": "BlackGrid/1.0" }});
    const len = parseInt(r.headers.get("content-length") || "0", 10);
    if (len && len > MAX_BYTES) throw new Error("oversize");
    const t = await r.text();
    return t.length > MAX_BYTES ? t.slice(0, MAX_BYTES) : t;
  } finally { clearTimeout(to); }
}

function host(u){ try { return new URL(u).hostname.replace(/^www\./,''); } catch { return ""; } }
function pick(re, s){ const m = s.match(re); return m ? (m[1] || m[2] || "") : ""; }
function pickAttr(re, attr, s){ const m = s.match(re); if(!m) return ""; const a=m[1]||""; const mm=a.match(new RegExp(attr+'="([^"]+)"','i')); return mm?mm[1]:""; }
function clean(s){ return s.replace(/<!\[CDATA\[|\]\]>/g,'').trim(); }

function parseInto(src, xml, out=[]) {
  let entries = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  entries = entries.concat(xml.match(/<item[\s\S]*?<\/item>/gi) || []);
  if (entries.length) {
    entries.forEach(chunk => {
      const title = clean(pick(/<title[^>]*>([\s\S]*?)<\/title>/i, chunk));
      const link = clean(pick(/<link[^>]*>([\s\S]*?)<\/link>/i, chunk) || pickAttr(/<link\b([^>]*)\/?>/i, "href", chunk));
      let ts = Date.now();
      const d = pick(/<updated[^>]*>([\s\S]*?)<\/updated>/i, chunk) ||
                pick(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i, chunk) ||
                pick(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i, chunk);
      if (d) { const t = Date.parse(d); if (!Number.isNaN(t)) ts = t; }
      if (title && link) out.push({ title, link, ts, source: host(src) });
    });
  } else {
    const t = pick(/<title[^>]*>([\s\S]*?)<\/title>/i, xml);
    const l = pick(/<link[^>]*>([\s\S]*?)<\/link>/i, xml) || pickAttr(/<link\b([^>]*)\/?>/i, "href", xml);
    if (t && l) out.push({ title: clean(t), link: clean(l), ts: Date.now(), source: host(src) });
  }
  return out;
}

function enrich(items){
  return items.map(it => ({ ...it, ...(geoByHost[it.source] || { country: "World", lat: 20, lon: 0 }) }));
}
function dedupe(items){
  const seen = new Set();
  return items.filter(x => { const k = x.link.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

const main = async () => {
  const all = [];
  await Promise.all(sources.map(async (src) => {
    try { const body = await safeFetch(src); parseInto(src, body, all); } catch {}
  }));
  const enriched = enrich(dedupe(all)).sort((a,b)=>b.ts-a.ts);
  const payload = { count: enriched.length, updatedAt: new Date().toISOString(), items: enriched };
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${OUT_FILE} with ${payload.count} items`);
};

main().catch(e => { console.error(e); process.exit(1); });
