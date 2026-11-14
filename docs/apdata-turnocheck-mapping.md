# Mapeamento Apdata → Turnocheck CSV

Adapter SELECT-only: base TEMP `apdata_6x1` no container `mssql-apdata-6x1` (VPS, bind `127.0.0.1:1433`) → layout canônico do simulador ([import-layout.md](import-layout.md)). Alinha e detalha o esboço de [apdata-6x1-feasibility.md](apdata-6x1-feasibility.md). Política de sugestão de escala: [schedule-policy.md](schedule-policy.md).

**LGPD:** amostras abaixo são só IDs, contagens, flags e padrões de ciclo (siglas T/F/C/D). Sem `CON_DssNome`, CPF, endereço, nome de CC/cliente ou descrição literal de horário que identifique o caso.

**Verificado em:** 2026-11-14 · SQL Server 2022 CU28 · DB `apdata_6x1` ONLINE · engine compat 100.

## Inventário verificado (TEMP)

| Tabela | Rows (approx) | Papel no adapter |
|--------|---------------|------------------|
| `Horarios` | 363 | Cadastro do horário (h/sem, h/mês, tipo escala, regime) |
| `HorariosJornadas` | 2 906 | Sequência do ciclo (ordem × tipo dia × jornada) |
| `Jornadas` | 217 | Carga prevista do dia (`JOR_HrdTotalHorasPrevistasTrab`) |
| `TiposDiasPonto` | 9 | Trabalho vs folga (`TIP_OplTrabalho`, siglas T/F/C/D/P) |
| `Contratados` | 64 903 | Vínculo → cargo, CC, horário, HMV, salário, situação |
| `QuantidadesHorasMes` | 16 | Catálogo horas-mês / horas-semana (sem código 210) |
| `Cargos` | 2 225 | `CAR_D1sCargo` → `cargo` |
| `CentrosCustos` | 2 000 | `CCU_D1sCentroCusto` / `CCU_CosEstrutura` → `centro_custo` |
| `Folhas` | 437 | Ponte `CON_CdiFolha` → local (filtro CNPJ) |
| `Locais` | — | `LOC_CdiEmpresa` + `LOC_NusCNPJSufixo` + `LOC_D1sLocal` (filial) |
| `Empresas` | — | `EMP_NusCNPJPrefixo` + `EMP_DssEmpresa` (razão) + `EMP_CdiRamoAtividadeEmpresa` |
| `Vinculos` | — | `VIN_D1sVinculo` ← tipo de vínculo (`CON_CdiVinculo`) |
| `RamosAtividadesEmpresas` | — | `RAE_D1sRamoAtividadeEmpresa` ← ramos de serviço |
| `HorariosTiposDiasAT` | 1 072 | Dias de calendário elegíveis a auxílio-transporte |
| `TiposEscalas` | 8 | Domínio eSocial / tipo de jornada |
| `TiposDiasCalendarios` | 12 | Dom/Seg…/Feriado/`88`=2ª–6ª |
| `HorariosBeneficios` | 363 | `HOB_QtiDiasBeneficioFixo` (nesta TEMP: todos 0) |
| `ConBeneficios` | 62 980 | Plano de benefício por contratado |
| `PlanosBeneficios` / `…Valores` | 71 / 149 | Tipo + valor (VR/VA) |
| `TiposBeneficios` | — | 52=VA, 53=VR, 20=refeitório; **sem tipo VT dedicado** |
| `RegimesJornadaTrabalho` | 5 | Cap. II CLT / art. 62 / teletrabalho |

### Recorte headcount / export (contagens, sem PII)

| Critério | N | Notas |
|----------|---|--------|
| `CON_CdiSituacao = 1` (Em Atividade Normal) | 778 | Incluído |
| `CON_CdiSituacao NOT IN (0, 2, 3, 99)` | — | **Regra de export** — ativos + afastados etc. |
| `CON_DtdRescisao IS NULL` | 3 289 | Inclui afastados / outros |
| `CON_CdiSituacao = 2` (demitido meses ant.) | 63 798 | Excluído (junto com 0, 3, 99) |

**CNPJ estabelecimento:** `CON_CdiFolha` → `FOL_CdiLocal` → `LOC_CdiEmpresa` → `EMP_NusCNPJPrefixo` + `LOC_NusCNPJSufixo`. UI: `EMP_DssEmpresa` · `LOC_D1sLocal` · CNPJ formatado + **totais de colaboradores por tipo de vínculo** (`CON_CdiVinculo` → `Vinculos.VIN_D1sVinculo`, sit `NOT IN (0,2,3,99)`). Não usar `TiposContratos` / `CON_CdiTipoContrato` (coluna inexistente em `Contratados`). Admin runtime OK; não hardcodar nomes em git.

**Ramos de serviço:** `Empresas.EMP_CdiRamoAtividadeEmpresa` → `RamosAtividadesEmpresas.RAE_CdiRamoAtividadeEmpresa` (`RAE_D1sRamoAtividadeEmpresa`). Lista data-driven no fluxo Apdata→Simular; keywords mapeiam para `SectorId` (varejo / hospital / construção / locação) para atrito.

Entre sit=1 (referência TEMP): 63 horários distintos, 121 CC, 232 cargos; HMV dominante **220h/44h** (613). Classificação de ciclo (sit=1): **5×2-like** 577 · **other** 194 · **6×1** 7.

### Gaps desta TEMP (não bloqueiam o mapa)

1. **`CON_VlnSalario` / `CON_VlnSalarioIntegral` = 0** em todos os sit=1 — CSV exigirá salário de outra fonte ou override manual até base com remuneração.
2. **`QuantidadesHorasMes` não tem 210** (nem 42h semanais dedicados) — gap PEC etapa 1 já previsto na feasibility.
3. **`HorariosBeneficios.HOB_QtiDiasBeneficioFixo` = 0** em 363/363 — dias VR/VT pelo ciclo / AT, não por esse campo.
4. **`ConBeneficios.CBN_OplAtivo = 0` em todos** — nesta cópia use `CBN_DtdFim IS NULL` (≈40 k) em vez do flag.
5. VT não aparece como `TiposBeneficios`; usar `ConATransportes` × `MeiosTransportesItens` para `vt_valor_dia` e `HorariosTiposDiasAT` ∩ jornada (`TIP_OplTrabalho=1`) para dias. **Ignorar `ConCalculoATransportes`.**

## Campo CSV ← Apdata

Separador `;` · UTF-8 · cabeçalho exato ([import-layout.md](import-layout.md)).

| CSV Turnocheck | Origem Apdata | Transformação / notas |
|----------------|---------------|------------------------|
| `cargo` | `Cargos.CAR_D1sCargo` ← `CON_CdiCargo` | Texto do cargo. Agregar por cargo×CC×escala. |
| `salario` | `CON_VlnSalario` (fallback `CON_VlnSalarioIntegral`) | Bruto mensal. **TEMP: zerado** — validar em base com folha. Horista: salário-hora × `HMV_QtnQuantidadeHoraMes`. |
| `carga_horaria_mensal` | `QuantidadesHorasMes.HMV_QtnQuantidadeHoraMes` ← `CON_CdiQuantidadeHoraMes` | Preferir HMV ao `HOR_QtnHorasMensais` (cadastro do horário pode divergir). Catálogo TEMP: 0, 44, 72, 80, 96, 100, 110, 120, 125, 150, 180, **220**. Sem 210. |
| `carga_horaria_semanal` | `HMV_QtnHorasSemanal` ou `HOR_QtnHorasSemanal` | HMV alinhado ao contratado; HOR como fallback. Dominante 44. |
| `centro_custo` | `CentrosCustos.CCU_D1sCentroCusto` (ou `CCU_CosEstrutura` / `CCU_CosReferencia`) | Mesma chave de agregação do relatório. Não exportar nomes de cliente embutidos se houver — preferir código interno. |
| `escala_atual` | Ciclo `HorariosJornadas` × `TiposDiasPonto` | Ver § Classificação. Não usar só `HOR_D1sHorario` nem só `HOR_CdiTipoEscala`. |
| `vr_valor_dia` | `PlanosBeneficiosValores.PBV_VlnBeneficio` via plano tipo **53** (Vale-Refeição) | Nesta TEMP média ≈ **30.56** nos planos VR. Tipo **52** (VA) ≈ 361 parece mensal — **não** mapear direto para `vr_valor_dia`. Refeitório (20): fora do VR/dia do motor. |
| `vr_dias_mes_atual` | Dias trabalho do ciclo × 30/`cycle_len` **ou** `HOB_QtiDiasBeneficioFixo` se &gt; 0 | TEMP: HOB inútil. Estimativa: `work_days / cycle_len * 30` (ex. 6×1 → 26; 5×2 → ≈21.4). Motor também estima se vazio. |
| `vt_valor_dia` | `Σ(CAS_QtiPassesDia × MRI_VlnUnitario)` — `ConATransportes` × `MeiosTransportesItens` | Ativo: `CAS_DtdFim IS NULL` + não desativado. Sem `ConCalculoATransportes`. Override opcional no fluxo Apdata→Simular. |
| `vt_dias_mes_atual` | `HorariosTiposDiasAT` ∩ dias de `HorariosJornadas` com `TIP_OplTrabalho=1` | Tipo `88` cobre 2ª–6ª. ≈ `30 × at_work / cycle_len`. Sem AT → vazio (motor estima). **Não** usar `CCA_QtiTotalDias`. |
| `quantidade` | `COUNT(*)` grupo cargo×CC×horário (ou HMV/escala) | Default export agregado (sem PII). Alternativa: 1 linha/contratado **sem** `nome`. |
| `nome` | *(omitir)* | Opcional no CSV; **não** preencher a partir de `CON_DssNome` no default LGPD. |

### Domínios auxiliares

**`TiposDiasPonto` (ciclo):**

| Id | `TIP_OplTrabalho` | Sigla | Uso |
|----|-------------------|-------|-----|
| 1 | 1 | T | Trabalho |
| 2 | 0 | F | Folga |
| 3 | 0 | C | Compensado |
| 4 | 0 | D | DSR / descanso |
| 5 | 0 | P | Outro não-trabalho |

**`TiposEscalas` em `Horarios` (nesta TEMP):** 0=Nenhum (239) · 5=folga semanal variável (59) · 2=demais (51) · 3=12×36 (7) · 4=folga outro (7). Útil como pista; **ciclo manda**.

**`RegimesJornadaTrabalho`:** 1 = submetido a horário (Cap. II CLT) — filtro típico “CLT com ponto”.

## Classificação `escala_atual`

Derivar de `HorariosJornadas` ativos (`HRI_OplDesativado` null/0), ordenados por `HRI_NuiOrdem`:

```text
work_days = COUNT onde TIP_OplTrabalho = 1
off_days  = COUNT onde TIP_OplTrabalho = 0
cycle_len = COUNT(*)
```

| Código CSV | Regra | Status no motor ([schedule-policy](schedule-policy.md)) |
|------------|-------|---------------------------------------------------------|
| `6x1` | `cycle_len=7` ∧ `work_days=6` ∧ `off_days=1` | Só **Atual** — nunca sugerir |
| `5x2` | `cycle_len=7` ∧ `work_days=5` ∧ `off_days=2` | Candidata |
| `12x36` | `HOR_CdiTipoEscala=3` **ou** ciclo 2 dias 1T+1F / padrões 14d com 7T | Ler como status quo — **não sugerir** |
| `4x3` | `cycle_len=7` ∧ `work_days=4` ∧ `off_days=3` | Candidata (cenário agressivo) |
| *(vazio / `other`)* | Demais (ciclos 28/31, mistos C/F) | Wizard / revisão humana |

Padrões 7d mais frequentes nesta TEMP (siglas, sem texto de cliente): `TTTTTCD` (75 horários), `TTTTCDT` (32), `CDTTTTT` (26), `TTTTTTD` (13) — este último = clássico 6×1.

Distribuição de comprimentos de ciclo (horários com HJ): 7d dominante (209), depois 31/28/14 (calendário mensal / 12×36-ish).

## Skeletons SELECT (somente leitura)

Placeholders: filtrar folha/empresa conforme ambiente. **Não** selecionar nome/CPF/endereço.

### A) Catálogo HMV (prova de gap 210)

```sql
SELECT HMV_CdiQuantidadeHoraMes,
       HMV_QtnQuantidadeHoraMes,
       HMV_QtnHorasSemanal,
       HMV_QtnQuantidadeHoraDia,
       HMV_QtiFolgas
FROM dbo.QuantidadesHorasMes
WHERE ISNULL(HMV_OplDesativado, 0) = 0
ORDER BY HMV_QtnQuantidadeHoraMes;
```

### B) Ciclo por horário → classificador

```sql
SELECT hj.HRI_CdiHorario,
       COUNT(*) AS cycle_len,
       SUM(CASE WHEN td.TIP_OplTrabalho = 1 THEN 1 ELSE 0 END) AS work_days,
       SUM(CASE WHEN td.TIP_OplTrabalho = 0 THEN 1 ELSE 0 END) AS off_days,
       CASE
         WHEN COUNT(*) = 7
          AND SUM(CASE WHEN td.TIP_OplTrabalho = 1 THEN 1 ELSE 0 END) = 6
          AND SUM(CASE WHEN td.TIP_OplTrabalho = 0 THEN 1 ELSE 0 END) = 1
           THEN '6x1'
         WHEN COUNT(*) = 7
          AND SUM(CASE WHEN td.TIP_OplTrabalho = 1 THEN 1 ELSE 0 END) = 5
          AND SUM(CASE WHEN td.TIP_OplTrabalho = 0 THEN 1 ELSE 0 END) = 2
           THEN '5x2'
         WHEN COUNT(*) = 7
          AND SUM(CASE WHEN td.TIP_OplTrabalho = 1 THEN 1 ELSE 0 END) = 4
          AND SUM(CASE WHEN td.TIP_OplTrabalho = 0 THEN 1 ELSE 0 END) = 3
           THEN '4x3'
         ELSE 'other'
       END AS escala_atual
FROM dbo.HorariosJornadas hj
JOIN dbo.TiposDiasPonto td
  ON td.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
WHERE ISNULL(hj.HRI_OplDesativado, 0) = 0
GROUP BY hj.HRI_CdiHorario;
```

Sobrepor `12x36` quando `Horarios.HOR_CdiTipoEscala = 3` (mesmo se o CASE acima der `other`).

### C) Export agregado → colunas CSV (sem PII)

```sql
;WITH ciclo AS (
  SELECT hj.HRI_CdiHorario,
         COUNT(*) AS cycle_len,
         SUM(CASE WHEN td.TIP_OplTrabalho = 1 THEN 1 ELSE 0 END) AS work_days,
         SUM(CASE WHEN td.TIP_OplTrabalho = 0 THEN 1 ELSE 0 END) AS off_days
  FROM dbo.HorariosJornadas hj
  JOIN dbo.TiposDiasPonto td ON td.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
  WHERE ISNULL(hj.HRI_OplDesativado, 0) = 0
  GROUP BY hj.HRI_CdiHorario
),
class AS (
  SELECT HRI_CdiHorario, cycle_len, work_days, off_days,
         CASE
           WHEN cycle_len = 7 AND work_days = 6 AND off_days = 1 THEN '6x1'
           WHEN cycle_len = 7 AND work_days = 5 AND off_days = 2 THEN '5x2'
           WHEN cycle_len = 7 AND work_days = 4 AND off_days = 3 THEN '4x3'
           ELSE 'other'
         END AS escala_ciclo
  FROM ciclo
)
SELECT
  car.CAR_D1sCargo                         AS cargo,
  AVG(NULLIF(con.CON_VlnSalario, 0))       AS salario,  -- pode ser NULL nesta TEMP
  hmv.HMV_QtnQuantidadeHoraMes             AS carga_horaria_mensal,
  hmv.HMV_QtnHorasSemanal                  AS carga_horaria_semanal,
  ccu.CCU_CosEstrutura                     AS centro_custo,  -- código; evite D1s se identificar cliente
  CASE
    WHEN hor.HOR_CdiTipoEscala = 3 THEN '12x36'
    ELSE ISNULL(cl.escala_ciclo, 'other')
  END                                      AS escala_atual,
  CASE
    WHEN cl.cycle_len > 0
      THEN ROUND(30.0 * cl.work_days / cl.cycle_len, 1)
  END                                      AS vr_dias_mes_atual,  -- estimativa
  -- vt_valor_dia / vt_dias_mes_atual: ver SELECT E (ConATransportes × AT ∩ trabalho).
  -- Runtime Apdata→Simular preenche via allowlist single-table + join cliente.
  COUNT(*)                                 AS quantidade
FROM dbo.Contratados con
JOIN dbo.Folhas fol ON fol.FOL_CdiFolha = con.CON_CdiFolha
JOIN dbo.Locais loc ON loc.LOC_CdiLocal = fol.FOL_CdiLocal
JOIN dbo.Empresas emp ON emp.EMP_CdiEmpresa = loc.LOC_CdiEmpresa
JOIN dbo.Cargos car ON car.CAR_CdiCargo = con.CON_CdiCargo
JOIN dbo.CentrosCustos ccu ON ccu.CCU_CdiCentroCusto = con.CON_CdiCentroCusto
LEFT JOIN dbo.QuantidadesHorasMes hmv
  ON hmv.HMV_CdiQuantidadeHoraMes = con.CON_CdiQuantidadeHoraMes
LEFT JOIN dbo.Horarios hor ON hor.HOR_CdiHorario = con.CON_CdiHorario
LEFT JOIN class cl ON cl.HRI_CdiHorario = con.CON_CdiHorario
WHERE con.CON_CdiSituacao NOT IN (0, 2, 3, 99)
  -- AND estabelecimento (EMP_NusCNPJPrefixo + LOC_NusCNPJSufixo) IN (…)
GROUP BY
  emp.EMP_NusCNPJPrefixo,
  loc.LOC_NusCNPJSufixo,
  car.CAR_D1sCargo,
  hmv.HMV_QtnQuantidadeHoraMes,
  hmv.HMV_QtnHorasSemanal,
  ccu.CCU_CosEstrutura,
  hor.HOR_CdiTipoEscala,
  cl.escala_ciclo,
  cl.cycle_len,
  cl.work_days;
```

Exportar o result set como CSV `;` com cabeçalho do layout. Preencher `vt_*` via SELECT E / adapter (`src/apdata/`). Runtime: allowlist single-table + join cliente (`exportPayroll.ts`) com filtro CNPJ.

### D) VR valor/dia (planos tipo 53)

```sql
SELECT pb.PLB_CdiPlanoBeneficio,
       AVG(pbv.PBV_VlnBeneficio) AS vr_valor_dia
FROM dbo.PlanosBeneficios pb
JOIN dbo.TiposBeneficiosEntsBens ebt
  ON ebt.EBT_CdiTipoBeneficioEntBen = pb.PLB_CdiTipoBeneficioEntBen
JOIN dbo.TiposBeneficios tbe
  ON tbe.TBE_CdiTipoBeneficio = ebt.EBT_CdiTipoBeneficio
JOIN dbo.PlanosBeneficiosValores pbv
  ON pbv.PBV_CdiPlanoBeneficio = pb.PLB_CdiPlanoBeneficio
WHERE tbe.TBE_CdiTipoBeneficio = 53          -- Vale-Refeição
  AND ISNULL(pb.PLB_OplDesativado, 0) = 0
  AND ISNULL(pbv.PBV_OplDesativado, 0) = 0
  AND ISNULL(pbv.PBV_VlnBeneficio, 0) > 0
GROUP BY pb.PLB_CdiPlanoBeneficio;
```

Ligar ao contratado via `ConBeneficios` (`CBN_CdiContratado`, `CBN_CdiPlanoBeneficio`, `CBN_DtdFim IS NULL`). Nesta TEMP `CBN_OplAtivo` não discrimina.

### E) VT valor/dia + dias (ConATransportes × AT ∩ trabalho)

`vt_valor_dia = Σ(CAS_QtiPassesDia × MRI_VlnUnitario)` com `CAS_DtdFim IS NULL`.  
`vt_dias_mes` = máscara `HorariosTiposDiasAT` ∩ dias de jornada com `TIP_OplTrabalho=1` (tipo `88` cobre 2ª–6ª).  
**Não** usar `ConCalculoATransportes`. Skeleton completo: UI Apdata→Simular SELECT E / store `docs/apdata-vt-conatransportes.md`.

```sql
SELECT HTD_CdiHorario,
       COUNT(*) AS n_tipos_calendario,
       SUM(CASE WHEN HTD_CdiTipoDiaCalendario IN (2,3,4,5,6,88) THEN 1 ELSE 0 END) AS cobre_uteis,
       SUM(CASE WHEN HTD_CdiTipoDiaCalendario = 7 THEN 1 ELSE 0 END) AS cobre_sabado,
       SUM(CASE WHEN HTD_CdiTipoDiaCalendario = 1 THEN 1 ELSE 0 END) AS cobre_domingo
FROM dbo.HorariosTiposDiasAT
WHERE ISNULL(HTD_OplDesativado, 0) = 0
GROUP BY HTD_CdiHorario;
```

353 horários com AT; padrão dominante: Dom + Sáb + `88` (2ª–6ª).

### F) Smoke shape horário (sem descrição)

```sql
SELECT TOP 20
  HOR_CdiHorario,
  HOR_QtnHorasSemanal,
  HOR_QtnHorasMensais,
  HOR_CdiTipoEscala,
  HOR_CdiRegimeJornadaTrabalho,
  HOR_QtiLimiteDiasTrabSemFolga,
  HOR_OplDesativado
FROM dbo.Horarios
WHERE ISNULL(HOR_OplDesativado, 0) = 0
ORDER BY HOR_CdiHorario;
```

## Fluxo adapter → motor

```text
MSSQL apdata_6x1 (SELECT)
  → recorte CON_CdiSituacao NOT IN (0,2,3,99)
  → filtro CNPJ: Folhas→Locais→Empresas (prefixo+sufixo)
  → JOIN cargo × CC × HMV × horário
  → classificar ciclo (B) → escala_atual
  → agregar COUNT → quantidade
  → opcional: VR plano 53 → vr_valor_dia; dias pelo ciclo
  → CSV ;  OU  PayrollRow[] in-process
  → simulate / suggest (blocklist 6x1/12x36 como proposto)
```

Ambiente Turnocheck (**Ambientes**): host `127.0.0.1`, porta `1433`, database `apdata_6x1`, credencial read-only (SA só no host `/root/.secrets/mssql-sa` — nunca no git/docs).

## Checklist de conformidade

| Item | Status nesta TEMP |
|------|-------------------|
| Tabelas-núcleo existem | OK |
| Ciclo via `HorariosJornadas` | OK (2 906 rows) |
| Classificar 6×1 / 5×2 | OK |
| HMV 220/44 dominante | OK; **sem 210** |
| Export sem PII | OK se omitir `nome` e usar `CCU_CosEstrutura` |
| `salario` preenchível | **Falha** (zerado) — blocker de CSV “pronto para motor” |
| `vr_valor_dia` | OK via planos tipo 53 |
| `vt_valor_dia` | OK via `ConATransportes` × `MeiosTransportesItens` |
| `12x36` detectável | OK (`HOR_CdiTipoEscala=3`, 7 horários) |

## Próximo passo técnico

Calibrar salário quando a TEMP/produção tiver `CON_VlnSalario` ≠ 0. Opcional: expandir allowlist para planos VR (query D) em vez do override no fluxo.

## UI Turnocheck

- **Apdata → Simular** (`src/components/ApdataFlowPanel.tsx` + `src/apdata/`): revisão dos SELECTs B/C/D/E/F/G → progresso dos `/api/query/select` (incl. estabelecimentos com razão/filial, `RamosAtividadesEmpresas`, `ConATransportes`, …) → agregação `PayrollRow[]` → `ResultsView`. LGPD: sem `nome` de pessoa; CC por `CCU_CosEstrutura`; nomes de empresa/local só no filtro CNPJ em runtime.
- **Mapeamento** (`src/components/MapeamentoPanel.tsx`): tabela CSV←Apdata e SELECTs de referência.
- **Wizard setores:** varejo, hospital, construção, locação (`src/templates/`).

## Deploy (VPS, após merge)

Só SPA — não exige restart da API se `server/` não mudou:

```bash
cd /var/www/projeto6x1
git pull --ff-only
npm ci && npm run build
pm2 restart projeto6x1
```

Confirmar https://turnocheck.ahrbrasil.com.br/ → botão **Mapeamento** no header.

## Referências

- [apdata-6x1-feasibility.md](apdata-6x1-feasibility.md)
- [import-layout.md](import-layout.md), [schedule-policy.md](schedule-policy.md), [engine-assumptions.md](engine-assumptions.md)
- [ambientes-cliente.md](ambientes-cliente.md)
- `src/engine/payroll.ts` (`PayrollRow`)
