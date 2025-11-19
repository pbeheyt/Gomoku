/**
 * Manages the local leaderboard using localStorage.
 * Tracks top 10 scores for Player vs AI games.
 */
import { LeaderboardEntry, Player } from '../core/types.js';

const LEADERBOARD_KEY = 'gomoku-leaderboard-v1';
const MAX_ENTRIES = 10;

export class LeaderboardManager {
  
  /**
   * Calculates the performance score.
   * Formula: Base (10000) - (Moves * 50) - (TimeSeconds * 5)
   * Ensures score doesn't go below 0.
   */
  public static calculateScore(moves: number, timeSeconds: number, playerColor: Player): number {
    const base = 10000;
    const movePenalty = moves * 50;
    const timePenalty = Math.floor(timeSeconds * 5);
    let score = base - movePenalty - timePenalty;
    // Bonus for winning as White (defensive disadvantage)
    if (playerColor === Player.WHITE) score += 500;
    return Math.max(0, score);
  }

  public static getEntries(): LeaderboardEntry[] {
    try {
      const raw = localStorage.getItem(LEADERBOARD_KEY);
      if (!raw) return [];
      const parsed: any[] = JSON.parse(raw);
      // Normalize entries missing playerColor for backward compatibility
      return parsed.map((e) => ({
        ...e,
        playerColor: e.playerColor ?? Player.BLACK
      }));
    } catch (e) {
      console.error("Failed to parse leaderboard", e);
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
      aiLevel
      ,
      playerColor
    };

    const entries = this.getEntries();
    entries.push(newEntry);

    // Sort descending by score
    entries.sort((a, b) => b.score - a.score);

    // Keep top N
    if (entries.length > MAX_ENTRIES) {
      entries.splice(MAX_ENTRIES);
    }

    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
    return newEntry;
  }

  public static generateHTML(): string {
    const entries = this.getEntries();
    
    if (entries.length === 0) {
      return '<p style="text-align:center; color:#aaa;">Aucune partie enregistrée pour le moment.</p>';
    }

    let html = `
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

      // Color Dot
      const color = (entry as any).playerColor ?? Player.BLACK;
      const colorDot = color === Player.BLACK 
        ? '<span style="color:#000; text-shadow: 0 0 2px #fff;">⚫</span>' 
        : '<span style="color:#fff; text-shadow: 0 0 2px #000;">⚪</span>';

      // Format time mm:ss
      const mins = Math.floor(entry.timeSeconds / 60);
      const secs = Math.floor(entry.timeSeconds % 60);
      const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

      html += `
        <tr>
          <td class="rank-col">${rankDisplay}</td>
          <td style="font-size: 1.2rem;">${colorDot}</td>
          <td>${entry.date}</td>
          <td>${entry.moves}</td>
          <td>${timeStr}</td>
          <td class="score-col">${entry.score} pts</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    return html;
  }
}
