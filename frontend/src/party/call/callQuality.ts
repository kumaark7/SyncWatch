import {
  VideoPresets,
  type AudioCaptureOptions,
  type VideoCaptureOptions
} from "livekit-client";
import type {
  AudioProcessingSetting,
  CallQualitySettings,
  VideoQualityMode
} from "./types";

const STORAGE_KEY = "syncwatch.call.quality.v1";

export const DEFAULT_CALL_QUALITY_SETTINGS: CallQualitySettings = {
  audio: {
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true
  },
  videoQuality: "auto"
};

const VIDEO_RESOLUTIONS = {
  auto: VideoPresets.h720.resolution,
  "360p": VideoPresets.h360.resolution,
  "720p": VideoPresets.h720.resolution,
  "1080p": VideoPresets.h1080.resolution
} satisfies Record<VideoQualityMode, VideoCaptureOptions["resolution"]>;

const AUDIO_SETTINGS: AudioProcessingSetting[] = [
  "noiseSuppression",
  "echoCancellation",
  "autoGainControl"
];

function readBooleanProperty(value: object, key: string) {
  const property = Object.getOwnPropertyDescriptor(value, key)?.value;
  return typeof property === "boolean" ? property : undefined;
}

export function loadCallQualitySettings(): CallQualitySettings {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return DEFAULT_CALL_QUALITY_SETTINGS;
    }

    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_CALL_QUALITY_SETTINGS;
    }

    const videoQuality = "videoQuality" in parsed
      && ["auto", "360p", "720p", "1080p"].includes(String(parsed.videoQuality))
      ? parsed.videoQuality as VideoQualityMode
      : DEFAULT_CALL_QUALITY_SETTINGS.videoQuality;
    const audioValue = "audio" in parsed && typeof parsed.audio === "object"
      && parsed.audio !== null
      ? parsed.audio
      : {};

    return {
      videoQuality,
      audio: AUDIO_SETTINGS.reduce<CallQualitySettings["audio"]>(
        (settings, key) => ({
          ...settings,
          [key]: readBooleanProperty(audioValue, key)
            ?? DEFAULT_CALL_QUALITY_SETTINGS.audio[key]
        }),
        { ...DEFAULT_CALL_QUALITY_SETTINGS.audio }
      )
    };
  } catch {
    return DEFAULT_CALL_QUALITY_SETTINGS;
  }
}

export function saveCallQualitySettings(settings: CallQualitySettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Preferences remain active for this page when storage is unavailable.
  }
}

export function getSupportedAudioProcessing(): Record<AudioProcessingSetting, boolean> {
  const supported = navigator.mediaDevices?.getSupportedConstraints?.();
  return {
    noiseSuppression: supported?.noiseSuppression === true,
    echoCancellation: supported?.echoCancellation === true,
    autoGainControl: supported?.autoGainControl === true
  };
}

export function createAudioCaptureOptions(
  settings: CallQualitySettings,
  supported: Record<AudioProcessingSetting, boolean>,
  deviceId?: string
): AudioCaptureOptions {
  const options: AudioCaptureOptions = deviceId
    ? { deviceId: { exact: deviceId } }
    : {};

  AUDIO_SETTINGS.forEach((key) => {
    if (supported[key]) {
      options[key] = settings.audio[key];
    }
  });

  return options;
}

export function createVideoCaptureOptions(
  quality: VideoQualityMode,
  deviceId?: string
): VideoCaptureOptions {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    resolution: VIDEO_RESOLUTIONS[quality]
  };
}
