"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  PLATFORM_LABELS,
  PLATFORM_META,
  PLATFORM_ORDER,
  createDefaultPlatformConfig,
} from "@/components/create-post/constants";
import { PlatformSettings } from "@/components/create-post/platform-settings";
import { PostEditor } from "@/components/create-post/post-editor";
import { Sidebar } from "@/components/create-post/sidebar";
import {
  PlatformConfigMap,
  SavedAccountGroup,
  SelectedAccountsMap,
} from "@/components/create-post/types";
import { createPost, fetchAccounts, fetchMedia, uploadMedia } from "@/lib/api";
import { Account, MediaAsset, PlatformName } from "@/lib/types";

const ACCOUNT_GROUPS_KEY = "snapkey_account_groups_v1";

function createEmptySelectedAccounts(): SelectedAccountsMap {
  return {
    facebook: [],
    instagram: [],
    linkedin: [],
    twitter: [],
    youtube: [],
    blogger: [],
    google_business: [],
    wordpress: [],
  };
}

function createEmptyConfigs(): PlatformConfigMap {
  return {
    facebook: createDefaultPlatformConfig(),
    instagram: createDefaultPlatformConfig(),
    linkedin: createDefaultPlatformConfig(),
    twitter: createDefaultPlatformConfig(),
    youtube: createDefaultPlatformConfig(),
    blogger: createDefaultPlatformConfig(),
    google_business: createDefaultPlatformConfig(),
    wordpress: createDefaultPlatformConfig(),
  };
}

function normalizePlatform(platform: string | null | undefined): PlatformName | null {
  const value = (platform || "").trim().toLowerCase();
  return PLATFORM_ORDER.includes(value as PlatformName) ? (value as PlatformName) : null;
}

function dedupeNumberList(values: number[]) {
  return [...new Set(values)];
}

function dedupeStringList(values: string[]) {
  return [...new Set(values)];
}

function readSavedGroups() {
  if (typeof window === "undefined") return [] as SavedAccountGroup[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ACCOUNT_GROUPS_KEY) || "[]");
    return Array.isArray(parsed) ? (parsed as SavedAccountGroup[]) : [];
  } catch {
    return [];
  }
}

function writeSavedGroups(groups: SavedAccountGroup[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCOUNT_GROUPS_KEY, JSON.stringify(groups));
}

function normalizeTagList(value: string, prefix: "#" | "@") {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.startsWith(prefix) ? item : `${prefix}${item}`))
    .join(" ");
}

function toUtcIsoString(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function buildPlatformContent(
  caption: string,
  hashtags: string,
  mentions: string,
  platform: PlatformName,
  configs: PlatformConfigMap,
) {
  const parts = [caption.trim()];
  const globalHashtags = normalizeTagList(hashtags, "#");
  const globalMentions = normalizeTagList(mentions, "@");

  if (globalHashtags) parts.push(globalHashtags);
  if (globalMentions) parts.push(globalMentions);

  if (platform === "instagram") {
    const instagramTags = normalizeTagList(configs.instagram.instagramHashtags, "#");
    if (instagramTags) parts.push(instagramTags);
  }

  if (platform === "linkedin") {
    const linkedinTags = normalizeTagList(configs.linkedin.linkedinHashtags, "#");
    if (linkedinTags) parts.push(linkedinTags);
  }

  return parts.filter(Boolean).join("\n\n");
}

function buildPlatformPayload(platform: PlatformName, config: PlatformConfigMap[PlatformName]) {
  if (platform === "facebook") {
    return {
      facebook: {
        page_selection: config.facebookPageId,
        visibility: config.facebookVisibility,
        cta_button: config.facebookCta,
      },
    };
  }

  if (platform === "instagram") {
    return {
      instagram: {
        caption_style: config.instagramCaptionStyle,
        hashtags: config.instagramHashtags,
        first_comment_enabled: config.instagramFirstCommentEnabled,
        first_comment: config.instagramFirstComment || null,
        post_type: config.instagramPostType,
      },
    };
  }

  if (platform === "linkedin") {
    return {
      linkedin: {
        visibility: config.linkedinAudience,
        hashtags: config.linkedinHashtags,
        entity_type: config.linkedinEntityType,
      },
    };
  }

  if (platform === "twitter") {
    return {
      twitter: {
        reply_settings: config.twitterReplySettings,
        thread_mode: config.twitterThreadMode,
      },
    };
  }

  return { [platform]: {} };
}

export function CreatePostStudio() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformName[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<SelectedAccountsMap>(createEmptySelectedAccounts);
  const [platformConfigs, setPlatformConfigs] = useState<PlatformConfigMap>(createEmptyConfigs);
  const [accountGroups, setAccountGroups] = useState<SavedAccountGroup[]>([]);
  const [groupName, setGroupName] = useState("");
  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<string, boolean>>({});
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [mentions, setMentions] = useState("");
  const [altText, setAltText] = useState("");
  const [selectedMediaIds, setSelectedMediaIds] = useState<number[]>([]);
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [accountData, mediaData] = await Promise.all([fetchAccounts(), fetchMedia()]);
        setAccounts(accountData.filter((account) => account.is_active));
        setMedia(mediaData);
        setAccountGroups(readSavedGroups());
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load the composer.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const accountsByPlatform = useMemo(() => {
    return PLATFORM_ORDER.reduce<Record<PlatformName, Account[]>>((acc, platform) => {
      acc[platform] = accounts.filter((account) => normalizePlatform(account.platform) === platform);
      return acc;
    }, {} as Record<PlatformName, Account[]>);
  }, [accounts]);

  const totalAccounts = accounts.length;

  const totalSelectedAccounts = useMemo(
    () => PLATFORM_ORDER.reduce((count, platform) => count + selectedAccounts[platform].length, 0),
    [selectedAccounts],
  );

  const sidebarPlatforms = useMemo(
    () =>
      PLATFORM_ORDER.map((platform) => ({
        ...PLATFORM_META[platform],
        accounts: accountsByPlatform[platform],
        selectedAccountIds: selectedAccounts[platform],
        selected: selectedPlatforms.includes(platform),
      })),
    [accountsByPlatform, selectedAccounts, selectedPlatforms],
  );

  function setPlatformEnabled(platform: PlatformName, enabled: boolean) {
    setSelectedPlatforms((current) => {
      if (enabled) {
        return current.includes(platform) ? current : [...current, platform];
      }
      return current.filter((item) => item !== platform);
    });

    setSelectedAccounts((current) => {
      if (!enabled) {
        return { ...current, [platform]: [] };
      }

      if (current[platform].length) return current;
      const firstAccount = accountsByPlatform[platform][0];
      return {
        ...current,
        [platform]: firstAccount ? [firstAccount.id] : [],
      };
    });

    setExpandedPlatforms((current) => ({ ...current, [platform]: enabled }));
  }

  function toggleAccount(platform: PlatformName, accountId: number, enabled: boolean) {
    const nextAccountIds = enabled
      ? dedupeNumberList([...selectedAccounts[platform], accountId])
      : selectedAccounts[platform].filter((id) => id !== accountId);

    setSelectedAccounts((current) => ({
      ...current,
      [platform]: nextAccountIds,
    }));

    setSelectedPlatforms((current) => {
      if (enabled) {
        return current.includes(platform) ? current : [...current, platform];
      }
      return nextAccountIds.length ? current : current.filter((item) => item !== platform);
    });

    setExpandedPlatforms((current) => ({ ...current, [platform]: true }));
  }

  function toggleAllAccounts(platform: PlatformName, enabled: boolean) {
    const allIds = accountsByPlatform[platform].map((account) => account.id);
    const nextIds = enabled ? allIds : [];

    setSelectedAccounts((current) => ({
      ...current,
      [platform]: nextIds,
    }));

    setSelectedPlatforms((current) => {
      if (enabled && nextIds.length) {
        return current.includes(platform) ? current : [...current, platform];
      }
      return current.filter((item) => item !== platform);
    });

    setExpandedPlatforms((current) => ({ ...current, [platform]: true }));
  }

  function toggleAllGlobalAccounts(enabled: boolean) {
    const nextSelectedAccounts = PLATFORM_ORDER.reduce<SelectedAccountsMap>((acc, platform) => {
      acc[platform] = enabled ? accountsByPlatform[platform].map((account) => account.id) : [];
      return acc;
    }, createEmptySelectedAccounts());

    setSelectedAccounts(nextSelectedAccounts);
    setSelectedPlatforms(enabled ? PLATFORM_ORDER.filter((platform) => accountsByPlatform[platform].length > 0) : []);
    setExpandedPlatforms((current) =>
      PLATFORM_ORDER.reduce<Record<string, boolean>>((acc, platform) => {
        acc[platform] = enabled && accountsByPlatform[platform].length > 0;
        return acc;
      }, {}),
    );
  }

  function updatePlatformConfig<K extends keyof PlatformConfigMap[PlatformName]>(
    platform: PlatformName,
    key: K,
    value: PlatformConfigMap[PlatformName][K],
  ) {
    setPlatformConfigs((current) => ({
      ...current,
      [platform]: {
        ...current[platform],
        [key]: value,
      },
    }));
  }

  function applyAccountIds(accountIds: number[]) {
    const validIds = new Set(accounts.map((account) => account.id));
    const filteredIds = accountIds.filter((id) => validIds.has(id));

    const nextSelectedAccounts = PLATFORM_ORDER.reduce<SelectedAccountsMap>((acc, platform) => {
      acc[platform] = accountsByPlatform[platform]
        .filter((account) => filteredIds.includes(account.id))
        .map((account) => account.id);
      return acc;
    }, createEmptySelectedAccounts());

    setSelectedAccounts(nextSelectedAccounts);
    setSelectedPlatforms(
      PLATFORM_ORDER.filter((platform) => nextSelectedAccounts[platform].length > 0),
    );
    setExpandedPlatforms((current) =>
      PLATFORM_ORDER.reduce<Record<string, boolean>>((acc, platform) => {
        acc[platform] = nextSelectedAccounts[platform].length > 0 || current[platform] || false;
        return acc;
      }, {}),
    );
  }

  function handleSaveGroup() {
    const trimmedName = groupName.trim();
    const selectedIds = dedupeNumberList(
      PLATFORM_ORDER.flatMap((platform) => selectedAccounts[platform]),
    );

    if (!trimmedName) {
      setError("Give the account group a name before saving it.");
      return;
    }

    if (!selectedIds.length) {
      setError("Select at least one account before saving a group.");
      return;
    }

    const nextGroups = [
      ...accountGroups,
      { id: `${Date.now()}`, name: trimmedName, accountIds: selectedIds },
    ];

    setAccountGroups(nextGroups);
    writeSavedGroups(nextGroups);
    setGroupName("");
    setError(null);
    setMessage(`Saved "${trimmedName}" as an account group.`);
  }

  function handleApplyGroup(groupId: string) {
    const group = accountGroups.find((item) => item.id === groupId);
    if (!group) return;
    applyAccountIds(group.accountIds);
    setError(null);
    setMessage(`Applied "${group.name}".`);
  }

  function handleRemoveGroup(groupId: string) {
    const nextGroups = accountGroups.filter((group) => group.id !== groupId);
    setAccountGroups(nextGroups);
    writeSavedGroups(nextGroups);
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!files?.length) return;

    try {
      setUploading(true);
      setError(null);
      setMessage(null);

      const uploads = await Promise.all(
        Array.from(files).map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          if (altText.trim()) {
            formData.append("alt_text", altText.trim());
          }
          return uploadMedia(formData);
        }),
      );

      setMedia((current) => [...uploads, ...current]);
      setSelectedMediaIds((current) => dedupeNumberList([...uploads.map((asset) => asset.id), ...current]));
      setAltText("");
      setMessage(`${uploads.length} media file${uploads.length === 1 ? "" : "s"} uploaded.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Media upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function applyAiAssist(mode: "tighten" | "cta" | "hashtags") {
    if (mode === "tighten") {
      const tightened = caption
        .replace(/\s+/g, " ")
        .split(". ")
        .map((segment) => segment.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(". ");
      setCaption(tightened || caption);
      return;
    }

    if (mode === "cta") {
      if (caption.toLowerCase().includes("learn more")) return;
      setCaption((current) =>
        `${current.trim()}${current.trim() ? "\n\n" : ""}Learn more and follow along for the next update.`,
      );
      return;
    }

    if (!caption.trim()) return;
    const suggestions = caption
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 4)
      .slice(0, 3)
      .map((token) => `#${token}`);
    const merged = dedupeStringList(
      `${hashtags}, ${suggestions.join(", ")}`
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    setHashtags(merged.join(", "));
  }

  async function handleSubmit() {
    if (!selectedPlatforms.length) {
      setError("Select at least one platform before creating the post.");
      return;
    }

    const missingAccounts = selectedPlatforms.find((platform) => !selectedAccounts[platform].length);
    if (missingAccounts) {
      setError(`Select at least one ${PLATFORM_LABELS[missingAccounts]} account before submitting.`);
      return;
    }

    const baseContent =
      caption.trim() || normalizeTagList(hashtags, "#") || normalizeTagList(mentions, "@");
    if (!baseContent && !selectedMediaIds.length) {
      setError("Add caption text or media before creating the post.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setMessage(null);

      const requests = selectedPlatforms.flatMap((platform) =>
        selectedAccounts[platform].map((accountId) =>
          createPost({
            social_account_id: accountId,
            content: buildPlatformContent(caption, hashtags, mentions, platform, platformConfigs),
            scheduled_at: toUtcIsoString(platformConfigs[platform].schedule),
            media_ids: selectedMediaIds,
            platform_options: buildPlatformPayload(platform, platformConfigs[platform]),
          }),
        ),
      );

      await Promise.all(requests);
      setMessage(`${requests.length} post${requests.length === 1 ? "" : "s"} created successfully.`);
      setCaption("");
      setHashtags("");
      setMentions("");
      setSelectedMediaIds([]);
      setSelectedPlatforms([]);
      setSelectedAccounts(createEmptySelectedAccounts());
      setPlatformConfigs(createEmptyConfigs());
      setExpandedPlatforms({});
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create the post.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="bg-[#fffaf0] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px]">
          <div className="rounded-3xl border border-[#f1e4ad] bg-[#fffdf7] p-8 text-center text-sm text-[#2f3847] shadow-[0_18px_50px_rgba(180,144,34,0.08)]">
            Loading composer...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fffaf0] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        <section className="relative mb-6 overflow-hidden rounded-[28px] border border-[#f2d75c] bg-[#F5C800] px-7 py-6 shadow-[0_18px_45px_rgba(245,200,0,0.22)]">
          <div className="max-w-3xl">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[rgba(0,0,0,0.48)]">
              Content Studio
            </p>
            <h1 className="mt-3 text-2xl font-semibold text-[#111111]">
              Create & Publish Content
            </h1>
            <p className="mt-2 text-[13px] text-[rgba(0,0,0,0.55)]">
              Write once. Publish everywhere.
            </p>
          </div>

          <div className="absolute right-7 top-6 flex flex-wrap gap-2">
            <span className="rounded-[20px] bg-[rgba(0,0,0,0.08)] px-3 py-1.5 text-[11px] text-[rgba(0,0,0,0.55)]">
              {selectedPlatforms.length} platform{selectedPlatforms.length === 1 ? "" : "s"} active
            </span>
            <span className="rounded-[20px] bg-[rgba(0,0,0,0.08)] px-3 py-1.5 text-[11px] text-[rgba(0,0,0,0.55)]">
              {media.length} asset{media.length === 1 ? "" : "s"} in library
            </span>
          </div>
        </section>

        {message ? (
          <div className="mb-4 rounded-2xl border border-[#efd98a] bg-[#fff5c8] px-4 py-3 text-sm font-medium text-[#5b4500] shadow-[0_10px_24px_rgba(245,200,0,0.14)]">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="mb-4 flex items-center gap-2 border-l-[3px] border-[#E24B4A] bg-[#fff1f1] px-6 py-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#E24B4A]" />
            <p className="text-xs text-[#c24646]">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-auto text-[11px] text-[#c24646] underline"
            >
              See logs
            </button>
          </div>
        ) : null}

        <div className="mt-5 overflow-hidden rounded-[28px] border border-[#f0e2b2] bg-[#fffdf8] shadow-[0_20px_60px_rgba(180,144,34,0.10)] xl:grid xl:grid-cols-[300px_minmax(0,1fr)] xl:items-start">
          <Sidebar
            platforms={sidebarPlatforms}
            totalSelectedAccounts={totalSelectedAccounts}
            totalAccounts={totalAccounts}
            groupName={groupName}
            accountGroups={accountGroups}
            onGroupNameChange={setGroupName}
            onSaveGroup={handleSaveGroup}
            onApplyGroup={handleApplyGroup}
            onRemoveGroup={handleRemoveGroup}
            onSelectAll={toggleAllGlobalAccounts}
            onPlatformToggle={setPlatformEnabled}
            onSelectAllAccounts={toggleAllAccounts}
            onAccountToggle={toggleAccount}
          />

          <div className="space-y-6 xl:border-l xl:border-[#f0e2b2]">
            <PostEditor
              caption={caption}
              hashtags={hashtags}
              mentions={mentions}
              altText={altText}
              media={media}
              selectedMediaIds={selectedMediaIds}
              selectedPlatforms={selectedPlatforms}
              previewEnabled={previewEnabled}
              aiPanelOpen={aiPanelOpen}
              uploading={uploading}
              onCaptionChange={setCaption}
              onHashtagsChange={setHashtags}
              onMentionsChange={setMentions}
              onAltTextChange={setAltText}
              onMediaSelectionToggle={(mediaId, enabled) =>
                setSelectedMediaIds((current) =>
                  enabled ? dedupeNumberList([...current, mediaId]) : current.filter((id) => id !== mediaId),
                )
              }
              onFilesSelected={handleFilesSelected}
              onPreviewToggle={() => setPreviewEnabled((current) => !current)}
              onAiPanelToggle={() => setAiPanelOpen((current) => !current)}
              onApplyAiAssist={applyAiAssist}
            />

            <PlatformSettings
              selectedPlatforms={selectedPlatforms}
              selectedAccounts={selectedAccounts}
              platformConfigs={platformConfigs}
              accountsByPlatform={accountsByPlatform}
              expandedPlatforms={expandedPlatforms}
              onToggleExpand={(platform) =>
                setExpandedPlatforms((current) => ({
                  ...current,
                  [platform]: !(current[platform] ?? true),
                }))
              }
              onConfigChange={updatePlatformConfig}
            />
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#f0e2b2] bg-[rgba(255,251,240,0.96)] backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] justify-end gap-2.5 px-6 py-3">
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="rounded-xl border border-[#eadba6] bg-[#fffef9] px-[18px] py-[9px] text-[13px] font-medium text-[#1f2937] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#d8c36e] hover:text-[#111111]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="rounded-xl bg-[#F5C800] px-5 py-[9px] text-[13px] font-medium text-[#111111] shadow-[0_10px_24px_rgba(245,200,0,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#E6BE3A] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creating..." : "Create Post"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
