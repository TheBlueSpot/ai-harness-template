const KENNEY_SHOOTER = "https://cdn.jsdelivr.net/gh/kefik/kenney@master/Shooter";
const KENNEY_UI_AUDIO = "https://raw.githubusercontent.com/Calinou/kenney-ui-audio/master/addons/kenney_ui_audio";
const KENNEY_PARTICLE_PACK =
  "https://raw.githubusercontent.com/Calinou/kenney-particle-pack/master/addons/kenney_particle_pack";
const OPEN_GAME_ART = "https://opengameart.org/sites/default/files";

export const PAC_SHADOWS_ASSET_MANIFEST = Object.freeze({
  images: [
    {
      id: "player",
      path: `${KENNEY_SHOOTER}/playerShip1_blue.png`,
      label: "Player ship",
      sourceUrl: "https://kenney.nl/assets/space-shooter-redux"
    },
    {
      id: "ghost",
      path: `${KENNEY_SHOOTER}/ufoRed.png`,
      label: "Ghost",
      sourceUrl: "https://kenney.nl/assets/space-shooter-redux"
    },
    {
      id: "particle",
      path: `${KENNEY_PARTICLE_PACK}/spark_01.png`,
      label: "Spirit spark",
      sourceUrl: "https://www.kenney.nl/assets/particle-pack"
    },
    {
      id: "spirit-smoke",
      path: `${KENNEY_PARTICLE_PACK}/smoke_03.png`,
      label: "Spirit smoke",
      sourceUrl: "https://www.kenney.nl/assets/particle-pack"
    },
    {
      id: "ui-panel",
      path: `${KENNEY_SHOOTER}/parts/cockpitBlue_0.png`,
      label: "UI panel",
      sourceUrl: "https://kenney.nl/assets/space-shooter-redux"
    }
  ],
  sfx: [
    {
      id: "menu-start",
      path: `${KENNEY_UI_AUDIO}/click1.wav`,
      label: "Menu start",
      sourceUrl: "https://www.kenney.nl/assets/ui-audio"
    },
    {
      id: "step",
      path: `${KENNEY_UI_AUDIO}/switch1.wav`,
      label: "Footstep",
      sourceUrl: "https://www.kenney.nl/assets/ui-audio"
    },
    {
      id: "alert",
      path: `${OPEN_GAME_ART}/laserthing.wav`,
      label: "Alert",
      sourceUrl: "https://opengameart.org/content/laser"
    },
    {
      id: "win",
      path: `${OPEN_GAME_ART}/1x%20level%20win.ogg`,
      label: "Win",
      sourceUrl: "https://opengameart.org/content/game-game"
    },
    {
      id: "lose",
      path: `${OPEN_GAME_ART}/1x%20game%20over.ogg`,
      label: "Lose",
      sourceUrl: "https://opengameart.org/content/game-game"
    }
  ]
});
