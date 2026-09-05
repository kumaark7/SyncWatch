import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

type Props = {
  inviteRoomId: string;
  onSignIn: (identifier: string, password: string, rememberMe: boolean) => Promise<void>;
  onSignUp: (
    username: string,
    email: string,
    password: string,
    confirmPassword: string,
    rememberMe: boolean
  ) => Promise<void>;
};

export default function LoginPage({ inviteRoomId, onSignIn, onSignUp }: Props) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function switchMode(nextMode: "signin" | "signup") {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (mode === "signup") {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }
        await onSignUp(username, email, password, confirmPassword, rememberMe);
      } else {
        await onSignIn(identifier, password, rememberMe);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  const passwordType = showPassword ? "text" : "password";

  return (
    <main className="loginShell">
      <form className="loginCard" onSubmit={submit}>
        <div className="authHeading">
          <img className="authLogo" src="/brand/syncwatch-logo.png" alt="SyncWatch" />
          <h1>{mode === "signin" ? "Sign In" : "Create Account"}</h1>
          <p>
            {inviteRoomId
              ? `Continue to room ${inviteRoomId}`
              : mode === "signin"
                ? "Welcome back to SyncWatch."
                : "Create your SyncWatch account."}
          </p>
        </div>

        <div className="authModeTabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={mode === "signin" ? "active" : ""}
            onClick={() => switchMode("signin")}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            className={mode === "signup" ? "active" : ""}
            onClick={() => switchMode("signup")}
          >
            Sign Up
          </button>
        </div>

        {mode === "signup" ? (
          <>
            <label className="fieldLabel">
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                maxLength={32}
                disabled={loading}
                autoFocus
                required
              />
            </label>
            <label className="fieldLabel">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                maxLength={254}
                disabled={loading}
                required
              />
            </label>
          </>
        ) : (
          <label className="fieldLabel">
            Email or username
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              disabled={loading}
              autoFocus
              required
            />
          </label>
        )}

        <label className="fieldLabel">
          Password
          <span className="passwordField">
            <input
              type={passwordType}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? 8 : undefined}
              maxLength={72}
              disabled={loading}
              required
            />
            <button
              type="button"
              className="ghostButton passwordVisibility"
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((showing) => !showing)}
            >
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </span>
        </label>

        {mode === "signup" && (
          <label className="fieldLabel">
            Confirm password
            <input
              type={passwordType}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              disabled={loading}
              required
            />
          </label>
        )}

        <label className="rememberMeOption">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            disabled={loading}
          />
          Keep me signed in
        </label>

        {error && <div className="loginError" role="alert">{error}</div>}

        <button className="primary loginButton" disabled={loading}>
          {loading
            ? mode === "signin" ? "Signing in..." : "Creating account..."
            : mode === "signin" ? "Sign In" : "Create Account"}
        </button>
      </form>
    </main>
  );
}
