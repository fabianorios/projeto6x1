# MCP — Apdata / folha somente leitura

Servidor MCP **SELECT-only** do **Projeto 6×1** para leitura de tabelas Apdata (folha / frequência). Entrada canônica do simulador continua sendo CSV; este pacote é a ponte opcional de leitura.

Produto separado deste repo (`fabianorios/projeto6x1`). Integração com Gestão Consultoria, se houver, será **apenas por link/embed**.

## Tools

| Tool | Função |
|------|--------|
| `list_tables` | Lista tabelas da **allowlist** (filtro opcional por nome) |
| `describe_table` | Colunas via `INFORMATION_SCHEMA` (MSSQL); só allowlist |
| `select_rows` | `SELECT` parametrizado + `TOP`/`LIMIT` obrigatório; allowlist |

**Bloqueado:** `INSERT` / `UPDATE` / `DELETE` / DDL / `EXEC` / multi-statement (ver `src/policy/select-only.ts`).

**Allowlist (seed):** `Horarios`, `HorariosJornadas`, `Jornadas`, `TiposDiasPonto`, `Contratados`, `CentrosCustos`, `Cargos`, `QuantidadesHorasMes`, `Folhas`, `Locais`, `Empresas`, `HorariosTiposDiasAT`, `TiposEscalas`, `TiposEscalasTrabalhos`, `ConATransportes`, `MeiosTransportesItens`. (`ConCalculoATransportes` fora de propósito.)

**LGPD:** não selecionar nem logar nomes de cliente / CPF por padrão; preferir colunas técnicas e agregação.

## Drivers

| `DB_DRIVER` | Status |
|-------------|--------|
| `mssql` | Suportado (`mssql` / Tedious) |
| `oracle` | Stub (erro claro ao conectar) |

## Como rodar

```bash
cd mcp
cp .env.example .env   # preencher fora do Git — nunca commitar secrets
npm install
npm test               # unit tests do SQL guard (sem DB)
npm run build
npm start              # stdio MCP (Cursor / clients)
# ou: npm run dev      # tsx sem build
```

CI não precisa de banco real: `npm test` + `npm run build` / `typecheck` bastam.

## Cursor MCP config

Adicione em `~/.cursor/mcp.json` (ou nas settings MCP do Cursor), ajustando o caminho absoluto do repo:

```json
{
  "mcpServers": {
    "apdata-folha-readonly": {
      "command": "node",
      "args": ["/ABS/PATH/TO/projeto6x1/mcp/dist/server.js"],
      "env": {
        "DB_DRIVER": "mssql",
        "MSSQL_SERVER": "localhost",
        "MSSQL_PORT": "1433",
        "MSSQL_DATABASE": "YOUR_DATABASE",
        "MSSQL_USER": "YOUR_READONLY_USER",
        "MSSQL_PASSWORD": "YOUR_PASSWORD",
        "MSSQL_ENCRYPT": "true",
        "MSSQL_TRUST_SERVER_CERTIFICATE": "false",
        "SQL_TIMEOUT_MS": "15000",
        "SQL_MAX_ROWS": "5000"
      }
    }
  }
}
```

Alternativa com npm:

```json
{
  "mcpServers": {
    "apdata-folha-readonly": {
      "command": "npm",
      "args": ["--prefix", "/ABS/PATH/TO/projeto6x1/mcp", "run", "start", "--silent"],
      "env": {
        "DB_DRIVER": "mssql",
        "MSSQL_DATABASE": "YOUR_DATABASE",
        "MSSQL_USER": "YOUR_READONLY_USER",
        "MSSQL_PASSWORD": "YOUR_PASSWORD"
      }
    }
  }
}
```

Rode `npm run build` em `mcp/` antes de apontar para `dist/server.js`.

## Política

- Conta de banco **read-only** no servidor + deny DML/DDL neste processo.
- Sem secrets no Git (só `.env.example` com placeholders).
- Ver [`docs/architecture.md`](../docs/architecture.md) e [`docs/apdata-6x1-feasibility.md`](../docs/apdata-6x1-feasibility.md).

## O que não fazer

- Não colocar connection strings com senha no repo, no ZIP ou em docs.
- Não expor UPDATE/INSERT/DELETE nem scripts ComandosDml contra produção via MCP.
- Não citar nomes de clientes em código, commits ou chat.
