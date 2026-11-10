# Política de sugestão de escalas (MVP)

## Objetivo

Sugerir 1–2 escalas/horários operacionais por centro de custo para cobrir a demanda atual com menor custo (folha + VR/VT), **sem** empurrar regimes que a PEC não deve tratar como resposta padrão.

## Permitidas (candidatas)

| Código | Descrição | Uso típico |
|--------|-----------|------------|
| `5x2` | 5 dias trabalho / 2 folga | Varejo diurno, escritório, apoio |
| `4x3` | 4×3 (quando o cenário PEC agressivo modelar isso) | Contínuo leve |
| `turnos_8h` | Blocos 8h (manhã/tarde/noite) em 5×2 | Loja/obra com horário comercial + extensão |

`6x1` / `6x1_ajustada` **não** são candidatas — a PEC as aboliria; aparecem só como **Atual**.

Sugestão inclui: horário início/fim por turno, HC por turno, custo estimado vs atual.

**Horários de turno:** derivados do **horário de funcionamento do estabelecimento** (abertura/fechamento no wizard; opcional por dia da semana). Preferência **blocos de 8h** (teto 10h). Janela ≤10h → um turno; janela &gt;10h (ex. 09–21 / 12h) → turnos de 8h com sobreposição (ex. 09–17 e 13–21) — **nunca** dividir em blocos encurtados iguais (ex. 2×6h). Não inventa grades fixas fora da janela informada.

## Exclusão (não sugerir)

| Código | Motivo |
|--------|--------|
| `6x1` / `6x1_ajustada` | Escala que a PEC visa abolir — nunca sugerir como proposto |
| `12x36` | Regime específico; **não** deve entrar como “adequação à PEC” |
| `24x48` | Idem — plantão longo fora do escopo da proposta de escala comercial |
| `sobreaviso_puro` | Não é escala de cobertura diária |
| Qualquer escala com jornada diária &gt; 10h como padrão sugerido | Evitar normalizar jornadas extremas via o produto |

Hospital: plantão existente do cliente pode ser **lido** na importação como status quo, mas o motor **não recomenda** migrar *para* 12×36 como saída da PEC.

## UX

- Bloco “Escalas sugeridas” com disclaimer: estimativa operacional, validar com RH/jurídico.
- `6×1` no campo de escala atual: aviso suave (“só como Atual — não sugerida”); permanece válido como status quo.
- Badge “Excluído da sugestão” se o usuário pedir 12×36 / 24×48 manualmente — explicar a política.
- Campo wizard: horário de funcionamento (abertura/fechamento; opcional por weekday) — base das janelas sugeridas.
- Lista de exclusão versionada no código (`src/engine/schedule-policy.ts`) espelhando este doc (`schedule-policy-v2`).
