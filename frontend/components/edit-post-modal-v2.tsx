"use client";

import { useEffect, useState } from "react";

import { updatePost } from "@/lib/api";
import { Post } from "@/lib/types";

function toLocalDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
}

type Props = {
  post: Post | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

export function EditPostModal({ post, onClose, onSaved }: Props) {
  const [content, setContent] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!post) return;
    setContent(post.content ?? "");
    setScheduledAt(toLocalDateTime(post.scheduled_at));
    setError(null);
  }, [post]);

  if (!post) return null;

  async function handleSave() {
    if (!post) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await updatePost(post.id, { content, scheduled_at: scheduledAt || null });
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update post.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(20,20,20,0.42)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-[640px] rounded-[30px] border border-white/70 bg-white p-6 shadow-[0_30px_80px_rgba(18,18,18,0.22)] sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-medium text-[#b3892d]">Edit Scheduled Post</p>
            <h2 className="font-display text-3xl font-semibold tracking-[-0.06em] text-ink-900">Update content or timing</h2>
          </div>
          <button type="button" onClick={onClose} className="secondary-button h-11 w-11 rounded-2xl p-0">×</button>
        </div>

        {error ? <div className="mb-4 rounded-2xl border border-[#f1d3d0] bg-[#fff4f3] px-4 py-3 text-sm text-[#a54848]">{error}</div> : null}

        <div className="space-y-4">
          <textarea value={content} onChange={(event) => setContent(event.target.value)} className="field-input min-h-[170px] resize-none" />
          <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="field-input" />
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void handleSave()} disabled={saving} className="primary-button px-6">
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button type="button" onClick={onClose} disabled={saving} className="secondary-button px-6">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
