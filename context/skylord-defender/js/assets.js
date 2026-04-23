export class AssetLoader {
  constructor(manifest) {
    this.manifest = manifest;
  }

  loadImage(entry) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ id: entry.id, ok: true, asset: image });
      image.onerror = () => resolve({ id: entry.id, ok: false, asset: null });
      image.src = entry.path;
    });
  }

  loadAudio(entry) {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = "auto";
      audio.src = entry.path;
      audio.addEventListener("loadeddata", () => resolve({ id: entry.id, ok: true, asset: audio }), {
        once: true,
      });
      audio.addEventListener("error", () => resolve({ id: entry.id, ok: false, asset: null }), { once: true });
      audio.load();
    });
  }

  async load() {
    const results = await Promise.all(this.manifest.images.map((entry) => this.loadImage(entry)));
    const audioResults = await Promise.all((this.manifest.audio ?? []).map((entry) => this.loadAudio(entry)));
    const images = new Map();
    const audio = new Map();
    const status = {
      imagesRequested: this.manifest.images.length,
      imagesLoaded: 0,
      imagesMissing: 0,
      audioRequested: (this.manifest.audio ?? []).length,
      audioLoaded: 0,
      audioMissing: 0,
    };

    for (const result of results) {
      if (result.ok && result.asset) {
        images.set(result.id, result.asset);
        status.imagesLoaded += 1;
      } else {
        status.imagesMissing += 1;
      }
    }

    for (const result of audioResults) {
      if (result.ok && result.asset) {
        audio.set(result.id, result.asset);
        status.audioLoaded += 1;
      } else {
        status.audioMissing += 1;
      }
    }

    return { images, audio, status };
  }
}
