const NETWORK_ERROR_PATTERN = /failed to fetch|fetch failed|load failed|network(?:error| request failed)|connection (?:was )?(?:refused|reset)/i;

const OFFLINE_MESSAGE = "You're offline. Reconnect to the internet and try again.";
const NETWORK_MESSAGE = "SyncWatch couldn't reach the server. Check your connection and try again.";

function browserIsOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function userErrorMessage(
  cause: unknown,
  fallback: string,
  online = browserIsOnline()
) {
  if (!online) {
    return OFFLINE_MESSAGE;
  }

  if (cause instanceof Error) {
    if (cause.name === "AbortError") {
      return "The request was interrupted. Please try again.";
    }
    if (cause.name === "NotAllowedError") {
      return "Browser permission was blocked. Allow access and try again.";
    }
    if (NETWORK_ERROR_PATTERN.test(cause.message)) {
      return NETWORK_MESSAGE;
    }

    const message = cause.message.trim();
    if (message) {
      return message;
    }
  }

  return fallback;
}

export const USER_OFFLINE_MESSAGE = OFFLINE_MESSAGE;
