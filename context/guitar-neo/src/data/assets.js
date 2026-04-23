import { assetManifest } from "./tracks.js";

export { assetManifest };

export function getTrackAsset(trackId) {
  return assetManifest.tracks[trackId] ?? null;
}

