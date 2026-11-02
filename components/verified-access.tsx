/**
 * Enforces verified-account access for gated directories and detail routes.
 *
 * refs: none
 */
"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RouteSkeleton } from "@/components/route-skeleton";
import { LoginRequired } from "@/components/login-required";
import { useAuth } from "@/lib/auth-context";
import { isAccountOnlyPath, isVerifiedOnlyPath, verifiedDestination } from "@/lib/verified-access";
import { localPreviewAccessEnabled, useLocalPreviewAccess } from "@/lib/use-local-preview-access";

/**
 * Withhold protected content while routing visitors by account state.
 * I/O: in `{ children: ReactNode }` -> out `ReactNode`.
 *
 * refs: none
 */
export function VerifiedAccess({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const localPreview = useLocalPreviewAccess();
  const protectedPath = (isVerifiedOnlyPath(pathname) || isAccountOnlyPath(pathname)) && !localPreview && !localPreviewAccessEnabled();
  const destination = verifiedDestination(pathname, user, isLoading);

  useEffect(() => {
    if (localPreviewAccessEnabled()) return;
    if (!protectedPath || destination == null || destination === pathname) return;
    const requestedPath = `${window.location.pathname}${window.location.search}`;
    router.replace(verifiedDestination(requestedPath, user, false) ?? destination);
  }, [destination, pathname, protectedPath, router, user]);

  if (!protectedPath) return children;
  if (!isLoading && !user) return <LoginRequired returnPath={pathname} />;
  if (destination == null || destination !== pathname) return <RouteSkeleton variant="dashboard" />;
  return children;
}
