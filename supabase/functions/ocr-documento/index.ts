import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { imageBase64, mimeType, prompt } = await req.json();
    if (!imageBase64 || !mimeType) {
      return new Response(JSON.stringify({ error: "imageBase64 e mimeType são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    if (resp.status === 429) return new Response(JSON.stringify({ error: "Limite de requisições. Tente em alguns instantes." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (resp.status === 402) return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Configurações." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`AI gateway error: ${resp.status} ${txt}`);
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content || "";
    return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[ocr-documento]", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
