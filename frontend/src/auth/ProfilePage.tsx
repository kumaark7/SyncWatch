import {
  CheckCircle2,
  CircleOff,
  Clock3,
  HardDrive,
  Home,
  KeyRound,
  LogOut,
  TriangleAlert,
  UserRound
} from "lucide-react";
import { useEffect, useState } from "react";
import LogoHomeLink from "../components/LogoHomeLink";
import {
  connectGoogleDriveAccount,
  disconnectGoogleDriveAccount,
  getGoogleDriveAccountStatus
} from "../googleDriveConnection";
import { useAuth } from "./AuthProvider";
import {
  driveConnectionLabel,
  profileInitials,
  type DriveConnectionViewState
} from "./profilePresentation";

type Props = {
  onLogout: () => Promise<void>;
};

const DRIVE_STATUS_ICON = {
  checking: Clock3,
  connected: CheckCircle2,
  disconnected: CircleOff,
  error: TriangleAlert
};

export default function ProfilePage({ onLogout }: Props) {
  const auth = useAuth();
  const username = auth.session.username?.trim() || "SyncWatch user";
  const email = auth.session.email?.trim() || "Email unavailable";
  const initials = profileInitials(auth.session.username, auth.session.email);
  const [driveState, setDriveState] = useState<DriveConnectionViewState>("checking");
  const [driveBusy, setDriveBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [driveMessage, setDriveMessage] = useState("");

  async function checkDriveConnection() {
    setDriveState("checking");
    setDriveMessage("");
    try {
      const status = await getGoogleDriveAccountStatus(auth.authenticatedFetch);
      setDriveState(status.connected ? "connected" : "disconnected");
    } catch {
      setDriveState("error");
      setDriveMessage("Google Drive status is temporarily unavailable. Please try again.");
    }
  }

  useEffect(() => {
    let cancelled = false;

    getGoogleDriveAccountStatus(auth.authenticatedFetch)
      .then((status) => {
        if (!cancelled) {
          setDriveState(status.connected ? "connected" : "disconnected");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDriveState("error");
          setDriveMessage("Google Drive status is temporarily unavailable. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [auth.authenticatedFetch]);

  async function connectDrive() {
    setDriveBusy(true);
    setDriveMessage("");
    try {
      const status = await connectGoogleDriveAccount(
        auth.authenticatedFetch,
        async () => {
          const session = await auth.refreshSession();
          return session.authenticated && session.role === "USER";
        }
      );
      if (status) setDriveState("connected");
    } catch {
      setDriveState("error");
      setDriveMessage("Google Drive could not be connected. Please try again.");
    } finally {
      setDriveBusy(false);
    }
  }

  async function disconnectDrive() {
    setDriveBusy(true);
    setDriveMessage("");
    try {
      await disconnectGoogleDriveAccount(auth.authenticatedFetch);
      setDriveState("disconnected");
    } catch {
      setDriveState("error");
      setDriveMessage("Google Drive could not be disconnected. Please try again.");
    } finally {
      setDriveBusy(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  }

  const DriveStatusIcon = DRIVE_STATUS_ICON[driveState];

  return (
    <main className="profileShell">
      <header className="profileNav" aria-label="Profile navigation">
        <LogoHomeLink className="profileLogo" />
        <a className="profileHomeLink" href="/">
          <Home size={18} aria-hidden="true" />
          Home
        </a>
      </header>

      <div className="profileContent">
        <section className="profileHero" aria-labelledby="profile-title">
          <div className="profileAvatar" aria-hidden="true">{initials}</div>
          <div className="profileIdentity">
            <span className="profileEyebrow">Your profile</span>
            <h1 id="profile-title">{username}</h1>
            <p>{email}</p>
          </div>
        </section>

        <div className="profileGrid">
          <section className="profileSection" aria-labelledby="account-heading">
            <div className="profileSectionHeading">
              <UserRound size={20} aria-hidden="true" />
              <h2 id="account-heading">Account</h2>
            </div>
            <dl className="profileDetails">
              <div>
                <dt>Username</dt>
                <dd>{username}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{email}</dd>
              </div>
            </dl>
          </section>

          <section className="profileSection" aria-labelledby="services-heading">
            <div className="profileSectionHeading">
              <HardDrive size={20} aria-hidden="true" />
              <h2 id="services-heading">Connected Services</h2>
            </div>
            <div className="profileServiceRow">
              <div className="profileServiceInfo">
                <strong>Google Drive</strong>
                <span
                  className={`profileServiceStatus ${driveState}`}
                  role="status"
                  aria-live="polite"
                >
                  <DriveStatusIcon size={17} aria-hidden="true" />
                  {driveConnectionLabel(driveState)}
                </span>
              </div>

              {driveState === "connected" ? (
                <button
                  type="button"
                  className="profileSecondaryButton"
                  disabled={driveBusy}
                  onClick={() => void disconnectDrive()}
                >
                  {driveBusy ? "Disconnecting..." : "Disconnect Google Drive"}
                </button>
              ) : driveState === "error" ? (
                <button
                  type="button"
                  className="profileSecondaryButton"
                  disabled={driveBusy}
                  onClick={() => void checkDriveConnection()}
                >
                  Check again
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  disabled={driveBusy || driveState === "checking"}
                  onClick={() => void connectDrive()}
                >
                  {driveBusy ? "Connecting..." : "Connect Google Drive"}
                </button>
              )}
            </div>
            {driveMessage && <p className="profileInlineError" role="alert">{driveMessage}</p>}
          </section>

          <section className="profileSection" aria-labelledby="security-heading">
            <div className="profileSectionHeading">
              <KeyRound size={20} aria-hidden="true" />
              <h2 id="security-heading">Security</h2>
            </div>
            <div className="profileActionRow">
              <div>
                <strong>Password</strong>
                <p>Reset your password securely by email.</p>
              </div>
              <a className="profileButton profileSecondaryButton" href="/forgot-password">
                Reset password
              </a>
            </div>
          </section>

          <section className="profileSection profileSessionSection" aria-labelledby="session-heading">
            <div className="profileSectionHeading">
              <LogOut size={20} aria-hidden="true" />
              <h2 id="session-heading">Session</h2>
            </div>
            <div className="profileActionRow">
              <div>
                <strong>Signed in as {username}</strong>
                <p>Log out of SyncWatch on this browser.</p>
              </div>
              <button
                type="button"
                className="profileLogoutButton"
                disabled={loggingOut}
                onClick={() => void logout()}
              >
                {loggingOut ? "Logging out..." : "Log out"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
