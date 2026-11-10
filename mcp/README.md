# MCP (scaffold) — Apdata / folha somente leitura

Stub do pacote MCP do **Projeto 6×1**. Ainda **não** é um servidor MCP completo: define política SELECT-only, env de exemplo e ponto de entrada mínimo para evolução futura.

Produto separado deste repo (`fabianorios/projeto6x1`). Integração com Gestão Consultoria, se houver, será **apenas por link/embed** — não copiar código para dentro do Gestão.

## Papel

| Peça | Função |
|------|--------|
| App Vite (`/` do repo) | Simulador; entrada principal continua sendo CSV |
| Este `mcp/` | Ponte opcional de **leitura** (MSSQL / Oracle) → linhas no layout do simulador |
| `ESCALA6X1.zip` | Pacote vendor Apdata (blob na raiz; **não** descompactar no tree) |

Ver [`docs/architecture.md`](../docs/architecture.md) e o esboço em [`docs/apdata-6x1-feasibility.md`](../docs/apdata-6x1-feasibility.md).

## Política

- **Somente `SELECT`.** Deny de DML/DDL no stub (`src/policy/select-only.ts`).
- Conta de banco deve ser read-only no servidor; a política no processo é defesa em profundidade.
- Sem secrets no Git. Use `.env` local a partir de `.env.example` (placeholders).
- LGPD: não logar nem exportar PII por padrão; preferir agregação / layout do simulador.

## Desenvolvimento (stub)

```bash
cd mcp
cp .env.example .env   # preencher fora do Git
npm install
npm run build
```

Scripts reais de tools (`export_payroll_rows`, etc.) ficam para uma entrega posterior — este diretório só fixa a estrutura.

## O que não fazer

- Não colocar connection strings com senha no repo, no ZIP ou em docs.
- Não expor UPDATE/INSERT/DELETE nem scripts ComandosDml contra produção via MCP.
- Não citar nomes de clientes em código, commits ou chat.
