import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/useAuth";

export default function LoginPage() {
  const { user, loading, isFirebaseConfigured, signIn, register, resetPassword } =
    useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from || "/";

  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [specialty, setSpecialty] = useState("Orthopedics & Joint Screening");
  const [licenseId, setLicenseId] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (!loading && user) {
    return <Navigate to={redirectTo} replace />;
  }

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setNotice("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);

    try {
      if (mode === "signin") {
        await signIn(email, password);
        navigate(redirectTo, { replace: true });
      } else if (mode === "register") {
        await register({ email, password, fullName, specialty, licenseId });
        navigate(redirectTo, { replace: true });
      } else {
        await resetPassword(email);
        setNotice("Password reset instructions sent if the account exists.");
      }
    } catch (err) {
      setError(err.message || "Unable to complete request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center px-4 py-10">
      <div className="w-full max-w-md mx-auto">
        <div className="flex items-center gap-2.5 mb-6">
          <span
            className="inline-flex items-center justify-center w-7 h-7 bg-foreground text-surface rounded-[3px] text-xs font-bold"
            aria-hidden="true"
          >
            JS
          </span>
          <div>
            <div className="text-lg font-semibold text-foreground leading-tight">
              JointSense
            </div>
            <div className="text-xs text-muted">
              Musculoskeletal Screening & Patient Registry
            </div>
          </div>
        </div>

        <section className="bg-surface border border-border rounded-sm p-6">
          <div className="pb-4 mb-5 border-b border-border">
            <h1 className="text-xl font-semibold text-foreground">
              {mode === "signin" && "Clinician sign-in"}
              {mode === "register" && "Create clinician account"}
              {mode === "reset" && "Reset clinician password"}
            </h1>
            <p className="text-sm text-secondary mt-1">
              {mode === "signin" &&
                "Sign in with your clinic credentials to access patient records and joint screenings."}
              {mode === "register" &&
                "Register a clinician profile linked to your Firebase clinic directory."}
              {mode === "reset" &&
                "Enter your registered email address to receive a password reset link."}
            </p>
          </div>

          {!isFirebaseConfigured && (
            <div
              role="status"
              className="mb-4 px-3 py-2.5 text-sm bg-warning-bg text-warning-text border border-warning-border rounded-sm"
            >
              Firebase environment variables are not set. Copy{" "}
              <code className="font-mono text-xs">app/.env.example</code> to{" "}
              <code className="font-mono text-xs">app/.env</code> with your
              Firebase project keys to sign in.
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-4 px-3 py-2.5 text-sm bg-danger-bg text-danger-text border border-danger-border rounded-sm"
            >
              {error}
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="mb-4 px-3 py-2.5 text-sm bg-success-bg text-success-text border border-success-border rounded-sm"
            >
              {notice}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <>
                <div>
                  <label
                    htmlFor="register-name"
                    className="block text-sm font-medium text-foreground mb-1"
                  >
                    Full name <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="register-name"
                    name="fullName"
                    type="text"
                    required
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Dr. Priya Nair"
                    className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-foreground"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="register-specialty"
                      className="block text-sm font-medium text-foreground mb-1"
                    >
                      Specialty
                    </label>
                    <input
                      id="register-specialty"
                      name="specialty"
                      type="text"
                      value={specialty}
                      onChange={(e) => setSpecialty(e.target.value)}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-foreground"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="register-license"
                      className="block text-sm font-medium text-foreground mb-1"
                    >
                      Medical license ID
                    </label>
                    <input
                      id="register-license"
                      name="licenseId"
                      type="text"
                      spellCheck={false}
                      value={licenseId}
                      onChange={(e) => setLicenseId(e.target.value)}
                      placeholder="Optional"
                      className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-foreground"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Email address <span aria-hidden="true">*</span>
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                required
                autoComplete="username"
                spellCheck={false}
                enterKeyHint={mode === "reset" ? "done" : "next"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="clinician@hospital.org"
                className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-foreground"
              />
              <span className="field-error-msg">
                Enter a valid email address.
              </span>
            </div>

            {mode !== "reset" && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="login-password"
                    className="block text-sm font-medium text-foreground"
                  >
                    Password <span aria-hidden="true">*</span>
                  </label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => switchMode("reset")}
                      className="text-xs font-medium text-link hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>

                <div className="relative">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    autoComplete={
                      mode === "register" ? "new-password" : "current-password"
                    }
                    enterKeyHint="done"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 bg-surface border border-border rounded-sm text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-pressed={showPassword}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 px-2.5 flex items-center text-secondary hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff size={16} strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </button>
                </div>
                {mode === "register" && (
                  <span className="block text-xs text-muted mt-1">
                    Minimum 6 characters.
                  </span>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 text-sm font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
            >
              {submitting
                ? "Please wait..."
                : mode === "signin"
                  ? "Sign in"
                  : mode === "register"
                    ? "Create account"
                    : "Send reset link"}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-border flex items-center justify-between text-sm text-secondary">
            {mode === "signin" ? (
              <>
                <span>New clinician?</span>
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="font-medium text-link hover:underline"
                >
                  Register account
                </button>
              </>
            ) : (
              <>
                <span>Already have credentials?</span>
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="font-medium text-link hover:underline"
                >
                  Back to sign-in
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
