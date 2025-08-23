# Deploy Checklist (GISConnect)
## Backend (Render Web Service)
- Node runtime: 18+
- Build: npm ci
- Start: node index.js
- Env: DB_URI, JWT_SECRET, CORS_ORIGINS, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_URL_TTL_SECONDS
- Health: GET /healthz -> {"status":"ok"}

## Frontend (Render Static Site)
- Build: npm ci && npm run build
- Publish directory: dist
- Env: VITE_API_BASE=<Render backend URL>

## Post-Deploy
- Test CSV cache endpoints: /cache/products, /cache/clients, /cache/special-prices, /cache/inventory-latest
- Test uploads: payment, packing (x3), delivery -> verify in S3 + Mongo metadata
- CORS: confirm both render URLs whitelisted
- PWA install on iOS/Android; QR code share page
