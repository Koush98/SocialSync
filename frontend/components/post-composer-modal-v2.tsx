"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { ErrorNotice } from "@/components/error-notice";
import { createPost, fetchAccounts, fetchMedia, uploadMedia } from "@/lib/api";
import { Account, MediaAsset, PlatformName } from "@/lib/types";
import { PlatformLogo } from "@/components/platform-logo";

type Props = { open: boolean; onClose: () => void; onCreated?: () => Promise<void> | void };

// Loading spinner component
function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };
  return (
    <div className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${sizeClasses[size]}`} role="status" aria-label="loading">
      <span className="sr-only">Loading...</span>
    </div>
  );
}

// Animated checkmark for success
function SuccessIcon() {
  return (
    <svg className="h-5 w-5 animate-bounce text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

// Platform icon with hover animation
function PlatformIcon({ platform, enabled }: { platform: PlatformName; enabled: boolean }) {
  return (
    <div className={`transition-transform duration-200 ${enabled ? "scale-110" : "group-hover:scale-105"}`}>
      <PlatformLogo platform={platform} className="h-6 w-6" />
    </div>
  );
}
type Config = {
  enabled: boolean;
  accountId: number | null;
  scheduledAt: string;
  instagramFirstComment: string;
  instagramMode: string;
  linkedinVisibility: string;
  twitterReplySettings: string;
  youtubeTitle: string;
  youtubeDescription: string;
  youtubePrivacy: string;
  youtubeTags: string;
  youtubeMadeForKids: boolean;
  youtubeCategoryId: string;
  youtubeDefaultLanguage: string;
  youtubeNotifySubscribers: boolean;
  youtubeEmbeddable: boolean;
  youtubeLicense: string;
  youtubePublicStatsViewable: boolean;
  facebookLink: string;
  facebookVideoTitle: string;
};

const platforms: PlatformName[] = ["facebook", "instagram", "linkedin", "twitter", "youtube", "blogger", "google_business", "wordpress"];
const labels: Record<PlatformName, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  youtube: "YouTube",
  blogger: "Blogger",
  google_business: "Google Business",
  wordpress: "WordPress",
};

const platformTone: Record<PlatformName, string> = {
  facebook: "bg-[#edf3ff] text-[#315ed2]",
  instagram: "bg-[#fff0f7] text-[#c13982]",
  linkedin: "bg-[#eef7ff] text-[#0f6ab8]",
  twitter: "bg-[#171717] text-white",
  youtube: "bg-[#fff1ef] text-[#d8342b]",
  blogger: "bg-[#fff2e8] text-[#ef6c00]",
  google_business: "bg-[#eef5ff] text-[#1a73e8]",
  wordpress: "bg-[#f0f3f5] text-[#1f2933]",
};

const descriptions: Record<PlatformName, string> = {
  facebook: "Pages and Meta-connected publishing",
  instagram: "Feed and reel publishing",
  linkedin: "Professional profile updates",
  twitter: "Text-first campaign updates",
  youtube: "Video publishing through Google",
  blogger: "Blogger article publishing",
  google_business: "Business profile local posts",
  wordpress: "Website article publishing",
};

const emptyConfig = (): Config => ({
  enabled: false,
  accountId: null,
  scheduledAt: "",
  instagramFirstComment: "",
  instagramMode: "feed",
  linkedinVisibility: "PUBLIC",
  twitterReplySettings: "everyone",
  youtubeTitle: "",
  youtubeDescription: "",
  youtubePrivacy: "private",
  youtubeTags: "",
  youtubeMadeForKids: false,
  youtubeCategoryId: "",
  youtubeDefaultLanguage: "",
  youtubeNotifySubscribers: true,
  youtubeEmbeddable: true,
  youtubeLicense: "youtube",
  youtubePublicStatsViewable: true,
  facebookLink: "",
  facebookVideoTitle: "",
});

function dedupeIds(values: number[]) {
  return [...new Set(values)];
}

function getYoutubeMediaState(selectedAssets: MediaAsset[]) {
  if (!selectedAssets.length) {
    return { valid: false, message: "YouTube requires one uploaded video." };
  }
  if (selectedAssets.length !== 1) {
    return { valid: false, message: "YouTube supports exactly one media item, and it must be a video." };
  }
  if (selectedAssets[0].file_type !== "video") {
    return { valid: false, message: "YouTube media must be a video file." };
  }
  return { valid: true, message: "Ready for YouTube publishing." };
}

function getPlatformMediaState(platform: PlatformName, selectedAssets: MediaAsset[]) {
  const imageCount = selectedAssets.filter((asset) => asset.file_type === "image").length;
  const videoCount = selectedAssets.filter((asset) => asset.file_type === "video").length;
  const otherCount = selectedAssets.length - imageCount - videoCount;

  if (platform === "facebook") {
    if (!selectedAssets.length) return { valid: true, message: "Text, single image, single video, or multi-image carousel." };
    if (otherCount) return { valid: false, message: "Facebook supports image and video assets only." };
    if (videoCount > 1 || (videoCount && imageCount)) {
      return { valid: false, message: "Facebook supports one video or an image set, but not mixed media." };
    }
    return { valid: true, message: videoCount ? "Ready for a Facebook video post." : imageCount > 1 ? "Ready for a Facebook image set." : "Ready for a Facebook image post." };
  }

  if (platform === "instagram") {
    if (!selectedAssets.length) return { valid: false, message: "Instagram requires at least one image or video." };
    if (selectedAssets.length > 10) {
      return { valid: false, message: "Instagram carousel supports maximum 10 media items." };
    }
    if (otherCount) {
      return { valid: false, message: "Instagram supports image and video assets only." };
    }
    // Check if all same type for carousel
    if (selectedAssets.length > 1) {
      const types = new Set(selectedAssets.map(a => a.file_type));
      if (types.size > 1) {
        return { valid: false, message: "Instagram carousel must contain same media type (all images or all videos)." };
      }
    }
    const isCarousel = selectedAssets.length > 1;
    return { valid: true, message: isCarousel ? `Ready for Instagram carousel (${selectedAssets.length} items).` : videoCount ? "Ready for an Instagram video/reel." : "Ready for an Instagram image post." };
  }

  if (platform === "linkedin") {
    if (!selectedAssets.length) return { valid: true, message: "Text, one image, or one video." };
    if (selectedAssets.length !== 1 || otherCount) {
      return { valid: false, message: "LinkedIn supports one image or one video per post." };
    }
    return { valid: true, message: videoCount ? "Ready for a LinkedIn video post." : "Ready for a LinkedIn image post." };
  }

  if (platform === "twitter") {
    if (!selectedAssets.length) return { valid: true, message: "Text, up to 4 images, or one video." };
    if (otherCount) return { valid: false, message: "X supports image and video assets only." };
    if (videoCount > 1 || (videoCount === 1 && imageCount > 0)) {
      return { valid: false, message: "X supports either a single video or up to 4 images." };
    }
    if (imageCount > 4) return { valid: false, message: "X supports up to 4 images per post." };
    return { valid: true, message: videoCount ? "Ready for an X video post." : `Ready for an X image post (${imageCount}/4).` };
  }

  if (platform === "blogger") {
    if (!selectedAssets.length) return { valid: true, message: "Ready for a text Blogger article." };
    if (otherCount) return { valid: false, message: "Blogger supports image and video assets only." };
    return { valid: true, message: "Ready for a Blogger article with media." };
  }

  if (platform === "google_business") {
    if (!selectedAssets.length) return { valid: true, message: "Ready for a text Google Business update." };
    if (otherCount) return { valid: false, message: "Google Business supports image and video assets only." };
    if (selectedAssets.length > 1) return { valid: false, message: "Google Business supports one media item per post." };
    return { valid: true, message: videoCount ? "Ready for a Google Business video update." : "Ready for a Google Business photo update." };
  }

  if (platform === "wordpress") {
    if (otherCount) return { valid: false, message: "WordPress supports image and video assets only." };
    return { valid: true, message: selectedAssets.length ? "Ready for a WordPress article with media." : "Ready for a WordPress article." };
  }

  return getYoutubeMediaState(selectedAssets);
}

function normalizeTags(value: string, prefix: "#" | "@") {
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

function formatLocalSchedule(value: string) {
  if (!value) return "Publish immediately";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function platformPayload(platform: PlatformName, config: Config) {
  if (platform === "facebook") {
    return {
      facebook: {
        link: config.facebookLink || null,
        title: config.facebookVideoTitle || null,
      },
    };
  }
  if (platform === "instagram") {
    return { instagram: { caption_mode: config.instagramMode, first_comment: config.instagramFirstComment || null } };
  }
  if (platform === "linkedin") return { linkedin: { visibility: config.linkedinVisibility } };
  if (platform === "twitter") return { twitter: { reply_settings: config.twitterReplySettings } };
  if (platform === "blogger") return { blogger: {} };
  if (platform === "google_business") return { google_business: {} };
  if (platform === "wordpress") return { wordpress: {} };
  return {
    youtube: {
      title: config.youtubeTitle || null,
      description: config.youtubeDescription || null,
      privacyStatus: config.youtubePrivacy,
      tags: config.youtubeTags.split(",").map((tag) => tag.trim()).filter(Boolean),
      madeForKids: config.youtubeMadeForKids,
      categoryId: config.youtubeCategoryId || null,
      defaultLanguage: config.youtubeDefaultLanguage || null,
      notifySubscribers: config.youtubeNotifySubscribers,
      embeddable: config.youtubeEmbeddable,
      license: config.youtubeLicense,
      publicStatsViewable: config.youtubePublicStatsViewable,
    },
  };
}

function initials(label: string) {
  return label.slice(0, 2).toUpperCase();
}

function normalizePlatform(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function formatAccountTypeLabel(accountType: string | null | undefined) {
  switch (accountType) {
    case "personal_profile":
      return "Profile";
    case "organization":
      return "Organization page";
    case "business_or_creator":
      return "Professional account";
    case "blog":
      return "Blog";
    case "business_location":
      return "Business location";
    case "wordpress_site":
      return "WordPress site";
    default:
      return accountType?.replace(/_/g, " ") ?? "Connected account";
  }
}

export function PostComposerModal({ open, onClose, onCreated }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [mentions, setMentions] = useState("");
  const [altText, setAltText] = useState("");
  const [selectedMediaIds, setSelectedMediaIds] = useState<number[]>([]);
  const [activePlatform, setActivePlatform] = useState<PlatformName>("twitter");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [configs, setConfigs] = useState<Record<PlatformName, Config>>({
    facebook: emptyConfig(),
    instagram: emptyConfig(),
    linkedin: emptyConfig(),
    twitter: emptyConfig(),
    youtube: emptyConfig(),
    blogger: emptyConfig(),
    google_business: emptyConfig(),
    wordpress: emptyConfig(),
  });

  useEffect(() => {
    async function load() {
      const [accountData, mediaData] = await Promise.all([fetchAccounts(), fetchMedia()]);
      const activeAccounts = accountData.filter((account) => account.is_active);
      setAccounts(activeAccounts);
      setMedia(mediaData);
      setMessage(null);
      setError(null);
      setConfigs((current) => {
        const next = { ...current };
        for (const platform of platforms) {
          next[platform] = {
            ...next[platform],
            accountId:
              next[platform].accountId ??
              activeAccounts.find((account) => normalizePlatform(account.platform) === platform)?.id ??
              null,
          };
        }
        return next;
      });

      const firstPlatformWithAccount = platforms.find(
        (platform) => activeAccounts.some((account) => normalizePlatform(account.platform) === platform),
      );
      if (firstPlatformWithAccount) {
        setActivePlatform(firstPlatformWithAccount);
      }
    }

    if (open) {
      void load().catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "Failed to load composer."),
      );
    }
  }, [open]);

  const accountsByPlatform = useMemo(
    () =>
      platforms.reduce<Record<PlatformName, Account[]>>((acc, platform) => {
        acc[platform] = accounts.filter((account) => normalizePlatform(account.platform) === platform);
        return acc;
      }, {} as Record<PlatformName, Account[]>),
    [accounts],
  );
  const selectedAssets = useMemo(
    () => media.filter((asset) => selectedMediaIds.includes(asset.id)),
    [media, selectedMediaIds],
  );
  const mediaStateByPlatform = useMemo(
    () =>
      platforms.reduce<Record<PlatformName, { valid: boolean; message: string }>>((acc, platform) => {
        acc[platform] = getPlatformMediaState(platform, selectedAssets);
        return acc;
      }, {} as Record<PlatformName, { valid: boolean; message: string }>),
    [selectedAssets],
  );

  if (!open) return null;

  function updateConfig(platform: PlatformName, patch: Partial<Config>) {
    setConfigs((current) => ({ ...current, [platform]: { ...current[platform], ...patch } }));
  }

  function handlePlatformToggle(platform: PlatformName, enabled: boolean) {
    const mediaState = mediaStateByPlatform[platform];
    if (enabled && !mediaState.valid) {
      setError(mediaState.message);
      setActivePlatform(platform);
      return;
    }

    updateConfig(platform, { enabled });
  }

  function validateBeforeSubmit(selectedPlatforms: PlatformName[]) {
    const content = [caption.trim(), normalizeTags(hashtags, "#"), normalizeTags(mentions, "@")]
      .filter(Boolean)
      .join("\n\n");

    const mediaCount = selectedAssets.length;
    const hasVideo = selectedAssets.some((asset) => asset.file_type === "video");
    const hasNonVideo = selectedAssets.some((asset) => asset.file_type !== "video");

    for (const platform of selectedPlatforms) {
      if ((platform === "twitter" || platform === "linkedin") && !content.trim() && mediaCount === 0) {
        return `${labels[platform]} requires text or media.`;
      }

      if (platform === "facebook") {
        if (mediaCount > 1 && hasVideo) {
          return "Facebook supports one video or an image set, but not mixed media.";
        }
      }

      if (platform === "instagram") {
        if (mediaCount < 1 || mediaCount > 10) {
          return "Instagram requires 1-10 media items (carousel supports up to 10).";
        }
        // Check if all same type for carousel
        if (mediaCount > 1) {
          const types = new Set(selectedAssets.map((a: MediaAsset) => a.file_type));
          if (types.size > 1) {
            return "Instagram carousel must contain same media type (all images or all videos).";
          }
        }
        if (configs.instagram.instagramMode === "reel") {
          const reelVideos = selectedAssets.filter((asset) => asset.file_type === "video").length;
          if (mediaCount !== 1 || reelVideos !== 1) {
            return "Instagram Reel mode requires exactly one video asset.";
          }
        }
      }

      if (platform === "linkedin") {
        if (mediaCount > 1) {
          return "LinkedIn supports one image or one video per post.";
        }
      }

      if (platform === "twitter") {
        if (mediaCount > 4) {
          return "X supports up to 4 images or one video.";
        }
        if (selectedAssets.filter((asset) => asset.file_type === "video").length > 1 || (hasVideo && selectedAssets.some((asset) => asset.file_type === "image"))) {
          return "X supports either a single video or up to 4 images.";
        }
      }

      if (platform === "youtube") {
        if (!configs.youtube.youtubeTitle.trim()) {
          return "YouTube requires a video title.";
        }
        if (mediaCount !== 1) {
          return "YouTube requires exactly one uploaded video.";
        }
        if (!hasVideo || hasNonVideo) {
          return "YouTube post media must be a single video file.";
        }
      }

      if (platform === "blogger" || platform === "google_business" || platform === "wordpress") {
        if (platform === "wordpress" && !content.trim() && mediaCount === 0) {
          return `${labels[platform]} requires text or media content.`;
        }
        if ((platform === "blogger" || platform === "google_business") && !content.trim() && mediaCount === 0) {
          return `${labels[platform]} requires text or media content.`;
        }
        if (platform === "google_business" && mediaCount > 1) {
          return "Google Business supports one image or one video per post.";
        }
        if (
          platform === "wordpress" &&
          selectedAssets.some((asset) => asset.file_type !== "image" && asset.file_type !== "video")
        ) {
          return "WordPress supports image and video assets only.";
        }
      }
    }

    return null;
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fileInput = event.currentTarget.elements.namedItem("mediaFile") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) {
      setError("Choose a media file before uploading.");
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setMessage(null);
      const formData = new FormData();
      formData.append("file", file);
      if (altText.trim()) formData.append("alt_text", altText.trim());
      const uploaded = await uploadMedia(formData);
      setMedia((current) => [uploaded, ...current]);
      setSelectedMediaIds((current) => [uploaded.id, ...current]);
      setAltText("");
      event.currentTarget.reset();
      setMessage("Media uploaded and attached to this draft.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    const selectedPlatforms = platforms.filter((platform) => configs[platform].enabled && configs[platform].accountId);
    if (!selectedPlatforms.length) {
      setError("Select at least one platform.");
      return;
    }

    const validationError = validateBeforeSubmit(selectedPlatforms);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setMessage(null);
      const content = [caption.trim(), normalizeTags(hashtags, "#"), normalizeTags(mentions, "@")]
        .filter(Boolean)
        .join("\n\n");

      await Promise.all(
        selectedPlatforms.map((platform) =>
          createPost({
            social_account_id: configs[platform].accountId as number,
            content,
            scheduled_at: toUtcIsoString(configs[platform].scheduledAt),
            media_ids: selectedMediaIds,
            platform_options: platformPayload(platform, configs[platform]),
          }),
        ),
      );

      setMessage(`${selectedPlatforms.length} post${selectedPlatforms.length > 1 ? "s" : ""} created successfully.`);
      setCaption("");
      setHashtags("");
      setMentions("");
      setSelectedMediaIds([]);
      setConfigs((current) =>
        Object.fromEntries(
          platforms.map((platform) => [
            platform,
            {
              ...current[platform],
              enabled: false,
              scheduledAt: "",
            },
          ]),
        ) as Record<PlatformName, Config>,
      );
      await onCreated?.();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Post creation failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedPlatformAccounts = accountsByPlatform[activePlatform];
  const config = configs[activePlatform];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,20,0.45)] p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative flex max-h-[94vh] w-full max-w-[1240px] overflow-hidden rounded-[34px] border border-white/70 bg-white shadow-[0_30px_80px_rgba(18,18,18,0.22)] animate-slide-up">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex items-start justify-between border-b border-[#f0e6d5] px-6 py-5 sm:px-8">
            <div>
              <p className="mb-1 text-sm font-medium text-[#b3892d] flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-brand-400 animate-pulse"></span>
                Create Post
              </p>
              <h2 className="font-display text-3xl font-semibold tracking-[-0.06em] text-ink-900">What&apos;s on your mind?</h2>
              <p className="mt-2 text-sm text-ink-600">Share updates, upload media, and tailor the post for each connected platform.</p>
            </div>
            <button 
              type="button" 
              onClick={onClose} 
              className="secondary-button h-11 w-11 rounded-2xl p-0 text-xl font-bold transition-all duration-200 hover:rotate-90 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:rotate-0"
              aria-label="Close modal"
            >
              ×
            </button>
          </div>

          <div className="grid flex-1 gap-6 px-6 py-6 sm:px-8 xl:grid-cols-[1.35fr_0.95fr]">
            <div className="space-y-5">
              {message ? (
                <div className="rounded-2xl border border-[#d7e9c0] bg-[#f7fbef] px-4 py-4 text-sm text-[#53722c] flex items-center gap-3 animate-fade-in shadow-sm">
                  <SuccessIcon />
                  <span className="font-medium">{message}</span>
                </div>
              ) : null}
              {error ? <ErrorNotice error={error} fallback="We couldn't create those posts right now." /> : null}

              <div className="soft-panel p-5">
                <label className="mb-3 block text-sm font-semibold text-ink-900">Caption</label>
                <textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Write your core post once, then tune each platform in the settings panel." className="field-input min-h-[140px] resize-none" />
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <input value={hashtags} onChange={(event) => setHashtags(event.target.value)} placeholder="hashtags" className="field-input" />
                  <input value={mentions} onChange={(event) => setMentions(event.target.value)} placeholder="mentions" className="field-input" />
                </div>
                <div className="mt-4 rounded-[22px] border border-[#ece2d2] bg-white px-4 py-3 text-sm text-ink-600">
                  Scheduling is now set per platform in the right-side settings panel so each channel can publish at its own time.
                </div>
              </div>

              <div className="soft-panel p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-ink-900">Media</h3>
                    <p className="text-sm text-ink-600">Upload once and attach across channels.</p>
                  </div>
                </div>
                <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={handleUpload}>
                  <input id="mediaFile" name="mediaFile" type="file" className="field-input file:mr-3 file:rounded-full file:border-0 file:bg-brand-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink-900 hover:file:bg-brand-200 transition-colors duration-150" />
                  <input value={altText} onChange={(event) => setAltText(event.target.value)} placeholder="Alt text (optional)" className="field-input" />
                  <button 
                    type="submit" 
                    disabled={uploading} 
                    className="secondary-button h-[52px] px-6 flex items-center gap-2 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {uploading ? (
                      <>
                        <LoadingSpinner size="sm" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <span>Upload</span>
                    )}
                  </button>
                </form>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {media.length ? media.map((asset) => {
                    const selected = selectedMediaIds.includes(asset.id);
                    return (
                      <label 
                        key={asset.id} 
                        className={`group flex cursor-pointer items-start gap-3 rounded-[22px] border p-4 transition-all duration-200 ${selected ? "border-brand-300 bg-brand-50 shadow-md ring-2 ring-brand-200/50 scale-[1.02]" : "border-[#ebdfcf] bg-white hover:border-brand-200 hover:shadow-lg hover:-translate-y-0.5"}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) =>
                            setSelectedMediaIds((current) =>
                              event.target.checked
                                ? dedupeIds([...current, asset.id])
                                : current.filter((item) => item !== asset.id),
                            )
                          }
                          className="mt-1 h-5 w-5 rounded border-gray-300 text-brand-500 focus:ring-brand-400 transition duration-150 cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-ink-900 group-hover:text-brand-700 transition-colors duration-150">#{asset.id} {asset.file_type}</div>
                          <div className="mt-1 line-clamp-2 text-xs leading-5 text-ink-600">{asset.alt_text || asset.file_url}</div>
                        </div>
                      </label>
                    );
                  }) : (
                    <div className="rounded-[22px] border-2 border-dashed border-[#e5dbc8] bg-gradient-to-br from-[#faf6ef] to-[#fff6de] px-4 py-12 text-center transition-all duration-200 hover:border-brand-300 hover:from-[#fff9e9] hover:to-[#fffaf0]">
                      <div className="text-4xl mb-3">📁</div>
                      <div className="text-sm font-medium text-ink-600">No media uploaded yet.</div>
                      <div className="text-xs text-ink-500 mt-1">Upload images or videos above to get started</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="soft-panel p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-ink-900">Select Platforms</h3>
                    <p className="text-sm text-ink-600">Enable the channels you want and click Settings to fine-tune.</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {platforms.map((platform) => {
                    const hasAccounts = accountsByPlatform[platform].length > 0;
                    const enabled = configs[platform].enabled;
                    return (
                      <div key={platform} className={`group flex flex-col cursor-pointer gap-3 rounded-[22px] border p-4 transition-all duration-200 ${enabled ? "border-brand-300 bg-[#fff9e9] shadow-md ring-2 ring-brand-200/50" : "border-[#ebdfcf] bg-white hover:border-brand-200 hover:shadow-lg hover:-translate-y-0.5"} ${!hasAccounts ? "opacity-60 cursor-not-allowed" : ""}`}>
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={!hasAccounts}
                            onChange={(event) => handlePlatformToggle(platform, event.target.checked)}
                            className="mt-1 h-5 w-5 rounded border-gray-300 text-brand-500 focus:ring-brand-400 transition duration-150 cursor-pointer"
                          />
                          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold transition-all duration-200 ${enabled ? "scale-110 shadow-md" : "group-hover:scale-105 group-hover:shadow-sm"} ${platformTone[platform]}`}>
                            <PlatformIcon platform={platform} enabled={enabled} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-semibold text-ink-900">{labels[platform]}</h4>
                              <span className={`h-2 w-2 rounded-full transition-all duration-200 ${hasAccounts ? "bg-[#8dc63f] shadow-sm" : "bg-[#d7cdbd]"}`} />
                            </div>
                            <p className="mt-0.5 text-xs text-ink-600">{descriptions[platform]}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 pl-8">
                          <div className="space-y-1">
                            <p className={`text-xs ${mediaStateByPlatform[platform].valid ? "text-[#5f7f2e]" : "text-[#b25a4f]"}`}>
                              {mediaStateByPlatform[platform].message}
                            </p>
                            {enabled ? (
                              <p className="text-[11px] text-ink-500">
                                {formatLocalSchedule(configs[platform].scheduledAt)}
                              </p>
                            ) : null}
                          </div>
                          {hasAccounts ? (
                            <button 
                              type="button" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setActivePlatform(platform);
                              }} 
                              className="secondary-button px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
                            >
                              Settings
                            </button>
                          ) : (
                            <span className="text-xs text-ink-500">No account</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button 
                  type="button" 
                  onClick={() => void handleSubmit()} 
                  disabled={submitting} 
                  className="primary-button relative px-8 py-3 text-base font-semibold transition-all duration-200 hover:shadow-xl hover:-translate-y-1 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span>Creating Posts...</span>
                    </>
                  ) : (
                    <span>Create Posts</span>
                  )}
                </button>
                <button 
                  type="button" 
                  onClick={onClose} 
                  className="secondary-button px-8 py-3 text-base font-semibold transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
                >
                  Cancel
                </button>
              </div>
            </div>

            <aside className="border-t border-[#f0e6d5] pt-6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
              <div className="rounded-[28px] border border-[#efe6d8] bg-[#fcfaf6] p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-2xl font-semibold tracking-[-0.05em] text-ink-900">
                      Settings for {labels[activePlatform]}
                    </h3>
                    <p className="mt-1 text-sm text-ink-600">Post-specific options for the selected channel.</p>
                  </div>
                </div>

                <div className="mb-4 rounded-[22px] border border-[#e8decd] bg-white px-4 py-3 text-sm text-ink-600">
                  Each enabled platform can use its own account, schedule, and publishing options here.
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-ink-900">
                      {`Post to ${labels[activePlatform]} account`}
                    </label>
                    <select
                      value={config.accountId ?? ""}
                      onChange={(event) =>
                        updateConfig(activePlatform, {
                          accountId: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                      className="field-input"
                    >
                      {!selectedPlatformAccounts.length ? <option value="">No connected account</option> : null}
                      {selectedPlatformAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.account_name}
                          {account.account_type ? ` (${formatAccountTypeLabel(account.account_type)})` : ""}
                        </option>
                      ))}
                    </select>
                    {selectedPlatformAccounts.length > 1 ? (
                      <p className="mt-2 text-xs text-ink-500">
                        Multiple accounts are connected for this platform. Choose exactly which page, profile, or channel should receive this post.
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-ink-900">Schedule for {labels[activePlatform]}</label>
                    <input
                      type="datetime-local"
                      value={config.scheduledAt}
                      onChange={(event) => updateConfig(activePlatform, { scheduledAt: event.target.value })}
                      className="field-input"
                    />
                    <p className="mt-2 text-xs text-ink-500">
                      Leave blank to publish immediately once the post is created.
                    </p>
                  </div>

                  {activePlatform === "facebook" ? (
                    <>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-ink-900">Link (optional)</label>
                        <input
                          value={configs.facebook.facebookLink}
                          onChange={(event) => updateConfig("facebook", { facebookLink: event.target.value })}
                          placeholder="https://example.com"
                          className="field-input"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-ink-900">Video title (optional)</label>
                        <input
                          value={configs.facebook.facebookVideoTitle}
                          onChange={(event) => updateConfig("facebook", { facebookVideoTitle: event.target.value })}
                          placeholder="Used when posting a video"
                          className="field-input"
                        />
                      </div>
                    </>
                  ) : null}

                  {activePlatform === "instagram" ? (
                    <>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-ink-900">Publish format</label>
                        <select value={configs.instagram.instagramMode} onChange={(event) => updateConfig("instagram", { instagramMode: event.target.value })} className="field-input">
                          <option value="feed">Feed post</option>
                          <option value="reel">Reel</option>
                        </select>
                        <p className="mt-2 text-xs text-ink-500">Reel mode requires exactly one video asset.</p>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-ink-900">First comment</label>
                        <input value={configs.instagram.instagramFirstComment} onChange={(event) => updateConfig("instagram", { instagramFirstComment: event.target.value })} className="field-input" />
                      </div>
                    </>
                  ) : null}

                  {activePlatform === "linkedin" ? (
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-ink-900">Visibility</label>
                      <select value={configs.linkedin.linkedinVisibility} onChange={(event) => updateConfig("linkedin", { linkedinVisibility: event.target.value })} className="field-input">
                        <option value="PUBLIC">Public</option>
                        <option value="CONNECTIONS">Connections</option>
                      </select>
                    </div>
                  ) : null}

                  {activePlatform === "twitter" ? (
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-ink-900">Reply permissions</label>
                      <select value={configs.twitter.twitterReplySettings} onChange={(event) => updateConfig("twitter", { twitterReplySettings: event.target.value })} className="field-input">
                        <option value="everyone">Everyone</option>
                        <option value="mentionedUsers">Mentioned users</option>
                        <option value="following">Following only</option>
                      </select>
                    </div>
                  ) : null}

                  {activePlatform === "youtube" ? (
                    <>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-ink-900">Video title</label>
                        <input value={configs.youtube.youtubeTitle} onChange={(event) => updateConfig("youtube", { youtubeTitle: event.target.value })} className="field-input" />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-ink-900">Video description</label>
                        <textarea
                          value={configs.youtube.youtubeDescription}
                          onChange={(event) => updateConfig("youtube", { youtubeDescription: event.target.value })}
                          placeholder="Optional override. Leave blank to reuse the main caption."
                          className="field-input min-h-[120px] resize-none"
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-ink-900">Privacy</label>
                          <select value={configs.youtube.youtubePrivacy} onChange={(event) => updateConfig("youtube", { youtubePrivacy: event.target.value })} className="field-input">
                            <option value="private">Private</option>
                            <option value="unlisted">Unlisted</option>
                            <option value="public">Public</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-ink-900">Category ID</label>
                            <input value={configs.youtube.youtubeCategoryId} onChange={(event) => updateConfig("youtube", { youtubeCategoryId: event.target.value })} placeholder="22" className="field-input" />
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-sm font-semibold text-ink-900">Default language</label>
                            <input
                              value={configs.youtube.youtubeDefaultLanguage}
                              onChange={(event) => updateConfig("youtube", { youtubeDefaultLanguage: event.target.value })}
                              placeholder="en"
                              className="field-input"
                            />
                          </div>
                          <div>
                            <label className="mb-2 block text-sm font-semibold text-ink-900">License</label>
                            <select
                              value={configs.youtube.youtubeLicense}
                              onChange={(event) => updateConfig("youtube", { youtubeLicense: event.target.value })}
                              className="field-input"
                            >
                              <option value="youtube">Standard YouTube License</option>
                              <option value="creativeCommon">Creative Commons</option>
                            </select>
                          </div>
                        </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-ink-900">Tags</label>
                        <input value={configs.youtube.youtubeTags} onChange={(event) => updateConfig("youtube", { youtubeTags: event.target.value })} placeholder="crm, marketing, launch" className="field-input" />
                      </div>
                      <label className="flex items-start gap-3 rounded-[22px] border border-[#ebdfcf] bg-white p-4">
                        <input type="checkbox" checked={configs.youtube.youtubeMadeForKids} onChange={(event) => updateConfig("youtube", { youtubeMadeForKids: event.target.checked })} className="mt-1" />
                        <div>
                          <div className="text-sm font-semibold text-ink-900">Made for kids</div>
                          <p className="mt-1 text-sm text-ink-600">Send the audience flag with the YouTube upload metadata.</p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3 rounded-[22px] border border-[#ebdfcf] bg-white p-4">
                        <input type="checkbox" checked={configs.youtube.youtubeNotifySubscribers} onChange={(event) => updateConfig("youtube", { youtubeNotifySubscribers: event.target.checked })} className="mt-1" />
                        <div>
                          <div className="text-sm font-semibold text-ink-900">Notify subscribers</div>
                          <p className="mt-1 text-sm text-ink-600">Control whether YouTube sends subscriber notifications for this upload.</p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3 rounded-[22px] border border-[#ebdfcf] bg-white p-4">
                        <input type="checkbox" checked={configs.youtube.youtubeEmbeddable} onChange={(event) => updateConfig("youtube", { youtubeEmbeddable: event.target.checked })} className="mt-1" />
                        <div>
                          <div className="text-sm font-semibold text-ink-900">Allow embedding</div>
                          <p className="mt-1 text-sm text-ink-600">Publish the video as embeddable on external sites.</p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3 rounded-[22px] border border-[#ebdfcf] bg-white p-4">
                        <input type="checkbox" checked={configs.youtube.youtubePublicStatsViewable} onChange={(event) => updateConfig("youtube", { youtubePublicStatsViewable: event.target.checked })} className="mt-1" />
                        <div>
                          <div className="text-sm font-semibold text-ink-900">Public stats viewable</div>
                          <p className="mt-1 text-sm text-ink-600">Let public viewers see stats when YouTube supports it.</p>
                        </div>
                      </label>
                    </>
                  ) : null}

                  <div className="rounded-[24px] border border-[#eadfce] bg-white p-4">
                    <div className="mb-2 text-sm font-semibold text-ink-900">Attached Media</div>
                    <div className="space-y-2 text-sm text-ink-600">
                      <div>{selectedMediaIds.length} media selected</div>
                      <div>{caption.length} characters in caption</div>
                      <div>{formatLocalSchedule(config.scheduledAt)}</div>
                      <div className={mediaStateByPlatform[activePlatform].valid ? "text-[#5f7f2e]" : "text-[#b25a4f]"}>
                        {mediaStateByPlatform[activePlatform].message}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex gap-3">
                  <button type="button" onClick={onClose} className="secondary-button flex-1">Cancel</button>
                  <button type="button" onClick={() => void handleSubmit()} disabled={submitting} className="primary-button flex-1">
                    Save
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
