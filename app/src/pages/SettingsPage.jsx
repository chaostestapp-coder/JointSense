import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import ThemeToggle from "../components/common/ThemeToggle";
import { useAuth } from "../context/useAuth";
import { useLanguage } from "../context/useLanguage";
import {
  isSpeechSynthesisSupported,
  speakText,
  stopSpeaking,
} from "../utils/speechHelper";

export default function SettingsPage() {
  const { user, profile, signOut } = useAuth();
  const { lang, setLang } = useLanguage();
  const [testingVoice, setTestingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState("");

  const clinicianName =
    profile?.fullName || user?.displayName || user?.email || "Clinician";
  const clinicianDept =
    profile?.department || "Outpatient Musculoskeletal Clinic";

  const handleTestVoice = () => {
    setVoiceError("");
    if (testingVoice) {
      stopSpeaking();
      setTestingVoice(false);
      return;
    }

    const sample =
      lang === "hi"
        ? "नमस्ते। यह जॉइंटसेंस की आवाज़ जांच है।"
        : "Hello. This is the JointSense instruction voice check.";

    speakText(sample, lang, {
      onStart: () => setTestingVoice(true),
      onEnd: () => setTestingVoice(false),
      onError: (msg) => {
        setTestingVoice(false);
        setVoiceError(msg);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-border">
        <h1 className="text-xl font-semibold text-foreground">
          {lang === "hi" ? "सेटिंग्स" : "Settings"}
        </h1>
        <p className="text-sm text-secondary mt-1">
          {lang === "hi"
            ? "भाषा, थीम और खाता जानकारी यहां बदलें।"
            : "Manage language, display theme, voice read aloud, and account details."}
        </p>
      </div>

      {/* Language & Audio Preferences */}
      <section className="bg-surface border border-border rounded-sm divide-y divide-border">
        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {lang === "hi" ? "ऐप की भाषा" : "Screening language"}
            </h2>
            <p className="text-sm text-secondary mt-0.5">
              {lang === "hi"
                ? "चुनी गई भाषा पेज रीलोड के बाद भी सेव रहेगी।"
                : "Saved on this device so it stays selected after page reload."}
            </p>
          </div>

          <div
            role="group"
            aria-label="Language selection"
            className="inline-flex border border-border rounded-sm overflow-hidden shrink-0"
          >
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`px-4 py-2 text-sm font-medium ${
                lang === "en"
                  ? "bg-accent text-accent-foreground"
                  : "bg-surface text-secondary hover:text-foreground"
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLang("hi")}
              className={`px-4 py-2 text-sm font-medium border-l border-border ${
                lang === "hi"
                  ? "bg-accent text-accent-foreground"
                  : "bg-surface text-secondary hover:text-foreground"
              }`}
            >
              हिंदी
            </button>
          </div>
        </div>

        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {lang === "hi" ? "डिस्प्ले थीम" : "Display theme"}
            </h2>
            <p className="text-sm text-secondary mt-0.5">
              {lang === "hi"
                ? "लाइट या डार्क मोड चुनें।"
                : "Switch between light and dark clinic appearance."}
            </p>
          </div>
          <ThemeToggle />
        </div>

        <div className="p-5 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {lang === "hi" ? "आवाज़ जांच (Read aloud)" : "Instruction voice check"}
              </h2>
              <p className="text-sm text-secondary mt-0.5">
                {isSpeechSynthesisSupported()
                  ? "Test whether your browser has an audio voice available."
                  : "Voice read aloud is not supported in this browser."}
              </p>
            </div>
            {isSpeechSynthesisSupported() && (
              <button
                type="button"
                onClick={handleTestVoice}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground bg-surface-muted hover:bg-surface-hover border border-border rounded-sm shrink-0"
              >
                {testingVoice ? (
                  <>
                    <VolumeX size={15} strokeWidth={1.75} aria-hidden="true" />
                    <span>Stop audio</span>
                  </>
                ) : (
                  <>
                    <Volume2 size={15} strokeWidth={1.75} aria-hidden="true" />
                    <span>Test voice</span>
                  </>
                )}
              </button>
            )}
          </div>
          {voiceError && (
            <div
              role="alert"
              className="px-3 py-2 text-xs bg-warning-bg text-warning-text border border-warning-border rounded-sm"
            >
              {voiceError}
            </div>
          )}
        </div>
      </section>

      {/* Account & Clinician Info */}
      <section className="bg-surface border border-border rounded-sm">
        <div className="px-5 py-3.5 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            {lang === "hi" ? "खाता जानकारी" : "Clinician account"}
          </h2>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:gap-px bg-border">
          <div className="bg-surface px-5 py-3.5">
            <dt className="text-xs text-secondary">Name</dt>
            <dd className="text-sm font-medium text-foreground mt-0.5">
              {clinicianName}
            </dd>
          </div>
          <div className="bg-surface px-5 py-3.5">
            <dt className="text-xs text-secondary">Email</dt>
            <dd className="text-sm font-medium text-foreground mt-0.5">
              {user?.email || "Not recorded"}
            </dd>
          </div>
          <div className="bg-surface px-5 py-3.5">
            <dt className="text-xs text-secondary">Clinic / Department</dt>
            <dd className="text-sm font-medium text-foreground mt-0.5">
              {clinicianDept}
            </dd>
          </div>
          <div className="bg-surface px-5 py-3.5">
            <dt className="text-xs text-secondary">Specialisation</dt>
            <dd className="text-sm font-medium text-foreground mt-0.5">
              {profile?.specialty || "Not recorded"}
            </dd>
          </div>
        </dl>

        <div className="px-5 py-4 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={() => signOut()}
            className="px-4 py-2 text-sm font-medium text-danger-text bg-surface hover:bg-danger-bg border border-border rounded-sm"
          >
            Sign out
          </button>
        </div>
      </section>
    </div>
  );
}
