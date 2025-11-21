/**
 * Board management and position validation
 */

import { Player, Position } from './types.js';

export const BOARD_SIZE = 19;

export class GameBoard {
  private board: Player[][];

  constructor() {
    this.board = Array(BOARD_SIZE)
      .fill(null)
      .map(() => Array(BOARD_SIZE).fill(Player.NONE));
  }

  /**
   * Get piece at position
   */
  getPiece(row: number, col: number): Player {
    if (!this.isValidPosition(row, col)) {
      return Player.NONE;
    }
    return this.board[row][col];
  }

  /**
   * Set piece at position
   */
  setPiece(row: number, col: number, player: Player): void {
    if (this.isValidPosition(row, col)) {
      this.board[row][col] = player;
    }
  }

  /**
   * Check if position is valid and empty
   */
  isValidMove(row: number, col: number): boolean {
    return this.isValidPosition(row, col) && this.board[row][col] === Player.NONE;
  }

  /**
   * Check if position is within board bounds
   */
  isValidPosition(row: number, col: number): boolean {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  /**
   * Get a copy of the current board state
   */
  getBoardState(): Player[][] {
    return this.board.map(row => [...row]);
  }

  /**
   * Reset board to initial state
   */
  reset(): void {
    this.board = Array(BOARD_SIZE)
      .fill(null)
      .map(() => Array(BOARD_SIZE).fill(Player.NONE));
  }

  /**
   * Check if board is empty
   */
  isEmpty(): boolean {
    return this.board.every(row => row.every(cell => cell === Player.NONE));
  }

  /**
   * Get board dimensions
   */
  getSize(): number {
    return BOARD_SIZE;
  }
}
