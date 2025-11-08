/**
 * Gomoku Game Renderer
 * Handles the visual representation and user interaction for the Gomoku board
 */

// Constants
const BOARD_SIZE = 19;
const CELL_SIZE = 35;
const BOARD_MARGIN = 40;
const STONE_RADIUS = 15;

enum Player {
  NONE = 0,
  BLACK = 1,
  WHITE = 2,
}

interface Position {
  row: number;
  col: number;
}

/**
 * GameBoard class - Manages the game state
 */
class GameBoard {
  private board: Player[][];
  public currentPlayer: Player;
  public blackCaptures: number;
  public whiteCaptures: number;
  public lastMove: Position | null;

  constructor() {
    this.board = Array(BOARD_SIZE)
      .fill(null)
      .map(() => Array(BOARD_SIZE).fill(Player.NONE));
    this.currentPlayer = Player.BLACK;
    this.blackCaptures = 0;
    this.whiteCaptures = 0;
    this.lastMove = null;
  }

  /**
   * Place a stone at the specified position and check for captures.
   */
  placePiece(row: number, col: number): boolean {
    if (!this.isValidPosition(row, col) || this.board[row][col] !== Player.NONE) {
      return false;
    }

    const placingPlayer = this.currentPlayer;
    this.board[row][col] = placingPlayer;
    this.lastMove = { row, col };

    this.checkForCaptures(row, col);

    // Switch player
    this.currentPlayer = placingPlayer === Player.BLACK ? Player.WHITE : Player.BLACK;

    return true;
  }

  /**
   * Checks for captures in all 8 directions around the newly placed stone.
   */
  private checkForCaptures(row: number, col: number): void {
    const directions = [
      { r: 0, c: 1 }, { r: 0, c: -1 }, // Horizontal
      { r: 1, c: 0 }, { r: -1, c: 0 }, // Vertical
      { r: 1, c: 1 }, { r: -1, c: -1 }, // Diagonal /
      { r: 1, c: -1 }, { r: -1, c: 1 }  // Diagonal \
    ];

    const capturingPlayer = this.board[row][col];
    const opponentPlayer = capturingPlayer === Player.BLACK ? Player.WHITE : Player.BLACK;

    for (const dir of directions) {
      const r1 = row + dir.r;
      const c1 = col + dir.c;
      const r2 = row + 2 * dir.r;
      const c2 = col + 2 * dir.c;
      const r3 = row + 3 * dir.r;
      const c3 = col + 3 * dir.c;

      if (
        this.getPiece(r1, c1) === opponentPlayer &&
        this.getPiece(r2, c2) === opponentPlayer &&
        this.getPiece(r3, c3) === capturingPlayer
      ) {
        // Capture occurred
        this.board[r1][c1] = Player.NONE;
        this.board[r2][c2] = Player.NONE;
        if (capturingPlayer === Player.BLACK) {
          this.blackCaptures += 2;
        } else {
          this.whiteCaptures += 2;
        }
      }
    }
  }

  /**
   * Get the piece at a position
   */
  getPiece(row: number, col: number): Player {
    if (!this.isValidPosition(row, col)) {
      // Return NONE for out-of-bounds, simplifying checks
      return Player.NONE;
    }
    return this.board[row][col];
  }

  /**
   * Check if position is valid
   */
  private isValidPosition(row: number, col: number): boolean {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  /**
   * Reset the game
   */
  reset(): void {
    this.board = Array(BOARD_SIZE)
      .fill(null)
      .map(() => Array(BOARD_SIZE).fill(Player.NONE));
    this.currentPlayer = Player.BLACK;
    this.blackCaptures = 0;
    this.whiteCaptures = 0;
    this.lastMove = null;
  }

  // Getters
  getCurrentPlayer(): Player {
    return this.currentPlayer;
  }

  getBlackCaptures(): number {
    return this.blackCaptures;
  }

  getWhiteCaptures(): number {
    return this.whiteCaptures;
  }

  getLastMove(): Position | null {
    return this.lastMove;
  }
}

/**
 * GameRenderer class - Handles Canvas drawing and user interaction
 */
class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gameBoard: GameBoard;
  private hoverPosition: Position | null;

  constructor(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!this.canvas) {
      throw new Error(`Canvas with id "${canvasId}" not found`);
    }

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get 2D context');
    }
    this.ctx = context;

    this.gameBoard = new GameBoard();
    this.hoverPosition = null;

    this.setupCanvas();
    this.setupEventListeners();
    this.draw();
    this.updateUI();
  }

  /**
   * Setup canvas dimensions
   */
  private setupCanvas(): void {
    const size = BOARD_SIZE * CELL_SIZE + BOARD_MARGIN * 2;
    this.canvas.width = size;
    this.canvas.height = size;
  }

  /**
   * Setup mouse event listeners
   */
  private setupEventListeners(): void {
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());

    // Reset button
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetGame());
    }
  }

  /**
   * Convert canvas coordinates to board position
   */
  private canvasToBoard(x: number, y: number): Position | null {
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = x - rect.left;
    const canvasY = y - rect.top;

    const col = Math.round((canvasX - BOARD_MARGIN) / CELL_SIZE);
    const row = Math.round((canvasY - BOARD_MARGIN) / CELL_SIZE);

    if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
      return { row, col };
    }

    return null;
  }

  /**
   * Handle click event
   */
  private handleClick(e: MouseEvent): void {
    const pos = this.canvasToBoard(e.clientX, e.clientY);
    if (pos) {
      if (this.gameBoard.placePiece(pos.row, pos.col)) {
        this.draw();
        this.updateUI();
      }
    }
  }

  /**
   * Handle mouse move event
   */
  private handleMouseMove(e: MouseEvent): void {
    const pos = this.canvasToBoard(e.clientX, e.clientY);
    if (pos && this.gameBoard.getPiece(pos.row, pos.col) === Player.NONE) {
      this.hoverPosition = pos;
    } else {
      this.hoverPosition = null;
    }
    this.draw();
  }

  /**
   * Handle mouse leave event
   */
  private handleMouseLeave(): void {
    this.hoverPosition = null;
    this.draw();
  }

  /**
   * Main draw function
   */
  private draw(): void {
    this.clearCanvas();
    this.drawBoard();
    this.drawStones();
    this.drawHover();
  }

  /**
   * Clear the canvas
   */
  private clearCanvas(): void {
    this.ctx.fillStyle = '#DEB887';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Draw the game board grid
   */
  private drawBoard(): void {
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 1;

    // Draw grid lines
    for (let i = 0; i < BOARD_SIZE; i++) {
      const pos = BOARD_MARGIN + i * CELL_SIZE;

      // Vertical line
      this.ctx.beginPath();
      this.ctx.moveTo(pos, BOARD_MARGIN);
      this.ctx.lineTo(pos, BOARD_MARGIN + (BOARD_SIZE - 1) * CELL_SIZE);
      this.ctx.stroke();

      // Horizontal line
      this.ctx.beginPath();
      this.ctx.moveTo(BOARD_MARGIN, pos);
      this.ctx.lineTo(BOARD_MARGIN + (BOARD_SIZE - 1) * CELL_SIZE, pos);
      this.ctx.stroke();
    }

    // Draw star points (hoshi)
    this.drawStarPoints();
  }

  /**
   * Draw star points on the board
   */
  private drawStarPoints(): void {
    const starPoints = [
      [3, 3], [3, 9], [3, 15],
      [9, 3], [9, 9], [9, 15],
      [15, 3], [15, 9], [15, 15],
    ];

    this.ctx.fillStyle = '#000000';
    starPoints.forEach(([row, col]) => {
      const x = BOARD_MARGIN + col * CELL_SIZE;
      const y = BOARD_MARGIN + row * CELL_SIZE;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 3, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  /**
   * Draw all stones on the board
   */
  private drawStones(): void {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.gameBoard.getPiece(row, col);
        if (piece !== Player.NONE) {
          this.drawStone(row, col, piece);
        }
      }
    }

    // Highlight last move
    const lastMove = this.gameBoard.getLastMove();
    if (lastMove) {
      this.highlightLastMove(lastMove);
    }
  }

  /**
   * Draw a single stone
   */
  private drawStone(row: number, col: number, player: Player): void {
    const x = BOARD_MARGIN + col * CELL_SIZE;
    const y = BOARD_MARGIN + row * CELL_SIZE;

    // Shadow
    this.ctx.beginPath();
    this.ctx.arc(x + 2, y + 2, STONE_RADIUS, 0, Math.PI * 2);
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.fill();

    // Stone
    this.ctx.beginPath();
    this.ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2);
    
    if (player === Player.BLACK) {
      this.ctx.fillStyle = '#000000';
    } else {
      this.ctx.fillStyle = '#FFFFFF';
    }
    this.ctx.fill();

    // Border
    this.ctx.strokeStyle = player === Player.BLACK ? '#333333' : '#CCCCCC';
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
  }

  /**
   * Highlight the last move
   */
  private highlightLastMove(pos: Position): void {
    const x = BOARD_MARGIN + pos.col * CELL_SIZE;
    const y = BOARD_MARGIN + pos.row * CELL_SIZE;

    this.ctx.beginPath();
    this.ctx.arc(x, y, 5, 0, Math.PI * 2);
    this.ctx.fillStyle = '#FF0000';
    this.ctx.fill();
  }

  /**
   * Draw hover preview
   */
  private drawHover(): void {
    if (!this.hoverPosition) return;

    const x = BOARD_MARGIN + this.hoverPosition.col * CELL_SIZE;
    const y = BOARD_MARGIN + this.hoverPosition.row * CELL_SIZE;

    this.ctx.beginPath();
    this.ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2);
    
    const currentPlayer = this.gameBoard.getCurrentPlayer();
    if (currentPlayer === Player.BLACK) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    } else {
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      this.ctx.strokeStyle = '#888888';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    }
    this.ctx.fill();
  }

  /**
   * Update UI elements
   */
  private updateUI(): void {
    // Current player
    const currentPlayerEl = document.getElementById('currentPlayer');
    if (currentPlayerEl) {
      const player = this.gameBoard.getCurrentPlayer() === Player.BLACK ? 'Noir' : 'Blanc';
      currentPlayerEl.textContent = `Tour: ${player}`;
    }

    // Captures
    const blackCapturesEl = document.getElementById('blackCaptures');
    if (blackCapturesEl) {
      blackCapturesEl.textContent = `Noir: ${this.gameBoard.getBlackCaptures()} pierres capturées`;
    }

    const whiteCapturesEl = document.getElementById('whiteCaptures');
    if (whiteCapturesEl) {
      whiteCapturesEl.textContent = `Blanc: ${this.gameBoard.getWhiteCaptures()} pierres capturées`;
    }

    // Timer (placeholder for AI)
    const timerEl = document.getElementById('timer');
    if (timerEl) {
      timerEl.textContent = 'Timer IA: 0.000s';
    }
  }

  /**
   * Reset the game
   */
  private resetGame(): void {
    this.gameBoard.reset();
    this.hoverPosition = null;
    this.draw();
    this.updateUI();
  }
}

// Initialize the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  try {
    new GameRenderer('gameBoard');
    console.log('Gomoku game initialized successfully');
  } catch (error) {
    console.error('Failed to initialize game:', error);
  }
});
