// Skip only identities persisted for this owner; a failed lookup must stop the run.
export function pendingDjenEntries<T extends { externalId: string }>(entries: T[], existingIds: string[]): T[] {
  const existing = new Set(existingIds);
  return entries.filter(entry => !existing.has(entry.externalId));
}