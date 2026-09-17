import {
  Clapperboard,
  DoorOpen,
  EllipsisVertical,
  Trash2
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";

type Props = {
  showCloseVideo: boolean;
  showCloseRoom: boolean;
  closingVideo: boolean;
  onLeaveRoom: () => void;
  onCloseVideo: () => void;
  onCloseRoom: () => void;
};

export default function RoomActionsMenu(props: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const focusFrame = window.requestAnimationFrame(() => {
      menuRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
        ?.focus();
    });

    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (
      !(event.relatedTarget instanceof Node)
      || !event.currentTarget.contains(event.relatedTarget)
    ) {
      setOpen(false);
    }
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }

    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)'
      )
    );
    if (items.length === 0) return;

    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  return (
    <div className="roomActionsMenu" ref={menuRef} onBlur={handleBlur}>
      <button
        ref={triggerRef}
        type="button"
        className="roomActionsMenuTrigger"
        aria-label="Room actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="desktop-room-actions-menu"
        title="Room actions"
        onClick={() => setOpen((current) => !current)}
      >
        <EllipsisVertical size={20} aria-hidden="true" />
      </button>

      {open && (
        <div
          id="desktop-room-actions-menu"
          className="roomActionsMenuDropdown"
          role="menu"
          aria-label="Room actions"
          onKeyDown={handleMenuKeyDown}
        >
          <button type="button" role="menuitem" onClick={() => run(props.onLeaveRoom)}>
            <DoorOpen size={18} aria-hidden="true" />
            Leave room
          </button>

          {(props.showCloseVideo || props.showCloseRoom) && (
            <div className="roomActionsMenuSeparator" role="separator" />
          )}

          {props.showCloseVideo && (
            <button
              type="button"
              className="warning"
              role="menuitem"
              disabled={props.closingVideo}
              onClick={() => run(props.onCloseVideo)}
            >
              <Clapperboard size={18} aria-hidden="true" />
              {props.closingVideo ? "Closing video..." : "Close video"}
            </button>
          )}

          {props.showCloseRoom && (
            <button
              type="button"
              className="danger"
              role="menuitem"
              onClick={() => run(props.onCloseRoom)}
            >
              <Trash2 size={18} aria-hidden="true" />
              Close room
            </button>
          )}
        </div>
      )}
    </div>
  );
}
