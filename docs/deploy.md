# Deploy estático (Vercel)

Publica só o **app Vite** (`npm run build` → `dist/`). Sem secrets e sem MCP no host.

## Conectar o repositório

1. Abra [vercel.com/new](https://vercel.com/new) e faça login.
2. **Import Git Repository** → escolha `fabianorios/projeto6x1`.
3. Confirme o projeto (Framework Preset: Vite se aparecer; `vercel.json` já define `buildCommand` e `outputDirectory`).
4. **Environment Variables:** nenhuma — o build estático não usa env.
5. Clique em **Deploy**.

Deploys seguintes: push (ou merge) em `main` dispara build automático.

## O que não entra neste deploy

- Pasta `mcp/` e credenciais de banco ficam **fora** do Vercel (MCP local/servidor depois).
- Não adicione secrets nem variáveis de ambiente neste projeto estático.
