/* ============================================================================
   TURNOCHECK — EXTRATOR CANÔNICO APDATA (SEM PII / LGPD-SAFE)
   Compatível com Aptools (Exportação CSV) e Conexão Direta Read-Only.
   ============================================================================
   REGRAS APLICADAS:
   1. Zero PII: Nenhum nome, CPF, PIS ou matrícula individual é extraído.
   2. Situação: CON_CdiSituacao NOT IN (0, 2, 3, 99) por padrão; Premissas pode
      excluir afastados (SIT_OplAfastamento=1) via toggle.
   2b. Vínculo: JOIN Vinculos + CategsTrabseSoc (empregatícios) e
      VIN_CdiTipoRegimeTrabalhista IN (1) CLT — Premissas ajusta categoria/regime.
   3. Benefícios: ConBeneficios → PlanosBeneficios → PlanosBeneficiosValores
      (linha com MAX(PBV_DtdInicio) por plano) → TiposBeneficiosEntsBens →
      TiposBeneficios (TBE_*). Ativo: CBN_DtdFim IS NULL (sem CBN_OplDesativado).
      Agregados em beneficios_agg (codigo|descricao|valor;…) sem duplicar
      headcount/salário. Classificação no parser por keywords em TBE_D1sTipoBeneficio.
   4. VT: Soma ativa (CAS_DtdFim IS NULL) em ConATransportes x MeiosTransportesItens.
          (Ignora ConCalculoATransportes conforme regra canônica).
   5. Escalas: TiposDiasPonto = TIP_* (não TDP_*). escala_atual = work_days + 'x' +
      off_days (concat). Ativos: HRI_OplDesativado=0 e HOR_OplDesativado=0.
   6. Sanitização: Remove ';', TAB, '|', quebras de linha de textos
      para não deslocar colunas no export Aptools TXT (TAB) ou CSV.
   7. Prefixos: Contratados=CON, Locais=LOC (não LPC), HorariosJornadas=HRI,
      TiposDiasPonto=TIP, ConATransportes=CAS, MeiosTransportesItens=MRI,
      TiposBeneficios=TBE, JornadasItens=JOI, TiposJornadas=TJO.
      Estabelecimento: CON_CdiFolha → Folhas → Locais(LOC) → Empresas(EMP).
   8. Centro de custo: cod_cc = CCU_CosEstrutura (SEM_CC); desc_cc =
      CCU_D1sCentroCusto (estrutura org.; OK LGPD — sem nome de pessoa).
   8b. Sindicato: LEFT JOIN Sindicatos (SIN_*) via CON_CdiSindicato —
      cod_sindicato / nome_sindicato / cnpj_sindicato (entidade coletiva).
   8c. Horas Base: LEFT JOIN QuantidadesHorasMes (HMV_*) via
      CON_CdiQuantidadeHoraMes — carga_horaria_mensal preferindo HMV;
      carga_semanal_atual = HMV_QtnHorasSemanal com fallback HOR.
   9. Horário trabalho atual: HorariosJornadas → Jornadas → JornadasItens (JOI_*)
      × TiposJornadas.TJO_OplTrabalhada (user: OplConsiderarTrabalho; fallback
      tipo 1=Trabalho). Períodos de trabalho ordenados (HH:MM-HH:MM), unidos
      por " / " (sanitização remove ';' e '|'). Sem step almoço/intervalo entre
      dois blocos, injeta "intervalo Nmin" (gap saída→entrada seguinte).
   ============================================================================
   Aptools: não prefixar com SET TRANSACTION — a ferramenta pode rejeitar.
   Isolation (READ UNCOMMITTED / READ ONLY) fica na conexão API/MCP.
   Oracle Aptools: NÃO terminar o SELECT com `;` (ORA-00933). MSSQL pode
   manter o terminador. O produto (aba Oracle) já omite o `;`.
   ============================================================================ */


/* ----------------------------------------------------------------------------
   [DIALETO 1] MICROSOFT SQL SERVER (MSSQL)
   Run ONLY this block on SQL Server. Do NOT paste into Oracle Aptools.
   Product UI: Extrair via Aptools → tab MSSQL (default).
   ---------------------------------------------------------------------------- */

/* ----------------------------------------------------------------------------
   [DIALETO 1] MICROSOFT SQL SERVER (MSSQL)
   Run ONLY this block on SQL Server. Do NOT paste into Oracle Aptools.
   Product UI: Extrair via Aptools → tab MSSQL (default).
   ---------------------------------------------------------------------------- */

WITH CTE_VT_DIARIO AS (
    SELECT
        cat.CAS_CdiContratado,
        SUM(CAST(ISNULL(cat.CAS_QtiPassesDia, 0) * ISNULL(mti.MRI_VlnUnitario, 0) AS DECIMAL(18,4))) AS vt_valor_dia
    FROM ConATransportes cat
    INNER JOIN MeiosTransportesItens mti
        ON mti.MRI_CdiMeioTransporte = cat.CAS_CdiMeioTransporte
    WHERE cat.CAS_DtdFim IS NULL
      AND ISNULL(cat.CAS_OplDesativado, 0) = 0
    GROUP BY cat.CAS_CdiContratado
),
CTE_CICLO_HORARIO AS (
    SELECT
        hj.HRI_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN ISNULL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days,
        SUM(CASE WHEN ISNULL(tdp.TIP_OplTrabalho, 0) = 0 THEN 1 ELSE 0 END) AS off_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp
        ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    INNER JOIN Horarios hciclo
        ON hciclo.HOR_CdiHorario = hj.HRI_CdiHorario
    WHERE ISNULL(hj.HRI_OplDesativado, 0) = 0
      AND ISNULL(hciclo.HOR_OplDesativado, 0) = 0
    GROUP BY hj.HRI_CdiHorario
),
CTE_HT_ITENS AS (
    SELECT DISTINCT
        hj.HRI_CdiHorario,
        ji.JOI_HrdHoraMinutoInicio AS inicio,
        ji.JOI_HrdHoraMinutoFim AS fim,
        CASE
            WHEN ISNULL(tj.TJO_OplTrabalhada, 0) = 1 OR tj.TJO_CdiTipoJornada = 1
            THEN 1 ELSE 0
        END AS is_work
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp
        ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    INNER JOIN Jornadas j
        ON j.JOR_CdiJornada = hj.HRI_CdiJornada
    INNER JOIN JornadasItens ji
        ON ji.JOI_CdiJornada = j.JOR_CdiJornada
    INNER JOIN TiposJornadas tj
        ON tj.TJO_CdiTipoJornada = ji.JOI_CdiTipoJornada
    WHERE ISNULL(hj.HRI_OplDesativado, 0) = 0
      AND ISNULL(ji.JOI_OplDesativado, 0) = 0
      AND ISNULL(tdp.TIP_OplTrabalho, 0) = 1
),
CTE_HT_WORK AS (
    SELECT
        HRI_CdiHorario,
        inicio,
        fim,
        LEAD(inicio) OVER (PARTITION BY HRI_CdiHorario ORDER BY inicio, fim) AS next_inicio,
        ROW_NUMBER() OVER (PARTITION BY HRI_CdiHorario ORDER BY inicio, fim) AS rn
    FROM CTE_HT_ITENS
    WHERE is_work = 1
),
CTE_HT_PARTS AS (
    SELECT
        w.HRI_CdiHorario,
        w.rn * 2 AS seq,
        CONVERT(varchar(5), w.inicio, 108) + '-' + CONVERT(varchar(5), w.fim, 108) AS part
    FROM CTE_HT_WORK w
    UNION ALL
    SELECT
        w.HRI_CdiHorario,
        w.rn * 2 + 1 AS seq,
        'intervalo ' + CAST(DATEDIFF(minute, w.fim, w.next_inicio) AS varchar(10)) + 'min' AS part
    FROM CTE_HT_WORK w
    WHERE w.next_inicio IS NOT NULL
      AND DATEDIFF(minute, w.fim, w.next_inicio) > 0
      AND NOT EXISTS (
            SELECT 1
            FROM CTE_HT_ITENS i
            WHERE i.HRI_CdiHorario = w.HRI_CdiHorario
              AND i.is_work = 0
              AND i.inicio < w.next_inicio
              AND i.fim > w.fim
          )
),
CTE_HORARIO_TRABALHO AS (
    SELECT
        HRI_CdiHorario,
        STRING_AGG(part, ' / ') WITHIN GROUP (ORDER BY seq) AS horario_trabalho_atual
    FROM CTE_HT_PARTS
    GROUP BY HRI_CdiHorario
),
CTE_BEN_CONTRATO AS (
    SELECT
        cbn.CBN_CdiContratado,
        tbe.TBE_CdiTipoBeneficio AS cod_tipo,
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(tbe.TBE_D1sTipoBeneficio, 'SEM_DESC'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ') AS desc_tipo,
        AVG(CAST(ISNULL(pbv.PBV_VlnBeneficio, 0) AS DECIMAL(18,4))) AS valor_medio
    FROM ConBeneficios cbn
    INNER JOIN PlanosBeneficios plb
        ON plb.PLB_CdiPlanoBeneficio = cbn.CBN_CdiPlanoBeneficio
    INNER JOIN (
SELECT
        p.PBV_CdiPlanoBeneficio,
        p.PBV_VlnBeneficio
    FROM PlanosBeneficiosValores p
    INNER JOIN (
        SELECT
            PBV_CdiPlanoBeneficio,
            MAX(PBV_DtdInicio) AS max_inicio
        FROM PlanosBeneficiosValores
        GROUP BY PBV_CdiPlanoBeneficio
    ) u
        ON u.PBV_CdiPlanoBeneficio = p.PBV_CdiPlanoBeneficio
       AND u.max_inicio = p.PBV_DtdInicio
    ) pbv
        ON pbv.PBV_CdiPlanoBeneficio = plb.PLB_CdiPlanoBeneficio
    INNER JOIN TiposBeneficiosEntsBens ebt
        ON ebt.EBT_CdiTipoBeneficioEntBen = plb.PLB_CdiTipoBeneficioEntBen
    INNER JOIN TiposBeneficios tbe
        ON tbe.TBE_CdiTipoBeneficio = ebt.EBT_CdiTipoBeneficio
    WHERE cbn.CBN_DtdFim IS NULL
    GROUP BY
        cbn.CBN_CdiContratado,
        tbe.TBE_CdiTipoBeneficio,
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(tbe.TBE_D1sTipoBeneficio, 'SEM_DESC'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ')
),
CTE_BEN_COM_CHAVES AS (
    SELECT
        e.EMP_CdiEmpresa,
        l.LOC_CdiLocal,
        ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ') AS cod_cc,
        c.CON_CdiCargo,
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ') AS desc_cargo,
        c.CON_CdiVinculo,
        c.CON_CdiHorario,
        cic.cycle_len,
        cic.work_days,
        cic.off_days,
        ISNULL(hmv.HMV_QtnHorasSemanal, ISNULL(h.HOR_QtnHorasSemanal, 44.0)) AS carga_semanal,
        ISNULL(hmv.HMV_QtnQuantidadeHoraMes, ISNULL(h.HOR_QtnHorasSemanal, 44.0) * 5) AS carga_mensal,
        CAST(ISNULL(c.CON_CdiSindicato, 0) AS VARCHAR(20)) AS cod_sindicato,
        b.cod_tipo,
        b.desc_tipo,
        b.valor_medio
    FROM CTE_BEN_CONTRATO b
    INNER JOIN Contratados c ON c.CON_CdiContratado = b.CBN_CdiContratado
    INNER JOIN Vinculos v ON v.VIN_CdiVinculo = c.CON_CdiVinculo
INNER JOIN CategsTrabseSoc cts ON cts.SDK_CdiCategTrabeSoc = v.VIN_CdiCategTrabeSoc AND ISNULL(cts.SDK_OplVinculoEmpregaticio, 0) = 1
    INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
    INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
    INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
    LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
    LEFT JOIN Cargos cg ON cg.CAR_CdiCargo = c.CON_CdiCargo
    LEFT JOIN Horarios h ON h.HOR_CdiHorario = c.CON_CdiHorario
    LEFT JOIN QuantidadesHorasMes hmv ON hmv.HMV_CdiQuantidadeHoraMes = c.CON_CdiQuantidadeHoraMes
    LEFT JOIN Sindicatos sin ON sin.SIN_CdiSindicato = c.CON_CdiSindicato
    LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
    WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
AND v.VIN_CdiTipoRegimeTrabalhista IN (1)
),
CTE_BEN_GRUPO AS (
    SELECT
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal, carga_mensal, cod_sindicato,
        cod_tipo, desc_tipo,
        AVG(valor_medio) AS valor_medio
    FROM CTE_BEN_COM_CHAVES
    GROUP BY
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal, carga_mensal, cod_sindicato, cod_tipo, desc_tipo
),
CTE_BENEFICIOS_AGG AS (
    SELECT
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal, carga_mensal, cod_sindicato,
        STRING_AGG(
            CAST(cod_tipo AS VARCHAR(20)) + '|' + desc_tipo + '|' +
            CAST(CAST(valor_medio AS DECIMAL(18,2)) AS VARCHAR(40)),
            CHAR(59)
        ) WITHIN GROUP (ORDER BY cod_tipo) AS beneficios_agg
    FROM CTE_BEN_GRUPO
    GROUP BY
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal, carga_mensal, cod_sindicato
)
SELECT
    CAST(e.EMP_CdiEmpresa AS VARCHAR(20)) AS cod_empresa,
    CAST(l.LOC_CdiLocal AS VARCHAR(20)) AS cod_filial,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ') AS cod_cc,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cc.CCU_D1sCentroCusto, ''), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ') AS desc_cc,
    CAST(ISNULL(c.CON_CdiCargo, 0) AS VARCHAR(20)) AS cod_cargo,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ') AS desc_cargo,
    CAST(ISNULL(c.CON_CdiVinculo, 0) AS VARCHAR(20)) AS cod_vinculo,
    CAST(ISNULL(c.CON_CdiHorario, 0) AS VARCHAR(20)) AS cod_horario_atual,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(ht.horario_trabalho_atual, ''), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ') AS horario_trabalho_atual,
    ISNULL(
        CAST(cic.work_days AS VARCHAR(10)) + 'x' + CAST(cic.off_days AS VARCHAR(10)),
        'other'
    ) AS escala_atual,
    CAST(ISNULL(hmv.HMV_QtnHorasSemanal, ISNULL(h.HOR_QtnHorasSemanal, 44.0)) AS DECIMAL(10,2)) AS carga_semanal_atual,
    CAST(ISNULL(hmv.HMV_QtnQuantidadeHoraMes, ISNULL(h.HOR_QtnHorasSemanal, 44.0) * 5) AS DECIMAL(10,2)) AS carga_horaria_mensal,
    CAST(ISNULL(c.CON_CdiSindicato, 0) AS VARCHAR(20)) AS cod_sindicato,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(sin.SIN_D1sSindicato, 'SEM_SINDICATO'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ') AS nome_sindicato,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(sin.SIN_NusCNPJ, ''), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ') AS cnpj_sindicato,
    COUNT(c.CON_CdiContratado) AS qtd_colaboradores,
    CAST(SUM(ISNULL(c.CON_VlnSalario, 0)) AS DECIMAL(18,2)) AS massa_salarial_base,
    CAST(0 AS DECIMAL(18,2)) AS vr_dia_medio,
    CAST(AVG(ISNULL(vt.vt_valor_dia, 0)) AS DECIMAL(18,2)) AS vt_dia_medio,
    CAST(ROUND(AVG(
        CASE
            WHEN ISNULL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    ), 1) AS DECIMAL(10,1)) AS dias_trabalho_mes_atual,
    MAX(ben.beneficios_agg) AS beneficios_agg
FROM Contratados c
INNER JOIN Vinculos v ON v.VIN_CdiVinculo = c.CON_CdiVinculo
INNER JOIN CategsTrabseSoc cts ON cts.SDK_CdiCategTrabeSoc = v.VIN_CdiCategTrabeSoc AND ISNULL(cts.SDK_OplVinculoEmpregaticio, 0) = 1
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN Cargos cg ON cg.CAR_CdiCargo = c.CON_CdiCargo
LEFT JOIN Horarios h ON h.HOR_CdiHorario = c.CON_CdiHorario
LEFT JOIN QuantidadesHorasMes hmv ON hmv.HMV_CdiQuantidadeHoraMes = c.CON_CdiQuantidadeHoraMes
LEFT JOIN Sindicatos sin ON sin.SIN_CdiSindicato = c.CON_CdiSindicato
LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_HORARIO_TRABALHO ht ON ht.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_VT_DIARIO vt ON vt.CAS_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_BENEFICIOS_AGG ben
    ON ben.EMP_CdiEmpresa = e.EMP_CdiEmpresa
   AND ben.LOC_CdiLocal = l.LOC_CdiLocal
   AND ben.cnpj_completo = ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, '')
   AND ben.cod_cc = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ')
   AND ben.CON_CdiCargo = c.CON_CdiCargo
   AND ben.desc_cargo = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ')
   AND ben.CON_CdiVinculo = c.CON_CdiVinculo
   AND ben.CON_CdiHorario = c.CON_CdiHorario
   AND ISNULL(ben.cycle_len, -1) = ISNULL(cic.cycle_len, -1)
   AND ISNULL(ben.work_days, -1) = ISNULL(cic.work_days, -1)
   AND ISNULL(ben.off_days, -1) = ISNULL(cic.off_days, -1)
   AND ben.carga_semanal = ISNULL(hmv.HMV_QtnHorasSemanal, ISNULL(h.HOR_QtnHorasSemanal, 44.0))
   AND ISNULL(ben.carga_mensal, -1) = ISNULL(hmv.HMV_QtnQuantidadeHoraMes, ISNULL(h.HOR_QtnHorasSemanal, 44.0) * 5)
   AND ISNULL(ben.cod_sindicato, '0') = CAST(ISNULL(c.CON_CdiSindicato, 0) AS VARCHAR(20))
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
AND v.VIN_CdiTipoRegimeTrabalhista IN (1)
GROUP BY
    e.EMP_CdiEmpresa, l.LOC_CdiLocal,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LOC_NusCNPJSufixo, ''),
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' '),
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cc.CCU_D1sCentroCusto, ''), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' '),
    c.CON_CdiCargo, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' '),
    c.CON_CdiVinculo, c.CON_CdiHorario, cic.cycle_len, cic.work_days, cic.off_days,
    ISNULL(hmv.HMV_QtnHorasSemanal, ISNULL(h.HOR_QtnHorasSemanal, 44.0)),
    ISNULL(hmv.HMV_QtnQuantidadeHoraMes, ISNULL(h.HOR_QtnHorasSemanal, 44.0) * 5),
    c.CON_CdiSindicato,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(sin.SIN_D1sSindicato, 'SEM_SINDICATO'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' '),
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(sin.SIN_NusCNPJ, ''), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' '),
    ht.horario_trabalho_atual
ORDER BY cod_empresa, cod_filial, cod_cc, desc_cargo;;


/* ----------------------------------------------------------------------------
   [DIALETO 2] ORACLE DATABASE (APDATA SAAS ORACLE)
   Run ONLY this block on Oracle. Uses NVL / CHR / VARCHAR2-via-TO_CHAR /
   NUMBER / || / LISTAGG(... ) WITHIN GROUP — never ISNULL / CHAR / STRING_AGG / +.
   Do NOT end with `;` (Aptools → ORA-00933). Product UI omits the terminator.
   Product UI: Extrair via Aptools → tab Oracle (SQL switches immediately).
   ---------------------------------------------------------------------------- */

WITH CTE_VT_DIARIO AS (
    SELECT
        cat.CAS_CdiContratado,
        SUM(CAST(NVL(cat.CAS_QtiPassesDia, 0) * NVL(mti.MRI_VlnUnitario, 0) AS NUMBER(18,4))) AS vt_valor_dia
    FROM ConATransportes cat
    INNER JOIN MeiosTransportesItens mti
        ON mti.MRI_CdiMeioTransporte = cat.CAS_CdiMeioTransporte
    WHERE cat.CAS_DtdFim IS NULL
      AND NVL(cat.CAS_OplDesativado, 0) = 0
    GROUP BY cat.CAS_CdiContratado
),
CTE_CICLO_HORARIO AS (
    SELECT
        hj.HRI_CdiHorario,
        COUNT(*) AS cycle_len,
        SUM(CASE WHEN NVL(tdp.TIP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days,
        SUM(CASE WHEN NVL(tdp.TIP_OplTrabalho, 0) = 0 THEN 1 ELSE 0 END) AS off_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp
        ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    INNER JOIN Horarios hciclo
        ON hciclo.HOR_CdiHorario = hj.HRI_CdiHorario
    WHERE NVL(hj.HRI_OplDesativado, 0) = 0
      AND NVL(hciclo.HOR_OplDesativado, 0) = 0
    GROUP BY hj.HRI_CdiHorario
),
CTE_HT_ITENS AS (
    SELECT DISTINCT
        hj.HRI_CdiHorario,
        ji.JOI_HrdHoraMinutoInicio AS inicio,
        ji.JOI_HrdHoraMinutoFim AS fim,
        CASE
            WHEN NVL(tj.TJO_OplTrabalhada, 0) = 1 OR tj.TJO_CdiTipoJornada = 1
            THEN 1 ELSE 0
        END AS is_work
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp
        ON tdp.TIP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    INNER JOIN Jornadas j
        ON j.JOR_CdiJornada = hj.HRI_CdiJornada
    INNER JOIN JornadasItens ji
        ON ji.JOI_CdiJornada = j.JOR_CdiJornada
    INNER JOIN TiposJornadas tj
        ON tj.TJO_CdiTipoJornada = ji.JOI_CdiTipoJornada
    WHERE NVL(hj.HRI_OplDesativado, 0) = 0
      AND NVL(ji.JOI_OplDesativado, 0) = 0
      AND NVL(tdp.TIP_OplTrabalho, 0) = 1
),
CTE_HT_WORK AS (
    SELECT
        HRI_CdiHorario,
        inicio,
        fim,
        LEAD(inicio) OVER (PARTITION BY HRI_CdiHorario ORDER BY inicio, fim) AS next_inicio,
        ROW_NUMBER() OVER (PARTITION BY HRI_CdiHorario ORDER BY inicio, fim) AS rn
    FROM CTE_HT_ITENS
    WHERE is_work = 1
),
CTE_HT_PARTS AS (
    SELECT
        w.HRI_CdiHorario,
        w.rn * 2 AS seq,
        TO_CHAR(w.inicio, 'HH24:MI') || '-' || TO_CHAR(w.fim, 'HH24:MI') AS part
    FROM CTE_HT_WORK w
    UNION ALL
    SELECT
        w.HRI_CdiHorario,
        w.rn * 2 + 1 AS seq,
        'intervalo ' || TO_CHAR(ROUND((w.next_inicio - w.fim) * 1440)) || 'min' AS part
    FROM CTE_HT_WORK w
    WHERE w.next_inicio IS NOT NULL
      AND (w.next_inicio - w.fim) * 1440 > 0
      AND NOT EXISTS (
            SELECT 1
            FROM CTE_HT_ITENS i
            WHERE i.HRI_CdiHorario = w.HRI_CdiHorario
              AND i.is_work = 0
              AND i.inicio < w.next_inicio
              AND i.fim > w.fim
          )
),
CTE_HORARIO_TRABALHO AS (
    SELECT
        HRI_CdiHorario,
        LISTAGG(part, ' / ') WITHIN GROUP (ORDER BY seq) AS horario_trabalho_atual
    FROM CTE_HT_PARTS
    GROUP BY HRI_CdiHorario
),
CTE_BEN_CONTRATO AS (
    SELECT
        cbn.CBN_CdiContratado,
        tbe.TBE_CdiTipoBeneficio AS cod_tipo,
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(tbe.TBE_D1sTipoBeneficio, 'SEM_DESC'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ') AS desc_tipo,
        AVG(CAST(NVL(pbv.PBV_VlnBeneficio, 0) AS NUMBER(18,4))) AS valor_medio
    FROM ConBeneficios cbn
    INNER JOIN PlanosBeneficios plb
        ON plb.PLB_CdiPlanoBeneficio = cbn.CBN_CdiPlanoBeneficio
    INNER JOIN (
SELECT
        p.PBV_CdiPlanoBeneficio,
        p.PBV_VlnBeneficio
    FROM PlanosBeneficiosValores p
    INNER JOIN (
        SELECT
            PBV_CdiPlanoBeneficio,
            MAX(PBV_DtdInicio) AS max_inicio
        FROM PlanosBeneficiosValores
        GROUP BY PBV_CdiPlanoBeneficio
    ) u
        ON u.PBV_CdiPlanoBeneficio = p.PBV_CdiPlanoBeneficio
       AND u.max_inicio = p.PBV_DtdInicio
    ) pbv
        ON pbv.PBV_CdiPlanoBeneficio = plb.PLB_CdiPlanoBeneficio
    INNER JOIN TiposBeneficiosEntsBens ebt
        ON ebt.EBT_CdiTipoBeneficioEntBen = plb.PLB_CdiTipoBeneficioEntBen
    INNER JOIN TiposBeneficios tbe
        ON tbe.TBE_CdiTipoBeneficio = ebt.EBT_CdiTipoBeneficio
    WHERE cbn.CBN_DtdFim IS NULL
    GROUP BY
        cbn.CBN_CdiContratado,
        tbe.TBE_CdiTipoBeneficio,
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(tbe.TBE_D1sTipoBeneficio, 'SEM_DESC'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ')
),
CTE_BEN_COM_CHAVES AS (
    SELECT
        e.EMP_CdiEmpresa,
        l.LOC_CdiLocal,
        NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ') AS cod_cc,
        c.CON_CdiCargo,
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ') AS desc_cargo,
        c.CON_CdiVinculo,
        c.CON_CdiHorario,
        cic.cycle_len,
        cic.work_days,
        cic.off_days,
        NVL(hmv.HMV_QtnHorasSemanal, NVL(h.HOR_QtnHorasSemanal, 44.0)) AS carga_semanal,
        NVL(hmv.HMV_QtnQuantidadeHoraMes, NVL(h.HOR_QtnHorasSemanal, 44.0) * 5) AS carga_mensal,
        TO_CHAR(NVL(c.CON_CdiSindicato, 0)) AS cod_sindicato,
        b.cod_tipo,
        b.desc_tipo,
        b.valor_medio
    FROM CTE_BEN_CONTRATO b
    INNER JOIN Contratados c ON c.CON_CdiContratado = b.CBN_CdiContratado
    INNER JOIN Vinculos v ON v.VIN_CdiVinculo = c.CON_CdiVinculo
INNER JOIN CategsTrabseSoc cts ON cts.SDK_CdiCategTrabeSoc = v.VIN_CdiCategTrabeSoc AND NVL(cts.SDK_OplVinculoEmpregaticio, 0) = 1
    INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
    INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
    INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
    LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
    LEFT JOIN Cargos cg ON cg.CAR_CdiCargo = c.CON_CdiCargo
    LEFT JOIN Horarios h ON h.HOR_CdiHorario = c.CON_CdiHorario
    LEFT JOIN QuantidadesHorasMes hmv ON hmv.HMV_CdiQuantidadeHoraMes = c.CON_CdiQuantidadeHoraMes
    LEFT JOIN Sindicatos sin ON sin.SIN_CdiSindicato = c.CON_CdiSindicato
    LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
    WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
AND v.VIN_CdiTipoRegimeTrabalhista IN (1)
),
CTE_BEN_GRUPO AS (
    SELECT
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal, carga_mensal, cod_sindicato,
        cod_tipo, desc_tipo,
        AVG(valor_medio) AS valor_medio
    FROM CTE_BEN_COM_CHAVES
    GROUP BY
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal, carga_mensal, cod_sindicato, cod_tipo, desc_tipo
),
CTE_BENEFICIOS_AGG AS (
    SELECT
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal, carga_mensal, cod_sindicato,
        LISTAGG(
            TO_CHAR(cod_tipo) || '|' || desc_tipo || '|' ||
            TO_CHAR(CAST(valor_medio AS NUMBER(18,2))),
            CHR(59)
        ) WITHIN GROUP (ORDER BY cod_tipo) AS beneficios_agg
    FROM CTE_BEN_GRUPO
    GROUP BY
        EMP_CdiEmpresa, LOC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, off_days, carga_semanal, carga_mensal, cod_sindicato
)
SELECT
    TO_CHAR(e.EMP_CdiEmpresa) AS cod_empresa,
    TO_CHAR(l.LOC_CdiLocal) AS cod_filial,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, '') AS cnpj_completo,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ') AS cod_cc,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(cc.CCU_D1sCentroCusto, ''), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ') AS desc_cc,
    TO_CHAR(NVL(c.CON_CdiCargo, 0)) AS cod_cargo,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ') AS desc_cargo,
    TO_CHAR(NVL(c.CON_CdiVinculo, 0)) AS cod_vinculo,
    TO_CHAR(NVL(c.CON_CdiHorario, 0)) AS cod_horario_atual,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(ht.horario_trabalho_atual, ''), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ') AS horario_trabalho_atual,
    NVL(
        TO_CHAR(cic.work_days) || 'x' || TO_CHAR(cic.off_days),
        'other'
    ) AS escala_atual,
    CAST(NVL(hmv.HMV_QtnHorasSemanal, NVL(h.HOR_QtnHorasSemanal, 44.0)) AS NUMBER(10,2)) AS carga_semanal_atual,
    CAST(NVL(hmv.HMV_QtnQuantidadeHoraMes, NVL(h.HOR_QtnHorasSemanal, 44.0) * 5) AS NUMBER(10,2)) AS carga_horaria_mensal,
    TO_CHAR(NVL(c.CON_CdiSindicato, 0)) AS cod_sindicato,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(sin.SIN_D1sSindicato, 'SEM_SINDICATO'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ') AS nome_sindicato,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(sin.SIN_NusCNPJ, ''), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ') AS cnpj_sindicato,
    COUNT(c.CON_CdiContratado) AS qtd_colaboradores,
    CAST(SUM(NVL(c.CON_VlnSalario, 0)) AS NUMBER(18,2)) AS massa_salarial_base,
    CAST(0 AS NUMBER(18,2)) AS vr_dia_medio,
    CAST(AVG(NVL(vt.vt_valor_dia, 0)) AS NUMBER(18,2)) AS vt_dia_medio,
    CAST(ROUND(AVG(
        CASE
            WHEN NVL(cic.cycle_len, 0) > 0
            THEN (30.0 * cic.work_days) / cic.cycle_len
            ELSE 22.0
        END
    ), 1) AS NUMBER(10,1)) AS dias_trabalho_mes_atual,
    MAX(ben.beneficios_agg) AS beneficios_agg
FROM Contratados c
INNER JOIN Vinculos v ON v.VIN_CdiVinculo = c.CON_CdiVinculo
INNER JOIN CategsTrabseSoc cts ON cts.SDK_CdiCategTrabeSoc = v.VIN_CdiCategTrabeSoc AND NVL(cts.SDK_OplVinculoEmpregaticio, 0) = 1
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LOC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LOC_CdiEmpresa
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN Cargos cg ON cg.CAR_CdiCargo = c.CON_CdiCargo
LEFT JOIN Horarios h ON h.HOR_CdiHorario = c.CON_CdiHorario
LEFT JOIN QuantidadesHorasMes hmv ON hmv.HMV_CdiQuantidadeHoraMes = c.CON_CdiQuantidadeHoraMes
LEFT JOIN Sindicatos sin ON sin.SIN_CdiSindicato = c.CON_CdiSindicato
LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_HORARIO_TRABALHO ht ON ht.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_VT_DIARIO vt ON vt.CAS_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_BENEFICIOS_AGG ben
    ON ben.EMP_CdiEmpresa = e.EMP_CdiEmpresa
   AND ben.LOC_CdiLocal = l.LOC_CdiLocal
   AND ben.cnpj_completo = NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, '')
   AND ben.cod_cc = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ')
   AND ben.CON_CdiCargo = c.CON_CdiCargo
   AND ben.desc_cargo = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ')
   AND ben.CON_CdiVinculo = c.CON_CdiVinculo
   AND ben.CON_CdiHorario = c.CON_CdiHorario
   AND NVL(ben.cycle_len, -1) = NVL(cic.cycle_len, -1)
   AND NVL(ben.work_days, -1) = NVL(cic.work_days, -1)
   AND NVL(ben.off_days, -1) = NVL(cic.off_days, -1)
   AND ben.carga_semanal = NVL(hmv.HMV_QtnHorasSemanal, NVL(h.HOR_QtnHorasSemanal, 44.0))
   AND NVL(ben.carga_mensal, -1) = NVL(hmv.HMV_QtnQuantidadeHoraMes, NVL(h.HOR_QtnHorasSemanal, 44.0) * 5)
   AND NVL(ben.cod_sindicato, '0') = TO_CHAR(NVL(c.CON_CdiSindicato, 0))
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
AND v.VIN_CdiTipoRegimeTrabalhista IN (1)
GROUP BY
    e.EMP_CdiEmpresa, l.LOC_CdiLocal,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LOC_NusCNPJSufixo, ''),
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' '),
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(cc.CCU_D1sCentroCusto, ''), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' '),
    c.CON_CdiCargo, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' '),
    c.CON_CdiVinculo, c.CON_CdiHorario, cic.cycle_len, cic.work_days, cic.off_days,
    NVL(hmv.HMV_QtnHorasSemanal, NVL(h.HOR_QtnHorasSemanal, 44.0)),
    NVL(hmv.HMV_QtnQuantidadeHoraMes, NVL(h.HOR_QtnHorasSemanal, 44.0) * 5),
    c.CON_CdiSindicato,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(sin.SIN_D1sSindicato, 'SEM_SINDICATO'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' '),
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(sin.SIN_NusCNPJ, ''), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' '),
    ht.horario_trabalho_atual
ORDER BY cod_empresa, cod_filial, cod_cc, desc_cargo
