import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/api/session";
import { SettingsClient } from "@/components/settings/settings-client";

export default async function SettingsPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const { data: recurringRules } = await supabase
    .from("recurring_rules")
    .select("*, category:categories(name, color)")
    .eq("user_id", user.id)
    .order("next_run_on");

  return <SettingsClient profile={profile} email={user.email ?? ""} recurringRules={recurringRules ?? []} />;
}
