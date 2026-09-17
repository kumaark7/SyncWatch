import { API_URL } from "./api";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

type AuthenticatedFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export type GoogleDriveConnection = {
  accessToken: string;
  expiresAt: number;
};

export class GoogleDriveConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleDriveConnectionError";
  }
}

export function googleDriveApisReady() {
  return Boolean(window.google?.accounts?.oauth2 && window.gapi);
}

async function exchangeAuthorizationCode(
  authenticatedFetch: AuthenticatedFetch,
  code: string
) {
  const response = await authenticatedFetch(`${API_URL}/api/google/code`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XmlHttpRequest"
    },
    body: JSON.stringify({
      code,
      redirectUri: window.location.origin
    })
  });
  const result = await response.json().catch(() => null);
  if (
    !response.ok
    || result?.connected !== true
    || typeof result.accessToken !== "string"
    || !Number.isFinite(Number(result.expiresAt))
  ) {
    throw new GoogleDriveConnectionError(
      "Could not save Google Drive authorization. Please try again."
    );
  }

  return {
    accessToken: result.accessToken,
    expiresAt: Number(result.expiresAt)
  } satisfies GoogleDriveConnection;
}

export function requestGoogleDriveAuthorizationCode(
  authenticatedFetch: AuthenticatedFetch,
  confirmSession: () => Promise<boolean>
) {
  return new Promise<GoogleDriveConnection | null>((resolve, reject) => {
    if (!CLIENT_ID) {
      reject(new GoogleDriveConnectionError("Google Drive is not configured."));
      return;
    }
    if (!googleDriveApisReady()) {
      reject(new GoogleDriveConnectionError(
        "Google Drive is still loading. Please try again."
      ));
      return;
    }

    try {
      const codeClient = window.google.accounts.oauth2.initCodeClient({
        client_id: CLIENT_ID,
        scope: DRIVE_SCOPE,
        ux_mode: "popup",
        select_account: false,
        callback: async (codeResponse: { code?: string; error?: string }) => {
          if (codeResponse.error || !codeResponse.code) {
            reject(new GoogleDriveConnectionError(
              "Google Drive authorization failed. Please try again."
            ));
            return;
          }

          try {
            if (!await confirmSession()) {
              resolve(null);
              return;
            }
            resolve(await exchangeAuthorizationCode(authenticatedFetch, codeResponse.code));
          } catch (error) {
            reject(error instanceof GoogleDriveConnectionError
              ? error
              : new GoogleDriveConnectionError(
                  "Could not connect Google Drive. Please try again."
                ));
          }
        },
        error_callback: () => resolve(null)
      });

      codeClient.requestCode();
    } catch {
      reject(new GoogleDriveConnectionError(
        "Could not open Google Drive authorization. Please try again."
      ));
    }
  });
}

export async function getGoogleDriveAccountStatus(
  authenticatedFetch: AuthenticatedFetch
) {
  const response = await authenticatedFetch(`${API_URL}/api/google/connection`, {
    credentials: "include"
  });
  if (!response.ok) {
    throw new GoogleDriveConnectionError(
      "Could not check Google Drive right now. Please try again."
    );
  }

  const result = await response.json().catch(() => null);
  if (typeof result?.connected !== "boolean") {
    throw new GoogleDriveConnectionError(
      "Could not check Google Drive right now. Please try again."
    );
  }
  return { connected: result.connected };
}

export async function connectGoogleDriveAccount(
  authenticatedFetch: AuthenticatedFetch,
  confirmSession: () => Promise<boolean>
) {
  const connection = await requestGoogleDriveAuthorizationCode(
    authenticatedFetch,
    confirmSession
  );
  return connection ? { connected: true } : null;
}

export async function disconnectGoogleDriveAccount(
  authenticatedFetch: AuthenticatedFetch
) {
  const response = await authenticatedFetch(`${API_URL}/api/google/connection`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) {
    throw new GoogleDriveConnectionError(
      "Could not disconnect Google Drive right now. Please try again."
    );
  }
  return { connected: false };
}
