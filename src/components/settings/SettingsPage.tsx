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
  const { role, userName } = useRole();
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
  const allocatedCount = useMemo(() => Object.values(allocations).filter(Boolean).length, [allocations]);
  const uploadedPlaybooks = useMemo(() => Object.values(playbooks).filter(Boolean).length, [playbooks]);
  const connectedIntegrations = useMemo(() => Object.values(integrationStatuses).filter((status) => status === "connected").length, [integrationStatuses]);
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
      <section className="mx-auto max-w-[1500px] space-y-4">
        <div className="rounded-[30px] border border-[#E4D5C4] bg-[linear-gradient(135deg,#FFF9EF_0%,#F6F0E5_55%,#EAF4EA_100%)] p-5 shadow-[0_24px_70px_-58px_rgba(32,38,32,0.58)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-[clamp(40px,5vw,64px)] font-black leading-none tracking-[-0.06em] text-[#1F2722]">Settings</h1>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-[#D8C7B4] bg-[#FFFCF6]/75 px-4 py-3">
                <p className="text-[12px] font-bold text-[#75685A]">Weights</p>
                <p className="text-2xl font-black text-[#25352E]">{totalWeight}%</p>
              </div>
              <div className="rounded-2xl border border-[#D8C7B4] bg-[#FFFCF6]/75 px-4 py-3">
                <p className="text-[12px] font-bold text-[#75685A]">Allocated</p>
                <p className="text-2xl font-black text-[#25352E]">{allocatedCount}</p>
              </div>
              <div className="rounded-2xl border border-[#D8C7B4] bg-[#FFFCF6]/75 px-4 py-3">
                <p className="text-[12px] font-bold text-[#75685A]">Playbooks</p>
                <p className="text-2xl font-black text-[#25352E]">{uploadedPlaybooks}/{weights.length}</p>
              </div>
              <div className="rounded-2xl border border-[#D8C7B4] bg-[#FFFCF6]/75 px-4 py-3">
                <p className="text-[12px] font-bold text-[#75685A]">Signed in</p>
                <p className="max-w-28 truncate text-lg font-black text-[#25352E]">{userName || "Sarah Chen"}</p>
              </div>
            </div>
          </div>
          {status ? (
            <div className="mt-4 rounded-2xl border border-[#CFE2D3] bg-[#F3FAF1] px-4 py-3 text-[13px] font-black text-[#245D3A]">
              {status}
            </div>
          ) : null}
        </div>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="rounded-[28px] border border-[#E1D3C2] bg-[#FFFCF6] p-4 shadow-[0_20px_55px_-48px_rgba(32,38,32,0.55)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[20px] font-black text-[#25352E]">Default KPI weights</h2>
              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-[12px] font-black ${canSaveWeights ? "border-[#BFD9C6] bg-[#F2FAF1] text-[#1F6C42]" : "border-[#EAB3A9] bg-[#FFF1EE] text-[#A63F33]"}`}>
                  Total {totalWeight}%
                </span>
                <button
                  type="button"
                  disabled={!canSaveWeights}
                  onClick={saveWeights}
                  className="rounded-full bg-[#25352E] px-4 py-2 text-[12px] font-black text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#AFA79C]"
                >
                  {actionLabel}
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
              {weights.map((item) => (
                <label key={item.id} className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-black text-[#25352E]">{item.name}</span>
                    <span className="rounded-full border border-[#D7C6B4] bg-[#FFFCF6] px-2.5 py-1 text-[11px] font-black text-[#25352E]">{item.weight}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    value={item.weight}
                    onChange={(event) => updateWeight(item.id, Number(event.target.value))}
                    className="mt-2 h-2 w-full accent-[#25352E]"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#E1D3C2] bg-[#FFFCF6] p-4 shadow-[0_20px_55px_-48px_rgba(32,38,32,0.55)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[20px] font-black text-[#25352E]">Integrations</h2>
              <span className="rounded-full border border-[#D8C7B4] bg-[#FFF8ED] px-3 py-1 text-[12px] font-black text-[#6F6254]">{connectedIntegrations}/{integrationMocks.length} connected</span>
            </div>
            <div className="mt-3 grid gap-2">
              {integrationMocks.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleIntegration(name)}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] px-3 py-2 text-left transition hover:border-[#25352E]/45"
                >
                  <span className="truncate text-[13px] font-black text-[#25352E]">{name}</span>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-black ${integrationStatuses[name] === "connected" ? "bg-[#EDF8EE] text-[#1F6C42]" : "bg-[#F2E8D8] text-[#6E5F4F]"}`}>
                    <Link2 className="h-3.5 w-3.5" />
                    {integrationStatuses[name]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
          <div className="rounded-[28px] border border-[#E1D3C2] bg-[#FFFCF6] p-4 shadow-[0_20px_55px_-48px_rgba(32,38,32,0.55)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[20px] font-black text-[#25352E]">Associates and allocations</h2>
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

            <div className="mt-4 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="max-h-[470px] space-y-2 overflow-y-auto pr-1">
                {associates.map((associate) => {
                  const ownedAccounts = portfolioAccounts.filter((account) => allocations[account.id] === associate);
                  return (
                    <div key={associate} className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[14px] font-black text-[#25352E]">{associate}</p>
                          <p className="text-[12px] font-bold text-[#75685A]">{ownedAccounts.length} account{ownedAccounts.length === 1 ? "" : "s"}</p>
                        </div>
                        <button type="button" onClick={() => removeAssociate(associate)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#DECFC0] text-[#A04436]">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ownedAccounts.slice(0, 4).map((account) => (
                          <button key={account.id} type="button" onClick={() => updateAllocation(account.id, "")} className="rounded-full border border-[#D9C8B4] bg-[#FFFCF6] px-2 py-1 text-[11px] font-black text-[#6F6254]">
                            {account.name}
                          </button>
                        ))}
                        {ownedAccounts.length > 4 ? <span className="rounded-full border border-[#D9C8B4] px-2 py-1 text-[11px] font-black text-[#8A7563]">+{ownedAccounts.length - 4}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[16px] font-black text-[#25352E]">Account allocation</h3>
                  <span className="rounded-full border border-[#D8C7B4] bg-[#FFFCF6] px-3 py-1 text-[12px] font-black text-[#6F6254]">{portfolioAccounts.length} accounts</span>
                </div>
                <div className="mt-3 max-h-[415px] space-y-2 overflow-y-auto pr-1">
                  {portfolioAccounts.map((account) => (
                    <div key={account.id} className="grid gap-2 rounded-xl border border-[#E1D3C2] bg-[#FFFCF6] px-3 py-2 sm:grid-cols-[1fr_190px] sm:items-center">
                      <div>
                        <p className="text-[13px] font-black text-[#25352E]">{account.name}</p>
                        <p className="text-[12px] font-bold text-[#75685A]">{account.industry}</p>
                      </div>
                      <select
                        value={allocations[account.id] || ""}
                        onChange={(event) => updateAllocation(account.id, event.target.value)}
                        className="h-9 rounded-full border border-[#D7C6B4] bg-[#FFF8ED] px-3 text-[12px] font-black text-[#25352E] outline-none"
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
          </div>

          <div className="grid gap-4">
            <div id="playbooks" className="rounded-[28px] border border-[#E1D3C2] bg-[#FFFCF6] p-4 shadow-[0_20px_55px_-48px_rgba(32,38,32,0.55)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[20px] font-black text-[#25352E]">Playbooks</h2>
                <span className="rounded-full border border-[#D8C7B4] bg-[#FFF8ED] px-3 py-1 text-[12px] font-black text-[#6F6254]">{uploadedPlaybooks}/{weights.length} uploaded</span>
              </div>
              <div className="mt-3 max-h-[290px] space-y-2 overflow-y-auto pr-1">
                {weights.map((item) => (
                  <label key={item.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] px-3 py-2">
                    <span className="truncate text-[13px] font-black text-[#25352E]">{item.name}</span>
                    <span className="flex min-w-0 shrink-0 items-center gap-2">
                      <span className="max-w-[160px] truncate text-[12px] font-bold text-[#75685A]">{playbooks[item.id] || "No file"}</span>
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

            <div className="rounded-[28px] border border-[#E1D3C2] bg-[#FFFCF6] p-4 shadow-[0_20px_55px_-48px_rgba(32,38,32,0.55)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[#25352E]" />
                  <h2 className="text-[20px] font-black text-[#25352E]">AI rules playbook</h2>
                </div>
                {!ruleEditorOpen ? (
                  <button type="button" onClick={() => setRuleEditorOpen(true)} className="inline-flex items-center gap-2 rounded-full border border-[#D9C8B4] bg-[#FFF8ED] px-3 py-2 text-[12px] font-black text-[#25352E]">
                    <Plus className="h-4 w-4" />
                    Add rule
                  </button>
                ) : null}
              </div>
              <div className="mt-3 max-h-[270px] space-y-2 overflow-y-auto pr-1">
                {ruleEditorOpen ? (
                  <div className="rounded-2xl border border-[#CDBDAA] bg-[#FFFCF6] p-3">
                    <textarea
                      value={ruleDraft}
                      onChange={(event) => setRuleDraft(event.target.value)}
                      placeholder="Add a learning rule from a dismissal, denial, or correction..."
                      className="min-h-20 w-full resize-none rounded-xl border border-[#E1D3C2] bg-[#FFF8ED] p-3 text-[13px] font-bold text-[#25352E] outline-none"
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
                ) : null}
                {[...customRules, ...ruleLog].map((rule) => (
                  <div key={rule} className="rounded-2xl border border-[#E1D3C2] bg-[#FFF8ED] p-3 text-[13px] font-bold leading-relaxed text-[#4E443B]">
                    {rule}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
