export const ASSET_MANIFEST = Object.freeze({
  hologramCore: {
    kind: "image",
    src: "../assets/images/hologram-core.png",
  },
  place: {
    kind: "audio",
    src: "../assets/sfx/place.wav",
  },
});

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image asset: ${source}`));
    image.src = source;
  });
}

function loadAudio(source) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const cleanup = () => {
      audio.removeEventListener("loadeddata", onReady);
      audio.removeEventListener("canplaythrough", onReady);
      audio.removeEventListener("error", onError);
    };

    const onReady = () => {
      cleanup();
      resolve(audio);
    };

    const onError = () => {
      cleanup();
      reject(new Error(`Failed to load audio asset: ${source}`));
    };

    audio.preload = "auto";
    audio.addEventListener("loadeddata", onReady, { once: true });
    audio.addEventListener("canplaythrough", onReady, { once: true });
    audio.addEventListener("error", onError, { once: true });
    audio.src = source;
    audio.load();
  });
}

async function loadAsset(definition) {
  const resolvedSource = new URL(definition.src, import.meta.url).href;
  if (definition.kind === "image") {
    return loadImage(resolvedSource);
  }

  if (definition.kind === "audio") {
    return loadAudio(resolvedSource);
  }

  throw new Error(`Unsupported asset kind: ${definition.kind}`);
}

export async function loadAssets(manifest = ASSET_MANIFEST) {
  const ids = Object.keys(manifest);
  const entries = await Promise.all(
    ids.map(async (id) => [id, await loadAsset(manifest[id])])
  );

  return Object.fromEntries(entries);
}
