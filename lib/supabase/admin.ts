import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses Row Level Security.
 * ONLY use server-side (webhook handler, OAuth callback). Never ship to client.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
