"use client";

import { useMemo, useState } from "react";
import { FileText, Link2, Plus, Trash2, Upload, UserPlus } from "lucide-react";
import { defaultKpiWeights, integrationMocks } from "@/lib/v2/workspaceData";
import { portfolioAccounts } from "@/lib/v2/portfolioData";
import { useNotifications } from "@/context/NotificationContext";
import { useRole } from "@/context/RoleContext";

const initialAssociates = ["Aisha Khan", "Omar Farooq", "Nadia Raza"];
const ruleLog = [
  "Do not suggest executive escalation if the user dismissed the same recommendation because the sponsor is already engaged.",
  "When project health drops from delivery cadence, prefer pod-level recovery tasks before commercial escalation.",
  "If a KAM denies a document-derived ARR update because finance has not confirmed it, wait for invoice evidence.",
];

export function SettingsPage() {
  const { role, userName, userEmail } = useRole();
  const { fireNotification } = useNotifications();
  const [weights, setWeights] = useState(defaultKpiWeights);
  const [associates, setAssociates] = useState(initialAssociates);
  const [inviteEmail, setInviteEmail] = useState("");
  const [status, setStatus] = useState("");
  const [customRules, setCustomRules] = useState<string[]>([]);
  const [ruleDraft, setRuleDraft] = useState("");
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [integrationStatuses, setIntegrationStatuses] = useState<Record<string, "connected" | "needs setup">>(
    Object.fromEntries(integrationMocks.map((name, index) => [name, index < 2 ? "connected" : "needs setup"])),
  );
  const [allocations, setAllocations] = useState<Record<string, string>>(
    Object.fromEntries(
      portfolioAccounts.map((account, index) => [
        account.id,
        initialAssociates.includes(account.associateOwner) ? account.associateOwner : initialAssociates[index % initialAssociates.length],
      ]),
    ),
  );
  const [playbooks, setPlaybooks] = useState<Record<string, string>>({});

  const totalWeight = useMemo(() => weights.reduce((sum, item) => sum + item.weight, 0), [weights]);
  const canSaveWeights = totalWeight === 100;
  const actionLabel = role === "ASSOCIATE" ? "Request weight changes" : "Save weights";

  function updateWeight(id: string, value: number) {
    setWeights((current) => current.map((item) => (item.id === id ? { ...item, weight: value } : item)));
  }

  function inviteAssociate() {
    const name = inviteEmail.split("@")[0]?.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).trim();
    if (!name) return;
    setAssociates((current) => [...current, name]);
    setInviteEmail("");
    setStatus(`${name} has been added to the associate list.`);
    fireNotification({
      id: `associate-invited-${name}`,
      title: "Associate invited",
      detail: `${name} can now be assigned accounts.`,
      href: "/settings",
      source: "settings",
      severity: "info",
    });
  }

  function saveWeights() {
    if (!canSaveWeights) return;
    setStatus(role === "ASSOCIATE" ? "KPI weight changes have been sent to the KAM for approval." : "Default KPI weights have been saved.");
    fireNotification({
      id: `kpi-weights-${Date.now()}`,
      title: role === "ASSOCIATE" ? "KPI weight request submitted" : "KPI weights saved",
      detail: `The current KPI weight total is ${totalWeight}%.`,
      href: "/settings",
      source: "settings",
      severity: "info",
    });
  }

  function updateAllocation(accountId: string, associate: string) {
    const account = portfolioAccounts.find((item) => item.id === accountId);
    setAllocations((current) => ({ ...current, [accountId]: associate }));
    setStatus(`${account?.name ?? "Account"} is now ${associate ? `allocated to ${associate}` : "unallocated"}.`);
  }

  function removeAssociate(associate: string) {
    setAssociates((current) => current.filter((item) => item !== associate));
    setAllocations((current) => Object.fromEntries(Object.entries(current).map(([accountId, owner]) => [accountId, owner === associate ? "" : owner])));
    setStatus(`${associate} has been removed and their accounts are now unallocated.`);
  }

  function addRule() {
    const trimmed = ruleDraft.trim();
    if (!trimmed) return;
    setCustomRules((current) => [trimmed, ...current]);
    setRuleDraft("");
    setRuleEditorOpen(false);
    setStatus("AI rule added to the learning playbook.");
  }

  function toggleIntegration(name: string) {
    setIntegrationStatuses((current) => {
      const nextStatus = current[name] === "connected" ? "needs setup" : "connected";
      setStatus(`${name} marked as ${nextStatus}.`);
      return { ...current, [name]: nextStatus };
    });
  }

  return (
    <main className="min-h-screen px-5 py-5">
      <section className="mx-auto max-w-[1500px] space-y-5">
        <div className="rounded-[34px] border border-[#E4D5C4] bg-[#FFF8ED] p-5 shadow-[0_24px_70px_-56px_rgba(32,38,32,0.6)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <h1 className="text-[clamp(42px,6vw,78px)] font-black leading-none tracking-[-0.06em] text-[#1F2722]">Settings</h1>
              <div className="rounded-2xl border border-[#D9C8B4] bg-[#FFFCF6] px-4 py-3 text-right">
                <p className="text-[13px] font-bold text-[#75685A]">Signed in</p>
                <p className="text-lg font-black text-[#25352E]">{userName || "Sarah Chen"}</p>
              </div>
            </div>
            {status ? (
              <div className="mt-4 rounded-2xl border border-[#CFE2D3] bg-[#F3FAF1] px-4 py-3 text-[13px] font-black text-[#245D3A]">
                {status}
              </div>
            ) : null}
          </div>

        <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-[#E1D3C2] bg-[#FFFCF6] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black text-[#25352E]">Default KPI weights</h2>
              <span className={`rounded-full border px-3 py-1 text-[12px] font-black ${canSaveWeights ? "border-[#BFD9C6] bg-[#F2FAF1] text-[#1F6C42]" : "border-[#EAB3A9] bg-[#FFF1EE] text-[#A63F33]"}`}>
                Total {totalWeight}%
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {weights.map((item) => (
                <label key={item.id} className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[14px] font-black text-[#25352E]">{item.name}</span>
                    <span className="rounded-full border border-[#D7C6B4] bg-[#FFFCF6] px-3 py-1 text-[12px] font-black text-[#25352E]">{item.weight}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    value={item.weight}
                    onChange={(event) => updateWeight(item.id, Number(event.target.value))}
                    className="mt-3 h-2 w-full accent-[#25352E]"
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={!canSaveWeights}
                onClick={saveWeights}
                className="rounded-full bg-[#25352E] px-5 py-3 text-[13px] font-black text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#AFA79C]"
              >
                {actionLabel}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-[#E1D3C2] bg-[#FFFCF6] p-4">
            <h2 className="text-xl font-black text-[#25352E]">My profile</h2>
            <div className="mt-4 rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#25352E] text-[16px] font-black text-[#FFF9EF]">
                  {(userName || "Sarah Chen").split(" ").map((part) => part[0]).join("").slice(0, 2)}
                </span>
                <div>
                  <p className="text-[16px] font-black text-[#25352E]">{userName || "Sarah Chen"}</p>
                  <p className="text-[13px] font-bold text-[#75685A]">{userEmail || "sarah.chen@tkxel.com"}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-4">
              <h3 className="text-[16px] font-black text-[#25352E]">Integrations</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {integrationMocks.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleIntegration(name)}
                    className="flex items-center justify-between rounded-2xl border border-[#E1D3C2] bg-[#FFFCF6] px-3 py-2 text-left transition hover:border-[#25352E]/45"
                  >
                    <span className="text-[13px] font-black text-[#25352E]">{name}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-black ${integrationStatuses[name] === "connected" ? "bg-[#EDF8EE] text-[#1F6C42]" : "bg-[#F2E8D8] text-[#6E5F4F]"}`}>
                      <Link2 className="h-3.5 w-3.5" />
                      {integrationStatuses[name]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-3xl border border-[#E1D3C2] bg-[#FFFCF6] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black text-[#25352E]">Associates and allocations</h2>
              <div className="flex rounded-full border border-[#E1D3C2] bg-[#FFF8ED] p-1">
                <input
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="Associate email"
                  className="w-48 bg-transparent px-3 text-[13px] font-bold outline-none"
                />
                <button type="button" onClick={inviteAssociate} className="inline-flex items-center gap-2 rounded-full bg-[#25352E] px-3 py-2 text-[12px] font-black text-[#FFF9EF]">
                  <UserPlus className="h-3.5 w-3.5" />
                  Invite
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {associates.map((associate) => (
                <div key={associate} className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[15px] font-black text-[#25352E]">{associate}</p>
                    <button type="button" onClick={() => removeAssociate(associate)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#DECFC0] text-[#A04436]">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {portfolioAccounts
                      .filter((account) => allocations[account.id] === associate)
                      .map((account) => (
                        <div key={account.id} className="flex items-center justify-between rounded-xl border border-[#E1D3C2] bg-[#FFFCF6] px-3 py-2">
                          <span className="text-[12px] font-black text-[#25352E]">{account.name}</span>
                          <button type="button" onClick={() => updateAllocation(account.id, "")} className="text-[11px] font-black text-[#8A7563]">
                            Unallocate
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-3">
              <h3 className="text-[16px] font-black text-[#25352E]">Account allocation</h3>
              <div className="mt-3 max-h-[430px] space-y-2 overflow-y-auto pr-1">
                {portfolioAccounts.map((account) => (
                  <div key={account.id} className="grid gap-2 rounded-xl border border-[#E1D3C2] bg-[#FFFCF6] px-3 py-2 sm:grid-cols-[1fr_210px] sm:items-center">
                    <div>
                      <p className="text-[13px] font-black text-[#25352E]">{account.name}</p>
                      <p className="text-[12px] font-bold text-[#75685A]">{account.industry}</p>
                    </div>
                    <select
                      value={allocations[account.id] || ""}
                      onChange={(event) => updateAllocation(account.id, event.target.value)}
                      className="h-10 rounded-full border border-[#D7C6B4] bg-[#FFF8ED] px-3 text-[13px] font-black text-[#25352E] outline-none"
                    >
                      <option value="">Unallocated</option>
                      {associates.map((associate) => (
                        <option key={associate} value={associate}>
                          {associate}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div id="playbooks" className="rounded-3xl border border-[#E1D3C2] bg-[#FFFCF6] p-4">
            <h2 className="text-xl font-black text-[#25352E]">Playbooks</h2>
            <div className="mt-4 grid gap-2">
              {weights.map((item) => (
                <label key={item.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] px-3 py-2">
                  <span className="text-[13px] font-black text-[#25352E]">{item.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="max-w-[170px] truncate text-[12px] font-bold text-[#75685A]">{playbooks[item.id] || "No file"}</span>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#25352E] text-[#FFF9EF]">
                      <Upload className="h-3.5 w-3.5" />
                    </span>
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        setPlaybooks((current) => ({ ...current, [item.id]: file.name }));
                        fireNotification({
                          id: `playbook-uploaded-${item.id}-${file.name}`,
                          title: `${item.name} playbook parsed`,
                          detail: "Ready for score task suggestions.",
                          href: "/settings?section=playbooks",
                          source: "playbook-upload",
                          severity: "info",
                        });
                      }
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-[#E1D3C2] bg-[#FFFCF6] p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#25352E]" />
            <h2 className="text-xl font-black text-[#25352E]">AI rules playbook</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[...customRules, ...ruleLog].map((rule) => (
              <div key={rule} className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-3 text-[13px] font-bold leading-relaxed text-[#4E443B]">
                {rule}
              </div>
            ))}
            {ruleEditorOpen ? (
              <div className="rounded-2xl border border-[#CDBDAA] bg-[#FFFCF6] p-3">
                <textarea
                  value={ruleDraft}
                  onChange={(event) => setRuleDraft(event.target.value)}
                  placeholder="Add a learning rule from a dismissal, denial, or correction..."
                  className="min-h-24 w-full resize-none rounded-xl border border-[#E1D3C2] bg-[#FFF8ED] p-3 text-[13px] font-bold text-[#25352E] outline-none"
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setRuleEditorOpen(false)} className="rounded-full border border-[#D9C8B4] px-4 py-2 text-[12px] font-black text-[#6F6254]">
                    Cancel
                  </button>
                  <button type="button" onClick={addRule} disabled={!ruleDraft.trim()} className="rounded-full bg-[#25352E] px-4 py-2 text-[12px] font-black text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#AFA79C]">
                    Save rule
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setRuleEditorOpen(true)} className="inline-flex min-h-24 items-center justify-center gap-2 rounded-2xl border border-dashed border-[#CDBDAA] bg-[#FFFCF6] text-[13px] font-black text-[#6F6254]">
                <Plus className="h-4 w-4" />
                Add rule
              </button>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
