const MICROSECONDS_PER_SECOND = 1_000_000;

function toArrayBuffer(source) {
  if (source instanceof ArrayBuffer) return source;
  if (ArrayBuffer.isView(source)) {
    return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  }
  return null;
}

function createSilentBuffer(audioContext, durationSeconds = 1) {
  return audioContext.createBuffer(2, Math.max(1, Math.ceil(audioContext.sampleRate * durationSeconds)), audioContext.sampleRate);
}

function resolveLocalUrl(source) {
  if (typeof source !== "string" || !source.trim()) return null;
  try {
    return new URL(source, document.baseURI).toString();
  } catch {
    return source;
  }
}

function createProceduralBuffer(audioContext, trackMeta = {}) {
  const durationSeconds = Math.max(8, trackMeta.durationSeconds ?? 32);
  const buffer = audioContext.createBuffer(2, Math.ceil(audioContext.sampleRate * durationSeconds), audioContext.sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const baseFrequency = trackMeta.baseFrequency ?? 110;
  const pulseFrequency = trackMeta.bpm ? trackMeta.bpm / 60 : 2.5;
  for (let i = 0; i < left.length; i += 1) {
    const t = i / audioContext.sampleRate;
    const envelope = Math.min(1, t / 0.25) * Math.max(0, 1 - t / durationSeconds);
    const tone = Math.sin(2 * Math.PI * baseFrequency * t) * 0.22;
    const harmonic = Math.sin(2 * Math.PI * baseFrequency * 2 * t + 0.35) * 0.08;
    const pulse = Math.sin(2 * Math.PI * pulseFrequency * t) * 0.08;
    const shimmer = Math.sin(2 * Math.PI * (baseFrequency * 4) * t * 0.5) * 0.04;
    const sample = (tone + harmonic + pulse + shimmer) * envelope;
    left[i] = sample;
    right[i] = sample * 0.96;
  }
  return buffer;
}

export class AudioBufferHandler {
  constructor({ audioContext, analyser } = {}) {
    const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    this.audioContext = audioContext ?? (AudioContextCtor ? new AudioContextCtor() : null);
    this.analyser = analyser ?? (this.audioContext ? this.audioContext.createAnalyser() : null);
    this.sourceNode = null;
    this.currentBuffer = null;
    this.currentTrack = null;
    this.playbackStartedAt = 0;
    this.playbackOffsetSeconds = 0;
    this.pausedOffsetSeconds = 0;
    this.isPlaying = false;
    if (this.analyser) {
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.82;
      this.analyser.connect(this.audioContext.destination);
    }
  }

  async loadTrack(trackMeta) {
    this.currentTrack = trackMeta ?? null;
    if (!this.audioContext) {
      this.currentBuffer = {
        duration: Math.max(8, trackMeta?.durationSeconds ?? 32),
      };
      return this.currentBuffer;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    let buffer = null;
    const source = trackMeta?.audioUrl ?? trackMeta?.sourceUrl ?? trackMeta?.audioData ?? trackMeta?.source?.sourceUrl ?? null;
    const arrayBuffer = toArrayBuffer(source);
    if (arrayBuffer) {
      try {
        buffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
      } catch (error) {
        throw new Error(`Unable to decode audio buffer for track ${trackMeta?.id ?? "unknown"}: ${error?.message ?? error}`);
      }
    } else if (typeof source === "string" && source) {
      const resolvedUrl = resolveLocalUrl(source);
      if (resolvedUrl?.startsWith("file:")) {
        buffer = createProceduralBuffer(this.audioContext, trackMeta ?? {});
      } else {
      try {
        const response = await fetch(resolvedUrl, { cache: "force-cache" });
        if (!response.ok) {
          throw new Error(`Unable to fetch audio asset for track ${trackMeta?.id ?? "unknown"}: ${response.status} ${response.statusText}`);
        }
        const bytes = await response.arrayBuffer();
        buffer = await this.audioContext.decodeAudioData(bytes);
      } catch (error) {
        buffer = createProceduralBuffer(this.audioContext, trackMeta ?? {});
      }
      }
    } else {
      buffer = createProceduralBuffer(this.audioContext, trackMeta ?? {});
    }

    this.currentBuffer = buffer ?? createSilentBuffer(this.audioContext);
    return this.currentBuffer;
  }

  createSource() {
    if (!this.audioContext || !this.currentBuffer) return null;
    const source = this.audioContext.createBufferSource();
    source.buffer = this.currentBuffer;
    if (this.analyser) source.connect(this.analyser);
    else source.connect(this.audioContext.destination);
    return source;
  }

  async play(offsetSeconds = 0) {
    if (!this.audioContext) {
      this.playbackOffsetSeconds = Math.max(0, offsetSeconds);
      this.playbackStartedAt = Date.now() / 1000 - this.playbackOffsetSeconds;
      this.isPlaying = true;
      return;
    }
    if (this.audioContext.state !== "running") await this.audioContext.resume();
    if (!this.currentBuffer) this.currentBuffer = createSilentBuffer(this.audioContext);
    if (this.sourceNode) {
      this.sourceNode.stop();
      this.sourceNode.disconnect();
    }
    this.sourceNode = this.createSource();
    if (!this.sourceNode) return;
    const startOffset = Math.max(0, offsetSeconds);
    this.playbackOffsetSeconds = startOffset;
    this.playbackStartedAt = this.audioContext.currentTime - startOffset;
    this.isPlaying = true;
    this.sourceNode.onended = () => {
      if (this.isPlaying) {
        this.isPlaying = false;
        this.pausedOffsetSeconds = this.getCurrentTimeMicroseconds() / MICROSECONDS_PER_SECOND;
      }
    };
    this.sourceNode.start(0, startOffset);
  }

  pause() {
    if (!this.audioContext || !this.isPlaying) return;
    this.pausedOffsetSeconds = this.getCurrentTimeMicroseconds() / MICROSECONDS_PER_SECOND;
    this.stop(false);
  }

  stop(resetOffset = true) {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch {}
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.isPlaying = false;
    if (resetOffset) this.pausedOffsetSeconds = 0;
  }

  getCurrentTimeMicroseconds() {
    if (!this.audioContext) {
      if (!this.isPlaying) return Math.round(this.pausedOffsetSeconds * MICROSECONDS_PER_SECOND);
      const seconds = Math.max(0, Date.now() / 1000 - this.playbackStartedAt);
      return Math.round(seconds * MICROSECONDS_PER_SECOND);
    }
    if (!this.isPlaying) return Math.round(this.pausedOffsetSeconds * MICROSECONDS_PER_SECOND);
    const seconds = Math.max(0, this.audioContext.currentTime - this.playbackStartedAt);
    return Math.round(seconds * MICROSECONDS_PER_SECOND);
  }

  getFrequencyData() {
    if (!this.analyser) return new Uint8Array(0);
    const bins = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(bins);
    return bins;
  }
}
