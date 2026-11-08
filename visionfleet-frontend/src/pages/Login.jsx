
import { useState } from "react";
import logo from "../assets/logo.png";
import loginHero from "../assets/visionfleet-login-hero.png";
import { login } from "../services/authService";
import "../styles/Login.css";

export default function Login({
  onLogin,
  sessionError = "",
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      const user = await login(email, password);

      setPassword("");
      onLogin(user);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="vf2-login">

      {/* =====================================
          LEFT: HERO
          ===================================== */}

      <section className="vf2-hero">
        <div className="vf2-hero-copy">

          

          <div className="vf2-hero-brand">
            <img
              src={logo}
              alt="Vision Fleet"
              className="vf2-hero-logo"
            />
          </div>

          <h1 className="vf2-hero-title">
            Fleet booking,
            <span>made simple.</span>
          </h1>

          <p className="vf2-hero-description">
            Book a van, manage your fleet and
            review journeys in one convenient
            platform.
          </p>
        </div>

        {/* Staff photo with slogan */}

        <div className="vf2-hero-art">
          <img
            src={loginHero}
            alt="Vision College representative giving a thumbs-up with the slogan Every journey. One clear view."
          />
        </div>

        <p className="vf2-hero-footer">
          © 2026 Vision Fleet · Vision College
        </p>
      </section>

      {/* =====================================
          RIGHT: LOGIN FORM
          ===================================== */}

      <main className="vf2-form-side">
        <div className="vf2-login-card">

          <div className="vf2-login-heading">


            <span className="vf2-form-eyebrow">
              WELCOME TO VISION FLEET
            </span>

        

            <p className="vf2-form-description">
              Sign in to your Vision Fleet account.
            </p>
          </div>

          <form
            className="vf2-login-form"
            onSubmit={handleSubmit}
          >
            <div className="vf2-form-group">
              <label htmlFor="email">
                Email address
              </label>

              <input
                id="email"
                name="email"
                type="email"
                placeholder="name@visioncollege.ac.nz"
                autoComplete="username"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                disabled={loading}
                required
              />
            </div>

            <div className="vf2-form-group">
              <label htmlFor="password">
                Password
              </label>

              <input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                disabled={loading}
                required
              />
            </div>

            {(error || sessionError) && (
              <p
                role="alert"
                className="vf2-error"
              >
                {error || sessionError}
              </p>
            )}

            <button
              type="submit"
              className="vf2-submit"
              disabled={loading}
            >
              {loading
                ? "Signing in..."
                : "Sign in"}
            </button>
          </form>

          <p className="vf2-help">
            Need an account?
            <br />
            Contact your fleet administrator.
          </p>

          <p className="vf2-security">
            Secure access for administrators,
            staff and drivers.
          </p>
        </div>
      </main>
    </div>
  );
}
