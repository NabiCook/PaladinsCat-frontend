"use client";

import { useEffect, useState } from "react";

type Outcome<T> = { data: T; failed: false } | { error: unknown; failed: true };

/** Load a section independently. Use a stable reader for each set of parameters. */
export function useApiSection<T>(read: (() => Promise<T>) | null) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ read: () => Promise<T>; attempt: number; outcome: Outcome<T> } | null>(null);

  useEffect(() => {
    if (!read) return;
    let active = true;
    const settle = (outcome: Outcome<T>) => { if (active) setResult({ read, attempt, outcome }); };
    void Promise.resolve().then(read).then(
      data => settle({ data, failed: false }),
      error => settle({ error, failed: true }),
    );
    return () => { active = false; };
  }, [read, attempt]);

  const current = result?.read === read && result.attempt === attempt ? result.outcome : null;
  return {
    data: current && !current.failed ? current.data : undefined,
    error: current?.failed ? current.error : undefined,
    loading: !current,
    failed: current?.failed ?? false,
    retry: () => setAttempt(value => value + 1),
  };
}
