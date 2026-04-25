"use client";

import { useEffect, useState } from "react";

import { PlatformLogo } from "@/components/platform-logo";
import { SidebarPlatform } from "@/components/create-post/types";

type Props = {
  platform: SidebarPlatform;
  onPlatformToggle: (enabled: boolean) => void;
  onSelectAllAccounts: (enabled: boolean) => void;
  onAccountToggle: (accountId: number, enabled: boolean) => void;
};

function formatAccountType(accountType?: string | null) {
  if (!accountType) return "Connected account";
  return accountType.replace(/_/g, " ");
}

function getEntityLabel(accountType?: string | null) {
  return accountType?.toLowerCase().includes("page") ? "Page" : "Account";
}

export function PlatformSelector({
  platform,
  onPlatformToggle,
  onSelectAllAccounts,
  onAccountToggle,
}: Props) {
  const hasAccounts = platform.accounts.length > 0;
  const selectedCount = platform.selectedAccountIds.length;
  const allSelected = hasAccounts && selectedCount === platform.accounts.length;
  const [expanded, setExpanded] = useState(platform.selected);

  useEffect(() => {
    if (platform.selected) {
      setExpanded(true);
    }
  }, [platform.selected]);

  return (
    <section
      className={`rounded-2xl border p-3.5 shadow-[0_10px_28px_rgba(15,23,42,0.05)] transition-all duration-200 ${
        platform.selected
          ? "border-[#efcf59] bg-[#fff7d1] shadow-[0_0_0_1px_rgba(245,200,0,0.18),0_16px_38px_rgba(245,200,0,0.10)]"
          : "border-[#f0e2b2] bg-[#fffef9] hover:-translate-y-0.5 hover:border-[#e2cc7b]"
      }`}
    >
      <div className="flex items-start gap-3">
        <label className="mt-0.5 inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={platform.selected}
            disabled={!hasAccounts}
            onChange={(event) => onPlatformToggle(event.target.checked)}
            className="h-4 w-4 rounded-[4px] border-[1.5px] border-[#d8c36e] bg-white text-[#F5C800] focus:ring-0"
          />
        </label>

        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] ${platform.id === "twitter" ? "bg-black text-white" : ""} ${platform.id === "youtube" ? "bg-[#FF0000] text-white" : ""} ${platform.id === "blogger" ? "bg-[#FF5722] text-white" : ""} ${!["twitter", "youtube", "blogger"].includes(platform.id) ? `bg-gradient-to-br ${platform.surfaceClass} ${platform.accentClass}` : ""}`}
        >
          <PlatformLogo platform={platform.id} className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] text-[#8c6f00]">Platform</p>
              <h3 className="mt-0.5 text-[13px] font-semibold text-[#111111]">{platform.label}</h3>
              <div
                className={`mt-1 flex items-center gap-1.5 text-[10px] ${
                  hasAccounts ? "text-[#1f2937]" : "text-[#E24B4A]"
                }`}
              >
                <span
                  className={`h-[6px] w-[6px] rounded-full ${
                    hasAccounts ? "bg-[#22c55e]" : "bg-[#E24B4A]"
                  }`}
                />
                <span>{hasAccounts ? "Ready to select" : "Unavailable"}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[#f0e2b2] bg-[#fff7d1] px-2.5 py-1 text-[10px] font-medium text-[#5b4500]">
                {hasAccounts
                  ? `${platform.accounts.length} item${platform.accounts.length > 1 ? "s" : ""}`
                  : "Not connected"}
              </span>
              {hasAccounts ? (
                <button
                  type="button"
                  onClick={() => setExpanded((current) => !current)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#eadba6] bg-[#fffef9] text-[#1f2937] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#d8c36e] hover:text-[#111111]"
                  aria-label={expanded ? `Hide ${platform.label} accounts` : `Show ${platform.label} accounts`}
                >
                  <svg
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                  >
                    <path
                      d="M5.2 7.6a.75.75 0 0 1 1.06.04L10 11.57l3.74-3.93a.75.75 0 1 1 1.08 1.04l-4.28 4.5a.75.75 0 0 1-1.08 0l-4.28-4.5a.75.75 0 0 1 .04-1.08Z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>

          {hasAccounts ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#f0e2b2] bg-[#fffef9] px-3 py-2">
              <span className="text-[10px] font-medium text-[#1f2937]">
                {selectedCount}/{platform.accounts.length} selected
              </span>
              <button
                type="button"
                onClick={() => onSelectAllAccounts(!allSelected)}
                className="rounded-full border border-[#e5ca61] bg-[#ffe98e] px-2.5 py-1 text-[10px] font-semibold text-[#5b4500] transition-all duration-200 hover:border-[#F5C800] hover:text-[#111111]"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
            </div>
          ) : null}

          <div
            className={`grid transition-all duration-300 ${
              expanded && hasAccounts ? "grid-rows-[1fr] pt-3" : "grid-rows-[0fr] pt-0"
            }`}
          >
            <div className="overflow-hidden">
              <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                {platform.accounts.map((account) => {
                  const checked = platform.selectedAccountIds.includes(account.id);

                  return (
                    <label
                      key={account.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-all duration-200 ${
                        checked
                          ? "border-[#efcf59] bg-[#fff2b8]"
                          : "border-[#f0e2b2] bg-[#fffef9] hover:bg-[#fff9df]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => onAccountToggle(account.id, event.target.checked)}
                        className="mt-1 h-4 w-4 rounded-[4px] border-[1.5px] border-[#d8c36e] bg-white text-[#F5C800] focus:ring-0"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] text-[#8c6f00]">
                          {getEntityLabel(account.account_type)}
                        </div>
                        <div className="truncate text-[12px] font-semibold text-[#111111]">
                          {account.account_name}
                        </div>
                        <div className="mt-1 text-[10px] text-[#344054]">
                          {formatAccountType(account.account_type)}
                        </div>
                      </div>

                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          checked
                            ? "bg-[#16a34a] text-white"
                            : "border border-[#eadba6] bg-white text-transparent"
                        }`}
                      >
                        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3 w-3 fill-current">
                          <path d="M7.7 13.6 4.8 10.7l-1 1 3.9 3.9 8.4-8.4-1-1-7.4 7.4Z" />
                        </svg>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {!hasAccounts ? (
            <p className="mt-4 text-xs text-[#344054]">
              Connect a {platform.label} account to enable publishing here.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
