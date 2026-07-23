import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "@/components/settings/settings-client";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const { data: recurringRules } = await supabase
    .from("recurring_rules")
    .select("*, category:categories(name, color)")
    .eq("user_id", user.id)
    .order("next_run_on");

  return <SettingsClient profile={profile} email={user.email ?? ""} recurringRules={recurringRules ?? []} />;
}
