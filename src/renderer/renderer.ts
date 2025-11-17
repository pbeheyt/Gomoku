/**
 * Gomoku Game Renderer - V3 with Generic Modal Logic
 */
import { Player, Position, GameMode } from '../core/types.js';
import { GomokuGame } from '../core/game.js';
import { CanvasRenderer } from '../ui/canvas.js';
import { gameEvents, emitGameReset } from '../core/events.js';
import { createWasmAI, WasmAI } from '../wasm/ai_wrapper.js';

type AppState = 'MENU' | 'IN_GAME' | 'GAME_OVER';
type ModalButton = { text: string; callback: () => void; className?: string; };

class GameController {
  private game: GomokuGame;
  private canvasRenderer: CanvasRenderer;
  private currentMode: GameMode = GameMode.PLAYER_VS_PLAYER;
  private hoverPosition: Position | null = null;
  private suggestionPosition: Position | null = null;
  private wasmAI: WasmAI | null = null;
  private isAIThinking: boolean = false;
  private lastAIThinkingTime: number = 0;
  private appState: AppState = 'MENU';

  // HTML Elements
  private mainMenuEl: HTMLElement | null;
  private gameOverMenuEl: HTMLElement | null;
  private gameContainerEl: HTMLElement | null;
  private winnerMessageEl: HTMLElement | null;
  private suggestBtnEl: HTMLElement | null;
  private aiTimerSectionEl: HTMLElement | null = null;
  private genericModalEl: HTMLElement | null;
  private modalTitleEl: HTMLElement | null;
  private modalBodyEl: HTMLElement | null;
  private modalFooterEl: HTMLElement | null;

  constructor(canvasId: string) {
    this.game = new GomokuGame();
    this.canvasRenderer = new CanvasRenderer(canvasId, this.game.getBoard());

    // Cache DOM elements
    this.mainMenuEl = document.getElementById('mainMenu');
    this.gameOverMenuEl = document.getElementById('gameOverMenu');
    this.gameContainerEl = document.getElementById('gameContainer');
    this.winnerMessageEl = document.getElementById('winnerMessage');
    this.suggestBtnEl = document.getElementById('suggestBtn');
    this.aiTimerSectionEl = document.getElementById('aiTimerSection');
    this.genericModalEl = document.getElementById('genericModal');
    this.modalTitleEl = document.getElementById('modalTitle');
    this.modalBodyEl = document.getElementById('modalBody');
    this.modalFooterEl = document.getElementById('modalFooter');

    this.setupMenuListeners();
    this.setupGameEventListeners();
    this.setupGameEvents();
    this.initializeAI();

    this.showView('MENU');
  }

  private showView(view: AppState): void {
    this.appState = view;
    this.mainMenuEl?.classList.toggle('hidden', view !== 'MENU');
    this.gameContainerEl?.classList.toggle('hidden', view !== 'IN_GAME');
    this.gameOverMenuEl?.classList.toggle('hidden', view !== 'GAME_OVER');
  }

  private setupMenuListeners(): void {
    document.getElementById('pvpBtn')?.addEventListener('click', () => this.startGame(GameMode.PLAYER_VS_PLAYER));
    document.getElementById('pvaBtn')?.addEventListener('click', () => this.startGame(GameMode.PLAYER_VS_AI));
    document.getElementById('replayBtn')?.addEventListener('click', () => this.startGame(this.currentMode));
    document.getElementById('gameOverMenuBtn')?.addEventListener('click', () => this.showView('MENU'));
  }

  private setupGameEventListeners(): void {
    const canvas = this.canvasRenderer.getCanvas();
    canvas.addEventListener('click', (e) => this.handleClick(e));
    canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    canvas.addEventListener('mouseleave', () => this.handleMouseLeave());

    document.getElementById('resetBtn')?.addEventListener('click', () => this.confirmReset());
    document.getElementById('menuBtn')?.addEventListener('click', () => this.confirmGoToMenu());
    this.suggestBtnEl?.addEventListener('click', () => this.showAISuggestion());
    document.getElementById('rulesBtn')?.addEventListener('click', () => this.showRulesModal());
  }

  private setupGameEvents(): void {
    gameEvents.on('move:made', () => this.redraw());
    gameEvents.on('capture:made', () => this.updateUI());
    gameEvents.on('game:won', (winner) => {
      if (this.winnerMessageEl) {
        this.winnerMessageEl.textContent = `🎉 ${winner === Player.BLACK ? 'Noir' : 'Blanc'} a gagné !`;
      }
      this.showView('GAME_OVER');
      this.updateUI();
    });
    gameEvents.on('player:changed', () => this.updateUI());
  }
  
  private showModal(title: string, contentHTML: string, buttons: ModalButton[]): void {
    if (!this.genericModalEl || !this.modalTitleEl || !this.modalBodyEl || !this.modalFooterEl) return;
    
    this.modalTitleEl.textContent = title;
    this.modalBodyEl.innerHTML = contentHTML;
    this.modalFooterEl.innerHTML = ''; // Clear previous buttons

    buttons.forEach(btnInfo => {
        const button = document.createElement('button');
        button.textContent = btnInfo.text;
        button.className = `btn-modal ${btnInfo.className || ''}`;
        button.onclick = () => {
            this.genericModalEl?.classList.add('hidden');
            btnInfo.callback();
        };
        this.modalFooterEl!.appendChild(button);
    });

    this.genericModalEl.classList.remove('hidden');
  }

  private showRulesModal(): void {
    const rulesHTML = `
      <ul>
        <li><b>Victoire par Alignement :</b> Le premier joueur à aligner 5 pierres (ou plus) horizontalement, verticalement ou en diagonale gagne.</li>
        <li><b>Victoire par Capture :</b> Capturez 10 pierres adverses (5 paires) pour gagner. Une capture se fait en encerclant exactement deux pierres adverses avec les vôtres.</li>
        <li><b>Règle de Fin de Partie :</b> Une victoire par alignement n'est validée que si l'adversaire ne peut pas "casser" la ligne en capturant une paire de pierres à l'intérieur de celle-ci lors de son prochain tour.</li>
        <li><b>Double-Trois Interdit :</b> Il est interdit de jouer un coup qui crée simultanément deux lignes de trois pierres "libres" (non bloquées aux extrémités).</li>
      </ul>`;
    this.showModal('Règles du Gomoku', rulesHTML, [{ text: 'Fermer', callback: () => {} }]);
  }

  private confirmReset(): void {
    this.showModal('Recommencer', '<p>Êtes-vous sûr de vouloir recommencer la partie ?</p>', [
        { text: 'Oui', callback: () => this.resetGame(false), className: 'primary' },
        { text: 'Non', callback: () => {} }
    ]);
  }

  private confirmGoToMenu(): void {
    this.showModal('Menu Principal', '<p>Êtes-vous sûr de vouloir quitter la partie et retourner au menu principal ?</p>', [
        { text: 'Oui', callback: () => this.showView('MENU'), className: 'primary' },
        { text: 'Non', callback: () => {} }
    ]);
  }

  private startGame(mode: GameMode): void {
    this.currentMode = mode;
    this.resetGame(true);
    this.showView('IN_GAME');
  }

  private canvasToBoard(x: number, y: number): Position | null {
    return this.canvasRenderer.canvasToBoard(x, y);
  }

  private handleClick(e: MouseEvent): void {
    if (this.appState !== 'IN_GAME' || this.game.isGameOver() || this.isAIThinking) return;
    if (this.currentMode === GameMode.PLAYER_VS_AI && this.game.getCurrentPlayer() !== Player.BLACK) return;

    const pos = this.canvasToBoard(e.clientX, e.clientY);
    if (pos) this.makeMove(pos.row, pos.col);
  }

  private handleMouseMove(e: MouseEvent): void {
    if (this.appState !== 'IN_GAME' || this.game.isGameOver()) return;
    const pos = this.canvasToBoard(e.clientX, e.clientY);
    this.hoverPosition = (pos && this.game.getBoard().isValidMove(pos.row, pos.col)) ? pos : null;
    this.redraw();
  }

  private handleMouseLeave(): void {
    this.hoverPosition = null;
    this.redraw();
  }

  private makeMove(row: number, col: number): void {
    const result = this.game.makeMove(row, col);
    if (!result.isValid) {
      this.showMessage(`❌ Mouvement invalide: ${result.reason}`);
      return;
    }
    this.hoverPosition = null;
    this.suggestionPosition = null;
    if (this.currentMode === GameMode.PLAYER_VS_AI && !this.game.isGameOver()) {
      this.triggerAIMove();
    }
  }

  private async initializeAI(): Promise<void> {
    try {
      this.wasmAI = await createWasmAI();
      console.log('WebAssembly AI initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WebAssembly AI:', error);
    }
  }

  private async triggerAIMove(): Promise<void> {
    if (this.isAIThinking) return;
    this.isAIThinking = true;
    this.showMessage('🤖 IA réfléchit...');
    this.updateUI();

    try {
      if (this.wasmAI?.isReady()) {
        this.wasmAI.updateGameState(this.game.getGameState());
        const startTime = performance.now();
        const aiMove = this.wasmAI.getBestMove();
        const endTime = performance.now();
        this.lastAIThinkingTime = (endTime - startTime) / 1000;

        await new Promise(resolve => setTimeout(resolve, 300)); // UX delay

        if (aiMove && this.game.getBoard().isValidMove(aiMove.row, aiMove.col)) {
          this.makeMove(aiMove.row, aiMove.col);
        } else {
          console.error("AI returned invalid move or null, using fallback.");
        }
      }
    } catch (error) {
      console.error('Error making AI move:', error);
    } finally {
      this.isAIThinking = false;
      this.updateUI();
    }
  }

  private async showAISuggestion(): Promise<void> {
    if (this.isAIThinking || !this.wasmAI?.isReady()) return;
    this.isAIThinking = true;
    this.showMessage("💡 L'IA cherche le meilleur coup...");
    this.updateUI();

    try {
      this.wasmAI.updateGameState(this.game.getGameState());
      const suggestion = this.wasmAI.getBestMove();
      if (suggestion) {
        this.suggestionPosition = suggestion;
        this.redraw();
        setTimeout(() => {
          this.suggestionPosition = null;
          this.redraw();
        }, 3000); // Highlight for 3 seconds
      }
    } finally {
      this.isAIThinking = false;
      this.updateUI();
    }
  }

  private resetGame(isNewGame: boolean): void {
    this.game.reset();
    this.hoverPosition = null;
    this.suggestionPosition = null;
    this.isAIThinking = false;
    this.lastAIThinkingTime = 0;
    this.wasmAI?.initAI(Player.WHITE);
    if (!isNewGame) {
      emitGameReset();
    }
    this.redraw();
    this.updateUI();
    this.clearMessage();
  }

  private redraw(): void {
    this.canvasRenderer.draw(
      this.game.getCurrentPlayer(),
      this.hoverPosition,
      this.game.getLastMove(),
      this.suggestionPosition
    );
    this.updateUI();
  }

  private updateUI(): void {
    const currentPlayer = this.game.getCurrentPlayer();
    const isGameOver = this.game.isGameOver();

    // Active player highlight
    document.getElementById('playerInfoBlack')?.classList.toggle('active-player', !isGameOver && currentPlayer === Player.BLACK);
    document.getElementById('playerInfoWhite')?.classList.toggle('active-player', !isGameOver && currentPlayer === Player.WHITE);

    // Captures
    document.getElementById('blackCaptures')!.textContent = `Captures: ${this.game.getBlackCaptures()} / 10`;
    document.getElementById('whiteCaptures')!.textContent = `Captures: ${this.game.getWhiteCaptures()} / 10`;

    // Timer
    document.getElementById('timer')!.textContent = `${this.lastAIThinkingTime.toFixed(4)}s`;
    this.aiTimerSectionEl?.classList.toggle('hidden', this.currentMode !== GameMode.PLAYER_VS_AI);

    // Suggest button visibility
    this.suggestBtnEl?.classList.toggle('hidden', this.currentMode !== GameMode.PLAYER_VS_PLAYER || isGameOver);
  }

  private showMessage(message: string): void {
    let messageEl = document.getElementById('gameMessage');
    if (!messageEl) {
      messageEl = document.createElement('div');
      messageEl.id = 'gameMessage';
      messageEl.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: white; padding: 10px 20px; border-radius: 5px; z-index: 1000;';
      document.body.appendChild(messageEl);
    }
    messageEl.textContent = message;
    messageEl.style.display = 'block';
    setTimeout(() => { if (messageEl) messageEl.style.display = 'none'; }, 3000);
  }

  private clearMessage(): void {
    const messageEl = document.getElementById('gameMessage');
    if (messageEl) messageEl.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    const gameController = new GameController('gameBoard');
    (window as any).gameController = gameController;
  } catch (error) {
    console.error('Failed to initialize game:', error);
  }
});
