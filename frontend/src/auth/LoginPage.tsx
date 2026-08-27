import { useState } from "react";
import type { FormEvent } from "react";

type Props = {
  onLogin: (username: string, password: string) => Promise<void>;
};

export default function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await onLogin(username, password);
    } catch {
      setError("Invalid username or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="loginShell">
      <form className="loginCard" onSubmit={submit}>
        <div>
          <div className="brandMark">SyncWatch</div>
          <h1>Welcome back</h1>
          <p>Sign in to start a private watch room.</p>
        </div>

        <label className="fieldLabel">
          Username
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>

        <label className="fieldLabel">
          Password
          <span className="passwordField">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="ghostButton"
              onClick={() => setShowPassword((showing) => !showing)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </span>
        </label>

        {error && <div className="loginError">{error}</div>}

        <button className="primary loginButton" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </main>
  );
}

