import { LeaderboardEntry, Player, GameResult } from '../core/types.js';

const LEADERBOARD_KEY = 'gomoku-leaderboard-v2';
const MAX_ENTRIES = 50;

export class LeaderboardManager {
  public static calculateScore(moves: number, timeSeconds: number, playerColor: Player, result: GameResult): number {
    const turns = Math.ceil(moves / 2);
    const avgTimePerTurn = timeSeconds / turns;
    
    if (result === 'draw') {
      return 50;
    }
    
    if (result === 'victory') {
      const base = 50;
      
      const movesBonus = Math.max(0, 25 * (1 - turns / 50));
      const timeBonus = Math.max(0, 15 * (1 - avgTimePerTurn / 15));
      const colorBonus = playerColor === Player.WHITE ? 10 : 0;
      
      return Math.min(100, base + movesBonus + timeBonus + colorBonus);
    }
    
    // Défaite
    const resistanceMovesBonus = Math.min(25, turns * 0.5);
    const timeBonus = Math.max(0, 15 * (1 - avgTimePerTurn / 15));
    const colorBonus = playerColor === Player.WHITE ? 10 : 0;
    
    return Math.min(50, resistanceMovesBonus + timeBonus + colorBonus);
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

  public static getTopVictories(limit: number): LeaderboardEntry[] {
    return this.getEntries()
      .filter(entry => entry.result === 'victory')
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  public static getTopGames(limit: number): LeaderboardEntry[] {
    return this.getEntries()
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  public static getRecentGames(limit: number): LeaderboardEntry[] {
    return this.getEntries().slice(0, limit);
  }

  public static addEntry(moves: number, timeSeconds: number, aiLevel: string, playerColor: Player, result: GameResult): LeaderboardEntry {
    const score = this.calculateScore(moves, timeSeconds, playerColor, result);
    
    const newEntry: LeaderboardEntry = {
      date: new Date().toLocaleDateString('fr-FR'),
      moves,
      timeSeconds,
      score,
      aiLevel,
      playerColor,
      result
    };

    const entries = this.getEntries();
    entries.unshift(newEntry);

    if (entries.length > MAX_ENTRIES) {
      entries.splice(MAX_ENTRIES);
    }

    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
    return newEntry;
  }

  public static generateHTML(): string {
    const topGames = this.getTopGames(5);
    const recentGames = this.getRecentGames(5);
    
    let html = '<div class="leaderboard-grid">';

    // --- TOP 5 MEILLEURES PARTIES ---
    html += `
      <div class="leaderboard-column">
        <h3 style="text-align:center; color:#ffd700; margin-bottom:10px; font-size:1.2rem;">Meilleures Performances</h3>
        <p style="text-align:center; margin-bottom:15px; color:#aaa; font-size:0.85rem;">
          Top 5 des meilleurs scores
        </p>
    `;

    if (topGames.length === 0) {
      html += '<p style="text-align:center; color:#666; font-style:italic;">Aucune partie enregistrée</p>';
    } else {
      html += `
          <table class="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Résultat</th>
                <th>Joueur</th>
                <th>Date</th>
                <th>Tours</th>
                <th>Temps/Tour</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
      `;

      topGames.forEach((entry, index) => {
        const rankDisplay = `#${index + 1}`;

        const color = entry.playerColor ?? Player.BLACK;
        const colorDot = color === Player.BLACK 
          ? '<span style="color:#000; text-shadow: 0 0 2px #fff;">⚫</span>' 
          : '<span style="color:#fff; text-shadow: 0 0 2px #000;">⚪</span>';

        let resultBadge = '';
        if (entry.result === 'victory') {
          resultBadge = '<span style="background:#2d5016; color:#7dd84e; padding:3px 8px; border-radius:4px; font-weight:bold; font-size:0.75rem;">VICTOIRE</span>';
        } else if (entry.result === 'defeat') {
          resultBadge = '<span style="background:#5c1a1a; color:#ff6b6b; padding:3px 8px; border-radius:4px; font-weight:bold; font-size:0.75rem;">DÉFAITE</span>';
        } else {
          resultBadge = '<span style="background:#3a3a3a; color:#aaa; padding:3px 8px; border-radius:4px; font-weight:bold; font-size:0.75rem;">NUL</span>';
        }

        const turns = Math.ceil(entry.moves / 2);
        const avgTimePerTurn = entry.timeSeconds / turns;
        
        let scoreColor = '#aaa';
        if (entry.score >= 75) scoreColor = '#7dd84e';
        else if (entry.score >= 50) scoreColor = '#a8d84e';
        else if (entry.score >= 25) scoreColor = '#d8a84e';
        else scoreColor = '#ff6b6b';
        
        const scoreDisplay = `<span style="color:${scoreColor}; font-weight:bold;">${Math.round(entry.score)}</span>`;

        html += `
          <tr>
            <td style="color:#ffd700; font-weight:bold;">${rankDisplay}</td>
            <td>${resultBadge}</td>
            <td style="font-size: 1.2rem;">${colorDot}</td>
            <td>${entry.date}</td>
            <td>${turns}</td>
            <td>${avgTimePerTurn.toFixed(1)}s</td>
            <td class="score-col">${scoreDisplay}</td>
          </tr>
        `;
      });

      html += `</tbody></table>`;
    }

    html += `</div>`;

    // --- 5 DERNIÈRES PARTIES ---
    html += `
      <div class="leaderboard-column">
        <h3 style="text-align:center; color:#4a9eff; margin-bottom:10px; font-size:1.2rem;">Dernières Parties</h3>
        <p style="text-align:center; margin-bottom:15px; color:#aaa; font-size:0.85rem;">
          5 parties les plus récentes
        </p>
    `;

    if (recentGames.length === 0) {
      html += '<p style="text-align:center; color:#666; font-style:italic;">Aucune partie enregistrée</p>';
    } else {
      html += `
          <table class="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Résultat</th>
                <th>Joueur</th>
                <th>Date</th>
                <th>Tours</th>
                <th>Temps/Tour</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
      `;

      recentGames.forEach((entry, index) => {
        const numDisplay = index + 1;

        const color = entry.playerColor ?? Player.BLACK;
        const colorDot = color === Player.BLACK 
          ? '<span style="color:#000; text-shadow: 0 0 2px #fff;">⚫</span>' 
          : '<span style="color:#fff; text-shadow: 0 0 2px #000;">⚪</span>';

        let resultBadge = '';
        if (entry.result === 'victory') {
          resultBadge = '<span style="background:#2d5016; color:#7dd84e; padding:3px 8px; border-radius:4px; font-weight:bold; font-size:0.75rem;">VICTOIRE</span>';
        } else if (entry.result === 'defeat') {
          resultBadge = '<span style="background:#5c1a1a; color:#ff6b6b; padding:3px 8px; border-radius:4px; font-weight:bold; font-size:0.75rem;">DÉFAITE</span>';
        } else {
          resultBadge = '<span style="background:#3a3a3a; color:#aaa; padding:3px 8px; border-radius:4px; font-weight:bold; font-size:0.75rem;">NUL</span>';
        }

        const turns = Math.ceil(entry.moves / 2);
        const avgTimePerTurn = entry.timeSeconds / turns;
        
        let scoreColor = '#aaa';
        if (entry.score >= 75) scoreColor = '#7dd84e';
        else if (entry.score >= 50) scoreColor = '#a8d84e';
        else if (entry.score >= 25) scoreColor = '#d8a84e';
        else scoreColor = '#ff6b6b';
        
        const scoreDisplay = `<span style="color:${scoreColor}; font-weight:bold;">${Math.round(entry.score)}</span>`;

        html += `
          <tr>
            <td style="color:#666;">${numDisplay}</td>
            <td>${resultBadge}</td>
            <td style="font-size: 1.2rem;">${colorDot}</td>
            <td>${entry.date}</td>
            <td>${turns}</td>
            <td>${avgTimePerTurn.toFixed(1)}s</td>
            <td class="score-col">${scoreDisplay}</td>
          </tr>
        `;
      });

      html += `</tbody></table>`;
    }

    html += `</div></div>`;
    
    return html;
  }
}
