type ErrorContext = {
  fallback?: string;
};

export function getReadableError(raw: string | null | undefined, context?: ErrorContext) {
  const details = (raw ?? "").trim();
  const fallback = context?.fallback ?? "Something went wrong. Please try again.";

  if (!details) {
    return { summary: fallback, details: null as string | null };
  }

  if (/bearer token is required|invalid bearer token|signature has expired/i.test(details)) {
    return {
      summary: "Your session has expired. Please sign in again and retry.",
      details,
    };
  }

  if (/failed to fetch|networkerror|network request failed/i.test(details)) {
    return {
      summary: "We couldn't reach the server. Please check the connection and try again.",
      details,
    };
  }

  if (/webview sign-in link was already used/i.test(details)) {
    return {
      summary: "This sign-in link has already been used. Please open a fresh one from the host app.",
      details,
    };
  }

  if (/webview sign-in link is invalid or expired|invalid or expired/i.test(details)) {
    return {
      summary: "This sign-in link is no longer valid. Please request a new one.",
      details,
    };
  }

  if (/creditsdepleted/i.test(details)) {
    return {
      summary: "X posting is temporarily unavailable because the connected account has no API credits left.",
      details,
    };
  }

  if (/twitter-media-initialize.*403|forbidden/i.test(details) && /twitter|x/i.test(details)) {
    return {
      summary: "X rejected the media upload for this account. Please try text-only content or reconnect the account.",
      details,
    };
  }

  if (/name 'sleep' is not defined|traceback|referenceerror|typeerror|exception/i.test(details)) {
    return {
      summary: "We hit a temporary internal issue while processing this action. Please try again.",
      details,
    };
  }

  return {
    summary: details.length > 180 ? fallback : details,
    details: details.length > 180 || details !== fallback ? details : null,
  };
}
