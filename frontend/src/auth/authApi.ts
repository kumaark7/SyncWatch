import { API_URL } from "../api";

export type AuthSession = {
  authenticated: boolean;
  username: string | null;
  role: "ADMIN" | "GUEST" | null;
  allowedRoomId: string | null;
  displayName: string | null;
  clientId: string | null;
};

export async function getAuthSession() {
  const response = await fetch(`${API_URL}/api/auth/session`, {
    credentials: "include"
  });

  if (!response.ok) {
    return {
      authenticated: false,
      username: null,
      role: null,
      allowedRoomId: null,
      displayName: null,
      clientId: null
    };
  }

  return response.json() as Promise<AuthSession>;
}

export async function login(username: string, password: string) {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    throw new Error("Invalid username or password");
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

export async function checkGuestRoom(roomId: string) {
  const response = await fetch(
    `${API_URL}/api/auth/guest-room/${encodeURIComponent(roomId)}`,
    { credentials: "include" }
  );

  return response.ok;
}

export async function joinAsGuest(roomId: string, displayName: string) {
  const response = await fetch(`${API_URL}/api/auth/guest`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ roomId, displayName })
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Could not join watch party");
  }

  return response.json() as Promise<AuthSession>;
}
