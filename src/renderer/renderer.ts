// @src/renderer/renderer.ts
/**
 * Gomoku Game Renderer - V4 with Decoupled UI Manager
 */
import { Player, Position, GameMode } from '../core/types.js';
import { GomokuGame } from '../core/game.js';
import { CanvasRenderer } from '../ui/canvas.js';
import { gameEvents, emitGameReset } from '../core/events.js';
import { createWasmAI, WasmAI } from '../wasm/ai_wrapper.js';
import { LlmAI } from '../llm/llm_ai.js';
import { UIManager, AppState } from './ui_manager.js';

const LOCAL_STORAGE_API_KEY = 'gomoku-llm-api-key';
const LOCAL_STORAGE_MODEL = 'gomoku-llm-model';

class GameController {
  private game: GomokuGame;
  private canvasRenderer: CanvasRenderer;
  private ui: UIManager;
  private currentMode: GameMode = GameMode.PLAYER_VS_PLAYER;
  private hoverPosition: Position | null = null;
  private suggestionPosition: Position | null = null;
  private wasmAI: WasmAI | null = null;
  private llmAI: LlmAI | null = null;
  private isAIThinking: boolean = false;
  private lastAIThinkingTime: number = 0;
  private appState: AppState = 'MENU';

  constructor(canvasId: string) {
    this.game = new GomokuGame();
    this.canvasRenderer = new CanvasRenderer(canvasId, this.game.getBoard());
    this.ui = new UIManager();

    this.setupBindings();
    this.setupGameEvents();
    this.initializeAI();
    this.loadAndPopulateModels();

    this.showView('MENU');
  }

  private setupBindings(): void {
    // Menu Actions
    this.ui.bindMenuButtons({
      onPvp: () => this.startGame(GameMode.PLAYER_VS_PLAYER),
      onPva: () => this.startGame(GameMode.PLAYER_VS_AI),
      onLlmPvp: () => this.startGame(GameMode.PLAYER_VS_LLM),
      onAiVsLlm: () => this.startGame(GameMode.AI_VS_LLM),
      onReplay: () => this.startGame(this.currentMode),
      onMenu: () => this.showView('MENU')
    });

    // Game Controls
    this.ui.bindGameControls({
      onReset: () => this.confirmReset(),
      onMenu: () => this.confirmGoToMenu(),
      onSuggest: () => this.showAISuggestion(),
      onRules: () => this.showRulesModal(),
      onSettings: () => this.openSettingsModal()
    });

    // Settings Actions
    this.ui.bindSettingsActions({
      onSave: () => this.saveSettings(),
      onCancel: () => this.ui.hideSettingsModal()
    });

    // Canvas Events
    const canvas = this.canvasRenderer.getCanvas();
    canvas.addEventListener('click', (e) => this.handleClick(e));
    canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
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
    const { apiKey, model } = this.ui.getSettingsValues();
    if (apiKey) localStorage.setItem(LOCAL_STORAGE_API_KEY, apiKey);
    if (model) localStorage.setItem(LOCAL_STORAGE_MODEL, model);
    
    this.ui.hideSettingsModal();
    this.ui.showMessage('✅ Paramètres sauvegardés !');
  }

  private setupGameEvents(): void {
    gameEvents.on('move:made', () => this.redraw());
    gameEvents.on('capture:made', () => this.ui.updateGameInfo(this.game.getCurrentPlayer(), this.game.getBlackCaptures(), this.game.getWhiteCaptures(), this.currentMode));
    gameEvents.on('game:won', (winner) => {
      this.ui.setWinnerMessage(winner);
      this.showView('GAME_OVER');
      this.updateUI(); // Final update
    });
    gameEvents.on('player:changed', () => this.updateUI());
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
        { text: 'Oui', callback: () => this.resetGame(false), className: 'primary' },
        { text: 'Non', callback: () => {} }
    ]);
  }

  private confirmGoToMenu(): void {
    this.ui.showModal('Menu Principal', '<p>Êtes-vous sûr de vouloir quitter la partie et retourner au menu principal ?</p>', [
        { text: 'Oui', callback: () => this.showView('MENU'), className: 'primary' },
        { text: 'Non', callback: () => {} }
    ]);
  }

  private startGame(mode: GameMode): void {
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

    this.currentMode = mode;
    this.resetGame(true);
    this.showView('IN_GAME');

    if (mode === GameMode.AI_VS_LLM) {
      this.triggerAIMove();
    }
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
      this.ui.showMessage(`❌ Mouvement invalide: ${result.reason}`);
      return;
    }
    this.hoverPosition = null;
    this.suggestionPosition = null;

    if (this.game.isGameOver()) return;

    switch (this.currentMode) {
      case GameMode.PLAYER_VS_AI:
        if (this.game.getCurrentPlayer() === this.wasmAI?.getAIPlayer()) {
          this.triggerAIMove();
        }
        break;
      case GameMode.PLAYER_VS_LLM:
        if (this.game.getCurrentPlayer() === Player.WHITE) {
          this.triggerLlmMove();
        }
        break;
      case GameMode.AI_VS_LLM:
        if (this.game.getCurrentPlayer() === this.wasmAI?.getAIPlayer()) {
          this.triggerAIMove();
        } else {
          this.triggerLlmMove();
        }
        break;
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
    if (this.isAIThinking || !this.wasmAI) return;
    this.isAIThinking = true;
    this.ui.startThinkingTimer();
    this.updateUI();

    try {
        await this.wasmAI.updateGameState(this.game.getGameState());
        
        const startTime = performance.now();
        const aiMove = await this.wasmAI.getBestMove();
        const endTime = performance.now();
        this.lastAIThinkingTime = (endTime - startTime) / 1000;

        if (aiMove && this.game.getBoard().isValidMove(aiMove.row, aiMove.col)) {
            this.makeMove(aiMove.row, aiMove.col);
        } else {
            this.ui.showMessage("❌ L'IA a retourné un coup invalide.");
        }
    } catch (error) {
        this.ui.showMessage(`❌ Erreur IA C++: ${error}`);
    } finally {
        await this.ui.stopThinkingTimer(this.lastAIThinkingTime);
        this.isAIThinking = false;
        this.updateUI();
    }
  }

  private async triggerLlmMove(): Promise<void> {
    if (this.isAIThinking) return;
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

      const endTime = performance.now();
      this.lastAIThinkingTime = (endTime - startTime) / 1000;

      const llmMove = result.position;
      this.ui.setReasoning(result.reasoning || "Aucun raisonnement disponible.");

      if (llmMove && this.game.getBoard().isValidMove(llmMove.row, llmMove.col)) {
        await new Promise(resolve => setTimeout(resolve, 300));
        this.makeMove(llmMove.row, llmMove.col);
      } else {
        throw new Error("L'IA a renvoyé un coup invalide.");
      }

    } catch (error) {
      this.ui.showMessage(`❌ Erreur IA LLM: ${error}`);
    } finally {
      await this.ui.stopThinkingTimer(this.lastAIThinkingTime);
      this.isAIThinking = false;
      this.updateUI();
    }
  }

  private async showAISuggestion(): Promise<void> {
    if (this.isAIThinking || !this.wasmAI) return;
    this.isAIThinking = true;
    this.ui.startThinkingTimer();
    this.updateUI();

    try {
        await this.wasmAI.updateGameState(this.game.getGameState());
        const startTime = performance.now();
        const suggestion = await this.wasmAI.getBestMove();
        const endTime = performance.now();
        this.lastAIThinkingTime = (endTime - startTime) / 1000;

        if (suggestion) {
            this.suggestionPosition = suggestion;
            this.redraw();
            setTimeout(() => {
                this.suggestionPosition = null;
                this.redraw();
            }, 3000);
        }
    } catch (error) {
        this.ui.showMessage(`❌ Erreur suggestion: ${error}`);
    } finally {
        await this.ui.stopThinkingTimer(this.lastAIThinkingTime);
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
    this.llmAI = null;

    if (this.currentMode === GameMode.PLAYER_VS_AI) {
      this.wasmAI?.initAI(Player.WHITE);
    } else if (this.currentMode === GameMode.AI_VS_LLM) {
      this.wasmAI?.initAI(Player.BLACK);
    } else {
      this.wasmAI?.initAI(Player.WHITE);
    }

    if (!isNewGame) emitGameReset();
    
    this.ui.setReasoning("En attente...");
    this.redraw();
    this.updateUI();
    this.ui.clearMessage();
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
    this.ui.updateGameInfo(
        this.game.getCurrentPlayer(), 
        this.game.getBlackCaptures(), 
        this.game.getWhiteCaptures(), 
        this.currentMode
    );
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
