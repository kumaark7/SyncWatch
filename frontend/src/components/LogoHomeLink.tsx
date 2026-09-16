import type { MouseEvent } from "react";

type Props = {
  className?: string;
  inRoom?: boolean;
  onLeaveRoom?: () => void;
};

export default function LogoHomeLink({ className, inRoom = false, onLeaveRoom }: Props) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!inRoom) return;

    event.preventDefault();
    if (window.confirm("Leave this room and go to Home? This will disconnect you from the room and call.")) {
      onLeaveRoom?.();
    }
  }

  return (
    <a
      className={`logoHomeLink ${className ? `${className}Link` : ""}`}
      href="/"
      aria-label="SyncWatch home"
      title="SyncWatch home"
      onClick={handleClick}
    >
      <img className={className} src="/brand/syncwatch-logo.png" alt="SyncWatch" />
    </a>
  );
}
