# services/google

Camada de integração com APIs do Google (Places, Business Profile, Search
Console, Analytics, Maps Platform).

## Status

- ✅ **Places (New)** — implementado (`places.ts`). Ver `docs/google-places.md`.
- ✅ **Business Profile** — implementado (`business-profile.ts`). Ver
  `docs/google-business-profile.md` — inclui OAuth completo, mas depende
  de aprovação manual da Google ("Basic API Access") para funcionar de
  fato.
- ⏳ Search Console / Analytics — Fase 6.

Regras obrigatórias (ver docs/architecture.md e a especificação do produto):
- Nenhum componente React chama estas APIs diretamente.
- Nunca inventar endpoints ou dados.
- Antes de implementar qualquer integração: confirmar documentação oficial,
  endpoint, autenticação, scopes, permissões, limitações, custos e
  disponibilidade.
- Implementar cache, retry, timeout e tratamento de erros.
- Nunca registrar tokens/secrets em logs.
