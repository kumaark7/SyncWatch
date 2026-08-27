import { API_URL } from "../api";

export type AuthSession = {
  authenticated: boolean;
  username: string | null;
};

export async function getAuthSession() {
  const response = await fetch(`${API_URL}/api/auth/session`, {
    credentials: "include"
  });

  if (!response.ok) {
    return { authenticated: false, username: null };
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
