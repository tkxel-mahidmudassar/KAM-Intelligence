"use client";

import { CircleCheck } from "lucide-react";
import { useRole } from "@/context/RoleContext";
import type { Role } from "@/types";

const roleOptions: Array<{ label: string; value: Role; description: string }> = [
  { label: "Associate", value: "ASSOCIATE", description: "Assigned" },
  { label: "KAM", value: "KAM", description: "Portfolio" },
  { label: "C-Level", value: "EXECUTIVE", description: "Read-only" },
];

export function RoleBar({ compact = false }: { compact?: boolean }) {
  const { role, setRole } = useRole();
  const isReadOnlyRole = role === "EXECUTIVE" || role === "ADMIN" || role === "MANAGER";

  return (
    <div className={compact ? "" : "sticky top-0 z-40 border-b border-[#E8E1D7] bg-[rgba(250,247,241,0.82)] px-5 py-2 shadow-[0_10px_28px_-26px_rgba(46,36,23,0.42)] [backdrop-filter:blur(18px)]"}>
      <div className={`${compact ? "" : "mx-auto max-w-[1500px]"} flex items-center justify-between gap-3`}>
        <div className="inline-flex w-fit items-center rounded-full border border-[#E2D8CC] bg-[#FFF9EF]/72 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
          {roleOptions.map((option) => {
            const active = role === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setRole(option.value)}
                className={`group inline-flex h-8 items-center gap-2 rounded-full px-3 text-[12px] font-semibold transition-all ${
                  active
                    ? "bg-[#28362F] text-[#FFF9EF] shadow-[0_10px_22px_-16px_rgba(40,54,47,0.85)]"
                    : "text-[#6F6254] hover:bg-[#F3EADD] hover:text-[#28362F]"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    active ? "bg-[#A7C7B4]" : "bg-[#CBBDAE] group-hover:bg-[#A7C7B4]"
                  }`}
                />
                <span>{option.label}</span>
                <span className={`${active ? "text-[#FFF9EF]/68" : "text-[#9B8D7C]"} hidden sm:inline`}>{option.description}</span>
              </button>
            );
          })}
        </div>

        {isReadOnlyRole ? (
          <div className="hidden h-8 w-fit items-center gap-2 rounded-full border border-[#E2D8CC] bg-[#FFF9EF]/72 px-3 text-[12px] font-semibold text-[#6F6254] sm:inline-flex">
            <CircleCheck className="h-3.5 w-3.5 text-[#5A8F73]" />
            Read-only view
          </div>
        ) : null}
      </div>
    </div>
  );
}
