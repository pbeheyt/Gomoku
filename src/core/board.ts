/**
 * Gestion du Plateau (Data Structure)
 * 
 * Ce fichier encapsule le tableau 2D (Player[][]) pour éviter les erreurs d'index (Index Out Of Bounds).
 * 
 * Règle d'or : On ne manipule jamais le tableau `board` directement depuis l'extérieur.
 */

import { Player } from './types.js';

export const BOARD_SIZE = 6;

export class GameBoard {
  private board: Player[][];

  constructor() {
    // Initialisation vide pour satisfaire TS avant le reset
    this.board = [];
    this.reset();
  }

  /**
   * Récupère le contenu d'une case en toute sécurité.
   * 
   * Retourne la pièce (BLACK/WHITE) ou NONE.
   * IMPORTANT : Si la position est hors du plateau, renvoie NONE (Vide) au lieu de planter.
   * Cela simplifie énormément les algos de détection dans game.ts qui n'ont pas besoin de vérifier les   bords à chaque étape.
   */
  getPiece(row: number, col: number): Player {
    if (!this.isValidPosition(row, col)) {
      return Player.NONE;
    }
    return this.board[row][col];
  }

  /**
   * Place une pierre sur le plateau.
   * Ignore silencieusement les coordonnées invalides pour éviter les crashs.
   */
  setPiece(row: number, col: number, player: Player): void {
    if (this.isValidPosition(row, col)) {
      this.board[row][col] = player;
    }
  }

  /**
   * Vérifie si on peut jouer ici (Règles physiques de base).
   * 1. Est-ce dans le plateau ?
   * 2. Est-ce que la case est vide ?
   * (Les règles complexes comme le Suicide sont gérées dans game.ts)
   */
  isValidMove(row: number, col: number): boolean {
    return this.isValidPosition(row, col) && this.board[row][col] === Player.NONE;
  }

  /**
   * Vérifie simplement si les coordonnées sont dans la grille (0-18).
   * Empêche les erreurs "Index out of bounds".
   */
  isValidPosition(row: number, col: number): boolean {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  /**
   * Renvoie une COPIE complète de l'état du plateau.
   * 
   * CRITIQUE : On utilise .map() pour casser la référence mémoire.
   * Si l'IA ou l'UI modifie le tableau renvoyé, cela n'affectera PAS le vrai jeu.
   * C'est le principe d'Immutabilité.
   */
  getBoardState(): Player[][] {
    return this.board.map(row => [...row]);
  }

  /**
   * Remet le plateau à zéro (Vide).
   */
  reset(): void {
    this.board = Array(BOARD_SIZE)
      .fill(null)
      .map(() => Array(BOARD_SIZE).fill(Player.NONE));
  }

  /**
   * Vérifie si le plateau est totalement vide.
   */
  isEmpty(): boolean {
    return this.board.every(row => row.every(cell => cell === Player.NONE));
  }

  /**
   * Getter pour la taille.
   */
  getSize(): number {
    return BOARD_SIZE;
  }

  /**
   * Vérifie si le plateau est complètement rempli.
   */
  isFull(): boolean {
    return this.board.every(row => row.every(cell => cell !== Player.NONE));
  }

  /**
   * Compte le nombre exact de cases vides sur le plateau.
   */
  getEmptyCount(): number {
    let count = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (this.board[r][c] === Player.NONE) count++;
      }
    }
    return count;
  }
}
 
