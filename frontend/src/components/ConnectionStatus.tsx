type Props = {
  connected: boolean;
  hasRoom: boolean;
};

export default function ConnectionStatus({ connected, hasRoom }: Props) {
  const label = !hasRoom
    ? "Offline"
    : connected
    ? "Connected"
    : "Reconnecting";

  return (
    <span className={`connectionStatus ${connected && hasRoom ? "connected" : ""}`}>
      <span aria-hidden="true">●</span>
      {label}
    </span>
  );
}
