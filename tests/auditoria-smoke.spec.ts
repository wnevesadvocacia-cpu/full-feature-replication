import { test, expect } from "../playwright-fixture";

/**
 * Smoke test ponta-a-ponta — Auditoria
 *
 * Passos críticos (mínimos para gastar pouco crédito):
 *  1. Acessar /#/auditoria sem sessão → deve redirecionar para /auth (login OTP).
 *  2. Validar UI de login (campo email + botão Continuar).
 *  3. Se houver sessão persistida no storageState, abrir /#/auditoria,
 *     garantir que a aba "Minhas Tarefas de Hoje" esteja ativa e
 *     validar que a contagem (linhas da tabela ou empty state) é renderizada.
 *
 * Login via OTP por email não é automatizável sem caixa de entrada acessível,
 * então o passo 3 só roda quando SMOKE_AUTHED=1 (sessão já presente no browser).
 */

test("auditoria smoke", async ({ page }) => {
  // 1) Acesso direto à rota protegida
  await page.goto("/#/auditoria");

  // 2) Sem sessão → tela de login
  if (!process.env.SMOKE_AUTHED) {
    await expect(page).toHaveURL(/#\/auth/);
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /continuar/i })).toBeVisible();
    return;
  }

  // 3) Com sessão → validar Auditoria
  await expect(page).toHaveURL(/#\/auditoria/);
  const tab = page.getByRole("tab", { name: /minhas tarefas de hoje/i })
    .or(page.getByText(/minhas tarefas de hoje/i).first());
  await expect(tab).toBeVisible({ timeout: 10_000 });

  // contagem hoje: tabela com linhas OU empty state com user_id
  const hasRows = await page.locator("table tbody tr").count();
  if (hasRows === 0) {
    await expect(page.getByText(/nenhuma tarefa|0 tarefas|user_id/i)).toBeVisible();
  } else {
    expect(hasRows).toBeGreaterThan(0);
  }
});
