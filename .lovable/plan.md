# Fallback DJEN Inteligente — Multi-fonte com Failover Automático

## Objetivo
Eliminar o ponto único de falha (CNJ/DJEN). Quando o DJEN cair, o sistema continua capturando publicações por outras rotas, sem intervenção manual e sem duplicar dados.

## Arquitetura em 3 camadas (ordem de preferência)

```text
┌─────────────────────────────────────────────────────┐
│  sync-djen (orquestrador)                           │
│                                                     │
│  1º DJEN/CNJ oficial      ← fonte primária          │
│      ↓ se 5xx/429/timeout                           │
│  2º Proxy DJEN alt. (Cloudflare BR)  ← já existe   │
│      ↓ se falhar                                    │
│  3º Scraper DJE-SP direto (PDF diário por OAB)      │
│      ↓ se falhar (ou tribunal ≠ SP)                 │
│  4º Fila de retry agressivo (15/15/30/60 min)       │
└─────────────────────────────────────────────────────┘
                     ↓
        Idempotência SHA-256 (já existe) → intimations
```

## Escopo desta entrega

### 1. Health-check + circuit breaker (novo módulo)
- Nova tabela `djen_source_health`: last_ok, last_fail, consecutive_failures, current_source.
- Se DJEN falhar 2x seguidas → marca `degraded` e pula direto para próxima fonte por 30min.
- Se voltar OK → volta a DJEN automaticamente.

### 2. Scraper DJE-SP (nova edge function `scrape-dje-sp`)
- Alvo: `https://esaj.tjsp.jus.br/cdje/consultaAvancada.do` (busca por OAB).
- Cobre 100% TJSP (o tribunal com mais volume — provavelmente o seu caso).
- Roda apenas quando DJEN estiver degradado ou como reconciliação D-1.
- Parseia PDF do dia, extrai bloco por OAB, gera SHA-256 → mesma tabela `intimations`.

### 3. Retry queue agressivo
- Ajuste no cron: quando DJEN falhar, agenda re-tentativa em 15min (hoje é só a próxima janela de 6h).
- Notificação destrutiva ao admin após 3 falhas consecutivas.

### 4. UI — badge de saúde da fonte
- Em `/intimacoes`: pequeno indicador no topo — 🟢 DJEN OK / 🟡 Fallback ativo (fonte X) / 🔴 Todas fontes fora.

## Fora do escopo (avisar depois se quiser)
- AASP Push por e-mail (exige credenciais AASP + parser MIME dedicado).
- Jusbrasil/Escavador (pago, requer contrato).
- Tribunais fora de SP no scraper (TRF/TST/TJs — cada um é um parser).

## Detalhes técnicos

**Novos arquivos:**
- `supabase/functions/scrape-dje-sp/index.ts` — scraper com deno-dom + pdf-parse.
- `supabase/functions/_shared/djenHealth.ts` — leitura/escrita circuit breaker.
- Migration: tabela `djen_source_health` + coluna `source_provider` em `intimations`.

**Modificados:**
- `supabase/functions/sync-djen/index.ts` — orquestração com fallback chain.
- `src/pages/Intimacoes.tsx` — badge de saúde (usa `djen_source_health` via realtime).

**Idempotência:** mantém SHA-256 atual, então a mesma publicação vinda de duas fontes não duplica.

**Custo:** zero incremental (tudo roda nas edge functions existentes).

## Riscos conhecidos
- Scraper DJE-SP pode quebrar se ESAJ mudar HTML/PDF (baixo, mudam ~1x/ano).
- Só cobre TJSP nesta versão — se sua OAB tem processos em outros tribunais, esses ficam dependentes do DJEN.

## Estimativa
~4 arquivos novos, ~2 modificados, 1 migration. Entrega funcional em uma iteração.

---

**Aprova para eu implementar?** Se preferir escopo ainda menor (só o circuit breaker + retry agressivo, sem scraper), me avise.