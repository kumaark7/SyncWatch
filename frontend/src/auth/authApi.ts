import { API_URL } from "../api";
import { browserRequest as fetch } from "./browserRequest";

export type AuthSession = {
  authenticated: boolean;
  userId: string | null;
  username: string | null;
  email: string | null;
  role: "USER" | "GUEST" | null;
  allowedRoomId: string | null;
  displayName: string | null;
  clientId: string | null;
};

let pendingSession: Promise<AuthSession> | null = null;

export function getAuthSession(): Promise<AuthSession> {
  if (!pendingSession) {
    // Share Strict Mode/focus checks and serialize cookie rotation across supported browser tabs.
    const read = Promise.resolve(typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request("syncwatch.auth-session", readAuthSession)
      : readAuthSession());
    pendingSession = read.finally(() => { pendingSession = null; });
  }
  return pendingSession;
}

async function readAuthSession(): Promise<AuthSession> {
  const response = await fetch(`${API_URL}/api/auth/session`, {
    credentials: "include"
  });

  if (!response.ok) {
    return {
      authenticated: false,
      userId: null,
      username: null,
      email: null,
      role: null,
      allowedRoomId: null,
      displayName: null,
      clientId: null
    };
  }

  return response.json() as Promise<AuthSession>;
}

async function authError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return new Error(body?.error || fallback);
}

export async function requestPasswordReset(email: string) {
  const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email })
  });

  if (!response.ok) {
    throw await authError(response, "Could not request a password reset");
  }
  return response.json() as Promise<{ message: string }>;
}

export async function resetPassword(
  token: string,
  password: string,
  confirmPassword: string
) {
  const response = await fetch(`${API_URL}/api/auth/reset-password`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ token, password, confirmPassword })
  });

  if (!response.ok) {
    throw await authError(response, "The reset link is invalid or has expired.");
  }
  return response.json() as Promise<{ message: string }>;
}

export async function login(
  identifier: string,
  password: string,
  rememberMe: boolean
) {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ identifier, password, rememberMe })
  });

  if (!response.ok) {
    throw await authError(response, "Invalid email, username, or password");
  }

  return response.json() as Promise<AuthSession>;
}

export async function signUp(
  username: string,
  email: string,
  password: string,
  confirmPassword: string,
  rememberMe: boolean
) {
  const response = await fetch(`${API_URL}/api/auth/signup`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username,
      email,
      password,
      confirmPassword,
      rememberMe
    })
  });

  if (!response.ok) {
    throw await authError(response, "Could not create account");
  }

  return response.json() as Promise<AuthSession>;
}

export type GuestRoom = {
  roomId: string;
  roomName: string;
};

export async function getGuestRoom(roomId: string) {
  const response = await fetch(
    `${API_URL}/api/auth/guest/rooms/${encodeURIComponent(roomId)}`,
    { credentials: "include" }
  );

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Could not check this room");
  }
  return response.json() as Promise<GuestRoom>;
}

export async function joinGuest(roomId: string, displayName: string) {
  const response = await fetch(`${API_URL}/api/auth/guest`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ roomId, displayName })
  });

  if (!response.ok) {
    throw await authError(response, response.status === 404
      ? "Room not found"
      : "Could not join this room");
  }
  return response.json() as Promise<AuthSession>;
}

export async function logout() {
  const response = await fetch(`${API_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error("Could not log out");
  }

  return response.json() as Promise<AuthSession>;
}
