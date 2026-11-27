/**
 * Reliable Web Speech API helper.
 *
 * Fixes the Chromium/Brave issue where calling `cancel()` immediately before
 * `speak()` in the same synchronous tick drops the utterance, and selects a
 * fallback voice if the exact regional locale (e.g. hi-IN / en-IN) is absent.
 */

let speakTimer = null;

export function isSpeechSynthesisSupported() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

export function stopSpeaking() {
  if (speakTimer) {
    clearTimeout(speakTimer);
    speakTimer = null;
  }
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
}

function pickBestVoice(voices, langCode) {
  if (!Array.isArray(voices) || voices.length === 0) return null;
  const base = langCode.split("-")[0].toLowerCase();
  return (
    voices.find((v) => v.lang.toLowerCase() === langCode.toLowerCase()) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ||
    voices.find((v) => v.default) ||
    voices[0]
  );
}

export function speakText(text, lang = "en", { onStart, onEnd, onError } = {}) {
  if (!isSpeechSynthesisSupported()) {
    onError?.("Voice read aloud is not supported in this browser.");
    return;
  }

  const synth = window.speechSynthesis;
  stopSpeaking();

  const targetLang = lang === "hi" ? "hi-IN" : "en-IN";

  // Delay slightly after cancel() so Chromium/Brave does not drop the new utterance
  speakTimer = setTimeout(() => {
    speakTimer = null;
    try {
      const attemptSpeak = () => {
        const voices = synth.getVoices();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = targetLang;
        utterance.rate = 0.95;

        const matchedVoice = pickBestVoice(voices, targetLang);
        if (matchedVoice) {
          utterance.voice = matchedVoice;
          utterance.lang = matchedVoice.lang || targetLang;
        }

        utterance.onstart = () => onStart?.();
        utterance.onend = () => onEnd?.();
        utterance.onerror = (event) => {
          const errCode = event?.error || "unavailable";
          if (errCode === "canceled" || errCode === "interrupted") {
            onEnd?.();
            return;
          }
          onError?.(
            "No system speech voice is available in this browser. On Linux, install speech-dispatcher and espeak-ng (then restart the browser) or test on Android/Windows/macOS."
          );
        };

        if (synth.paused) {
          synth.resume();
        }
        synth.speak(utterance);
        onStart?.();
      };

      const initialVoices = synth.getVoices();
      if (initialVoices.length === 0 && typeof synth.addEventListener === "function") {
        let handled = false;
        const onVoices = () => {
          if (handled) return;
          handled = true;
          synth.removeEventListener("voiceschanged", onVoices);
          attemptSpeak();
        };
        synth.addEventListener("voiceschanged", onVoices);
        setTimeout(() => {
          if (!handled) {
            handled = true;
            synth.removeEventListener("voiceschanged", onVoices);
            attemptSpeak();
          }
        }, 250);
      } else {
        attemptSpeak();
      }
    } catch {
      onError?.("Unable to start voice read aloud on this device.");
    }
  }, 60);
}
