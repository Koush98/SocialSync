"use client";

import { PlatformName } from "@/lib/types";

export function PlatformLogo({ platform, className = "h-6 w-6" }: { platform: PlatformName; className?: string }) {
  switch (platform) {
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
          <path d="M13.6 22v-8.2h2.8l.4-3.2h-3.2V8.5c0-.9.3-1.6 1.7-1.6h1.7V4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.4v2.4H8v3.2h2.8V22h2.8Z" />
        </svg>
      );
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4.5" y="4.5" width="15" height="15" rx="4.25" />
          <circle cx="12" cy="12" r="3.6" />
          <circle cx="17.1" cy="6.9" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "linkedin":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
          <path d="M6.4 8.2a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6Zm-1.6 2.1H8v9.3H4.8v-9.3Zm5 0H13v1.3h.1c.4-.8 1.5-1.7 3-1.7 3.2 0 3.8 2.1 3.8 4.9v4.8h-3.3v-4.2c0-1 0-2.3-1.4-2.3s-1.6 1.1-1.6 2.2v4.3h-3.3v-9.3Z" />
        </svg>
      );
    case "twitter":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
          <path d="M17.8 4.5h2.7l-5.9 6.7 6.9 8.3H16l-4.2-5-4.4 5H4.7l6.3-7.2-6.6-7.9H10l3.8 4.6 4-4.5Zm-.9 13.4h1.5L9.2 6h-1.6l9.3 11.9Z" />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
          <path d="M20.4 8.1a2.7 2.7 0 0 0-1.9-1.9C16.8 5.7 12 5.7 12 5.7s-4.8 0-6.5.5a2.7 2.7 0 0 0-1.9 1.9c-.5 1.7-.5 3.9-.5 3.9s0 2.2.5 3.9a2.7 2.7 0 0 0 1.9 1.9c1.7.5 6.5.5 6.5.5s4.8 0 6.5-.5a2.7 2.7 0 0 0 1.9-1.9c.5-1.7.5-3.9.5-3.9s0-2.2-.5-3.9ZM10.4 14.6V9.4l4.6 2.6-4.6 2.6Z" />
        </svg>
      );
    case "blogger":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
          <path d="M6 4.5h7.5a4.5 4.5 0 0 1 4.5 4.5v.8a1.2 1.2 0 0 0 1.2 1.2h.3v4A4.5 4.5 0 0 1 15 19.5H9A4.5 4.5 0 0 1 4.5 15V6A1.5 1.5 0 0 1 6 4.5Zm3 5.3h4.6a1 1 0 1 0 0-2H9a1 1 0 1 0 0 2Zm0 4.2h6a1 1 0 1 0 0-2H9a1 1 0 1 0 0 2Z" />
        </svg>
      );
    case "google_business":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
          <path d="M4.5 6A1.5 1.5 0 0 1 6 4.5h12A1.5 1.5 0 0 1 19.5 6v12A1.5 1.5 0 0 1 18 19.5H6A1.5 1.5 0 0 1 4.5 18V6Zm3 2.2V15h3.7c2.9 0 4.8-1.4 4.8-3.4 0-1.2-.7-2.1-1.8-2.6.7-.5 1.1-1.2 1.1-2.1 0-1.7-1.4-2.7-3.9-2.7H7.5Zm2.3 2h1.8c.9 0 1.4.4 1.4 1s-.5 1-1.4 1H9.8v-2Zm0-3.8h1.5c.8 0 1.2.3 1.2.9 0 .5-.4.9-1.2.9H9.8V6.4Z" />
        </svg>
      );
    case "wordpress":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
          <path d="M12 4.5A7.5 7.5 0 1 0 19.5 12 7.5 7.5 0 0 0 12 4.5Zm0 13.2a5.7 5.7 0 0 1-2.8-.7l3-8.3c.4 0 .8 0 1.1-.1-.3-.1-.9-.1-1.5-.1-.5 0-.9 0-1.2.1A5.8 5.8 0 0 1 16 8.3l.1.1c-.4 0-.8.1-1.1.1-.4 0-.7.3-.6.7l1.9 5.5a5.7 5.7 0 0 1-4.3 3ZM7.7 8.9c0-.2 0-.5.1-.7l2.3 6.4-1 2.8A5.7 5.7 0 0 1 7.7 8.9Zm9.6 6-.6-1.8c.3-.8.5-1.6.5-2.3 0-.9-.3-1.5-.6-2-.2-.3-.3-.5-.3-.8 0-.3.2-.6.6-.6h.1a5.7 5.7 0 0 1 .3 7.5Z" />
        </svg>
      );
    default:
      return null;
  }
}
