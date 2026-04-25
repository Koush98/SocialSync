"use client";

import { ReactNode } from "react";

import { PlatformLogo } from "@/components/platform-logo";
import {
  PLATFORM_LABELS,
  PLATFORM_META,
} from "@/components/create-post/constants";
import {
  PlatformConfigMap,
  SelectedAccountsMap,
} from "@/components/create-post/types";
import { Account, PlatformName } from "@/lib/types";

type Props = {
  selectedPlatforms: PlatformName[];
  selectedAccounts: SelectedAccountsMap;
  platformConfigs: PlatformConfigMap;
  accountsByPlatform: Record<PlatformName, Account[]>;
  expandedPlatforms: Record<string, boolean>;
  onToggleExpand: (platform: PlatformName) => void;
  onConfigChange: <K extends keyof PlatformConfigMap[PlatformName]>(
    platform: PlatformName,
    key: K,
    value: PlatformConfigMap[PlatformName][K],
  ) => void;
};

function selectedAccountLabels(accounts: Account[], selectedIds: number[]) {
  return accounts
    .filter((account) => selectedIds.includes(account.id))
    .map((account) => account.account_name);
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-[#1f2937]">{label}</label>
      {children}
      {hint ? <p className="mt-2 text-xs leading-5 text-[#344054]">{hint}</p> : null}
    </div>
  );
}

function ToggleCard({
  checked,
  title,
  description,
  onChange,
}: {
  checked: boolean;
  title: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-[#eadba6] bg-[#fffef9] p-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-[#d8c36e] bg-white text-[#ffd24b] focus:ring-[#ffd24b]"
      />
      <div>
        <div className="text-sm font-semibold text-[#111111]">{title}</div>
        <div className="mt-1 text-xs leading-5 text-[#344054]">{description}</div>
      </div>
    </label>
  );
}

const inputClassName =
  "w-full rounded-2xl border border-[#eadba6] bg-[#fffef9] px-4 py-3 text-sm text-[#111111] outline-none transition-all duration-200 placeholder:text-[#6b7280] focus:border-[#F5C800] focus:bg-white focus:shadow-[0_0_0_4px_rgba(245,200,0,0.16)]";

export function PlatformSettings({
  selectedPlatforms,
  selectedAccounts,
  platformConfigs,
  accountsByPlatform,
  expandedPlatforms,
  onToggleExpand,
  onConfigChange,
}: Props) {
  return (
    <section className="mx-6 mb-6 rounded-[24px] border border-[#f0e2b2] bg-[#fffdf8] p-5 shadow-[0_16px_40px_rgba(180,144,34,0.08)] sm:p-6">
      <div className="border-b border-[#f0e2b2] pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c89a00]">
          Step 2
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#111111]">
          Platform-specific settings
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#344054]">
          These cards stay empty until a platform is selected, so the interface only expands when it actually needs to.
        </p>
      </div>

      {!selectedPlatforms.length ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[#f0e2b2] bg-[#fffef9] px-6 py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-[#fff7cf] text-[#c89a00]">
            <span className="text-lg">+</span>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-[#111111]">No platform settings yet</h3>
          <p className="mt-2 text-sm leading-6 text-[#344054]">
            Select one or more platforms from the sidebar and only those configuration panels will appear here.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {selectedPlatforms.map((platform) => {
            const config = platformConfigs[platform];
            const expanded = expandedPlatforms[platform] ?? true;
            const accountNames = selectedAccountLabels(
              accountsByPlatform[platform],
              selectedAccounts[platform],
            );

            return (
              <article
                key={platform}
                className="overflow-hidden rounded-2xl border border-[#f0e2b2] bg-[#fffef9] shadow-[0_10px_28px_rgba(180,144,34,0.08)]"
              >
                <button
                  type="button"
                  onClick={() => onToggleExpand(platform)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-all duration-200 hover:bg-[#fff7d1]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${PLATFORM_META[platform].surfaceClass} ${PLATFORM_META[platform].accentClass}`}
                    >
                      <PlatformLogo platform={platform} className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-[#111111]">
                        {PLATFORM_LABELS[platform]}
                      </h3>
                      <p className="mt-1 truncate text-sm text-[#344054]">
                        {accountNames.length
                          ? accountNames.join(", ")
                          : "No accounts selected"}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-[#c89a00]">{expanded ? "Hide" : "Show"}</span>
                </button>

                <div
                  className={`grid transition-all duration-300 ${
                    expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="border-t border-[#f0e2b2] px-5 py-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field
                          label="Schedule"
                          hint="Leave blank to publish immediately after the post is created."
                        >
                          <input
                            type="datetime-local"
                            value={config.schedule}
                            onChange={(event) =>
                              onConfigChange(platform, "schedule", event.target.value)
                            }
                            className={inputClassName}
                          />
                        </Field>

                        <div className="rounded-xl border border-[#f0e2b2] bg-[#fff8dc] p-4">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c89a00]">
                            Active destinations
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {accountNames.map((name) => (
                              <span
                                key={name}
                                className="rounded-full border border-[#e5ca61] bg-[#ffe98e] px-3 py-1.5 text-xs font-semibold text-[#5b4500]"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {platform === "facebook" ? (
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <Field label="Page selection">
                            <select
                              value={config.facebookPageId}
                              onChange={(event) =>
                                onConfigChange(platform, "facebookPageId", event.target.value)
                              }
                              className={inputClassName}
                            >
                              <option value="default">Use selected account page</option>
                              <option value="cross-post">Cross-post to paired page</option>
                            </select>
                          </Field>
                          <Field label="Privacy / visibility">
                            <select
                              value={config.facebookVisibility}
                              onChange={(event) =>
                                onConfigChange(
                                  platform,
                                  "facebookVisibility",
                                  event.target.value as typeof config.facebookVisibility,
                                )
                              }
                              className={inputClassName}
                            >
                              <option value="public">Public</option>
                              <option value="friends">Friends</option>
                              <option value="only_me">Only me</option>
                            </select>
                          </Field>
                          <Field label="CTA button">
                            <select
                              value={config.facebookCta}
                              onChange={(event) =>
                                onConfigChange(
                                  platform,
                                  "facebookCta",
                                  event.target.value as typeof config.facebookCta,
                                )
                              }
                              className={inputClassName}
                            >
                              <option value="none">No CTA</option>
                              <option value="learn_more">Learn more</option>
                              <option value="shop_now">Shop now</option>
                              <option value="sign_up">Sign up</option>
                            </select>
                          </Field>
                        </div>
                      ) : null}

                      {platform === "instagram" ? (
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <Field
                            label="Caption formatting"
                            hint="Adjust tone and structure without changing the global draft."
                          >
                            <select
                              value={config.instagramCaptionStyle}
                              onChange={(event) =>
                                onConfigChange(
                                  platform,
                                  "instagramCaptionStyle",
                                  event.target.value as typeof config.instagramCaptionStyle,
                                )
                              }
                              className={inputClassName}
                            >
                              <option value="balanced">Balanced</option>
                              <option value="clean">Minimal</option>
                              <option value="creator">Creator style</option>
                            </select>
                          </Field>
                          <Field label="Hashtags">
                            <input
                              value={config.instagramHashtags}
                              onChange={(event) =>
                                onConfigChange(platform, "instagramHashtags", event.target.value)
                              }
                              placeholder="#product, #launch"
                              className={inputClassName}
                            />
                          </Field>
                          <Field label="Post type">
                            <select
                              value={config.instagramPostType}
                              onChange={(event) =>
                                onConfigChange(
                                  platform,
                                  "instagramPostType",
                                  event.target.value as typeof config.instagramPostType,
                                )
                              }
                              className={inputClassName}
                            >
                              <option value="post">Post</option>
                              <option value="reel">Reel</option>
                            </select>
                          </Field>
                          <div className="space-y-4">
                            <ToggleCard
                              checked={config.instagramFirstCommentEnabled}
                              onChange={(checked) =>
                                onConfigChange(platform, "instagramFirstCommentEnabled", checked)
                              }
                              title="Use first comment"
                              description="Keep the main caption clean and move supporting hashtags into the first comment."
                            />
                            {config.instagramFirstCommentEnabled ? (
                              <Field label="First comment">
                                <textarea
                                  value={config.instagramFirstComment}
                                  onChange={(event) =>
                                    onConfigChange(
                                      platform,
                                      "instagramFirstComment",
                                      event.target.value,
                                    )
                                  }
                                  className={`${inputClassName} min-h-[124px] resize-none`}
                                />
                              </Field>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {platform === "linkedin" ? (
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <Field label="Audience">
                            <select
                              value={config.linkedinAudience}
                              onChange={(event) =>
                                onConfigChange(
                                  platform,
                                  "linkedinAudience",
                                  event.target.value as typeof config.linkedinAudience,
                                )
                              }
                              className={inputClassName}
                            >
                              <option value="PUBLIC">Public</option>
                              <option value="CONNECTIONS">Connections</option>
                            </select>
                          </Field>
                          <Field label="Profile / Page">
                            <select
                              value={config.linkedinEntityType}
                              onChange={(event) =>
                                onConfigChange(
                                  platform,
                                  "linkedinEntityType",
                                  event.target.value as typeof config.linkedinEntityType,
                                )
                              }
                              className={inputClassName}
                            >
                              <option value="profile">Profile</option>
                              <option value="page">Page</option>
                            </select>
                          </Field>
                          <Field label="Hashtags">
                            <input
                              value={config.linkedinHashtags}
                              onChange={(event) =>
                                onConfigChange(platform, "linkedinHashtags", event.target.value)
                              }
                              placeholder="#b2b, #founders"
                              className={inputClassName}
                            />
                          </Field>
                        </div>
                      ) : null}

                      {platform === "twitter" ? (
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <Field label="Reply permissions">
                            <select
                              value={config.twitterReplySettings}
                              onChange={(event) =>
                                onConfigChange(
                                  platform,
                                  "twitterReplySettings",
                                  event.target.value as typeof config.twitterReplySettings,
                                )
                              }
                              className={inputClassName}
                            >
                              <option value="everyone">Everyone</option>
                              <option value="mentionedUsers">Mentioned users</option>
                              <option value="following">Following only</option>
                            </select>
                          </Field>
                          <div className="space-y-4">
                            <ToggleCard
                              checked={config.twitterThreadMode}
                              onChange={(checked) =>
                                onConfigChange(platform, "twitterThreadMode", checked)
                              }
                              title="Thread mode"
                              description="Break longer copy into a thread-style publishing intent."
                            />
                          </div>
                        </div>
                      ) : null}

                      {platform === "youtube" ||
                      platform === "blogger" ||
                      platform === "google_business" ||
                      platform === "wordpress" ? (
                        <div className="mt-4 rounded-2xl border border-[#f0e2b2] bg-[#fff8dc] p-4 text-sm leading-6 text-[#344054]">
                          This platform is selected, but advanced controls have been intentionally kept minimal for now. The post will still use the chosen account(s), shared content, selected media, and schedule above.
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
