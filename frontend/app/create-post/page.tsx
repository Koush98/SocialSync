"use client";

import { useRouter } from "next/navigation";

import { PostComposerModal } from "@/components/post-composer-modal-v2";

export default function CreatePostPage() {
  const router = useRouter();

  return (
    <>
      <main className="flex min-h-[calc(100vh-2.5rem)] items-center justify-center px-5 py-8 sm:px-8">
        <div className="panel max-w-2xl p-8 text-center">
          <p className="mb-2 text-sm font-medium text-[#b3892d]">Create Post</p>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.06em] text-ink-900">
            Open the universal composer
          </h1>
          <p className="mt-3 text-sm leading-7 text-ink-600">
            This route opens the same post composer used from the dashboard and scheduled pages,
            with platform-specific settings, media upload, and scheduling.
          </p>
        </div>
      </main>

      <PostComposerModal
        open
        onClose={() => router.push("/")}
        onCreated={async () => {
          router.push("/posts");
        }}
      />
    </>
  );
}
