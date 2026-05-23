const defaultVolume = 0.45;

export class AudioManager {
  constructor(assets) {
    this.assets = assets;
    this.music = null;
    this.musicKey = null;
    this.pendingMusic = null;
    this.primed = false;
  }

  setAssets(assets) {
    this.assets = assets;
  }

  prime() {
    this.primed = true;
    if (this.pendingMusic) {
      const { key, options } = this.pendingMusic;
      this.pendingMusic = null;
      this.playMusic(key, options);
    }
  }

  requestMusic(key, options = {}) {
    if (!this.primed) {
      this.pendingMusic = { key, options };
      return;
    }
    this.playMusic(key, options);
  }

  playMusic(key, options = {}) {
    const source = this.assets?.audio?.get(key);
    if (!source) {
      return;
    }

    const volume = options.volume ?? defaultVolume;
    const loop = options.loop ?? true;

    if (this.musicKey === key && this.music) {
      this.music.volume = volume;
      return;
    }

    this.stopMusic();

    const music = new Audio(source.src);
    music.preload = "auto";
    music.loop = loop;
    music.volume = volume;
    music.currentTime = 0;

    const attempt = music.play();
    if (attempt?.catch) {
      attempt.catch(() => {
        this.music = null;
        this.musicKey = null;
        this.pendingMusic = { key, options: { volume, loop } };
      });
    }

    this.music = music;
    this.musicKey = key;
  }

  stopMusic() {
    if (this.music) {
      this.music.pause();
      this.music = null;
      this.musicKey = null;
    }
  }

  playSfx(key, options = {}) {
    if (!this.primed) {
      return;
    }

    const source = this.assets?.audio?.get(key);
    if (!source) {
      return;
    }

    const clip = new Audio(source.src);
    clip.preload = "auto";
    clip.loop = false;
    clip.volume = options.volume ?? 0.35;
    if (options.rate) {
      clip.playbackRate = options.rate;
    }
    clip.currentTime = 0;
    clip.addEventListener(
      "ended",
      () => {
        clip.remove();
      },
      { once: true }
    );

    const attempt = clip.play();
    if (attempt?.catch) {
      attempt.catch(() => {});
    }
  }
}
