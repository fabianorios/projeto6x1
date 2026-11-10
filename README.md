# Projeto 6×1 — Simulador de impacto PEC

MVP: wizard (setor → dados → resultados) + motor TypeScript puro + templates varejo/hospital + importação de folha (CSV) com impacto de salários, VR e VT.

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
| [`docs/mvp-plan.md`](docs/mvp-plan.md) | Escopo do MVP |
| [`docs/engine-assumptions.md`](docs/engine-assumptions.md) | Hipóteses e fórmulas do motor |
| [`docs/import-layout.md`](docs/import-layout.md) | Layout canônico do CSV de folha |
| [`docs/schedule-policy.md`](docs/schedule-policy.md) | Allowlist / blocklist de escalas |
| [`docs/learning-motor.md`](docs/learning-motor.md) | Feedback aceitar/editar (Fase A) |
| [`docs/apdata-6x1-feasibility.md`](docs/apdata-6x1-feasibility.md) | Viabilidade Apdata × simulador (sem MCP nesta etapa) |
| [`docs/sample-folha-validacao.csv`](docs/sample-folha-validacao.csv) | Folha fictícia de validação |

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
  templates/    # varejo + hospital
  components/   # wizard + PayrollImport + ResultsView + relatório print
public/
  sample-folha.csv
docs/           # plano, hipóteses, política, viabilidade Apdata
ESCALA6X1.zip   # pacote Apdata (blob; não extrair para o tree)
```

## Pacote Apdata

`ESCALA6X1.zip` fica na raiz como artefato binário de referência (dicionário + material de suporte). **Não descompactar** no repositório. Análise de viabilidade: `docs/apdata-6x1-feasibility.md`. Build de MCP de folha **ainda não** faz parte deste MVP.

## Status

| Peça | Estado |
|------|--------|
| Wizard (3 passos) | Pronto |
| Import CSV / colar | Pronto |
| Motor `simulate()` | v1 + VR/VT + por centro de custo |
| Sugestão de escalas/horários | Allowlist + blocklist (`schedule-policy-v1`) |
| Relatório imprimível | Salários + VR/VT + centros + escalas sugeridas |
| MCP Apdata | Fora desta entrega |
