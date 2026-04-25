"use client";

import { SavedAccountGroup, SidebarPlatform } from "@/components/create-post/types";
import { PlatformSelector } from "@/components/create-post/platform-selector";

type Props = {
  platforms: SidebarPlatform[];
  totalSelectedAccounts: number;
  groupName: string;
  accountGroups: SavedAccountGroup[];
  onGroupNameChange: (value: string) => void;
  onSaveGroup: () => void;
  onApplyGroup: (groupId: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onPlatformToggle: (platformId: SidebarPlatform["id"], enabled: boolean) => void;
  onSelectAllAccounts: (platformId: SidebarPlatform["id"], enabled: boolean) => void;
  onAccountToggle: (
    platformId: SidebarPlatform["id"],
    accountId: number,
    enabled: boolean,
  ) => void;
};

export function Sidebar({
  platforms,
  totalSelectedAccounts,
  groupName,
  accountGroups,
  onGroupNameChange,
  onSaveGroup,
  onApplyGroup,
  onRemoveGroup,
  onPlatformToggle,
  onSelectAllAccounts,
  onAccountToggle,
}: Props) {
  const selectedCount = platforms.filter((platform) => platform.selected).length;

  return (
    <aside className="h-full bg-[#fffdf7] xl:sticky xl:top-6 xl:h-[calc(100vh-8.5rem)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-[#f0e2b2] px-5 py-5">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#8c6f00]">
            Distribution
          </p>
          <h2 className="mt-2 text-[14px] font-semibold text-[#111111]">
            Platforms & accounts
          </h2>
          <p className="mb-3.5 mt-2 text-[11px] leading-[1.5] text-[#344054]">
            Choose channels, pages, and saved account groups from one focused panel.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-[#f0e2b2] bg-[#fff7d1] px-2.5 py-1 text-[11px] font-medium text-[#5b4500]">
              {selectedCount} platform{selectedCount === 1 ? "" : "s"} active
            </span>
            <span className="rounded-full border border-[#f0e2b2] bg-[#fff7d1] px-2.5 py-1 text-[11px] font-medium text-[#5b4500]">
              {totalSelectedAccounts} account{totalSelectedAccounts === 1 ? "" : "s"} selected
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <section className="mb-4 rounded-2xl border border-[#f0e2b2] bg-[#fff8dc] p-3.5 shadow-[0_10px_28px_rgba(180,144,34,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[12px] font-semibold text-[#111111]">Account groups</h3>
                <p className="mt-1 text-[10px] leading-[1.5] text-[#344054]">
                  Save common account combinations and apply them in one click.
                </p>
              </div>
              <span className="rounded-full border border-[#efd98a] bg-[#fffef9] px-2.5 py-1 text-[11px] font-medium text-[#5b4500]">
                {accountGroups.length} saved
              </span>
            </div>

            <div className="mt-4 flex gap-2">
              <input
                value={groupName}
                onChange={(event) => onGroupNameChange(event.target.value)}
                placeholder="Launch accounts"
                className="h-10 flex-1 rounded-xl border border-[#eadba6] bg-[#fffef9] px-3 text-[12px] text-[#111111] outline-none placeholder:text-[#6b7280] transition-all duration-200 focus:border-[#F5C800] focus:shadow-[0_0_0_4px_rgba(245,200,0,0.16)]"
              />
              <button
                type="button"
                onClick={onSaveGroup}
                className="h-10 rounded-xl bg-[#F5C800] px-4 text-[12px] font-medium text-[#111111] shadow-[0_10px_24px_rgba(245,200,0,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#E6BE3A]"
              >
                Save
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {accountGroups.length ? (
                accountGroups.map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center gap-2 rounded-xl border border-[#f0e2b2] bg-[#fffef9] p-2 shadow-[0_8px_20px_rgba(180,144,34,0.06)]"
                  >
                    <button
                      type="button"
                      onClick={() => onApplyGroup(group.id)}
                      className="flex-1 rounded-lg px-3 py-2 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#fff7d1]"
                    >
                      <div className="text-[12px] font-semibold text-[#111111]">{group.name}</div>
                      <div className="mt-1 text-[10px] text-[#344054]">
                        {group.accountIds.length} account{group.accountIds.length === 1 ? "" : "s"}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveGroup(group.id)}
                      className="h-9 rounded-lg border border-[#eadba6] bg-[#fffef9] px-3 text-[11px] font-medium text-[#1f2937] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#d8c36e] hover:text-[#111111]"
                    >
                      Remove
                    </button>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-[#f0e2b2] bg-[#fffef9] px-3 py-4 text-[10px] leading-[1.5] text-[#344054]">
                  No saved groups yet. Select accounts below, then save the current selection here.
                </div>
              )}
            </div>
          </section>

          <div className="space-y-3">
            {platforms.map((platform) => (
              <PlatformSelector
                key={platform.id}
                platform={platform}
                onPlatformToggle={(enabled) => onPlatformToggle(platform.id, enabled)}
                onSelectAllAccounts={(enabled) => onSelectAllAccounts(platform.id, enabled)}
                onAccountToggle={(accountId, enabled) =>
                  onAccountToggle(platform.id, accountId, enabled)
                }
              />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
