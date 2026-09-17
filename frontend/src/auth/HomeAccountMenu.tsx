import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent
} from "react";
import { ChevronDown, KeyRound, LogOut, UserRound } from "lucide-react";
import { profileInitials } from "./profilePresentation";

type HomeAccountMenuProps = {
  username: string;
  email: string | null;
  onLogout: () => Promise<void>;
};

export default function HomeAccountMenu({
  username,
  email,
  onLogout
}: HomeAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusOnOpenRef = useRef<"first" | "last">("first");

  function menuItems() {
    return Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []
    ).filter(item => !item.hasAttribute("disabled"));
  }

  function openMenu(focus: "first" | "last" = "first") {
    focusOnOpenRef.current = focus;
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => {
      const items = menuItems();
      const item = focusOnOpenRef.current === "last"
        ? items[items.length - 1]
        : items[0];
      item?.focus();
    });

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [open]);

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(event.key === "ArrowUp" ? "last" : "first");
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

    const items = menuItems();
    if (!items.length) return;

    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex = 0;

    if (event.key === "End") {
      nextIndex = items.length - 1;
    } else if (event.key === "ArrowUp") {
      nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
    } else if (event.key === "ArrowDown") {
      nextIndex = currentIndex >= items.length - 1 ? 0 : currentIndex + 1;
    }

    items[nextIndex]?.focus();
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
    }
  }

  async function handleLogout() {
    setOpen(false);
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  }

  const initials = profileInitials(username, email);

  return (
    <div
      className="homeAccountMenu"
      ref={rootRef}
      onBlur={handleBlur}
      onKeyDown={handleMenuKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        className="homeAccountTrigger"
        aria-label={`Open account menu for ${username}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="home-account-menu"
        onClick={() => open ? setOpen(false) : openMenu()}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="homeAccountAvatar" aria-hidden="true">{initials}</span>
        <span className="homeAccountName">{username}</span>
        <ChevronDown className="homeAccountChevron" size={16} aria-hidden="true" />
      </button>

      {open && (
        <div
          id="home-account-menu"
          className="homeAccountDropdown"
          role="menu"
          aria-label="Account"
        >
          <div className="homeAccountIdentity">
            <span className="homeAccountIdentityAvatar" aria-hidden="true">{initials}</span>
            <span className="homeAccountIdentityText">
              <strong>{username}</strong>
              {email && <span title={email}>{email}</span>}
            </span>
          </div>
          <div className="homeAccountSeparator" />
          <a role="menuitem" className="homeAccountAction" href="/profile" onClick={() => setOpen(false)}>
            <UserRound size={18} aria-hidden="true" />
            Profile
          </a>
          <a role="menuitem" className="homeAccountAction" href="/forgot-password" onClick={() => setOpen(false)}>
            <KeyRound size={18} aria-hidden="true" />
            Reset password
          </a>
          <div className="homeAccountSeparator" />
          <button
            type="button"
            role="menuitem"
            className="homeAccountAction homeAccountLogout"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
          >
            <LogOut size={18} aria-hidden="true" />
            {loggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>
      )}
    </div>
  );
}
