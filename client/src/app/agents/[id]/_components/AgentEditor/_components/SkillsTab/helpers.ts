/** Move the id at index `from` to index `to`, preserving every other order. */
export function reorder(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || from >= ids.length || to < 0 || to >= ids.length) return ids;
  const next = ids.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Toggle a skill's membership in the linked set — add at the end, or remove,
 *  dropping its position (decision 3: unlinking loses order). */
export function toggleLinked(linkedIds: string[], skillId: string): string[] {
  return linkedIds.includes(skillId)
    ? linkedIds.filter((id) => id !== skillId)
    : [...linkedIds, skillId];
}
