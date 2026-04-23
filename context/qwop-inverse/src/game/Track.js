export class Track {
  constructor(config) {
    this.config = config;
    this.horizon = config.trackHorizon ?? 1200;
    this.baseY = config.groundY;
    this.groundAmplitude = config.groundAmplitude ?? 0;
    this.groundWavelength = config.groundWavelength ?? 420;
  }

  sampleGroundHeight(x) {
    const wave = Math.sin((x / this.groundWavelength) * Math.PI * 2) * this.groundAmplitude;
    const rough = Math.sin((x / (this.groundWavelength * 0.5)) * Math.PI * 2) * (this.groundAmplitude * 0.3);
    return this.baseY + wave + rough;
  }

  getDistance(originX, comX) {
    return Math.max(0, (comX - originX) * (this.config.distanceScale ?? 0.1));
  }
}
