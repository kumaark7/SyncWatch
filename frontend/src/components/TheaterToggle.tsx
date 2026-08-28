type Props = {
  enabled: boolean;
  onToggle: () => void;
};

export default function TheaterToggle({ enabled, onToggle }: Props) {
  const label = enabled ? "Exit Theater" : "Theater Mode";

  return (
    <button
      className="theaterToggle"
      aria-pressed={enabled}
      title={label}
      onClick={onToggle}
    >
      {label}
    </button>
  );
}
