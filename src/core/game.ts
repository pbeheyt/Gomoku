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
  private currentMoveIndex: number; // Points to the current state in history (0 = start)

  constructor() {
    this.board = new GameBoard();
    this.currentPlayer = Player.BLACK;
    this.blackCaptures = 0;
    this.whiteCaptures = 0;
    this.lastMove = null;
    this.winner = null;
    this.moveHistory = [];
    this.currentMoveIndex = 0;
  }

  /**
   * Make a move and apply all game rules
   */
  makeMove(row: number, col: number): ValidationResult {
    // 0. History Branching: If we are in the past, cut the future.
    if (this.currentMoveIndex < this.moveHistory.length) {
      this.moveHistory = this.moveHistory.slice(0, this.currentMoveIndex);
      // If we branched, the game cannot be in a "Won" state anymore (unless this specific move wins it)
      this.winner = null; 
    }

    // Garde-fou 1: Position valide et vide
    if (!this.board.isValidMove(row, col)) {
      return { isValid: false, reason: 'Position invalide ou occupée' };
    }

    // Garde-fou 2: Règle du coup suicidaire interdit
    if (this.isSuicideMove(row, col, this.currentPlayer)) {
      return { isValid: false, reason: 'Coup suicidaire interdit' };
    }

    // Garde-fou 3: Règle du Double-Trois
    // Un double-trois est interdit, SAUF si le même coup effectue une capture.
    const preCaptures = this.checkCaptures(row, col);
    const isDoubleThree = this.checkDoubleThree(row, col, this.currentPlayer);

    if (isDoubleThree && preCaptures.length === 0) {
      return { isValid: false, reason: 'Double-trois interdit' };
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
    this.currentMoveIndex++;
    
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
   * Check if a move is valid without applying it (for AI or UI previews)
   */
  validateMove(row: number, col: number): ValidationResult {
    // 1. Valid position and empty
    if (!this.board.isValidMove(row, col)) {
      return { isValid: false, reason: 'Position invalide ou occupée' };
    }

    // 2. Suicide rule
    if (this.isSuicideMove(row, col, this.currentPlayer)) {
      return { isValid: false, reason: 'Coup suicidaire interdit (capture immédiate)' };
    }

    // 3. Double-Three rule
    const preCaptures = this.checkCaptures(row, col);
    const isDoubleThree = this.checkDoubleThree(row, col, this.currentPlayer);

    if (isDoubleThree && preCaptures.length === 0) {
      return { isValid: false, reason: 'Double-trois interdit' };
    }

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
   * Check if a move is a "suicide move", which is forbidden.
   * A suicide move is placing a stone in a position where it immediately
   * forms a pair that gets captured by the opponent.
   */
  private isSuicideMove(row: number, col: number, player: Player): boolean {
    const opponent = player === Player.BLACK ? Player.WHITE : Player.WHITE;
    const directions = [
      { r: 0, c: 1 },  // Horizontal
      { r: 1, c: 0 },  // Vertical
      { r: 1, c: 1 },  // Diagonal \
      { r: 1, c: -1 }  // Diagonal /
    ];

    for (const dir of directions) {
      // Check pattern O P X O (where X is the current move)
      const p1 = this.board.getPiece(row - 2 * dir.r, col - 2 * dir.c);
      const p2 = this.board.getPiece(row - 1 * dir.r, col - 1 * dir.c);
      const p3 = this.board.getPiece(row + 1 * dir.r, col + 1 * dir.c);
      if (p1 === opponent && p2 === player && p3 === opponent) {
        return true;
      }

      // Check pattern O X P O (where X is the current move)
      const p4 = this.board.getPiece(row - 1 * dir.r, col - 1 * dir.c);
      const p5 = this.board.getPiece(row + 1 * dir.r, col + 1 * dir.c);
      const p6 = this.board.getPiece(row + 2 * dir.r, col + 2 * dir.c);
      if (p4 === opponent && p5 === player && p6 === opponent) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if a potential winning line of 5+ stones can be broken by an opponent's capture.
   * A win is only valid if the opponent cannot immediately capture a pair within the line.
   * @param winningLine An array of positions forming the winning line.
   * @param opponent The opponent player.
   * @returns {boolean} True if the line is breakable, false otherwise.
   */
  private isLineBreakableByCapture(winningLine: Position[], opponent: Player): boolean {
    if (winningLine.length < 2) return false;

    // Determine the direction of the line from the first two stones
    const dir = {
      r: winningLine[1].row - winningLine[0].row,
      c: winningLine[1].col - winningLine[0].col,
    };

    // Check every pair of adjacent stones in the winning line
    for (let i = 0; i < winningLine.length - 1; i++) {
      const stone1 = winningLine[i];
      const stone2 = winningLine[i + 1];

      // Get the two positions that flank the pair
      const flankBeforePos = { row: stone1.row - dir.r, col: stone1.col - dir.c };
      const flankAfterPos = { row: stone2.row + dir.r, col: stone2.col + dir.c };

      const flankBeforePiece = this.board.getPiece(flankBeforePos.row, flankBeforePos.col);
      const flankAfterPiece = this.board.getPiece(flankAfterPos.row, flankAfterPos.col);

      // Check for a capture scenario: one side is opponent, the other is empty
      if (
        (flankBeforePiece === opponent && flankAfterPiece === Player.NONE) ||
        (flankBeforePiece === Player.NONE && flankAfterPiece === opponent)
      ) {
        // This pair can be captured, so the line is breakable.
        return true;
      }
    }

    // No capturable pairs were found in the line.
    return false;
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
    const opponent = player === Player.BLACK ? Player.WHITE : Player.BLACK;

    for (const dir of directions) {
      const currentLine: Position[] = [{ row, col }];
      let count = 1;

      // Count in positive direction, storing positions
      let r = row + dir.r;
      let c = col + dir.c;
      while (this.board.getPiece(r, c) === player) {
        currentLine.push({ row: r, col: c });
        count++;
        r += dir.r;
        c += dir.c;
      }

      // Count in negative direction, storing positions
      r = row - dir.r;
      c = col - dir.c;
      while (this.board.getPiece(r, c) === player) {
        currentLine.unshift({ row: r, col: c }); // Add to the beginning to keep order
        count++;
        r -= dir.r;
        c -= dir.c;
      }

      if (count >= 5) {
        // A 5-in-a-row is found. Now, check if it's breakable by an opponent's capture.
        if (!this.isLineBreakableByCapture(currentLine, opponent)) {
          // The line is not breakable, this is a valid win.
          return true;
        }
        // If the line is breakable, we don't return true and continue checking other directions.
      }
    }

    return false;
  }

  /**
   * Check for double-three rule. This is a forbidden move unless it
   * also results in a capture.
   * @returns {boolean} True if the move creates two or more free-threes.
   */
  private checkDoubleThree(row: number, col: number, player: Player): boolean {
    // Temporarily place the stone for analysis
    this.board.setPiece(row, col, player);

    let freeThreeCount = 0;
    const directions = [
      { r: 0, c: 1 },  // Horizontal
      { r: 1, c: 0 },  // Vertical
      { r: 1, c: 1 },  // Diagonal \
      { r: 1, c: -1 }  // Diagonal /
    ];

    // Check each of the 4 axes for a free-three formation
    for (const dir of directions) {
      if (this.isFreeThree(row, col, dir, player)) {
        freeThreeCount++;
      }
    }

    // Restore the board to its original state before the temporary placement
    this.board.setPiece(row, col, Player.NONE);

    return freeThreeCount >= 2;
  }

  /**
   * Check if a move at a given position creates a "free-three" in a specific direction.
   * A free-three is an alignment of three stones that is not blocked by an opponent
   * and can be extended to an open-four.
   * This function assumes the stone has already been temporarily placed on the board for analysis.
   */
  private isFreeThree(row: number, col: number, direction: { r: number; c: number }, player: Player): boolean {
    let line = '';
    // Extract a line of characters centered on the move. 'P' for player, '_' for empty, 'O' for opponent.
    // A window of 11 (-5 to +5) is safe to detect patterns of up to 6 characters.
    for (let i = -5; i <= 5; i++) {
        const piece = this.board.getPiece(row + i * direction.r, col + i * direction.c);
        if (piece === player) {
            line += 'P';
        } else if (piece === Player.NONE) {
            line += '_';
        } else {
            line += 'O'; // Opponent stone
        }
    }

    const centerIndex = 5; // The position of the move within our extracted line string

    // Define free-three patterns and check if the new move is part of them.
    const patterns = ['_PPP_', '_P_PP_', '_PP_P_'];
    for (const pattern of patterns) {
        let index = -1;
        // Search for all occurrences of the pattern in the line
        while ((index = line.indexOf(pattern, index + 1)) !== -1) {
            // Check if the move we are analyzing is part of the found pattern instance
            if (centerIndex >= index && centerIndex < index + pattern.length) {
                return true;
            }
        }
    }

    return false;
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
      moveHistory: this.moveHistory,
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
    this.currentMoveIndex = 0;
    emitPlayerChanged(this.currentPlayer);
  }

  /**
   * Time Travel: Jump to a specific point in history
   * Reconstructs the board state from the beginning.
   */
  jumpTo(index: number): void {
    if (index < 0 || index > this.moveHistory.length) return;

    // 1. Reset State completely
    this.board.reset();
    this.blackCaptures = 0;
    this.whiteCaptures = 0;
    this.currentPlayer = Player.BLACK;
    this.winner = null;
    this.lastMove = null;

    // 2. Replay moves up to index
    for (let i = 0; i < index; i++) {
      const move = this.moveHistory[i];
      const { row, col } = move.position;
      const player = move.player;

      // Place stone
      this.board.setPiece(row, col, player);
      this.lastMove = { row, col };

      // Apply captures (Silent logic)
      const captures = this.checkCaptures(row, col);
      this.applyCaptures(captures);

      // Switch player (unless it's the last move of the loop)
      // Actually, we just toggle every time to match standard flow
      this.currentPlayer = (player === Player.BLACK) ? Player.WHITE : Player.BLACK;
      
      // Check win condition on the very last move played to restore winner state
      if (i === index - 1) {
         if (this.checkWin(row, col) || (player === Player.BLACK ? this.blackCaptures : this.whiteCaptures) >= 10) {
             this.winner = player;
         }
      }
    }

    this.currentMoveIndex = index;
    
    // Emit update to sync UI/Renderer
    // We use player changed to force UI refresh, but we might need a specific event
    // For now, the renderer will call getGameState() after jumping
  }

  getCurrentMoveIndex(): number {
    return this.currentMoveIndex;
  }

  getTotalMoves(): number {
    return this.moveHistory.length;
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
