/** Format an ISO timestamp for the versions list — locale date + time, no seconds. */
export function formatVersionDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
