import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  registerSchema,
  composeShopAddress,
  composePrinter,
} from "@/lib/validators/register";

/**
 * Public self-registration. Intentionally unauthenticated. Creates a pending
 * shop + user and links them, but does NOT provision Keycloak — the invite is
 * only sent after an admin approves the registration (gate 1). This admin gate
 * is the abuse control: nothing is emailed to the applicant until approval.
 *
 * Prisma connects as the table owner and bypasses RLS, so these inserts are
 * allowed despite the anon role having no policies.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const d = parsed.data;

  // Dedupe on email up front for a friendly message (the unique index is the
  // real guard against a race).
  const existing = await prisma.user.findUnique({ where: { email: d.email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists. Try logging in." },
      { status: 409 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      const shop = await tx.shop.create({
        data: {
          name: d.shop_name,
          address: composeShopAddress(d),
          printer: composePrinter(d),
          program_status: "new",
        },
      });

      await tx.user.create({
        data: {
          email: d.email,
          first_name: d.first_name,
          last_name: d.last_name,
          role: "user",
          registration_pending: true,
          user_shops: { create: { shop_id: shop.id } },
        },
      });
    });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "An account with that email already exists. Try logging in." },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
