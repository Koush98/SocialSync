"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchAccounts, fetchPosts } from "@/lib/api";
import { Account, PlatformName, Post } from "@/lib/types";

const platforms: Array<{ key: PlatformName; label: string; tone: string }> = [
  { key: "facebook", label: "Facebook", tone: "bg-[#edf3ff] text-[#315ed2]" },
  { key: "instagram", label: "Instagram", tone: "bg-[#fff0f7] text-[#c13982]" },
  { key: "linkedin", label: "LinkedIn", tone: "bg-[#eef7ff] text-[#0f6ab8]" },
  { key: "twitter", label: "X (Twitter)", tone: "bg-[#111111] text-white" },
  { key: "youtube", label: "YouTube", tone: "bg-[#fff1ef] text-[#d8342b]" },
];

function initials(label: string) {
  return label
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AnalyticsClient() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
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
        return {
          ...platform,
          accounts: platformAccounts.length,
          total: platformPosts.length,
          posted: platformPosts.filter((post) => post.status === "posted").length,
          queued: platformPosts.filter((post) => ["pending", "queued", "scheduled", "processing"].includes(post.status)).length,
          failed: platformPosts.filter((post) => post.status === "failed").length,
        };
      }),
    [accounts, posts],
  );

  const latestFailures = useMemo(
    () =>
      posts
        .filter((post) => post.status === "failed" && post.error_message)
        .sort((a, b) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime())
        .slice(0, 4),
    [posts],
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
        {error ? <div className="rounded-2xl border border-[#f1d3d0] bg-[#fff4f3] px-4 py-3 text-sm text-[#a54848]">{error}</div> : null}

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

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="panel p-5 sm:p-6">
            <div className="mb-5">
              <h2 className="font-display text-2xl font-semibold tracking-[-0.05em] text-ink-900">Platform Breakdown</h2>
              <p className="mt-1 text-sm text-ink-600">Connected channels shown as compact cards with delivery counts.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {platformRows.map((row) => (
                <div key={row.key} className="rounded-[24px] border border-[#ece2d2] bg-[#fffdf9] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-semibold ${row.tone}`}>{initials(row.label)}</div>
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
                      <div className="mt-1 text-sm leading-6 text-ink-600">{post.error_message}</div>
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
