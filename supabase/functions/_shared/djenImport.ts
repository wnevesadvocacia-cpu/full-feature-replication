// Skip only identities persisted for this owner; a failed lookup must stop the run.
export function djenIdentityAliases(id: string): string[] {
  return id.startsWith("djen:hash:") ? [id, id.slice("djen:hash:".length)] : [id];
}
export function pendingDjenEntries<T extends { externalId: string }>(entries: T[], existingIds: string[]): T[] {
  const existing = new Set(existingIds);
  return entries.filter((entry) => {
    const aliases = djenIdentityAliases(entry.externalId);
    if (aliases.some((id) => existing.has(id))) return false;
    aliases.forEach((id) => existing.add(id));
    return true;
  });
}

// Keep the expiring shared lease after an upstream outage, avoiding a new request
// from each queued Jus.br batch while DJEN is unavailable. Other source failures
// must not pause healthy DJEN queries.
export function djenRequiresCooldown(error: unknown): boolean {
  return /\bDJEN\s+(?:429|502|503|504)\b/i.test(String(error ?? ""));
}
