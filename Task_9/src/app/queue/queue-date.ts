/**
 * The date a queue page shows: the requested `?date=` when it is a real calendar date (YYYY-MM-DD), otherwise today.
 * (So 2026-13-45 falls back to today.)
 */
export function resolveQueueDate(requestedDate: string | undefined, today: string): string {
  if (
    requestedDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) &&
    new Date(`${requestedDate}T00:00:00Z`).toISOString().slice(0, 10) === requestedDate
  ) {
    return requestedDate;
  }
  return today;
}
