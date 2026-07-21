import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  identityFunctionsConfigured,
  provisionKeycloakUser,
} from "@/lib/identity/identity-functions";

/**
 * Re-send the Keycloak set-password email for a user. Covers lost/expired
 * setup emails and users created before provisioning existed (the account is
 * created on the fly if it's missing).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!identityFunctionsConfigured()) {
    return NextResponse.json(
      { error: "The identity service is not configured in this environment." },
      { status: 503 }
    );
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const provisioning = await provisionKeycloakUser(
    {
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    },
    { resendIfExisting: true }
  );

  if (provisioning === "failed") {
    return NextResponse.json(
      { error: "Could not send the setup email. Please try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({ provisioning });
}
