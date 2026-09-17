export type DriveConnectionViewState =
  | "checking"
  | "connected"
  | "disconnected"
  | "error";

export function profileInitials(
  username: string | null | undefined,
  email: string | null | undefined
) {
  const cleanUsername = username?.trim() || "";
  const cleanEmail = email?.trim() || "";
  const emailName = cleanEmail.split("@")[0]?.trim() || "";
  const identity = cleanUsername || emailName || cleanEmail;

  if (!identity) return "?";

  const parts = identity.split(/\s+/u).filter(Boolean);
  if (parts.length > 1) {
    const first = Array.from(parts[0] || "")[0] || "";
    const last = Array.from(parts[parts.length - 1] || "")[0] || "";
    return `${first}${last}`.toUpperCase() || "?";
  }

  return Array.from(parts[0] || "").slice(0, 2).join("").toUpperCase() || "?";
}

export function driveConnectionLabel(state: DriveConnectionViewState) {
  switch (state) {
    case "connected":
      return "Connected";
    case "disconnected":
      return "Not connected";
    case "error":
      return "Temporary error";
    default:
      return "Checking...";
  }
}
