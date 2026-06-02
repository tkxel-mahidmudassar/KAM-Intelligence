"use client";

import { useState, useEffect } from "react";
import { X, Building2 } from "lucide-react";
import { useRole } from "@/context/RoleContext";

interface AccountFormData {
  name: string;
  industry: string;
  region: string;
  country: string;
  arr: string;
  contractStart: string;
  contractEnd: string;
  kamId: string;
}

interface User {
  id: string;
  name: string;
  role: string;
}

interface AccountFormModalProps {
  mode: "create" | "edit";
  initial?: {
    id?: string;
    name?: string;
    industry?: string | null;
    region?: string | null;
    country?: string | null;
    arr?: number;
    contractStart?: string | null;
    contractEnd?: string | null;
    kamId?: string | null;
  };
  onClose: () => void;
  onSaved: () => void;
}

export function AccountFormModal({ mode, initial, onClose, onSaved }: AccountFormModalProps) {
  const { role } = useRole();
  const [form, setForm] = useState<AccountFormData>({
    name:          initial?.name          ?? "",
    industry:      initial?.industry      ?? "",
    region:        initial?.region        ?? "",
    country:       initial?.country       ?? "",
    arr:           String(initial?.arr    ?? ""),
    contractStart: initial?.contractStart ? initial.contractStart.split("T")[0] : "",
    contractEnd:   initial?.contractEnd   ? initial.contractEnd.split("T")[0]   : "",
    kamId:         initial?.kamId         ?? "",
  });
  const [users,  setUsers]  = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin", { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((j) => setUsers((j.data?.users ?? []).filter((u: User) => u.role === "KAM" || u.role === "MANAGER")))
      .catch(() => {});
  }, [role]);

  const set = (k: keyof AccountFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError("Account name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name:          form.name.trim(),
        industry:      form.industry.trim()  || null,
        region:        form.region.trim()    || null,
        country:       form.country.trim()   || null,
        arr:           form.arr ? Number(form.arr.replace(/[,$]/g, "")) : 0,
        contractStart: form.contractStart    || null,
        contractEnd:   form.contractEnd      || null,
        kamId:         form.kamId            || null,
      };

      const url    = mode === "create" ? "/api/accounts" : `/api/accounts/${initial?.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to save"); return; }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#0755E9] focus:ring-1 focus:ring-[#0755E9]/20";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-surface-1)] shadow-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#0755E9]" />
            <h2 className="text-[15px] font-bold text-[var(--text-primary)]">
              {mode === "create" ? "New Account" : "Edit Account"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-2)] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">Account Name *</label>
            <input autoFocus value={form.name} onChange={set("name")} placeholder="Acme Corp" className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">Industry</label>
            <input value={form.industry} onChange={set("industry")} placeholder="SaaS" className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">Region</label>
            <input value={form.region} onChange={set("region")} placeholder="MENA" className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">Country</label>
            <input value={form.country} onChange={set("country")} placeholder="UAE" className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">ARR (USD)</label>
            <input value={form.arr} onChange={set("arr")} placeholder="120000" className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">Contract Start</label>
            <input type="date" value={form.contractStart} onChange={set("contractStart")} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">Contract End</label>
            <input type="date" value={form.contractEnd} onChange={set("contractEnd")} className={inputCls} />
          </div>
          {(role === "MANAGER" || role === "EXECUTIVE") && users.length > 0 && (
            <div className="col-span-2 space-y-1">
              <label className="text-[11px] font-medium text-[var(--text-muted)]">Assigned KAM</label>
              <select value={form.kamId} onChange={set("kamId")} className={inputCls}>
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {error && <p className="text-[12px] text-[#EF4444]">{error}</p>}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-2 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!form.name.trim() || saving}
            className="px-5 py-2 text-[12px] font-semibold text-white bg-[#0755E9] rounded-lg hover:bg-[#0647C7] disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : mode === "create" ? "Create Account" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
