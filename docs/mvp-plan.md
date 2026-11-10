# MVP — Simulador de impacto PEC escala 6×1

## Objetivo

Entregar em curto prazo uma ferramenta para atender clientes (consultoria) e validar se vale um produto de mercado. Sem repositório Git público nesta fase: protótipo rodando em Cloud Agent / local; versionamento só quando houver tração.

## Princípio de produto

- **Motor comum** (regras da PEC versionadas, custo, cobertura de turnos).
- **Templates por segmento** (varejo, hospital primeiro; construção e locação depois).
- Não é parecer jurídico automático nem previsão de “todas” as mudanças de negócio.

## Segmentos piloto

| Ordem | Segmento | Por quê |
|-------|----------|---------|
| 1 | Varejo | Escala 6×1 comum, muitas lojas, dor clara de cobertura e folha |
| 2 | Hospital | Operação contínua, cargos críticos, alto valor de consultoria |
| Depois | Construção civil / execução | Obra, canteiro, sazonalidade |
| Depois | Locação de equipamentos | Frota + equipes de apoio; reusa lógica de construção |

## Personas

1. **Você (consultor)** — gera relatório em 15–30 min a partir de dados do cliente.
2. **Gestor do cliente (RH / operações)** — lê “antes × depois” e checklist.

## Escopo do MVP (in)

- Wizard: setor, headcount, turnos atuais (ex. 6×1), salários médios, unidades/lojas ou plantas.
- Import de folha (CSV) + impacto salarial e VR/VT.
- 2–3 cenários normativos versionados (ex.: texto atual da PEC / emenda conservadora / status quo).
- Cálculos: delta de custo de folha, gap de cobertura de turnos, headcount estimado adicional.
- **Sugestão de escalas/horários** a partir da cobertura por centro de custo (1–2 candidatas), com lista de exclusão normativa.
- Relatório exportável (PDF ou HTML imprimível) com disclaimer.
- Templates varejo + hospital (campos e textos padrão).

## Fora do MVP (out)

- Integração com folha/ERP.
- Parecer jurídico automático.
- Previsão macroeconômica.
- App mobile nativo.
- Push para Git / PR (até decisão explícita).
- Escalas na **lista de exclusão** (ver `schedule-policy.md`) — não sugerir como “solução PEC”.

## Entregáveis

1. App web (wizard + resultados).
2. Relatório cliente-ready.
3. Documento interno de regras versionadas (fonte da verdade do motor).

## Stack sugerida (ajustável)

- Front: Vite + React (+ Tailwind).
- Motor: TypeScript puro (funções testáveis, sem framework).
- PDF: HTML print-friendly primeiro; lib de PDF se necessário depois.
- Dados: JSON local / `localStorage` (sem backend no MVP).
- Hospedagem demo: Cloud Agent Try Live ou preview estático.

## Fases (~2–4 semanas)

| Fase | Foco | Saída |
|------|------|--------|
| A | Regras + motor | Funções + fixtures de exemplo |
| B | Wizard + UI resultados | Fluxo completo em 1 segmento |
| C | Template 2º segmento + relatório | PDF/HTML + hospital |
| D | Calibração | 1 cliente real ou dados anonymizados |

## Critérios de sucesso

- Relatório útil em reunião com cliente em &lt; 30 min de preenchimento.
- Números explicáveis (cada linha aponta hipótese/regra).
- Você consegue repetir o fluxo sem alterar código.

## Decisão de Git

- App e docs versionados neste repositório (`fabianorios/projeto6x1`).
- Pacote Apdata (`ESCALA6X1.zip`) permanece como blob na raiz; MCP de folha ainda fora de escopo.
