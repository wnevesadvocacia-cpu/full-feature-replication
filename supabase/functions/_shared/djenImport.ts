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
