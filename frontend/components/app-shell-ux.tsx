"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useState } from "react";

import { PostComposerModal } from "@/components/post-composer-modal-v2";
import { clearStoredAuthToken, logoutSession } from "@/lib/api";

const navigation = [
  { href: "/posts", label: "Scheduled Posts", icon: "clock" },
  { href: "/connections", label: "Social Accounts", icon: "spark" },
] as const;

function LogoMark() {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-[#e6cf7b] bg-[linear-gradient(135deg,#ffd84d,#f5c800)] shadow-[0_12px_26px_rgba(245,200,0,0.24)]">
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-ink-900" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
        <path d="M7 12h10M12 7v10" />
        <path d="M4.5 9.5A2.5 2.5 0 0 1 7 7h2" />
        <path d="M19.5 14.5A2.5 2.5 0 0 1 17 17h-2" />
      </svg>
    </div>
  );
}

function NavIcon({ icon }: { icon: (typeof navigation)[number]["icon"] }) {
  const shared = { viewBox: "0 0 24 24", className: "h-5 w-5", "aria-hidden": true, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (icon === "spark") return <svg {...shared}><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6 6 2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" /></svg>;
  if (icon === "clock") return <svg {...shared}><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></svg>;
  return <svg {...shared}><circle cx="12" cy="12" r="3" /><path d="M12 4.5v2.1M12 17.4v2.1M19.5 12h-2.1M6.6 12H4.5M17.3 6.7l-1.5 1.5M8.2 15.8l-1.5 1.5M17.3 17.3l-1.5-1.5M8.2 8.2 6.7 6.7" /></svg>;
}

export function AppShellUx({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [composerOpen, setComposerOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function handleLogout() {
    clearStoredAuthToken();
    try {
      await logoutSession();
    } catch {
      // Frontend logout should still work if cookie cleanup fails.
    }
    router.replace("/login");
  }

  if (pathname === "/login" || pathname === "/webview-auth") {
    return <>{children}</>;
  }

      return (
    <>
      <div className="sticky top-0 z-40 border-b border-[#f0e2b2] bg-[rgba(255,251,240,0.92)] px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3">
          <button type="button" onClick={() => setMobileMenuOpen(true)} className="secondary-button h-11 w-11 rounded-2xl p-0" aria-label="Open navigation">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><line x1="2" y1="4.5" x2="16" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="2" y1="13.5" x2="16" y2="13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          <div className="flex items-center gap-3"><LogoMark /><div className="hidden sm:block"><div className="font-display text-xl font-semibold tracking-[-0.06em] text-ink-900">Snapkey</div><div className="text-[10px] uppercase tracking-[0.22em] text-[#8c6f00]">Social Suite</div></div></div>
          <button type="button" onClick={() => setComposerOpen(true)} className="primary-button h-11 px-4 py-0 text-xs">+ New Post</button>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 bg-[rgba(17,17,17,0.18)] backdrop-blur-sm lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <aside className="h-full w-[84%] max-w-[320px] border-r border-[#f0e2b2] bg-[#fffdf8] px-5 py-5 shadow-[0_18px_50px_rgba(180,144,34,0.16)]" onClick={(event) => event.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3"><LogoMark /><div><div className="font-display text-2xl font-semibold tracking-[-0.06em] text-ink-900">Snapkey</div><p className="text-xs uppercase tracking-[0.2em] text-[#8c6f00]">Workspace menu</p></div></div>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="secondary-button h-11 w-11 rounded-2xl p-0" aria-label="Close navigation"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="14" y1="2" x2="2" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
            </div>
            <nav className="space-y-2">{navigation.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium ${active ? "bg-[#fff2b8] text-[#8c6f00]" : "text-ink-700 hover:bg-[#fff7d1] hover:text-ink-900"}`} onClick={() => setMobileMenuOpen(false)}><NavIcon icon={item.icon} /><span className="flex-1">{item.label}</span>{active ? <span className="h-2 w-2 rounded-full bg-brand-300" /> : null}</Link>;
            })}</nav>
            <button type="button" onClick={handleLogout} className="secondary-button mt-6 w-full justify-center py-3 text-sm">Sign Out</button>
          </aside>
        </div>
      ) : null}

      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] gap-4 px-4 pb-24 pt-5 lg:px-6 lg:pb-5">
        <aside className="hidden w-[220px] shrink-0 lg:block">
          <div className="app-surface sticky top-5 flex h-[calc(100vh-2.5rem)] flex-col justify-between p-4">
            <div>
              <div className="mb-6 flex items-center gap-3"><LogoMark /><div><div className="font-display text-[22px] font-semibold tracking-[-0.06em] text-ink-900">Snapkey</div><div className="text-[10px] uppercase tracking-[0.24em] text-ink-600">Social Suite</div></div></div>
              <nav className="space-y-1.5">
                {navigation.map((item) => {
                  const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                  return (
                    <Link key={item.href} href={item.href} className={`group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all ${active ? "bg-[#fff2b8] text-[#8c6f00] shadow-[0_10px_24px_rgba(245,200,0,0.18)]" : "text-ink-700 hover:bg-[#fff7d1]"}`}>
                      <NavIcon icon={item.icon} />
                      <span className="flex-1">{item.label}</span>
                      {active ? <span className="rounded-full bg-brand-300 px-2 py-0.5 text-[11px] font-semibold text-[#09090e]">Active</span> : null}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="space-y-3">
              <button type="button" onClick={handleLogout} className="secondary-button w-full justify-center">Sign Out</button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>

      <nav className="fixed inset-x-4 bottom-4 z-40 rounded-[26px] border border-[#f0e2b2] bg-[rgba(255,251,240,0.96)] p-2 shadow-[0_18px_40px_rgba(180,144,34,0.14)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-5 gap-1">
          {navigation.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={`flex flex-col items-center justify-center rounded-[18px] px-2 py-2 text-[11px] font-medium ${active ? "bg-[#fff2b8] text-[#8c6f00]" : "text-ink-600 hover:bg-[#fff7d1] hover:text-ink-900"}`}>
                <NavIcon icon={item.icon} />
                <span className="mt-1">{item.label.replace("Scheduled ", "")}</span>
                {active ? <span className="mt-0.5 h-1 w-1 rounded-full bg-brand-300 block" /> : null}
              </Link>
            );
          })}
        </div>
      </nav>

      <PostComposerModal open={composerOpen} onClose={() => setComposerOpen(false)} />
    </>
  );
}
