// Browser-native speech layer (Web Speech API). Client-side only — no backend,
// no API key. Text remains the source of truth; this is purely presentation
// (TTS for panel questions) and input (STT dictation for answers).
//
// Panel questions can be in English or Bengali (each turn carries its own
// `language` tag); the TTS picks a matching voice/locale per turn. Answer
// dictation stays English-only.
//
// NOTE: some browsers restrict this API. Brave, in particular, disables speech
// *recognition* (it relies on Google's cloud service) and its fingerprinting
// shield can empty getVoices(), breaking synthesis. Chrome / Edge / Safari work.
// Bengali synthesis depends on a bn voice being installed; when none is present
// we fall back to the default voice with the bn locale.
//
// Speech-to-text has two paths (see `useDictation`): the native Web Speech API
// where it works (desktop), and a server-side recording fallback (MediaRecorder
// → /api/transcribe) for mobile and browsers that block recognition (Brave, and
// third-party browsers on iOS, which can't use the Web Speech API at all).
import { useCallback, useEffect, useRef, useState } from "react";
import type { SpeechLanguage } from "@/lib/types";

// BCP-47 locale requested per language.
const LOCALE: Record<SpeechLanguage, string> = { en: "en-US", bn: "bn-BD" };

// --- Minimal typings (webkitSpeechRecognition isn't in the DOM lib) ---
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [i: number]: RecognitionResult };
}
interface RecognitionErrorEvent {
  error?: string;
}
interface RecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => RecognitionInstance;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Give each panel member a slightly distinct voice so the chairman and members
// are audibly different, and match the voice to the turn's language.
function voiceFor(
  seed: number,
  lang: SpeechLanguage,
): { pitch: number; rate: number; voice?: SpeechSynthesisVoice } {
  const variations = [
    { pitch: 0.9, rate: 0.95 }, // chair — lower, measured
    { pitch: 1.05, rate: 1.0 }, // member 1
    { pitch: 1.0, rate: 1.05 }, // member 2
  ];
  const v = variations[seed % variations.length];
  const prefix = lang === "bn" ? "bn" : "en";
  const matching = window.speechSynthesis
    .getVoices()
    .filter((x) => x.lang.toLowerCase().startsWith(prefix));
  // No bn voice installed → leave voice undefined and rely on the bn locale.
  const voice = matching.length ? matching[seed % matching.length] : undefined;
  return { ...v, voice };
}

// Module-level ref so the in-flight utterance isn't garbage-collected mid-speech
// (a long-standing Chrome bug that makes speech silently never start).
let keepAlive: SpeechSynthesisUtterance | null = null;

// Calling cancel() immediately before speak() can swallow the new utterance in
// Chrome, so when something is already speaking we cancel, then queue on a tick.
function fireAfterCancel(synth: SpeechSynthesis, build: () => void) {
  if (synth.speaking || synth.pending) {
    synth.cancel();
    window.setTimeout(build, 120);
  } else {
    build();
  }
}

// --- Text-to-speech (panel questions) ---
export function useSpeak() {
  // Detect support after mount so server and first client render agree (avoids a
  // hydration mismatch); it flips true on the client once mounted.
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported("speechSynthesis" in window);
  }, []);
  const [speaking, setSpeaking] = useState(false);
  // Increments on each spoken word boundary. The voice orb watches this to
  // ripple roughly in time with the speech. Safari fires `onboundary`
  // inconsistently, so consumers must also animate from `speaking` alone.
  const [pulse, setPulse] = useState(0);
  const [muted, setMutedState] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (text: string, seed = 0, lang: SpeechLanguage = "en") => {
      if (!supported || muted || !text) return;
      const synth = window.speechSynthesis;
      // Un-stick Chrome's occasional stuck-paused state from a prior utterance.
      if (synth.paused) synth.resume();

      const build = () => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = LOCALE[lang];
        const { pitch, rate, voice } = voiceFor(seed, lang);
        u.pitch = pitch;
        u.rate = rate;
        if (voice) u.voice = voice;
        u.onstart = () => {
          setSpeaking(true);
          setError(null);
        };
        u.onboundary = () => setPulse((p) => (p + 1) % 1_000_000);
        u.onend = () => setSpeaking(false);
        u.onerror = (e: SpeechSynthesisErrorEvent) => {
          setSpeaking(false);
          // "interrupted"/"canceled" are normal when we cancel; ignore them.
          if (e.error && e.error !== "interrupted" && e.error !== "canceled") {
            setError(
              "Couldn't play audio in this browser (" +
                e.error +
                "). Some browsers (e.g. Brave) block speech — try Chrome, Edge, or Safari.",
            );
          }
        };
        // Hold a module-level reference: Chrome may GC the utterance otherwise.
        keepAlive = u;
        synth.speak(u);
        if (synth.paused) synth.resume();
      };

      // Voices may not be loaded on the first call; wait for them once, but fall
      // back to a short timeout so we never hang if `voiceschanged` never fires.
      if (synth.getVoices().length === 0) {
        let done = false;
        const go = () => {
          if (done) return;
          done = true;
          fireAfterCancel(synth, build);
        };
        synth.addEventListener("voiceschanged", go, { once: true });
        synth.getVoices(); // trigger population
        window.setTimeout(go, 250);
        return;
      }
      fireAfterCancel(synth, build);
    },
    [supported, muted],
  );

  const setMuted = useCallback(
    (next: boolean) => {
      setMutedState(next);
      if (next) cancel();
    },
    [cancel],
  );

  // Stop any speech if the component unmounts (e.g. session completes).
  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  return { supported, speaking, pulse, speak, cancel, muted, setMuted, error };
}

// --- Speech-to-text: native Web Speech path (live, free, no backend) ---
// Used directly where the browser supports it (desktop Chrome/Edge/Safari,
// Android Chrome). When the engine is missing or refuses (Brave routes
// recognition through Google's cloud and blocks it), `onUnavailable` fires so the
// orchestrator below can fall back to server-side transcription.
function useNativeDictation(handlers: {
  onStart?: () => void;
  onResult?: (text: string) => void;
  onEnd?: () => void;
  onUnavailable?: () => void;
}) {
  // Mount-gated for the same hydration reason as useSpeak.
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(recognitionCtor() !== null);
  }, []);
  const recRef = useRef<RecognitionInstance | null>(null);
  const finalRef = useRef("");
  const intentRef = useRef(false); // does the user still want to be listening?
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep latest handlers without re-creating start/stop each render.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const launch = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: RecognitionEvent) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interim += r[0].transcript;
      }
      handlersRef.current.onResult?.((finalRef.current + interim).trim());
    };
    rec.onerror = (e: RecognitionErrorEvent) => {
      const code = e?.error ?? "unknown";
      if (code === "not-allowed") {
        // Genuine permission denial — server recording would be blocked too.
        intentRef.current = false;
        setListening(false);
        setError(
          "Microphone is blocked. Allow mic access for this site and try again.",
        );
      } else if (code === "network" || code === "service-not-allowed") {
        // Brave (and other browsers that can't reach the cloud recognizer) land
        // here. Hand off to the recording fallback instead of showing an error.
        intentRef.current = false;
        setListening(false);
        handlersRef.current.onUnavailable?.();
      } else if (code !== "no-speech" && code !== "aborted") {
        setError("Voice input error: " + code);
      }
    };
    rec.onend = () => {
      recRef.current = null;
      // Chrome stops on silence even with continuous=true. If the user still
      // wants to dictate, transparently restart; otherwise settle to idle.
      if (intentRef.current) {
        try {
          launch();
        } catch {
          intentRef.current = false;
          setListening(false);
        }
      } else {
        setListening(false);
        handlersRef.current.onEnd?.();
      }
    };
    recRef.current = rec;
    rec.start();
  }, []);

  const start = useCallback(() => {
    if (!recognitionCtor()) return;
    setError(null);
    finalRef.current = "";
    intentRef.current = true;
    setListening(true);
    handlersRef.current.onStart?.();
    try {
      launch();
    } catch {
      intentRef.current = false;
      setListening(false);
    }
  }, [launch]);

  const stop = useCallback(() => {
    intentRef.current = false;
    recRef.current?.stop();
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (intentRef.current) stop();
    else start();
  }, [start, stop]);

  useEffect(() => {
    return () => {
      intentRef.current = false;
      recRef.current?.abort();
    };
  }, []);

  return { supported, listening, toggle, stop, error };
}

// --- Speech-to-text: server recording path (universal fallback) ---
// Records the answer with MediaRecorder and posts it to /api/transcribe, which
// transcribes via OpenAI. Works in any browser with getUserMedia + MediaRecorder
// (Brave, Android Chrome, third-party iOS browsers) — the trade-off vs. the
// native path is no live interim text: the transcript arrives once, after stop.
function useRecorderDictation(handlers: {
  onStart?: () => void;
  onResult?: (text: string) => void;
  onEnd?: () => void;
}) {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof window.MediaRecorder !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia,
    );
  }, []);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(
        "Microphone is blocked. Allow mic access for this site and try again.",
      );
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    mr.onstop = async () => {
      releaseStream();
      setListening(false);
      const type = mr.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      if (!blob.size) {
        handlersRef.current.onEnd?.();
        return;
      }
      setTranscribing(true);
      try {
        // Name the file with an extension matching the container so OpenAI can
        // sniff the format (mp4/m4a on Safari, webm elsewhere).
        const ext = type.includes("mp4") || type.includes("mpeg") ? "mp4" : "webm";
        const form = new FormData();
        form.append("audio", blob, `answer.${ext}`);
        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: form,
        });
        if (!res.ok) throw new Error(String(res.status));
        const { text } = (await res.json()) as { text?: string };
        if (text) handlersRef.current.onResult?.(text);
      } catch {
        setError(
          "Couldn't transcribe the recording. Please try again, or type your answer.",
        );
      } finally {
        setTranscribing(false);
        handlersRef.current.onEnd?.();
      }
    };
    recRef.current = mr;
    mr.start();
    setListening(true);
    handlersRef.current.onStart?.();
  }, [releaseStream]);

  const stop = useCallback(() => {
    if (recRef.current && recRef.current.state !== "inactive") {
      recRef.current.stop(); // triggers onstop → transcription
    }
    recRef.current = null;
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else void start();
  }, [listening, start, stop]);

  useEffect(() => {
    return () => {
      if (recRef.current && recRef.current.state !== "inactive") {
        recRef.current.stop();
      }
      releaseStream();
    };
  }, [releaseStream]);

  return { supported, listening, transcribing, toggle, stop, error };
}

// Mobile is the reason this fallback exists: Android Chrome's native recognition
// is unreliable and Brave blocks it outright, so on touch devices we go straight
// to server recording rather than risk a silent native failure.
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// --- Speech-to-text orchestrator (what components consume) ---
// Prefers the native Web Speech path (live interim text, no API cost) on desktop,
// and falls back to server recording when native is unsupported, when running on
// a mobile device, or when native errors out mid-attempt (Brave). Exposes one
// stable interface so the UI doesn't care which path is active.
export function useDictation(handlers: {
  onStart?: () => void;
  onResult?: (text: string) => void;
  onEnd?: () => void;
}) {
  const [useRecorder, setUseRecorder] = useState(false);
  const [fallbackError, setFallbackError] = useState<string | null>(null);

  const recorder = useRecorderDictation(handlers);
  // start identity changes per render; keep the latest so the native error
  // handler can kick off a recording without re-subscribing.
  const recorderStartRef = useRef(recorder.toggle);
  recorderStartRef.current = recorder.toggle;
  const recorderSupportedRef = useRef(recorder.supported);
  recorderSupportedRef.current = recorder.supported;

  const native = useNativeDictation({
    ...handlers,
    onUnavailable: () => {
      if (recorderSupportedRef.current) {
        setUseRecorder(true);
        recorderStartRef.current(); // retry the same tap via recording
      } else {
        setFallbackError(
          "Voice input isn't available in this browser. Try Chrome or Safari, or type your answer.",
        );
      }
    },
  });

  // Decide the default path once, after mount (userAgent/getUserMedia need the
  // client). Mobile and native-unsupported browsers go straight to recording.
  useEffect(() => {
    if (!native.supported || (isMobileDevice() && recorder.supported)) {
      setUseRecorder(true);
    }
  }, [native.supported, recorder.supported]);

  const active = useRecorder ? recorder : native;
  const toggle = useCallback(() => {
    setFallbackError(null);
    active.toggle();
  }, [active]);

  return {
    supported: native.supported || recorder.supported,
    listening: active.listening,
    transcribing: recorder.transcribing,
    recording: useRecorder,
    toggle,
    stop: active.stop,
    error: fallbackError ?? active.error,
  };
}

// Persona styling/seed helpers live in lib/personaStyle.ts (hook-free, so server
// components can import them); re-exported here for the existing call sites.
export { seedForPersona } from "@/lib/personaStyle";
