/** Client-side maintenance-consent provider: one account-wide presence permission.
 *
 * refs: none
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { startAnonymousPresence } from "@/lib/anonymous-presence";
import { consentAllowsPresence, getMaintenanceConsent, saveMaintenanceConsent, sendMaintenancePresence, type ConsentSource, type MaintenanceConsent } from "@/lib/maintenance-consent";

type ConsentContext = {
  choice: MaintenanceConsent | null; ready: boolean; saving: boolean; error: boolean;
  choose: (enabled: boolean, source: ConsentSource) => Promise<void>;
  reload: () => void;
};
const Context = createContext<ConsentContext | null>(null);

/** Read the shared maintenance-consent state; throws when used outside the provider.
 *
 * I/O: in () -> out ConsentContext
 *
 * refs: none
 */
export function useMaintenanceConsent(): ConsentContext {
  const value = useContext(Context);
  if (!value) throw new Error("MaintenanceConsentProvider is required");
  return value;
}

/** One account-wide permission owner for the banner, settings, and pulse lifecycle.
 *
 * I/O: in ({ children }: { children: ReactNode }) -> out JSX provider element
 *
 * refs: none
 */
export function MaintenanceConsentProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const userId = user?.id ?? null;
  const owner = useRef(userId);
  useEffect(() => { owner.current = userId; }, [userId]);
  const sequence = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const paused = useRef(false);
  const savingRef = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const [snapshot, setSnapshot] = useState<{ userId: number; choice: MaintenanceConsent } | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const choice = snapshot?.userId === userId ? snapshot.choice : null;
  const allowed = !isLoading && ready && !saving && userId !== null && consentAllowsPresence(choice);
  const allowedRef = useRef(false);
  useEffect(() => { allowedRef.current = allowed; }, [allowed]);

  const reload = useCallback(() => {
    if (userId === null || isLoading || savingRef.current) return;
    const revision = ++sequence.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    void getMaintenanceConsent(controller.signal).then((value) => {
      if (owner.current !== userId || revision !== sequence.current) return;
      setSnapshot({ userId, choice: value }); setReady(true); setError(false);
    }).catch(() => {
      if (owner.current === userId && revision === sequence.current && !controller.signal.aborted) {
        setReady(false); setError(true);
      }
    });
  }, [userId, isLoading]);

  useEffect(() => {
    paused.current = false;
    savingRef.current = false;
    // Discard the previous account's private permission before loading this account.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaving(false); setReady(false); setSnapshot(null); setError(false);
    reload();
    const visible = () => { if (document.visibilityState === "visible") reload(); };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(visible, 60_000);
    const bus = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("pc-maintenance-consent");
    channel.current = bus;
    if (bus) bus.onmessage = () => reload(); // No user identifier or choice is broadcast.
    return () => {
      // This is a request revision, not a DOM ref: invalidating its latest value is intentional.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++sequence.current; pending.current?.abort(); allowedRef.current = false;
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
      window.clearInterval(timer); bus?.close(); channel.current = null;
    };
  }, [reload]);

  const choose = useCallback(async (enabled: boolean, source: ConsentSource) => {
    if (userId === null || isLoading || savingRef.current) return;
    const revision = ++sequence.current;
    pending.current?.abort(); paused.current = true; allowedRef.current = false;
    savingRef.current = true; setSaving(true); setError(false);
    try {
      const value = await saveMaintenanceConsent(enabled, source);
      if (owner.current !== userId || revision !== sequence.current) return;
      setSnapshot({ userId, choice: value }); setReady(true); paused.current = false;
      channel.current?.postMessage("changed");
    } catch {
      // A failed withdrawal is not advertised as saved. Keep this tab paused.
      if (owner.current === userId && revision === sequence.current) setError(true);
    } finally {
      if (owner.current === userId && revision === sequence.current) {
        savingRef.current = false; setSaving(false);
      }
    }
  }, [userId, isLoading]);

  useEffect(() => {
    if (!allowed) return;
    return startAnonymousPresence(async (signal) => {
      try { await sendMaintenancePresence(signal); }
      catch {
        if (!signal.aborted) { allowedRef.current = false; setReady(false); reload(); }
      }
    }, () => allowedRef.current && !paused.current);
  }, [allowed, reload]);

  return <Context.Provider value={{ choice, ready: ready && userId !== null && !isLoading && choice !== null, saving, error, choose, reload }}>{children}</Context.Provider>;
}
