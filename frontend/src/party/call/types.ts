export type CallStatus = "idle" | "connecting" | "connected" | "reconnecting";

export type CallTokenResponse = {
  serverUrl: string;
  token: string;
};
