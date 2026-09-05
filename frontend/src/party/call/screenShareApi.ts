import { API_URL } from "../../api";

export type ScreenShareState = {
  activeClientId: string | null;
  activeDisplayName: string | null;
  guestScreenSharingAllowed: boolean;
};

type AuthenticatedFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

async function requestState(
  authenticatedFetch: AuthenticatedFetch,
  path: string,
  init: RequestInit
) {
  const response = await authenticatedFetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Screen sharing could not be updated");
  }
  return response.json() as Promise<ScreenShareState>;
}

export function claimScreenShare(
  authenticatedFetch: AuthenticatedFetch,
  roomId: string,
  clientId: string
) {
  return requestState(
    authenticatedFetch,
    `/api/rooms/${encodeURIComponent(roomId)}/screen-share/start`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId })
    }
  );
}

export function releaseScreenShare(
  authenticatedFetch: AuthenticatedFetch,
  roomId: string,
  clientId: string,
  keepalive = false
) {
  return requestState(
    authenticatedFetch,
    `/api/rooms/${encodeURIComponent(roomId)}/screen-share/stop`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
      keepalive
    }
  );
}

export function setGuestScreenSharing(
  authenticatedFetch: AuthenticatedFetch,
  roomId: string,
  clientId: string,
  allowed: boolean
) {
  return requestState(
    authenticatedFetch,
    `/api/rooms/${encodeURIComponent(roomId)}/screen-share/guest-access`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, allowed })
    }
  );
}
