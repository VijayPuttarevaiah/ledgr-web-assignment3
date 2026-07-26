import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/api/session";
import { getGroupDetail } from "@/lib/groups";
import { SplitStudioClient } from "@/components/split/split-studio-client";

export default async function SplitPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const { group: groupId } = await searchParams;
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) return null;

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role, groups(id, name, created_at)")
    .eq("user_id", user.id);

  const groupIds = (memberships ?? []).map((m) => m.group_id);
  const { data: memberCounts } = groupIds.length
    ? await supabase.from("group_members").select("group_id").in("group_id", groupIds)
    : { data: [] as { group_id: string }[] };
  const countByGroup = new Map<string, number>();
  for (const row of memberCounts ?? []) countByGroup.set(row.group_id, (countByGroup.get(row.group_id) ?? 0) + 1);

  const groups = (memberships ?? [])
    .map((m) => ({
      id: m.group_id,
      name: (m.groups as unknown as { name: string } | null)?.name ?? "Group",
      memberCount: countByGroup.get(m.group_id) ?? 1,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const selectedId = groupId && groupIds.includes(groupId) ? groupId : groups[0]?.id;
  const detail = selectedId ? await getGroupDetail(supabase, selectedId, user.id) : null;

  return (
    <SplitStudioClient
      groups={groups}
      selectedGroupId={selectedId ?? null}
      detail={detail}
      currentUserId={user.id}
    />
  );
}
