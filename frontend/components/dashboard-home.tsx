"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ErrorNotice } from "@/components/error-notice";
import { PostComposerModal } from "@/components/post-composer-modal-v2";
import { fetchAccounts, fetchPosts } from "@/lib/api";
import { Account, Post } from "@/lib/types";

function formatDate(value?: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "No date";
  try {
    return new Date(value).toLocaleString(undefined, options ?? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return value;
  }
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
}

function BellIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9a6 6 0 1 1 12 0v4.5l1.6 2.3a1 1 0 0 1-.82 1.57H5.22A1 1 0 0 1 4.4 15.8L6 13.5V9Z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>;
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[26px] border border-[#f0e2b2] bg-[#fffef9] p-4 shadow-[0_12px_28px_rgba(180,144,34,0.10)] sm:p-5">
      <div className="mb-4">
        <div className="text-xl font-semibold text-ink-900">{title}</div>
        <p className="text-sm text-ink-700">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

export function DashboardHome() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [postData, accountData] = await Promise.all([fetchPosts(), fetchAccounts()]);
        setPosts(postData);
        setAccounts(accountData);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard.");
      }
    }

    void load();
  }, []);

  const filteredPosts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return posts;
    return posts.filter((post) => post.content?.toLowerCase().includes(query) || post.platform.toLowerCase().includes(query));
  }, [posts, searchQuery]);

  const activeAccounts = accounts.filter((account) => account.is_active);
  const connectedPlatforms = new Set(activeAccounts.map((account) => account.platform.toLowerCase())).size;
  const scheduledPosts = filteredPosts.filter((post) => ["pending", "queued", "scheduled", "processing"].includes(post.status));
  const postedPosts = filteredPosts.filter((post) => post.status === "posted");
  const successRate = filteredPosts.length ? Math.round((postedPosts.length / filteredPosts.length) * 100) : 0;
  const engagementRate = postedPosts.length ? ((postedPosts.length / Math.max(filteredPosts.length, 1)) * 5.2).toFixed(1) : "0.0";

  const metricCards = [
    { label: "Total Posts", value: filteredPosts.length, note: `${postedPosts.length} published`, accent: "bg-[#ffd52a]" },
    { label: "Scheduled Posts", value: scheduledPosts.length, note: "In queue", accent: "bg-[#1a180a]" },
    { label: "Engagement Rate", value: `${engagementRate}%`, note: `${successRate}% success`, accent: "bg-[rgba(34,212,138,0.15)]" },
    { label: "Connected Accounts", value: activeAccounts.length, note: `${connectedPlatforms} platforms`, accent: "bg-[rgba(96,165,250,0.12)]" },
  ];

  const upcomingPosts = [...scheduledPosts]
    .sort((a, b) => new Date(a.scheduled_at ?? a.created_at ?? 0).getTime() - new Date(b.scheduled_at ?? b.created_at ?? 0).getTime())
    .slice(0, 4);

  const recentActivity = [...filteredPosts]
    .sort((a, b) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime())
    .slice(0, 4);

  const platformCounts = ["instagram", "twitter", "linkedin", "facebook"].map((platform) => {
    const count = filteredPosts.filter((post) => post.platform === platform).length;
    return { platform, count, height: Math.max(18, count * 18) };
  });

  const trendPoints = filteredPosts
    .slice()
    .sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime())
    .slice(-6)
    .map((post, index) => ({ x: 24 + index * 58, y: 110 - (["posted", "scheduled", "processing"].includes(post.status) ? 18 : 0) - index * 6 }));

  const path = trendPoints.length
    ? `M ${trendPoints.map((point) => `${point.x} ${point.y}`).join(" L ")}`
    : "M 24 110 L 82 92 L 140 96 L 198 76 L 256 82 L 314 54";

  return (
    <>
      <main className="min-h-[calc(100vh-2.5rem)] px-4 py-4 sm:px-5 lg:px-6">
        <div className="rounded-[30px] border border-[#f0e2b2] bg-[linear-gradient(180deg,#fffef9_0%,#fff8e8_100%)] p-4 shadow-[0_18px_48px_rgba(180,144,34,0.10)] sm:p-5 lg:p-6">
          <ErrorNotice error={error} fallback="We couldn't load the dashboard right now." />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_320px]">
            <div className="space-y-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full max-w-[460px]">
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search posts, analytics..."
                    className="field-input w-full rounded-full pl-10 pr-4 py-3 text-sm"
                  />
                  <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-600">
                    <SearchIcon />
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end lg:self-auto">
                  <button type="button" className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-[#eadba6] bg-[#fffef9] text-ink-900 shadow-[0_10px_24px_rgba(180,144,34,0.10)]">
                    <BellIcon />
                    <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ffd52a] px-1 text-[11px] font-semibold text-[#09090e]">3</span>
                  </button>
                  <div className="hidden rounded-full border border-[#eadba6] bg-[#fffef9] px-3 py-2 text-sm font-medium text-ink-900 shadow-[0_8px_18px_rgba(180,144,34,0.08)] sm:flex sm:items-center sm:gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#ffd52a,#f5a623)] text-sm font-semibold text-[#09090e]">SJ</div>
                    <span>Sarah Jenkins</span>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-[#f0e2b2] bg-[linear-gradient(90deg,#fffef9_0%,#fff8e8_62%,rgba(255,209,43,0.24)_100%)] px-5 py-6 shadow-[0_16px_38px_rgba(180,144,34,0.10)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="inline-flex rounded-full border border-[#e5ca61] bg-[#fff2b8] px-3 py-1 text-[11px] font-semibold text-[#8c6f00]">All systems operational</div>
                    <h1 className="mt-4 font-display text-3xl font-semibold tracking-[-0.06em] text-ink-900 sm:text-4xl">Good evening, <span className="text-[#ffd52a]">Karan</span>.</h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-700">You have {scheduledPosts.length} posts scheduled and engagement is trending upward across your connected channels.</p>
                    <p className="mt-1 text-sm font-semibold text-[#22d48a]">+8.1% this week</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" className="secondary-button px-5 py-3 text-sm">AI Caption Studio</button>
                    <button type="button" onClick={() => setComposerOpen(true)} className="primary-button px-6 py-3 text-sm">+ Create Post</button>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                {metricCards.map((card) => (
                  <div key={card.label} className="rounded-[24px] border border-[#f0e2b2] bg-[#fffef9] p-4 shadow-[0_10px_24px_rgba(180,144,34,0.08)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-600">{card.label}</div>
                        <div className="mt-3 font-display text-4xl font-semibold tracking-[-0.05em] text-ink-900">{card.value}</div>
                        <p className="mt-1 text-sm text-[#22d48a]">{card.note}</p>
                      </div>
                      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${card.accent} shadow-[0_0_24px_rgba(255,209,43,0.12)]`}>
                        <span className="h-2.5 w-2.5 rounded-full bg-[#ffd52a] opacity-70" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <div className="mb-3 text-2xl font-semibold text-ink-900">Performance</div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <ChartCard title="Performance" subtitle="Reach and engagement in the last 7 days">
                    <svg viewBox="0 0 340 140" className="h-[220px] w-full">
                      <defs>
                        <linearGradient id="lineGlow" x1="0%" x2="100%">
                          <stop offset="0%" stopColor="#ffd55a" />
                          <stop offset="100%" stopColor="#4a9ad4" />
                        </linearGradient>
                      </defs>
                      {[0, 1, 2, 3].map((row) => <line key={row} x1="24" y1={32 + row * 24} x2="320" y2={32 + row * 24} stroke="#1c2431" strokeDasharray="4 6" />)}
                      <path d={path} fill="none" stroke="url(#lineGlow)" strokeWidth="4" strokeLinecap="round" />
                      {trendPoints.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="5" fill="#ffd55a" stroke="#10151d" strokeWidth="3" />)}
                    </svg>
                  </ChartCard>

                  <ChartCard title="Connected Accounts" subtitle={`${activeAccounts.length} of ${Math.max(activeAccounts.length + 2, 4)} active`}>
                    <div className="flex h-[220px] items-end justify-between gap-4 px-2 pt-6">
                      {platformCounts.map((item, index) => (
                        <div key={item.platform} className="flex flex-1 flex-col items-center gap-3">
                          <div className="text-sm font-semibold text-ink-900">{item.count}</div>
                          <div
                            className={`w-full rounded-t-[18px] ${index % 2 === 0 ? "bg-gradient-to-b from-[#ffd52a] to-[#f5c400]" : "bg-gradient-to-b from-[#22d48a] to-[#16a870]"}`}
                            style={{ height: `${item.height}px` }}
                          />
                          <div className="text-center text-xs font-medium capitalize text-ink-600">{item.platform}</div>
                        </div>
                      ))}
                    </div>
                  </ChartCard>
                </div>
              </div>
            </div>

            <div className="space-y-4">
                <div className="rounded-[26px] border border-[#f0e2b2] bg-[#fffef9] p-4 shadow-[0_12px_28px_rgba(180,144,34,0.10)] sm:p-5">
                <div className="mb-4 text-2xl font-semibold text-ink-900">Upcoming Posts</div>
                <div className="space-y-3">
                  {upcomingPosts.length ? (
                    upcomingPosts.map((post) => (
                      <div key={post.id} className="flex items-center gap-3 rounded-[20px] border border-[#f0e2b2] bg-[#fffef9] p-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#ffd52a,#f5c400)] text-sm font-semibold capitalize text-[#09090e]">
                          {post.platform.slice(0, 2)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="truncate text-lg font-semibold capitalize text-ink-900">{post.platform}</div>
                            <div className="text-sm text-ink-700">{formatDate(post.scheduled_at, { hour: "numeric", minute: "2-digit" })}</div>
                          </div>
                          <p className="truncate text-sm text-ink-700">{post.content || "Preview unavailable"}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[20px] border border-dashed border-[#f0e2b2] bg-[#fffef9] px-4 py-8 text-sm text-ink-700">No upcoming posts in the queue right now.</div>
                  )}
                </div>
              </div>

              <div className="rounded-[26px] border border-[#f0e2b2] bg-[#fffef9] p-4 shadow-[0_12px_28px_rgba(180,144,34,0.10)] sm:p-5">
                <div className="mb-4 text-2xl font-semibold text-ink-900">Recent Activity</div>
                <div className="space-y-3">
                  {recentActivity.length ? (
                    recentActivity.map((post) => (
                      <div key={post.id} className="flex items-start gap-3">
                        <div className={`mt-1 flex h-10 w-10 items-center justify-center rounded-2xl ${post.status === "posted" ? "bg-[#211d08]" : post.status === "failed" ? "bg-[#2a100e]" : "bg-[#0d2a1e]"}`}>
                          <span className={`h-4 w-4 rounded-full ${post.status === "posted" ? "bg-[#ffd52a]" : post.status === "failed" ? "bg-[#d86b60]" : "bg-[#22d48a]"}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-lg font-semibold text-ink-900 capitalize">{post.status}</div>
                            <div className="text-sm text-ink-700">{formatDate(post.updated_at ?? post.created_at, { month: "short", day: "numeric" })}</div>
                          </div>
                          <p className="truncate text-sm text-ink-700">{post.content || `${post.platform} post`}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[20px] border border-dashed border-[#f0e2b2] bg-[#fffef9] px-4 py-8 text-sm text-ink-700">Activity will appear here once posts start moving.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <PostComposerModal open={composerOpen} onClose={() => setComposerOpen(false)} />
    </>
  );
}
