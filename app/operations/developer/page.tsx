/**
 * Render the /operations/developer route with `AdminDashboardPage`.
 * refs: @/app/admin/admin-dashboard.tsx
 */
"use client";
import AdminDashboardPage from "@/app/admin/admin-dashboard";

/**
 * Render the /operations/developer route with `AdminDashboardPage`.
 * refs: @/app/admin/admin-dashboard.tsx
 * I/O types: `none -> JSX.Element`.
 */
export default function DeveloperDashboardPage() {
  return <AdminDashboardPage mode="developer" />;
}
