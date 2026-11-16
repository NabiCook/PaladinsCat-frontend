/** Retire the duplicate account page in favor of the shared Settings view. */
import { permanentRedirect } from "next/navigation";

export default function AccountPage() {
  permanentRedirect("/settings");
}
