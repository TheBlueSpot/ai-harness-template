(() => {
  const { VIEW_HEIGHT, VIEW_WIDTH } = window.BraidTimeEchoData;
  const { Game } = window.BraidTimeEchoGame;
  const { render } = window.BraidTimeEchoRender;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  canvas.width = VIEW_WIDTH;
  canvas.height = VIEW_HEIGHT;

  const shardCount = document.getElementById("shardCount");
  const echoCount = document.getElementById("echoCount");
  const rewindMeter = document.getElementById("rewindMeter");
  const statusText = document.getElementById("statusText");
  const panel = document.getElementById("panel");
  const panelTitle = document.getElementById("panelTitle");
  const panelBody = document.getElementById("panelBody");
  const panelGoals = document.getElementById("panelGoals");
  const panelButton = document.getElementById("panelButton");

  const game = new Game();
  const input = {
    leftHeld: false,
    rightHeld: false,
    rewindHeld: false,
    jumpPressed: false,
    startPressed: false,
    restartPressed: false
  };

  function isMoveKey(code) {
    return code === "ArrowLeft" || code === "KeyA" || code === "ArrowRight" || code === "KeyD";
  }

  function isJumpKey(code) {
    return code === "ArrowUp" || code === "KeyW" || code === "Space";
  }

  function isStartKey(code) {
    return code === "Enter" || isJumpKey(code) || isMoveKey(code);
  }

  function tryOverlayAction() {
    const frame = game.getFrameState();
    if (frame.mode === "menu") {
      game.start();
      return true;
    }
    if (frame.mode === "win" || frame.mode === "lose") {
      game.restart();
      game.start();
      return true;
    }
    return false;
  }

  function pressAction(code, value) {
    if (code === "ArrowLeft" || code === "KeyA") {
      input.leftHeld = value;
    }
    if (code === "ArrowRight" || code === "KeyD") {
      input.rightHeld = value;
    }
    if (code === "KeyR") {
      input.rewindHeld = value;
    }
  }

  window.addEventListener("keydown", (event) => {
    pressAction(event.code, true);
    if (isJumpKey(event.code)) {
      input.jumpPressed = true;
    }
    if (event.code === "Enter") {
      input.startPressed = true;
    }
    if (event.code === "KeyT") {
      input.restartPressed = true;
    }
    if (isStartKey(event.code)) {
      tryOverlayAction();
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "KeyA", "KeyD", "KeyW", "KeyR", "Space", "Enter", "KeyT"].includes(event.code)) {
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    pressAction(event.code, false);
  });

  panelButton.addEventListener("click", (event) => {
    event.stopPropagation();
    tryOverlayAction();
  });

  panel.addEventListener("pointerdown", (event) => {
    if (event.target === panel || event.target === panelTitle || event.target === panelBody || event.target === panelGoals) {
      tryOverlayAction();
    }
  });

  canvas.addEventListener("pointerdown", () => {
    tryOverlayAction();
  });

  let previous = performance.now();

  function updatePanel(frame) {
    shardCount.textContent = `${frame.collectedCount} / 3`;
    echoCount.textContent = `${frame.echoes.length}`;
    rewindMeter.textContent = `${frame.rewindSeconds}s`;
    statusText.textContent = frame.statusText;

    if (frame.mode === "menu") {
      panel.hidden = false;
      panel.inert = false;
      panel.setAttribute("aria-hidden", "false");
      panel.dataset.interactive = "true";
      panelTitle.textContent = "Braid Time Echo";
      panelBody.textContent = "Click anywhere on this panel, or press Enter, Space, or a move key to begin. Hold R to scrub backward through your own path, then release it to leave an echo that can hold a switch for you.";
      panelGoals.hidden = false;
      panelButton.hidden = false;
      panelButton.textContent = "Start Run";
    } else if (frame.mode === "win") {
      panel.hidden = false;
      panel.inert = false;
      panel.setAttribute("aria-hidden", "false");
      panel.dataset.interactive = "true";
      panelTitle.textContent = "Exit Reached";
      panelBody.textContent = "Every shard is stable and the final loop closed. Click anywhere here or press Enter, Space, or a move key to play again.";
      panelGoals.hidden = true;
      panelButton.hidden = false;
      panelButton.textContent = "Play Again";
    } else if (frame.mode === "lose") {
      panel.hidden = false;
      panel.inert = false;
      panel.setAttribute("aria-hidden", "false");
      panel.dataset.interactive = "true";
      panelTitle.textContent = "Fractured";
      panelBody.textContent = "Spikes or a bad fall broke the timeline. Click anywhere here or press Enter, Space, or a move key to retry.";
      panelGoals.hidden = true;
      panelButton.hidden = false;
      panelButton.textContent = "Retry";
    } else {
      panel.hidden = true;
      panel.inert = true;
      panel.setAttribute("aria-hidden", "true");
      delete panel.dataset.interactive;
    }
  }

  function frame(now) {
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    game.update(dt, input);
    const current = game.getFrameState();
    render(ctx, current);
    updatePanel(current);
    input.jumpPressed = false;
    input.startPressed = false;
    input.restartPressed = false;
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
