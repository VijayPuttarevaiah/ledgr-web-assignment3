"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { FieldLabel, Input, Select, Toggle } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CategoryPill } from "@/components/ui/category-pill";
import { useToast } from "@/components/providers/toast-context";
import { aiClientFlags } from "@/lib/ai/client-flags";
import { formatCents } from "@/lib/money";
import type { Profile } from "@/types/domain";

const TABS = ["Profile", "Preferences", "Notifications", "Integrations", "Danger Zone"] as const;
type Tab = (typeof TABS)[number];

interface RecurringRule {
  id: string;
  description: string;
  amount_cents: number;
  frequency: string;
  next_run_on: string;
  active: boolean;
  category: { name: string; color: string } | null;
}

interface FormState {
  full_name: string;
  default_currency: string;
  date_format: string;
  default_payment_method: string;
  notify_email_digest: boolean;
  notify_push: boolean;
  notify_settlement_reminders: boolean;
}

function toForm(profile: Profile | null): FormState {
  return {
    full_name: profile?.full_name ?? "",
    default_currency: profile?.default_currency ?? "CAD",
    date_format: profile?.date_format ?? "MMM D, YYYY",
    default_payment_method: profile?.default_payment_method ?? "Debit Card",
    notify_email_digest: profile?.notify_email_digest ?? true,
    notify_push: profile?.notify_push ?? false,
    notify_settlement_reminders: profile?.notify_settlement_reminders ?? true,
  };
}

export function SettingsClient({
  profile,
  email,
  recurringRules,
}: {
  profile: Profile | null;
  email: string;
  recurringRules: RecurringRule[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("Profile");
  const initial = useMemo(() => toForm(profile), [profile]);
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      toast("Changes saved.");
      router.refresh();
    } else {
      toast("Couldn't save changes. Try again.", { tone: "error" });
    }
  }

  function discard() {
    setForm(initial);
  }

  return (
    <div className="flex gap-7 p-7">
      <div className="w-[180px] shrink-0">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "mb-0.5 block w-full rounded px-3 py-2.5 text-left text-[13.5px] font-semibold " +
              (t === "Danger Zone"
                ? "text-coral"
                : tab === t
                  ? "border-l-2 border-gold bg-surface text-gold"
                  : "border-l-2 border-transparent text-text-dim")
            }
          >
            {t}
          </button>
        ))}
      </div>

      <div className="max-w-[640px] flex-1">
        {tab !== "Danger Zone" ? (
          <>
            <div className="mb-4 text-xl font-extrabold">{tab}</div>
            <Card>
              {tab === "Profile" && (
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="col-span-2">
                    <FieldLabel htmlFor="fullName">Full name</FieldLabel>
                    <Input id="fullName" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input id="email" value={email} disabled />
                  </div>
                </div>
              )}

              {tab === "Preferences" && (
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <FieldLabel htmlFor="currency">Default currency</FieldLabel>
                    <Select id="currency" value={form.default_currency} onChange={(e) => set("default_currency", e.target.value)}>
                      <option value="CAD">CAD</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </Select>
                  </div>
                  <div>
                    <FieldLabel htmlFor="dateFormat">Date format</FieldLabel>
                    <Select id="dateFormat" value={form.date_format} onChange={(e) => set("date_format", e.target.value)}>
                      <option value="MMM D, YYYY">MMM D, YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <FieldLabel htmlFor="paymentMethod">Default payment method</FieldLabel>
                    <Input
                      id="paymentMethod"
                      value={form.default_payment_method}
                      onChange={(e) => set("default_payment_method", e.target.value)}
                    />
                  </div>
                </div>
              )}

              {tab === "Notifications" && (
                <div className="flex flex-col gap-4">
                  <Toggle
                    label="Email digest"
                    checked={form.notify_email_digest}
                    onChange={(v) => set("notify_email_digest", v)}
                  />
                  <Toggle label="Push notifications" checked={form.notify_push} onChange={(v) => set("notify_push", v)} />
                  <Toggle
                    label="Settlement reminders"
                    checked={form.notify_settlement_reminders}
                    onChange={(v) => set("notify_settlement_reminders", v)}
                  />
                </div>
              )}

              {tab === "Integrations" && (
                <div className="flex flex-col gap-4 text-sm">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <span>Google account</span>
                    <span className="text-xs text-text-faint">Sign in with Google from the sign-in screen to connect.</span>
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-bold text-text-faint uppercase">AI features</div>
                    <div className="flex flex-col gap-1.5 text-xs text-text-dim">
                      <span>Category suggestions: {aiClientFlags.categorization ? "On" : "Off"}</span>
                      <span>Receipt scanning: {aiClientFlags.ocr ? "On" : "Off"}</span>
                      <span>Monthly AI summary: {aiClientFlags.narrative ? "On" : "Off"}</span>
                    </div>
                    <div className="mt-2 text-[11.5px] text-text-faint">
                      AI features are configured per-deployment and can&apos;t be changed from here.
                    </div>
                  </div>
                </div>
              )}

              {tab !== "Integrations" && (
                <div className="mt-5 flex justify-end gap-2.5">
                  <Button variant="ghost" onClick={discard} disabled={!dirty}>
                    Discard
                  </Button>
                  <Button onClick={save} loading={saving} disabled={!dirty}>
                    Save changes
                  </Button>
                </div>
              )}
            </Card>

            {tab === "Preferences" && (
              <div className="mt-4">
                <div className="mb-2 text-sm font-bold">Recurring transactions</div>
                <Card>
                  {recurringRules.length === 0 ? (
                    <div className="text-sm text-text-dim">
                      None yet — toggle &quot;Make this recurring&quot; in New entry to create one.
                    </div>
                  ) : (
                    recurringRules.map((r) => <RecurringRuleRow key={r.id} rule={r} onChanged={() => router.refresh()} />)
                  )}
                </Card>
              </div>
            )}
          </>
        ) : (
          <DangerZone />
        )}
      </div>
    </div>
  );
}

function RecurringRuleRow({ rule, onChanged }: { rule: RecurringRule; onChanged: () => void }) {
  const { toast } = useToast();
  async function toggleActive() {
    const res = await fetch(`/api/recurring-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !rule.active }),
    });
    if (res.ok) onChanged();
    else toast("Couldn't update that rule.", { tone: "error" });
  }
  async function remove() {
    const res = await fetch(`/api/recurring-rules/${rule.id}`, { method: "DELETE" });
    if (res.ok) {
      toast("Recurring rule removed.");
      onChanged();
    } else {
      toast("Couldn't remove that rule.", { tone: "error" });
    }
  }
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 text-[13px] last:border-b-0">
      <div>
        <div className="font-semibold">{rule.description}</div>
        <div className="text-xs text-text-faint">
          {formatCents(rule.amount_cents)} · {rule.frequency} · next {rule.next_run_on}
          {rule.category && <span className="ml-1.5">· <CategoryPill name={rule.category.name} color={rule.category.color} /></span>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Toggle label="" checked={rule.active} onChange={toggleActive} />
        <button onClick={remove} aria-label={`Delete ${rule.description} recurring rule`} className="text-text-faint hover:text-coral">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function DangerZone() {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const canDelete = confirmation === "DELETE";

  async function deleteAccount() {
    setDeleting(true);
    setError("");
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation }),
    });
    setDeleting(false);
    if (!res.ok) {
      const body = await res.json();
      setError(body.error?.message ?? "Couldn't delete your account. Try again.");
      return;
    }
    router.push("/sign-in");
  }

  return (
    <>
      <div className="mb-4 text-xl font-extrabold text-coral">Danger Zone</div>
      <Card>
        <div className="mb-1.5 font-bold">Delete account</div>
        <div className="mb-3.5 text-sm text-text-dim">
          This permanently deletes your ledger, split history, and analytics. This can&apos;t be undone.
        </div>
        <FieldLabel htmlFor="deleteConfirm">Type DELETE to confirm</FieldLabel>
        <Input
          id="deleteConfirm"
          className="mb-3 max-w-[220px]"
          placeholder="DELETE"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
        {error && <div className="mb-3 text-[12.5px] text-coral">{error}</div>}
        <Button variant="danger" disabled={!canDelete} loading={deleting} onClick={deleteAccount}>
          Permanently delete account
        </Button>
      </Card>
    </>
  );
}
