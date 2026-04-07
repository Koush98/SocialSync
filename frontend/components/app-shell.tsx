"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PostComposerModal } from "@/components/post-composer-modal-v2";

const navigation = [
  { href: "/", label: "Dashboard", icon: "⊞" },
  { href: "/posts", label: "Scheduled Posts", icon: "📅" },
  { href: "/analytics", label: "Analytics", icon: "📊" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

function LogoMark() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-br from-brand-300 to-brand-400 shadow-[0_8px_20px_rgba(244,180,0,0.3)]">
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-ink-900" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 6.32 17.75l2.67 1.33a1 1 0 0 0 1.45-1.1l-.9-3.58A9.98 9.98 0 0 0 12 2Zm0 4.25a5.75 5.75 0 1 1 0 11.5 5.75 5.75 0 0 1 0-11.5Z" />
      </svg>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [composerOpen, setComposerOpen] = useState(false);

  return (
    <>
    <div className="mx-auto flex min-h-screen w-full max-w-[1440px] gap-5 px-4 py-5 lg:px-6">
      {/* Sidebar */}
      <aside className="app-surface sticky top-5 hidden h-[calc(100vh-2.5rem)] w-[240px] shrink-0 flex-col justify-between p-5 lg:flex">
        <div className="space-y-7">
          {/* Brand */}
          <div className="flex items-center gap-3 px-1">
            <LogoMark />
            <div>
              <div className="font-display text-[26px] font-semibold tracking-[-0.06em] text-ink-900 leading-tight">
                Snapkey.
              </div>
              <p className="text-xs text-ink-500">Social Publishing</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="space-y-1.5">
            {/* Create Post Button */}
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="group flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-brand-300 via-brand-200 to-[#f6cd48] px-4 py-3 text-sm font-semibold text-ink-900 shadow-[0_8px_20px_rgba(244,180,0,0.22)] transition-all duration-200 hover:shadow-[0_14px_28px_rgba(244,180,0,0.30)] hover:-translate-y-0.5 active:translate-y-0 mb-3"
            >
              <span className="text-lg group-hover:rotate-90 transition-transform duration-300">+</span>
              <span className="flex-1 text-left">Create Post</span>
            </button>

            {navigation.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-150 ${
                    active
                      ? "bg-brand-200/70 text-ink-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                      : "text-ink-600 hover:bg-[#faf6ef] hover:text-ink-900 hover:translate-x-0.5"
                  }`}
                >
                  <span className={`text-base transition-transform duration-150 ${active ? "scale-110" : "group-hover:scale-110"}`}>
                    {item.icon}
                  </span>
                  <span className="flex-1">{item.label}</span>
                  {active && <span className="h-2 w-2 rounded-full bg-ink-900" />}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom */}
        <div className="space-y-3">
          <div className="rounded-[20px] border border-[#eee4d4] bg-gradient-to-br from-[#fffaf0] to-[#fff6de] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.1em] text-[#b38d35] mb-2">Pro Features</div>
            <p className="text-xs leading-5 text-ink-600">Analytics, team collaboration, and priority scheduling.</p>
            <button type="button" className="primary-button mt-3 w-full py-2.5 text-xs">
              Upgrade to Pro
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 flex-1">
        <div className="app-surface min-h-[calc(100vh-2.5rem)] overflow-hidden">
          {children}
        </div>
      </div>
    </div>

    {/* Create Post Modal */}
    <PostComposerModal open={composerOpen} onClose={() => setComposerOpen(false)} />
    </>
  );
}
