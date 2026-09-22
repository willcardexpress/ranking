# Metodologia de ranking — RankLocal

**Status: implementado na Fase 3.**

## Regras permanentes (não podem ser violadas)

- O RankLocal **nunca** afirma conhecer ou reproduzir exatamente o algoritmo
  de ranking do Google, nem que o índice representa o "algoritmo oficial do
  Google".
- O RankLocal **nunca** afirma que uma empresa está "oficialmente em posição
  X no Google".
- Terminologia obrigatória em toda a UI: *posição observada*, *presença
  local*, *resultado encontrado*, *monitoramento RankLocal*, *índice
  proprietário RankLocal*, *visibilidade observada*.
- O "Índice RankLocal" é uma métrica própria (0-100), calculada por nós,
  nunca apresentada como pontuação oficial do Google.

## O que foi verificado antes de implementar (set/2026)

1. **Não existe endpoint de "ranking" ou "local pack position" na Places
   API.** A Google não expõe uma API que devolva a posição de uma empresa
   no local pack (o card de mapas que aparece nos resultados de busca). O
   que existe é a Text Search (New) (`POST /v1/places:searchText`), que
   devolve uma lista ordenada de estabelecimentos para uma consulta de
   texto com viés de localização (`locationBias.circle`) — e essa ordem é
   o que tratamos como "posição observada". Não é o mesmo algoritmo nem o
   mesmo layout do local pack renderizado na página de busca/mapas do
   Google — é uma observação via API pública, coletada por nós.
2. **`rankPreference: "RELEVANCE"`** é o valor recomendado pela própria
   documentação da Google para queries categóricas (como "dentista em
   Brasília"), então é o que usamos — em vez de `DISTANCE`, que ordenaria
   só por proximidade e não seria comparável a uma busca real.
3. **Restrições de cache e armazenamento (Google Maps Platform Terms of
   Service / Service Specific Terms, verificado em set/2026):**
   - `place_id` pode ser armazenado **indefinidamente**.
   - Coordenadas (latitude/longitude) podem ficar em cache por até **30
     dias corridos**.
   - Qualquer outro "conteúdo Google" (nome, endereço formatado, avaliação,
     contagem de avaliações, etc.) só pode ficar em cache por até **30
     dias corridos**, depois disso precisa ser atualizado ou apagado — não
     pode ser "arquivado" indefinidamente.
   - É proibido fazer scraping ou exportar conteúdo do Google Maps para uso
     fora dos serviços da própria Google.

   **Isso mudou o desenho do schema**: `ranking_grid_points` guarda só
   coordenadas geradas por nós (não são "conteúdo Google", então podem
   ficar indefinidamente); `ranking_results` guarda apenas `place_id`
   (permitido indefinidamente) e a posição observada (métrica nossa) — o
   histórico de ranking **nunca** guarda nome, endereço ou nota em texto
   bruto. Para exibir "empresa encontrada" em um ponto do grid, a UI
   sempre resolve o nome via a tabela `places` (cache) e — ver
   `lib/places-lookup.ts` — trata qualquer registro com mais de 30 dias
   como indisponível, mostrando o Place ID em vez de um nome
   potencialmente desatualizado.

## Como o scan de grid funciona

1. O usuário define uma **palavra-chave** (`keywords`) e um **ponto de
   referência** (`keyword_locations` — o centro do grid, ex.: a sede da
   empresa ou um bairro específico).
2. Ao rodar um scan, `services/ranking/grid.ts` gera os pontos do grid
   (3x3, 5x5 ou 7x7) por aproximação equiretangular a partir do centro,
   com espaçamento de 600 a 1000 m dependendo do tamanho do grid.
3. Para cada ponto, `GooglePlacesService.searchTextAtLocation()`
   (`services/google/places.ts`) faz uma Text Search (New) com
   `locationBias` = círculo centrado no ponto, e localiza a posição do
   Place ID da empresa monitorada na lista de resultados (1-based; `null`
   se não encontrada entre os resultados retornados).
4. Cada ponto é persistido em `ranking_grid_points` (coordenada) +
   `ranking_results` (posição observada + lista de Place IDs encontrados,
   usada depois para a aba de concorrentes).
5. Ao final, os estabelecimentos observados são gravados/atualizados no
   cache `places` (upsert, respeitando os 30 dias).

## Métricas (services/ranking/metrics.ts)

- **Posição média, melhor posição, pior posição**: calculadas só entre os
  pontos do grid em que a empresa foi encontrada.
- **Top 3 / Top 10**: % de pontos do grid (sobre o total, incluindo os não
  encontrados) em que a empresa apareceu entre as 3 ou 10 primeiras
  posições.
- **Tendência**: compara a posição média do scan mais recente com a do
  scan anterior para o mesmo ponto de referência.

## Índice RankLocal (services/ranking/index-score.ts)

Métrica proprietária 0-100: 40% presença no Top 3 + 30% presença no Top 10
+ 30% posição média normalizada (posição 1 = 100 pontos, posição no limite
do grid pesquisado ≈ 0 pontos). Pesos documentados no próprio código-fonte
e ajustáveis futuramente — nunca uma reprodução do algoritmo do Google.

## Proteção contra execução travada/duplicada (corrigida após auditoria)

Mesmo desenho do módulo de SEO (`docs/seo-audit.md`): timeout interno de
45s (`lib/with-timeout.ts`), auto-recuperação de scans `running` há mais
de 5 minutos, e um índice único parcial em
`ranking_scans (keyword_location_id) WHERE status = 'running'`
(`database/migrations/0007_prevent_concurrent_runs.sql`) impedindo dois
scans simultâneos para o mesmo ponto de referência.

## Limitações conhecidas desta fase

- O scan roda de forma síncrona dentro da Server Action
  (`lib/actions/ranking.ts`): para grids maiores (7x7 = 49 pontos), a
  requisição pode levar dezenas de segundos. Mover para um job em segundo
  plano (fila) é um candidato natural para a Fase 9 (Automações).
- O rate limiting interno (`services/google/rate-limiter.ts`, categoria
  `"grid"`) limita a 60 buscas de grid por minuto por processo — grids
  muito grandes ou scans simultâneos podem esbarrar nesse limite.
- Não há job automático de expurgo/refresh dos registros de `places` com
  mais de 30 dias — hoje o efeito prático é só a UI deixar de mostrar o
  nome; um job de rotina para manter o cache saudável também fica para a
  Fase 9.
