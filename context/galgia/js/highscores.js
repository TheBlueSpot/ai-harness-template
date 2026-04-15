// galgia/js/highscores.js

const HIGHSCORE_KEY = 'galagia_highscore';

export const Highscores = {
    getHighScore() {
        const score = localStorage.getItem(HIGHSCORE_KEY);
        return score ? parseInt(score, 10) : 0;
    },

    setHighScore(score) {
        const currentHighScore = this.getHighScore();
        if (score > currentHighScore) {
            localStorage.setItem(HIGHSCORE_KEY, score.toString());
            return true; // New high score achieved
        }
        return false;
    },

    resetHighScores() {
        localStorage.removeItem(HIGHSCORE_KEY);
    }
};
