import { supabase } from "./supabase";

export type TokenResponse = { serverUrl: string; token: string; roomName: string };

/** Starts a call with the agent (voice or chat). Served by the Vercel function api/token.ts. */
export async function getCallToken(body: { mode: "voice" | "chat"; language?: string; agent?: string }): Promise<TokenResponse> {
  const res = await fetch("/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Could not start the call (${res.status})`);
  return res.json();
}

/** Admin-only: a hidden, listen-only token to monitor a live call. */
export async function getMonitorToken(roomName: string): Promise<TokenResponse> {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) throw new Error("Please log in again.");
  const res = await fetch("/api/monitor-token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ roomName }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Could not join the call (${res.status})`);
  return res.json();
}
