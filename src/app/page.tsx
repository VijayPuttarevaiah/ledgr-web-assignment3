import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/api/session";

export default async function RootPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  redirect(user ? "/dashboard" : "/sign-in");
}
