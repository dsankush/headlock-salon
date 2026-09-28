import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

// Public (anon / publishable) key only. Row Level Security decides what each visitor can read:
// the public site sees the menu, team and hours; admin pages need a logged-in admin.
export const supabase = createClient(url ?? "https://example.supabase.co", anonKey ?? "public-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true },
});

export type Service = {
  id: string;
  name: string;
  gender: "female" | "male" | "kids" | "unisex";
  price: number | null;
  price_type: "fixed" | "starting_from" | "on_request";
  duration_min: number;
  requires_consultation: boolean;
  sort_order: number;
  category_id: string;
};

export type Category = { id: string; slug: string; name: string; section: string; gender: string; sort_order: number };
export type Staff = { id: string; name: string; role: string; gender: string | null; sort_order: number };

export type CallLog = {
  id: string;
  room_name: string | null;
  channel: "web" | "phone";
  mode: "voice" | "chat";
  caller_phone: string | null;
  language: string | null;
  started_at: string;
  ended_at: string | null;
  last_activity_at: string;
  transcript: { role: "user" | "assistant"; text: string; at?: string }[];
  summary: string | null;
  outcome: string | null;
  live_state: Record<string, string>;
  appointment_id: string | null;
  lead_id: string | null;
  agent_id: string | null;
  customer_id: string | null;
};

export type AgentConfig = {
  id: string;
  slug: string;
  display_name: string;
  is_active: boolean;
  is_default: boolean;
  greeting: string;
  extra_instructions: string;
  llm_model: string;
  llm_temperature: number;
  tts_speaker: string;
  tts_pace: number;
  tts_temperature: number;
  default_language: string;
  auto_switch_language: boolean;
  allowed_languages: string[];
  allow_booking: boolean;
  allow_reschedule_cancel: boolean;
  max_call_minutes: number;
  updated_at: string;
};
