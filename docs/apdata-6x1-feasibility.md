# Viabilidade Apdata × simulador PEC 6×1

Análise somente leitura do pacote `ESCALA6X1.zip` (repo [fabianorios/projeto6x1](https://github.com/fabianorios/projeto6x1), ~18 MB) cruzada com o MVP em `docs/` e o motor em `src/`. **Sem build de MCP nesta etapa.** Credenciais e connection strings não são reproduzidas aqui.

**LGPD:** o ZIP permanece como blob binário no repositório. Não descompactar no tree commitado. Nomes de arquivos internos do pacote que identifiquem cliente devem ser citados apenas de forma genérica (ex.: “docx do caso piloto”); use placeholders como “base TEMP do cliente” / “caso piloto”.

## Veredito

**Viável e bem alinhado.** O ZIP não é um dump de folha: é (1) o dicionário Apdata + ferramenta **ComandosDml** para montar DML a partir do schema, e (2) material de impacto PEC já validado numa base TEMP via MCP MSSQL somente-leitura. O caminho natural é: dicionário → mapear tabelas → MCP read-only na base do cliente → projetar linhas no layout CSV do simulador (`docs/import-layout.md`) → motor atual.

## O que há no ZIP

Arquivo no repositório: `ESCALA6X1.zip` (GitHub/case-insensitive ≈ `escala6x1.zip`). Pasta raiz ao descompactar: `ESCALA6X1/`.

| Item | Papel |
|------|--------|
| `_internal/` + `_internal/web/` | Runtime Windows empacotado (PyInstaller / Python 3.14 + DLLs SQLite/OpenSSL) e UI **ComandosDml** v4.13/10/2026 — gera scripts DML a partir do dicionário (Oracle ou SQL Server). **Não há `.exe`/`.cmd` no ZIP**; só o runtime `_internal` + web. |
| `indice/dicionario-*.db` (~31 MB) | SQLite local do dicionário Apdata: **9 834** tabelas, **162 389** campos, **37 713** índices, **22 804** relações, **137** assuntos. Meta aponta origem `Dicionário de Dados.TXT` (caminho de máquina de build — sem senha). |
| `Objetos ligados ao Horário.xls` | 115 vínculos campo×tabela (`*_CdiHorario`), **69** objetos / **99** tabelas — mapa de impacto sistêmico do horário. |
| Docx de análise PEC × caso piloto *(nome interno do ZIP pode identificar cliente — não citar; não extrair)* | Raio-X PEC (Emenda 12 × texto aprovado) na base TEMP do cliente; já usa MCP `mssql` SELECT-only + este dicionário. |
| `Apresentacao_Fim_6x1_Lideres_Atendimento.html` | Deck interno Suporte (gatilho ponto → folha, provisões, benefícios, eSocial). |
| `DOC-EMENDA-12---PEC-2212019-*.pdf` | Texto da emenda (contexto normativo). |
| Ata PDF/TXT (+ transcrição) | Reunião 16/10/2026: prazo etapa 1 (~60 dias pós-promulgação), divisor 220→210, VR/VT, S-2206, risco de tratar chamado como “só ponto”. |
| `escala.jpeg` | Ilustração de escala. |
| `.git/` embutido | Histórico local do pacote (atas/apresentação); não é o remote do simulador. |
| `logs/`, `uploads/` | Vazios no pacote. |

**Não está no ZIP:** dump de tabelas de produção, drivers JDBC/ODBC de cliente, connection strings com senha, movimentos de ponto preenchidos da base exemplo.

API local da ferramenta (referência): `/api/estado`, `/api/indexar*`, `/api/pedido`, `/api/script`, `/api/montar-sql`, `/api/validar-dml`, export XLSX, etc. Destino de script: **Oracle ou SQL Server** (escolha na UI).

## Pistas do modelo de dados (Apdata)

Núcleo para PEC / escala (assunto **Controle de Frequência** e contratados):

| Tabela | Uso |
|--------|-----|
| `Horarios` | Cadastro do horário: `HOR_CdiHorario`, `HOR_QtnHorasSemanal`, `HOR_QtnHorasMensais`, `HOR_CdiTipoEscala`, `HOR_CdiRegimeJornadaTrabalho`, `HOR_QtiLimiteDiasTrabSemFolga`, textos eSocial. |
| `HorariosJornadas` / `Jornadas` / `TiposDiasPonto` | **Ciclo real** da escala (trabalho × folga × DSR) — método usado na análise do cliente piloto; não confiar só na descrição do horário. |
| `Contratados` | `CON_CdiHorario`, `CON_CdiCentroCusto`, `CON_CdiCargo`, `CON_VlnSalario` / integral, `CON_CdiQuantidadeHoraMes`, `CON_CdiFolha`, vínculo/rescisão para recorte “CLT ativos”. |
| `QuantidadesHorasMes` | Catálogo 100/180/192/200/220… — **não há 210h/42h** no exemplo analisado (gap de parametrização etapa 1). |
| `CentrosCustos`, `Cargos`, `Folhas` | Agrupamento e estrutura de folha. |
| `HorariosTiposDiasAT` (+ objetos 3147/3148 citados na ata) | Dias de auxílio-transporte / compra VT ligados ao horário. |
| `TiposEscalas` / `TiposEscalasTrabalhos` | Domínios de tipo de escala (eSocial / estrutura). |

O dicionário lista **~195** tabelas com campo `*CdiHorario*` (muitas cópias de orçamento `ContratadosB*`). A planilha reduz o escopo operacional a **115** vínculos / **69** objetos — priorizar esses para diagnóstico e para o adapter do simulador.

Classificação no dicionário: Usuário (~6,7k), Mista (~1,8k), Apdata (~1,4k). Assunto “Controle de Frequência” sozinho tem 400+ tabelas.

## Integração com o simulador 6×1

Estado atual do produto (MVP):

- Import canônico: CSV `;` (`docs/import-layout.md`) → `PayrollRow` em `src/engine/payroll.ts`.
- Motor: fator de escala, buffer, encargos proxy, VR/VT, sugestão allowlist (`5x2` / `turnos_8h` / `4x3`) — `docs/engine-assumptions.md`, `docs/schedule-policy.md`.
- MVP declara **fora de escopo** integração ERP/folha (`docs/mvp-plan.md`); MCP seria a ponte **opcional** pós-MVP, sem substituir o CSV.

### Mapeamento campo Apdata → CSV do motor

| CSV simulador | Origem Apdata (leitura) | Notas |
|---------------|-------------------------|--------|
| `cargo` | `Cargos` ← `CON_CdiCargo` | Descrição do cargo. |
| `salario` | `CON_VlnSalario` (ou integral, conforme política) | Bruto mensal; horistas: validar salário-hora × horas-mês. |
| `carga_horaria_mensal` | `QuantidadesHorasMes.HMV_QtnQuantidadeHoraMes` via `CON_CdiQuantidadeHoraMes` | Etapa 1: 220→210 exige código novo no cadastro. |
| `carga_horaria_semanal` | `HOR_QtnHorasSemanal` ou HMV | Etapa 1 teto 42h; etapa 2 40h. |
| `centro_custo` | `CentrosCustos` ← `CON_CdiCentroCusto` | Mesma chave de agregação do relatório. |
| `escala_atual` | Ciclo derivado de `HorariosJornadas` × `TiposDiasPonto` | Classificar `6x1`, `5x2`, `12x36`, sábados alternados, etc. — alinhado à análise do cliente piloto. |
| `vr_*` / `vt_*` | Benefícios / `HorariosTiposDiasAT` / planos refeitório | Dias atuais da grade; valor/dia conforme plano vigente. Motor estima dias propostos pela escala-alvo se coluna vazia. |
| `quantidade` | `COUNT(*)` agrupado cargo×CC×horário | Ou 1 linha por contratado (`nome` opcional; anonimizar). |

Wizard (`HC`, salário médio, setor, horário de funcionamento) continua útil quando a base não expõe abertura/fechamento — ou como override consultivo.

**Lacunas vs motor atual (não bloquear; calibrar depois):**

- Divisor 220→210 e salário-hora de horistas (PEC) ≠ só `scaleFactor` de dias trabalhados.
- `12x36` / plantão: ler como status quo; **não** sugerir (política já no MVP).
- DSR, HE, adicional noturno, provisões, S-2206: fora do motor v1 — cabem no relatório consultivo / disclaimer, não no Δ folha simplificado.
- Calibração (`docs/learning-motor.md`): feedback local; depois, snapshots anonimizados de bases reais.

Fluxo alvo:

```text
Dicionário SQLite (ZIP) ──guia──► MCP MSSQL/Oracle (SELECT)
        │                              │
        │                              ▼
        │                     Adapter → PayrollRow[] / CSV
        │                              │
        └──────────────────────────────► Motor simulate / suggest
```

## Esboço de MCP (somente leitura) — ainda não implementar

Dois papéis complementares (já esboçados na prática pelo doc do cliente piloto + ComandosDml):

### A) `apdata-dictionary` (local, offline)

Fonte: `indice/dicionario-*.db` (e opcionalmente a planilha de objetos).

| Tool | Função |
|------|--------|
| `list_tables` | Filtrar por `assunto` / nome / `*horario*`. |
| `describe_table` | Campos, PKs, máscaras, índices. |
| `list_relations` | FK lógicas origem→destino. |
| `search_fields` | Ex.: `CdiHorario`, `QtnHorasSemanal`. |
| `horario_impact_objects` | Espelho dos 115 vínculos da planilha. |

Sem credenciais de cliente.

### B) `apdata-folha-readonly` (base do cliente)

Mesmo padrão já usado: MCP MSSQL (ou Oracle) **somente `SELECT`**, allowlist de tabelas, timeout, limite de linhas, sem DML.

| Tool | Função |
|------|--------|
| `ping` / `schema_version` | Sanity check (versão produto / eSocial). |
| `count_active_clt` | Recorte contratados ativos (critérios versionados). |
| `export_payroll_rows` | JOIN contratado×cargo×CC×horário×horas-mês → linhas no layout do simulador (PII mínima / agregação). |
| `classify_schedules` | Ciclo real por `HOR_CdiHorario` + conformidade etapa 1/2 (2 RSR, teto h/semana). |
| `benefit_days_by_schedule` | VT/VR/refeitório por horário. |
| `run_readonly_sql` | Opcional, sandboxed: SELECT allowlisted — ou omitir e forçar só tools tipadas. |

**Não expor** no MCP: UPDATE/INSERT, troca em massa de horário, scripts gerados pelo ComandosDml contra produção. ComandosDml continua ferramenta humana de suporte; o simulador só consome leituras agregadas.

Config: DSN/secret fora do repo (Cursor secrets / env); nunca no ZIP nem no chat.

## Riscos

| Risco | Mitigação |
|-------|-----------|
| ZIP com `.git` + dicionário grande no Git | Git LFS ou artefato separado; não misturar secrets. |
| Dicionário ≠ versão da base (ex.: TEMP sem tabelas novas) | Conferir build cliente (ex. 5.59.x) antes de queries. |
| Base TEMP sem movimentos de ponto | Δ HE/faltas/reflexos só com produção ou cópia completa. |
| Classificar escala pela descrição | Usar ciclo `HorariosJornadas` × tipos de dia. |
| PII / LGPD em `Contratados` | Agregar; sem CPF/nome no default do export. |
| Escopo “consultoria vs suporte” (ata) | Simulador = diagnóstico/estimativa; não rotina de virada de horário. |
| Motor subestima divisor/salário-hora | Estender cenário ou camada “PEC etapa 1” além do `scaleFactor` dias. |
| MCP com escrita acidental | Conta DB read-only + deny DML no driver. |

## Próximos passos recomendados

1. **Adapter CSV** — SQL tipado (recortar CLT ativos → `PayrollRow`) validado na mesma base TEMP da análise; diff vs export manual.
2. **MCP dictionary** — tools A sobre o `.db` do ZIP (rápido, sem rede).
3. **MCP folha read-only** — tools B com allowlist; reaproveitar queries do docx do cliente piloto (classificação de ciclo + conformidade).
4. **Calibrar motor** — opção etapa 1 (42h + 2 RSR) e etapa 2 (40h); flag horista/divisor; manter blocklist `12x36`.
5. **Painel “cockpit”** (visão ata) — contagens por escala/não conformidade via MCP; o simulador consome o subset para custo.
6. **Só então** — UI “Importar da Apdata” no wizard; CSV permanece fallback (`mvp-plan`).

## Referências cruzadas

- `docs/mvp-plan.md`, `docs/import-layout.md`, `docs/engine-assumptions.md`, `docs/schedule-policy.md`, `docs/learning-motor.md`, `docs/sample-folha-validacao.csv`
- `src/engine/payroll.ts`, `simulate.ts`, `schedule-policy.ts`
- Pacote: `ESCALA6X1.zip` na raiz do repo (blob; conteúdo analisado em temp, sem extrair nomes sensíveis para o tree)
