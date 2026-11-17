/**
 * In-app Apdata → Turnocheck CSV mapping (LGPD-safe: IDs, counts, flags only).
 * Source of truth: docs/apdata-turnocheck-mapping.md
 */

interface MapeamentoPanelProps {
  open: boolean
  onClose: () => void
}

const CSV_FIELDS: {
  csv: string
  origem: string
  notas: string
}[] = [
  {
    csv: 'cargo',
    origem: 'Cargos.CAR_D1sCargo ← CON_CdiCargo',
    notas: 'Texto do cargo. Agregar por cargo×CC×escala.',
  },
  {
    csv: 'salario',
    origem: 'CON_VlnSalario (fallback CON_VlnSalarioIntegral)',
    notas:
      'Bruto mensal. TEMP: zerado — validar em base com folha. Horista: salário-hora × HMV_QtnQuantidadeHoraMes.',
  },
  {
    csv: 'carga_horaria_mensal',
    origem: 'QuantidadesHorasMes.HMV_QtnQuantidadeHoraMes ← CON_CdiQuantidadeHoraMes',
    notas:
      'Preferir HMV ao HOR_QtnHorasMensais. Catálogo TEMP: 0…220 (dominante 220). Sem 210.',
  },
  {
    csv: 'carga_horaria_semanal',
    origem: 'HMV_QtnHorasSemanal ou HOR_QtnHorasSemanal',
    notas: 'HMV alinhado ao contratado; HOR como fallback. Dominante 44.',
  },
  {
    csv: 'centro_custo',
    origem: 'CentrosCustos.CCU_D1sCentroCusto / CCU_CosEstrutura / CCU_CosReferencia',
    notas:
      'Preferir código interno (CCU_CosEstrutura). Não exportar nomes de cliente embutidos.',
  },
  {
    csv: 'escala_atual',
    origem: 'Ciclo HorariosJornadas × TiposDiasPonto',
    notas:
      'Classificar 6x1 / 5x2 / 4x3 / 12x36 / other. Não usar só HOR_D1sHorario nem só HOR_CdiTipoEscala.',
  },
  {
    csv: 'vr_valor_dia',
    origem: 'PlanosBeneficiosValores.PBV_VlnBeneficio via plano tipo 53 (VR)',
    notas:
      'Tipo 52 (VA) parece mensal — não mapear direto. Refeitório (20): fora do VR/dia.',
  },
  {
    csv: 'vr_dias_mes_atual',
    origem: 'Dias trabalho do ciclo × 30/cycle_len ou HOB_QtiDiasBeneficioFixo se > 0',
    notas: 'TEMP: HOB inútil. Estimativa: work_days / cycle_len × 30 (ex. 6×1 → 26).',
  },
  {
    csv: 'vt_valor_dia',
    origem:
      'Σ(CAS_QtiPassesDia × MRI_VlnUnitario) — ConATransportes × MeiosTransportesItens',
    notas:
      'Ativo: CAS_DtdFim IS NULL + não desativado. Sem ConCalculoATransportes. Override opcional no fluxo.',
  },
  {
    csv: 'vt_dias_mes_atual',
    origem:
      'HorariosTiposDiasAT ∩ HorariosJornadas com TIP_OplTrabalho=1 (tipo 88 cobre 2ª–6ª)',
    notas:
      '≈ 30 × at_work_days / cycle_len. Sem AT → vazio (motor estima). Não usar CCA_QtiTotalDias.',
  },
  {
    csv: 'quantidade',
    origem: 'COUNT(*) grupo cargo×CC×horário',
    notas: 'Default export agregado (sem PII). Alternativa: 1 linha/contratado sem nome.',
  },
  {
    csv: 'nome',
    origem: '(omitir)',
    notas: 'Opcional no CSV; não preencher a partir de CON_DssNome no default LGPD.',
  },
]

const ESCALA_RULES: { codigo: string; regra: string; status: string }[] = [
  {
    codigo: '6x1',
    regra: 'cycle_len=7 ∧ work_days=6 ∧ off_days=1',
    status: 'Só Atual — nunca sugerir',
  },
  {
    codigo: '5x2',
    regra: 'cycle_len=7 ∧ work_days=5 ∧ off_days=2',
    status: 'Candidata',
  },
  {
    codigo: '12x36',
    regra: 'HOR_CdiTipoEscala=3 ou ciclo 2d 1T+1F / padrões 14d com 7T',
    status: 'Status quo — não sugerir',
  },
  {
    codigo: '4x3',
    regra: 'cycle_len=7 ∧ work_days=4 ∧ off_days=3',
    status: 'Candidata (cenário agressivo)',
  },
  {
    codigo: 'other',
    regra: 'Demais (ciclos 28/31, mistos C/F)',
    status: 'Wizard / revisão humana',
  },
]

const TIPOS_DIA: { id: number; trabalho: number; sigla: string; uso: string }[] = [
  { id: 1, trabalho: 1, sigla: 'T', uso: 'Trabalho' },
  { id: 2, trabalho: 0, sigla: 'F', uso: 'Folga' },
  { id: 3, trabalho: 0, sigla: 'C', uso: 'Compensado' },
  { id: 4, trabalho: 0, sigla: 'D', uso: 'DSR / descanso' },
  { id: 5, trabalho: 0, sigla: 'P', uso: 'Outro não-trabalho' },
]

const SELECT_CICLO = `SELECT hj.HRI_CdiHorario,
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
GROUP BY hj.HRI_CdiHorario;`

const SELECT_EXPORT = `;WITH ciclo AS (
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
),
at_mask AS (
  SELECT HTD_CdiHorario, HTD_CdiTipoDiaCalendario
  FROM dbo.HorariosTiposDiasAT
  WHERE ISNULL(HTD_OplDesativado, 0) = 0
),
ciclo_vt AS (
  SELECT hj.HRI_CdiHorario,
         COUNT(*) AS cycle_len,
         SUM(CASE
               WHEN td.TIP_OplTrabalho = 1
                AND (
                  EXISTS (
                    SELECT 1 FROM at_mask m
                    WHERE m.HTD_CdiHorario = hj.HRI_CdiHorario
                      AND m.HTD_CdiTipoDiaCalendario = hj.HRI_CdiTipoDiaCalendario
                  )
                  OR (
                    EXISTS (
                      SELECT 1 FROM at_mask m
                      WHERE m.HTD_CdiHorario = hj.HRI_CdiHorario
                        AND m.HTD_CdiTipoDiaCalendario = 88
                    )
                    AND hj.HRI_CdiTipoDiaCalendario BETWEEN 2 AND 6
                  )
                )
               THEN 1 ELSE 0
             END) AS at_work_days
  FROM dbo.HorariosJornadas hj
  JOIN dbo.TiposDiasPonto td ON td.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
  WHERE ISNULL(hj.HRI_OplDesativado, 0) = 0
  GROUP BY hj.HRI_CdiHorario
),
preco AS (
  SELECT MRI_CdiMeioTransporte, MRI_VlnUnitario,
         ROW_NUMBER() OVER (
           PARTITION BY MRI_CdiMeioTransporte
           ORDER BY MRI_DtdInicioVigencia DESC) AS rn
  FROM dbo.MeiosTransportesItens
  WHERE ISNULL(MRI_OplDesativado, 0) = 0
),
vt_cad AS (
  SELECT a.CAS_CdiContratado,
         SUM(CAST(ISNULL(a.CAS_QtiPassesDia, 0) AS float)
             * ISNULL(p.MRI_VlnUnitario, 0)) AS vt_valor_dia
  FROM dbo.ConATransportes a
  LEFT JOIN preco p
    ON p.MRI_CdiMeioTransporte = a.CAS_CdiMeioTransporte AND p.rn = 1
  WHERE ISNULL(a.CAS_OplDesativado, 0) = 0
    AND a.CAS_DtdFim IS NULL
  GROUP BY a.CAS_CdiContratado
)
SELECT
  emp.EMP_NusCNPJPrefixo                   AS cnpj_prefixo,
  loc.LOC_NusCNPJSufixo                    AS cnpj_sufixo,
  car.CAR_D1sCargo                         AS cargo,
  AVG(NULLIF(con.CON_VlnSalario, 0))       AS salario,
  hmv.HMV_QtnQuantidadeHoraMes             AS carga_horaria_mensal,
  hmv.HMV_QtnHorasSemanal                  AS carga_horaria_semanal,
  ccu.CCU_CosEstrutura                     AS centro_custo,
  CASE
    WHEN hor.HOR_CdiTipoEscala = 3 THEN '12x36'
    ELSE ISNULL(cl.escala_ciclo, 'other')
  END                                      AS escala_atual,
  CASE
    WHEN cl.cycle_len > 0
      THEN ROUND(30.0 * cl.work_days / cl.cycle_len, 1)
  END                                      AS vr_dias_mes_atual,
  AVG(vt.vt_valor_dia)                     AS vt_valor_dia,
  CASE
    WHEN cv.cycle_len > 0 AND cv.at_work_days > 0
      THEN ROUND(30.0 * cv.at_work_days / cv.cycle_len, 1)
  END                                      AS vt_dias_mes_atual,
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
LEFT JOIN ciclo_vt cv ON cv.HRI_CdiHorario = con.CON_CdiHorario
LEFT JOIN vt_cad vt ON vt.CAS_CdiContratado = con.CON_CdiContratado
WHERE con.CON_CdiSituacao NOT IN (0, 2, 3, 99)
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
  cl.work_days,
  cv.cycle_len,
  cv.at_work_days;`

const SELECT_VR = `SELECT pb.PLB_CdiPlanoBeneficio,
       AVG(pbv.PBV_VlnBeneficio) AS vr_valor_dia
FROM dbo.PlanosBeneficios pb
JOIN dbo.TiposBeneficiosEntsBens ebt
  ON ebt.EBT_CdiTipoBeneficioEntBen = pb.PLB_CdiTipoBeneficioEntBen
JOIN dbo.TiposBeneficios tbe
  ON tbe.TBE_CdiTipoBeneficio = ebt.EBT_CdiTipoBeneficio
JOIN dbo.PlanosBeneficiosValores pbv
  ON pbv.PBV_CdiPlanoBeneficio = pb.PLB_CdiPlanoBeneficio
WHERE tbe.TBE_CdiTipoBeneficio = 53
  AND ISNULL(pb.PLB_OplDesativado, 0) = 0
  AND ISNULL(pbv.PBV_OplDesativado, 0) = 0
  AND ISNULL(pbv.PBV_VlnBeneficio, 0) > 0
GROUP BY pb.PLB_CdiPlanoBeneficio;`

const GAPS: { item: string; status: string }[] = [
  { item: 'Tabelas-núcleo existem', status: 'OK' },
  { item: 'Ciclo via HorariosJornadas', status: 'OK' },
  { item: 'Classificar 6×1 / 5×2', status: 'OK' },
  { item: 'HMV 220/44 dominante', status: 'OK; sem 210' },
  { item: 'Export sem PII', status: 'OK se omitir nome e usar CCU_CosEstrutura' },
  { item: 'salario preenchível', status: 'Falha (zerado nesta TEMP)' },
  { item: 'vr_valor_dia', status: 'OK via planos tipo 53' },
  { item: 'vt_valor_dia', status: 'OK via ConATransportes × MeiosTransportesItens' },
  { item: '12x36 detectável', status: 'OK (HOR_CdiTipoEscala=3)' },
]

function SqlBlock({ title, sql }: { title: string; sql: string }) {
  return (
    <details className="border border-[var(--color-line)] bg-white/60">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]/40">
        {title}
      </summary>
      <pre className="overflow-x-auto border-t border-[var(--color-line)] bg-[var(--color-ink)]/95 p-3 text-xs leading-relaxed text-[var(--color-accent-soft)]">
        {sql}
      </pre>
    </details>
  )
}

export function MapeamentoPanel({ open, onClose }: MapeamentoPanelProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[var(--color-ink)]/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mapeamento-title"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-3xl border border-[var(--color-line)] bg-[var(--color-paper)] p-5 shadow-lg sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="mapeamento-title"
              className="text-xl font-semibold text-[var(--color-ink)]"
            >
              Mapeamento Apdata → CSV
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Adapter SELECT-only: campos do layout canônico do simulador a partir
              das tabelas Apdata. Separador <code>;</code> · UTF-8.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          >
            Fechar
          </button>
        </div>

        <p className="mt-3 border border-[var(--color-line)] bg-white/50 px-3 py-2 text-xs text-[var(--color-muted)]">
          <strong className="font-medium text-[var(--color-ink)]">LGPD:</strong>{' '}
          amostras e queries usam só IDs, contagens, flags e siglas de ciclo (T/F/C/D).
          Sem nome, CPF, endereço ou descrição que identifique cliente. Default:
          omitir coluna <code>nome</code>; preferir código de CC.
        </p>

        <section className="mt-6">
          <h3 className="text-sm font-semibold tracking-wide text-[var(--color-accent)] uppercase">
            Campo CSV ← Apdata
          </h3>
          <div className="mt-2 overflow-x-auto border border-[var(--color-line)]">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-[var(--color-accent-soft)]/60 text-[var(--color-ink)]">
                <tr>
                  <th className="px-3 py-2 font-medium">CSV</th>
                  <th className="px-3 py-2 font-medium">Origem Apdata</th>
                  <th className="px-3 py-2 font-medium">Notas</th>
                </tr>
              </thead>
              <tbody>
                {CSV_FIELDS.map((row) => (
                  <tr
                    key={row.csv}
                    className="border-t border-[var(--color-line)] bg-white/40 align-top"
                  >
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                      {row.csv}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                      {row.origem}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                      {row.notas}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6">
          <h3 className="text-sm font-semibold tracking-wide text-[var(--color-accent)] uppercase">
            Classificação escala_atual
          </h3>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            De <code>HorariosJornadas</code> ativos, ordenados por{' '}
            <code>HRI_NuiOrdem</code>: work_days / off_days / cycle_len.
          </p>
          <div className="mt-2 overflow-x-auto border border-[var(--color-line)]">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="bg-[var(--color-accent-soft)]/60">
                <tr>
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Regra</th>
                  <th className="px-3 py-2 font-medium">Motor</th>
                </tr>
              </thead>
              <tbody>
                {ESCALA_RULES.map((row) => (
                  <tr
                    key={row.codigo}
                    className="border-t border-[var(--color-line)] bg-white/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs">{row.codigo}</td>
                    <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                      {row.regra}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                      {row.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 className="mt-4 text-xs font-semibold text-[var(--color-ink)]">
            TiposDiasPonto (ciclo)
          </h4>
          <div className="mt-1 flex flex-wrap gap-2">
            {TIPOS_DIA.map((t) => (
              <span
                key={t.id}
                className="border border-[var(--color-line)] bg-white/70 px-2 py-1 text-xs text-[var(--color-muted)]"
              >
                <span className="font-mono text-[var(--color-ink)]">{t.sigla}</span>
                {' · '}
                {t.uso}
                {t.trabalho === 1 ? ' (trabalho)' : ''}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-6 space-y-2">
          <h3 className="text-sm font-semibold tracking-wide text-[var(--color-accent)] uppercase">
            SELECT (somente leitura)
          </h3>
          <p className="text-sm text-[var(--color-muted)]">
            Não selecionar nome/CPF/endereço. Sobrepor{' '}
            <code>12x36</code> quando <code>HOR_CdiTipoEscala = 3</code>.
          </p>
          <SqlBlock title="B) Ciclo por horário → classificador" sql={SELECT_CICLO} />
          <SqlBlock
            title="C) Export agregado → colunas CSV (sem PII)"
            sql={SELECT_EXPORT}
          />
          <SqlBlock title="D) VR valor/dia (planos tipo 53)" sql={SELECT_VR} />
        </section>

        <section className="mt-6">
          <h3 className="text-sm font-semibold tracking-wide text-[var(--color-accent)] uppercase">
            Checklist TEMP
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {GAPS.map((g) => (
              <li
                key={g.item}
                className="flex flex-wrap gap-x-2 border-b border-[var(--color-line)]/60 py-1.5"
              >
                <span className="text-[var(--color-ink)]">{g.item}</span>
                <span className="text-[var(--color-muted)]">— {g.status}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-6 text-xs text-[var(--color-muted)]">
          Documentação completa: <code>docs/apdata-turnocheck-mapping.md</code>.
          Conexão de base: painel <strong className="font-medium">Ambientes</strong>.
        </p>
      </div>
    </div>
  )
}
