"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPost, fetchAccounts, fetchMedia, uploadMedia } from "@/lib/api";
import { Account, MediaAsset, PlatformName } from "@/lib/types";

type Props = { open: boolean; onClose: () => void };
type Config = {
  enabled: boolean; accountId: number | null; instagramFirstComment: string; instagramMode: string;
  linkedinVisibility: string; twitterReplySettings: string; youtubeTitle: string;
  youtubePrivacy: string; youtubeTags: string; facebookPostAsReel: boolean;
};

const platforms: PlatformName[] = ["facebook", "instagram", "linkedin", "twitter", "youtube", "blogger", "google_business", "wordpress"];
const labels: Record<PlatformName, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  twitter: "X / Twitter",
  youtube: "YouTube",
  blogger: "Blogger",
  google_business: "Google Business",
  wordpress: "WordPress",
};
const descriptions: Record<PlatformName, string> = {
  facebook: "Pages and Meta-connected publishing",
  instagram: "Feed and reel publishing",
  linkedin: "Professional and company updates",
  twitter: "Fast campaign updates and threads",
  youtube: "Video publishing through Google",
  blogger: "Text-first blog publishing",
  google_business: "Business profile updates",
  wordpress: "Website article publishing",
};

const emptyConfig = (): Config => ({
  enabled: false, accountId: null, instagramFirstComment: "", instagramMode: "feed",
  linkedinVisibility: "PUBLIC", twitterReplySettings: "everyone", youtubeTitle: "",
  youtubePrivacy: "private", youtubeTags: "", facebookPostAsReel: false,
});

function normalizeTags(value: string, prefix: "#" | "@") {
  return value.split(",").map((item) => item.trim()).filter(Boolean).map((item) => item.startsWith(prefix) ? item : `${prefix}${item}`).join(" ");
}

function platformPayload(platform: PlatformName, config: Config) {
  if (platform === "facebook") return { facebook: { post_as_reel: config.facebookPostAsReel } };
  if (platform === "instagram") return { instagram: { caption_mode: config.instagramMode, first_comment: config.instagramFirstComment || null } };
  if (platform === "linkedin") return { linkedin: { visibility: config.linkedinVisibility } };
  if (platform === "twitter") return { twitter: { reply_settings: config.twitterReplySettings } };
  if (platform === "blogger") return { blogger: {} };
  if (platform === "google_business") return { google_business: {} };
  if (platform === "wordpress") return { wordpress: {} };
  return {
    youtube: {
      title: config.youtubeTitle || null,
      privacyStatus: config.youtubePrivacy,
      tags: config.youtubeTags.split(",").map((tag) => tag.trim()).filter(Boolean),
    },
  };
}

export function PostComposerModal({ open, onClose }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [mentions, setMentions] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [altText, setAltText] = useState("");
  const [selectedMediaIds, setSelectedMediaIds] = useState<number[]>([]);
  const [activePlatform, setActivePlatform] = useState<PlatformName | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [configs, setConfigs] = useState<Record<PlatformName, Config>>({
    facebook: emptyConfig(), instagram: emptyConfig(), linkedin: emptyConfig(), twitter: emptyConfig(), youtube: emptyConfig(), blogger: emptyConfig(), google_business: emptyConfig(), wordpress: emptyConfig(),
  });

  useEffect(() => {
    async function load() {
      const [accountData, mediaData] = await Promise.all([fetchAccounts(), fetchMedia()]);
      const activeAccounts = accountData.filter((account) => account.is_active);
      setAccounts(activeAccounts);
      setMedia(mediaData);
      setConfigs((current) => {
        const next = { ...current };
        for (const platform of platforms) {
          next[platform] = { ...next[platform], accountId: next[platform].accountId ?? activeAccounts.find((account) => account.platform === platform)?.id ?? null };
        }
        return next;
      });
    }
    if (open) { void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Failed to load composer.")); }
  }, [open]);

  const accountsByPlatform = useMemo(() => platforms.reduce<Record<PlatformName, Account[]>>((acc, platform) => {
    acc[platform] = accounts.filter((account) => account.platform === platform);
    return acc;
  }, {} as Record<PlatformName, Account[]>), [accounts]);

  if (!open) return null;

  function updateConfig(platform: PlatformName, patch: Partial<Config>) {
    setConfigs((current) => ({ ...current, [platform]: { ...current[platform], ...patch } }));
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fileInput = event.currentTarget.elements.namedItem("mediaFile") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) return setError("Choose a media file before uploading.");
    try {
      setUploading(true); setError(null); setMessage(null);
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
    if (!selectedPlatforms.length) return setError("Select at least one platform.");
    try {
      setSubmitting(true); setError(null); setMessage(null);
      const content = [caption.trim(), normalizeTags(hashtags, "#"), normalizeTags(mentions, "@")].filter(Boolean).join("\n\n");
      const results = await Promise.all(selectedPlatforms.map((platform) => createPost({
        social_account_id: configs[platform].accountId as number,
        content,
        scheduled_at: scheduledAt || null,
        media_ids: selectedMediaIds,
        platform_options: platformPayload(platform, configs[platform]),
      })));
      setMessage(`${results.length} post${results.length > 1 ? "s" : ""} created successfully.`);
      setCaption(""); setHashtags(""); setMentions(""); setScheduledAt(""); setSelectedMediaIds([]);
      setConfigs((current) => Object.fromEntries(platforms.map((platform) => [platform, { ...current[platform], enabled: false }])) as Record<PlatformName, Config>);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Post creation failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-shell" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <div>
              <h2 className="section-title">Create Social Post</h2>
              <p className="section-copy" style={{ marginBottom: 0 }}>Upload media, write the main content, then enable only the platforms you want to publish.</p>
            </div>
            <button
              className="modal-close"
              onClick={onClose}
              type="button"
              aria-label="Close composer"
            >
              x
            </button>
          </div>
          <div className="modal-body">
            {message ? <div className="banner success">{message}</div> : null}
            {error ? <div className="banner error">{error}</div> : null}
            <div className="form-grid">
              <div className="modal-grid">
                <div className="form-grid">
                  <div className="subsection">
                    <h3>Campaign content</h3>
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor="caption">Caption</label>
                        <textarea id="caption" value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Write the main caption or campaign copy." />
                      </div>
                      <div className="field-row">
                        <div className="field">
                          <label htmlFor="hashtags">Hashtags</label>
                          <input id="hashtags" value={hashtags} onChange={(event) => setHashtags(event.target.value)} placeholder="crm, marketing, automation" type="text" />
                        </div>
                        <div className="field">
                          <label htmlFor="mentions">Mentions</label>
                          <input id="mentions" value={mentions} onChange={(event) => setMentions(event.target.value)} placeholder="snapkey, brandname" type="text" />
                        </div>
                      </div>
                      <div className="field">
                        <label htmlFor="schedule">Schedule time</label>
                        <input id="schedule" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} type="datetime-local" />
                      </div>
                    </div>
                  </div>
                  <div className="subsection">
                    <h3>Select platforms</h3>
                    <div className="checkbox-grid">
                      {platforms.map((platform) => {
                        const hasAccounts = accountsByPlatform[platform].length > 0;
                        return (
                          <div key={platform} className={`select-card${configs[platform].enabled ? " active" : ""}${!hasAccounts ? " disabled" : ""}`}>
                            <input type="checkbox" checked={configs[platform].enabled} onChange={(event) => updateConfig(platform, { enabled: event.target.checked })} />
                            <div className="select-card-main">
                              <div>
                                <strong>{labels[platform]}</strong>
                                <div className="meta">{descriptions[platform]}</div>
                                <div className="helper-text">{hasAccounts ? `${accountsByPlatform[platform].length} connected account(s)` : "No connected account"}</div>
                              </div>
                              {hasAccounts ? <button className="btn ghost" onClick={() => setActivePlatform(platform)} type="button">Settings</button> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <aside className="composer-sidebar">
                  <div className="subsection">
                    <h3>Media upload</h3>
                    <form className="form-grid" onSubmit={handleUpload}>
                      <div className="field">
                        <label htmlFor="mediaFile">Media file</label>
                        <input id="mediaFile" name="mediaFile" type="file" />
                      </div>
                      <div className="field">
                        <label htmlFor="altText">Alt text</label>
                        <input id="altText" value={altText} onChange={(event) => setAltText(event.target.value)} placeholder="Describe the media" type="text" />
                      </div>
                      <button className="btn secondary" disabled={uploading} type="submit">{uploading ? "Uploading..." : "Upload media"}</button>
                    </form>
                  </div>
                  <div className="subsection">
                    <h3>Attached media</h3>
                    {media.length ? <div className="media-list">
                      {media.map((asset) => (
                        <label key={asset.id} className="checkbox-card">
                          <input type="checkbox" checked={selectedMediaIds.includes(asset.id)} onChange={(event) => setSelectedMediaIds((current) => event.target.checked ? [...current, asset.id] : current.filter((item) => item !== asset.id))} />
                          <div><strong>#{asset.id} {asset.file_type}</strong><div className="meta">{asset.alt_text || asset.file_url}</div></div>
                        </label>
                      ))}
                    </div> : <div className="empty">No media uploaded yet.</div>}
                  </div>
                </aside>
              </div>
              <div className="cta-row">
                <button className="btn primary" disabled={submitting} onClick={() => void handleSubmit()} type="button">{submitting ? "Creating..." : "Create posts"}</button>
                <button className="btn ghost" onClick={onClose} type="button">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {activePlatform ? <div className="modal-backdrop" onClick={() => setActivePlatform(null)}>
        <div className="modal-shell small" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <div><h2 className="section-title">{labels[activePlatform]} settings</h2><p className="section-copy" style={{ marginBottom: 0 }}>Choose the account and platform-specific values.</p></div>
            <button
              className="modal-close"
              onClick={() => setActivePlatform(null)}
              type="button"
              aria-label="Close platform settings"
            >
              x
            </button>
          </div>
          <div className="modal-body">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="platformAccount">Connected account</label>
                <select id="platformAccount" value={configs[activePlatform].accountId ?? ""} onChange={(event) => updateConfig(activePlatform, { accountId: Number(event.target.value) })}>
                  {accountsByPlatform[activePlatform].map((account) => <option key={account.id} value={account.id}>{account.account_name}</option>)}
                </select>
              </div>
              {activePlatform === "facebook" ? <label className="checkbox-card"><input type="checkbox" checked={configs.facebook.facebookPostAsReel} onChange={(event) => updateConfig("facebook", { facebookPostAsReel: event.target.checked })} /><div><strong>Publish as reel</strong><div className="meta">Store reel intent for Facebook publishing.</div></div></label> : null}
              {activePlatform === "instagram" ? <>
                <div className="field"><label htmlFor="instagramMode">Publish format</label><select id="instagramMode" value={configs.instagram.instagramMode} onChange={(event) => updateConfig("instagram", { instagramMode: event.target.value })}><option value="feed">Feed post</option><option value="reel">Reel</option></select></div>
                <div className="field"><label htmlFor="instagramComment">First comment</label><input id="instagramComment" value={configs.instagram.instagramFirstComment} onChange={(event) => updateConfig("instagram", { instagramFirstComment: event.target.value })} type="text" /></div>
              </> : null}
              {activePlatform === "linkedin" ? <div className="field"><label htmlFor="linkedinVisibility">Visibility</label><select id="linkedinVisibility" value={configs.linkedin.linkedinVisibility} onChange={(event) => updateConfig("linkedin", { linkedinVisibility: event.target.value })}><option value="PUBLIC">Public</option><option value="CONNECTIONS">Connections</option></select></div> : null}
              {activePlatform === "twitter" ? <div className="field"><label htmlFor="twitterReplies">Reply permissions</label><select id="twitterReplies" value={configs.twitter.twitterReplySettings} onChange={(event) => updateConfig("twitter", { twitterReplySettings: event.target.value })}><option value="everyone">Everyone</option><option value="mentionedUsers">Mentioned users</option><option value="following">Following only</option></select></div> : null}
              {activePlatform === "youtube" ? <>
                <div className="field"><label htmlFor="youtubeTitle">Video title</label><input id="youtubeTitle" value={configs.youtube.youtubeTitle} onChange={(event) => updateConfig("youtube", { youtubeTitle: event.target.value })} type="text" /></div>
                <div className="field"><label htmlFor="youtubePrivacy">Privacy</label><select id="youtubePrivacy" value={configs.youtube.youtubePrivacy} onChange={(event) => updateConfig("youtube", { youtubePrivacy: event.target.value })}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></div>
                <div className="field"><label htmlFor="youtubeTags">Tags</label><input id="youtubeTags" value={configs.youtube.youtubeTags} onChange={(event) => updateConfig("youtube", { youtubeTags: event.target.value })} placeholder="education, crm, launch" type="text" /></div>
              </> : null}
              <button className="btn primary" onClick={() => setActivePlatform(null)} type="button">Save settings</button>
            </div>
          </div>
        </div>
      </div> : null}
    </>
  );
}
