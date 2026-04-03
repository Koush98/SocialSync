"use client";

import { useEffect, useState } from "react";

import { ScheduledPostsTable } from "@/components/scheduled-posts-table";
import { cancelPost, fetchAccounts, fetchPosts, publishPostNow } from "@/lib/api";
import { Account, Post } from "@/lib/types";

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyPostId, setBusyPostId] = useState<number | null>(null);

  async function load() {
    try {
      const [postData, accountData] = await Promise.all([fetchPosts(), fetchAccounts()]);
      setPosts(postData);
      setAccounts(accountData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load posts.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handlePublishNow(postId: number) {
    try {
      setBusyPostId(postId);
      setError(null);
      await publishPostNow(postId);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to publish post.");
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
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to cancel post.");
    } finally {
      setBusyPostId(null);
    }
  }

  return (
    <main className="card section">
      <h2 className="section-title">Scheduled Posts</h2>
      <p className="section-copy">
        This sheet view reads directly from your FastAPI backend. It is meant to stay simple,
        readable, and easy to expand as you add retry, cancel, and publish-now actions later.
      </p>

      {error ? <div className="banner error">{error}</div> : null}

      <ScheduledPostsTable
        accounts={accounts}
        busyPostId={busyPostId}
        onCancel={handleCancel}
        onPublishNow={handlePublishNow}
        posts={posts}
      />
    </main>
  );
}
