import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
});

export async function requireUser() {
  const session = await getSessionUser();
  if (!session.user) redirect("/login");
  return { supabase: session.supabase, user: session.user };
}
