"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { beginOAuthLogin, connectWordpressSite, fetchAccounts, fetchAccountStatus, getApiBaseUrl, getTenantId } from "@/lib/api";
import { ErrorNotice } from "@/components/error-notice";
import { Account, AccountStatusResponse, PlatformName } from "@/lib/types";

const platforms: Array<{ key: PlatformName; label: string; tone: string; icon: string }> = [
  { key: "facebook", label: "Facebook", tone: "bg-[#edf3ff] text-[#315ed2]", icon: "f" },
  { key: "instagram", label: "Instagram", tone: "bg-[#fff0f7] text-[#c13982]", icon: "ig" },
  { key: "linkedin", label: "LinkedIn", tone: "bg-[#eef7ff] text-[#0f6ab8]", icon: "in" },
  { key: "twitter", label: "X (Twitter)", tone: "bg-[#111111] text-white", icon: "𝕏" },
  { key: "youtube", label: "YouTube", tone: "bg-[#fff1ef] text-[#d8342b]", icon: "▶" },
  { key: "blogger", label: "Blogger", tone: "bg-[#fff2e8] text-[#ef6c00]", icon: "B" },
  { key: "google_business", label: "Google Business", tone: "bg-[#eef5ff] text-[#1a73e8]", icon: "G" },
  { key: "wordpress", label: "WordPress", tone: "bg-[#f0f3f5] text-[#1f2933]", icon: "W" },
];

const emptyStatus: AccountStatusResponse = {
  facebook: { connected: false, active_accounts: 0 },
  instagram: { connected: false, active_accounts: 0 },
  linkedin: { connected: false, active_accounts: 0 },
  twitter: { connected: false, active_accounts: 0 },
  youtube: { connected: false, active_accounts: 0 },
  blogger: { connected: false, active_accounts: 0 },
  google_business: { connected: false, active_accounts: 0 },
  wordpress: { connected: false, active_accounts: 0 },
};

function normalizePlatform(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export default function SettingsClient() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [status, setStatus] = useState<AccountStatusResponse>(emptyStatus);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  async function handleOAuthConnect(platform: PlatformName, addAnother = false) {
    try {
      setError(null);
      if (platform === "wordpress") {
        const site_url = window.prompt("WordPress site URL");
        if (!site_url) return;
        const username = window.prompt("WordPress username");
        if (!username) return;
        const application_password = window.prompt("WordPress application password");
        if (!application_password) return;
        await connectWordpressSite({ site_url, username, application_password });
        const [accountData, statusData] = await Promise.all([fetchAccounts(), fetchAccountStatus()]);
        setAccounts(accountData);
        setStatus(statusData);
        return;
      }
      await beginOAuthLogin(platform, { addAnother });
    } catch (oauthError) {
      setError(oauthError instanceof Error ? oauthError.message : "Unable to start social login.");
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const [accountData, statusData] = await Promise.all([fetchAccounts(), fetchAccountStatus()]);
        setAccounts(accountData);
        setStatus(statusData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to load settings.");
      }
    }
    void load();
  }, []);

  const activeAccounts = useMemo(() => accounts.filter(a => a.is_active), [accounts]);
  const accountsByPlatform = useMemo(
    () =>
      platforms.reduce<Record<PlatformName, Account[]>>((acc, platform) => {
        acc[platform.key] = accounts.filter((account) => normalizePlatform(account.platform) === platform.key);
        return acc;
      }, {} as Record<PlatformName, Account[]>),
    [accounts],
  );

  function accountTypeLabel(account: Account) {
    switch (account.account_type) {
      case "page":
        return "Page";
      case "business_or_creator":
        return "Professional Account";
      case "personal_profile":
        return "Profile";
      case "blog":
        return "Blog";
      case "business_location":
        return "Business location";
      case "wordpress_site":
        return "WordPress site";
      default:
        return account.account_type?.replace(/_/g, " ") ?? "Connected account";
    }
  }

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }

  const connectedCount = Object.values(status).filter(s => s.connected).length;

  return (
    <main className="flex min-h-[calc(100vh-2.5rem)] flex-col">
      <header className="border-b border-[#f0e7d7] px-5 py-5 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b3892d]">Settings</p>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.05em] text-ink-900 sm:text-4xl">Workspace Settings</h1>
        <p className="mt-1.5 text-sm leading-6 text-ink-600">
          Manage tenant details, connected platforms, and workspace configuration.
        </p>
      </header>

      <div className="flex-1 space-y-6 px-5 py-6 sm:px-8">
        <ErrorNotice error={error} fallback="We couldn't load workspace settings right now." />

        {/* Top row */}
        <div className="fade-up grid gap-6 lg:grid-cols-[1fr_1fr_1fr]">
          {/* Workspace info */}
          <div className="panel p-5 sm:p-6">
            <h2 className="font-display text-xl font-semibold tracking-[-0.04em] text-ink-900 mb-5">Workspace</h2>
            <div className="space-y-3">
              {[
                { label: "Tenant ID", value: getTenantId(), field: "tenant" },
                { label: "API Runtime", value: getApiBaseUrl(), field: "api" },
              ].map(item => (
                <div key={item.label} className="group rounded-2xl border border-[#ece2d2] bg-[#fffdf9] p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#b38d35]">{item.label}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(item.value, item.field)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity rounded-lg px-2 py-1 text-xs text-ink-500 hover:bg-[#f0ead8] hover:text-ink-900"
                    >
                      {copiedField === item.field ? "✓ Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="mt-1.5 text-sm font-medium text-ink-900 break-all leading-5">{item.value}</div>
                </div>
              ))}
              <div className="rounded-2xl border border-[#ece2d2] bg-[#fffdf9] p-3.5">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#b38d35]">Active Accounts</span>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-semibold tracking-[-0.05em] text-ink-900">{activeAccounts.length}</span>
                  <span className="text-sm text-ink-500">accounts connected</span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="panel p-5 sm:p-6">
            <h2 className="font-display text-xl font-semibold tracking-[-0.04em] text-ink-900 mb-5">Connection Overview</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl bg-[#f7f2ea] p-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.1em] text-[#b38d35]">Platforms Live</div>
                  <div className="mt-1 font-display text-3xl font-semibold tracking-[-0.05em] text-ink-900">{connectedCount}</div>
                </div>
                <div className="flex gap-1 flex-wrap justify-end max-w-[100px]">
                  {platforms.map(p => (
                    <span
                      key={p.key}
                      className={`h-7 w-7 flex items-center justify-center rounded-full text-xs font-bold ${
                        status[p.key].connected ? p.tone : "bg-[#ece5d8] text-[#bbb]"
                      }`}
                      title={p.label}
                    >
                      {p.icon.slice(0,1).toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {platforms.map(p => (
                  <div key={p.key} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-[#faf6ef] transition-colors">
                    <span className={`h-2 w-2 rounded-full flex-shrink-0 ${status[p.key].connected ? "bg-[#8dc63f]" : "bg-[#d7cdbd]"}`} />
                    <span className="flex-1 text-sm text-ink-700">{p.label}</span>
                    <span className="text-xs text-ink-500">
                      {status[p.key].active_accounts} acct{status[p.key].active_accounts !== 1 ? "s" : ""}
                    </span>
                    <span className={`text-xs font-medium ${status[p.key].connected ? "text-[#4a6d16]" : "text-[#999]"}`}>
                      {status[p.key].connected ? "✓" : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Policy links */}
          <div className="panel p-5 sm:p-6">
            <h2 className="font-display text-xl font-semibold tracking-[-0.04em] text-ink-900 mb-5">Links & Policies</h2>
            <div className="space-y-2.5">
              {[
                { href: "/privacy-policy", label: "Privacy Policy", icon: "🔒", desc: "Data usage and privacy practices" },
                { href: "/terms", label: "Terms & Conditions", icon: "📜", desc: "Usage terms and service agreement" },
              ].map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex items-start gap-3 rounded-2xl border border-[#ece2d2] bg-[#fffdf9] p-4 transition hover:border-brand-300 hover:bg-brand-50"
                >
                  <span className="text-xl">{link.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-ink-900 group-hover:text-[#9c7620] transition-colors">{link.label}</div>
                    <div className="text-xs text-ink-500 mt-0.5">{link.desc}</div>
                  </div>
                  <span className="text-ink-400 group-hover:text-[#9c7620] transition-colors">→</span>
                </Link>
              ))}
            </div>

            {/* Quick actions */}
            <div className="mt-5 rounded-[20px] border border-[#ece2d2] bg-gradient-to-br from-[#fffaf0] to-[#fff6de] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-[#b38d35] mb-2">Quick Actions</div>
              <div className="space-y-2">
                <a href="/posts" className="secondary-button w-full text-xs py-2 justify-start gap-2">
                  📋 Manage Posts Queue
                </a>
                <a href="/analytics" className="secondary-button w-full text-xs py-2 justify-start gap-2">
                  📊 View Analytics
                </a>
              </div>
            </div>
          </div>
        </div>

          {/* Channel connections (full width) */}
          <div className="fade-up fade-up-2 panel p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-semibold tracking-[-0.05em] text-ink-900">Channel Connections</h2>
                <p className="mt-1 text-sm text-ink-600">
                  Connect multiple pages, profiles, channels, and business accounts for each platform.
                </p>
              </div>
              <span className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-[#ab8b3b]">
                {activeAccounts.length} active
              </span>
            </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {platforms.map((platform, i) => {
              const connected = status[platform.key].connected;
              const activeCount = status[platform.key].active_accounts;
              const platformAccounts = accountsByPlatform[platform.key] ?? [];

              return (
                <section
                  key={platform.key}
                  style={{ animationDelay: `${0.05 + i * 0.06}s` }}
                  className={`platform-card fade-up rounded-[24px] border p-5 transition-all duration-300 ${
                    connected
                      ? "border-[#ebe3d4] bg-[linear-gradient(145deg,#fffdf9_0%,#fff7ea_100%)]"
                      : "border-dashed border-[#e6dcc8] bg-[#faf6ef]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold ${platform.tone}`}>
                        {platform.icon}
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-ink-900">{platform.label}</h3>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {platformAccounts.length
                            ? `${platformAccounts.length} connected account${platformAccounts.length === 1 ? "" : "s"}`
                            : "No connected accounts yet"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${connected ? "bg-[#eef8d8] text-[#4a6d16]" : "bg-[#ece5d8] text-[#8a806f]"}`}>
                            <span className={`h-2 w-2 rounded-full ${connected ? "bg-[#8dc63f]" : "bg-[#bfb4a2]"}`} />
                            {connected ? "Connected" : "Not connected"}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 font-medium text-ink-600 border border-[#e8decd]">
                            {activeCount} active
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleOAuthConnect(platform.key, platformAccounts.length > 0)}
                      className="secondary-button shrink-0 px-3 py-2 text-xs font-semibold"
                    >
                      {platformAccounts.length ? "Add Another" : "Connect"}
                    </button>
                  </div>

                  <div className="mt-4 rounded-[20px] border border-[#ece2d2] bg-white/80 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#b38d35]">Connected accounts</span>
                      {platformAccounts.length ? (
                        <span className="text-[11px] text-ink-500">Choose the target account later while posting</span>
                      ) : null}
                    </div>

                    {platformAccounts.length ? (
                      <div className="space-y-2">
                        {platformAccounts.map((account) => (
                          <div
                            key={account.id}
                            className="flex items-start gap-3 rounded-2xl border border-[#ece2d2] bg-[#fffdf9] px-3.5 py-3"
                          >
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${platform.tone}`}>
                              {platform.icon.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-ink-900 truncate">{account.account_name}</span>
                                <span className="rounded-full bg-[#f5efe2] px-2 py-0.5 text-[11px] font-medium text-ink-600">
                                  {accountTypeLabel(account)}
                                </span>
                                {!account.is_active ? (
                                  <span className="rounded-full bg-[#f2f2f2] px-2 py-0.5 text-[11px] font-medium text-[#666]">
                                    Inactive
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 text-xs text-ink-500 break-all">{account.platform_account_id}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-[#e5dbc8] bg-[#fcfaf5] px-4 py-6 text-center">
                        <div className="text-sm font-medium text-ink-700">No {platform.label} accounts connected</div>
                        <div className="mt-1 text-xs text-ink-500">
                          Connect one account now, then use the same button to add more pages or profiles later.
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
