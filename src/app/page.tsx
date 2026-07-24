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
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-exxon-charcoal px-4">
      {/* Red accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-exxon-red" />

      {/* Background Pegasus watermark */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/mobil-pegasus.svg"
        alt=""
        className="pointer-events-none absolute right-[-80px] bottom-[-80px] h-[28rem] opacity-[0.04]"
      />

      <div className="relative z-10 w-full max-w-xl space-y-8 text-center">
        <div className="flex flex-col items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mobil1-logo.svg" alt="Mobil 1" className="h-14" />
          <h1 className="text-4xl font-bold text-white sm:text-5xl">
            Premium Growth Portal
          </h1>
          <p className="max-w-md text-base text-gray-300">
            Earn rewards for the Mobil 1 oil changes your shop already does.
            Track your points, unlock perks, and grow with the Premium Growth
            Program.
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
            className="w-full rounded-md border border-white/30 px-6 py-3 text-center font-semibold text-white hover:bg-white/10 sm:w-auto"
          >
            Create an Account
          </Link>
        </div>

        <p className="text-sm text-gray-400">
          Already enrolled? Log in with your Steer account.
        </p>
      </div>

      {/* Footer branding */}
      <div className="absolute bottom-6 flex justify-center opacity-20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mobil-pegasus.svg" alt="" className="h-6" />
      </div>
    </div>
  );
}
