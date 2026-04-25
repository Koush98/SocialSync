"use client";

import { useEffect, useMemo, useState } from "react";

import { EditPostModal } from "@/components/edit-post-modal-v2";
import { ErrorNotice } from "@/components/error-notice";
import { PostComposerModal } from "@/components/post-composer-modal-v2";
import { cancelPost, fetchPosts } from "@/lib/api";
import { Post } from "@/lib/types";

type FilterStatus = "all" | "scheduled" | "posted" | "draft" | "failed";
type ViewMode = "list" | "grid";

function formatDate(value?: string | null) {
  if (!value) return "Not scheduled";
  try {
    return new Date(value).toLocaleString(undefined, { day: "2-digit", month: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" });
  } catch {
    return value;
  }
}

function statusTone(status: string) {
  if (status === "posted") return "bg-[#eef8d8] text-[#4a6d16]";
  if (status === "failed") return "bg-[#fff1ef] text-[#b64e48]";
  if (status === "draft") return "bg-[#f2f2f2] text-[#666]";
  return "bg-[#0e1830] text-[#6ea8fe]";
}

function platformTone(platform: string) {
  if (platform === "instagram") return "bg-[#2a0f1e] text-[#f472b6]";
  if (platform === "twitter") return "bg-[#111] text-white";
  if (platform === "linkedin") return "bg-[#0c1e30] text-[#60a5fa]";
  if (platform === "facebook") return "bg-[#0e1830] text-[#6ea8fe]";
  return "bg-[#fff3d7] text-[#8a6a18]";
}

export default function PostsStudio() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);

  async function load() {
    try {
      const postData = await fetchPosts();
      setPosts(postData);
      setSelectedPostId((current) => current ?? postData[0]?.id ?? null);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load scheduled posts.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const matchesSearch = !searchQuery.trim() || post.content?.toLowerCase().includes(searchQuery.toLowerCase()) || post.platform.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPlatform = platformFilter === "all" || post.platform === platformFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "scheduled" && ["pending", "queued", "scheduled", "processing"].includes(post.status)) ||
        (statusFilter === "draft" && post.status === "cancelled") ||
        post.status === statusFilter;
      return matchesSearch && matchesPlatform && matchesStatus;
    });
  }, [platformFilter, posts, searchQuery, statusFilter]);

  const selectedPost = filteredPosts.find((post) => post.id === selectedPostId) ?? filteredPosts[0] ?? null;

  async function handleDelete(postId: number) {
    try {
      await cancelPost(postId);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to update post.");
    }
  }

  return (
    <>
      <main className="min-h-[calc(100vh-2.5rem)] px-4 py-4 sm:px-5 lg:px-6">
        <div className="rounded-[30px] border border-[#1e2535] bg-[linear-gradient(135deg,rgba(255,255,255,0.92)_0%,rgba(255,250,240,0.96)_52%,rgba(255,245,221,0.9)_100%)] p-4 shadow-[0_18px_48px_rgba(24,24,24,0.08)] sm:p-5 lg:p-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_320px]">
            <div className="space-y-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h1 className="font-display text-3xl font-semibold tracking-[-0.06em] text-ink-900">Scheduled Posts</h1>
                  <p className="mt-2 text-sm leading-6 text-ink-600">A more interactive post queue with filters, list/card toggles, and a details panel to keep editing fast.</p>
                </div>
                <button type="button" onClick={() => setComposerOpen(true)} className="primary-button px-5 py-3 text-sm">Create Post</button>
              </div>

              <ErrorNotice error={error} fallback="We couldn't load scheduled posts right now." />

              <div className="rounded-[26px] border border-[#eadfcd] bg-[#fff8e8] p-4 shadow-[0_10px_24px_rgba(180,144,34,0.08)]">
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_1fr_1fr]">
                  <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by caption or platform" className="field-input rounded-full" />
                  <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)} className="field-input rounded-full">
                    <option value="all">All platforms</option>
                    <option value="instagram">Instagram</option>
                    <option value="twitter">Twitter</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="facebook">Facebook</option>
                  </select>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as FilterStatus)} className="field-input rounded-full">
                    <option value="all">All status</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="posted">Posted</option>
                    <option value="draft">Draft</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setViewMode("list")} className={`secondary-button px-4 py-2 text-sm ${viewMode === "list" ? "border-brand-300 bg-[#141924]" : ""}`}>List View</button>
                    <button type="button" onClick={() => setViewMode("grid")} className={`secondary-button px-4 py-2 text-sm ${viewMode === "grid" ? "border-brand-300 bg-[#141924]" : ""}`}>Grid/Card View</button>
                  </div>
                  <div className="text-sm text-ink-500">{filteredPosts.length} results</div>
                </div>
              </div>

              <div className="rounded-[26px] border border-[#eadfcd] bg-[#fff8e8] p-4 shadow-[0_10px_24px_rgba(180,144,34,0.08)]">
                {viewMode === "list" ? (
                  <div className="space-y-3">
                    {filteredPosts.map((post) => (
                      <button key={post.id} type="button" onClick={() => setSelectedPostId(post.id)} className={`flex w-full items-center gap-3 rounded-[20px] border p-3 text-left transition ${selectedPostId === post.id ? "border-[#e1ca8b] bg-[#fff9e9]" : "border-[#eee4d6] bg-[#fffef9] hover:border-[#e2d4b1]"}`}>
                        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${platformTone(post.platform)}`}>
                          <span className="text-xs font-semibold capitalize">{post.platform.slice(0, 2)}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-ink-900">{post.content || "Thumbnail + short caption"}</div>
                          <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink-500">
                            <span className="capitalize">{post.platform}</span>
                            <span>{formatDate(post.scheduled_at ?? post.created_at)}</span>
                          </div>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(post.status)}`}>{post.status}</span>
                        <div className="flex gap-2">
                          <span className="secondary-button px-3 py-2 text-xs">Edit</span>
                          <span className="secondary-button px-3 py-2 text-xs">Reschedule</span>
                          <span className="secondary-button px-3 py-2 text-xs">Delete</span>
                        </div>
                      </button>
                    ))}
                    {!filteredPosts.length ? <div className="rounded-[20px] border border-dashed border-[#e5dbc8] bg-[#fff8e8] px-4 py-10 text-center text-sm text-ink-500">No posts matched your filters.</div> : null}
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {filteredPosts.map((post) => (
                      <button key={post.id} type="button" onClick={() => setSelectedPostId(post.id)} className={`overflow-hidden rounded-[22px] border text-left transition ${selectedPostId === post.id ? "border-[#e1ca8b] shadow-[0_12px_28px_rgba(244,180,0,0.14)]" : "border-[#eee4d6] bg-[#fffef9] hover:border-[#e2d4b1]"}`}>
                        <div className="relative h-36 bg-[linear-gradient(135deg,#2f2f2f,#8d867c)]">
                          <div className="absolute left-3 top-3 rounded-full bg-black/65 px-2 py-1 text-[11px] text-white">{post.media_ids.length ? "Video" : "Post"}</div>
                          <div className="absolute right-3 top-3 rounded-full bg-[#0d1018]/90 px-2 py-1 text-[11px] capitalize text-ink-900">{post.platform}</div>
                        </div>
                        <div className="p-3">
                          <div className="text-sm font-semibold text-ink-900">{post.content || "Caption preview"}</div>
                          <p className="mt-1 text-xs text-ink-500">2 lines is 2 lines max</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(post.status)}`}>{post.status}</span>
                            <span className="rounded-full bg-[#f4efe4] px-3 py-1 text-xs text-ink-700">{formatDate(post.scheduled_at ?? post.created_at)}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <aside className="rounded-[26px] border border-[#eadfcd] bg-[#fffef9] p-4 shadow-[0_10px_24px_rgba(180,144,34,0.08)] sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-xl font-semibold text-ink-900">Post Details</div>
                <button type="button" className="text-ink-400 hover:text-ink-900">×</button>
              </div>
              {selectedPost ? (
                <>
                  <div className="h-36 rounded-[20px] bg-[linear-gradient(135deg,#ffd52a,#ffe566)] flex items-center justify-center">
                    <span className="text-4xl">📝</span>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-ink-700">{selectedPost.content || "Post preview unavailable."}</p>
                  <div className="mt-4">
                    <div className="text-sm font-semibold text-ink-900">Platforms</div>
                    <div className="mt-2 flex gap-2">
                      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${platformTone(selectedPost.platform)}`}>{selectedPost.platform.slice(0, 2)}</span>
                    </div>
                  </div>
                  <div className="mt-4 text-sm text-ink-700"><span className="font-semibold">Scheduled Time</span><div className="mt-1">{formatDate(selectedPost.scheduled_at ?? selectedPost.created_at)}</div></div>
                  <div className="mt-5 space-y-3">
                    <button type="button" onClick={() => setEditingPost(selectedPost)} className="primary-button w-full justify-center py-3">Edit Post</button>
                    <button type="button" onClick={() => setEditingPost(selectedPost)} className="secondary-button w-full justify-center py-3">Reschedule</button>
                    <button type="button" onClick={() => void handleDelete(selectedPost.id)} className="secondary-button w-full justify-center py-3">Delete</button>
                  </div>
                </>
              ) : <div className="rounded-[20px] border border-dashed border-[#e5dbc8] bg-[#fff8e8] px-4 py-10 text-sm text-ink-500">Select a post to inspect details here.</div>}
            </aside>
          </div>
        </div>
      </main>

      <PostComposerModal open={composerOpen} onClose={() => setComposerOpen(false)} onCreated={load} />
      <EditPostModal post={editingPost} onClose={() => setEditingPost(null)} onSaved={load} />
    </>
  );
}
