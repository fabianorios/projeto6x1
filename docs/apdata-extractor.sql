/* ============================================================================
   TURNOCHECK — EXTRATOR CANÔNICO APDATA (SEM PII / LGPD-SAFE)
   Compatível com Aptools (Exportação CSV) e Conexão Direta Read-Only.
   ============================================================================
   REGRAS APLICADAS:
   1. Zero PII: Nenhum nome, CPF, PIS ou matrícula individual é extraído.
   2. Situação: Apenas vínculos ativos -> CON_CdiSituacao NOT IN (0, 2, 3, 99).
   3. Benefícios: JOIN TiposBeneficios — todos ativos (PBV_DtdFim IS NULL)
      agregados em beneficios_agg (codigo|descricao|valor;…) sem duplicar
      headcount/salário. Classificação VARIAVEL_DIA / FIXO_MENSAL / IGNORAR
      é feita no parser por keywords em TPB_D1sTipoBeneficio.
   4. VT: Soma ativa (CAS_DtdFim IS NULL) em ConATransportes x MeiosTransportesItens.
          (Ignora ConCalculoATransportes conforme regra canônica).
   5. Sanitização: Remove ';', TAB, '|', quebras de linha de textos
      para não deslocar colunas no export Aptools TXT (TAB) ou CSV.
   6. Prefixos Aptools: Contratados=CON, Locais=LPC, HorariosJornadas=HRI,
      TiposDiasPonto=TDP, ConATransportes=CAS, MeiosTransportesItens=MRI.
      Estabelecimento: CON_CdiFolha → Folhas → Locais(LPC) → Empresas(EMP).
   ============================================================================
   Aptools: não prefixar com SET TRANSACTION — a ferramenta pode rejeitar.
   Isolation (READ UNCOMMITTED / READ ONLY) fica na conexão API/MCP.
   ============================================================================ */


/* ----------------------------------------------------------------------------
   [DIALETO 1] MICROSOFT SQL SERVER (MSSQL)
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
        SUM(CASE WHEN ISNULL(tdp.TDP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp
        ON tdp.TDP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    WHERE ISNULL(hj.HRI_OplDesativado, 0) = 0
    GROUP BY hj.HRI_CdiHorario
),
CTE_BEN_CONTRATO AS (
    SELECT
        pbv.PBV_CdiContratado,
        tpb.TPB_CdiTipoBeneficio AS cod_tipo,
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(tpb.TPB_D1sTipoBeneficio, 'SEM_DESC'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ') AS desc_tipo,
        AVG(CAST(ISNULL(pbv.PBV_VlnBeneficio, 0) AS DECIMAL(18,4))) AS valor_medio
    FROM PlanosBeneficiosValores pbv
    INNER JOIN TiposBeneficios tpb
        ON tpb.TPB_CdiTipoBeneficio = pbv.TPB_CdiTipoBeneficio
    WHERE pbv.PBV_DtdFim IS NULL
    GROUP BY
        pbv.PBV_CdiContratado,
        tpb.TPB_CdiTipoBeneficio,
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(tpb.TPB_D1sTipoBeneficio, 'SEM_DESC'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ')
),
CTE_BEN_COM_CHAVES AS (
    SELECT
        e.EMP_CdiEmpresa,
        l.LPC_CdiLocal,
        ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LPC_NusCNPJSufixo, '') AS cnpj_completo,
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ') AS cod_cc,
        c.CON_CdiCargo,
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ') AS desc_cargo,
        c.CON_CdiVinculo,
        c.CON_CdiHorario,
        cic.cycle_len,
        cic.work_days,
        ISNULL(h.HOR_QtnHorasSemanal, 44.0) AS carga_semanal,
        b.cod_tipo,
        b.desc_tipo,
        b.valor_medio
    FROM CTE_BEN_CONTRATO b
    INNER JOIN Contratados c ON c.CON_CdiContratado = b.PBV_CdiContratado
    INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
    INNER JOIN Locais l ON l.LPC_CdiLocal = f.FOL_CdiLocal
    INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LPC_CdiEmpresa
    LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
    LEFT JOIN Cargos cg ON cg.CAR_CdiCargo = c.CON_CdiCargo
    LEFT JOIN Horarios h ON h.HOR_CdiHorario = c.CON_CdiHorario
    LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
    WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
),
CTE_BEN_GRUPO AS (
    SELECT
        EMP_CdiEmpresa, LPC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, carga_semanal,
        cod_tipo, desc_tipo,
        AVG(valor_medio) AS valor_medio
    FROM CTE_BEN_COM_CHAVES
    GROUP BY
        EMP_CdiEmpresa, LPC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, carga_semanal, cod_tipo, desc_tipo
),
CTE_BENEFICIOS_AGG AS (
    SELECT
        EMP_CdiEmpresa, LPC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, carga_semanal,
        STRING_AGG(
            CAST(cod_tipo AS VARCHAR(20)) + '|' + desc_tipo + '|' +
            CAST(CAST(valor_medio AS DECIMAL(18,2)) AS VARCHAR(40)),
            CHAR(59)
        ) WITHIN GROUP (ORDER BY cod_tipo) AS beneficios_agg
    FROM CTE_BEN_GRUPO
    GROUP BY
        EMP_CdiEmpresa, LPC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, carga_semanal
)
SELECT
    CAST(e.EMP_CdiEmpresa AS VARCHAR(20)) AS cod_empresa,
    CAST(l.LPC_CdiLocal AS VARCHAR(20)) AS cod_filial,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LPC_NusCNPJSufixo, '') AS cnpj_completo,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ') AS cod_cc,
    CAST(ISNULL(c.CON_CdiCargo, 0) AS VARCHAR(20)) AS cod_cargo,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ') AS desc_cargo,
    CAST(ISNULL(c.CON_CdiVinculo, 0) AS VARCHAR(20)) AS cod_vinculo,
    CAST(ISNULL(c.CON_CdiHorario, 0) AS VARCHAR(20)) AS cod_horario_atual,
    CASE
        WHEN cic.cycle_len = 7 AND cic.work_days = 6 THEN '6x1'
        WHEN cic.cycle_len = 7 AND cic.work_days = 5 THEN '5x2'
        WHEN cic.cycle_len = 7 AND cic.work_days = 4 THEN '4x3'
        WHEN cic.cycle_len = 2 AND cic.work_days = 1 THEN '12x36'
        ELSE 'other'
    END AS escala_atual,
    CAST(ISNULL(h.HOR_QtnHorasSemanal, 44.0) AS DECIMAL(10,2)) AS carga_semanal_atual,
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
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LPC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LPC_CdiEmpresa
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN Cargos cg ON cg.CAR_CdiCargo = c.CON_CdiCargo
LEFT JOIN Horarios h ON h.HOR_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_VT_DIARIO vt ON vt.CAS_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_BENEFICIOS_AGG ben
    ON ben.EMP_CdiEmpresa = e.EMP_CdiEmpresa
   AND ben.LPC_CdiLocal = l.LPC_CdiLocal
   AND ben.cnpj_completo = ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LPC_NusCNPJSufixo, '')
   AND ben.cod_cc = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ')
   AND ben.CON_CdiCargo = c.CON_CdiCargo
   AND ben.desc_cargo = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' ')
   AND ben.CON_CdiVinculo = c.CON_CdiVinculo
   AND ben.CON_CdiHorario = c.CON_CdiHorario
   AND ISNULL(ben.cycle_len, -1) = ISNULL(cic.cycle_len, -1)
   AND ISNULL(ben.work_days, -1) = ISNULL(cic.work_days, -1)
   AND ben.carga_semanal = ISNULL(h.HOR_QtnHorasSemanal, 44.0)
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    e.EMP_CdiEmpresa, l.LPC_CdiLocal,
    ISNULL(e.EMP_NusCNPJPrefixo, '') + ISNULL(l.LPC_NusCNPJSufixo, ''),
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cc.CCU_CosEstrutura, 'SEM_CC'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' '),
    c.CON_CdiCargo, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHAR(59), ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' '), '|', ' '),
    c.CON_CdiVinculo, c.CON_CdiHorario, cic.cycle_len, cic.work_days,
    ISNULL(h.HOR_QtnHorasSemanal, 44.0)
ORDER BY cod_empresa, cod_filial, cod_cc, desc_cargo;



/* ----------------------------------------------------------------------------
   [DIALETO 2] ORACLE DATABASE (APDATA SAAS ORACLE)
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
        SUM(CASE WHEN NVL(tdp.TDP_OplTrabalho, 0) = 1 THEN 1 ELSE 0 END) AS work_days
    FROM HorariosJornadas hj
    INNER JOIN TiposDiasPonto tdp
        ON tdp.TDP_CdiTipoDiaPonto = hj.HRI_CdiTipoDiaPonto
    WHERE NVL(hj.HRI_OplDesativado, 0) = 0
    GROUP BY hj.HRI_CdiHorario
),
CTE_BEN_CONTRATO AS (
    SELECT
        pbv.PBV_CdiContratado,
        tpb.TPB_CdiTipoBeneficio AS cod_tipo,
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(tpb.TPB_D1sTipoBeneficio, 'SEM_DESC'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ') AS desc_tipo,
        AVG(CAST(NVL(pbv.PBV_VlnBeneficio, 0) AS NUMBER(18,4))) AS valor_medio
    FROM PlanosBeneficiosValores pbv
    INNER JOIN TiposBeneficios tpb
        ON tpb.TPB_CdiTipoBeneficio = pbv.TPB_CdiTipoBeneficio
    WHERE pbv.PBV_DtdFim IS NULL
    GROUP BY
        pbv.PBV_CdiContratado,
        tpb.TPB_CdiTipoBeneficio,
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(tpb.TPB_D1sTipoBeneficio, 'SEM_DESC'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ')
),
CTE_BEN_COM_CHAVES AS (
    SELECT
        e.EMP_CdiEmpresa,
        l.LPC_CdiLocal,
        NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LPC_NusCNPJSufixo, '') AS cnpj_completo,
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ') AS cod_cc,
        c.CON_CdiCargo,
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ') AS desc_cargo,
        c.CON_CdiVinculo,
        c.CON_CdiHorario,
        cic.cycle_len,
        cic.work_days,
        NVL(h.HOR_QtnHorasSemanal, 44.0) AS carga_semanal,
        b.cod_tipo,
        b.desc_tipo,
        b.valor_medio
    FROM CTE_BEN_CONTRATO b
    INNER JOIN Contratados c ON c.CON_CdiContratado = b.PBV_CdiContratado
    INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
    INNER JOIN Locais l ON l.LPC_CdiLocal = f.FOL_CdiLocal
    INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LPC_CdiEmpresa
    LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
    LEFT JOIN Cargos cg ON cg.CAR_CdiCargo = c.CON_CdiCargo
    LEFT JOIN Horarios h ON h.HOR_CdiHorario = c.CON_CdiHorario
    LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
    WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
),
CTE_BEN_GRUPO AS (
    SELECT
        EMP_CdiEmpresa, LPC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, carga_semanal,
        cod_tipo, desc_tipo,
        AVG(valor_medio) AS valor_medio
    FROM CTE_BEN_COM_CHAVES
    GROUP BY
        EMP_CdiEmpresa, LPC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, carga_semanal, cod_tipo, desc_tipo
),
CTE_BENEFICIOS_AGG AS (
    SELECT
        EMP_CdiEmpresa, LPC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, carga_semanal,
        LISTAGG(
            TO_CHAR(cod_tipo) || '|' || desc_tipo || '|' ||
            TO_CHAR(CAST(valor_medio AS NUMBER(18,2))),
            CHR(59)
        ) WITHIN GROUP (ORDER BY cod_tipo) AS beneficios_agg
    FROM CTE_BEN_GRUPO
    GROUP BY
        EMP_CdiEmpresa, LPC_CdiLocal, cnpj_completo, cod_cc,
        CON_CdiCargo, desc_cargo, CON_CdiVinculo, CON_CdiHorario,
        cycle_len, work_days, carga_semanal
)
SELECT
    TO_CHAR(e.EMP_CdiEmpresa) AS cod_empresa,
    TO_CHAR(l.LPC_CdiLocal) AS cod_filial,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LPC_NusCNPJSufixo, '') AS cnpj_completo,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ') AS cod_cc,
    TO_CHAR(NVL(c.CON_CdiCargo, 0)) AS cod_cargo,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ') AS desc_cargo,
    TO_CHAR(NVL(c.CON_CdiVinculo, 0)) AS cod_vinculo,
    TO_CHAR(NVL(c.CON_CdiHorario, 0)) AS cod_horario_atual,
    CASE
        WHEN cic.cycle_len = 7 AND cic.work_days = 6 THEN '6x1'
        WHEN cic.cycle_len = 7 AND cic.work_days = 5 THEN '5x2'
        WHEN cic.cycle_len = 7 AND cic.work_days = 4 THEN '4x3'
        WHEN cic.cycle_len = 2 AND cic.work_days = 1 THEN '12x36'
        ELSE 'other'
    END AS escala_atual,
    CAST(NVL(h.HOR_QtnHorasSemanal, 44.0) AS NUMBER(10,2)) AS carga_semanal_atual,
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
INNER JOIN Folhas f ON f.FOL_CdiFolha = c.CON_CdiFolha
INNER JOIN Locais l ON l.LPC_CdiLocal = f.FOL_CdiLocal
INNER JOIN Empresas e ON e.EMP_CdiEmpresa = l.LPC_CdiEmpresa
LEFT JOIN CentrosCustos cc ON cc.CCU_CdiCentroCusto = c.CON_CdiCentroCusto
LEFT JOIN Cargos cg ON cg.CAR_CdiCargo = c.CON_CdiCargo
LEFT JOIN Horarios h ON h.HOR_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_CICLO_HORARIO cic ON cic.HRI_CdiHorario = c.CON_CdiHorario
LEFT JOIN CTE_VT_DIARIO vt ON vt.CAS_CdiContratado = c.CON_CdiContratado
LEFT JOIN CTE_BENEFICIOS_AGG ben
    ON ben.EMP_CdiEmpresa = e.EMP_CdiEmpresa
   AND ben.LPC_CdiLocal = l.LPC_CdiLocal
   AND ben.cnpj_completo = NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LPC_NusCNPJSufixo, '')
   AND ben.cod_cc = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ')
   AND ben.CON_CdiCargo = c.CON_CdiCargo
   AND ben.desc_cargo = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' ')
   AND ben.CON_CdiVinculo = c.CON_CdiVinculo
   AND ben.CON_CdiHorario = c.CON_CdiHorario
   AND NVL(ben.cycle_len, -1) = NVL(cic.cycle_len, -1)
   AND NVL(ben.work_days, -1) = NVL(cic.work_days, -1)
   AND ben.carga_semanal = NVL(h.HOR_QtnHorasSemanal, 44.0)
WHERE c.CON_CdiSituacao NOT IN (0, 2, 3, 99)
GROUP BY
    e.EMP_CdiEmpresa, l.LPC_CdiLocal,
    NVL(e.EMP_NusCNPJPrefixo, '') || NVL(l.LPC_NusCNPJSufixo, ''),
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(cc.CCU_CosEstrutura, 'SEM_CC'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' '),
    c.CON_CdiCargo, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(NVL(cg.CAR_D1sCargo, 'NAO_INFORMADO'), CHR(59), ' '), CHR(9), ' '), CHR(10), ' '), CHR(13), ' '), '|', ' '),
    c.CON_CdiVinculo, c.CON_CdiHorario, cic.cycle_len, cic.work_days,
    NVL(h.HOR_QtnHorasSemanal, 44.0)
ORDER BY cod_empresa, cod_filial, cod_cc, desc_cargo;



/* NOTE: Run ONE dialect per session (MSSQL *or* Oracle). Do not paste SET
   TRANSACTION into Aptools — isolation is applied by the ephemeral API /
   MCP connection separately from the SELECT body. */
