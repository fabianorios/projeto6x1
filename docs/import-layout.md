# Layout de importação — folha (CSV)

Separador: `;` (ponto e vírgula). Encoding: UTF-8. Primeira linha = cabeçalho exato.

## Colunas obrigatórias

| Coluna | Tipo | Exemplo | Notas |
|--------|------|---------|--------|
| `cargo` | texto | Operador de caixa | |
| `salario` | número | 2200.00 | Mensal, bruto; use `.` decimal |
| `carga_horaria_mensal` | número | 220 | Horas/mês contratadas |
| `carga_horaria_semanal` | número | 44 | Horas/semana |
| `centro_custo` | texto | Loja-01 | Agrupa totais no relatório |

## Colunas de benefícios (recomendadas)

| Coluna | Tipo | Exemplo | Notas |
|--------|------|---------|--------|
| `vr_valor_dia` | número | 32.00 | Valor do VR por dia útil trabalhado |
| `vr_dias_mes_atual` | número | 26 | Dias com VR na escala atual (ex. 6×1) |
| `vt_valor_dia` | número | 15.00 | VT por dia de deslocamento |
| `vt_dias_mes_atual` | número | 26 | Dias com VT na escala atual |

Se `vr_dias_mes_atual` / `vt_dias_mes_atual` vierem vazios, o motor estima pelos dias úteis da escala atual × proposta.

## Colunas opcionais

| Coluna | Tipo | Notas |
|--------|------|--------|
| `nome` | texto | Só para o relatório |
| `quantidade` | número | Qtd de pessoas nessa linha (default 1) |
| `escala_atual` | texto | Ex. `6x1`, `5x2` (default do wizard se vazio) |

## Exemplo

```csv
cargo;salario;carga_horaria_mensal;carga_horaria_semanal;centro_custo;vr_valor_dia;vr_dias_mes_atual;vt_valor_dia;vt_dias_mes_atual;quantidade
Operador de caixa;2200.00;220;44;Loja-01;32.00;26;15.00;26;8
Estoquista;1980.00;220;44;Loja-01;32.00;26;15.00;26;3
Enfermeiro;4500.00;180;36;UTI;42.00;20;18.00;20;12
```

## Regras

- Uma linha = um cargo (ou pessoa) no centro de custo.
- Valores mensais de VR/VT atuais = `valor_dia × dias_mes_atual × quantidade`.
- Propostos = `valor_dia × dias_mes_proposta(escala) × quantidade` (dias da escala do cenário).
- Linhas inválidas são listadas no wizard; não bloqueiam o restante se houver ≥1 válida.
