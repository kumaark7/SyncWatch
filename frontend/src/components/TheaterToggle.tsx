type Props = {
  enabled: boolean;
  onToggle: () => void;
};

export default function TheaterToggle({ enabled, onToggle }: Props) {
  return (
    <button className="theaterToggle" onClick={onToggle}>
      {enabled ? "Exit Theater" : "Theater Mode"}
    </button>
  );
}
