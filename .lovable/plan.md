# Fase 1 — Cobertura Estadual Ampliada

## Objetivo
Reduzir dependência do DJEN/CNJ adicionando raspagem/consulta direta aos diários oficiais que concentram ~80% do volume: **TJSP (eSAJ/DJE)**, **TJMG (fallback já existente — endurecer)**, **TJRJ**, **TJRS (eproc)**, e **TRF1 a TRF6**.

## Arquitetura

```text
sync-djen (orquestrador atual)
    ├── 1. DJEN oficial (primário)          ← já existe
    ├── 2. Proxy DJEN alternativo           ← já existe
    ├── 3. TJMG fallback (HTML DJe)         ← já existe, endurecer parser
    ├── 4. TJSP fallback (NOVO)             ← eSAJ consultaAvancada por OAB
    ├── 5. TJRJ fallback (NOVO)             ← DJERJ consulta por OAB
    ├── 6. TJRS fallback (NOVO)             ← eproc consulta por OAB
    └── 7. TRF1-6 fallback (NOVO)           ← PJe/eproc federal por OAB
```

Todos os fallbacks compartilham:
- **Gatilho**: só executam quando DJEN devolve 0 itens para (OAB, data, UF esperada).
- **Idempotência**: SHA-256 do conteúdo (já implementado em `intimations`).
- **Enfileiramento**: mesmo pipeline `record_intimation` → `intimations` → notificações.
- **Health tracking**: cada fonte grava sucesso/erro em `djen_source_health` para o badge de UI já existente.

## Escopo desta entrega (Fase 1)

### Arquivos novos
- `supabase/functions/sync-djen/fallbacks/tjsp.ts` — scraper eSAJ (busca por OAB).
- `supabase/functions/sync-djen/fallbacks/tjrj.ts` — DJERJ HTML.
- `supabase/functions/sync-djen/fallbacks/tjrs.ts` — eproc TJRS.
- `supabase/functions/sync-djen/fallbacks/trf.ts` — parametrizável por região (1–6).
- `supabase/functions/sync-djen/fallbacks/_shared.ts` — helpers de parsing HTML, extração de bloco por OAB, geração de SHA-256, normalização de datas BR.

### Arquivos modificados
- `supabase/functions/sync-djen/index.ts` — chain de fallbacks com short-circuit e log por fonte.
- `src/components/DjenHealthBadge.tsx` — badge por-fonte (verde/amarelo/vermelho) quando qualquer fonte estiver degradada.

### Sem migrations novas
Reaproveita `djen_source_health` e `intimations` existentes; adiciona apenas registros novos por fonte (`source_provider` já é aceito).

## Fora do escopo (Fase 2/3 depois)
- Tribunais PJe-padrão (TJPR, TJSC, TJDFT, TJBA, etc.) — Fase 2.
- Tribunais com PDF-only (TJAM, TJRR, TJAP, etc.) — Fase 3.
- Superiores (STJ, STF, TST) — os relevantes já vêm no DJEN.

## Riscos
- Sites estaduais mudam HTML sem aviso → parser quebra. Mitigação: cada scraper roda em try/catch isolado; falha em um não afeta os outros; falhas geram notificação destrutiva ao admin via `djen-watchdog`.
- Rate-limit dos tribunais → chamadas serializadas com backoff de 2s entre requisições.
- Tempo de execução da edge function → cada fallback tem timeout de 30s e cache de 6h por (OAB, UF, data).

## Entrega
Uma iteração. ~5 arquivos novos, ~2 modificados, zero migration.

**Aprova ou quer ajuste antes de eu implementar?**
