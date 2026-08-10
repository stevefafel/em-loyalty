import { describe, expect, it } from "vitest";
import {
  computePegasusBonusMonths,
  PEGASUS_PROGRAM_START,
  PEGASUS_THRESHOLD,
} from "./pegasus";

// Helper: one entry summing to `count` on the 15th of the given UTC month.
const month = (y: number, m: number, count: number) => ({
  date: new Date(Date.UTC(y, m, 15)),
  count,
});

const utcMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 1));

// "now" defaults to Dec 15, 2026 so Aug–Nov 2026 are completed months.
const NOW = new Date(Date.UTC(2026, 11, 15));

function bonusMonths(
  entries: { date: Date; count: number }[],
  now: Date = NOW
) {
  return computePegasusBonusMonths(entries, now).map((d) => d.toISOString());
}

describe("computePegasusBonusMonths", () => {
  it("returns nothing with no data", () => {
    expect(bonusMonths([])).toEqual([]);
  });

  it("pays at the 3rd consecutive qualifying month and every month after", () => {
    const entries = [
      month(2026, 7, 30), // Aug — streak 1
      month(2026, 8, 30), // Sep — streak 2
      month(2026, 9, 30), // Oct — streak 3 → Pegasus reached, BONUS
      month(2026, 10, 30), // Nov — streak 4 → bonus
      month(2026, 11, 30), // Dec — streak 5 → bonus
    ];
    // now = Jan 15 2027 so Aug–Dec 2026 are all completed months.
    expect(bonusMonths(entries, new Date(Date.UTC(2027, 0, 15)))).toEqual([
      utcMonth(2026, 9).toISOString(),
      utcMonth(2026, 10).toISOString(),
      utcMonth(2026, 11).toISOString(),
    ]);
  });

  it("pays nothing for the first two months of a streak", () => {
    const entries = [
      month(2026, 7, 30), // Aug — streak 1
      month(2026, 8, 30), // Sep — streak 2
    ];
    expect(bonusMonths(entries)).toEqual([]);
  });

  it("a below-threshold month breaks the streak and restarts the count", () => {
    const entries = [
      month(2026, 2, 30), // Mar — streak 1 (pre-program)
      month(2026, 3, 30), // Apr — streak 2 (pre-program)
      month(2026, 4, 30), // May — streak 3 (pre-program, unpaid)
      month(2026, 5, 10), // Jun — below threshold, breaks the streak
      month(2026, 6, 30), // Jul — streak 1
      month(2026, 7, 30), // Aug — streak 2
      month(2026, 8, 30), // Sep — streak 3 → bonus (re-earned)
      month(2026, 9, 30), // Oct — streak 4 → bonus
    ];
    expect(bonusMonths(entries)).toEqual([
      utcMonth(2026, 8).toISOString(),
      utcMonth(2026, 9).toISOString(),
    ]);
  });

  it("skipping a month forfeits the bonus until 3 consecutive months are rebuilt", () => {
    const entries = [
      month(2026, 7, 30), // Aug — streak 1
      month(2026, 8, 30), // Sep — streak 2
      month(2026, 9, 30), // Oct — streak 3 → bonus
      month(2026, 10, 5), // Nov — misses the bar, streak resets to 0
      month(2026, 11, 30), // Dec — streak 1, no bonus
      month(2027, 0, 30), // Jan — streak 2, no bonus
      month(2027, 1, 30), // Feb — streak 3 → bonus again
    ];
    expect(bonusMonths(entries, new Date(Date.UTC(2027, 2, 15)))).toEqual([
      utcMonth(2026, 9).toISOString(),
      utcMonth(2027, 1).toISOString(),
    ]);
  });

  it("a month with no data at all breaks the streak", () => {
    const entries = [
      month(2026, 6, 30), // Jul — streak 1
      month(2026, 7, 30), // Aug — streak 2
      // Sep missing entirely → streak resets
      month(2026, 9, 30), // Oct — streak restarts at 1
      month(2026, 10, 30), // Nov — streak 2
    ];
    expect(bonusMonths(entries)).toEqual([]);
  });

  it("pre-program months build the streak but are never paid", () => {
    const entries = [
      month(2026, 4, 30), // May — pre-program, streak 1
      month(2026, 5, 30), // Jun — pre-program, streak 2
      month(2026, 6, 30), // Jul — pre-program, streak 3 (would pay, but pre-program)
      month(2026, 7, 30), // Aug — streak 4 → first payable month
    ];
    expect(bonusMonths(entries, new Date(Date.UTC(2026, 8, 10)))).toEqual([
      utcMonth(2026, 7).toISOString(),
    ]);
  });

  it("streaks entirely before the program start pay nothing", () => {
    const entries = [
      month(2026, 2, 30),
      month(2026, 3, 30),
      month(2026, 4, 30),
      month(2026, 5, 30),
      month(2026, 6, 30), // Mar–Jul 2026, all pre-program
    ];
    expect(bonusMonths(entries, PEGASUS_PROGRAM_START)).toEqual([]);
  });

  it("ignores the current in-progress month", () => {
    const entries = [
      month(2026, 7, 30), // Aug — streak 1
      month(2026, 8, 30), // Sep — streak 2
      month(2026, 9, 30), // Oct — would be streak 3, but "now" is mid-October
    ];
    expect(bonusMonths(entries, new Date(Date.UTC(2026, 9, 20)))).toEqual([]);
  });

  it("sums multiple daily entries within a month against the threshold", () => {
    const daily = (y: number, m: number, days: number[]) =>
      days.map((d) => ({ date: new Date(Date.UTC(y, m, d)), count: 9 }));
    const entries = [
      ...daily(2026, 7, [1, 10, 20]), // Aug: 27 ≥ 25 — streak 1
      ...daily(2026, 8, [5, 15, 25]), // Sep: 27 — streak 2
      ...daily(2026, 9, [2, 12, 22]), // Oct: 27 — streak 3 → bonus
      ...daily(2026, 10, [3, 13, 23]), // Nov: 27 — streak 4 → bonus
    ];
    expect(PEGASUS_THRESHOLD).toBe(25);
    expect(bonusMonths(entries)).toEqual([
      utcMonth(2026, 9).toISOString(),
      utcMonth(2026, 10).toISOString(),
    ]);
  });
});
