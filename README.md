# BlackGrid FeedProxy (v0.1)
A small FastAPI proxy that aggregates legal/public feeds into a single JSON your site/app can read.

## Endpoints
- `GET /feeds` → `{ updated, items:[{title,source,severity,url,tags[]}] }`
- `GET /counter` → summary with `threat_level`

## Run (local)
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py
# open http://localhost:8080/feeds
```

## Docker
```bash
docker build -t bg-feedproxy:0.1 .
docker run -p 8080:8080 -e BG_TTL=60 -e BG_CORS="https://YOUR-SITE.netlify.app" -e BG_API_KEY=changeme bg-feedproxy:0.1
```

## Deploy (AWS Fargate or Cloud Run)
- Expose only `GET /feeds` and `GET /counter` via API Gateway / HTTPS.
- Put a WAF in front, rate-limit, and set CORS to only your site domain.
- Store API keys/secrets in AWS Secrets Manager / GCP Secret Manager.
- Logging → CloudWatch / Stackdriver; Metrics → 4xx/5xx, P95 latency, RPS.

## Legal & Safety
- Use **official APIs/RSS** and contracted vendor sources. Respect Terms of Use.
- Avoid scraping sites that prohibit it. Dark-web collection requires licensed third parties and legal agreements; do **not** point this proxy at such sources directly.

## Schema
```
FeedItem: { title, source, severity: Guard|High|Severe|Critical, url, tags[] }
```
