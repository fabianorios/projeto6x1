# Turnocheck — Spec v2

Produto: **Turnocheck** (simulador de impacto da PEC da escala 6×1).  
Repo: `fabianorios/projeto6x1` · Path VPS: `/var/www/projeto6x1` · URL: `https://turnocheck.ahrbrasil.com.br`  
Produto **separado** do Gestão Consultoria (Gestão = só referência de infra/DNS/PM2; integração futura só por link/embed).  
LGPD: sem nomes de clientes, CPF, telefone ou outros PII em docs, código, fixtures ou commits.

Este documento define o **contrato de produto v2**: o que já está shipped (baseline pós-MVP), o que é escopo v2, e o que fica fora. Complementa (não substitui) `docs/architecture.md`, `docs/engine-assumptions.md`, `docs/schedule-policy.md` e `docs/apdata-turnocheck-mapping.md`.

---

## 1. Visão

Turnocheck é ferramenta de **consultoria operacional** (SaaS leve) para estimar, a partir da folha (CSV ou base Apdata), o efeito de cenários normativos sobre:

- headcount adicional;
- massa salarial;
- VR e VT;
- escalas/horários sugeridos (allowlist; nunca parecer jurídico).

Entrega típica: relatório imprimível (PDF via browser) em reunião com o cliente, em &lt; 30 min de preparação.

**Não é:** parecer jurídico automático, ERP de folha, app mobile nativo, nem módulo embutido no monorepo Gestão.

---

## 2. Baseline shipped (estado atual = piso da v2)

| Área | Estado |
|------|--------|
| Wizard setor → dados → resultados | Pronto (templates varejo / hospital / construção / locação) |
| Import CSV / colar | Pronto (`docs/import-layout.md`) |
| Motor `simulate()` | v1: HC, folha, VR/VT, por centro de custo, cenários versionados |
| Sugestão de escalas | Allowlist + blocklist (`schedule-policy-v1` / docs) |
| Cesta multi-cenário | Pronto (`ScenarioBasket`) |
| Relatório imprimível | Pronto |
| Feedback de calibração | Fase A local (`localStorage`) |
| Ambientes multi-base | UI + API Hono (senha AES-256-GCM; SELECT-only) |
| Mapeamento Apdata → CSV | UI + doc canônico |
| Apdata → Simular | Fluxo linear: ambiente → CNPJ (+ vínculos) → ramos → SELECTs → join cliente → `simulate()` |
| MCP read-only | `mcp/` (MSSQL; Oracle stub) |
| Identidade visual | Chrome alinhado ao Gestão AHR |
| Deploy | VPS + Cloudflare + NPM + PM2 (`projeto6x1` :4174, `turnocheck-api` :8787); CI GitHub Actions |

---

## 3. Personas e jobs

| Persona | Job |
|---------|-----|
| Consultor AHR | Montar simulação + PDF em reunião; comparar cenários; calibrar sugestões. |
| Admin técnico | Cadastrar/ativar ambiente Apdata (TEMP ou cliente); testar SELECT; sem expor PII. |
| Gestor do cliente (RH / ops) | Ler Atual × Proposto (folha, HC, VR/VT, escalas) e checklist — **sem** editar motor. |

---

## 4. Escopo v2 (in)

### 4.1 Produto / UX

1. **Hierarquia de Resultados** — uma fonte da verdade: Δ herói acima da dobra → Atual×Proposto → detalhe técnico colapsável (alinhado ao backlog UX P0/P1).
2. **Mobile legível** — cesta multi-cenário em cards &lt;sm; CTAs sticky (Imprimir / Nova simulação); feedback de sugestão com alvos de toque ≥44px.
3. **Regra 1 vs N propostas** — 1 cenário marcado → painel Atual×Proposto; ≥2 → cesta + Δ; sem duplicar os mesmos KPIs.
4. **Wizard Dados em seções** — Operação / Folha / Cenário / Prévia (fieldsets ou accordions), chrome uniforme Voltar/Continuar.
5. **Marca Turnocheck** — peso de marca no 1º viewport sem competir com o H1 de tarefa; disclaimer jurídico uma vez no shell (+ footnote no PDF).

### 4.2 Apdata / dados

1. **Contrato adapter estável** — mapeamento CSV ← Apdata versionado; SELECTs B–G revisáveis na UI; export agregado **cargo × CC × escala** (sem nome de pessoa).
2. **Filtro CNPJ** — razão · filial · CNPJ; totais de colaboradores e **quebra por tipo de vínculo**; situação `CON_CdiSituacao NOT IN (0, 2, 3, 99)`.
3. **Ramos → setor** — `RamosAtividadesEmpresas` → `SectorId` do motor (data-driven).
4. **VT canônico** — `ConATransportes` × `MeiosTransportesItens` (ativo); **ignorar** `ConCalculoATransportes`; dias/mês via ciclo de jornada.
5. **VR** — plano tipo 53; dias pelo ciclo / motor.
6. **Overrides** — salário padrão e VR/VT/dia quando TEMP vier zerada.
7. **Ambientes** — CRUD + test (`SELECT 1`) + ativo único; conta DB preferencialmente read-only; Oracle permanece stub até decisão explícita.

### 4.3 Motor / regras

1. Manter cenários versionados como **dados** (`rules.ts`): `status_quo`, `pec_draft_conservative` (5×2), `pec_draft_aggressive` (4×3).
2. Allowlist de sugestão: `5x2`, `4x3`, `turnos_8h`; **nunca** sugerir `6x1` / `12x36` / `24x48` / sobreaviso / jornada &gt;10h como proposto.
3. Fórmulas documentadas em `engine-assumptions.md` (scaleFactor, buffer, atrito setorial, encargos proxy).
4. Calibração: histórico aceitar/editar/rejeitar permanece local na v2; sem sync multi-dispositivo neste ciclo.

### 4.4 Plataforma / operação

1. Hospedagem só VPS (espelha Gestão); **não** Vercel.
2. Proxy `/api` → `turnocheck-api`; guard SELECT-only compartilhado com MCP.
3. MSSQL TEMP bind **somente** `127.0.0.1:1433`.
4. Após merge em `main`: deploy automático (pull/build/pm2 app + API) no worker self-hosted.
5. CI: build app + test/typecheck/build de `mcp/` e `server/` (sem DB real).

---

## 5. Fora de escopo v2 (out)

- Parecer jurídico automático ou citação de texto legal da PEC como “cálculo oficial”.
- Modelagem completa de encargos (INSS/FGTS/CCT), horas extras, banco de horas, feriados/DSR, sazonalidade.
- Auth de usuários finais / multi-tenant SaaS com billing.
- Persistência cloud de simulações/calibração (além de `localStorage` / `environments.json` no servidor).
- DML/DDL via API ou MCP; exposição pública do MSSQL.
- Merge de código com Gestão Consultoria; reuso de secrets Graph/SMTP/Resend do Gestão.
- App mobile nativo; PDF server-side (mantém print do browser).
- Extrair `ESCALA6X1.zip` no tree do Git.

---

## 6. Arquitetura (resumo)

```text
Usuário
  → Cloudflare (DNS + TLS) → NPM (443) → PM2 SPA :4174
  → /api (proxy) → PM2 turnocheck-api :8787
       → guard SELECT-only (mcp/) → MSSQL 127.0.0.1:1433
```

| Camada | Stack | Papel |
|--------|-------|--------|
| SPA | Vite + React + TS + Tailwind v4 | Wizard, Ambientes, Mapeamento, Apdata→Simular, motor no browser |
| Motor | `src/engine/` (funções puras) | `simulate()`, payroll, schedule-policy/suggest, cenários |
| API | Hono em `server/` | Ambientes cifrados + proxy SELECT |
| MCP | `mcp/` | Mesma política read-only para agentes |
| MSSQL | Docker local | Base TEMP; sem bind público |
| Vendor | `ESCALA6X1.zip` | Blob de referência (não extrair) |

---

## 7. Fluxos canônicos

### 7.1 CSV (fallback / demo)

Setor → Dados (HC/escala/CSV) → cenários → Resultados / PDF.

### 7.2 Apdata → Simular (caminho principal v2)

1. Ambiente ativo + health da API.  
2. Filtro CNPJ (multi-select) com totais e vínculos.  
3. Ramos → setor do motor.  
4. Revisão dos SELECTs.  
5. `/api/query/select` → agregação `PayrollRow[]` (join no cliente) → `simulate()` → `ResultsView`.  
6. Overrides opcionais; export sem PII.

### 7.3 Ambientes (admin)

CRUD → Testar → Ativar. Credenciais: `ENCRYPTION_KEY` + `DATA_DIR/environments.json` (fora do Git).

---

## 8. LGPD e fronteiras

- Sem PII em logs, samples, commits ou docs versionados.
- CSV default: omitir `nome`; preferir código de CC a descrições identificáveis.
- Razão/filial/CNPJ só no **runtime** do filtro; nunca hardcodar em fixtures.
- Rótulos genéricos (“cliente piloto”, “ambiente TEMP”).
- API/MCP: deny DML/DDL + allowlist; MSSQL não na internet.
- Secrets e projeto isolados do Gestão Consultoria.

---

## 9. Critérios de aceite v2

1. Fluxo Apdata → Simular completa com ambiente TEMP: CNPJ + vínculos + ramos → resultados com Δ folha/HC/VR/VT e escalas allowlist.  
2. Fallback CSV continua funcional com a folha de validação.  
3. Em viewport ~400px: cesta ou painel Atual×Proposto legível; CTAs Imprimir/Nova simulação alcançáveis sem scroll infinito.  
4. Nenhum SELECT fora da allowlist; nenhuma senha em claro na UI após save.  
5. Docs e código sem nomes de cliente.  
6. `https://turnocheck.ahrbrasil.com.br/` → HTTP 200 após deploy; PM2 `projeto6x1` e `turnocheck-api` online.  
7. Disclaimer de simulação estimativa visível no shell e no relatório.

---

## 10. Mapa UI ↔ código

| UI | Código / docs |
|----|----------------|
| Wizard | `WizardShell`, `SectorStep`, `InputsStep` |
| Resultados | `ResultsView`, `PrintableReport`, `ScenarioBasketCompare` |
| Ambientes | `AmbientesPanel`, `server/src/routes/environments.ts` |
| Mapeamento | `MapeamentoPanel`, `docs/apdata-turnocheck-mapping.md` |
| Apdata → Simular | `ApdataFlowPanel`, `src/apdata/*` |
| Motor | `simulate.ts`, `rules.ts`, `schedule-*.ts` |
| Arquitetura / ops | `docs/architecture.md`, `docs/ambientes-cliente.md` |

---

## 11. Referências

- `docs/architecture.md` — fronteiras repo / Gestão  
- `docs/engine-assumptions.md` — fórmulas e cenários  
- `docs/schedule-policy.md` — allowlist / blocklist  
- `docs/import-layout.md` — contrato CSV  
- `docs/apdata-turnocheck-mapping.md` — adapter Apdata  
- `docs/ambientes-cliente.md` — multi-ambiente + `/api`  
- `docs/mvp-plan.md` — escopo histórico do MVP (superseded em parte por este spec)  
- `mcp/README.md` — tools SELECT-only  

---

## Changelog

| Versão | Data | Nota |
|--------|------|------|
| v2.0-draft | 2026-11-14 | Primeira redação a partir do produto live + descrição técnica/operacional; sem inventar features não evidenciadas no código. |
