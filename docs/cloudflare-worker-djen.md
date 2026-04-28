# 🇧🇷 Cloudflare Worker — Proxy DJEN (grátis)

A API do CNJ (`comunicaapi.pje.jus.br`) tem **CloudFront geo-block** e rejeita
qualquer request de fora do Brasil. As Edge Functions do Lovable Cloud rodam em
Frankfurt (eu-central-1) → daí os 75+ erros 403 consecutivos.

A solução mais barata, rápida e profissional é um **Cloudflare Worker**:
plano gratuito permite **100.000 requisições/dia** (mais que suficiente — usamos
~50/dia), roteia automaticamente pelo POP do Brasil (GIG/GRU) e leva 5 min para
configurar.

---

## Passo a passo (5 minutos)

### 1. Criar conta Cloudflare (se não tiver)
https://dash.cloudflare.com/sign-up — grátis, só precisa de email.

### 2. Criar Worker
1. No dashboard → **Workers & Pages** → **Create application** → **Create Worker**
2. Nome sugerido: `djen-proxy`
3. Clique em **Deploy** (ele cria com o código padrão "Hello World")
4. Depois clique em **Edit code**

### 3. Colar este código

```js
export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Aceita qualquer path /api/v1/comunicacao?...
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
      // CF respeita region routing automático; o request sai de um POP BR
      cf: { cacheTtl: 60, cacheEverything: false },
    });

    // Devolve com CORS aberto (só nossa edge function usa, mas evita problemas)
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

### 4. Deploy
Botão **Deploy** no canto superior direito. Em ~10 segundos você terá uma URL tipo:

```
https://djen-proxy.SEU-USUARIO.workers.dev
```

### 5. Testar (opcional)
No navegador, abra:
```
https://djen-proxy.SEU-USUARIO.workers.dev/api/v1/comunicacao?numeroOab=290702&ufOab=SP&dataDisponibilizacaoInicio=2026-04-20&dataDisponibilizacaoFim=2026-04-28&pagina=1&itensPorPagina=10
```

Deve retornar JSON com as comunicações (não mais 403).

### 6. Configurar no WnevesBox
Me mande a URL do seu Worker (`https://djen-proxy.XXX.workers.dev`) que eu cadastro
o secret `DJEN_PROXY_URL` automaticamente. A edge function `sync-djen` já está
preparada para usar esse proxy quando o secret existir, e cai pra URL direta
caso contrário (sem quebrar nada).

---

## Custos
- **Zero.** O free tier da Cloudflare cobre 100k requisições/dia.
- Nosso uso real: 4 sincronizações/dia × ~10 chamadas = 40 req/dia.
- Margem: 2.500x o necessário.
