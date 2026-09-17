import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { USER_OFFLINE_MESSAGE } from "../userError";

export default function OfflineNotice() {
  const [offline, setOffline] = useState(() => navigator.onLine === false);

  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return offline ? (
    <div className="offlineNotice" role="status" aria-live="polite">
      <WifiOff size={18} aria-hidden="true" />
      <span>{USER_OFFLINE_MESSAGE}</span>
    </div>
  ) : null;
}
