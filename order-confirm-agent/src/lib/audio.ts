// Browser audio plumbing: one AudioContext + AnalyserNode shared by the mic
// (while the customer talks) and the <audio> element (while the agent talks),
// so the Waveform draws REAL data from whatever is actually making sound.
//
// Client-only. Everything here touches Web Audio / MediaRecorder.

"use client";

class AudioBus {
  readonly ctx: AudioContext;
  readonly analyser: AnalyserNode;
  private micSource: MediaStreamAudioSourceNode | null = null;
  // MediaElementSourceNode can only be created once per element — cache it.
  private elSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

  constructor() {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  // Mic → analyser only (NOT to destination, or we'd echo the customer).
  connectMic(stream: MediaStream): void {
    this.disconnectMic();
    this.micSource = this.ctx.createMediaStreamSource(stream);
    this.micSource.connect(this.analyser);
  }

  disconnectMic(): void {
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {
        /* already gone */
      }
      this.micSource = null;
    }
  }

  // Agent audio element → analyser AND destination (we want to hear it).
  connectElement(el: HTMLAudioElement): void {
    let src = this.elSources.get(el);
    if (!src) {
      src = this.ctx.createMediaElementSource(el);
      this.elSources.set(el, src);
    }
    try {
      src.disconnect();
    } catch {
      /* fine */
    }
    src.connect(this.analyser);
    src.connect(this.ctx.destination);
  }

  // Fill `out` with the current time-domain waveform (0..255, 128 = silence).
  readWave(out: Uint8Array<ArrayBuffer>): void {
    this.analyser.getByteTimeDomainData(out);
  }

  get waveSize(): number {
    return this.analyser.fftSize;
  }
}

let _bus: AudioBus | null = null;
export function getAudioBus(): AudioBus {
  if (!_bus) _bus = new AudioBus();
  return _bus;
}

function pickMime(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const c of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(c)
    ) {
      return c;
    }
  }
  return "audio/webm";
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export interface Recording {
  stream: MediaStream;
  stop: () => Promise<{ base64: string; mimeType: string } | null>;
  cancel: () => void;
}

// Start push-to-talk recording. Wires the mic into the shared analyser so the
// waveform moves while the customer speaks.
export async function startRecording(): Promise<Recording> {
  const bus = getAudioBus();
  await bus.resume();

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  bus.connectMic(stream);

  const mimeType = pickMime();
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();

  const teardown = () => {
    bus.disconnectMic();
    stream.getTracks().forEach((t) => t.stop());
  };

  return {
    stream,
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = async () => {
          teardown();
          if (!chunks.length) return resolve(null);
          const blob = new Blob(chunks, { type: mimeType });
          const base64 = bufferToBase64(await blob.arrayBuffer());
          resolve({ base64, mimeType });
        };
        recorder.stop();
      }),
    cancel: () => {
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
      teardown();
    },
  };
}

// Play a base64 mp3 through the shared analyser (so the waveform moves while the
// agent talks). Resolves when playback ends.
export async function playBase64Mp3(base64: string): Promise<void> {
  const bus = getAudioBus();
  await bus.resume();

  const el = new Audio(`data:audio/mpeg;base64,${base64}`);
  el.crossOrigin = "anonymous";
  bus.connectElement(el);

  await new Promise<void>((resolve) => {
    el.onended = () => resolve();
    el.onerror = () => resolve();
    el.play().catch(() => resolve());
  });
}
