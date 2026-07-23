import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/**
 * Request-scoped Supabase client bound to the caller's own session cookies.
 * RLS applies exactly as it would for the browser client — this is what
 * every Route Handler uses to read/write on behalf of "whoever is logged
 * in right now", never to bypass authorization.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render, where cookies are
            // read-only. The session is still refreshed by src/proxy.ts on
            // the next navigation, so this is safe to ignore here.
          }
        },
      },
    }
  );
}
