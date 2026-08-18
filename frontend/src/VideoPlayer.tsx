import { API_URL } from "./api";

export default function VideoPlayer({
  roomId,
  hasFile
}: {
  roomId: string;
  hasFile: boolean;
}) {
  if (!hasFile) {
    return <div className="videoPlaceholder">Choose a Google Drive video.</div>;
  }

  return (
    <video
      className="video"
      src={`${API_URL}/api/stream/${roomId}`}
      controls
      playsInline
    />
  );
}
