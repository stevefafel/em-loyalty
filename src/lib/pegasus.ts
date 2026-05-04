import type { OilChangeCount } from "@/types/database";

export const PEGASUS_THRESHOLD = 25;
export const PEGASUS_CONSECUTIVE_MONTHS = 3;

export interface MonthlyOilChanges {
  label: string;
  count: number;
  monthStart: Date;
  isCurrent: boolean;
}

/**
 * Aggregate daily oil-change entries into the trailing N calendar months
 * ending at `now` (inclusive). Months with no entries return count 0.
 */
export function aggregateOilChangesByMonth(
  entries: Pick<OilChangeCount, "date" | "count">[],
  months: number,
  now: Date = new Date()
): MonthlyOilChanges[] {
  const buckets: MonthlyOilChanges[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      label: monthStart.toLocaleDateString("en-US", { month: "long" }),
      count: 0,
      monthStart,
      isCurrent: i === 0,
    });
  }

  for (const e of entries) {
    const d = new Date(e.date);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const bucket = buckets.find(
      (b) => b.monthStart.getFullYear() === y && b.monthStart.getMonth() === m
    );
    if (bucket) bucket.count += e.count;
  }

  return buckets;
}

/**
 * Compute Pegasus status: count of consecutive trailing months meeting the
 * threshold, whether status is achieved, and how many more months are needed.
 *
 * The current (last) month is treated as in-progress: if it's still below
 * threshold, we don't count it as a break — we count the streak that ended
 * with the previous month, since the current month can still hit the bar.
 */
export function computePegasusStatus(
  months: Pick<MonthlyOilChanges, "count">[]
) {
  let streak = 0;
  let startIdx = months.length - 1;
  if (startIdx >= 0 && months[startIdx].count < PEGASUS_THRESHOLD) {
    startIdx--;
  }
  for (let i = startIdx; i >= 0; i--) {
    if (months[i].count >= PEGASUS_THRESHOLD) streak++;
    else break;
  }
  const inPegasus = streak >= PEGASUS_CONSECUTIVE_MONTHS;
  const monthsToGo = inPegasus ? 0 : PEGASUS_CONSECUTIVE_MONTHS - streak;
  return { consecutive: streak, inPegasus, monthsToGo };
}
