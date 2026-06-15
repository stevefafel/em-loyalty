export const dynamic = "force-dynamic";

export default function AccessDeniedPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-exxon-charcoal overflow-hidden">
      {/* Red accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-exxon-red" />

      <div className="w-full max-w-md space-y-6 rounded-xl bg-white p-8 shadow-2xl text-center relative z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mobil1-logo.svg" alt="Mobil 1" className="mx-auto h-12" />
        <h1 className="text-2xl font-bold text-exxon-charcoal">
          Account not provisioned
        </h1>
        <p className="text-sm text-exxon-gray">
          Your sign-in succeeded, but this account isn&apos;t set up for the
          Premium Growth Program portal. Please contact your administrator to
          request access.
        </p>
        {/*
          Full RP-initiated logout — clears the live Keycloak SSO session too.
          A plain link to /login would re-authenticate the same account and
          bounce straight back here (loop).
        */}
        <a
          href="/api/auth/logout"
          className="inline-block w-full rounded-md bg-exxon-red px-4 py-2 text-white hover:bg-exxon-red-dark"
        >
          Sign out
        </a>
      </div>
    </div>
  );
}
