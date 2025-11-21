/**
 * Game logic and rules implementation
 */

import { Player, Position, Move, GameState, CaptureResult, ValidationResult, GameMode } from './types.js';
import { GameBoard } from './board.js';
import { emitMoveMade, emitCaptureMade, emitGameWon, emitPlayerChanged } from './events.js';

const DIRECTIONS = [
  { r: 0, c: 1 },  // Horizontal
  { r: 1, c: 0 },  // Vertical
  { r: 1, c: 1 },  // Diagonal \
  { r: 1, c: -1 }  // Diagonal /
];

export class GomokuGame {
  private board: GameBoard;
  private currentPlayer: Player;
  private blackCaptures: number;
  private whiteCaptures: number;
  private lastMove: Position | null;
  private winner: Player | null;
  private moveHistory: Move[];
  private currentMoveIndex: number;
  private gameId: number = 0;

  constructor() {
    this.board = new GameBoard();
    this.currentPlayer = Player.BLACK;
    this.blackCaptures = 0;
    this.whiteCaptures = 0;
    this.lastMove = null;
    this.winner = null;
    this.moveHistory = [];
    this.currentMoveIndex = 0;
    this.gameId = 0;
  }

  getGameId(): number {
    return this.gameId;
  }

  /**
   * Make a move and apply all game rules
   */
  makeMove(row: number, col: number, blackTime: number = 0, whiteTime: number = 0): ValidationResult {
    // History Branching
    if (this.currentMoveIndex < this.moveHistory.length) {
      this.moveHistory = this.moveHistory.slice(0, this.currentMoveIndex);
      this.winner = null; 
    }

    // Unified Validation & Simulation
    const analysis = this.analyzeMove(row, col, this.currentPlayer);
    if (!analysis.isValid) {
      return analysis;
    }

    // Record move
    const move: Move = {
      position: { row, col },
      player: this.currentPlayer,
      timestamp: Date.now(),
      blackTime: blackTime,
      whiteTime: whiteTime
    };
    this.moveHistory.push(move);
    this.currentMoveIndex++;
    
    // Apply mechanics (Place stone & Remove captures)
    this.applyMoveMechanics(row, col, this.currentPlayer, analysis.captures!);

    // Emit events
    emitMoveMade(move);
    analysis.captures!.forEach(capture => emitCaptureMade(capture));

    // Check Win Conditions
    if (this.checkWin(row, col) || this.getCaptures(this.currentPlayer) >= 10) {
      this.winner = this.currentPlayer;
      emitGameWon(this.currentPlayer);
      return { isValid: true };
    }

    // Switch player
    this.currentPlayer = this.currentPlayer === Player.BLACK ? Player.WHITE : Player.BLACK;
    emitPlayerChanged(this.currentPlayer);

    return { isValid: true };
  }

  /**
   * Check if a move is valid without applying it
   */
  validateMove(row: number, col: number, playerOverride?: Player): ValidationResult {
    return this.analyzeMove(row, col, playerOverride || this.currentPlayer);
  }

  /**
   * Central validation logic.
   * Simulates the move to check for Suicide, Double-Three, and Captures.
   * Returns validity and potential captures.
   */
  private analyzeMove(row: number, col: number, player: Player): ValidationResult & { captures?: CaptureResult[] } {
    if (!this.board.isValidMove(row, col)) {
      return { isValid: false, reason: 'Position invalide ou occupée' };
    }

    // Simulate placement
    this.board.setPiece(row, col, player);
    
    const captures = this.checkCaptures(row, col);
    const suicide = this.isSuicideMove(row, col, player);
    // Double-Three check assumes stone is placed
    const doubleThree = this.checkDoubleThree(row, col, player);
    
    // Revert simulation
    this.board.setPiece(row, col, Player.NONE);

    if (suicide) {
      return { isValid: false, reason: 'Coup suicidaire interdit' };
    }

    // Double-Three exception: Allowed if it causes a capture
    if (doubleThree && captures.length === 0) {
      return { isValid: false, reason: 'Double-trois interdit' };
    }

    return { isValid: true, captures };
  }

  /**
   * Applies the move to the board and updates scores.
   * Shared logic for makeMove and jumpTo.
   */
  private applyMoveMechanics(row: number, col: number, player: Player, knownCaptures?: CaptureResult[]): void {
    this.board.setPiece(row, col, player);
    this.lastMove = { row, col };

    // If captures not provided (e.g. jumpTo), calculate them (stone is now placed)
    const captures = knownCaptures || this.checkCaptures(row, col);
    
    for (const capture of captures) {
      for (const pos of capture.capturedPositions) {
        this.board.setPiece(pos.row, pos.col, Player.NONE);
      }
      if (player === Player.BLACK) this.blackCaptures += 2;
      else this.whiteCaptures += 2;
    }
  }

  private checkCaptures(row: number, col: number): CaptureResult[] {
    const captures: CaptureResult[] = [];
    // 8 Directions for capture check
    const extendedDirs = [
        { r: 0, c: 1 }, { r: 0, c: -1 },
        { r: 1, c: 0 }, { r: -1, c: 0 },
        { r: 1, c: 1 }, { r: -1, c: -1 },
        { r: 1, c: -1 }, { r: -1, c: 1 }
    ];

    const capturingPlayer = this.board.getPiece(row, col);
    if (capturingPlayer === Player.NONE) return [];

    const opponentPlayer = capturingPlayer === Player.BLACK ? Player.WHITE : Player.BLACK;

    for (const dir of extendedDirs) {
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
        captures.push({
          capturedPositions: [{ row: r1, col: c1 }, { row: r2, col: c2 }],
          newCaptureCount: capturingPlayer === Player.BLACK ? this.blackCaptures + 2 : this.whiteCaptures + 2
        });
      }
    }
    return captures;
  }

  private isSuicideMove(row: number, col: number, player: Player): boolean {
    const opponent = player === Player.BLACK ? Player.WHITE : Player.WHITE;
    
    for (const dir of DIRECTIONS) {
      // Check pattern O P X O (X is current)
      const p1 = this.board.getPiece(row - 2 * dir.r, col - 2 * dir.c);
      const p2 = this.board.getPiece(row - 1 * dir.r, col - 1 * dir.c);
      const p3 = this.board.getPiece(row + 1 * dir.r, col + 1 * dir.c);
      if (p1 === opponent && p2 === player && p3 === opponent) return true;

      // Check pattern O X P O (X is current)
      const p4 = this.board.getPiece(row - 1 * dir.r, col - 1 * dir.c);
      const p5 = this.board.getPiece(row + 1 * dir.r, col + 1 * dir.c);
      const p6 = this.board.getPiece(row + 2 * dir.r, col + 2 * dir.c);
      if (p4 === opponent && p5 === player && p6 === opponent) return true;
    }
    return false;
  }

  private isLineBreakableByCapture(winningLine: Position[], opponent: Player): boolean {
    if (winningLine.length < 2) return false;

    const dir = {
      r: winningLine[1].row - winningLine[0].row,
      c: winningLine[1].col - winningLine[0].col,
    };

    for (let i = 0; i < winningLine.length - 1; i++) {
      const stone1 = winningLine[i];
      const stone2 = winningLine[i + 1];

      const flankBeforePos = { row: stone1.row - dir.r, col: stone1.col - dir.c };
      const flankAfterPos = { row: stone2.row + dir.r, col: stone2.col + dir.c };

      const flankBeforePiece = this.board.getPiece(flankBeforePos.row, flankBeforePos.col);
      const flankAfterPiece = this.board.getPiece(flankAfterPos.row, flankAfterPos.col);
      
      let captureMove: Position | null = null;

      if (flankBeforePiece === opponent && flankAfterPiece === Player.NONE) {
        captureMove = flankAfterPos;
      } else if (flankBeforePiece === Player.NONE && flankAfterPiece === opponent) {
        captureMove = flankBeforePos;
      }

      if (captureMove) {
        // Recursively validate if opponent can play there
        const validation = this.validateMove(captureMove.row, captureMove.col, opponent);
        if (validation.isValid) return true;
      }
    }
    return false;
  }

  private checkWin(row: number, col: number): boolean {
    const player = this.board.getPiece(row, col);
    const opponent = player === Player.BLACK ? Player.WHITE : Player.BLACK;

    for (const dir of DIRECTIONS) {
      const currentLine: Position[] = [{ row, col }];
      let count = 1;

      // Positive direction
      let r = row + dir.r;
      let c = col + dir.c;
      while (this.board.getPiece(r, c) === player) {
        currentLine.push({ row: r, col: c });
        count++;
        r += dir.r;
        c += dir.c;
      }

      // Negative direction
      r = row - dir.r;
      c = col - dir.c;
      while (this.board.getPiece(r, c) === player) {
        currentLine.unshift({ row: r, col: c });
        count++;
        r -= dir.r;
        c -= dir.c;
      }

      if (count >= 5) {
        if (!this.isLineBreakableByCapture(currentLine, opponent)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check for double-three. Assumes stone is placed.
   * Does not modify board.
   */
  private checkDoubleThree(row: number, col: number, player: Player): boolean {
    let freeThreeCount = 0;
    for (const dir of DIRECTIONS) {
      if (this.isFreeThree(row, col, dir, player)) {
        freeThreeCount++;
      }
    }
    return freeThreeCount >= 2;
  }

  private isFreeThree(row: number, col: number, direction: { r: number; c: number }, player: Player): boolean {
    const line = this.getLinePattern(row, col, direction, player);
    // Simple pattern match
    return ['_PPP_', '_P_PP_', '_PP_P_'].some(pattern => line.includes(pattern));
  }

  /**
   * Builds a string representation of the line for pattern matching.
   * P = Player, _ = Empty, O = Opponent/Wall
   */
  private getLinePattern(row: number, col: number, direction: { r: number; c: number }, player: Player): string {
    let line = '';
    for (let i = -5; i <= 5; i++) {
      const r = row + i * direction.r;
      const c = col + i * direction.c;
      
      if (!this.board.isValidPosition(r, c)) {
        line += 'O';
        continue;
      }

      const piece = this.board.getPiece(r, c);
      if (piece === player) line += 'P';
      else if (piece === Player.NONE) line += '_';
      else line += 'O';
    }
    return line;
  }

  getGameState(): GameState {
    return {
      board: this.board.getBoardState(),
      currentPlayer: this.currentPlayer,
      blackCaptures: this.blackCaptures,
      whiteCaptures: this.whiteCaptures,
      lastMove: this.lastMove,
      winner: this.winner,
      gameMode: GameMode.PLAYER_VS_PLAYER,
      moveHistory: this.moveHistory,
    };
  }

  reset(): void {
    this.board.reset();
    this.currentPlayer = Player.BLACK;
    this.blackCaptures = 0;
    this.whiteCaptures = 0;
    this.lastMove = null;
    this.winner = null;
    this.moveHistory = [];
    this.currentMoveIndex = 0;
    this.gameId++;
    emitPlayerChanged(this.currentPlayer);
  }

  /**
   * Time Travel: Jump to history point using shared mechanics
   */
  jumpTo(index: number): void {
    if (index < 0 || index > this.moveHistory.length) return;

    this.gameId++;
    this.board.reset();
    this.blackCaptures = 0;
    this.whiteCaptures = 0;
    this.currentPlayer = Player.BLACK;
    this.winner = null;
    this.lastMove = null;

    for (let i = 0; i < index; i++) {
      const move = this.moveHistory[i];
      
      // Reuse mechanic logic
      this.applyMoveMechanics(move.position.row, move.position.col, move.player);
      
      this.currentPlayer = (move.player === Player.BLACK) ? Player.WHITE : Player.BLACK;
      
      // Restore winner if this was the winning move
      if (i === index - 1) {
         if (this.checkWin(move.position.row, move.position.col) || this.getCaptures(move.player) >= 10) {
             this.winner = move.player;
         }
      }
    }
    this.currentMoveIndex = index;
  }

  getCurrentMoveIndex(): number { return this.currentMoveIndex; }
  getTotalMoves(): number { return this.moveHistory.length; }
  getMoveHistory(): Move[] { return [...this.moveHistory]; }
  isGameOver(): boolean { return this.winner !== null; }
  getWinner(): Player | null { return this.winner; }
  getCurrentPlayer(): Player { return this.currentPlayer; }
  getBlackCaptures(): number { return this.blackCaptures; }
  getWhiteCaptures(): number { return this.whiteCaptures; }
  getLastMove(): Position | null { return this.lastMove; }
  getBoard(): GameBoard { return this.board; }

  private getCaptures(player: Player): number {
    return player === Player.BLACK ? this.blackCaptures : this.whiteCaptures;
  }
}
