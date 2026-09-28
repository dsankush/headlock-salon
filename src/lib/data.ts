import { useEffect, useState } from "react";
import { supabase, type Category, type Service, type Staff } from "./supabase";

export type SalonInfo = {
  name: string;
  address: string | null;
  phones: string[];
  cancellation_policy: string | null;
  hours: { weekday: number; open_time: string | null; close_time: string | null; is_closed: boolean }[];
};

/** Tiny fetch hook: runs `fn` on mount / when deps change. */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e?.message ?? String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}

export async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export function useSalon() {
  return useQuery<SalonInfo>(async () => {
    const [s, h] = await Promise.all([
      must(supabase.from("salon_settings").select("name,address,phones,cancellation_policy").eq("id", 1).single()),
      must(supabase.from("business_hours").select("*").order("weekday")),
    ]);
    return { ...(s as unknown as Omit<SalonInfo, "hours">), hours: h as unknown as SalonInfo["hours"] };
  });
}

export function useMenu() {
  return useQuery(async () => {
    const [cats, svcs] = await Promise.all([
      must(supabase.from("service_categories").select("*").order("sort_order")),
      must(supabase.from("services").select("id,name,gender,price,price_type,duration_min,requires_consultation,sort_order,category_id").eq("is_active", true).order("sort_order")),
    ]);
    return { categories: cats as Category[], services: svcs as Service[] };
  });
}

export function useTeam() {
  return useQuery(async () => must(supabase.from("staff").select("id,name,role,gender,sort_order").eq("is_active", true).order("sort_order")) as Promise<Staff[]>);
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function hourText(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}
