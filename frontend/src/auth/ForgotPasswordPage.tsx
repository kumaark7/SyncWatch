import { useState } from "react";
import type { FormEvent } from "react";
import LogoHomeLink from "../components/LogoHomeLink";
import MobilePageHeader from "../mobile/MobilePageHeader";
import { userErrorMessage } from "../userError";
import { requestPasswordReset } from "./authApi";

const GENERIC_MESSAGE =
  "If an account exists for this email, a reset link has been sent.";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await requestPasswordReset(email);
      setMessage(GENERIC_MESSAGE);
    } catch (cause) {
      setError(userErrorMessage(cause, "Could not request a password reset. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="loginShell">
      <MobilePageHeader />
      <form className="loginCard authRecoveryCard" onSubmit={submit} aria-busy={loading}>
        <div className="authHeading">
          <LogoHomeLink className="authLogo" />
          <h1>Forgot Password</h1>
          <p>Enter the email address associated with your SyncWatch account.</p>
        </div>

        {message ? (
          <div className="authSuccess" role="status">{message}</div>
        ) : (
          <>
            <label className="fieldLabel">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                maxLength={254}
                disabled={loading}
                autoFocus
                required
              />
            </label>
            {error && <div className="loginError" role="alert">{error}</div>}
            <button className="primary loginButton" disabled={loading}>
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </>
        )}

        <a className="authTextLink" href="/">Back to Login</a>
      </form>
    </main>
  );
}
