# services/ranking

Mecanismo próprio de monitoramento de presença local via grid (3x3/5x5/7x7),
coletado através da Google Places API (New) — não existe endpoint oficial
de "ranking" ou "posição no local pack"; ver `docs/ranking-methodology.md`
para o que foi verificado antes de implementar.

## Status: implementado (Fase 3)

- `grid.ts` — geração dos pontos do grid a partir de um centro geográfico.
- `metrics.ts` — posição média, melhor, pior, Top 3, Top 10, tendência.
- `index-score.ts` — Índice RankLocal (métrica proprietária 0-100; nunca
  apresentado como algoritmo oficial do Google).

Toda a orquestração (chamadas à Google, persistência) fica em
`lib/actions/ranking.ts`, não aqui — este módulo é só a lógica pura,
testável sem depender de rede ou banco.
