import { Eye, EyeOff } from "lucide-react";
import { useLayoutEffect, useState } from "react";
import type { FormEvent } from "react";
import LogoHomeLink from "../components/LogoHomeLink";
import MobilePageHeader from "../mobile/MobilePageHeader";
import { userErrorMessage } from "../userError";
import { resetPassword } from "./authApi";
import { resetPasswordValidation, resetTokenFromHash } from "./passwordResetForm";

const INVALID_LINK = "The reset link is invalid or has expired.";

export default function ResetPasswordPage() {
  const [token] = useState(() => resetTokenFromHash(window.location.hash));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(token ? "" : INVALID_LINK);

  useLayoutEffect(() => {
    if (window.location.hash) {
      window.history.replaceState({}, "", "/reset-password");
    }
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      setError(INVALID_LINK);
      return;
    }
    const validationError = resetPasswordValidation(password, confirmPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");
    try {
      await resetPassword(token, password, confirmPassword);
      window.location.replace("/?passwordReset=success");
    } catch (cause) {
      setError(userErrorMessage(cause, INVALID_LINK));
    } finally {
      setLoading(false);
    }
  }

  const passwordType = showPassword ? "text" : "password";

  return (
    <main className="loginShell">
      <MobilePageHeader />
      <form className="loginCard authRecoveryCard" onSubmit={submit} aria-busy={loading}>
        <div className="authHeading">
          <LogoHomeLink className="authLogo" />
          <h1>Reset Password</h1>
          <p>Choose a new password for your SyncWatch account.</p>
        </div>

        <label className="fieldLabel">
          New password
          <span className="passwordField">
            <input
              type={passwordType}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              disabled={loading || !token}
              autoFocus={Boolean(token)}
              required
            />
            <button
              type="button"
              className="ghostButton passwordVisibility"
              aria-label={showPassword ? "Hide passwords" : "Show passwords"}
              title={showPassword ? "Hide passwords" : "Show passwords"}
              onClick={() => setShowPassword((showing) => !showing)}
              disabled={!token}
            >
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </span>
        </label>

        <label className="fieldLabel">
          Confirm password
          <input
            type={passwordType}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            disabled={loading || !token}
            required
          />
        </label>

        {error && <div className="loginError" role="alert">{error}</div>}

        <button className="primary loginButton" disabled={loading || !token}>
          {loading ? "Resetting..." : "Reset Password"}
        </button>
        <a className="authTextLink" href="/">Back to Login</a>
      </form>
    </main>
  );
}
