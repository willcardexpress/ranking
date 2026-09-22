# Deployment — RankLocal

## Fase 1

Hospedagem prevista: **Vercel** (frontend + server actions/API routes) e
**Supabase** (Postgres, Auth, Storage).

Passos para colocar a Fase 1 em produção:

1. Criar projeto no Supabase e rodar `database/schema.sql`.
2. Configurar as variáveis de `.env.example` no painel da Vercel.
3. Deploy do repositório na Vercel (build: `npm run build`).
4. Confirmar que RLS está ativo em todas as tabelas antes de liberar acesso.

## Fases futuras

- **Google Cloud Run** para jobs mais pesados (crawler de SEO, scans de
  ranking em grid, AI Visibility em lote) quando não couberem bem em
  funções serverless da Vercel.
- **Google Cloud Scheduler** para rotinas periódicas (Fase 9 — Automações).
- **Google Cloud Storage** para armazenar artefatos grandes (relatórios PDF,
  screenshots de auditoria) quando necessário.
- Monitoramento, logs estruturados e backups automatizados do Supabase antes
  da Fase 10 (Produção).
