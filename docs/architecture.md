# Arquitetura — Projeto 6×1

Visão do repositório `fabianorios/projeto6x1` como **produto separado**. Não vive dentro do monorepo Gestão Consultoria; qualquer superfície no Gestão no futuro é **somente embed/link** para este app.

## Componentes

```
┌─────────────────────────────────────────────────────────┐
│  fabianorios/projeto6x1 (este repo)                     │
│                                                         │
│  ┌──────────────┐   CSV / colar    ┌─────────────────┐  │
│  │ App Vite     │◄────────────────│ Folha (humano)  │  │
│  │ React + TS   │                 └─────────────────┘  │
│  │ Ambientes UI │── /api ──►┌──────────────────────┐    │
│  │ src/engine/  │           │ server/ (Hono)       │    │
│  └──────────────┘           │ envs encrypted       │    │
│                             │ SELECT proxy         │    │
│  ┌──────────────┐           └──────────┬───────────┘    │
│  │ mcp/         │◄── guard + DbClient ─┘                │
│  │ read-only    │   allowlist → MSSQL/Oracle            │
│  └──────────────┘                    ┌──────────────┐   │
│                                      │ ESCALA6X1.zip│   │
│                                      │ vendor Apdata│   │
│                                      │ (blob only)  │   │
│                                      └──────────────┘   │
└─────────────────────────────────────────────────────────┘
         ▲
         │  embed / deep-link apenas (sem merge de código)
         │
┌────────┴────────┐
│ Gestão Consultoria │  (outro produto / outro repo)
└────────────────────┘
```

| Peça | Caminho | Papel |
|------|---------|--------|
| App | `/` (`src/`, Vite) | Wizard + motor + relatório + UI **Ambientes**; entrada canônica = CSV (`docs/import-layout.md`) |
| API | `server/` | Multi-ambiente Apdata: CRUD cifrado (`ENCRYPTION_KEY`), test/activate, proxy SELECT-only; VPS via pm2 + `/api` |
| MCP | `mcp/` | Servidor MCP **somente leitura** (MSSQL; Oracle stub): `list_tables`, `describe_table`, `select_rows`; allowlist + SELECT-only; secrets fora do Git — **reusado pela API** |
| Vendor | `ESCALA6X1.zip` | Pacote Apdata de referência (dicionário / material). **Manter binário**; não extrair para o tree |
| Docs | `docs/` | Plano, motor, política de escalas, viabilidade Apdata, ambientes, esta arquitetura |

## Fluxos

1. **MVP atual:** usuário importa CSV → `simulate()` → resultados / PDF via impressão do browser.
2. **Ambientes + API:** usuário cadastra N bases no painel Ambientes → senhas cifradas em `server/data` → proxy `/api/query/select` (allowlist MCP). CSV permanece fallback.
3. **MCP (Cursor/stdio):** mesma política SELECT-only para agentes; secrets só em env.
4. **Gestão:** abrir o 6×1 em iframe/rota externa ou deep-link; **não** embutir o código-fonte do simulador no Gestão.

## Fronteiras e LGPD

- Sem nomes de clientes em código, docs commitados ou commits.
- Sem connection strings com senha no repositório (ver `mcp/.env.example`, `server/.env.example`).
- ZIP: não descompactar arquivos internos que identifiquem cliente.
- MCP / API: deny DML/DDL no processo + conta read-only no banco.
- UI Ambientes: senha mascarada após save; rótulos genéricos (sem nomes de cliente no código).

## CI

GitHub Actions na raiz: `npm ci` + `npm run build` (app Vite); em `mcp/` e `server/`, `npm ci` + `npm test` + `typecheck` + `build` (sem DB real).

## Referências

- [`README.md`](../README.md) — como rodar o app
- [`ambientes-cliente.md`](./ambientes-cliente.md) — multi-ambiente + API + deploy `/api`
- [`mcp/README.md`](../mcp/README.md) — MCP read-only (tools, env, Cursor config)
- [`apdata-6x1-feasibility.md`](./apdata-6x1-feasibility.md) — viabilidade e esboço de tools
- [`import-layout.md`](./import-layout.md) — contrato CSV ↔ motor
