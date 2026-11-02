/**
 * Display an actionable guest denial while login navigation is pending or unavailable.
 *
 * refs: none
 */
"use client";

import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { useLocalization } from "@/lib/localization-context";

/**
 * Render a guest denial card with a sign-in link back to the requested path.
 * I/O: in `{ returnPath: string }` -> out `JSX.Element`.
 *
 * refs: none
 */
export function LoginRequired({ returnPath }: { returnPath: string }) {
  const { t } = useLocalization();
  return (
    <section className="pc-card mx-auto max-w-xl p-7 text-center" role="status">
      <LockKeyhole className="mx-auto h-8 w-8 text-pc-accent" aria-hidden="true" />
      <h1 className="mt-3 text-xl font-bold text-pc-text">{t("generated.api.authenticationRequired")}</h1>
      <Link
        href={`/auth/login?redirect=${encodeURIComponent(returnPath)}`}
        prefetch={false}
        className="pc-btn-primary mt-5 inline-flex"
      >
        {t("generated.auth.signIn")}
      </Link>
    </section>
  );
}
