import { useState } from "react";
import { Link } from "react-router-dom";

import { authApi } from "../api/authApi.js";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await authApi.forgotPassword({ email });
      setResult(response);
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
        <h1>Reset password</h1>
        <input
          className="text-input"
          placeholder="Email"
          type="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
        />
        {error ? <p className="error-text">{error}</p> : null}
        {result ? (
          <div className="info-box">
            <p>{result.message}</p>
          </div>
        ) : null}
        <button type="submit" className="primary-button" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? "Sending..." : "Send reset email"}
        </button>
        <div className="inline-links">
          <Link to="/reset-password">Already have a reset link?</Link>
          <Link to="/login">Back to login</Link>
        </div>
      </form>
    </div>
  );
}
