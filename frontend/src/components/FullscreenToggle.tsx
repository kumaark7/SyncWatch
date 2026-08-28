type Props = {
  active: boolean;
  onToggle: () => void;
};

export default function FullscreenToggle({ active, onToggle }: Props) {
  const label = active ? "Exit Fullscreen" : "Fullscreen";

  return (
    <button
      className="fullscreenToggle"
      aria-pressed={active}
      title={label}
      onClick={onToggle}
    >
      {label}
    </button>
  );
}
