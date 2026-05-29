import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the current Supabase auth user id (anonymous or otherwise).
 * Re-renders when the session changes.
 */
export function useUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setUserId(data.session?.user.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setUserId(session?.user.id ?? null),
    );
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);
  return userId;
}