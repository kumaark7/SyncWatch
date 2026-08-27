import type { ReactNode } from "react";

type Props = {
  fileName: string | null;
  googleConnected: boolean;
  isHost: boolean;
  googleActions?: ReactNode;
};

export default function MediaInfo(props: Props) {
  return (
    <section className="mediaInfo">
      <div className="mediaPrimary">
        <div className="eyebrow">Now playing</div>
        <h2>{props.fileName || "No video selected"}</h2>
        <p>{props.fileName ? "Ready in this room" : "Select a video to get started"}</p>
      </div>

      <div className="mediaDrive">
        <span className="driveIcon" aria-hidden="true">▲</span>
        <span>
          <strong>Google Drive</strong>
          <span className={props.googleConnected ? "driveState connected" : "driveState"}>
            {props.googleConnected ? "Connected" : "Not connected"}
          </span>
        </span>
      </div>

      {props.googleActions && (
        <div className="googleActions">
          {props.googleActions}
        </div>
      )}
    </section>
  );
}
