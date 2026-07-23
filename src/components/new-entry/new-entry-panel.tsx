"use client";

import { useEffect, useRef, useState } from "react";
import { X, Upload, Loader2, Check } from "lucide-react";
import { FieldLabel, Input, Select } from "@/components/ui/input";
import { Toggle } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-context";
import { aiClientFlags } from "@/lib/ai/client-flags";
import { createClient } from "@/lib/supabase/client";
import { buildReceiptPath, RECEIPTS_BUCKET } from "@/lib/supabase/storage-shared";
import type { Category } from "@/types/domain";

type EntryType = "expense" | "income";
type OcrState = "idle" | "scanning" | "done" | "failed";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewEntryPanel({
  categories,
  defaultPaymentMethod,
  onClose,
  onSaved,
}: {
  categories: Category[];
  defaultPaymentMethod: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<EntryType>("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(defaultPaymentMethod);
  const [occurredOn, setOccurredOn] = useState(todayISO());
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("monthly");
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [ocrState, setOcrState] = useState<OcrState>("idle");
  const [aiSuggestion, setAiSuggestion] = useState<{ categoryId: string; categoryName: string; confidence: number } | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const suggestionRequested = useRef("");

  // [AI] category suggestion — entry point doesn't exist in the DOM at all when the flag is off (§4.4).
  useEffect(() => {
    if (!aiClientFlags.categorization) return;
    const trimmed = description.trim();
    if (trimmed.length < 3 || !amount) {
      setAiSuggestion(null);
      return;
    }
    const key = `${trimmed}:${amount}`;
    const timer = setTimeout(async () => {
      if (suggestionRequested.current === key) return;
      suggestionRequested.current = key;
      try {
        const res = await fetch("/api/transactions/categorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: trimmed, amount_cents: Math.round(Number(amount) * 100) }),
        });
        const body = await res.json();
        if (body.enabled && body.category_id) {
          setAiSuggestion({ categoryId: body.category_id, categoryName: body.category_name, confidence: body.confidence });
        }
      } catch {
        // Silent — a failed suggestion just means no badge appears; it never blocks manual entry.
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [description, amount]);

  async function handleReceiptSelected(file: File) {
    setError("");
    if (!aiClientFlags.ocr) {
      // [core] fallback: attach only, zero parsing, zero network call to any AI provider.
      setOcrState("scanning");
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const path = buildReceiptPath(user.id, file.name);
      const { error: uploadError } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, file);
      setOcrState(uploadError ? "failed" : "done");
      if (!uploadError) setReceiptPath(path);
      return;
    }

    setOcrState("scanning");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/receipts/parse", { method: "POST", body: formData });
      const body = await res.json();
      if (!body.enabled || !body.success) {
        setOcrState("failed");
        return;
      }
      setOcrState("done");
      setReceiptPath(body.receipt_image_path);
      if (body.amount_cents) setAmount((body.amount_cents / 100).toFixed(2));
      if (body.description) setDescription(body.description);
      if (body.occurred_on) setOccurredOn(body.occurred_on);
      if (body.category_id) {
        setAiSuggestion({ categoryId: body.category_id, categoryName: body.category_name, confidence: body.confidence });
      }
    } catch {
      setOcrState("failed");
    }
  }

  async function handleSave(forceDuplicate = false) {
    setError("");
    const amountCents = Math.round(Number(amount) * 100);
    if (!amountCents || amountCents <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!description.trim()) {
      setError("Enter a description.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          amount_cents: amountCents,
          description: description.trim(),
          category_id: categoryId || null,
          payment_method: paymentMethod || null,
          occurred_on: occurredOn,
          is_recurring: recurring,
          recurring_frequency: recurring ? frequency : undefined,
          receipt_image_path: receiptPath,
          ai_category_confidence: aiSuggestion?.confidence ?? null,
          confirm_duplicate: forceDuplicate,
        }),
      });
      const body = await res.json();
      setSaving(false);
      if (!res.ok) {
        if (body.error?.code === "possible_duplicate") {
          setDuplicateWarning(body.error.message);
          return;
        }
        setError(body.error?.message ?? "Couldn't save this transaction. Try again.");
        return;
      }
      toast(`Transaction saved${recurring ? " · marked recurring" : ""}.`);
      onSaved();
    } catch {
      setSaving(false);
      setError("Couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-[250] flex justify-end bg-black/60">
      <div className="h-full w-full max-w-[440px] overflow-y-auto border-l border-border bg-bg p-7">
        <div className="mb-5 flex items-center justify-between">
          <div className="text-xl font-extrabold">New entry</div>
          <button onClick={onClose} aria-label="Close" className="text-text-dim hover:text-text">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 flex rounded-[10px] bg-surface-2 p-1" role="radiogroup" aria-label="Entry type">
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={
                "flex-1 rounded-lg py-2.5 text-[13px] font-bold capitalize " +
                (type === t
                  ? t === "expense"
                    ? "bg-coral/15 text-coral"
                    : "bg-teal/15 text-teal"
                  : "text-text-dim")
              }
            >
              {t}
            </button>
          ))}
        </div>

        <FieldLabel htmlFor="amount" required>
          Amount
        </FieldLabel>
        <Input
          id="amount"
          inputMode="decimal"
          placeholder="0.00"
          className="mb-3.5 text-xl font-bold"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <FieldLabel htmlFor="description" required>
          Description
        </FieldLabel>
        <Input
          id="description"
          className="mb-3.5"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <FieldLabel htmlFor="category">Category</FieldLabel>
        <div className="relative mb-3.5">
          <Select
            id="category"
            value={aiSuggestion?.categoryId && !categoryId ? aiSuggestion.categoryId : categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {aiClientFlags.categorization && aiSuggestion && !categoryId && (
            <span
              data-testid="ai-categorize-badge"
              title={`Matched based on your past ${description} transactions`}
              className="absolute top-1/2 right-3 -translate-y-1/2 cursor-help rounded-full bg-teal/15 px-2 py-0.5 text-[10.5px] font-bold text-teal"
            >
              AI: {aiSuggestion.confidence}% match ⓘ
            </span>
          )}
        </div>

        <FieldLabel htmlFor="paymentMethod">Payment method</FieldLabel>
        <Input id="paymentMethod" className="mb-3.5" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} />

        <FieldLabel htmlFor="occurredOn" required>
          Date
        </FieldLabel>
        <Input
          id="occurredOn"
          type="date"
          className="mb-3.5"
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
        />

        <Toggle checked={recurring} onChange={setRecurring} label="Make this recurring" />
        {recurring && (
          <div className="mt-2.5">
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value as "weekly" | "monthly")}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </Select>
          </div>
        )}

        <FieldLabel>{aiClientFlags.ocr ? "Receipt (AI will parse it)" : "Attach receipt (optional)"}</FieldLabel>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleReceiptSelected(file);
          }}
        />
        {aiClientFlags.ocr ? (
          <div
            data-testid="receipt-ocr-dropzone"
            onClick={() => fileInputRef.current?.click()}
            className={
              "mt-2 cursor-pointer rounded-[10px] border border-dashed bg-surface-2 p-5 text-center " +
              (ocrState === "failed" ? "border-coral" : "border-border")
            }
          >
            {ocrState === "idle" && (
              <>
                <Upload size={18} className="mx-auto mb-1.5 text-text-dim" />
                <div className="text-[12.5px] text-text-dim">Drop receipt image here or click to browse</div>
                <div className="mt-1 text-[11px] text-gold">OCR auto-fill in a couple seconds</div>
              </>
            )}
            {ocrState === "scanning" && (
              <div className="flex items-center justify-center gap-2 text-[13px] text-gold">
                <Loader2 size={16} className="animate-spin-slow" /> Reading receipt…
              </div>
            )}
            {ocrState === "done" && (
              <div className="flex items-center justify-center gap-2 text-[13px] text-teal">
                <Check size={16} /> Parsed — fields auto-filled above
              </div>
            )}
            {ocrState === "failed" && (
              <div className="text-[12.5px] text-coral">
                Couldn&apos;t read that clearly — try another photo or enter manually.
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
              {ocrState === "scanning" ? "Uploading…" : receiptPath ? "Replace file" : "Choose file"}
            </Button>
            {receiptPath && ocrState === "done" && <span className="ml-2 text-xs text-teal">Attached</span>}
            {ocrState === "failed" && <span className="ml-2 text-xs text-coral">Upload failed — try again</span>}
          </div>
        )}

        {duplicateWarning && (
          <div className="mt-4 rounded-lg border border-err-border bg-err-bg px-3 py-2.5 text-[12.5px] text-err-text">
            {duplicateWarning}{" "}
            <button onClick={() => handleSave(true)} className="font-bold underline">
              Add anyway
            </button>
          </div>
        )}
        {error && <div className="mt-4 text-[12.5px] text-coral">{error}</div>}

        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={() => handleSave(false)} loading={saving}>
            {saving ? "Saving…" : "Save transaction"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
