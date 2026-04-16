"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchAccounts, fetchPostMetrics, fetchPosts } from "@/lib/api";
import { ErrorNotice } from "@/components/error-notice";
import { Account, NormalizedPostMetrics, PlatformName, Post, PostLiveMetricsResponse } from "@/lib/types";

const platforms: Array<{ key: PlatformName; label: string; tone: string }> = [
  { key: "facebook", label: "Facebook", tone: "bg-[#edf3ff] text-[#315ed2]" },
  { key: "instagram", label: "Instagram", tone: "bg-[#fff0f7] text-[#c13982]" },
  { key: "linkedin", label: "LinkedIn", tone: "bg-[#eef7ff] text-[#0f6ab8]" },
  { key: "twitter", label: "X (Twitter)", tone: "bg-[#111111] text-white" },
  { key: "youtube", label: "YouTube", tone: "bg-[#fff1ef] text-[#d8342b]" },
  { key: "blogger", label: "Blogger", tone: "bg-[#fff2e8] text-[#ef6c00]" },
  { key: "google_business", label: "Google Business", tone: "bg-[#eef5ff] text-[#1a73e8]" },
  { key: "wordpress", label: "WordPress", tone: "bg-[#f0f3f5] text-[#1f2933]" },
];

function initials(label: string) {
  return label
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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

export default function AnalyticsClient() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [metricsByPost, setMetricsByPost] = useState<Record<number, PostLiveMetricsResponse>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [postData, accountData] = await Promise.all([fetchPosts(), fetchAccounts()]);
        setPosts(postData);
        setAccounts(accountData);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load analytics.");
      }
    }

    void load();
  }, []);

  useEffect(() => {
    async function loadMetrics() {
      const eligiblePosts = posts.filter((post) => post.status === "posted" && post.platform_post_id);
      if (!eligiblePosts.length) {
        setMetricsByPost({});
        return;
      }

      const results = await Promise.allSettled(
        eligiblePosts.map(async (post) => ({
          postId: post.id,
          metrics: await fetchPostMetrics(post.id),
        })),
      );

      const next: Record<number, PostLiveMetricsResponse> = {};
      for (const result of results) {
        if (result.status === "fulfilled") {
          next[result.value.postId] = result.value.metrics;
        }
      }
      setMetricsByPost(next);
    }

    void loadMetrics();
  }, [posts]);

  const summary = useMemo(() => {
    const total = posts.length;
    const posted = posts.filter((post) => post.status === "posted").length;
    const active = posts.filter((post) => ["pending", "queued", "scheduled", "processing"].includes(post.status)).length;
    const failed = posts.filter((post) => post.status === "failed").length;
    const successRate = total ? Math.round((posted / total) * 100) : 0;
    return { total, posted, active, failed, successRate };
  }, [posts]);

  const platformRows = useMemo(
    () =>
      platforms.map((platform) => {
        const platformPosts = posts.filter((post) => post.platform === platform.key);
        const platformAccounts = accounts.filter((account) => account.platform === platform.key && account.is_active);
        const platformMetrics = platformPosts
          .filter((post) => post.status === "posted")
          .map((post) => normalizeMetrics(metricsByPost[post.id]))
          .reduce(
            (acc, item) => ({
              likes: acc.likes + item.likes,
              comments: acc.comments + item.comments,
              views: acc.views + item.views,
              shares: acc.shares + item.shares,
              impressions: acc.impressions + item.impressions,
            }),
            { likes: 0, comments: 0, views: 0, shares: 0, impressions: 0 },
          );
        return {
          ...platform,
          accounts: platformAccounts.length,
          total: platformPosts.length,
          posted: platformPosts.filter((post) => post.status === "posted").length,
          queued: platformPosts.filter((post) => ["pending", "queued", "scheduled", "processing"].includes(post.status)).length,
          failed: platformPosts.filter((post) => post.status === "failed").length,
          metrics: platformMetrics,
        };
      }),
    [accounts, metricsByPost, posts],
  );

  const engagementTotals = useMemo(
    () =>
      Object.values(metricsByPost)
        .map((item) => normalizeMetrics(item))
        .reduce(
          (acc, item) => ({
            likes: acc.likes + item.likes,
            comments: acc.comments + item.comments,
            views: acc.views + item.views,
            shares: acc.shares + item.shares,
            impressions: acc.impressions + item.impressions,
          }),
          { likes: 0, comments: 0, views: 0, shares: 0, impressions: 0 },
        ),
    [metricsByPost],
  );

  const latestFailures = useMemo(
    () =>
      posts
        .filter((post) => post.status === "failed" && post.error_message)
        .sort((a, b) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime())
        .slice(0, 4),
    [posts],
  );

  const bestPlatform = useMemo(
    () =>
      [...platformRows]
        .sort((a, b) => b.posted - a.posted || b.metrics.views - a.metrics.views)[0] ?? null,
    [platformRows],
  );

  const needsAttention = useMemo(
    () =>
      platformRows
        .filter((row) => row.failed > 0)
        .sort((a, b) => b.failed - a.failed)[0] ?? null,
    [platformRows],
  );

  return (
    <main className="flex min-h-[calc(100vh-2.5rem)] flex-col">
      <header className="border-b border-[#f0e7d7] px-5 py-4 sm:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-[#b3892d]">Analytics</p>
            <h1 className="font-display text-4xl font-semibold tracking-[-0.06em] text-ink-900">Performance Overview</h1>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              Track publishing health, review platform activity, and surface the channels that need attention.
            </p>
          </div>
          <div className="rounded-2xl border border-[#efe6d5] bg-[#fcfaf5] px-4 py-3 text-sm text-ink-600">
            Live view of queued, posted, and failed delivery states.
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-6 px-5 py-6 sm:px-8">
        <ErrorNotice error={error} fallback="We couldn't load analytics right now." />

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="panel p-5 sm:p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b38d35]">What is going well</div>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.05em] text-ink-900">
              {bestPlatform ? `${bestPlatform.label} is your strongest channel right now.` : "Your analytics overview is ready."}
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              {bestPlatform
                ? `${bestPlatform.posted} published post${bestPlatform.posted !== 1 ? "s" : ""} and ${bestPlatform.metrics.views} views are leading the current mix.`
                : "Publish a few posts to start surfacing platform performance trends here."}
            </p>
          </div>
          <div className="panel p-5 sm:p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b38d35]">Needs attention</div>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.05em] text-ink-900">
              {needsAttention ? `${needsAttention.label} needs a quick check.` : "No urgent delivery issues detected."}
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              {needsAttention
                ? `${needsAttention.failed} failure${needsAttention.failed !== 1 ? "s" : ""} were detected on ${needsAttention.label}. Open the post logs below if you need the technical reason.`
                : "Your recent publishing activity looks healthy, with no failing platform standing out."}
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total Posts", value: summary.total, note: "All posts created in this workspace" },
            { label: "Posted", value: summary.posted, note: "Successfully delivered posts" },
            { label: "Active Queue", value: summary.active, note: "Pending, queued, scheduled, or processing" },
            { label: "Success Rate", value: `${summary.successRate}%`, note: "Posted posts over total created" },
          ].map((item) => (
            <div key={item.label} className="panel p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b38d35]">{item.label}</div>
              <div className="mt-3 font-display text-4xl font-semibold tracking-[-0.06em] text-ink-900">{item.value}</div>
              <p className="mt-2 text-sm text-ink-600">{item.note}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Likes", value: engagementTotals.likes },
            { label: "Comments", value: engagementTotals.comments },
            { label: "Views", value: engagementTotals.views },
            { label: "Shares", value: engagementTotals.shares },
            { label: "Impressions", value: engagementTotals.impressions },
          ].map((item) => (
            <div key={item.label} className="rounded-[24px] border border-[#ece2d2] bg-[#fffdf9] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b38d35]">{item.label}</div>
              <div className="mt-2 font-display text-3xl font-semibold tracking-[-0.05em] text-ink-900">{item.value}</div>
              <p className="mt-1 text-xs text-ink-500">Live metrics from provider APIs where available.</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="panel p-5 sm:p-6">
            <div className="mb-5">
              <h2 className="font-display text-2xl font-semibold tracking-[-0.05em] text-ink-900">Platform Breakdown</h2>
              <p className="mt-1 text-sm text-ink-600">Connected channels shown as compact cards with delivery counts.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {platformRows.map((row) => (
                <div key={row.key} className="rounded-[24px] border border-[#ece2d2] bg-[#fffdf9] p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(24,24,24,0.08)]">
                  <div className="flex items-start justify-between gap-4">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-semibold transition-transform duration-300 hover:scale-110 ${row.tone}`}>{initials(row.label)}</div>
                    <span className="rounded-full bg-[#faf4e5] px-3 py-1 text-xs font-semibold text-[#b38d35]">{row.accounts} account(s)</span>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-xl font-semibold text-ink-900">{row.label}</h3>
                    <p className="mt-1 text-sm text-ink-600">{row.total} total posts tracked on this platform.</p>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-2xl bg-[#f7fbef] px-3 py-3 text-center">
                      <div className="font-semibold text-[#53722c]">{row.posted}</div>
                      <div className="mt-1 text-xs text-ink-600">Posted</div>
                    </div>
                    <div className="rounded-2xl bg-[#fff7df] px-3 py-3 text-center">
                      <div className="font-semibold text-[#9c7620]">{row.queued}</div>
                      <div className="mt-1 text-xs text-ink-600">Queue</div>
                    </div>
                    <div className="rounded-2xl bg-[#fff1ef] px-3 py-3 text-center">
                      <div className="font-semibold text-[#b64e48]">{row.failed}</div>
                      <div className="mt-1 text-xs text-ink-600">Failed</div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-[#fcfaf5] px-3 py-2 text-ink-600">Likes: <span className="font-semibold text-ink-900">{row.metrics.likes}</span></div>
                    <div className="rounded-xl bg-[#fcfaf5] px-3 py-2 text-ink-600">Comments: <span className="font-semibold text-ink-900">{row.metrics.comments}</span></div>
                    <div className="rounded-xl bg-[#fcfaf5] px-3 py-2 text-ink-600">Views: <span className="font-semibold text-ink-900">{row.metrics.views}</span></div>
                    <div className="rounded-xl bg-[#fcfaf5] px-3 py-2 text-ink-600">Shares: <span className="font-semibold text-ink-900">{row.metrics.shares}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="panel p-5 sm:p-6">
              <h2 className="font-display text-2xl font-semibold tracking-[-0.05em] text-ink-900">Queue Health</h2>
              <p className="mt-1 text-sm text-ink-600">A simple view of how healthy your current publishing pipeline looks.</p>
              <div className="mt-5 rounded-[24px] border border-[#eadfce] bg-[linear-gradient(135deg,#fff9ea_0%,#fff6df_100%)] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="rounded-2xl bg-[#f7dd8a] px-3 py-1 text-sm font-semibold text-ink-900">AI</span>
                  <span className="text-xs uppercase tracking-[0.12em] text-[#b38d35]">Signal</span>
                </div>
                <p className="text-2xl font-semibold tracking-[-0.04em] text-ink-900">
                  {summary.failed ? "Failures need review." : "Delivery pipeline is stable."}
                </p>
                <p className="mt-2 text-sm leading-6 text-ink-600">
                  {summary.active} active items are currently moving through the queue, while {summary.failed} posts need a retry or provider fix.
                </p>
              </div>
            </div>

            <div className="panel p-5 sm:p-6">
              <h2 className="font-display text-2xl font-semibold tracking-[-0.05em] text-ink-900">Recent Failures</h2>
              <p className="mt-1 text-sm text-ink-600">Latest delivery failures surfaced for faster debugging.</p>
              <div className="mt-5 space-y-3">
                {latestFailures.length ? (
                  latestFailures.map((post) => (
                    <div key={post.id} className="rounded-2xl border border-[#eee4d6] bg-[#fcfaf5] p-4">
                      <div className="text-sm font-medium text-ink-900">
                        {post.platform} #{post.id}
                      </div>
                      <div className="mt-2">
                        <ErrorNotice error={post.error_message} compact fallback="This delivery attempt failed." />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-[#e5dbc8] bg-[#faf6ef] px-4 py-8 text-sm text-ink-500">
                    No recent failures. Your publishing flow looks clean right now.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
