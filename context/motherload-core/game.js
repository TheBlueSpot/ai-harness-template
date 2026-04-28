(function loadGame() {
  const gameScript = document.createElement("script");
  gameScript.src = "./src/Game.js";
  gameScript.onload = function onGameLoaded() {
    const mainScript = document.createElement("script");
    mainScript.src = "./src/main.js";
    document.body.appendChild(mainScript);
  };
  document.body.appendChild(gameScript);
})();
