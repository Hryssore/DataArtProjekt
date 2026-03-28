import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { authApi } from "../api/authApi.js";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ token: "", nextPassword: "" });
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const tokenFromLink = searchParams.get("token") ?? "";

  useEffect(() => {
    if (tokenFromLink) {
      setForm(current => ({ ...current, token: tokenFromLink }));
    }
  }, [tokenFromLink]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await authApi.resetPassword(form);
      setResult("Password updated. You can now sign in with the new password.");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <p className="eyebrow">Recovery</p>
        <h1>Apply new password</h1>
        {!tokenFromLink ? (
          <div className="info-box">
            <p>Open the password reset link from your email to continue.</p>
          </div>
        ) : (
          <div className="info-box">
            <p>Reset link loaded. Choose a new password below.</p>
          </div>
        )}
        {tokenFromLink ? (
          <input
            className="text-input"
            placeholder="New password"
            type="password"
            value={form.nextPassword}
            onChange={event => setForm(current => ({ ...current, nextPassword: event.target.value }))}
          />
        ) : null}
        {result ? <p className="success-text">{result}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {tokenFromLink ? (
          <button type="submit" className="primary-button" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save new password"}
          </button>
        ) : null}
        <div className="inline-links">
          <Link to="/forgot-password">Request another email</Link>
          <Link to="/login">Back to login</Link>
        </div>
      </form>
    </div>
  );
}
