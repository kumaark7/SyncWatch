import { API_URL } from "../api";

export type AuthSession = {
  authenticated: boolean;
  userId: string | null;
  username: string | null;
  email: string | null;
  role: "USER" | null;
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
