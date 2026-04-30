# 🇧🇷 Cloudflare Worker — Proxy DJEN

A API do CNJ (`comunicaapi.pje.jus.br`) está atrás de **CloudFront com geo-block**
e rejeita qualquer request fora do Brasil com `HTTP 403 — "configured to block
access from your country"`.

As Edge Functions do Lovable Cloud rodam em Frankfurt (eu-central-1). Daí o 403.

A solução é usar um **proxy hospedado em IP brasileiro**.

---

## ⚠️ Aviso importante sobre Cloudflare Workers no plano Free

O Cloudflare Worker Free **NÃO garante saída por POP brasileiro**. O Worker
roda no POP mais próximo do request — se o request vem do Frankfurt (caso das
Edge Functions Supabase), o Worker também sai de Frankfurt e o CNJ continua
bloqueando com 403.

### Sintoma típico de roteamento errado
Resposta do Worker contém:
```
The Amazon CloudFront distribution is configured to block access from your country.
```

### Soluções (escolher uma)

**Opção A — Cloudflare Workers Paid + Smart Placement / Regional Services**
Plano Workers Paid (US$ 5/mês) habilita **Regional Services** — você pode
forçar a saída por SAM (`sam-bra` = Brasil). Adicione no `wrangler.toml`:
```toml
[placement]
mode = "smart"
```
ou na config do Worker no dashboard, defina `Regional Service: South America`.

**Opção B — VPS/proxy reverso em provedor brasileiro**
- AWS Lightsail São Paulo (US$ 3.50/mês)
- Oracle Cloud Free Tier São Paulo (grátis para sempre, 2 VMs)
- Magalu Cloud (BR puro)

Subir um nginx simples com `proxy_pass https://comunicaapi.pje.jus.br`.

**Opção C — Vercel Functions com região `gru1` (São Paulo)**
Grátis até 100GB de transferência. Crie uma função serverless com:
```js
export const config = { runtime: 'edge', regions: ['gru1'] };
```

---

## Código do Worker (referência)

Útil mesmo no plano pago — os headers HTTP corretos são essenciais:

```js
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = `https://comunicaapi.pje.jus.br${url.pathname}${url.search}`;

    const upstream = await fetch(target, {
      method: request.method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Referer': 'https://comunica.pje.jus.br/',
        'Origin': 'https://comunica.pje.jus.br',
      },
      cf: { cacheTtl: 60, cacheEverything: false },
    });

    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  },
};
```

---

## Como diagnosticar
Teste o seu proxy direto pelo curl:
```
curl -i "https://SEU-PROXY/api/v1/comunicacao?numeroOab=290702&ufOab=SP&dataDisponibilizacaoInicio=2026-04-25&dataDisponibilizacaoFim=2026-04-30&pagina=1&itensPorPagina=5"
```
- ✅ JSON com `items: [...]` → proxy OK
- ❌ HTML com "block access from your country" → o proxy está saindo por IP NÃO brasileiro
- ❌ HTTP 5xx → CNJ instável (raro)

## Como cadastrar no WnevesBox
Vá em **Configurações → Integrações DJEN** e cole a URL do proxy. O sistema
valida automaticamente antes de salvar.
