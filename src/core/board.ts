import { Player } from './types.js';

export const BOARD_SIZE = 19;

export class GameBoard {
  private board: Player[][];

  constructor() {
    this.board = [];
    this.reset();
  }

  getPiece(row: number, col: number): Player {
    if (!this.isOnBoard(row, col)) {
      return Player.NONE;
    }
    return this.board[row][col];
  }

  setPiece(row: number, col: number, player: Player): void {
    if (this.isOnBoard(row, col)) {
      this.board[row][col] = player;
    }
  }

  isCellEmpty(row: number, col: number): boolean {
    return this.isOnBoard(row, col) && this.board[row][col] === Player.NONE;
  }

  isOnBoard(row: number, col: number): boolean {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  getBoardState(): Player[][] {
    return this.board.map(row => [...row]);
  }

  reset(): void {
    this.board = Array(BOARD_SIZE)
      .fill(null)
      .map(() => Array(BOARD_SIZE).fill(Player.NONE));
  }

  isEmpty(): boolean {
    return this.board.every(row => row.every(cell => cell === Player.NONE));
  }

  getSize(): number {
    return BOARD_SIZE;
  }

  isFull(): boolean {
    return this.board.every(row => row.every(cell => cell !== Player.NONE));
  }
}
 
