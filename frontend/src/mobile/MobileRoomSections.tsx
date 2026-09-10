import { Check, Crown, DoorOpen, Expand, Minimize, Radio, Trash2, UserRound, X } from "lucide-react";

type RoomInfoProps = {
  roomName: string;
  fileName: string | null;
  isHost: boolean;
  connected: boolean;
};

export function MobileRoomInfo(props: RoomInfoProps) {
  return (
    <section className="mobileRoomInfo" aria-label="Room information">
      <div className="mobileRoomTitles">
        <span>{props.roomName || "Watch Party"}</span>
        <strong title={props.fileName || "No video selected"}>
          {props.fileName || "No video selected"}
        </strong>
      </div>
      <div className="mobileRoomStatusGroup">
        <MobileSyncStatus connected={props.connected} />
        <span className={props.isHost ? "mobileRole host" : "mobileRole"}>
          {props.isHost
            ? <Crown size={17} aria-hidden="true" />
            : <UserRound size={17} aria-hidden="true" />}
          {props.isHost ? "You're Host" : "Room member"}
        </span>
      </div>
    </section>
  );
}

type RoomActionsProps = {
  isHost: boolean;
  canCloseRoom: boolean;
  hasFile: boolean;
  fullscreenActive: boolean;
  closingVideo: boolean;
  onToggleFullscreen: () => void;
  onLeaveRoom: () => void;
  onCloseVideo: () => void;
  onCloseRoom: () => void;
};

export function MobileRoomActions(props: RoomActionsProps) {
  return (
    <section className="mobileRoomActions" aria-label="Room actions">
      <button type="button" onClick={props.onToggleFullscreen}>
        {props.fullscreenActive
          ? <Minimize size={18} aria-hidden="true" />
          : <Expand size={18} aria-hidden="true" />}
        {props.fullscreenActive ? "Exit fullscreen" : "Fullscreen"}
      </button>
      <button type="button" onClick={props.onLeaveRoom}>
        <DoorOpen size={18} aria-hidden="true" /> Leave room
      </button>
      {props.isHost && props.hasFile && (
        <button type="button" disabled={props.closingVideo} onClick={props.onCloseVideo}>
          <X size={18} aria-hidden="true" />
          {props.closingVideo ? "Closing..." : "Close video"}
        </button>
      )}
      {props.isHost && props.canCloseRoom && (
        <button type="button" className="danger" onClick={props.onCloseRoom}>
          <Trash2 size={18} aria-hidden="true" /> Close room
        </button>
      )}
    </section>
  );
}

export function MobileSyncStatus({ connected }: { connected: boolean }) {
  return (
    <section className={`mobileSyncStatus ${connected ? "connected" : "reconnecting"}`} aria-live="polite">
      <span className="mobileSyncIcon" aria-hidden="true">
        {connected ? <Check size={14} /> : <Radio size={14} />}
      </span>
      <strong>{connected ? "Synced" : "Reconnecting"}</strong>
    </section>
  );
}
