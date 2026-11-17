# Hipóteses do motor de simulação (PEC 6×1)

Documento **user-facing** das fórmulas e premissas do motor em `src/engine/`.  
Os números são **estimativas transparentes** para apoio a consultoria — **não** são parecer jurídico nem cálculo oficial de folha.

## Cenários versionados

| ID | Rótulo | Escala-alvo | Divisor | Teto semanal | Buffer |
|----|--------|-------------|---------|--------------|--------|
| `status_quo` | Status quo | = escala informada | 220 | 44h | 0% |
| `fase1_2026_42h` | Fase 1 — 2026 (42h) | 5×2 | 210 | 42h | 5% |
| `fase2_2027_40h` | Fase 2 — 2027 (40h) | 5×2 | 200 | 40h | 8% |
| `stress_test_4x3` | Stress-test 4×3 | 4×3 | 180 | 36h | 12% |

IDs de regra: `rules-*-v2` / `rules-fase*-v1` (ver `RULE_VERSIONS`).  
Aliases legados: `pec_draft_conservative` → `fase1_2026_42h`; `pec_draft_aggressive` → `stress_test_4x3`.  
Encargos patronais vêm do **regime tributário por CNPJ** (Simples / Lucro Presumido / Lucro Real) + provisões de férias/13º + onboarding — não só do fator flat legado.

### Absorção de gap e HE

- Estratégias: `CONTRATACAO_INTEGRAL`, `HORA_EXTRA_MAXIMA` (teto 44 h/mês por pessoa), `HIBRIDO_INTERMITENTE`.
- Cascata de divisor: HE existente reprecificada em `salário ÷ divisor_cenário` × 1,5.

### Regime de funcionamento / turmas

- `SEG_SEX`, `SEG_SAB`, `CONTINUO_7D`.
- Contínuo: **7 turmas 5×2 rotativas** (`distribuicao_turmas`).

## Fórmulas (v1)

1. **Parse da escala atual** (`6x1`, `6×1`, …) → `workRatio = workDays / (workDays + restDays)`.
2. **Escala-alvo** vem dos parâmetros do cenário (ou da escala atual no status quo).
3. **Fator de escala** (manter os mesmos person-days de cobertura):
   - `scaleFactor = workRatio_atual / workRatio_alvo`
4. **Headcount requerido**:
   - `required = ceil( HC × scaleFactor × (1 + buffer) × atritoSetorial )`
   - piso no HC atual; no status quo o adicional é forçado a **0**.
   - **Exceção (folga fixa):** se o regime já é coberto pelo padrão-alvo com o quadro atual — ex. `SEG_SEX` → 5×2 (folga sáb/dom) ou `SEG_SAB` → ciclo com ≥6 dias de trabalho — o fator **não** infla o HC. Cobertura Mon–Fri (ou Mon–Sáb) já fecha com as mesmas pessoas no mesmo horário; `ceil(1 × 1,2)` não deve inventar a 2ª vaga.
   - **Exceção (contínuo 1 colaborador):** `CONTINUO_7D` com HC atual ≤ 1 e alvo ≥5 dias (5×2) **também** mantém HC=1. Janelas OH longas (09–21 → tiles 09–17 e 13–21) são jornadas legais alternativas, **não** dois postos simultâneos; uma pessoa não ocupa os dois no mesmo dia. O fator CONTINUO segue valendo para quadros maiores e para alvos mais curtos (ex. 4×3).
5. **Folha (salários + encargos)**:
   - Massa salarial atual: sem import = `HC × salário médio`; com import = `Σ(salario × quantidade)` (HC = `Σ quantidade`).
   - **Baseline e projetada** usam a **mesma receita** de encargos/provisões (regime tributário + férias/13º + onboarding + benefícios fixos proxy) sobre a massa respectiva — o Δ não compara “só salário” com “salário+encargos”.
   - Projetada ainda soma Δ HE por queda de divisor (220→210/200/180) e custo de HE de absorção.
   - Com HC igual e sem HE na folha, Δ folha ≈ **0** (status quo e SEG_SEX→5×2 com waiver). Com HE existente, sobra só a cascata do divisor.
   - Delta mensal = projetada − baseline; anual = mensal × 12.
6. **VR / VT** (somente com folha importada; layout canônico em `docs/import-layout.md`):
   - Dias/mês estimados da escala: `dias_mes ≈ round(30 × workRatio)` → 6×1 ≈ 26, 5×2 ≈ 21, 4×3 ≈ 17.
   - Se `vr_dias_mes_atual` / `vt_dias_mes_atual` vierem preenchidos, usam-se esses valores; se vazios, usa-se a estimativa da escala atual (ou `escala_atual` da linha).
   - Modo `ESCALA` (default): proposto recalcula dias pela escala-alvo → com HC igual, 6×1→5×2 **reduz** VR/VT (26→21). Modos `FIXO_MES` / `CALENDARIO_LOCAL`: dias fixos → Δ ≈ 0 se HC igual.
   - **Atual** = `valor_dia × dias_mes_atual × quantidade` (somado nas linhas).
   - **Proposto (quadro atual)** = `valor_dia × dias_mes_proposta(escala-alvo) × quantidade`.
   - **HC adicional** no centro de custo: `média(valor_dia) × dias_mes_proposta × adicional`.
   - Totais gerais = soma dos centros; delta = proposto − atual (mensal e ×12 anual).
   - Se VR/VT **sobem** com HC igual, os dias atuais na folha estão abaixo da estimativa do alvo (checar apuração de jornada / `TIP_OplTrabalho` — PX-133), não o fator de HC.
7. **Gap de cobertura** (se não contratar):
   - `horas/semana ≈ adicional × workDays_alvo × hoursPerShift` (padrão 8h).

`unidades × turnos/dia` entram só como **checagem informativa** nesta versão (não geram um segundo modelo de HC, para evitar contagem dupla).

### Sugestão de escalas / horários (v1)

Política versionada em `docs/schedule-policy.md` e `src/engine/schedule-policy.ts` (`schedule-policy-v1`).

1. **Allowlist** (únicas candidatas): `5x2`, `turnos_8h`, `4x3` (cenário agressivo).
2. **Blocklist** (nunca sugeridas): `6x1` / `6x1_ajustada` (só como **Atual** — PEC aboliria), `12x36`, `24x48`, `sobreaviso_puro`, jornada diária padrão **> 10h**.
3. Por `centro_custo` (folha) ou grupo **Geral** (wizard): o motor propõe **1–2** candidatas com horário início/fim, HC por turno e custo estimado (folha × fator de encargos + VR/VT se houver) vs atual.
4. **Janelas de turno (Proposto / sugestões)** vêm do horário de funcionamento informado (abertura/fechamento; opcional por weekday). Preferência **8h** (teto 10h): janela ≤10h = 1 turno; &gt;10h = N×8h com sobreposição para cobrir as pontas (ex. 09–21 → 09–17 + 13–21) — sem equal-split encurtado (nunca 2×6h). O HC do quadro é **repartido** entre as janelas (Σ = HC requerido); não se inventa 1 pessoa por tile nem se usa `unidades × turnos/dia` como piso de HC. No calendário/Apdata, gente só ocupa quantos tiles a **cobertura diária** pede (posto único → só o 1º tile; tiles vazios ficam HC=0).
   - **Quadro Atual (Baseline):** se a Folha trouxer `horario_trabalho_atual`, os rótulos/bandas do Atual usam essa janela (ou períodos de trabalho parseados; `intervalo Nmin` ignorado). Tiles OH só como fallback quando a Folha não tem janela. Proposto permanece em tiles OH até decisão futura.
5. Ranking: preferido do cenário + menor Δ de custo total mensal (folha+VR+VT). HC da candidata usa o mesmo fator de escala/buffer/atrito do cenário (com waiver de folga fixa).
6. Se o usuário informar uma escala excluída (ex. `12x36`) no wizard, a UI mostra badge **“Excluído da sugestão”** e o motor **não** a recomenda — só candidatas da allowlist.

Plantão hospitalar 12×36 pode aparecer como **status quo** na importação; isso não autoriza sugerir migração *para* 12×36.

### Agregação por centro de custo

Com import, o motor agrupa por `centro_custo` e aplica o mesmo fator de HC / encargos em cada centro (proporcional ao headcount do centro). O relatório mostra Δ folha, Δ VR e Δ VT por centro e no total.

## Atrito setorial (estimativa)

| Setor | Multiplicador | Nota |
|-------|---------------|------|
| Varejo | 1,00 | Baseline |
| Hospital | 1,06 | Operação contínua / cargos críticos |
| Construção / locação | 1,04 / 1,03 | Templates + mapeamento a partir de `RamosAtividadesEmpresas` |

## O que o motor **não** faz

- Não interpreta texto legal da PEC nem CCT/acordo coletivo.
- Não modela horas extras, banco de horas, plantão diferenciado, demografia de cargos ou sazonalidade.
- Não substitui memória de cálculo de encargos (INSS, FGTS, benefícios) — o fator é um *proxy* grosso.
- Não garante que 5×2 / 4×3 seja o desfecho normativo real.
- Não recomenda 12×36, 24×48, sobreaviso puro nem jornadas diárias > 10h como “solução PEC” (ver `schedule-policy.md`).
- VR/VT usam dias úteis da escala × valor/dia informados; não modelam feriados, DSR, desconto de falta nem regras de CCT de vale.

## Calibração aberta (próximos passos)

- Ajustar escalas-alvo e buffers com o texto/emendas que o consultor estiver usando com o cliente.
- Trocar `projectedChargeFactor` por memória de encargos do cliente (ou % real da folha).
- Calibrar atrito hospital (plantão 12×36, etc.) e varejo (domingos/feriados).
- Opcional: usar `unidades × turnos` como motor principal de demanda quando houver dados de postos por turno.
- Validar VR/VT com 1 caso real anonimizado (Fase D) — amostra de validação: `docs/sample-folha-validacao.csv` (espelhada em `public/sample-folha.csv`).
- Validar com 1 caso real anonimizado (Fase D do MVP).

## Disclaimer (sempre exibido)

Simulação estimativa para consultoria. Não constitui parecer jurídico, cálculo oficial de folha nem previsão de todas as mudanças operacionais. Valide hipóteses com assessoria jurídica e RH.
