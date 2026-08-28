export type CallStatus = "idle" | "connecting" | "connected" | "reconnecting";

export type AudioProcessingSetting =
  | "noiseSuppression"
  | "echoCancellation"
  | "autoGainControl";

export type VideoQualityMode = "auto" | "360p" | "720p" | "1080p";

export type CallQualitySettings = {
  audio: Record<AudioProcessingSetting, boolean>;
  videoQuality: VideoQualityMode;
};

export type CallTokenResponse = {
  serverUrl: string;
  token: string;
};
