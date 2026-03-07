import { createAdminClient } from "@/lib/supabase/admin"

export async function createClient() {
  return createAdminClient()
}
