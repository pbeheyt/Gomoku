/**
 * Gomoku Game Renderer - Integrated with Core Modules
 * Handles the visual representation and user interaction for the Gomoku board
 */

import { Player, Position, GameMode } from '../core/types.js';
import { GomokuGame } from '../core/game.js';
import { CanvasRenderer } from '../ui/canvas.js';
import { gameEvents, emitGameReset } from '../core/events.js';
import { createWasmAI, WasmAI } from '../wasm/ai_wrapper.js';

// Constants
const BOARD_SIZE = 19;

/**
 * GameController class - Manages the game flow and UI interaction
 */
class GameController {
  private game: GomokuGame;
  private canvasRenderer: CanvasRenderer;
  private currentMode: GameMode;
  private hoverPosition: Position | null;
  private isGameOver: boolean;
  private wasmAI: WasmAI | null = null;
  private isAIThinking: boolean = false;

  constructor(canvasId: string) {
    this.game = new GomokuGame();
    this.currentMode = GameMode.PLAYER_VS_PLAYER;
    this.hoverPosition = null;
    this.isGameOver = false;

    // Initialize canvas renderer
    this.canvasRenderer = new CanvasRenderer(canvasId, this.game.getBoard());
    
    this.setupEventListeners();
    this.setupGameEvents();
    this.initializeAI();
    this.updateUI();
    this.canvasRenderer.draw(this.game.getCurrentPlayer(), null);
  }

  /**
   * Setup mouse event listeners
   */
  private setupEventListeners(): void {
    const canvas = this.canvasRenderer.getCanvas();
    
    canvas.addEventListener('click', (e) => this.handleClick(e));
    canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    canvas.addEventListener('mouseleave', () => this.handleMouseLeave());

    // Reset button
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetGame());
    }

    // Game mode selection
    const gameModeSelect = document.getElementById('gameMode') as HTMLSelectElement;
    if (gameModeSelect) {
      gameModeSelect.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        this.setGameMode(target.value as GameMode);
      });
    }
  }

  /**
   * Setup game event listeners
   */
  private setupGameEvents(): void {
    // Listen for move events
    gameEvents.on('move:made', (move) => {
      this.updateUI();
      this.canvasRenderer.draw(this.game.getCurrentPlayer(), null);
    });

    // Listen for capture events
    gameEvents.on('capture:made', (capture) => {
      console.log('Capture made:', capture);
      this.updateUI();
    });

    // Listen for game won events
    gameEvents.on('game:won', (winner) => {
      this.isGameOver = true;
      const winnerText = winner === Player.BLACK ? 'Noir' : 'Blanc';
      this.showMessage(`🎉 Victoire! ${winnerText} a gagné!`);
      this.updateUI();
    });

    // Listen for player changed events
    gameEvents.on('player:changed', (player) => {
      this.updateUI();
      // If AI should play now, trigger AI move
      if (this.currentMode === GameMode.PLAYER_VS_AI && player === Player.WHITE && !this.isGameOver) {
        this.makeAIMove();
      }
    });
  }

  /**
   * Convert canvas coordinates to board position
   */
  private canvasToBoard(x: number, y: number): Position | null {
    return this.canvasRenderer.canvasToBoard(x, y);
  }

  /**
   * Handle click event
   */
  private handleClick(e: MouseEvent): void {
    if (this.isGameOver) return;

    const pos = this.canvasToBoard(e.clientX, e.clientY);
    if (pos) {
      this.makeMove(pos.row, pos.col);
    }
  }

  /**
   * Handle mouse move event
   */
  private handleMouseMove(e: MouseEvent): void {
    if (this.isGameOver) return;

    const pos = this.canvasToBoard(e.clientX, e.clientY);
    if (pos && this.game.getBoard().isValidMove(pos.row, pos.col)) {
      this.hoverPosition = pos;
    } else {
      this.hoverPosition = null;
    }
    this.canvasRenderer.draw(this.game.getCurrentPlayer(), this.hoverPosition);
  }

  /**
   * Handle mouse leave event
   */
  private handleMouseLeave(): void {
    this.hoverPosition = null;
    this.canvasRenderer.draw(this.game.getCurrentPlayer(), null);
  }

  /**
   * Make a move on the board
   */
  private makeMove(row: number, col: number): void {
    const result = this.game.makeMove(row, col);
    
    if (!result.isValid) {
      this.showMessage(`❌ Mouvement invalide: ${result.reason}`);
      return;
    }

    // Clear hover position after successful move
    this.hoverPosition = null;
    this.canvasRenderer.draw(this.game.getCurrentPlayer(), null);
  }

  /**
   * Initialize the WebAssembly AI
   */
  private async initializeAI(): Promise<void> {
    try {
      this.wasmAI = await createWasmAI();
      console.log('WebAssembly AI initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WebAssembly AI:', error);
      this.wasmAI = null;
    }
  }

  /**
   * Make AI move using WebAssembly AI
   */
  private async makeAIMove(): Promise<void> {
    if (this.isAIThinking) return;
    
    console.log('AI move requested');
    this.isAIThinking = true;
    this.showMessage('🤖 IA réfléchit...');
    
    try {
      if (this.wasmAI && this.wasmAI.isReady()) {
        // Update AI with current game state
        this.wasmAI.updateGameState(this.game.getGameState());
        
        // Get the best move from AI
        const aiMove = this.wasmAI.getBestMove();
        
        if (aiMove) {
          // Simulate thinking time for better UX
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Make the AI move
          this.makeMove(aiMove.row, aiMove.col);
          console.log(`AI made move: row ${aiMove.row}, col ${aiMove.col}`);
        } else {
          console.warn('AI returned null move, using fallback');
          this.makeFallbackAIMove();
        }
      } else {
        console.warn('WebAssembly AI not available, using fallback');
        this.makeFallbackAIMove();
      }
    } catch (error) {
      console.error('Error making AI move:', error);
      this.makeFallbackAIMove();
    } finally {
      this.isAIThinking = false;
    }
  }

  /**
   * Fallback AI: make a random valid move
   */
  private async makeFallbackAIMove(): Promise<void> {
    const emptyPositions = this.game.getBoard().getEmptyPositions();
    if (emptyPositions.length > 0) {
      const randomPos = emptyPositions[Math.floor(Math.random() * emptyPositions.length)];
      this.makeMove(randomPos.row, randomPos.col);
    }
  }

  /**
   * Reset the game
   */
  private resetGame(): void {
    this.game.reset();
    this.isGameOver = false;
    this.hoverPosition = null;
    this.isAIThinking = false;
    
    // Reset AI if available
    if (this.wasmAI && this.wasmAI.isReady()) {
      this.wasmAI.initAI(this.wasmAI.getAIPlayer());
    }
    
    emitGameReset();
    this.canvasRenderer.draw(this.game.getCurrentPlayer(), null);
    this.updateUI();
    this.clearMessage();
  }

  /**
   * Update UI elements
   */
  private updateUI(): void {
    // Current player
    const currentPlayerEl = document.getElementById('currentPlayer');
    if (currentPlayerEl) {
      const player = this.game.getCurrentPlayer() === Player.BLACK ? 'Noir' : 'Blanc';
      currentPlayerEl.textContent = `Tour: ${player}`;
    }

    // Captures
    const blackCapturesEl = document.getElementById('blackCaptures');
    if (blackCapturesEl) {
      blackCapturesEl.textContent = `Noir: ${this.game.getBlackCaptures()} pierres capturées`;
    }

    const whiteCapturesEl = document.getElementById('whiteCaptures');
    if (whiteCapturesEl) {
      whiteCapturesEl.textContent = `Blanc: ${this.game.getWhiteCaptures()} pierres capturées`;
    }

    // Timer (placeholder for AI)
    const timerEl = document.getElementById('timer');
    if (timerEl) {
      timerEl.textContent = '0.000s';
    }
  }

  /**
   * Show message to user
   */
  private showMessage(message: string): void {
    // Create or update message element
    let messageEl = document.getElementById('gameMessage');
    if (!messageEl) {
      messageEl = document.createElement('div');
      messageEl.id = 'gameMessage';
      messageEl.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: white; padding: 10px 20px; border-radius: 5px; z-index: 1000;';
      document.body.appendChild(messageEl);
    }
    messageEl.textContent = message;
    messageEl.style.display = 'block';

    // Auto-hide after 3 seconds
    setTimeout(() => {
      if (messageEl) {
        messageEl.style.display = 'none';
      }
    }, 3000);
  }

  /**
   * Clear message
   */
  private clearMessage(): void {
    const messageEl = document.getElementById('gameMessage');
    if (messageEl) {
      messageEl.style.display = 'none';
    }
  }

  /**
   * Set game mode
   */
  public setGameMode(mode: GameMode): void {
    this.currentMode = mode;
    this.resetGame();
  }

  /**
   * Get current game mode
   */
  public getGameMode(): GameMode {
    return this.currentMode;
  }
}

// Initialize the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  try {
    const gameController = new GameController('gameBoard');
    console.log('Gomoku game initialized successfully');
    
    // Make gameController available globally for debugging
    (window as any).gameController = gameController;
  } catch (error) {
    console.error('Failed to initialize game:', error);
  }
});
