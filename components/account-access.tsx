/**
 * Enforce signed-in account access for Community-menu routes.
 *
 * refs: none
 */
"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RouteSkeleton } from "@/components/route-skeleton";
import { useAuth } from "@/lib/auth-context";
import { accountDestination, isAccountOnlyPath } from "@/lib/verified-access";
import { localPreviewAccessEnabled, useLocalPreviewAccess } from "@/lib/use-local-preview-access";

/**
 * Preserve self-service and enforce the global policy on protected data.
 * I/O: in `{ children: ReactNode }` -> out `ReactNode` (children, or a RouteSkeleton).
 *
 * refs: none
 */
export function AccountAccess({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const localPreview = useLocalPreviewAccess();
  const protectedPath = isAccountOnlyPath(pathname) && !localPreview;
  const destination = accountDestination(pathname, user, isLoading);

  useEffect(() => {
    if (localPreviewAccessEnabled()) return;
    if (!protectedPath || destination == null || destination === pathname) return;
    const requestedPath = `${window.location.pathname}${window.location.search}`;
    router.replace(accountDestination(requestedPath, user, false) ?? destination);
  }, [destination, pathname, protectedPath, router, user]);

  if (!protectedPath) return children;
  if (destination == null || destination !== pathname) return <RouteSkeleton variant="dashboard" />;
  return children;
}
