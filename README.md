# Projeto 6×1 — Simulador de impacto PEC

MVP: wizard (setor → dados → resultados) + motor TypeScript puro + templates varejo/hospital/construção/locação + importação de folha (CSV) com impacto de salários, VR e VT. Apdata→Simular: CNPJ com razão/filial + ramos de `RamosAtividadesEmpresas`.

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4 (`@tailwindcss/vite`)
- Motor em `src/engine/` (funções puras, regras versionadas como dados)
- Templates em `src/templates/`
- Relatório HTML imprimível (`window.print()` → PDF do browser)

## Instalar e rodar

```bash
npm install
npm run dev
```

Build de produção:

```bash
npm run build
npm run preview
```

Não há secrets neste repositório. Credenciais de bases de clientes (se houver integração futura) ficam fora do Git.

## Documentação

| Doc | Conteúdo |
|-----|----------|
| [`docs/architecture.md`](docs/architecture.md) | App + `server/` + `mcp/` + ZIP vendor; Gestão só via embed/link |
| [`docs/ambientes-cliente.md`](docs/ambientes-cliente.md) | Multi-ambiente Apdata (UI + API + deploy `/api`) |
| [`docs/mvp-plan.md`](docs/mvp-plan.md) | Escopo do MVP |
| [`docs/engine-assumptions.md`](docs/engine-assumptions.md) | Hipóteses e fórmulas do motor |
| [`docs/import-layout.md`](docs/import-layout.md) | Layout canônico do CSV de folha |
| [`docs/schedule-policy.md`](docs/schedule-policy.md) | Allowlist / blocklist de escalas |
| [`docs/learning-motor.md`](docs/learning-motor.md) | Feedback aceitar/editar (Fase A) |
| [`docs/apdata-6x1-feasibility.md`](docs/apdata-6x1-feasibility.md) | Viabilidade Apdata × simulador |
| [`docs/apdata-turnocheck-mapping.md`](docs/apdata-turnocheck-mapping.md) | Mapeamento Apdata → CSV (UI: **Mapeamento**) |
| [`docs/sample-folha-validacao.csv`](docs/sample-folha-validacao.csv) | Folha fictícia de validação |
| [`mcp/README.md`](mcp/README.md) | MCP SELECT-only (tools, env, Cursor config) |

## Como importar a folha (PT-BR)

1. No wizard, escolha o **setor** e avance para **Dados**.
2. Na seção **Importar folha (CSV / colar)**:
   - Clique em **Carregar folha de validação** para usar o CSV de amostra (`public/sample-folha.csv`), **ou**
   - **Escolher CSV** / cole o texto e clique em **Processar importação**.
3. Layout canônico (`docs/import-layout.md`):
   - Separador `;`, UTF-8, cabeçalho na 1ª linha.
   - Obrigatórios: `cargo`, `salario`, `carga_horaria_mensal`, `carga_horaria_semanal`, `centro_custo`.
   - Benefícios: `vr_valor_dia`, `vr_dias_mes_atual`, `vt_valor_dia`, `vt_dias_mes_atual`.
   - Opcionais: `nome`, `quantidade`, `escala_atual`.
4. Em **Resultados**, veja delta de salários + VR/VT e agregação por `centro_custo`. Imprima o relatório para PDF.

## Estrutura

```
src/
  engine/       # simulate(), payroll CSV, schedule-policy/suggest, regras
  templates/    # varejo + hospital + construção + locação
  components/   # wizard + ApdataFlow + Ambientes + Mapeamento + ResultsView
  apdata/       # SELECT review texts + exportPayroll (join client-side)
  api/          # client HTTP → /api (ambientes + query)
public/
  sample-folha.csv
server/         # API Hono: ambientes cifrados + proxy SELECT-only
docs/           # plano, arquitetura, ambientes, hipóteses, política
mcp/            # MCP SELECT-only (MSSQL; Oracle stub; sem secrets)
ESCALA6X1.zip   # pacote Apdata (blob; não extrair para o tree)
.github/workflows/ci.yml
```

Produto **separado** do Gestão Consultoria; integração futura só por embed/link (`docs/architecture.md`).

## Pacote Apdata

`ESCALA6X1.zip` fica na raiz como artefato binário de referência (dicionário + material de suporte). **Não descompactar** no repositório. Análise de viabilidade: `docs/apdata-6x1-feasibility.md`.

MCP read-only em `mcp/`: tools `list_tables`, `describe_table`, `select_rows` com allowlist e deny de DML/DDL. Ver [`mcp/README.md`](mcp/README.md).

## Status

| Peça | Estado |
|------|--------|
| Wizard (3 passos) | Pronto |
| Import CSV / colar | Pronto |
| Motor `simulate()` | v1 + VR/VT + por centro de custo |
| Sugestão de escalas/horários | Allowlist + blocklist (`schedule-policy-v1`) |
| Relatório imprimível | Salários + VR/VT + centros + escalas sugeridas |
| Ambientes multi-cliente | UI + `server/` (senha cifrada; SELECT-only) |
| Mapeamento Apdata → CSV | UI (**Mapeamento**) + `docs/apdata-turnocheck-mapping.md` |
| Fluxo Apdata → Simular | UI (**Apdata → Simular**): review SELECTs → export → ResultsView |
| MCP Apdata | Read-only em `mcp/` (MSSQL; Oracle stub) |
| CI | App build + MCP/server test/typecheck/build (sem DB) |
