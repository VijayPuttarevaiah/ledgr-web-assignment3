"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { GroupDetail } from "@/lib/groups";
import { GroupSidebar } from "./group-sidebar";
import { GroupDetailView } from "./group-detail";
import { NewGroupDialog } from "./new-group-dialog";
import { AddExpensePanel } from "./add-expense-panel";
import { Users, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

// §10 perf pass: the Receipt Editor (itemised split UI + live preview math)
// is only needed once a user actually opens it, not on every Split Studio
// page load — deferred out of the initial route bundle. See DECISIONS.md.
const ReceiptEditor = dynamic(() => import("./receipt-editor").then((m) => m.ReceiptEditor), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70">
      <Loader2 className="animate-spin-slow text-gold" size={28} />
    </div>
  ),
});

export interface GroupSummary {
  id: string;
  name: string;
  memberCount: number;
}

export function SplitStudioClient({
  groups,
  selectedGroupId,
  detail,
  currentUserId,
}: {
  groups: GroupSummary[];
  selectedGroupId: string | null;
  detail: GroupDetail | null;
  currentUserId: string;
}) {
  const router = useRouter();
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [receiptEditorExpenseId, setReceiptEditorExpenseId] = useState<string | null>(null);

  function selectGroup(id: string) {
    router.push(`/split?group=${id}`);
  }

  function refresh() {
    router.refresh();
  }

  return (
    <div className="flex gap-6 p-7">
      <GroupSidebar
        groups={groups}
        selectedGroupId={selectedGroupId}
        onSelect={selectGroup}
        onNewGroup={() => setNewGroupOpen(true)}
      />
      <div className="flex-1">
        {!detail ? (
          <EmptyState
            icon={Users}
            title="No groups yet"
            body="Create a group for your apartment, a trip, or a recurring split with friends. Every confirmed expense flows straight into everyone's personal ledger — no separate reconciliation."
            action={
              <button
                onClick={() => setNewGroupOpen(true)}
                className="mt-2 rounded-[9px] bg-gold px-4 py-2.5 text-[13.5px] font-bold text-gold-ink hover:brightness-110"
              >
                Create your first group
              </button>
            }
          />
        ) : (
          <GroupDetailView
            detail={detail}
            currentUserId={currentUserId}
            onAddExpense={() => setAddExpenseOpen(true)}
            onOpenReceipt={(expenseId) => setReceiptEditorExpenseId(expenseId)}
            onChanged={refresh}
          />
        )}
      </div>

      {newGroupOpen && (
        <NewGroupDialog
          onClose={() => setNewGroupOpen(false)}
          onCreated={(id) => {
            setNewGroupOpen(false);
            selectGroup(id);
          }}
        />
      )}

      {addExpenseOpen && detail && (
        <AddExpensePanel
          groupId={detail.group.id}
          members={detail.members}
          currentUserId={currentUserId}
          onClose={() => setAddExpenseOpen(false)}
          onCreated={(expense) => {
            setAddExpenseOpen(false);
            if (expense.split_mode === "itemised") {
              setReceiptEditorExpenseId(expense.id);
            } else {
              refresh();
            }
          }}
        />
      )}

      {receiptEditorExpenseId && detail && (
        <ReceiptEditor
          expenseId={receiptEditorExpenseId}
          groupId={detail.group.id}
          members={detail.members}
          onClose={() => {
            setReceiptEditorExpenseId(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
