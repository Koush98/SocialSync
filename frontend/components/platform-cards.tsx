"use client";

import { useState } from "react";

import { beginOAuthLogin, connectWordpressSite } from "@/lib/api";
import { Account, AccountStatusResponse, PlatformName } from "@/lib/types";

const platforms: Array<{
  key: PlatformName;
  label: string;
  description: string;
  supportedTypes: string;
  unsupportedMessage: string;
  connectLabel: string;
}> = [
  {
    key: "facebook",
    label: "Facebook",
    description: "Manage page publishing, engagement flows, and Meta-linked distribution.",
    supportedTypes: "Supported: Facebook Pages. Multiple pages per tenant are allowed.",
    unsupportedMessage: "Personal Facebook profile posting is not supported by the Meta publishing flow.",
    connectLabel: "Connect pages",
  },
  {
    key: "instagram",
    label: "Instagram",
    description: "Handle visual campaigns, reels, and Instagram professional publishing.",
    supportedTypes: "Supported: Instagram Business or Creator accounts linked to a Facebook Page.",
    unsupportedMessage: "Personal Instagram accounts cannot be used for Graph API publishing.",
    connectLabel: "Connect professional account",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    description: "Deliver professional updates, company posts, and high-intent social reach.",
    supportedTypes: "Supported: LinkedIn personal profiles and organization pages available to the signed-in admin account.",
    unsupportedMessage: "If a company page is missing after connect, the LinkedIn user usually needs the correct page admin/content role on that organization.",
    connectLabel: "Connect profile or page",
  },
  {
    key: "twitter",
    label: "X / Twitter",
    description: "Coordinate fast updates, campaign reactions, and conversational brand posts.",
    supportedTypes: "Supported: personal or brand-managed X accounts connected through the account owner.",
    unsupportedMessage: "Each account connects individually, and multiple accounts can live in one tenant workspace.",
    connectLabel: "Connect X account",
  },
  {
    key: "youtube",
    label: "YouTube",
    description: "Prepare video publishing workflows using the connected Google channel.",
    supportedTypes: "Supported: YouTube channels attached to the authenticated Google account.",
    unsupportedMessage: "Each Google account can expose one or more managed channels, stored separately in this tenant.",
    connectLabel: "Connect channel",
  },
  {
    key: "blogger",
    label: "Blogger",
    description: "Publish blog articles to Blogger blogs available under the connected Google account.",
    supportedTypes: "Supported: Blogger blogs where the authenticated Google account has admin access.",
    unsupportedMessage: "Supports text, image, and video embeds from connected media URLs.",
    connectLabel: "Connect Blogger blogs",
  },
  {
    key: "google_business",
    label: "Google Business",
    description: "Share business updates to connected Google Business Profile locations.",
    supportedTypes: "Supported: Google Business Profile locations visible to the authenticated Google account.",
    unsupportedMessage: "Supports text plus one image or one video per local post.",
    connectLabel: "Connect locations",
  },
  {
    key: "wordpress",
    label: "WordPress",
    description: "Publish website articles through a WordPress site using an Application Password.",
    supportedTypes: "Supported: self-hosted or WordPress.com sites with REST API and Application Password access.",
    unsupportedMessage: "Use a site URL, username, and application password to connect each WordPress site separately.",
    connectLabel: "Connect WordPress site",
  },
];

export function PlatformCards({
  accountStatus,
  accounts,
}: {
  accountStatus: AccountStatusResponse;
  accounts: Account[];
}) {
  const [error, setError] = useState<string | null>(null);

  function normalizePlatform(value: string | null | undefined) {
    return (value ?? "").trim().toLowerCase();
  }

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
        window.location.reload();
        return;
      }
      await beginOAuthLogin(platform, { addAnother });
    } catch (oauthError) {
      setError(oauthError instanceof Error ? oauthError.message : "Unable to start social login.");
    }
  }

  return (
    <div className="grid three">
      {error ? (
        <div className="empty" style={{ gridColumn: "1 / -1", padding: 16, textAlign: "left" }}>
          {error}
        </div>
      ) : null}
      {platforms.map((platform) => {
        const state = accountStatus[platform.key];
        const isConnected = state.connected;
        const platformAccounts = accounts.filter((account) => normalizePlatform(account.platform) === platform.key);

        return (
          <article
            key={platform.key}
            className={`platform-card${isConnected ? " connected" : ""}`}
          >
            <div className="platform-head">
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-display), sans-serif",
                    letterSpacing: "-0.03em",
                  }}
                >
                  {platform.label}
                </h3>
                <p className="meta" style={{ margin: "8px 0 0" }}>
                  {platform.description}
                </p>
              </div>
              <span className={`pill${isConnected ? " connected" : ""}`}>
                {isConnected ? "Connected" : "Not connected"}
              </span>
            </div>

            <div className="meta">
              Active workspace accounts: <strong>{state.active_accounts}</strong>
            </div>

            <div className="meta" style={{ lineHeight: 1.55 }}>
              <strong style={{ color: "var(--text)" }}>Allowed account types:</strong>{" "}
              {platform.supportedTypes}
            </div>

            <div className="meta" style={{ lineHeight: 1.55 }}>
              <strong style={{ color: "var(--text)" }}>Connection note:</strong>{" "}
              {platform.unsupportedMessage}
            </div>

            {platformAccounts.length ? (
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  padding: "12px 14px",
                  borderRadius: 16,
                  border: "1px solid var(--line)",
                  background: "rgba(255, 255, 255, 0.8)",
                }}
              >
                <div className="meta" style={{ color: "var(--text)", fontWeight: 700 }}>
                  Connected account{platformAccounts.length === 1 ? "" : "s"}
                </div>
                {platformAccounts.map((account) => (
                  <div
                    key={account.id}
                    style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {account.account_name}
                      </div>
                      <div className="meta" style={{ fontSize: "0.84rem" }}>
                        {account.account_type
                          ? account.account_type.replace(/_/g, " ")
                          : "connected account"}
                      </div>
                    </div>
                    <span className={`pill${account.is_active ? " connected" : ""}`}>
                      {account.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty" style={{ padding: 16, textAlign: "left" }}>
                No accounts linked yet for {platform.label}. Once connected, page or account names
                will appear here.
              </div>
            )}

            <div className="cta-row">
              <button
                type="button"
                className="btn primary"
                onClick={() => void handleOAuthConnect(platform.key, platformAccounts.length > 0)}
              >
                {isConnected ? `Add another ${platform.label} account` : platform.connectLabel}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
