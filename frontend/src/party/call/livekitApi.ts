import { API_URL } from "../../api";
import type { CallTokenResponse } from "./types";

export async function requestCallToken(roomId: string, clientId: string) {
  const response = await fetch(
    `${API_URL}/api/rooms/${encodeURIComponent(roomId)}/call/token?clientId=${encodeURIComponent(clientId)}`,
    { credentials: "include" }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Could not join room call");
  }

  return response.json() as Promise<CallTokenResponse>;
}
