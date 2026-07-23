import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [{ data: profile }, { data: categories }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("categories").select("*").or(`user_id.eq.${user.id},user_id.is.null`).order("name"),
  ]);

  return (
    <AppShell
      fullName={profile?.full_name ?? user.email ?? "You"}
      categories={categories ?? []}
      defaultPaymentMethod={profile?.default_payment_method ?? "Debit Card"}
    >
      {children}
    </AppShell>
  );
}
