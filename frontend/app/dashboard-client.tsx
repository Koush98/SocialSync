"use client";

import { useEffect, useMemo, useState } from "react";

import { ErrorNotice } from "@/components/error-notice";
import { PostComposerModal } from "@/components/post-composer-modal-v2";
import { beginOAuthLogin, connectWordpressSite, fetchAccounts, fetchAccountStatus, fetchPosts } from "@/lib/api";
import { getReadableError } from "@/lib/error-utils";
import { Account, AccountStatusResponse, PlatformName, Post } from "@/lib/types";

const platformMeta: Array<{ key: PlatformName; label: string; hint: string; tone: string; gradient: string }> = [
  { key: "facebook", label: "Facebook", hint: "Pages & Groups", tone: "bg-[#edf3ff] text-[#315ed2]", gradient: "from-[#1877f2]/10 to-[#4395fc]/5" },
  { key: "instagram", label: "Instagram", hint: "Business / Creator", tone: "bg-[#fff0f7] text-[#c13982]", gradient: "from-[#e1306c]/10 to-[#f77737]/5" },
  { key: "linkedin", label: "LinkedIn", hint: "Profiles & Pages", tone: "bg-[#eef7ff] text-[#0f6ab8]", gradient: "from-[#0a66c2]/10 to-[#0e76d0]/5" },
  { key: "twitter", label: "X (Twitter)", hint: "Text first", tone: "bg-[#111111] text-white", gradient: "from-[#000000]/8 to-[#222222]/4" },
  { key: "youtube", label: "YouTube", hint: "Video publishing", tone: "bg-[#fff1ef] text-[#d8342b]", gradient: "from-[#ff0000]/8 to-[#ff4e45]/4" },
  { key: "blogger", label: "Blogger", hint: "Blog publishing", tone: "bg-[#fff2e8] text-[#ef6c00]", gradient: "from-[#ef6c00]/10 to-[#ffb74d]/5" },
  { key: "google_business", label: "Google Business", hint: "Business updates", tone: "bg-[#eef5ff] text-[#1a73e8]", gradient: "from-[#1a73e8]/10 to-[#8ab4f8]/5" },
  { key: "wordpress", label: "WordPress", hint: "Website blog", tone: "bg-[#f0f3f5] text-[#1f2933]", gradient: "from-[#334e68]/10 to-[#bcccdc]/5" },
];

const emptyStatus: AccountStatusResponse = {
  facebook: { connected: false, active_accounts: 0 },
  instagram: { connected: false, active_accounts: 0 },
  linkedin: { connected: false, active_accounts: 0 },
  twitter: { connected: false, active_accounts: 0 },
  youtube: { connected: false, active_accounts: 0 },
  blogger: { connected: false, active_accounts: 0 },
  google_business: { connected: false, active_accounts: 0 },
  wordpress: { connected: false, active_accounts: 0 },
};

function normalizePlatform(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function PlatformLogo({ platform, className = "h-6 w-6" }: { platform: PlatformName; className?: string }) {
  switch (platform) {
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
          <path d="M13.6 22v-8.2h2.8l.4-3.2h-3.2V8.5c0-.9.3-1.6 1.7-1.6h1.7V4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.4v2.4H8v3.2h2.8V22h2.8Z" />
        </svg>
      );
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4.5" y="4.5" width="15" height="15" rx="4.25" />
          <circle cx="12" cy="12" r="3.6" />
          <circle cx="17.1" cy="6.9" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "linkedin":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
          <path d="M6.4 8.2a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6Zm-1.6 2.1H8v9.3H4.8v-9.3Zm5 0H13v1.3h.1c.4-.8 1.5-1.7 3-1.7 3.2 0 3.8 2.1 3.8 4.9v4.8h-3.3v-4.2c0-1 0-2.3-1.4-2.3s-1.6 1.1-1.6 2.2v4.3h-3.3v-9.3Z" />
        </svg>
      );
    case "twitter":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
          <path d="M17.8 4.5h2.7l-5.9 6.7 6.9 8.3H16l-4.2-5-4.4 5H4.7l6.3-7.2-6.6-7.9H10l3.8 4.6 4-4.5Zm-.9 13.4h1.5L9.2 6h-1.6l9.3 11.9Z" />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
          <path d="M20.4 8.1a2.7 2.7 0 0 0-1.9-1.9C16.8 5.7 12 5.7 12 5.7s-4.8 0-6.5.5a2.7 2.7 0 0 0-1.9 1.9c-.5 1.7-.5 3.9-.5 3.9s0 2.2.5 3.9a2.7 2.7 0 0 0 1.9 1.9c1.7.5 6.5.5 6.5.5s4.8 0 6.5-.5a2.7 2.7 0 0 0 1.9-1.9c.5-1.7.5-3.9.5-3.9s0-2.2-.5-3.9ZM10.4 14.6V9.4l4.6 2.6-4.6 2.6Z" />
        </svg>
      );
    case "blogger":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
          <path d="M6 4.5h7.5a4.5 4.5 0 0 1 4.5 4.5v.8a1.2 1.2 0 0 0 1.2 1.2h.3v4A4.5 4.5 0 0 1 15 19.5H9A4.5 4.5 0 0 1 4.5 15V6A1.5 1.5 0 0 1 6 4.5Zm3 5.3h4.6a1 1 0 1 0 0-2H9a1 1 0 1 0 0 2Zm0 4.2h6a1 1 0 1 0 0-2H9a1 1 0 1 0 0 2Z" />
        </svg>
      );
    case "google_business":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
          <path d="M4.5 6A1.5 1.5 0 0 1 6 4.5h12A1.5 1.5 0 0 1 19.5 6v12A1.5 1.5 0 0 1 18 19.5H6A1.5 1.5 0 0 1 4.5 18V6Zm3 2.2V15h3.7c2.9 0 4.8-1.4 4.8-3.4 0-1.2-.7-2.1-1.8-2.6.7-.5 1.1-1.2 1.1-2.1 0-1.7-1.4-2.7-3.9-2.7H7.5Zm2.3 2h1.8c.9 0 1.4.4 1.4 1s-.5 1-1.4 1H9.8v-2Zm0-3.8h1.5c.8 0 1.2.3 1.2.9 0 .5-.4.9-1.2.9H9.8V6.4Z" />
        </svg>
      );
    case "wordpress":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
          <path d="M12 4.5A7.5 7.5 0 1 0 19.5 12 7.5 7.5 0 0 0 12 4.5Zm0 13.2a5.7 5.7 0 0 1-2.8-.7l3-8.3c.4 0 .8 0 1.1-.1-.3-.1-.9-.1-1.5-.1-.5 0-.9 0-1.2.1A5.8 5.8 0 0 1 16 8.3l.1.1c-.4 0-.8.1-1.1.1-.4 0-.7.3-.6.7l1.9 5.5a5.7 5.7 0 0 1-4.3 3ZM7.7 8.9c0-.2 0-.5.1-.7l2.3 6.4-1 2.8A5.7 5.7 0 0 1 7.7 8.9Zm9.6 6-.6-1.8c.3-.8.5-1.6.5-2.3 0-.9-.3-1.5-.6-2-.2-.3-.3-.5-.3-.8 0-.3.2-.6.6-.6h.1a5.7 5.7 0 0 1 .3 7.5Z" />
        </svg>
      );
    default:
      return null;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "No schedule";
  try {
    return new Date(value).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    posted: "bg-[#eef8d8] text-[#4a6d16]",
    failed: "bg-[#fff1ef] text-[#b64e48]",
    cancelled: "bg-[#f0f0f0] text-[#666]",
  };
  const cls = map[status] ?? "bg-[#fff5d9] text-[#9c7620]";
  const dotCls = status === "posted" ? "bg-[#8dc63f]" : status === "failed" ? "bg-[#d86b60]" : "bg-[#efc84f]";
  return (
    <span className={`status-pill ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />
      {status}
    </span>
  );
}

export default function DashboardClient() {
  const [status, setStatus] = useState<AccountStatusResponse>(emptyStatus);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [oauthBanner, setOauthBanner] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function handleOAuthConnect(platform: PlatformName, addAnother = false) {
    try {
      setError(null);
      if (platform === "wordpress") {
        const site_url = window.prompt("WordPress site URL");
        if (!site_url) return;
        const username = window.prompt("WordPress username");
        if (!username) return;
        const application_password = window.prompt("WordPress application password");
        if (!application_password) return;
        await connectWordpressSite({ site_url, username, application_password });
        await load();
        return;
      }
      await beginOAuthLogin(platform, { addAnother });
    } catch (oauthError) {
      setError(oauthError instanceof Error ? oauthError.message : "Unable to start social login.");
    }
  }

  async function load() {
    try {
      const [statusData, accountData, postData] = await Promise.all([
        fetchAccountStatus(), fetchAccounts(), fetchPosts(),
      ]);
      setStatus(statusData);
      setAccounts(accountData);
      setPosts(postData);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard.");
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const oauthResult = url.searchParams.get("oauth_result");
    const oauthPlatform = url.searchParams.get("oauth_platform");
    const oauthMessage = url.searchParams.get("oauth_message");
    const oauthCount = url.searchParams.get("oauth_count");
    if (!oauthResult || !oauthMessage) return;
    const platformLabel = oauthPlatform ? `${oauthPlatform[0].toUpperCase()}${oauthPlatform.slice(1)}` : "Social";
    setOauthBanner({
      tone: oauthResult === "success" ? "success" : "error",
      text: oauthResult === "success"
        ? `${platformLabel}: ${oauthMessage}${oauthCount ? ` Added account count: ${oauthCount}.` : ""}`
        : `${platformLabel}: ${oauthMessage}`,
    });
    url.searchParams.delete("oauth_result");
    url.searchParams.delete("oauth_platform");
    url.searchParams.delete("oauth_message");
    url.searchParams.delete("oauth_count");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, []);

  const stats = useMemo(() => {
    const connectedPlatforms = Object.values(status).filter(i => i.connected).length;
    const totalAccounts = accounts.filter(i => i.is_active).length;
    const queuedPosts = posts.filter(p => ["pending","queued","scheduled","processing"].includes(p.status)).length;
    const posted = posts.filter(p => p.status === "posted").length;
    return { connectedPlatforms, totalAccounts, queuedPosts, posted };
  }, [accounts, posts, status]);

  const connectedAccounts = accounts.filter(a => a.is_active);
  const accountsByPlatform = useMemo(
    () =>
      platformMeta.reduce<Record<PlatformName, Account[]>>((acc, platform) => {
        acc[platform.key] = connectedAccounts.filter((account) => normalizePlatform(account.platform) === platform.key);
        return acc;
      }, {} as Record<PlatformName, Account[]>),
    [connectedAccounts],
  );
  const recentPosts = [...posts]
    .sort((a, b) => new Date(b.scheduled_at ?? b.created_at ?? 0).getTime() - new Date(a.scheduled_at ?? a.created_at ?? 0).getTime())
    .slice(0, 6);

  const statItems = [
    { label: "Active Accounts", value: stats.totalAccounts, note: "Connected & active", icon: "👤", color: "from-[#fff9e8] to-[#fff3ce]" },
    { label: "Live Platforms", value: stats.connectedPlatforms, note: "Ready to publish", icon: "🔗", color: "from-[#eef7ff] to-[#daeeff]" },
    { label: "In Queue", value: stats.queuedPosts, note: "Scheduled or processing", icon: "⏳", color: "from-[#fff5e8] to-[#ffe9cc]" },
    { label: "Published", value: stats.posted, note: "Successfully delivered", icon: "✅", color: "from-[#f0fbea] to-[#ddf4cc]" },
  ];

  return (
    <>
      <main className="flex min-h-[calc(100vh-2.5rem)] flex-col">
        <div className="flex-1 space-y-6 px-5 py-6 sm:px-8">

          {/* Hero section */}
          <section className="fade-up rounded-[28px] border border-[#efe7d8] bg-[linear-gradient(135deg,#fffef9_0%,#fff9e8_50%,#fff5d5_100%)] p-6 shadow-[0_12px_40px_rgba(24,24,24,0.05)] sm:p-8">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#b38d35]">Social Publishing Dashboard</p>
                <h1 className="font-display text-3xl font-semibold tracking-[-0.05em] text-ink-900 sm:text-4xl">
                  Welcome back 👋
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-ink-600">
                  Manage channels, launch posts, and monitor delivery — all in one place.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="primary-button self-start whitespace-nowrap px-8 py-4 text-base font-semibold transition-all duration-200 hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 flex items-center gap-2 group"
              >
                <span className="text-xl group-hover:rotate-90 transition-transform duration-300">+</span>
                <span>New Post</span>
              </button>
            </div>

            {error ? <div className="mb-4"><ErrorNotice error={error} fallback="We couldn't load the dashboard right now." /></div> : null}
            {oauthBanner ? (
              <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${oauthBanner.tone === "success" ? "border-[#d7e9c0] bg-[#f7fbef] text-[#53722c]" : "border-[#f1d3d0] bg-[#fff4f3] text-[#a54848]"}`}>{oauthBanner.text}</div>
            ) : null}

            {/* Stats row */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {statItems.map((item, i) => (
                <div key={item.label} className={`stat-card fade-up fade-up-${i + 1} rounded-[22px] border border-[#ece2d2] bg-gradient-to-br ${item.color} p-5`}>
                  <div className="flex items-start justify-between">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b38d35]">{item.label}</div>
                    <span className="text-lg">{item.icon}</span>
                  </div>
                  <div className="mt-3 font-display text-4xl font-semibold tracking-[-0.06em] text-ink-900">{item.value}</div>
                  <p className="mt-1.5 text-xs text-ink-500">{item.note}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Platforms + Composer */}
          <section className="fade-up fade-up-2 grid gap-6 xl:grid-cols-[1.5fr_0.85fr]">
            <div className="panel p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-[-0.05em]">Connected Channels</h2>
                  <p className="mt-1 text-sm text-ink-600">Click a platform to connect or manage your account.</p>
                </div>
                <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-[#ab8b3b]">
                  {stats.connectedPlatforms} live
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {platformMeta.map((platform, i) => {
                  const platformAccounts = accountsByPlatform[platform.key] ?? [];
                  const connected = status[platform.key].connected;
                  return (
                    <button
                      key={platform.key}
                      type="button"
                      onClick={() => void handleOAuthConnect(platform.key, platformAccounts.length > 0)}
                      style={{ animationDelay: `${0.05 + i * 0.06}s` }}
                      className={`platform-card fade-up group rounded-[24px] border p-5 ${
                        connected
                          ? "border-[#e8dece] bg-gradient-to-br " + platform.gradient
                          : "border-dashed border-[#e6dcc8] bg-[#faf6ef]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${platform.tone} transition-transform group-hover:scale-110`}>
                          <PlatformLogo platform={platform.key} className="h-6 w-6" />
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`pulse-dot h-2 w-2 rounded-full ${connected ? "bg-[#8dc63f]" : "bg-[#d7cdbd]"}`} />
                          <span className="text-xs text-ink-500">{connected ? "Live" : "Off"}</span>
                        </div>
                      </div>
                      <div className="mt-4">
                        <h3 className="text-base font-semibold text-ink-900">{platform.label}</h3>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {platformAccounts.length
                            ? platformAccounts.slice(0, 2).map((account) => account.account_name).join(", ")
                            : platform.hint}
                        </p>
                      </div>
                      <div className="mt-4 flex items-end justify-between gap-3">
                        <span className="text-xs text-ink-500">{platformAccounts.length} account(s)</span>
                        <span className="rounded-full border border-[#e8decd] bg-white px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors group-hover:border-brand-300 group-hover:bg-brand-50">
                          {connected && platformAccounts.length ? "Add / Manage" : "Connect"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick compose */}
            <div className="panel p-5 sm:p-6 flex flex-col">
              <div className="mb-5">
                <h2 className="font-display text-2xl font-semibold tracking-[-0.05em]">Quick Compose</h2>
                <p className="mt-1 text-sm text-ink-600">Launch the composer and publish with platform-specific fields.</p>
              </div>
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="field-input mb-4 min-h-[100px] cursor-text text-left text-base text-ink-500 hover:border-brand-300 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 group"
              >
                <span className="group-hover:text-brand-600 transition-colors duration-150">What&apos;s on your mind?</span>
              </button>
              <div className="flex flex-wrap gap-2 mb-4">
                {platformMeta.filter(p => status[p.key].connected).slice(0, 3).map(p => (
                  <span key={p.key} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${p.tone}`}>
                    <PlatformLogo platform={p.key} className="h-3 w-3" />
                    {p.label}
                  </span>
                ))}
                {stats.connectedPlatforms === 0 && (
                  <span className="text-xs text-ink-500">Connect a platform to start posting</span>
                )}
              </div>
              <div className="mt-auto rounded-[20px] border border-[#ece2d2] bg-gradient-to-br from-[#fffaf0] to-[#fff6de] p-4">
                <p className="text-sm leading-6 text-ink-700 font-medium">
                  {stats.queuedPosts > 0
                    ? `${stats.queuedPosts} post${stats.queuedPosts > 1 ? "s" : ""} queued for delivery`
                    : "Schedule your first post today"}
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  {stats.connectedPlatforms} platform{stats.connectedPlatforms !== 1 ? "s" : ""} ready
                </p>
                <button type="button" onClick={() => setComposerOpen(true)} className="primary-button mt-4 w-full py-3.5 text-base font-semibold transition-all duration-200 hover:shadow-xl hover:-translate-y-1 active:translate-y-0">
                  Open Composer
                </button>
              </div>
            </div>
          </section>

          {/* Recent posts */}
          <section className="fade-up fade-up-3 panel p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-semibold tracking-[-0.05em]">Recent Posts</h2>
                <p className="mt-1 text-sm text-ink-600">Latest activity across all platforms.</p>
              </div>
              <a href="/posts" className="secondary-button px-4 py-2 text-xs">
                View All →
              </a>
            </div>
            {recentPosts.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {recentPosts.map((post, i) => (
                  <div
                    key={post.id}
                    className="post-card rounded-[22px] border border-[#efe6d8] bg-[#fffcf6] p-4"
                    style={{ animationDelay: `${0.05 + i * 0.05}s` }}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#b38d35]">
                        {formatDate(post.scheduled_at ?? post.created_at)}
                      </span>
                      <StatusBadge status={post.status} />
                    </div>
                    <p className="line-clamp-3 text-sm leading-6 text-ink-800">{post.content || "No content"}</p>
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-ink-500">
                      <span className="capitalize font-medium">{post.platform}</span>
                      <span>#{post.id}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[22px] border border-dashed border-[#e5dbc8] bg-[#faf6ef] px-4 py-12 text-center">
                <div className="text-3xl mb-3">📭</div>
                <p className="text-sm text-ink-500">No posts yet. Create one from the composer above.</p>
              </div>
            )}
          </section>

          {/* Bottom summary */}
          <section className="fade-up fade-up-4 grid gap-6 xl:grid-cols-[0.6fr_1.4fr]">
            <div className="panel p-5 sm:p-6">
              <h2 className="font-display text-xl font-semibold tracking-[-0.05em]">Publishing Health</h2>
              <p className="mt-1 text-sm text-ink-600">Quick workspace status.</p>
              <div className="mt-5 space-y-4">
                {[
                  { label: "Success Rate", value: posts.length ? Math.round((stats.posted / posts.length) * 100) : 100, color: "bg-[#8dc63f]" },
                  { label: "Queue Load", value: posts.length ? Math.round((stats.queuedPosts / Math.max(posts.length,1)) * 100) : 0, color: "bg-[#f4b400]" },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs font-medium text-ink-700 mb-1.5">
                      <span>{item.label}</span>
                      <span>{item.value}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#efe6d7] overflow-hidden">
                      <div
                        className={`h-2 rounded-full ${item.color} transition-all duration-700`}
                        style={{ width: `${item.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel p-5 sm:p-6">
              <h2 className="font-display text-xl font-semibold tracking-[-0.05em]">Activity Feed</h2>
              <p className="mt-1 text-sm text-ink-600">Recent post outcomes across your workspace.</p>
              <div className="mt-5 space-y-2.5">
                {recentPosts.slice(0, 4).map((post) => (
                  <div key={post.id} className="flex items-start gap-3 rounded-2xl border border-[#eee4d6] bg-[#fcfaf5] p-3.5 transition-colors hover:bg-[#faf6ef]">
                    <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${post.status === "posted" ? "bg-[#8dc63f]" : post.status === "failed" ? "bg-[#d86b60]" : "bg-[#f4b400]"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink-900 capitalize">{post.platform}</span>
                        <span className="text-xs text-ink-500">#{post.id}</span>
                        <StatusBadge status={post.status} />
                      </div>
                      <p className="mt-0.5 truncate text-sm text-ink-600">
                        {post.error_message
                          ? getReadableError(post.error_message, {
                              fallback: `We couldn't finish this ${post.platform} post.`,
                            }).summary
                          : post.content || "Waiting for execution."}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-ink-400 whitespace-nowrap">{formatDate(post.updated_at ?? post.created_at)}</span>
                  </div>
                ))}
                {!recentPosts.length ? (
                  <p className="text-sm text-ink-500 py-4 text-center">No activity yet.</p>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </main>

      <PostComposerModal open={composerOpen} onClose={() => setComposerOpen(false)} onCreated={load} />
    </>
  );
}
