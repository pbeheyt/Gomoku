import { LeaderboardEntry, Player } from '../core/types.js';

const LEADERBOARD_KEY = 'gomoku-leaderboard-v1';
const MAX_ENTRIES = 10;

export class LeaderboardManager {
  public static calculateScore(moves: number, timeSeconds: number, playerColor: Player): number {
    const base = 10000;
    const movePenalty = moves * 50;
    const timePenalty = Math.floor(timeSeconds * 5);
    
    let score = base - movePenalty - timePenalty;
    
    // Bonus défensif pour les Blancs
    if (playerColor === Player.WHITE) score += 500;
    
    return Math.max(0, score);
  }

  public static getEntries(): LeaderboardEntry[] {
    try {
      const raw = localStorage.getItem(LEADERBOARD_KEY);
      if (!raw) return [];
      
      return JSON.parse(raw) as LeaderboardEntry[];
    } catch (e) {
      console.error("Échec de l'analyse du classement", e);
      return [];
    }
  }

  public static addEntry(moves: number, timeSeconds: number, aiLevel: string, playerColor: Player): LeaderboardEntry {
    const score = this.calculateScore(moves, timeSeconds, playerColor);
    
    const newEntry: LeaderboardEntry = {
      date: new Date().toLocaleDateString('fr-FR'),
      moves,
      timeSeconds,
      score,
      aiLevel,
      playerColor
    };

    const entries = this.getEntries();
    entries.push(newEntry);

    entries.sort((a, b) => b.score - a.score);

    if (entries.length > MAX_ENTRIES) {
      entries.splice(MAX_ENTRIES);
    }

    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
    return newEntry;
  }

  public static generateHTML(): string {
    const entries = this.getEntries();
    
    let html = `<p style="text-align:center; margin-bottom:15px; color:#aaa; font-size:0.9rem;">
        Ce classement enregistre uniquement les victoires contre l'IA native (C++).
    </p>`;

    if (entries.length === 0) {
      return html + '<p style="text-align:center; color:#aaa; margin-top: 20px;">Aucune partie enregistrée pour le moment.</p>';
    }

    html += `
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th>Rang</th>
            <th>Joueur</th>
            <th>Date</th>
            <th>Coups</th>
            <th>Temps</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
    `;

    entries.forEach((entry, index) => {
      const rankDisplay = `#${index + 1}`;

      const color = entry.playerColor ?? Player.BLACK;
      const colorDot = color === Player.BLACK 
        ? '<span style="color:#000; text-shadow: 0 0 2px #fff;">⚫</span>' 
        : '<span style="color:#fff; text-shadow: 0 0 2px #000;">⚪</span>';

      html += `
        <tr>
          <td class="rank-col">${rankDisplay}</td>
          <td style="font-size: 1.2rem;">${colorDot}</td>
          <td>${entry.date}</td>
          <td>${entry.moves}</td>
          <td>${this.formatTime(entry.timeSeconds)}</td>
          <td class="score-col">${entry.score} pts</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    return html;
  }

  private static formatTime(totalSeconds: number): string {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
