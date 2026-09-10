import { House, MessageCircle, Phone } from "lucide-react";

export type MobileTab = "room" | "chat" | "call";

type Props = {
  activeTab: MobileTab;
  unreadCount: number;
  onTabChange: (tab: MobileTab) => void;
};

const tabs = [
  { id: "room", label: "Room + Chat", Icon: House },
  { id: "chat", label: "Chat", Icon: MessageCircle },
  { id: "call", label: "Call", Icon: Phone }
] as const;

export default function MobileBottomNav({ activeTab, unreadCount, onTabChange }: Props) {
  return (
    <nav className="mobileBottomNav" aria-label="Room navigation">
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={activeTab === id ? "active" : ""}
          aria-current={activeTab === id ? "page" : undefined}
          aria-label={label}
          onClick={() => onTabChange(id)}
        >
          <span className="mobileNavIcon" aria-hidden="true">
            <Icon size={21} strokeWidth={2.2} />
            {id === "chat" && unreadCount > 0 && (
              <span className="mobileNavBadge">{Math.min(unreadCount, 99)}</span>
            )}
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
