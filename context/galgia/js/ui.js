// galgia/js/ui.js

import { Highscores } from './highscores.js';

const overlay = document.getElementById('overlay');
const menuScreen = document.getElementById('menu');
const startButton = document.getElementById('start-button');
const gameOverScreen = document.getElementById('game-over');
const restartButton = document.getElementById('restart-button');
const finalScoreSpan = document.getElementById('final-score');
const scoreDisplay = document.getElementById('score-display');
const highScoreDisplay = document.getElementById('high-score-display');

let onStartGameCallback = null;
let onRestartGameCallback = null;

export function setupUI(onStart, onRestart) {
    onStartGameCallback = onStart;
    onRestartGameCallback = onRestart;

    startButton.addEventListener('click', () => {
        hideMenu();
        onStartGameCallback();
    });

    restartButton.addEventListener('click', () => {
        hideGameOver();
        onRestartGameCallback();
    });

    updateHighScoreDisplay();
}

export function showMenu() {
    menuScreen.style.display = 'block';
    gameOverScreen.style.display = 'none';
    overlay.style.pointerEvents = 'all';
}

export function hideMenu() {
    menuScreen.style.display = 'none';
    overlay.style.pointerEvents = 'none';
}

export function showGameOver(score) {
    finalScoreSpan.textContent = score;
    gameOverScreen.style.display = 'block';
    menuScreen.style.display = 'none';
    overlay.style.pointerEvents = 'all';
    Highscores.setHighScore(score);
    updateHighScoreDisplay();
}

export function hideGameOver() {
    gameOverScreen.style.display = 'none';
    overlay.style.pointerEvents = 'none';
}

export function updateScoreDisplay(score) {
    scoreDisplay.textContent = `SCORE: ${score}`;
}

export function updateHighScoreDisplay() {
    highScoreDisplay.textContent = `HIGH SCORE: ${Highscores.getHighScore()}`;
}
