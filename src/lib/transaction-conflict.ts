/**
 * Thrown inside an interactive `$transaction` callback to roll it back and
 * answer 409 with `body`. Rolling back matters when an earlier statement in the
 * callback already wrote (for example, the approval lock).
 */
export class TransactionConflict extends Error {
  constructor(readonly body: { error: string; code: string; reasons?: string[] }) {
    super(body.error);
  }
}

/** Prisma's interactive-transaction timeout (P2028), answered as 503. */
export const isTransactionTimeout = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2028";
