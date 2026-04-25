// S26: utilitários para mascarar PII em logs/toasts e impedir vazamento.
// Use em TODOS os console.log/console.error e mensagens de toast que
// contenham email, CPF/CNPJ, OAB ou telefone do usuário.

/** Mascara um email preservando 1º char e domínio. ex: a***@dominio.com */
export function maskEmail(email?: string | null): string {
  if (!email || typeof email !== 'string') return '';
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return '***';
  const user = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  const head = user.slice(0, 1);
  return `${head}***${domain}`;
}

/** Mascara CPF (11 dígitos) ou CNPJ (14 dígitos). ex: 123.***.***-45 */
export function maskCpf(doc?: string | null): string {
  if (!doc || typeof doc !== 'string') return '';
  const digits = doc.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.***.***/****-${digits.slice(12)}`;
  }
  return '***';
}

/** Mascara telefone preservando DDD + 2 últimos. ex: (11) ****-**45 */
export function maskPhone(phone?: string | null): string {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return '***';
  const ddd = digits.slice(0, 2);
  const tail = digits.slice(-2);
  return `(${ddd}) ****-**${tail}`;
}

/** Mascara OAB preservando UF e 2 últimos dígitos. ex: SP/****56 */
export function maskOab(oab?: string | null, uf?: string | null): string {
  if (!oab) return '';
  const digits = oab.replace(/\D/g, '');
  const tail = digits.slice(-2).padStart(2, '*');
  return uf ? `${uf}/****${tail}` : `****${tail}`;
}
