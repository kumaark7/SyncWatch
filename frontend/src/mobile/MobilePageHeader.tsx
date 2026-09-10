import { Home } from "lucide-react";

type Props = {
  showHome?: boolean;
};

export default function MobilePageHeader({ showHome = false }: Props) {
  return (
    <header className="mobilePageHeader">
      <img src="/brand/syncwatch-logo.png" alt="SyncWatch" />
      {showHome && (
        <a className="mobilePageHome" href="/" aria-label="Home">
          <Home size={19} aria-hidden="true" />
          <span>Home</span>
        </a>
      )}
    </header>
  );
}
