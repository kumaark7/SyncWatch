type Props = {
  message: string;
};

export default function Toast({ message }: Props) {
  if (!message) {
    return null;
  }

  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
