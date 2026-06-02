"use client";

import { useState } from "react";
import {
  Plus, User, Mail, Phone, Star, Pencil, Trash2, Check, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";

export interface Contact {
  id: string;
  accountId: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

interface ContactsTabProps {
  contacts: Contact[];
  accountId: string;
  onAdd:    (data: Omit<Contact, "id" | "accountId">) => Promise<void>;
  onUpdate: (id: string, patch: Partial<Contact>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function ContactRow({
  contact, canEdit, onUpdate, onDelete,
}: {
  contact: Contact;
  canEdit: boolean;
  onUpdate: (id: string, patch: Partial<Contact>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing,  setEditing]  = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [name,     setName]     = useState(contact.name);
  const [title,    setTitle]    = useState(contact.title ?? "");
  const [email,    setEmail]    = useState(contact.email ?? "");
  const [phone,    setPhone]    = useState(contact.phone ?? "");

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(contact.id, {
        name:  name.trim(),
        title: title.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await onDelete(contact.id); } finally { setDeleting(false); }
  };

  const inputCls = "px-2 py-1 text-[12px] rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none focus:border-[#0755E9]";

  if (editing) {
    return (
      <div className="p-3 rounded-xl border border-[#0755E9]/30 bg-[#0755E9]/5 space-y-2">
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name *" className={cn(inputCls, "flex-1")} />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={cn(inputCls, "flex-1")} />
        </div>
        <div className="flex gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={cn(inputCls, "flex-1")} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className={cn(inputCls, "flex-1")} />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => setEditing(false)} className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-white bg-[#0755E9] rounded-lg hover:bg-[#0647C7] disabled:opacity-50"
          >
            <Check className="h-3 w-3" /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] hover:border-[var(--border-default)] group transition-all">
      {/* Avatar */}
      <div className="h-9 w-9 rounded-full bg-[#0755E9]/15 flex items-center justify-center shrink-0">
        <span className="text-[12px] font-bold text-[#0755E9]">
          {contact.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{contact.name}</p>
          {contact.isPrimary && (
            <span className="flex items-center gap-0.5 text-[10px] font-medium text-[#F59E0B] bg-[#F59E0B]/12 px-1.5 py-0.5 rounded-full shrink-0">
              <Star className="h-2.5 w-2.5" /> Primary
            </span>
          )}
        </div>
        {contact.title && (
          <p className="text-[11px] text-[var(--text-muted)]">{contact.title}</p>
        )}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-[11px] text-[#0755E9] hover:underline">
              <Mail className="h-3 w-3" /> {contact.email}
            </a>
          )}
          {contact.phone && (
            <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
              <Phone className="h-3 w-3" /> {contact.phone}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      {canEdit && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => onUpdate(contact.id, { isPrimary: true })}
            disabled={contact.isPrimary}
            title="Set as primary"
            className="p-1.5 rounded text-[var(--text-disabled)] hover:text-[#F59E0B] disabled:opacity-30 transition-colors"
          >
            <Star className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded text-[var(--text-disabled)] hover:text-[var(--text-primary)] transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 rounded text-[var(--text-disabled)] hover:text-[#EF4444] hover:bg-[#EF4444]/8 disabled:opacity-40 transition-all"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function AddContactForm({ onSave, onCancel }: {
  onSave: (data: Omit<Contact, "id" | "accountId">) => Promise<void>;
  onCancel: () => void;
}) {
  const [name,      setName]      = useState("");
  const [title,     setTitle]     = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [saving,    setSaving]    = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name:      name.trim(),
        title:     title.trim()  || null,
        email:     email.trim()  || null,
        phone:     phone.trim()  || null,
        isPrimary,
      });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#0755E9]";

  return (
    <div className="rounded-xl border border-[#0755E9]/30 bg-[#0755E9]/5 p-4 space-y-3">
      <p className="text-[12px] font-semibold text-[var(--text-primary)]">New Contact</p>
      <div className="grid grid-cols-2 gap-2">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name *" className={inputCls} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={inputCls} />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={inputCls} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className={inputCls} />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isPrimary}
          onChange={(e) => setIsPrimary(e.target.checked)}
          className="rounded"
        />
        <span className="text-[12px] text-[var(--text-muted)]">Set as primary contact</span>
      </label>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="px-4 py-1.5 text-[12px] font-semibold text-white bg-[#0755E9] rounded-lg hover:bg-[#0647C7] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add Contact"}
        </button>
      </div>
    </div>
  );
}

export function ContactsTab({ contacts, accountId, onAdd, onUpdate, onDelete }: ContactsTabProps) {
  const { role }  = useRole();
  const canEdit   = role === "KAM" || role === "MANAGER";
  const [showForm, setShowForm] = useState(false);

  const handleAdd = async (data: Omit<Contact, "id" | "accountId">) => {
    await onAdd(data);
    setShowForm(false);
  };

  const sorted = [...contacts].sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[var(--text-muted)]">
          {contacts.length} contact{contacts.length !== 1 ? "s" : ""}
        </p>
        {canEdit && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white bg-[#0755E9] rounded-lg hover:bg-[#0647C7] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add Contact
          </button>
        )}
      </div>

      {showForm && (
        <AddContactForm onSave={handleAdd} onCancel={() => setShowForm(false)} />
      )}

      {sorted.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-16">
          <User className="h-10 w-10 text-[var(--text-disabled)] mb-3" />
          <p className="text-[13px] font-medium text-[var(--text-primary)]">No contacts yet</p>
          {canEdit && (
            <p className="text-[12px] text-[var(--text-muted)] mt-1">Add the key stakeholders for this account</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((c) => (
            <ContactRow
              key={c.id}
              contact={c}
              canEdit={canEdit}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
