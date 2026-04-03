import { Account, AccountStatusResponse, MediaAsset, Post } from "@/lib/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "tenant_123";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "X-Tenant-ID": TENANT_ID,
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json() as Promise<T>;
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function getTenantId() {
  return TENANT_ID;
}

export function getOAuthLoginUrl(platform: string) {
  const oauthPlatform = platform === "youtube" ? "google" : platform;
  return `${API_BASE_URL}/api/v1/oauth/${oauthPlatform}/login?tenant_id=${TENANT_ID}`;
}

export function fetchAccountStatus() {
  return apiFetch<AccountStatusResponse>("/api/v1/accounts/status");
}

export function fetchAccounts() {
  return apiFetch<Account[]>("/api/v1/accounts/");
}

export function fetchMedia() {
  return apiFetch<MediaAsset[]>("/api/v1/media/");
}

export function uploadMedia(formData: FormData) {
  return apiFetch<MediaAsset>("/api/v1/media/upload", {
    method: "POST",
    body: formData,
  });
}

export function fetchPosts() {
  return apiFetch<Post[]>("/api/v1/posts/");
}

export function createPost(payload: {
  social_account_id: number;
  content: string;
  scheduled_at: string | null;
  media_ids: number[];
  platform_options: Record<string, unknown>;
}) {
  return apiFetch<{ post_id: number; status: string }>("/api/v1/posts/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function publishPostNow(postId: number) {
  return apiFetch<{ post_id: number; status: string; task_id: string | null }>(
    `/api/v1/posts/${postId}/publish-now`,
    {
      method: "POST",
    },
  );
}

export function cancelPost(postId: number) {
  return apiFetch<{ post_id: number; status: string; task_id: string | null }>(
    `/api/v1/posts/${postId}/cancel`,
    {
      method: "POST",
    },
  );
}
