# Turnocheck API (`server/`)

Multi-client Apdata environments: encrypted credentials + SELECT-only query proxy (reuses `mcp/` allowlist).

See [`docs/ambientes-cliente.md`](../docs/ambientes-cliente.md) for UI, routes, LGPD, and VPS deploy (`pm2` + reverse-proxy `/api`).

```bash
cp .env.example .env   # set ENCRYPTION_KEY — never commit
npm install
npm test
npm run build
npm start              # http://127.0.0.1:8787
```
