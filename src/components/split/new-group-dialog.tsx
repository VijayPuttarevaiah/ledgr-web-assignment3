"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { FieldLabel, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function NewGroupDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!name.trim()) {
      setError("Give the group a name.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const body = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(body.error?.message ?? "Couldn't create that group. Try again.");
      return;
    }
    onCreated(body.group.id);
  }

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-extrabold">New group</div>
          <button onClick={onClose} aria-label="Close" className="text-text-dim hover:text-text">
            <X size={18} />
          </button>
        </div>
        <FieldLabel htmlFor="groupName" required>
          Group name
        </FieldLabel>
        <Input
          id="groupName"
          className="mb-2"
          placeholder="e.g. Apartment 4B, Italy Trip 2026"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {error && <div className="mb-3 text-[12.5px] text-coral">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Create group
          </Button>
        </div>
      </div>
    </div>
  );
}
