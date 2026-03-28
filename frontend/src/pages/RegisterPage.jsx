import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { authApi } from "../api/authApi.js";
import { useAuth } from "../app/store/AuthStore.jsx";

export function RegisterPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [form, setForm] = useState({ email: "", username: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const result = await authApi.register(form);
      setForm({ email: "", username: "", password: "" });
      auth.setAuth(result.user, result.session);
      navigate("/rooms", { replace: true });
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit} autoComplete="on">
        <p className="eyebrow">Classic Web Chat</p>
        <h1>Create account</h1>
        <input
          className="text-input"
          placeholder="Email"
          type="email"
          name="email"
          autoComplete="email"
          value={form.email}
          onChange={event => setForm(current => ({ ...current, email: event.target.value }))}
        />
        <input
          className="text-input"
          placeholder="Immutable username"
          name="username"
          autoComplete="username"
          value={form.username}
          onChange={event => setForm(current => ({ ...current, username: event.target.value }))}
        />
        <input
          className="text-input"
          placeholder="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          value={form.password}
          onChange={event => setForm(current => ({ ...current, password: event.target.value }))}
        />
        {error ? <p className="error-text">{error}</p> : null}
        <button
          type="submit"
          className="primary-button"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? "Creating..." : "Create account"}
        </button>
        <div className="inline-links">
          <Link to="/login">Already have an account?</Link>
        </div>
      </form>
    </div>
  );
}
