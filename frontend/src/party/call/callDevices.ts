export type CallInputDeviceKind = "audioinput" | "videoinput";

export type CallInputDevices = Partial<Record<CallInputDeviceKind, string>>;

const STORAGE_KEY = "syncwatch.call.input-devices.v1";

export function loadCallInputDevices(): CallInputDevices {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return {};
    }

    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }

    return {
      audioinput: "audioinput" in parsed && typeof parsed.audioinput === "string"
        ? parsed.audioinput
        : undefined,
      videoinput: "videoinput" in parsed && typeof parsed.videoinput === "string"
        ? parsed.videoinput
        : undefined
    };
  } catch {
    return {};
  }
}

export function saveCallInputDevices(devices: CallInputDevices) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
  } catch {
    // The selected devices remain active for this page when storage is unavailable.
  }
}

export function selectCallInputDevice(
  devices: MediaDeviceInfo[],
  preferredDeviceId?: string,
  activeDeviceId?: string
) {
  const preferred = [preferredDeviceId, activeDeviceId]
    .filter((deviceId): deviceId is string => Boolean(deviceId))
    .map((deviceId) => devices.find((device) => device.deviceId === deviceId))
    .find((device) => device !== undefined);

  return preferred
    ?? devices.find((device) => device.deviceId === "default")
    ?? devices[0];
}
