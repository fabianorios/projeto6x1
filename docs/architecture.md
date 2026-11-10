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
│  │ src/engine/  │◄─── (futuro) ───┐                     │
│  └──────────────┘                 │                     │
│                                   │                     │
│  ┌──────────────┐  SELECT-only    │  ┌──────────────┐   │
│  │ mcp/         │◄── MSSQL/Oracle─┘  │ ESCALA6X1.zip│   │
│  │ (scaffold)   │   read-only        │ vendor Apdata│   │
│  └──────────────┘                    │ (blob only)  │   │
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
| App | `/` (`src/`, Vite) | Wizard + motor + relatório; entrada canônica = CSV (`docs/import-layout.md`) |
| MCP | `mcp/` | Scaffold de servidor/tools **somente leitura** (MSSQL/Oracle); política SELECT-only; secrets fora do Git |
| Vendor | `ESCALA6X1.zip` | Pacote Apdata de referência (dicionário / material). **Manter binário**; não extrair para o tree |
| Docs | `docs/` | Plano, motor, política de escalas, viabilidade Apdata, esta arquitetura |

## Fluxos

1. **MVP atual:** usuário importa CSV → `simulate()` → resultados / PDF via impressão do browser.
2. **Pós-MVP (MCP):** conta DB read-only + allowlist → tools tipadas exportam linhas no layout do simulador → mesmo motor. CSV permanece fallback.
3. **Gestão:** abrir o 6×1 em iframe/rota externa ou deep-link; **não** embutir o código-fonte do simulador no Gestão.

## Fronteiras e LGPD

- Sem nomes de clientes em código, docs commitados ou commits.
- Sem connection strings com senha no repositório (ver `mcp/.env.example`).
- ZIP: não descompactar arquivos internos que identifiquem cliente.
- MCP: deny DML/DDL no processo + conta read-only no banco.

## CI

GitHub Actions na raiz: `npm ci` + `npm run build` em push/PR (app Vite). O pacote `mcp/` tem stub próprio (`npm run build` dentro de `mcp/` quando for desenvolvido).

## Referências

- [`README.md`](../README.md) — como rodar o app
- [`mcp/README.md`](../mcp/README.md) — scaffold MCP
- [`apdata-6x1-feasibility.md`](./apdata-6x1-feasibility.md) — viabilidade e esboço de tools
- [`import-layout.md`](./import-layout.md) — contrato CSV ↔ motor
