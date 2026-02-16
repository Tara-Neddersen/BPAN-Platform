import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client for server-side operations that bypass RLS.
 * Only use this for public/shared endpoints where the user is not authenticated.
 */
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(supabaseUrl, serviceRoleKey);
}

