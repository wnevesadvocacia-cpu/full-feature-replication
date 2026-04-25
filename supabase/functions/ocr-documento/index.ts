// OCR jurídico via Lovable AI Gateway (Gemini multimodal).
// S29: extrai user_id do JWT.
// S13: CORS allowlist.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeadersFor, handleCorsPreflight, rejectIfDisallowedOrigin } from '../_shared/cors.ts';
import { rejectIfCsrfBlocked } from '../_shared/csrf.ts';
import { captureException } from '../_shared/sentry.ts';

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const blocked = rejectIfDisallowedOrigin(req);
  if (blocked) return blocked;
  const cors = corsHeadersFor(req);
  const csrfBlock = rejectIfCsrfBlocked(req, cors);
  if (csrfBlock) return csrfBlock;

  try {
    // S29: autenticação obrigatória
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await sb.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const userId = claims.claims.sub;

    const body = await req.json();
    if (body.user_id && body.user_id !== userId) {
      return new Response(JSON.stringify({ error: 'forbidden_user_mismatch' }), {
        status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const { imageBase64, mimeType, prompt } = body;
    if (!imageBase64 || !mimeType) {
      return new Response(JSON.stringify({ error: "imageBase64 e mimeType são obrigatórios" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const sysPrompt = prompt || `Você é um OCR jurídico. Extraia TODO o texto visível na imagem do documento, preservando a estrutura (títulos, parágrafos, listas, tabelas em markdown). Após o texto, adicione uma seção "## METADADOS EXTRAÍDOS" com (quando identificáveis): tipo de documento, número do processo (CNJ), partes, datas relevantes, valores em R$, prazos. Responda em português.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: [
            { type: "text", text: "Extraia o texto do documento abaixo:" },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ]},
        ],
      }),
    });

    if (resp.status === 429) return new Response(JSON.stringify({ error: "Limite de requisições. Tente em alguns instantes." }), { status: 429, headers: { ...cors, "Content-Type": "application/json" } });
    if (resp.status === 402) return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Configurações." }), { status: 402, headers: { ...cors, "Content-Type": "application/json" } });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`AI gateway error: ${resp.status} ${txt}`);
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content || "";
    return new Response(JSON.stringify({ text }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[ocr-documento]", e);
    await captureException(e, { fn: 'ocr-documento' });
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
