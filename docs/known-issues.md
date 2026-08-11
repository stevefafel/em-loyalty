---
title: Known Issues and Deferred Work
type: docs
date: 2026-08-11
---

# Known Issues and Deferred Work

Things we know are wrong or missing, recorded so they are not rediscovered from
scratch. Each entry states what breaks, where to look, and a concrete first step
— enough to pick up cold.

Line references are accurate as of `04a831c` (the merge of PR #8). They drift;
trust the described symptom over the number.

Most of the security entries were found by code review during PR #8, which
closed seven tenant-scoping holes. They are the residue that PR deliberately did
not fix. **Nothing here is known to be exploited — the portal is not yet live in
production**, which is why these are recorded rather than treated as incidents.

---

## Security

### S1. Invoice file paths are never bound to the shop

**The one to do first.** `POST /api/invoices` accepts whatever `filePath` the
client sends and only checks that it is present
([`route.ts:56`](../src/app/api/invoices/route.ts)). Legitimate paths are minted
server-side as `${shopId}/${Date.now()}_${fileName}` after a real membership
check ([`upload-url/route.ts:53`](../src/app/api/storage/upload-url/route.ts)),
so the shop-prefix invariant exists at mint time — but nothing enforces it at
create time.

So a shop user can create an invoice **in their own shop** whose `file_path`
points at another shop's storage object, then call
`POST /api/invoices/[id]/extract`. That route now authorizes correctly on
`invoice.shop_id`, but it downloads `invoice.file_path` with the admin storage
client ([`extract/route.ts:64`](../src/app/api/invoices/[id]/extract/route.ts)),
which bypasses bucket policy. The result is a cross-tenant read that survived
PR #8 because the guard checks the row's shop, not the path's.

**First step:** reject a `filePath` at create time that does not start with
`${shopId}/`. Check for legacy rows predating that key format before enforcing.
Then add the same assertion immediately before the download, so an
already-persisted bad row cannot be replayed.

### S2. Revoking shop membership does not revoke access for up to 8 hours

`canAccessShop` trusts `session.shopId` and never re-checks the `user_shop`
table ([`shop-scope.ts`](../src/lib/shop-scope.ts)). Sessions are sealed with a
fixed 8-hour lifetime
([`auth/config.ts:77`](../src/lib/auth/config.ts)), so removing someone from a
shop leaves their existing session working until it expires.

This is app-wide, not specific to the routes PR #8 touched, and it is the normal
trade-off of a stateless sealed session — worth an explicit decision rather than
an accident.

**First step:** either re-check membership for non-admins on shop-scoped paths
(one `prisma.userShop.findUnique`, the pattern already used at
[`upload-url/route.ts:45-52`](../src/app/api/storage/upload-url/route.ts)), or
add a session epoch claim bumped on membership and role change, and reject
sessions carrying a stale epoch.

### S3. Support routes still use the older inline scoping form

[`support/[id]/route.ts:42`](../src/app/api/support/[id]/route.ts) and
[`support/[id]/messages/route.ts:52`](../src/app/api/support/[id]/messages/route.ts)
compare `conversation.shop_id !== session.shopId` inline rather than going
through `canAccessShop`.

They are safe **today** only because `support_conversations.shop_id` is
non-nullable, so the null-versus-null case that produced the fail-open bugs in
PR #8 cannot arise. That is a property of the schema, not of the check.

**First step:** migrate both to `canAccessShop` so the fail-closed rule lives in
one place.

### S4. No rate limiting anywhere

There is no `middleware.ts` and no limiter in `src/`. This matters most for
`POST /api/invoices/[id]/extract`, which is a paid model call now reachable by
any ordinary shop user for their own invoices — repeat submission is a billing
problem before it is a correctness one.

---

## Correctness and robustness

### C1. Extraction destroys good data when the AI call fails, and has no concurrency control

`POST /api/invoices/[id]/extract` resets the extraction row to `processing` and
nulls every parsed field
([`extract/route.ts:37-46`](../src/app/api/invoices/[id]/extract/route.ts)) and
deletes its line items — **before** calling the model, which is capped at 30
seconds (`maxDuration = 30`, line 10). Two consequences:

- A timeout or a killed invocation destroys the previous good extraction and
  leaves the row stranded in `processing` with no recovery path.
- Two concurrent calls on the same invoice duplicate line items and bill the
  model twice.

**First step:** write only `status: "processing"` (plus a started-at) on entry,
and overwrite the parsed fields inside the existing success transaction, with
the line-item delete moved into that same transaction. Add an age check so a
`processing` row older than `maxDuration` is treated as failed and retryable.

### C2. `shopFilterFor`'s deny sentinel is spreadable

[`shop-scope.ts`](../src/lib/shop-scope.ts) returns `null` to mean "this caller
may see nothing". Callers must check it — but `{ ...shopFilterFor(session, id) }`
type-checks fine and silently produces `{}`, which is the *unscoped* filter the
helper exists to prevent.

**First step:** return a discriminated union
(`{ allowed: false } | { allowed: true; where: {...} }`) so the mistake cannot
compile.

---

## Testing and infrastructure

### T1. There is no CI

No `.github` directory exists, so nothing runs tests, typecheck, lint, or the
build when a PR opens. The only check on a PR is the Vercel preview deployment,
which proves the app builds and deploys — **not** that tests pass.

Every verification claim on PRs #3–#8 came from running the suite locally. That
is a gap between what the checkmarks say and what was actually verified.

**First step:** a workflow running `npx tsc --noEmit`, `npx vitest run`, and
`npm run build` on pull requests. Lint cannot gate until T3 is resolved.

### T2. Vitest does not collect `.tsx`, so page components are untestable

`vitest.config` sets `include: ["src/**/*.test.ts"]` and no React testing
libraries are installed. Page and component behavior has no test path at all.

This is a live constraint on design, not just a gap: logic that needs coverage
has to live in a `.ts` module. `src/lib/shop-scope.ts` and
`src/lib/auth/login-errors.ts` were both extracted from route/page files for
exactly this reason.

**First step:** decide whether to add a component testing setup, or to treat
"extract logic to `.ts`" as the standing convention and write it down.

### T3. 24 pre-existing lint errors

`npm run lint` reports 25 problems on `main`, in two classes:

- **20 × `react-hooks/set-state-in-effect`** — the portal and admin data-fetch
  pages all call a `setState`-bearing loader directly in a `useEffect` body.
- **3 × `@next/next/no-assign-module-variable`** — the SCORM routes assign to a
  variable named `module`.

They predate all recent work and make the lint signal useless as a gate: a new
error would not stand out.

**First step:** fix or explicitly suppress the SCORM three (mechanical rename),
then decide whether the effect pattern is a real bug class here or should be
disabled with a documented reason.

---

## UI

### U1. The portal sidebar does not collapse on narrow screens

[`sidebar.tsx:107`](../src/components/layout/sidebar.tsx) is a fixed `w-60`
(240px) with no responsive or off-canvas behavior. On a 390px viewport that
leaves ~150px for content, which makes every portal page unusable on a phone.

**First step:** hide the sidebar below a breakpoint behind a toggle, or make it
an off-canvas drawer.

### U2. Pegasus Status Tracker is still on the dashboard

PR #6 removed the Pegasus tracker from Earn & Track Points per stakeholder
review. [`dashboard/page.tsx:297`](../src/app/(portal)/dashboard/page.tsx) still
renders a larger version with the same bar chart plus 3-month progress dots.

This may well be intended — the request named the Earn page specifically. Flagged
because the two pages now disagree about whether Pegasus tracking is surfaced.

**First step:** confirm with the stakeholder before changing anything.

---

## Feature work

### F1. Email notifications

Alerts are in-app only. A full plan exists at
[`plans/2026-08-10-001-feat-email-notifications-plan.md`](plans/2026-08-10-001-feat-email-notifications-plan.md)
and is implementation-ready.

The long pole has no code dependency: SendGrid domain authentication needs
CNAME records added to the Mobil DNS zone, which goes through whoever owns it.
Worth starting that request before the code.

---

## Environment notes

### E1. Test data in the shared development database

Left behind while verifying the support feature end to end:

- Support conversations titled **"E2E verification thread"** and
  **"Unread probe"** on Quick Lube Downtown
- One `support_reply` notification for that shop

Harmless, but they will look like real customer traffic to anyone reading the
support inbox. Safe to delete.
