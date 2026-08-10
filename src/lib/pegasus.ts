import type { OilChangeCount } from "@/types/database";

export const PEGASUS_THRESHOLD = 25;
export const PEGASUS_CONSECUTIVE_MONTHS = 3;
export const PEGASUS_MONTHLY_BONUS = 10;
// Months before this earn no bonus, but do count toward building a streak.
export const PEGASUS_PROGRAM_START = new Date(Date.UTC(2026, 7, 1)); // Aug 2026

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
/**
 * The completed months (UTC month starts) whose Pegasus bonus is due.
 * Reaching Pegasus mode (the PEGASUS_CONSECUTIVE_MONTHS-th consecutive
 * qualifying month) pays the bonus, and so does every consecutive qualifying
 * month after it — i.e. streak >= PEGASUS_CONSECUTIVE_MONTHS — on or after
 * PEGASUS_PROGRAM_START. Missing the threshold resets the streak to zero, so
 * the shop must rebuild PEGASUS_CONSECUTIVE_MONTHS consecutive months before
 * earning again. The current (in-progress) month never qualifies; months with
 * no data count as zero and break the streak.
 */
export function computePegasusBonusMonths(
  // string dates from JSON payloads, Date objects straight from Prisma
  entries: { date: string | Date; count: number }[],
  now: Date = new Date()
): Date[] {
  const currentMonthStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    1
  );

  // Total oil changes per completed UTC month, keyed by month-start ms.
  const totals = new Map<number, number>();
  for (const e of entries) {
    const d = new Date(e.date);
    const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    if (monthStart >= currentMonthStart) continue;
    totals.set(monthStart, (totals.get(monthStart) ?? 0) + e.count);
  }
  if (totals.size === 0) return [];

  // Walk every calendar month from the first data month through the last
  // completed month so data gaps register as zero-count (streak-breaking).
  const first = new Date(Math.min(...totals.keys()));
  const bonusMonths: Date[] = [];
  let streak = 0;
  for (
    let m = first;
    m.getTime() < currentMonthStart;
    m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))
  ) {
    streak = (totals.get(m.getTime()) ?? 0) >= PEGASUS_THRESHOLD ? streak + 1 : 0;
    if (
      streak >= PEGASUS_CONSECUTIVE_MONTHS &&
      m.getTime() >= PEGASUS_PROGRAM_START.getTime()
    ) {
      bonusMonths.push(m);
    }
  }
  return bonusMonths;
}

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
