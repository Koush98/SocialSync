"use client";

import { getReadableError } from "@/lib/error-utils";

type Props = {
  error: string | null | undefined;
  fallback?: string;
  compact?: boolean;
};

export function ErrorNotice({ error, fallback, compact = false }: Props) {
  if (!error) {
    return null;
  }

  const normalized = getReadableError(error, { fallback });

  return (
    <div className="rounded-2xl border border-[#f1d3d0] bg-[#fff4f3] px-4 py-3 text-[#a54848] shadow-sm">
      <div className={`flex items-start gap-3 ${compact ? "text-xs" : "text-sm"}`}>
        <span className="mt-0.5 text-base">!</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-6">{normalized.summary}</p>
          {normalized.details && normalized.details !== normalized.summary ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-[#8b3f3a] hover:text-[#6f2f2b]">
                See logs
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-xl bg-white/70 p-3 text-[11px] leading-5 text-[#8b3f3a] whitespace-pre-wrap break-words">
                {normalized.details}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
