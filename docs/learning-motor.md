# Motor que aprende com cenários do cliente (roadmap)

## O que NÃO fazer no curto prazo

- LLM “inventando” escala ou custo sem regras — risco jurídico e números opacos.
- Treinar modelo genérico sem dados reais dos seus clientes.

## Arquitetura em 3 camadas

1. **Motor determinístico (hoje)** — regras versionadas, VR/VT, allowlist de escalas, horário de funcionamento → turnos. Sempre auditável.
2. **Calibragem por caso** — cada simulação salva (anonimizada): inputs, escolha do cliente entre candidatas, ajuste manual de HC/horário, custo real vs estimado. Isso vira dataset.
3. **Camada adaptativa (depois)** — modelos leves (não precisam ser LLM) que aprendem *parâmetros* do motor: buffer de cobertura por setor/centro de custo, atrito hospital vs varejo, preferência 5×2 vs turnos_8h. LLM só na borda: explicar resultado e redigir relatório.

## Como “embarcar IA” no simulador

| Fase | Entrega | Aprendizado |
|------|---------|-------------|
| A (MVP+) ✅ | Salvar cenário + feedback (“aceitei sugestão 1 / editei”) em JSON local ou backend simples | Dataset |
| B | Ajuste automático de buffers por segmento com regressão / bayes simples | Motor mais preciso |
| C | Assistente (LLM + tools do motor) — pergunta e só chama `simulate` / `suggest` | UX, não substitui o motor |

### Fase A — shipped (MVP local)

No app (raiz do repositório):

- Em **Escalas sugeridas**, cada candidata tem **Aceitar** / **Editar** (HC ou horas por turno) / **Rejeitar**.
- Persistência em `localStorage` (`projeto6x1.calibrationFeedback.v1`) + **Baixar JSON** (histórico ou último registro).
- Schema (`calibration-feedback-v1`): `timestamp`, `sector`, `operatingHours`, `scenarioId`, `action`, `suggestion` (original + opcional editado), `payrollDeltas`, `scenarioSnapshot` (sem linhas brutas de folha).
- UI: bloco **Histórico de calibração** (só neste navegador).
- Código: `src/engine/calibration-feedback.ts`, controles em `ResultsView`.

## Princípio

A IA **calibra e explica**; o motor **calcula**. Cenários do cliente alimentam a calibração com consentimento e anonimização.
