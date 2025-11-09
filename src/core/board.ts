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
   * Get all empty positions (for AI move generation)
   */
  getEmptyPositions(): Position[] {
    const positions: Position[] = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (this.board[row][col] === Player.NONE) {
          positions.push({ row, col });
        }
      }
    }
    return positions;
  }

  /**
   * Get positions around existing stones (optimized for AI)
   */
  getRelevantPositions(radius: number = 2): Position[] {
    const positions = new Set<string>();
    
    // Find all occupied positions
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (this.board[row][col] !== Player.NONE) {
          // Add empty positions around this stone
          for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
              const newRow = row + dr;
              const newCol = col + dc;
              if (this.isValidMove(newRow, newCol)) {
                positions.add(`${newRow},${newCol}`);
              }
            }
          }
        }
      }
    }
    
    // If board is empty, return center positions
    if (positions.size === 0) {
      const center = Math.floor(BOARD_SIZE / 2);
      return [
        { row: center, col: center },
        { row: center - 1, col: center },
        { row: center + 1, col: center },
        { row: center, col: center - 1 },
        { row: center, col: center + 1 },
      ];
    }
    
    return Array.from(positions).map(pos => {
      const [row, col] = pos.split(',').map(Number);
      return { row, col };
    });
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
