"use client";

import { useEffect, useMemo, useState } from "react";

import { ErrorNotice } from "@/components/error-notice";
import { EditPostModal } from "@/components/edit-post-modal-v2";
import { PostComposerModal } from "@/components/post-composer-modal-v2";
import { cancelPost, fetchAccounts, fetchPostMetrics, fetchPosts, publishPostNow } from "@/lib/api";
import { Account, NormalizedPostMetrics, Post, PostLiveMetricsResponse } from "@/lib/types";

type FilterStatus = "all" | "scheduled" | "posted" | "failed" | "cancelled";

function formatDate(value?: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "Not scheduled";
  try {
    return new Date(value).toLocaleString(undefined, options ?? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return value;
  }
}

function groupPosts(posts: Post[]) {
  const grouped = new Map<string, Post[]>();
  for (const post of posts) {
    const key = post.scheduled_at ? new Date(post.scheduled_at).toDateString() : "Unscheduled";
    grouped.set(key, [...(grouped.get(key) ?? []), post]);
  }
  return [...grouped.entries()].sort((a, b) => {
    if (a[0] === "Unscheduled") return 1;
    if (b[0] === "Unscheduled") return -1;
    return new Date(a[0]).getTime() - new Date(b[0]).getTime();
  });
}

function metricNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeMetrics(response?: PostLiveMetricsResponse | null): NormalizedPostMetrics {
  const metrics = response?.metrics ?? {};
  return {
    likes: metricNumber(metrics.likeCount) + metricNumber(metrics.likes),
    comments: metricNumber(metrics.commentCount) + metricNumber(metrics.comments),
    views:
      metricNumber(metrics.viewCount) +
      metricNumber(metrics.videoViews) +
      metricNumber(metrics.views) +
      metricNumber(metrics.reach),
    shares: metricNumber(metrics.shares) + metricNumber(metrics.retweetCount),
    impressions: metricNumber(metrics.impressionCount) + metricNumber(metrics.impressions),
  };
}

function getLivePostUrl(post: Post, metrics?: PostLiveMetricsResponse | null) {
  const permalink = metrics?.metrics?.permalink;
  if (typeof permalink === "string" && permalink.trim()) {
    return permalink;
  }

  if (!post.platform_post_id) {
    return null;
  }

  if (/^https?:\/\//i.test(post.platform_post_id)) {
    return post.platform_post_id;
  }

  switch (post.platform) {
    case "youtube":
      return `https://www.youtube.com/watch?v=${encodeURIComponent(post.platform_post_id)}`;
    case "twitter":
      return `https://x.com/i/web/status/${encodeURIComponent(post.platform_post_id)}`;
    case "linkedin":
      return `https://www.linkedin.com/feed/update/${encodeURIComponent(post.platform_post_id)}/`;
    case "facebook":
      return `https://www.facebook.com/${encodeURIComponent(post.platform_post_id)}`;
    default:
      return null;
  }
}

function MetricsRow({ metrics }: { metrics: NormalizedPostMetrics }) {
  const cards = [
    { label: "Likes", value: metrics.likes },
    { label: "Comments", value: metrics.comments },
    { label: "Views", value: metrics.views },
    { label: "Shares", value: metrics.shares },
    { label: "Impressions", value: metrics.impressions },
  ];

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
      {cards.map((item) => (
        <div key={item.label} className="rounded-xl border border-[#e9dfcf] bg-[#fcfaf5] px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#b38d35]">{item.label}</div>
          <div className="mt-1 text-sm font-semibold text-ink-900">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const colors: Record<string, string> = {
    facebook: "bg-[#edf3ff] text-[#315ed2]",
    instagram: "bg-[#fff0f7] text-[#c13982]",
    linkedin: "bg-[#eef7ff] text-[#0f6ab8]",
    twitter: "bg-[#111] text-white",
    youtube: "bg-[#fff1ef] text-[#d8342b]",
    blogger: "bg-[#fff2e8] text-[#ef6c00]",
    google_business: "bg-[#eef5ff] text-[#1a73e8]",
    wordpress: "bg-[#f0f3f5] text-[#1f2933]",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${colors[platform] ?? "bg-gray-100 text-gray-600"}`}>
      {platform}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; dot: string }> = {
    posted:     { bg: "bg-[#eef8d8] text-[#4a6d16]", dot: "bg-[#8dc63f]" },
    failed:     { bg: "bg-[#fff1ef] text-[#b64e48]", dot: "bg-[#d86b60]" },
    cancelled:  { bg: "bg-[#f2f2f2] text-[#666]",    dot: "bg-[#bbb]" },
    processing: { bg: "bg-[#edf3ff] text-[#315ed2]", dot: "bg-[#315ed2]" },
  };
  const s = map[status] ?? { bg: "bg-[#fff5d9] text-[#9c7620]", dot: "bg-[#efc84f]" };
  return (
    <span className={`status-pill ${s.bg}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

export default function PostsClient() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [metricsByPost, setMetricsByPost] = useState<Record<number, PostLiveMetricsResponse>>({});
  const [metricsLoadingIds, setMetricsLoadingIds] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyPostId, setBusyPostId] = useState<number | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function load() {
    try {
      const [postData, accountData] = await Promise.all([fetchPosts(), fetchAccounts()]);
      setPosts(postData);
      setAccounts(accountData);
      setError(null);
      setLastUpdated(new Date());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load posts.");
    }
  }

  async function loadMetricsForPosts(postItems: Post[]) {
    const eligiblePosts = postItems.filter(
      (post) => post.status === "posted" && post.platform_post_id,
    );

    if (!eligiblePosts.length) {
      return;
    }

    setMetricsLoadingIds((current) => {
      const next = { ...current };
      for (const post of eligiblePosts) {
        next[post.id] = true;
      }
      return next;
    });

    const results = await Promise.allSettled(
      eligiblePosts.map(async (post) => ({
        postId: post.id,
        metrics: await fetchPostMetrics(post.id),
      })),
    );

    const loadedMetrics: Record<number, PostLiveMetricsResponse> = {};
    for (const result of results) {
      if (result.status === "fulfilled") {
        loadedMetrics[result.value.postId] = result.value.metrics;
      }
    }

    setMetricsByPost((current) => ({ ...current, ...loadedMetrics }));
    setMetricsLoadingIds((current) => {
      const next = { ...current };
      for (const post of eligiblePosts) {
        next[post.id] = false;
      }
      return next;
    });
  }

  // Auto-refresh every 30 seconds for real-time status updates
  useEffect(() => {
    void load();
    const interval = setInterval(load, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    void loadMetricsForPosts(posts);
  }, [posts]);

  async function handlePublishNow(postId: number) {
    try {
      setBusyPostId(postId);
      setError(null);
      await publishPostNow(postId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to publish post.");
    } finally {
      setBusyPostId(null);
    }
  }

  async function handleCancel(postId: number) {
    try {
      setBusyPostId(postId);
      setError(null);
      await cancelPost(postId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to cancel post.");
    } finally {
      setBusyPostId(null);
    }
  }

  const accountMap = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);

  const filteredPosts = useMemo(() => {
    let result = [...posts];
    if (filterStatus !== "all") {
      const map: Record<FilterStatus, string[]> = {
        all: [],
        scheduled: ["pending","queued","scheduled","processing"],
        posted: ["posted"],
        failed: ["failed"],
        cancelled: ["cancelled"],
      };
      result = result.filter(p => map[filterStatus].includes(p.status));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.content?.toLowerCase().includes(q) ||
        p.platform.toLowerCase().includes(q) ||
        accountMap.get(p.social_account_id)?.account_name?.toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => new Date(a.scheduled_at ?? a.created_at ?? 0).getTime() - new Date(b.scheduled_at ?? b.created_at ?? 0).getTime());
  }, [posts, filterStatus, searchQuery, accountMap]);

  const groupedPosts = useMemo(() => groupPosts(filteredPosts), [filteredPosts]);

  const summary = useMemo(() => ({
    total: posts.length,
    scheduled: posts.filter(p => ["pending","queued","scheduled","processing"].includes(p.status)).length,
    posted: posts.filter(p => p.status === "posted").length,
    failed: posts.filter(p => p.status === "failed").length,
  }), [posts]);

  const filterOptions: Array<{ value: FilterStatus; label: string; count: number }> = [
    { value: "all", label: "All", count: summary.total },
    { value: "scheduled", label: "Scheduled", count: summary.scheduled },
    { value: "posted", label: "Published", count: summary.posted },
    { value: "failed", label: "Failed", count: summary.failed },
    { value: "cancelled", label: "Cancelled", count: posts.filter(p => p.status === "cancelled").length },
  ];

  return (
    <>
      <main className="flex min-h-[calc(100vh-2.5rem)] flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-10 border-b border-[#f0e7d7] bg-white/90 backdrop-blur px-5 py-4 sm:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500 text-sm">⌕</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search posts, platforms, accounts…"
                className="field-input pl-9 pr-4 py-2.5 text-sm w-full sm:w-72"
              />
            </div>
            <button type="button" onClick={() => setComposerOpen(true)} className="primary-button shrink-0">
              + New Post
            </button>
          </div>
        </header>

        <div className="flex-1 px-5 py-6 sm:px-8 space-y-6">
          {/* Page header */}
          <div className="fade-up">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-display text-3xl font-semibold tracking-[-0.05em] text-ink-900 sm:text-4xl">Scheduled Posts</h1>
                <p className="mt-2 text-sm leading-6 text-ink-600">
                  Manage queued delivery, publish immediately, cancel safely, and inspect platform failures.
                </p>
                {lastUpdated && (
                  <p className="mt-1 text-xs text-ink-400">
                    Last updated: {lastUpdated.toLocaleTimeString()}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void load()}
                className="secondary-button px-4 py-2 text-sm"
                title="Refresh posts"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {/* Summary stats */}
          <div className="fade-up fade-up-1 grid gap-3 grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Total Posts", value: summary.total, color: "text-ink-900" },
              { label: "Scheduled", value: summary.scheduled, color: "text-[#9c7620]" },
              { label: "Published", value: summary.posted, color: "text-[#4a6d16]" },
              { label: "Failed", value: summary.failed, color: "text-[#b64e48]" },
            ].map(s => (
              <div key={s.label} className="soft-panel p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b38d35]">{s.label}</div>
                <div className={`mt-2 font-display text-3xl font-semibold tracking-[-0.05em] ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {error ? <ErrorNotice error={error} fallback="We couldn't load the posts queue right now." /> : null}

          {/* Filter tabs */}
          <div className="fade-up fade-up-2 flex flex-wrap gap-2">
            {filterOptions.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilterStatus(opt.value)}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition ${
                  filterStatus === opt.value
                    ? "bg-brand-300 text-ink-900 shadow-sm"
                    : "border border-[#e8dfce] bg-white text-ink-600 hover:border-brand-200 hover:bg-brand-50"
                }`}
              >
                {opt.label}
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  filterStatus === opt.value ? "bg-white/40 text-ink-900" : "bg-[#f0e8d8] text-ink-600"
                }`}>
                  {opt.count}
                </span>
              </button>
            ))}
          </div>

          {/* Posts timeline */}
          <div className="fade-up fade-up-3 space-y-6">
            {groupedPosts.length ? groupedPosts.map(([group, items]) => (
              <div key={group}>
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-ink-900">
                    {group === "Unscheduled"
                      ? "📋 Unscheduled"
                      : `📅 ${formatDate(new Date(group).toISOString(), { weekday: "long", month: "long", day: "numeric" })}`}
                  </h2>
                  <div className="flex-1 h-px bg-[#ebe2d0]" />
                  <span className="text-xs text-ink-500">{items.length} post{items.length !== 1 ? "s" : ""}</span>
                </div>

                <div className="space-y-3">
                  {items.map((post) => {
                    const account = accountMap.get(post.social_account_id);
                    const busy = busyPostId === post.id;
                    const canEdit = !["posted","processing","cancelled"].includes(post.status);
                    const canPublish = !["posted","processing"].includes(post.status);
                    const canCancel = !["posted","cancelled"].includes(post.status);
                    const liveMetrics = metricsByPost[post.id];
                    const normalizedMetrics = normalizeMetrics(liveMetrics);
                    const livePostUrl = getLivePostUrl(post, liveMetrics);
                    const showMetrics =
                      liveMetrics?.available &&
                      Object.values(normalizedMetrics).some((value) => value > 0);

                    return (
                      <div key={post.id} className="post-card rounded-[22px] border border-[#ece3d3] bg-[#fffcf7] p-4 sm:p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          {/* Content area */}
                          <div className="min-w-0 flex-1">
                            <div className="mb-2.5 flex flex-wrap items-center gap-2">
                              <PlatformBadge platform={post.platform} />
                              <StatusBadge status={post.status} />
                              <span className="text-xs text-ink-400">#{post.id}</span>
                              {post.retry_count > 0 && (
                                <span className="text-xs text-ink-500 bg-[#f0ebe0] rounded-full px-2 py-0.5">
                                  {post.retry_count}/{post.max_retries} retries
                                </span>
                              )}
                            </div>

                            <p className="text-sm font-medium leading-6 text-ink-900 line-clamp-3">
                              {post.content || <span className="text-ink-400 italic">No content</span>}
                            </p>

                            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
                              {account && <span className="font-medium text-ink-700">{account.account_name}</span>}
                              <span>{formatDate(post.scheduled_at)}</span>
                              {post.media_ids.length > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  📎 {post.media_ids.length} media
                                </span>
                              )}
                            </div>

                            {post.error_message ? (
                              <div className="mt-3">
                                <ErrorNotice
                                  error={post.error_message}
                                  compact
                                  fallback={`We couldn't finish this ${post.platform} post.`}
                                />
                              </div>
                            ) : null}

                            {post.platform_post_id && (
                              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-500">
                                <span>
                                  Platform ID: <span className="font-mono text-ink-700">{post.platform_post_id}</span>
                                </span>
                                {post.status === "posted" && livePostUrl ? (
                                  <a
                                    href={livePostUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 rounded-full border border-[#e4d9c7] bg-white px-3 py-1 font-medium text-[#8f6f1f] transition hover:border-[#d6c297] hover:bg-[#fff8e6]"
                                  >
                                    View Live
                                  </a>
                                ) : null}
                              </div>
                            )}

                            {post.status === "posted" && post.platform_post_id ? (
                              metricsLoadingIds[post.id] ? (
                                <div className="mt-3 rounded-xl border border-[#ece2d2] bg-[#faf6ef] px-3 py-2 text-xs text-ink-500">
                                  Loading engagement metrics...
                                </div>
                              ) : showMetrics ? (
                                <MetricsRow metrics={normalizedMetrics} />
                              ) : liveMetrics?.message ? (
                                <div className="mt-3 rounded-xl border border-[#ece2d2] bg-[#faf6ef] px-3 py-2 text-xs text-ink-500">
                                  Metrics unavailable: {liveMetrics.message}
                                </div>
                              ) : null
                            ) : null}
                          </div>

                          {/* Action buttons */}
                          <div className="flex flex-row flex-wrap gap-2 sm:flex-col sm:shrink-0">
                            <button
                              type="button"
                              onClick={() => setEditingPost(post)}
                              disabled={busy || !canEdit}
                              className="secondary-button flex-1 sm:flex-none px-4 py-2 text-xs"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handlePublishNow(post.id)}
                              disabled={busy || !canPublish}
                              className="primary-button flex-1 sm:flex-none px-4 py-2 text-xs"
                            >
                              {busy ? (
                                <span className="flex items-center gap-1.5">
                                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-ink-900/30 border-t-ink-900" />
                                  Working…
                                </span>
                              ) : "🚀 Publish Now"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCancel(post.id)}
                              disabled={busy || !canCancel}
                              className="secondary-button flex-1 sm:flex-none px-4 py-2 text-xs text-[#b64e48] hover:border-[#f1d3d0] hover:bg-[#fff4f3]"
                            >
                              ✕ Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )) : (
              <div className="rounded-[24px] border border-dashed border-[#e5dbc8] bg-[#faf6ef] py-16 text-center">
                <div className="text-4xl mb-4">📭</div>
                <h3 className="text-base font-semibold text-ink-900">No posts found</h3>
                <p className="mt-1 text-sm text-ink-500">
                  {filterStatus !== "all" || searchQuery ? "Try changing your filters or search." : "Create your first post using the composer."}
                </p>
                {filterStatus === "all" && !searchQuery && (
                  <button type="button" onClick={() => setComposerOpen(true)} className="primary-button mt-5 px-6">
                    + Create Post
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <PostComposerModal open={composerOpen} onClose={() => setComposerOpen(false)} onCreated={load} />
      <EditPostModal post={editingPost} onClose={() => setEditingPost(null)} onSaved={load} />
    </>
  );
}
