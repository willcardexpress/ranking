# Auditoria de SEO — RankLocal

**Status: implementado na Fase 5.**

## Natureza diferente das integrações Google

Este módulo não depende de nenhuma API de terceiros nem de termos de uso
externos — é um crawler próprio que busca o site que o próprio usuário
cadastrou para auditoria. Ainda assim, seguimos boas práticas
obrigatórias de um crawler responsável (ver `services/seo/crawler.ts`):

- **Respeita `robots.txt`**: páginas em `Disallow` para o user-agent `*`
  não são visitadas.
- **Identificação honesta**: todo request usa um User-Agent próprio
  (`RankLocalBot/1.0`), nunca se disfarça de navegador.
- **Timeout e retry limitado** em toda requisição HTTP (reaproveita
  `services/google/http.ts`, utilitário genérico de transporte).
- **Rate limiting interno** (`services/seo/rate-limiter.ts`), separado do
  rate limiter dos módulos Google — ver `docs/architecture.md`.
- **Escopo de páginas limitado** (até 15 páginas por auditoria: a home +
  as declaradas no `sitemap.xml`) para caber no tempo de uma Server
  Action e não sobrecarregar o site auditado.

## O que é analisado

Por página: HTTPS, status HTTP, `<title>` (presença e tamanho), meta
description (presença e tamanho), quantidade de H1/H2, URL canônica,
dados estruturados (JSON-LD), Open Graph, imagens sem `alt`, meta
viewport (sinal de mobile), volume de texto (thin content) e estrutura da
URL.

No nível do site: presença de `robots.txt`, presença de `sitemap.xml`, e
uma checagem de link interno quebrado (amostra de até 20 links únicos
encontrados nas páginas auditadas, verificados via `HEAD`).

## Proteção contra SSRF (corrigida após auditoria)

Toda requisição de rede do crawler passa por `services/seo/safe-fetch.ts`
(`safeFetch`), que é a única forma permitida de buscar uma URL fornecida
pelo usuário neste módulo:

1. **Só aceita `http`/`https`** — qualquer outro protocolo (`file:`,
   `ftp:`, `data:`, `gopher:`...) é recusado antes de qualquer I/O.
2. **Resolve o hostname para IP via DNS antes de conectar** e valida esse
   IP contra loopback, privado (RFC 1918), link-local (inclui o metadata
   de nuvem `169.254.169.254`), CGNAT, multicast, reservado e os
   equivalentes IPv6 (`::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`,
   incluindo endereços IPv4-mapped como `::ffff:127.0.0.1`) — ver
   `services/seo/ip-guard.ts`.
3. **Proteção contra DNS rebinding**: o IP validado no passo 2 é pinado
   diretamente na conexão TCP real via um `Agent` do `undici` com
   `connect.lookup` fixo — o socket nunca faz uma nova resolução de DNS
   por conta própria entre a validação e a conexão (essa é exatamente a
   janela que um ataque de DNS rebinding exploraria).
4. **Redirects nunca são seguidos automaticamente** (`redirect: "manual"`)
   — cada redirect é resolvido e revalidado do zero (protocolo + DNS +
   IP) antes de ser seguido, com um limite de 5 saltos.
5. Uma checagem adicional (`assertHostnameIsPublic`) roda também no
   momento em que o usuário cadastra a URL do site
   (`lib/actions/seo.ts`), só para dar feedback imediato — a proteção
   real é a do passo 2-4, que roda a cada requisição.

Testado em `tests/services/seo/ip-guard.test.ts` (validação pura de IP) e
`tests/services/seo/safe-fetch.test.ts` (integração: localhost, ranges
privados IPv4/IPv6, metadata de nuvem, redirect para IP privado, redirect
entre hosts públicos, limite de redirects, URL inválida).

## Proteção contra execução travada/duplicada (corrigida após auditoria)

- **Timeout interno** (`lib/with-timeout.ts`, 45s): se a auditoria demorar
  demais, a Server Action desiste e marca `seo_audits.status = 'failed'`
  em vez de deixar o registro em `running` para sempre. Limitação
  conhecida, documentada no próprio código: isto não aborta a função
  serverless em si (JS não cancela promises de verdade) — só garante que
  a ação retorna e o banco reflete a falha dentro de um tempo previsível.
- **Auto-recuperação de auditorias travadas**: ao iniciar uma nova
  auditoria, se a última ficou em `running` por mais de 5 minutos
  (provavelmente a função foi encerrada à força pela plataforma antes de
  conseguir marcar o próprio fim), ela é automaticamente marcada como
  `failed` para liberar espaço para uma nova tentativa.
- **Impede execução duplicada**: um índice único parcial em
  `seo_audits (website_project_id) WHERE status = 'running'`
  (`database/migrations/0007_prevent_concurrent_runs.sql`) garante, no
  próprio Postgres, que só exista uma auditoria `running` por site — uma
  segunda tentativa recebe "já existe uma auditoria em andamento".

## Limitações conhecidas desta fase (declaradas, não escondidas)

- **Sem link-following recursivo**: a auditoria não navega automaticamente
  pelo site inteiro — sem sitemap, audita só a home. Isso é intencional
  (evita crawls sem limite dentro de uma Server Action síncrona) e fica
  documentado, não escondido.
- **"Mobile"** é verificado apenas pela presença de `<meta viewport>` —
  não há renderização real em diferentes tamanhos de tela nem teste de
  usabilidade mobile de fato.
- **"Performance" não é medida nesta fase** — exigiria um navegador real
  (ex.: Lighthouse/Puppeteer), fora do escopo de uma função serverless
  simples. Não inventamos um número de performance para preencher a
  interface.
- **Sites que dependem de JavaScript para renderizar conteúdo (SPAs)**
  são vistos apenas pelo HTML inicial retornado pelo servidor, sem
  execução de JS — o que pode subestimar problemas ou conteúdo em sites
  assim.

## SEO Score

Métrica proprietária do RankLocal (0-100) — **não é o PageSpeed Insights
nem o Lighthouse Score da Google**, nem qualquer pontuação oficial.
Fórmula simples e determinística em `services/seo/score.ts`: começa em
100 e desconta por problema encontrado, por severidade (crítico -8,
aviso -3, informativo -1), com piso em 0.

## Arquitetura implementada

- `services/seo/robots.ts` — parser de `robots.txt` (puro, testável).
- `services/seo/parser.ts` — extrai sinais de uma página HTML (cheerio,
  puro, testável).
- `services/seo/rules.ts` — transforma sinais em problemas encontrados
  (puro, testável).
- `services/seo/score.ts` — SEO Score (puro, testável).
- `services/seo/rate-limiter.ts` / `errors.ts` — mesmo padrão dos módulos
  Google, mas independentes (arquitetura separada por integração).
- `services/seo/crawler.ts` — orquestrador (`server-only`, não testado
  diretamente, mesma convenção dos outros módulos de integração).
- `lib/actions/seo.ts` — Server Actions: cadastrar a URL do site e rodar
  uma auditoria.
- `lib/seo-data.ts` — leitura com fallback explícito para modo DEMO.
- UI: `components/empresas/seo/*`, integrado em `Empresa → Auditoria de SEO`.
