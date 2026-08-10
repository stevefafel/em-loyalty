import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Premium Growth Portal",
};

export default async function Home() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-white px-4">
      {/* Red accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-exxon-red" />

      {/* Red Pegasus brand mark — offset to the right, kept fully in frame.
          Hidden on narrow screens where it would sit under the content. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/Mobil_Pegasus_red_RGB-TM.png"
        alt=""
        className="pointer-events-none absolute right-10 bottom-10 hidden h-52 lg:block"
      />

      <div className="relative z-10 w-full max-w-xl space-y-8 text-center">
        <div className="flex flex-col items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mobil1-logo.svg" alt="Mobil 1" className="h-14" />
          {/* mt adds to the flex gap, so this widens only the logo-to-heading
              gap rather than every gap in the stack. */}
          <h1 className="mt-3 text-4xl font-bold text-exxon-charcoal sm:text-5xl">
            Premium Growth Portal
          </h1>
          <p className="max-w-md text-base text-exxon-gray">
            Earn rewards for the Mobil 1&trade; oil changes your shop already
            does. Track your points, unlock perks, and grow with the Premium
            Growth Program.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className="w-full rounded-md bg-exxon-red px-6 py-3 text-center font-semibold text-white hover:bg-exxon-red-dark sm:w-auto"
          >
            Log In
          </Link>
          <Link
            href="/register"
            className="w-full rounded-md border border-exxon-charcoal/25 px-6 py-3 text-center font-semibold text-exxon-charcoal hover:bg-exxon-charcoal/5 sm:w-auto"
          >
            Create an Account
          </Link>
        </div>

        <p className="text-sm text-exxon-gray">
          Already enrolled? Log in with your Steer account.
        </p>
      </div>
    </div>
  );
}
