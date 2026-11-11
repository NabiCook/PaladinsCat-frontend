/**
 * Render the admin dashboard through a Next-supported page boundary.
 * Custom dashboard modes belong to the shared component, not route props.
 * refs: ./admin-dashboard.tsx; ../operations/developer/page.tsx
 */
"use client";
import AdminDashboardPage from "./admin-dashboard";

/**
 * Select admin permissions for this route without accepting custom page props.
 * I/O types: `none -> JSX.Element`.
 * refs: ./admin-dashboard.tsx
 */
export default function AdminPage() {
  return <AdminDashboardPage mode="admin" />;
}