# Runbook — Rotação Trimestral de Secrets

**Cadência:** a cada 90 dias (Q1: Jan/Fev/Mar, Q2: Abr/Mai/Jun, Q3: Jul/Ago/Set, Q4: Out/Nov/Dez).
**Responsável:** administrador único (`wneves2006@yahoo.com.br`).
**Janela recomendada:** sábado 06h–08h BR (menor tráfego, sync-djen recém-rodado).

> ⚠️ **Antes de começar:** verificar que nenhum job crítico está em andamento.
> ```sql
> SELECT job_name, status, started_at FROM public.cron_runs
>  WHERE status = 'running' ORDER BY started_at DESC LIMIT 5;
> ```

---

## 1. `RESEND_API_KEY` (envio de e-mails transacionais)

**Impacto se vazar:** atacante envia e-mails em nome do escritório.
**Tempo de janela aceitável:** envio de e-mails fica indisponível ~2 minutos.

1. Painel Resend → API Keys → **Create API Key** → escopo `sending_access` para o domínio do projeto.
2. Copiar a nova key (formato `re_...`).
3. Lovable → Settings → Connectors → Lovable Cloud → Secrets → editar `RESEND_API_KEY` → colar nova key → Save.
4. Aguardar ~30s para todas as edge functions captarem a nova env.
5. Testar:
   ```bash
   # opcional: enfileirar um teste
   psql -c "SELECT public.enqueue_email('transactional_emails', '{\"to\":\"<seu-email>\",\"subject\":\"rotacao test\",\"html\":\"<p>ok</p>\",\"label\":\"smoke\",\"purpose\":\"transactional\",\"message_id\":\"rot-test-1\"}');"
   ```
6. Verificar `email_send_log` em ≤2min — deve aparecer `status='sent'`.
7. Painel Resend → API Keys → **revogar a key antiga**.
8. Registrar no audit_log:
   ```sql
   INSERT INTO public.audit_logs(user_id, action, table_name, new_data)
   VALUES (auth.uid(), 'SECRET_ROTATED', 'secrets',
           jsonb_build_object('secret','RESEND_API_KEY','rotated_at',now()));
   ```

---

## 2. `SUPABASE_SERVICE_ROLE_KEY` (acesso completo ao banco)

**Impacto se vazar:** acesso TOTAL ao banco, bypass de RLS.
**Tempo de janela aceitável:** 5–10 minutos (todos os edges precisam reler).

> 🚨 **CRITICAL:** após rotacionar, o cron `process-email-queue` precisa ser re-agendado
> porque ele autentica via Vault secret `email_queue_service_role_key`.

1. Lovable Cloud admin UI → Project → API Keys → **Rotate service_role key**.
2. Copiar nova key.
3. Atualizar secret `SUPABASE_SERVICE_ROLE_KEY` no painel de secrets do Lovable.
4. Re-rodar `email_domain--setup_email_infra` (idempotente; refresca Vault + cron).
5. Smoke test:
   ```sql
   -- deve retornar a contagem normalmente
   SELECT count(*) FROM auth.users;
   ```
6. Monitorar `cron_runs` por 1 hora — não deve haver picos de `failed`.
7. Audit log conforme item 1.

---

## 3. `SUPABASE_JWKS` (chaves públicas para verificação JWT)

**Impacto se vazar:** nenhum (são chaves PÚBLICAS).
**Quando rotacionar:** apenas quando rotaciona o **signing key** privado correspondente,
ou seguindo o calendário do Supabase (a cada 12 meses).

1. Dashboard Supabase → Project → JWT Keys → **Rotate signing key**.
2. Copiar o novo JWKS (formato JSON com `keys: [...]`).
3. Atualizar secret `SUPABASE_JWKS`.
4. **Não há janela de downtime** se feito corretamente: o Supabase mantém a chave
   antiga válida por 24h durante a transição (grace period).
5. Smoke test: login normal pelo `/auth` deve funcionar.
6. Audit log.

---

## 4. `TURNSTILE_SECRET_KEY` (Cloudflare Turnstile siteverify)

**Impacto se vazar:** atacante pode validar tokens em nome do escritório
(consome quota Cloudflare; sem dano de segurança real).
**Tempo de janela aceitável:** instantâneo.

1. Cloudflare Dashboard → Turnstile → site → **Rotate Secret Key**.
2. Copiar nova secret (formato `0x...`).
3. Atualizar secret `TURNSTILE_SECRET_KEY` no Lovable.
4. **NÃO precisa atualizar** `VITE_TURNSTILE_SITE_KEY` (a site key é pública e
   continua válida — só rotaciona se quiser invalidar widgets já carregados).
5. Smoke test: tentar fluxo OTP que dispare verificação.
6. Audit log.

---

## 5. `RESEND_WEBHOOK_SECRET` (assinatura Svix do webhook bounce/complaint)

**Impacto se vazar:** atacante consegue forjar bounces/complaints e suprimir
envios para qualquer e-mail.
**Tempo de janela aceitável:** ~1 minuto.

1. Painel Resend → Webhooks → endpoint `resend-webhook` → **Roll secret**.
2. Copiar nova `whsec_...`.
3. Atualizar secret `RESEND_WEBHOOK_SECRET` no Lovable.
4. Smoke test:
   ```bash
   # do painel Resend, dispara "Test send" do tipo email.bounced
   # deve aparecer 1 row em suppressed_emails com reason='bounce'
   ```
5. Audit log.

---

## 6. `LOVABLE_API_KEY` (gateway de IA)

**Não rotacionar manualmente** — usar o tool nativo `lovable_api_key__rotate_lovable_api_key`
(ou pelo painel Workspace → AI → Rotate). Update_secret/delete_secret não funcionam para essa key.

---

## Checklist final de rotação trimestral

- [ ] `RESEND_API_KEY`
- [ ] `RESEND_WEBHOOK_SECRET`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `SUPABASE_JWKS` (anual, a cada 12 meses)
- [ ] `TURNSTILE_SECRET_KEY`
- [ ] `LOVABLE_API_KEY` (via tool dedicado)
- [ ] Verificar `audit_logs` filtrado por `action='SECRET_ROTATED'` para
      confirmar que todos foram registrados.
- [ ] Verificar `cron_runs` últimas 24h: nenhum spike de `failed`.
- [ ] Verificar `email_send_log` últimos 100 envios: taxa de `sent` ≥ 95%.

## Em caso de incidente (key comprometida)

Pular o ciclo trimestral e rotacionar IMEDIATAMENTE. A janela de exposição
deve ser medida em minutos, não horas. Após rotação, varrer:

```sql
-- atividade suspeita nas últimas 24h
SELECT action, table_name, count(*) FROM public.audit_logs
 WHERE created_at > now() - interval '24 hours'
 GROUP BY 1,2 ORDER BY 3 DESC;

-- logins novos
SELECT user_id, ip_hash, first_seen_at FROM public.known_devices
 WHERE first_seen_at > now() - interval '24 hours';
```

Se houver suspeita real → forçar logout global:
```sql
-- invalida todas as sessões (todos usuários precisam logar de novo)
DELETE FROM auth.sessions;
```
