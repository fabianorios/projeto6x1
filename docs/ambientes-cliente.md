# Ambientes de cliente (Apdata)

Turnocheck pode conectar a **várias bases** Apdata (MSSQL ou Oracle stub). Credenciais ficam no servidor, criptografadas; a UI nunca reexibe a senha após salvar.

## UI

No app, botão **Apdata → Simular** (header): revisa os SELECTs do mapeamento, executa export agregado via `/api/query/select` no ambiente ativo, mostra progresso e abre o `ResultsView` do motor.

Botão **Ambientes** (header do wizard):

| Ação | Comportamento |
|------|----------------|
| Listar | Nome, engine, host, user, base; senha mascarada (`••••••••`) |
| Adicionar / Editar | Nome, host, porta, database/service, user, password, engine |
| Testar conexão | `SELECT 1` via API (somente leitura) |
| Selecionar ativo | Define o ambiente usado pelo proxy `/api/query` |
| Remover | Apaga o registro (e a senha cifrada) |

Em **Editar**, deixe a senha em branco para manter a atual.

## API (`server/`)

Processo Node (Hono) pensado para VPS:

| Método | Caminho | Função |
|--------|---------|--------|
| `GET` | `/api/health` | Liveness |
| `GET` | `/api/environments` | Lista (senha mascarada) |
| `POST` | `/api/environments` | Cria |
| `PUT` | `/api/environments/:id` | Atualiza |
| `DELETE` | `/api/environments/:id` | Remove |
| `POST` | `/api/environments/:id/test` | Testa conexão |
| `POST` | `/api/environments/:id/activate` | Marca ativo |
| `GET` | `/api/environments/active` | Ambiente ativo |
| `GET` | `/api/query/tables` | Allowlist MCP |
| `POST` | `/api/query/select` | SELECT parametrizado (allowlist) |

O proxy **reusa** o guard do pacote `mcp/` (`assertSelectOnly`, allowlist, `buildSelectRows`). Não há rota de DML/DDL.

## Segurança e LGPD

- Senhas: AES-256-GCM com `ENCRYPTION_KEY` (ver `server/.env.example`).
- Arquivo em `DATA_DIR/environments.json` (gitignored) — só ciphertext da senha.
- Sem nomes de clientes hard-coded; o usuário escolhe o rótulo do ambiente.
- Conta de banco preferencialmente **read-only** no servidor SQL.

## Deploy (após merge)

1. `cd server && cp .env.example .env` → preencher `ENCRYPTION_KEY` (`openssl rand -hex 32`).
2. `npm ci && npm run build && npm start` (ou **pm2**: `turnocheck-api`).
3. Reverse proxy: path **`/api`** → `http://127.0.0.1:8787`.
4. SPA continua no processo estático; Vite proxy cobre `/api` em desenvolvimento.

```bash
# App
npm ci && npm run build

# API
cd server && npm ci && npm run build
# pm2 start dist/index.js --name turnocheck-api
```

## Local

```bash
# terminal 1
cd server && cp .env.example .env && npm install && npm run dev

# terminal 2
npm run dev   # Vite; /api → :8787
```

Testes sem DB: `cd server && npm test`.
