/** Fetch a captured private-account profile through the server-only API boundary. · refs: none */
import "server-only";

import { cache } from "react";
import { fetchServerJson } from "@/lib/server-api";
import { isPublicPlayerId } from "@/lib/seo";
import { decodeMctsProfileResponse } from "@/lib/mcts-profile-response";
import type { MctsProfileResponse } from "@/lib/mcts-profile-types";

/**
 * Resolve the MCTS capture for a player the Hi-Rez API refuses, deduplicated per render.
 * Reject invalid player IDs and propagate request failures so the browser fallback can retry.
 * I/O types: `id: string -> Promise<MctsProfileResponse>`.
 * refs: endpoints: GET /players/{id}/mcts-profile
 */
export const getServerMctsProfile = cache(async (id: string): Promise<MctsProfileResponse> => {
  if (!isPublicPlayerId(id)) throw new Error("Invalid public player ID");
  const raw = await fetchServerJson<unknown>(`/players/${encodeURIComponent(id)}/mcts-profile`, { timeoutMs: 20_000 });
  const decoded = decodeMctsProfileResponse(raw);
  if (!decoded.ok) throw new Error(`Invalid MCTS profile response: ${decoded.error.field}`);
  return decoded.value;
});
