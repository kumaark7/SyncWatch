import { Home } from "lucide-react";
import LogoHomeLink from "../components/LogoHomeLink";

type Props = {
  showHome?: boolean;
};

export default function MobilePageHeader({ showHome = false }: Props) {
  return (
    <header className="mobilePageHeader">
      <LogoHomeLink />
      {showHome && (
        <a className="mobilePageHome" href="/" aria-label="Home">
          <Home size={19} aria-hidden="true" />
          <span>Home</span>
        </a>
      )}
    </header>
  );
}
