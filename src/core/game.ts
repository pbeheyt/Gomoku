/**
 * Game logic and rules implementation
 */

import { Player, Position, Move, GameState, CaptureResult, ValidationResult, GameMode } from './types.js';
import { GameBoard, BOARD_SIZE } from './board.js';
import { emitMoveMade, emitCaptureMade, emitGameWon, emitPlayerChanged } from './events.js';

export class GomokuGame {
  private board: GameBoard;
  private currentPlayer: Player;
  private blackCaptures: number;
  private whiteCaptures: number;
  private lastMove: Position | null;
  private winner: Player | null;
  private moveHistory: Move[];

  constructor() {
    this.board = new GameBoard();
    this.currentPlayer = Player.BLACK;
    this.blackCaptures = 0;
    this.whiteCaptures = 0;
    this.lastMove = null;
    this.winner = null;
    this.moveHistory = [];
  }

  /**
   * Make a move and apply all game rules
   */
  makeMove(row: number, col: number): ValidationResult {
    // Validate basic move
    if (!this.board.isValidMove(row, col)) {
      return { isValid: false, reason: 'Position invalide ou occupée' };
    }

    // Check for double-three rule
    const doubleThreeCheck = this.checkDoubleThree(row, col, this.currentPlayer);
    if (!doubleThreeCheck.isValid) {
      return doubleThreeCheck;
    }

    // Place the stone
    this.board.setPiece(row, col, this.currentPlayer);
    this.lastMove = { row, col };

    // Record move
    const move: Move = {
      position: { row, col },
      player: this.currentPlayer,
      timestamp: Date.now(),
    };
    this.moveHistory.push(move);
    
    // Emit move made event
    emitMoveMade(move);

    // Check for captures
    const captures = this.checkCaptures(row, col);
    if (captures.length > 0) {
      this.applyCaptures(captures);
      // Emit capture events
      captures.forEach(capture => emitCaptureMade(capture));
    }

    // Check for win conditions
    if (this.checkWin(row, col)) {
      this.winner = this.currentPlayer;
      emitGameWon(this.currentPlayer);
      return { isValid: true };
    }

    // Check for win by captures (10 stones)
    const currentCaptures = this.currentPlayer === Player.BLACK ? this.blackCaptures : this.whiteCaptures;
    if (currentCaptures >= 10) {
      this.winner = this.currentPlayer;
      emitGameWon(this.currentPlayer);
      return { isValid: true };
    }

    // Switch player
    const previousPlayer = this.currentPlayer;
    this.currentPlayer = this.currentPlayer === Player.BLACK ? Player.WHITE : Player.BLACK;
    emitPlayerChanged(this.currentPlayer);

    return { isValid: true };
  }

  /**
   * Check for captures around the newly placed stone
   */
  private checkCaptures(row: number, col: number): CaptureResult[] {
    const captures: CaptureResult[] = [];
    const directions = [
      { r: 0, c: 1 }, { r: 0, c: -1 }, // Horizontal
      { r: 1, c: 0 }, { r: -1, c: 0 }, // Vertical
      { r: 1, c: 1 }, { r: -1, c: -1 }, // Diagonal /
      { r: 1, c: -1 }, { r: -1, c: 1 }  // Diagonal \
    ];

    const capturingPlayer = this.board.getPiece(row, col);
    const opponentPlayer = capturingPlayer === Player.BLACK ? Player.WHITE : Player.BLACK;

    for (const dir of directions) {
      const r1 = row + dir.r;
      const c1 = col + dir.c;
      const r2 = row + 2 * dir.r;
      const c2 = col + 2 * dir.c;
      const r3 = row + 3 * dir.r;
      const c3 = col + 3 * dir.c;

      if (
        this.board.getPiece(r1, c1) === opponentPlayer &&
        this.board.getPiece(r2, c2) === opponentPlayer &&
        this.board.getPiece(r3, c3) === capturingPlayer
      ) {
        // Capture found
        captures.push({
          capturedPositions: [
            { row: r1, col: c1 },
            { row: r2, col: c2 }
          ],
          newCaptureCount: capturingPlayer === Player.BLACK ? this.blackCaptures + 2 : this.whiteCaptures + 2
        });
      }
    }

    return captures;
  }

  /**
   * Apply captures to the board
   */
  private applyCaptures(captures: CaptureResult[]): void {
    for (const capture of captures) {
      for (const pos of capture.capturedPositions) {
        this.board.setPiece(pos.row, pos.col, Player.NONE);
      }
      
      // Update capture count
      if (this.currentPlayer === Player.BLACK) {
        this.blackCaptures += 2;
      } else {
        this.whiteCaptures += 2;
      }
    }
  }

  /**
   * Check for win by alignment (5 in a row)
   */
  private checkWin(row: number, col: number): boolean {
    const directions = [
      { r: 0, c: 1 },  // Horizontal
      { r: 1, c: 0 },  // Vertical
      { r: 1, c: 1 },  // Diagonal \
      { r: 1, c: -1 }  // Diagonal /
    ];

    const player = this.board.getPiece(row, col);

    for (const dir of directions) {
      let count = 1; // Include the current stone

      // Count in positive direction
      let r = row + dir.r;
      let c = col + dir.c;
      while (this.board.getPiece(r, c) === player) {
        count++;
        r += dir.r;
        c += dir.c;
      }

      // Count in negative direction
      r = row - dir.r;
      c = col - dir.c;
      while (this.board.getPiece(r, c) === player) {
        count++;
        r -= dir.r;
        c -= dir.c;
      }

      if (count >= 5) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check for double-three rule
   */
  private checkDoubleThree(row: number, col: number, player: Player): ValidationResult {
    // Temporarily place the stone
    const originalPiece = this.board.getPiece(row, col);
    this.board.setPiece(row, col, player);

    let freeThreeCount = 0;

    // Check all four directions
    const directions = [
      { r: 0, c: 1 },  // Horizontal
      { r: 1, c: 0 },  // Vertical
      { r: 1, c: 1 },  // Diagonal \
      { r: 1, c: -1 }  // Diagonal /
    ];

    for (const dir of directions) {
      if (this.isFreeThree(row, col, dir, player)) {
        freeThreeCount++;
      }
    }

    // Restore original state
    this.board.setPiece(row, col, originalPiece);

    if (freeThreeCount >= 2) {
      return { isValid: false, reason: 'Double-trois interdit' };
    }

    return { isValid: true };
  }

  /**
   * Check if a position forms a free-three in a specific direction
   */
  private isFreeThree(row: number, col: number, direction: { r: number; c: number }, player: Player): boolean {
    // This is a simplified check - in a real implementation, you'd need more sophisticated pattern matching
    const patterns = [
      // Pattern: . X X X . (free three)
      [Player.NONE, player, player, player, Player.NONE],
      // Pattern: . X X . X . (split three)
      [Player.NONE, player, player, Player.NONE, player, Player.NONE],
    ];

    for (const pattern of patterns) {
      if (this.checkPattern(row, col, direction, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a pattern exists starting from a position
   */
  private checkPattern(row: number, col: number, direction: { r: number; c: number }, pattern: Player[]): boolean {
    for (let i = 0; i < pattern.length; i++) {
      const r = row + (i - Math.floor(pattern.length / 2)) * direction.r;
      const c = col + (i - Math.floor(pattern.length / 2)) * direction.c;
      
      if (this.board.getPiece(r, c) !== pattern[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get current game state
   */
  getGameState(): GameState {
    return {
      board: this.board.getBoardState(),
      currentPlayer: this.currentPlayer,
      blackCaptures: this.blackCaptures,
      whiteCaptures: this.whiteCaptures,
      lastMove: this.lastMove,
      winner: this.winner,
      gameMode: GameMode.PLAYER_VS_PLAYER, // Default mode
    };
  }

  /**
   * Reset game to initial state
   */
  reset(): void {
    this.board.reset();
    this.currentPlayer = Player.BLACK;
    this.blackCaptures = 0;
    this.whiteCaptures = 0;
    this.lastMove = null;
    this.winner = null;
    this.moveHistory = [];
    emitPlayerChanged(this.currentPlayer);
  }

  /**
   * Get move history
   */
  getMoveHistory(): Move[] {
    return [...this.moveHistory];
  }

  /**
   * Check if game is over
   */
  isGameOver(): boolean {
    return this.winner !== null;
  }

  /**
   * Get winner
   */
  getWinner(): Player | null {
    return this.winner;
  }

  /**
   * Get current player
   */
  getCurrentPlayer(): Player {
    return this.currentPlayer;
  }

  /**
   * Get capture counts
   */
  getBlackCaptures(): number {
    return this.blackCaptures;
  }

  getWhiteCaptures(): number {
    return this.whiteCaptures;
  }

  /**
   * Get last move
   */
  getLastMove(): Position | null {
    return this.lastMove;
  }

  /**
   * Get board instance
   */
  getBoard(): GameBoard {
    return this.board;
  }
}
