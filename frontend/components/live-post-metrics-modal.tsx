"use client";

import { useEffect, useState } from "react";
import { fetchPostMetrics } from "@/lib/api";
import { PostLiveMetricsResponse } from "@/lib/types";

export function LivePostMetricsModal({
  postId,
  platform,
  open,
  onClose,
}: {
  postId: number;
  platform: string;
  open: boolean;
  onClose: () => void;
}) {
  const [metrics, setMetrics] = useState<PostLiveMetricsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && postId) {
      async function loadMetrics() {
        try {
          setLoading(true);
          setError(null);
          const data = await fetchPostMetrics(postId);
          setMetrics(data);
        } catch (loadError) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load live metrics.");
        } finally {
          setLoading(false);
        }
      }

      void loadMetrics();
    }
  }, [postId, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[26px] border border-[#eadfcd] bg-[#fffef9] p-6 shadow-[0_10px_24px_rgba(180,144,34,0.08)]">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-ink-900">Live Post Metrics</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-400 hover:text-ink-900"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="mt-6 flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#e1ca8b] border-t-transparent"></div>
          </div>
        ) : error ? (
          <div className="mt-4 rounded-[20px] border border-[#f4d0d0] bg-[#fff1ef] p-4 text-sm text-[#b64e48]">
            {error}
          </div>
        ) : metrics ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-[20px] border border-[#eadfcd] bg-[#fff8e8] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0e1830] text-[#6ea8fe]">
                  <span className="text-sm font-semibold capitalize">{platform.slice(0, 2)}</span>
                </div>
                <div>
                  <div className="font-semibold capitalize">{platform}</div>
                  <div className="text-sm text-ink-500">Post ID: {metrics.provider_post_id || "N/A"}</div>
                </div>
              </div>
            </div>

            {metrics.available ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(metrics.metrics).map(([key, value]) => (
                    <div key={key} className="rounded-[16px] border border-[#eee4d6] bg-[#fffef9] p-3">
                      <div className="text-sm font-medium capitalize text-ink-600">{key.replace(/_/g, ' ')}</div>
                      <div className="mt-1 text-lg font-semibold text-ink-900">{value as string}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-[20px] border border-[#f4efe4] bg-[#fff8e8] p-4 text-center text-sm text-ink-700">
                {metrics.message || "Live metrics are not available for this post."}
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-6">
          <button
            type="button"
            onClick={onClose}
            className="secondary-button w-full justify-center py-3"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}