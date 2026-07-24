import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { provisionKeycloakUser } from "@/lib/identity/identity-functions";

/**
 * Gate 1: an admin approves a self-registered account. Sends the Keycloak
 * set-password email (the invite) and clears the pending flag so the user can
 * log in. When identity-functions is not configured (local dev), provisioning
 * resolves to "skipped" and we still clear the flag so the flow works offline.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!user.registration_pending) {
    return NextResponse.json(
      { error: "This registration has already been approved." },
      { status: 400 }
    );
  }

  const { status: provisioning, keycloakUserId } = await provisionKeycloakUser({
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
  });

  if (provisioning === "failed") {
    return NextResponse.json(
      { error: "Could not send the setup email. Please try again." },
      { status: 502 }
    );
  }

  await prisma.user.update({
    where: { id },
    data: {
      registration_pending: false,
      ...(keycloakUserId ? { keycloak_id: keycloakUserId } : {}),
    },
  });

  return NextResponse.json({ provisioning });
}
