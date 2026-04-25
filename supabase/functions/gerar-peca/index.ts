// Gerador de Peças Jurídicas - estilo "Advogado(a) Sênior"
// Usa Lovable AI Gateway (Gemini) com streaming SSE
//
// S29: extrai user_id do JWT, NUNCA do body. Retorna 401 sem auth.
// S13: CORS allowlist via _shared/cors.ts.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeadersFor, handleCorsPreflight, rejectIfDisallowedOrigin } from '../_shared/cors.ts';

const SYSTEM_PROMPT = `Você é um(a) ADVOGADO(A) SÊNIOR brasileiro(a), com mais de 20 anos de experiência forense em todas as áreas do Direito (Civil, Penal, Trabalhista, Tributário, Administrativo, Empresarial, Família, Consumidor, Previdenciário).

DIRETRIZES OBRIGATÓRIAS DE REDAÇÃO:
1. Redija em português jurídico formal, na norma culta, com vocativo, endereçamento e formatação técnica corretos.
2. ESTRUTURA padrão de peça processual:
   - ENDEREÇAMENTO (Excelentíssimo Senhor Doutor Juiz...)
   - QUALIFICAÇÃO completa das partes
   - SÍNTESE FÁTICA (I - DOS FATOS)
   - FUNDAMENTAÇÃO JURÍDICA (II - DO DIREITO) com subitens
   - PEDIDOS (III - DOS PEDIDOS) numerados em alíneas
   - VALOR DA CAUSA
   - Termos em que pede deferimento + Local, data, assinatura/OAB
3. Cite SEMPRE: dispositivos legais (CF, CC, CPC, CLT, CDC, CP, CPP, leis especiais) com artigo, parágrafo e inciso; súmulas (STF/STJ/TST) e jurisprudência relevante (acórdãos com tribunal, relator, data) quando aplicável.
4. Use latinismos com parcimônia (data venia, in casu, ex vi, mutatis mutandis).
5. Argumentação em silogismo jurídico: premissa maior (lei) → premissa menor (fato) → conclusão.
6. Quando faltarem dados, INDIQUE entre colchetes: [NOME DO AUTOR], [CPF], [ENDEREÇO], [VALOR], [DATA], etc., para o(a) advogado(a) preencher.
7. Nunca invente jurisprudência: se citar acórdão, use formato genérico verificável (ex.: "STJ, REsp 1.737.412/SE, Rel. Min. Nancy Andrighi, j. 05.02.2019") ou indique [verificar julgado recente].
8. Adapte tom à peça: petição inicial (assertiva), contestação (impugnativa), recurso (técnica recursal), parecer (analítico), notificação (formal/intimidativa).
9. Não use markdown decorativo (sem **, sem #). Use NUMERAÇÃO ROMANA para seções e arábica para parágrafos quando pertinente.
10. Saída: APENAS a peça pronta para protocolo, sem comentários meta ("aqui está sua peça", etc.).`;

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const blocked = rejectIfDisallowedOrigin(req);
  if (blocked) return blocked;
  const cors = corsHeadersFor(req);

  try {
    // S29: autenticação obrigatória — extrai user_id do JWT
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const userId = claims.claims.sub;

    const body = await req.json();
    // S29: se body.user_id presente e diferente do JWT, rejeita
    if (body.user_id && body.user_id !== userId) {
      return new Response(JSON.stringify({ error: 'forbidden_user_mismatch' }), {
        status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const { tipo, area, fatos, pedidos, partes, contexto, instrucoes } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");

    const userPrompt = `Elabore a seguinte peça jurídica:

TIPO DE PEÇA: ${tipo || "(não especificado — inferir pelo contexto)"}
ÁREA DO DIREITO: ${area || "(inferir)"}

PARTES:
${partes || "(a especificar — usar marcadores [AUTOR]/[RÉU] etc.)"}

FATOS:
${fatos || "(não fornecidos — solicitar ao operador ou usar marcadores genéricos)"}

PEDIDOS DESEJADOS:
${pedidos || "(inferir conforme tipo de peça)"}

CONTEXTO ADICIONAL:
${contexto || "—"}

INSTRUÇÕES ESPECÍFICAS:
${instrucoes || "Seguir estrutura padrão e fundamentação completa."}

Produza a peça completa, pronta para revisão final e protocolo.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        stream: true,
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições atingido. Aguarde alguns instantes." }),
          { status: 429, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }
      if (resp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }),
          { status: 402, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }
      const t = await resp.text();
      console.error("AI gateway error:", resp.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(resp.body, {
      headers: { ...cors, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("gerar-peca error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
