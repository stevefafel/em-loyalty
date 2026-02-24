# Mobil 1 Loyalty Program Portal — POC Implementation Plan

## Context

Exxon Mobil needs a B2B loyalty portal for auto repair shops to manage enrollment, upload invoices, earn points, access training, and download marketing materials. This is a greenfield POC at `/Users/admin/dev/EM` — currently only contains `docs/loyalty_program_overview.md`. The user has an existing Supabase project they'll provide credentials for.

---

## Tech Stack

- **Framework**: Next.js (App Router) with `src/` directory
- **Package Manager**: npm
- **UI**: shadcn/ui + Tailwind CSS + Lucide icons
- **Database**: Supabase (PostgreSQL) — existing project
- **Storage**: Supabase Storage (invoices, training PDFs, collateral PDFs)
- **Auth**: Mock auth (role picker, no real auth)
- **Validation**: Zod

---

## ExxonMobil / Mobil 1 Branding & Theme

### Brand Colors

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Primary Red** | ExxonMobil Red | `#F01523` | Primary buttons, CTAs, active states, badges |
| **Secondary Red** | Mobil 1 Red | `#D42E12` | Hover states, secondary accents |
| **Primary Blue** | ExxonMobil Blue | `#0036C1` | Links, info badges, secondary buttons |
| **Dark Charcoal** | Sidebar/Nav | `#2B2926` | Sidebar background, footer, dark sections |
| **Medium Gray** | Borders/Text | `#6A737B` | Secondary text, borders, muted UI |
| **Light Gray** | Backgrounds | `#F4F5F7` | Page backgrounds, card backgrounds |
| **White** | Content | `#FFFFFF` | Cards, main content area |

### Tailwind Theme Configuration

In `tailwind.config.ts`, extend the default theme with ExxonMobil brand colors:

```ts
colors: {
  exxon: {
    red: '#F01523',
    'red-dark': '#D42E12',
    blue: '#0036C1',
    charcoal: '#2B2926',
    gray: '#6A737B',
    'gray-light': '#939598',
    'gray-lighter': '#F4F5F7',
  }
}
```

shadcn/ui CSS variables in `globals.css` will be overridden to use these brand colors for `--primary`, `--secondary`, `--accent`, `--sidebar`, etc.

### Typography

- **Primary font**: EMprint — ExxonMobil's official proprietary typeface
  - Source: `https://github.com/platonovAlexey/mobil-1/tree/master/src/fonts`
  - Available weights: Light (300), Regular (400), Semibold (600), Bold (700)
  - Formats: woff2, woff, ttf, eot (use woff2 primarily for web)
  - Load via `next/font/local` in root layout, placed in `src/fonts/`
- **Headings**: EMprint Bold/Semibold
- **Body**: EMprint Regular at 14-16px
- **Fallback stack**: `'EMprint', Inter, system-ui, sans-serif`

### Logo & Assets

Place in `public/` directory:
- `public/mobil1-logo.svg` — Mobil 1 logo (red/white) for header and login page
- `public/exxonmobil-logo.svg` — ExxonMobil corporate logo for footer
- `public/favicon.ico` — Mobil 1 branded favicon

### Design System Rules

- **Sidebar**: Dark charcoal (`#2B2926`) background with white text, red accent for active nav item
- **Header**: White background with subtle bottom border, Mobil 1 logo on the left
- **Primary buttons**: ExxonMobil Red (`#F01523`) with white text, darker red on hover
- **Secondary buttons**: Outlined with ExxonMobil Blue (`#0036C1`)
- **Cards**: White background, subtle gray border, rounded corners
- **Status badges**: Red for pending/rejected, green for approved, gray for new
- **Login page**: Dark charcoal background with centered Mobil 1 logo and white card form
- **Overall style**: Clean, corporate, professional — matches ExxonMobil's modern web presence

---

## File Structure

```
src/
├── app/
│   ├── layout.tsx                          # Root layout
│   ├── page.tsx                            # Landing redirect
│   ├── globals.css
│   ├── (auth)/login/page.tsx               # Mock login: pick user + shop
│   ├── (portal)/
│   │   ├── layout.tsx                      # Auth guard, sidebar, shop/auth providers
│   │   ├── dashboard/page.tsx
│   │   ├── enrollment/page.tsx             # Initial $2,500 invoice upload
│   │   ├── invoices/page.tsx               # Invoice list + upload
│   │   ├── admin/invoices/page.tsx         # Admin review queue
│   │   ├── admin/shops/page.tsx            # Admin shop management
│   │   ├── points/page.tsx                 # Loyalty ledger
│   │   ├── swag-shop/page.tsx              # Redemption catalog (display only)
│   │   ├── training/page.tsx               # Module list
│   │   ├── training/[id]/page.tsx          # PDF viewer + quiz
│   │   ├── collateral/page.tsx             # Marketing PDF library
│   │   ├── ads/page.tsx                    # Partner ads
│   │   └── perks/page.tsx                  # Performance perks
│   └── api/
│       ├── auth/mock/route.ts
│       ├── invoices/route.ts
│       ├── invoices/[id]/route.ts
│       ├── invoices/[id]/approve/route.ts  # Core business logic
│       ├── shops/route.ts
│       ├── shops/[id]/route.ts
│       ├── training/route.ts
│       ├── training/[id]/route.ts
│       ├── training/[id]/complete/route.ts
│       ├── collateral/route.ts
│       ├── collateral/[id]/download/route.ts
│       └── points/route.ts
├── components/
│   ├── ui/                                 # shadcn/ui components
│   ├── layout/sidebar.tsx, header.tsx, shop-switcher.tsx
│   ├── invoices/invoice-upload-form.tsx, invoice-list.tsx, invoice-review-card.tsx
│   ├── training/pdf-viewer.tsx, quiz.tsx, module-card.tsx
│   ├── collateral/collateral-card.tsx
│   ├── points/points-balance.tsx, ledger-table.tsx
│   └── enrollment/enrollment-gate.tsx
├── context/auth-context.tsx, shop-context.tsx
├── hooks/use-auth.ts, use-shop.ts, use-enrollment-guard.ts
├── fonts/
│   ├── EMprint-Light.woff2
│   ├── EMprint-Regular.woff2
│   ├── EMprint-Semibold.woff2
│   └── EMprint-Bold.woff2
├── lib/
│   ├── supabase/client.ts, server.ts, storage.ts
│   ├── validators/invoice.ts, training.ts, auth.ts
│   ├── constants.ts
│   ├── utils.ts
│   └── swag-items.ts
└── types/database.ts, api.ts
supabase/
├── migrations/  (00001–00011 SQL files)
└── seed.sql
```

---

## Implementation Phases

### Phase 1: Project Initialization & Branding Setup
- `npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"`
- `npm install @supabase/supabase-js @supabase/ssr zod lucide-react date-fns`
- `npx shadcn@latest init` → then add: button, card, input, label, select, table, tabs, badge, dialog, dropdown-menu, separator, sheet, toast, avatar, progress
- **Download EMprint fonts** from GitHub repo into `src/fonts/` (woff2 files for all 4 weights)
- **Configure EMprint** via `next/font/local` in root layout with Light/Regular/Semibold/Bold weights
- **Configure ExxonMobil theme**: extend `tailwind.config.ts` with brand colors (exxon-red, exxon-blue, exxon-charcoal, etc.) and EMprint font family
- **Override shadcn CSS variables** in `globals.css` to map `--primary` to ExxonMobil Red, `--sidebar` to charcoal, `--font-sans` to EMprint, etc.
- Place Mobil 1 logo SVGs and favicon in `public/`
- Create `.env.local.example` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Create `src/lib/constants.ts` (POINTS rate, MIN_INITIAL_INVOICE, enums)
- Create `src/lib/utils.ts` (cn(), calculatePoints(), formatCurrency(), generateStoragePath())

### Phase 2: Database Schema
11 migration files creating:
- **Enums**: `program_status`, `invoice_status`, `user_role`, `ledger_type`
- **Tables**: `shops`, `users`, `user_shops`, `invoices`, `training_modules`, `training_log`, `collateral`, `collateral_log`, `loyalty_ledger`
- **Storage buckets**: `invoices` (private), `training-pdfs` (public), `collateral-pdfs` (public)
- **Seed data**: 1 admin user, 2 shop users, 2 shops (1 approved, 1 new), sample invoice+ledger entry, 2 training modules with quiz questions, 3 collateral items

Apply via Supabase dashboard SQL editor or `supabase db push`.

### Phase 3: Supabase Clients & Types
- `src/lib/supabase/client.ts` — browser client via `createBrowserClient()`
- `src/lib/supabase/server.ts` — server client + admin client (service role key)
- `src/lib/supabase/storage.ts` — upload/download helpers per bucket
- `src/types/database.ts` — TS interfaces for all tables
- `src/types/api.ts` — MockSession, API request/response types
- `src/lib/validators/` — Zod schemas for invoice upload, quiz submission, mock login

### Phase 4: Mock Auth & Shop Context
- `POST /api/auth/mock` — sets `mock-session` JSON cookie with userId, role, shopId
- `src/lib/session.ts` — `getSession()` reads cookie server-side
- `src/context/auth-context.tsx` — AuthProvider with login/logout, exposes user & role
- `src/context/shop-context.tsx` — ShopProvider with active shop, shop switcher updates cookie
- `src/hooks/use-enrollment-guard.ts` — redirects to /enrollment if shop not approved

### Phase 5: App Layout & Navigation (Branded)
- Root layout with Inter font + metadata, Mobil 1 favicon
- Root page redirects to /dashboard or /login based on session
- **Portal layout** (`(portal)/layout.tsx`): reads session, fetches user+shops from Supabase, wraps in AuthProvider + ShopProvider, renders sidebar + header + main content
- **Sidebar**: Dark charcoal (`#2B2926`) background, white nav text, ExxonMobil Red active indicator, Mobil 1 logo at top
- **Header**: White background, shop name + status badge, shop switcher dropdown, role badge, logout
- **Login page**: Dark charcoal background, centered Mobil 1 logo, white card form, red primary button

### Phase 6: Enrollment & Invoices
- **Enrollment page**: upload form for initial $2,500 invoice, status display (new/pending/approved/rejected)
- **Invoice list page**: table of shop invoices + upload dialog (gated by enrollment)
- **Invoice API routes**: CRUD + the critical **approve endpoint** that:
  1. Updates invoice status to `approved`
  2. Calculates points (`Math.floor(amount / 100)`)
  3. Inserts `loyalty_ledger` credit entry
  4. Updates `shop.loyalty_points_balance`
  5. If `is_initial`, sets `shop.program_status = 'approved'`
- **Admin invoice review**: pending invoice queue with approve buttons
- **Admin shop management**: list shops, change status

### Phase 7: Points, Training & Collateral
- **Points page**: balance card + ledger transaction table
- **Swag Shop**: hardcoded catalog display (hats, gloves, shirts with point costs), no real redemption
- **Training list**: module cards with completion status badges
- **Training detail**: PDF viewer (iframe) + 5-question quiz, client-side grading, server-side append-only log
- **Collateral library**: grouped by category, download button logs event then opens file

### Phase 8: Dashboard, Ads, Perks & Polish
- **Shop user dashboard**: points balance, quick stats, action links
- **Admin dashboard**: shop counts by status, pending invoice count, recent activity
- **Ads page**: static partner banners (autoops.com, steer.io)
- **Perks page**: monthly reward tiers table (Bronze/Silver/Gold based on oil change volume)
- **Polish**: loading.tsx skeletons, error.tsx boundaries, toast notifications, responsive sidebar

---

## Critical Business Rules

1. **Points only on approval**: Points are added to ledger and shop balance ONLY when admin approves an invoice via `POST /api/invoices/[id]/approve`
2. **Enrollment gating**: If `shop.program_status !== 'approved'`, UI blocks all pages except enrollment/initial upload
3. **File naming**: `[shop_id]/[timestamp]_[original_name]` in Supabase Storage
4. **Training log append-only**: Always INSERT new rows, never UPDATE — allows retake history

---

## Verification Plan

1. **Start dev server**: `npm run dev` — confirm app loads at localhost:3000
2. **Mock login flow**: Select admin user → lands on admin dashboard; select shop user with multiple shops → shop picker appears → lands on shop dashboard
3. **Enrollment flow**: Login as shop user for "Express Oil North" (status: new) → only enrollment page accessible → upload invoice ≥ $2,500 → status changes to pending → login as admin → approve invoice → shop becomes approved → all nav links appear
4. **Invoice + Points**: As approved shop user, upload additional invoice → admin approves → check points ledger shows credit entry → shop balance increases
5. **Training**: Open module → view PDF → complete quiz → check score → retake → verify both attempts appear in log
6. **Collateral**: Download a PDF → verify download logged in collateral_log
7. **Shop switching**: Login as John Quick (has 2 shops) → switch shops via dropdown → verify invoice list and points change per shop
