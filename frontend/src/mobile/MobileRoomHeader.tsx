import {
  Clapperboard,
  Copy,
  DoorOpen,
  EllipsisVertical,
  Expand,
  Link,
  MonitorUp,
  Trash2,
  Users
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = {
  roomId: string;
  participantCount: number;
  isHost: boolean;
  canCloseRoom: boolean;
  hasFile: boolean;
  theaterMode: boolean;
  fullscreenActive: boolean;
  closingVideo: boolean;
  onShowParticipants: () => void;
  onCopyRoom: () => void;
  onCopyInvite: () => void;
  onToggleTheater: () => void;
  onToggleFullscreen: () => void;
  onLeaveRoom: () => void;
  onCloseVideo: () => void;
  onCloseRoom: () => void;
};

export default function MobileRoomHeader(props: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  function run(action: () => void) {
    setMenuOpen(false);
    action();
  }

  return (
    <header className="mobileRoomHeader">
      <img className="mobileRoomLogo" src="/brand/syncwatch-logo.png" alt="SyncWatch" />
      <div className="mobileHeaderRoom">
        <span>Room</span>
        <strong>{props.roomId}</strong>
        <button type="button" aria-label="Copy room code" title="Copy room code" onClick={props.onCopyRoom}>
          <Copy size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="mobileHeaderActions">
        <button
          type="button"
          className="mobileOnlineCount"
          aria-label={`${props.participantCount} participants online. Show participants`}
          onClick={props.onShowParticipants}
        >
          <span className="mobileOnlineDot" aria-hidden="true" />
          <span>{props.participantCount}</span>
          <Users size={18} aria-hidden="true" />
        </button>
        <div className="mobileOverflow" ref={menuRef}>
          <button
            type="button"
            className="mobileIconButton"
            aria-label="Room menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <EllipsisVertical size={22} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="mobileOverflowMenu" role="menu">
              <button role="menuitem" onClick={() => run(props.onCopyRoom)}>
                <Copy size={18} aria-hidden="true" /> Copy room code
              </button>
              <button role="menuitem" onClick={() => run(props.onCopyInvite)}>
                <Link size={18} aria-hidden="true" /> Copy invite link
              </button>
              <button role="menuitem" onClick={() => run(props.onToggleTheater)}>
                <MonitorUp size={18} aria-hidden="true" />
                {props.theaterMode ? "Exit theater" : "Theater mode"}
              </button>
              <button role="menuitem" onClick={() => run(props.onToggleFullscreen)}>
                <Expand size={18} aria-hidden="true" />
                {props.fullscreenActive ? "Exit fullscreen" : "Fullscreen"}
              </button>
              {props.isHost && props.hasFile && (
                <button role="menuitem" disabled={props.closingVideo} onClick={() => run(props.onCloseVideo)}>
                  <Clapperboard size={18} aria-hidden="true" />
                  {props.closingVideo ? "Closing video..." : "Close video"}
                </button>
              )}
              <button role="menuitem" onClick={() => run(props.onLeaveRoom)}>
                <DoorOpen size={18} aria-hidden="true" /> Leave room
              </button>
              {props.isHost && props.canCloseRoom && (
                <button className="danger" role="menuitem" onClick={() => run(props.onCloseRoom)}>
                  <Trash2 size={18} aria-hidden="true" /> Close room
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
