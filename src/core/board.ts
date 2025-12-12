/**
 * Gestion du Plateau (Data Structure)
 * 
 * Ce fichier encapsule le tableau 2D (Player[][]) pour éviter les erreurs d'index (Index Out Of Bounds).
 * 
 * Règle d'or : On ne manipule jamais le tableau `board` directement depuis l'extérieur.
 */

import { Player } from './types.js';

export const BOARD_SIZE = 19;

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
    if (!this.isOnBoard(row, col)) {
      return Player.NONE;
    }
    return this.board[row][col];
  }

  /**
   * Place une pierre sur le plateau.
   * Ignore silencieusement les coordonnées invalides pour éviter les crashs.
   */
  setPiece(row: number, col: number, player: Player): void {
    if (this.isOnBoard(row, col)) {
      this.board[row][col] = player;
    }
  }

  /**
   * Vérifie si la case est physiquement libre.
   * Ne vérifie PAS les règles du jeu (Suicide, Double-3), seulement l'occupation.
   */
  isCellEmpty(row: number, col: number): boolean {
    return this.isOnBoard(row, col) && this.board[row][col] === Player.NONE;
  }

  /**
   * Vérifie simplement si les coordonnées sont dans la grille (0-18).
   */
  isOnBoard(row: number, col: number): boolean {
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
}
 
