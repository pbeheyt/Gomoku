// @src/renderer/renderer.ts
/**
 * Gomoku Game Renderer
 */
import { Player, Position, GameMode } from '../core/types.js';
import { GomokuGame } from '../core/game.js';
import { ThreeRenderer } from '../ui/three_renderer.js';
import { gameEvents, emitGameReset } from '../core/events.js';
import { createWasmAI, WasmAI } from '../wasm/ai_wrapper.js';
import { LlmAI } from '../llm/llm_ai.js';
import { UIManager, AppState } from './ui_manager.js';
import { SoundManager } from './sound_manager.js';
import { LeaderboardManager } from './leaderboard_manager.js';

const LOCAL_STORAGE_API_KEY = 'gomoku-llm-api-key';
const LOCAL_STORAGE_MODEL = 'gomoku-llm-model';

type ActorType = 'HUMAN' | 'AI_WASM' | 'AI_LLM';

class GameController {
  private game: GomokuGame;
  private renderer!: ThreeRenderer;
  private ui: UIManager;
  private soundManager!: SoundManager;
  private currentMode: GameMode = GameMode.PLAYER_VS_PLAYER;
  private lastGameConfig: any = {}; 
  
  // Actor configuration: Who controls which color?
  private players: { [key in Player]: ActorType } = {
    [Player.BLACK]: 'HUMAN',
    [Player.WHITE]: 'HUMAN',
    [Player.NONE]: 'HUMAN' // Fallback
  };

  private hoverPosition: Position | null = null;
  private suggestionPosition: Position | null = null;
  private wasmAI: WasmAI | null = null;
  private llmAI: LlmAI | null = null;
  private isAIThinking: boolean = false;
  private lastAIThinkingTime: number = 0;
  private appState: AppState = 'MENU';

  // Cumulative timers (in seconds)
  private blackTimeTotal: number = 0;
  private whiteTimeTotal: number = 0;
  private turnStartTime: number = 0;
  private timerInterval: any = null;
  private isRanked: boolean = true; // True by default, becomes false if replay is used

  constructor(containerId: string) {
    this.game = new GomokuGame();
    this.ui = new UIManager();
    this.soundManager = new SoundManager();
    
  // Renderer initialized in startGame to ensure DOM is visible
    this.setupBindings();
    this.setupGameEvents();
    this.initializeAI();
    this.loadAndPopulateModels();

    this.showView('MENU');
  }

  private initRenderer(containerId: string): void {
  if (this.renderer) return; // Already initialized

  this.renderer = new ThreeRenderer(containerId, this.game.getBoard());

  // Bind events to the canvas
  const canvas = this.renderer.getCanvas();
  canvas.addEventListener('click', (e: MouseEvent) => this.handleClick(e));
  canvas.addEventListener('mousemove', (e: MouseEvent) => this.handleMouseMove(e));
  canvas.addEventListener('mouseleave', (e: MouseEvent) => this.handleMouseLeave());
    
  // Handle Window Resize
  window.addEventListener('resize', () => {
    if (this.renderer && this.appState === 'IN_GAME') {
      const container = document.getElementById(containerId);
      if (container) {
        this.renderer.resize(container.clientWidth, container.clientHeight);
      }
    }
  });
  }

  private setupBindings(): void {
    // Menu Actions (Launcher)
    this.ui.bindMenuButtons({
      onPvp: () => this.initiateGameStart(GameMode.PLAYER_VS_PLAYER),
      onPva: () => this.initiateGameStart(GameMode.PLAYER_VS_AI),
      onLlmPvp: () => this.initiateGameStart(GameMode.PLAYER_VS_LLM),
      onAiVsLlm: () => this.initiateGameStart(GameMode.AI_VS_LLM),
      onReplay: () => this.startGame(this.currentMode, this.lastGameConfig), // Replay with last config
      onMenu: () => this.showView('MENU'),
      onSettings: () => this.openSettingsModal()
    });

    // In-Game Controls (Side Panel)
    this.ui.bindGameControls({
      onReset: () => this.confirmReset(),
      onSuggest: () => this.showAISuggestion(),
      onHistory: (action) => this.handleHistoryAction(action)
    });

  // Header Controls
  this.ui.bindHeaderControls({
    onHome: () => this.confirmGoToMenu(),
    onRules: () => this.showRulesModal(),
    onSettings: () => this.openSettingsModal()
  });

    // Settings Actions
    this.ui.bindSettingsActions({
      onSave: () => this.saveSettings(),
      onCancel: () => this.ui.hideSettingsModal()
    });
  }

  private showView(view: AppState): void {
    this.appState = view;
    this.ui.showView(view);
  }

  private async loadAndPopulateModels(): Promise<void> {
    try {
      const response = await fetch('./openrouter_models.json');
      if (!response.ok) throw new Error('Failed to load models');
      const models = await response.json();
      this.ui.populateModels(models);
      
      // Set initial selection if exists
      const savedModel = localStorage.getItem(LOCAL_STORAGE_MODEL);
      if (savedModel) {
        // We can't easily set the select value here without exposing it from UI,
        // but openSettingsModal handles it when opened.
      }
    } catch (error) {
      console.error('Error loading models:', error);
    }
  }

  private openSettingsModal(): void {
    const savedApiKey = localStorage.getItem(LOCAL_STORAGE_API_KEY) || '';
    const savedModel = localStorage.getItem(LOCAL_STORAGE_MODEL) || '';
    this.ui.showSettingsModal(savedApiKey, savedModel);
  }

  private saveSettings(): void {
    const { apiKey, model, soundEnabled } = this.ui.getSettingsValues();
    if (apiKey) localStorage.setItem(LOCAL_STORAGE_API_KEY, apiKey);
    if (model) localStorage.setItem(LOCAL_STORAGE_MODEL, model);
    
    this.soundManager.setMuted(!soundEnabled);
    
    this.ui.hideSettingsModal();
    this.ui.showMessage('Paramètres sauvegardés', 'success');
  }

  private setupGameEvents(): void {
    gameEvents.on('move:made', (move) => {
        this.redraw();
        this.soundManager.playStoneDrop(move.player);
    });
  gameEvents.on('capture:made', () => {
    this.updateUI();
    this.soundManager.playCapture();
  });
    gameEvents.on('game:won', (winner) => {
      this.stopGlobalTimer(); // Stop counting time
      this.ui.setWinnerMessage(winner);
      this.showView('GAME_OVER');
      this.updateUI(); // Final update
      
      // Determine if "We" won (Human or current perspective)
      let isVictory = true;
      const humanColor = this.lastGameConfig.color || Player.BLACK;
      
      if (this.currentMode === GameMode.PLAYER_VS_AI || this.currentMode === GameMode.PLAYER_VS_LLM) {
          isVictory = (winner === humanColor);

          // === LEADERBOARD LOGIC ===
          // Only save score if Human won against C++ AI AND game is Ranked
          if (isVictory && this.currentMode === GameMode.PLAYER_VS_AI) {
              if (this.isRanked) {
                  const moves = this.game.getMoveHistory().length;
                  const timeTaken = (humanColor === Player.BLACK) ? this.blackTimeTotal : this.whiteTimeTotal;
                  
                  const entry = LeaderboardManager.addEntry(moves, timeTaken, 'AI C++', humanColor);
                  this.ui.showMessage(`Nouveau Score: ${entry.score} pts`, 'success');
              } else {
                  this.ui.showMessage(`Victoire en mode Sandbox (Non classé)`, 'warning');
              }
          }
      }
      
      this.soundManager.playWin(isVictory);
    });
  gameEvents.on('player:changed', () => {
    // Player changed, so we restart the turn timer for the NEW player
    this.startGlobalTimer();
    this.updateUI();
  });
  }

  private showRulesModal(): void {
    const rulesHTML = `
      <ul>
        <li><b>Victoire par Alignement :</b> Le premier joueur à aligner 5 pierres (ou plus) horizontalement, verticalement ou en diagonale gagne.</li>
        <li><b>Victoire par Capture :</b> Capturez 10 pierres adverses (5 paires) pour gagner. Une capture se fait en encerclant exactement deux pierres adverses avec les vôtres.</li>
        <li><b>Règle de Fin de Partie :</b> Une victoire par alignement n'est validée que si l'adversaire ne peut pas "casser" la ligne en capturant une paire de pierres à l'intérieur de celle-ci lors de son prochain tour.</li>
        <li><b>Double-Trois Interdit :</b> Il est interdit de jouer un coup qui crée simultanément deux lignes de trois pierres "libres" (non bloquées aux extrémités).</li>
      </ul>`;
    this.ui.showModal('Règles du Gomoku', rulesHTML, [{ text: 'Fermer', callback: () => {} }]);
  }

  private confirmReset(): void {
    this.ui.showModal('Recommencer', '<p>Êtes-vous sûr de vouloir recommencer la partie ?</p>', [
        { text: 'Oui', callback: () => this.resetGame(false, this.lastGameConfig), className: 'primary' },
        { text: 'Non', callback: () => {} }
    ]);
  }

  private confirmGoToMenu(): void {
    this.ui.showModal('Menu Principal', '<p>Êtes-vous sûr de vouloir quitter la partie et retourner au menu principal ?</p>', [
        { text: 'Oui', callback: () => this.showView('MENU'), className: 'primary' },
        { text: 'Non', callback: () => {} }
    ]);
  }

  private initiateGameStart(mode: GameMode): void {
    // 1. Fast Track for Local PvP (Instant Start)
    if (mode === GameMode.PLAYER_VS_PLAYER) {
      // Default config: Player starts as Black (standard rule)
      this.startGame(mode, { color: Player.BLACK });
      return;
    }

    // 2. Check requirements for LLM
    if (mode === GameMode.PLAYER_VS_LLM || mode === GameMode.AI_VS_LLM) {
      const apiKey = localStorage.getItem(LOCAL_STORAGE_API_KEY);
      if (!apiKey || apiKey.trim() === '') {
        this.ui.showModal(
          'Clé API requise',
          '<p>Pour jouer contre une IA LLM, vous devez d\'abord configurer votre clé API OpenRouter dans les paramètres.</p>',
          [{ text: 'Ouvrir les Paramètres', callback: () => this.openSettingsModal(), className: 'primary' }]
        );
        return;
      }
    }

    // 3. Show Setup Modal for AI modes
    this.ui.showSetupModal(mode, (config) => {
        this.startGame(mode, config);
    }, () => {
        // On cancel, do nothing (stay in menu)
    });
  }

  private startGame(mode: GameMode, config: any): void {
    this.currentMode = mode;
    this.lastGameConfig = config;

  // 1. Show view and initialize renderer to ensure DOM dimensions are valid
  this.showView('IN_GAME');

  this.initRenderer('boardContainer');
  // Force a resize to fit container
  const container = document.getElementById('boardContainer');
  if (container && this.renderer) {
    this.renderer.resize(container.clientWidth, container.clientHeight);
  }

  // 2. Configure Actors based on Mode and User Choice
    const userColor = config.color as Player || Player.BLACK;
    const opponentColor = userColor === Player.BLACK ? Player.WHITE : Player.BLACK;

    // Default: Human vs Human
    this.players[Player.BLACK] = 'HUMAN';
    this.players[Player.WHITE] = 'HUMAN';

    switch (mode) {
        case GameMode.PLAYER_VS_AI:
            this.players[userColor] = 'HUMAN';
            this.players[opponentColor] = 'AI_WASM';
            break;
        
        case GameMode.PLAYER_VS_LLM:
            this.players[userColor] = 'HUMAN';
            this.players[opponentColor] = 'AI_LLM';
            break;

        case GameMode.AI_VS_LLM:
            // Arena: C++ (Black) vs LLM (White) for now
            this.players[Player.BLACK] = 'AI_WASM';
            this.players[Player.WHITE] = 'AI_LLM';
            break;
            
        case GameMode.PLAYER_VS_PLAYER:
        default:
            // Already set to HUMAN vs HUMAN
            break;
    }

    // Save selected model
    if (config.modelId) {
        localStorage.setItem(LOCAL_STORAGE_MODEL, config.modelId);
    }

  // 4. Reset Game State
  this.resetGame(true, config);

  // 5. Start Timers and Turn
    this.startGlobalTimer();
    this.handleTurnStart();
  }

  private canvasToBoard(x: number, y: number): Position | null {
    if (!this.renderer) return null;
    return this.renderer.canvasToBoard(x, y);
  }

  private handleClick(e: MouseEvent): void {
    if (this.appState !== 'IN_GAME' || this.game.isGameOver() || this.isAIThinking) return;

    // Use the Actor map to determine if human can play
    const currentPlayer = this.game.getCurrentPlayer();
    const currentActor = this.players[currentPlayer];

    if (currentActor !== 'HUMAN') {
        return; // It's an AI's turn, ignore clicks
    }

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
    // Update time for the current move before sending it
    const now = performance.now();
    const deltaSeconds = (now - this.turnStartTime) / 1000;
    
    // Temporarily add delta to pass correct snapshot
    let currentBlackTime = this.blackTimeTotal;
    let currentWhiteTime = this.whiteTimeTotal;
    
    if (this.game.getCurrentPlayer() === Player.BLACK) {
        currentBlackTime += deltaSeconds;
    } else {
        currentWhiteTime += deltaSeconds;
    }

    const result = this.game.makeMove(row, col, currentBlackTime, currentWhiteTime);
    
    if (!result.isValid) {
      this.ui.showMessage(`Mouvement invalide: ${result.reason}`, 'warning');
      return;
    }
    
    // If we made a move while NOT at the end of history (branching), disable ranking
    // Note: makeMove inside game.ts handles the slicing, but we check if we *were* in the past
    // However, since game.ts slices immediately, we can infer branching if we used history controls previously.
    // A simpler check: If isRanked is already false, stay false. 
    // If we just branched (history was cut), game.ts handles logic.
    // We need to ensure isRanked is set to false if we play a move after rewinding.
    // We will handle the "Set to False" logic in handleHistoryAction when the user clicks "Prev".
    this.hoverPosition = null;
    this.suggestionPosition = null;

    if (this.game.isGameOver()) return;

    // Hand over control to the next actor
    this.handleTurnStart();
  }

  /**
   * Central logic to dispatch turns based on Actor configuration.
   */
  private handleTurnStart(): void {
    const currentPlayer = this.game.getCurrentPlayer();
    const actor = this.players[currentPlayer];

    if (actor === 'AI_WASM') {
        // Use requestAnimationFrame to ensure the board is fully rendered/painted 
        // BEFORE we start the heavy AI operations.
        requestAnimationFrame(() => {
            // Keep a tiny delay for UX (so moves aren't robotically instant)
            setTimeout(() => this.triggerAIMove(), 50);
        });
    } else if (actor === 'AI_LLM') {
        requestAnimationFrame(() => {
            setTimeout(() => this.triggerLlmMove(), 50);
        });
    } else {
        // HUMAN: Do nothing, wait for input events
    }
  }

  private startGlobalTimer(): void {
    this.stopGlobalTimer();
    this.turnStartTime = performance.now();
    
    // Refresh every 100ms for 0.1s precision
    this.timerInterval = setInterval(() => {
        const now = performance.now();
        const deltaSeconds = (now - this.turnStartTime) / 1000;
        this.turnStartTime = now; // reset for next tick

        // Add delta to current player
        if (this.game.getCurrentPlayer() === Player.BLACK) {
            this.blackTimeTotal += deltaSeconds;
        } else {
            this.whiteTimeTotal += deltaSeconds;
        }
        
        // Update UI without full redraw
        this.updateUI();
    }, 100);
  }

  private stopGlobalTimer(): void {
    if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
    }
  }

  private async initializeAI(): Promise<void> {
    try {
      this.wasmAI = await createWasmAI();
      console.log('WebAssembly AI initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WebAssembly AI:', error);
      this.ui.showMessage(
        "Erreur critique: Impossible de charger l'IA Native (WASM). Le mode 'Solo vs C++' sera indisponible.", 
        'error'
      );
    }
  }

  private async triggerAIMove(): Promise<void> {
    if (this.isAIThinking || !this.wasmAI) return;

    const turnGameId = this.game.getGameId(); // Capture ID

    this.isAIThinking = true;
    this.ui.startThinkingTimer();
    this.updateUI();

  try {
  // Stateless AI: send the game state directly to getBestMove
  // Check ID before expensive calc
  if (this.game.getGameId() !== turnGameId) return;

  const startTime = performance.now();
  const aiMove = await this.wasmAI.getBestMove(this.game.getGameState());
        const endTime = performance.now();
        this.lastAIThinkingTime = (endTime - startTime) / 1000;

        // Check ID after calc (CRITICAL)
        if (this.game.getGameId() !== turnGameId) return;

        if (aiMove && this.game.getBoard().isValidMove(aiMove.row, aiMove.col)) {
            this.makeMove(aiMove.row, aiMove.col);
        } else {
            this.ui.showMessage("L'IA a retourné un coup invalide.", 'error');
        }
    } catch (error) {
        if (this.game.getGameId() === turnGameId) {
            this.ui.showMessage(`Erreur IA C++: ${error}`, 'error');
        }
    } finally {
        // Only update UI if the game context hasn't changed
        if (this.game.getGameId() === turnGameId) {
            await this.ui.stopThinkingTimer(this.lastAIThinkingTime);
            this.isAIThinking = false;
            this.updateUI();
        }
    }
  }

  private async triggerLlmMove(): Promise<void> {
    if (this.isAIThinking) return;

    const turnGameId = this.game.getGameId(); // Capture ID

    this.isAIThinking = true;
    this.ui.startThinkingTimer();
    this.updateUI();

    try {
      const apiKey = localStorage.getItem(LOCAL_STORAGE_API_KEY);
      const model = localStorage.getItem(LOCAL_STORAGE_MODEL);
      if (!apiKey || !model) throw new Error("API Key or Model not configured.");

      this.llmAI = new LlmAI(apiKey, model);
      const startTime = performance.now();
      
      const result = await this.llmAI.getBestMove(
        this.game.getGameState(),
        (row, col) => this.game.validateMove(row, col)
      );

      // Check ID after network request (CRITICAL)
      if (this.game.getGameId() !== turnGameId) return;

      const endTime = performance.now();
      this.lastAIThinkingTime = (endTime - startTime) / 1000;

      const llmMove = result.position;
      this.ui.setReasoning(result.reasoning || "Aucun raisonnement disponible.");

      if (llmMove && this.game.getBoard().isValidMove(llmMove.row, llmMove.col)) {
        await new Promise(resolve => setTimeout(resolve, 300));
        // Final ID check before move
        if (this.game.getGameId() === turnGameId) {
             this.makeMove(llmMove.row, llmMove.col);
        }
      } else {
        throw new Error("L'IA a renvoyé un coup invalide.");
      }

    } catch (error) {
      if (this.game.getGameId() === turnGameId) {
          this.ui.showMessage(`Erreur IA LLM: ${error}`, 'error');
      }
    } finally {
      if (this.game.getGameId() === turnGameId) {
          await this.ui.stopThinkingTimer(this.lastAIThinkingTime);
          this.isAIThinking = false;
          this.updateUI();
      }
    }
  }

  private async showAISuggestion(): Promise<void> {
    if (this.isAIThinking || !this.wasmAI) return;
    
    // Only allow suggestion if it's a human turn
    if (this.players[this.game.getCurrentPlayer()] !== 'HUMAN') return;

    const turnGameId = this.game.getGameId(); // Capture ID

    this.isAIThinking = true;
    this.ui.startThinkingTimer();
    this.updateUI();

  try {
  // Stateless AI: send the current game state to get a suggestion
  if (this.game.getGameId() !== turnGameId) return;

  const startTime = performance.now();
  const suggestion = await this.wasmAI.getBestMove(this.game.getGameState());
        const endTime = performance.now();
        this.lastAIThinkingTime = (endTime - startTime) / 1000;

        if (this.game.getGameId() !== turnGameId) return;

        if (suggestion) {
            this.suggestionPosition = suggestion;
            this.redraw();
            setTimeout(() => {
                // Only clear if we are still in the same game and the suggestion is still valid
                if (this.game.getGameId() === turnGameId) {
                    this.suggestionPosition = null;
                    this.redraw();
                }
            }, 3000);
        }
    } catch (error) {
        if (this.game.getGameId() === turnGameId) {
            this.ui.showMessage(`Erreur suggestion: ${error}`, 'error');
        }
    } finally {
        if (this.game.getGameId() === turnGameId) {
            await this.ui.stopThinkingTimer(this.lastAIThinkingTime);
            this.isAIThinking = false;
            this.updateUI();
        }
    }
  }

  private resetGame(isNewGame: boolean, config: any = {}): void {
    this.game.reset();
    this.hoverPosition = null;
    this.suggestionPosition = null;
    this.isAIThinking = false;
    this.lastAIThinkingTime = 0;
    this.llmAI = null;
    
    this.isRanked = true;
    this.ui.setRankedStatus(true);

    // Configure WasmAI Identity
    // Even if WasmAI isn't playing (e.g. PvLLM), we initialize it 
    // so it can provide suggestions for the HUMAN player.
    
    let wasmIdentity = Player.WHITE; // Default

    // 1. If WasmAI is actually playing, it must be that color
    if (this.players[Player.BLACK] === 'AI_WASM') wasmIdentity = Player.BLACK;
    else if (this.players[Player.WHITE] === 'AI_WASM') wasmIdentity = Player.WHITE;
    
    // 2. If WasmAI is NOT playing (PvP or PvLLM), initialize it to the User's color
    // so suggestions are calculated from the User's perspective.
    else {
        const userColor = config.color as Player || Player.BLACK;
        wasmIdentity = userColor;
    }

    this.wasmAI?.initAI(wasmIdentity);

    if (!isNewGame) emitGameReset();
    
  // Reset Timers
    this.blackTimeTotal = 0;
    this.whiteTimeTotal = 0;
    this.stopGlobalTimer();
    
    this.ui.resetAiTimer();
    this.ui.setReasoning("En attente...");
    this.redraw();
    this.updateUI();
    this.ui.clearMessage();
  }

  private redraw(): void {
    if (this.renderer) {
        this.renderer.draw(
        this.game.getCurrentPlayer(),
        this.hoverPosition,
        this.game.getLastMove(),
        this.suggestionPosition
        );
    }
    this.updateUI();
  }

  private updateUI(): void {
    this.ui.updateGameInfo(
        this.game.getCurrentPlayer(), 
        this.game.getBlackCaptures(), 
        this.game.getWhiteCaptures(), 
        this.currentMode,
        this.blackTimeTotal,
        this.whiteTimeTotal
    );
    
    // Update History Controls
    this.ui.updateHistoryControls(
        this.game.getCurrentMoveIndex(),
        this.game.getTotalMoves()
    );
  }

  private handleHistoryAction(action: 'START' | 'PREV' | 'NEXT' | 'END'): void {
    const current = this.game.getCurrentMoveIndex();
    const total = this.game.getTotalMoves();
    
    // If we move backwards, we disable ranking for this game (Sandbox Mode)
    // BUT only if we are in the competitive mode (Player vs AI)
    if ((action === 'START' && current > 0) || (action === 'PREV' && current > 0)) {
        if (this.isRanked && this.currentMode === GameMode.PLAYER_VS_AI) {
            this.isRanked = false;
            this.ui.setRankedStatus(false); // Shows "NON CLASSÉ" badge
            this.ui.showMessage("Mode Replay : Classement désactivé.", 'warning');
        }
    }

    switch (action) {
        case 'START':
            this.game.jumpTo(0);
            break;
        case 'PREV':
            if (current > 0) this.game.jumpTo(current - 1);
            break;
        case 'NEXT':
            if (current < total) this.game.jumpTo(current + 1);
            break;
        case 'END':
            this.game.jumpTo(total);
            break;
    }
    
    // RESTORE TIMERS
    const newCurrent = this.game.getCurrentMoveIndex();
    if (newCurrent === 0) {
        this.blackTimeTotal = 0;
        this.whiteTimeTotal = 0;
    } else {
        const history = this.game.getMoveHistory();
        // The move at index N-1 resulted in state N.
        const lastMove = history[newCurrent - 1];
        if (lastMove) {
            this.blackTimeTotal = lastMove.blackTime;
            this.whiteTimeTotal = lastMove.whiteTime;
        }
    }
    
    // Reset Turn Timer for UX consistency
    this.turnStartTime = performance.now();

    // If we jumped to a state where the game is over, show it, otherwise hide it
    if (!this.game.isGameOver()) {
        this.showView('IN_GAME'); // Hide game over modal if we go back
    }
    
    this.redraw();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    const gameController = new GameController('boardContainer');
    (window as any).gameController = gameController;
  } catch (error) {
    console.error('Failed to initialize game:', error);
  }
});
