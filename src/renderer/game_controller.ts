import { Player, Position, GameMode } from '../core/types.js';
import { GomokuGame } from '../core/game.js';
import { ThreeRenderer } from '../ui/three_renderer.js';
import { gameEvents, emitGameReset } from '../core/events.js';
import { createWasmAI, WasmAI } from '../wasm/ai_wrapper.js';
import { LlmAI } from '../llm/llm_ai.js';
import { UIManager, AppState } from './ui_manager.js';
import { SoundManager } from './sound_manager.js';
import { LeaderboardManager } from './leaderboard_manager.js';

// --- CONFIGURATION & TYPES ---

interface GameConfig {
  color?: Player;
  modelId?: string;
}

const LOCAL_STORAGE_API_KEY = 'gomoku-llm-api-key';
const LOCAL_STORAGE_MODEL = 'gomoku-llm-model';

// Extension de l'interface Window pour le débogage dans la console
declare global {
  interface Window {
    gameController: GameController;
  }
}

type ActorType = 'HUMAN' | 'AI_WASM' | 'AI_LLM';

class GameController {
  // ==================================================================================
  // 1. ÉTAT & COMPOSANTS
  // ==================================================================================

  // --- Composants MVC ---
  private game: GomokuGame;
  private renderer!: ThreeRenderer;
  private ui: UIManager;
  private soundManager!: SoundManager;

  // --- Configuration de la Partie ---
  private currentMode: GameMode = GameMode.PLAYER_VS_PLAYER;
  private lastGameConfig: GameConfig = {}; // Mémorisé pour le bouton "Rejouer"
  
  private players: { [key in Player]: ActorType } = {
    [Player.BLACK]: 'HUMAN',
    [Player.WHITE]: 'HUMAN',
    [Player.NONE]: 'HUMAN' // Fallback
  };

  // --- État Visuel ---
  private hoverPosition: Position | null = null;      // Ombre sous la souris
  private suggestionPosition: Position | null = null; // Anneau vert (Conseil IA)
  private appState: AppState = 'MENU';                // Vue actuelle (Menu, Jeu, Fin)

  // --- Cerveau IA (Asynchrone) ---
  private wasmAI: WasmAI | null = null;
  private llmAI: LlmAI | null = null;
  
  // MUTEX : Empêche toute interaction (clic, reset) pendant que l'IA calcule
  private isAIThinking: boolean = false; 
  private isProcessingMove: boolean = false;
  private lastAIThinkingTime: number = 0;
  
  // Moyenne IA
  private aiTotalThinkingTime: number = 0;
  private aiMoveCount: number = 0;

  // --- Chrono & Classement ---
  private blackTimeTotal: number = 0;
  private whiteTimeTotal: number = 0;
  private turnStartTime: number = 0;
  private gameTimerInterval: ReturnType<typeof setInterval> | null = null;
  
  // Sécurité pour mode classement
  private isRanked: boolean = true; 

  // ==================================================================================
  // 2. INITIALISATION (SETUP)
  // ==================================================================================

  constructor(_containerId: string) {
    this.game = new GomokuGame();
    this.ui = new UIManager();
    this.soundManager = new SoundManager();

    this.setupBindings();
    this.setupGameEvents();
    this.initializeAI();
    this.loadAndPopulateModels();

    this.showView('MENU');
  }

  private initRenderer(containerId: string): void {
    if (this.renderer) return; // Singleton

    this.renderer = new ThreeRenderer(containerId, this.game.getBoard());

    const canvas = this.renderer.getCanvas();
    canvas.addEventListener('click', (e: MouseEvent) => this.handleClick(e));
    canvas.addEventListener('mousemove', (e: MouseEvent) => this.handleMouseMove(e));
    canvas.addEventListener('mouseleave', (_e: MouseEvent) => this.handleMouseLeave());
    
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
    // Menu Principal
    this.ui.bindMenuButtons({
      onPvp: () => this.initiateGameStart(GameMode.PLAYER_VS_PLAYER),
      onPva: () => this.initiateGameStart(GameMode.PLAYER_VS_AI),
      onLlmPvp: () => this.initiateGameStart(GameMode.PLAYER_VS_LLM),
      onAiVsLlm: () => this.initiateGameStart(GameMode.AI_VS_LLM),
      onReplay: () => this.startGame(this.currentMode, this.lastGameConfig),
      onMenu: () => this.showView('MENU'),
      onSettings: () => this.openSettingsModal()
    });

    // Contrôles In-Game
    this.ui.bindGameControls({
      onReset: () => this.confirmReset(),
      onSuggest: () => this.showAISuggestion(),
      onHistory: (action) => this.handleHistoryAction(action)
    });

    // Header & Modales
    this.ui.bindHeaderControls({
      onHome: () => this.confirmGoToMenu(),
      onRules: () => this.showRulesModal(),
      onSettings: () => this.openSettingsModal()
    });

    this.ui.bindSettingsActions({
      onSave: () => this.saveSettings(),
      onCancel: () => this.ui.hideSettingsModal()
    });

    // Toggle Debug
    this.ui.bindDebugToggle(async (enabled) => {
        if (enabled) {
            if (this.wasmAI && this.renderer) {
                try {
                    const debugData = await this.wasmAI.getDebugData();
                    if (debugData.length > 0) {
                        this.renderer.drawHeatmap(debugData);
                    }
                } catch (error) {
                    console.warn("Impossible de récupérer les données de debug", error);
                }
            }
        } else {
            this.renderer?.clearHeatmap();
        }
    });
  }

  private setupGameEvents(): void {
    gameEvents.on('move:made', (move) => {
        this.ui.clearMessage();
        this.redraw();
        this.soundManager.playStoneDrop();
    });

    gameEvents.on('capture:made', () => {
      this.updateUI();
      this.soundManager.playCapture();
    });

    gameEvents.on('game:draw', () => {
      this.stopGlobalTimer();
      this.ui.setWinnerMessage(Player.NONE);
      this.showView('GAME_OVER');
      this.updateUI();
      this.soundManager.playWin(false);
    });

    gameEvents.on('game:won', async (winner) => {
      this.stopGlobalTimer();
      
      // Tentative de détection de la ligne gagnante (UI)
      const lastMove = this.game.getLastMove();
      let isLineWin = false;
      
      if (lastMove) {
          const line = this.findWinningLine(lastMove, winner);
          if (line && this.renderer) {
              this.renderer.drawWinningLine(line.start, line.end, winner);
              isLineWin = true;
          }
      }

      // Si ce n'est pas une ligne, c'est une victoire par Capture -> Animation HUD
      if (!isLineWin) {
          const blackScore = this.game.getBlackCaptures();
          const whiteScore = this.game.getWhiteCaptures();
          
          if ((winner === Player.BLACK && blackScore >= 10) || 
              (winner === Player.WHITE && whiteScore >= 10)) {
              this.ui.triggerCaptureWinEffect(winner);
          }
      }

      let isVictory = true;
      const humanColor = this.lastGameConfig.color || Player.BLACK;
      if (this.currentMode === GameMode.PLAYER_VS_AI || this.currentMode === GameMode.PLAYER_VS_LLM) {
          isVictory = (winner === humanColor);
      }
      this.soundManager.playWin(isVictory);

      await new Promise(resolve => setTimeout(resolve, 2000));

      this.ui.setWinnerMessage(winner);
      this.showView('GAME_OVER');
      this.updateUI(); 
      
      // --- LOGIQUE DU LEADERBOARD ---
      if (this.currentMode === GameMode.PLAYER_VS_AI || this.currentMode === GameMode.PLAYER_VS_LLM) {
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
      
    });

    gameEvents.on('player:changed', () => {
      this.startGlobalTimer();
      this.updateUI();
    });
  }

  // ==================================================================================
  // 3. BOUCLE DE JEU (GAME LOOP)
  // ==================================================================================

  private initiateGameStart(mode: GameMode): void {
    if (mode === GameMode.PLAYER_VS_PLAYER) {
      this.startGame(mode, { color: Player.BLACK });
      return;
    }

    if (mode === GameMode.PLAYER_VS_LLM || mode === GameMode.AI_VS_LLM) {
      const apiKey = localStorage.getItem(LOCAL_STORAGE_API_KEY);
      if (!apiKey || apiKey.trim() === '') {
        this.ui.showModal(
          'Clé API requise',
          '<p>Configurez votre clé API OpenRouter dans les paramètres.</p>',
          [{ text: 'Ouvrir Paramètres', callback: () => this.openSettingsModal(), className: 'primary' }]
        );
        return;
      }
    }

    this.ui.showSetupModal(mode, (config) => {
        this.startGame(mode, config);
    }, () => {});
  }

  private startGame(mode: GameMode, config: GameConfig): void {
    this.currentMode = mode;
    this.lastGameConfig = config;

    this.showView('IN_GAME');
    this.initRenderer('boardContainer');
    
    // Force le redimensionnement pour éviter le bug de taille 0
    const container = document.getElementById('boardContainer');
    if (container && this.renderer) {
      this.renderer.resize(container.clientWidth, container.clientHeight);
    }

    const userColor = config.color || Player.BLACK;
    const opponentColor = userColor === Player.BLACK ? Player.WHITE : Player.BLACK;

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
            this.players[Player.BLACK] = 'AI_WASM';
            this.players[Player.WHITE] = 'AI_LLM';
            break;
    }
    if (config.modelId) {
        localStorage.setItem(LOCAL_STORAGE_MODEL, config.modelId as string);
    }

    this.resetGame(true, config);
    this.startGlobalTimer();
    this.handleTurnStart();
  }

  private async handleClick(e: MouseEvent): Promise<void> {
    // Sécurité globale
    if (this.appState !== 'IN_GAME' || this.game.isGameOver() || this.isAIThinking || this.isProcessingMove) return;

    // Sécurité de Tour
    const currentPlayer = this.game.getCurrentPlayer();
    if (this.players[currentPlayer] !== 'HUMAN') return;

    // Conversion Pixels
    const pos = this.canvasToBoard(e.clientX, e.clientY);
    if (pos) {
        this.renderer?.clearHeatmap();
        await this.makeMove(pos.row, pos.col);
    }
  }

  private async makeMove(row: number, col: number): Promise<void> {
    if (this.isProcessingMove) return;
    this.isProcessingMove = true;

    try {
        // Calcul du temps
        const now = performance.now();
        const deltaSeconds = (now - this.turnStartTime) / 1000;
        
        let currentBlackTime = this.blackTimeTotal;
        let currentWhiteTime = this.whiteTimeTotal;
        
        if (this.game.getCurrentPlayer() === Player.BLACK) {
            currentBlackTime += deltaSeconds;
        } else {
            currentWhiteTime += deltaSeconds;
        }

        const result = await this.game.makeMove(row, col, currentBlackTime, currentWhiteTime);
        
        if (!result.isValid) {
          if (result.reason === 'Case occupée') {
            return;
          }
          this.ui.showMessage(`Mouvement invalide: ${result.reason}`, 'warning');
          return;
        }
        
        this.hoverPosition = null;
        this.suggestionPosition = null;

        if (!this.game.isGameOver()) {
            this.handleTurnStart();
        }
    } finally {
        this.isProcessingMove = false;
    }
  }

  private handleTurnStart(): void {
    const currentPlayer = this.game.getCurrentPlayer();
    const actor = this.players[currentPlayer];

    if (actor === 'AI_WASM') {
        requestAnimationFrame(() => {
            setTimeout(() => this.triggerAIMove(), 50);
        });
    } else if (actor === 'AI_LLM') {
        requestAnimationFrame(() => {
            setTimeout(() => this.triggerLlmMove(), 50);
        });
    } 
  }

  // ==================================================================================
  // 4. ORCHESTRATION DES IA
  // ==================================================================================

  private async initializeAI(): Promise<void> {
    try {
      this.wasmAI = await createWasmAI();
      this.game.setAI(this.wasmAI);
      console.log('WebAssembly AI initialisée avec succès.');
    } catch (error) {
      console.error('Erreur lors de l\'initialisation de l\'IA WebAssembly :', error);
      this.ui.showMessage("Erreur critique: IA Native (WASM) indisponible.", 'error');
    }
  }

  private async triggerAIMove(): Promise<void> {
    if (this.isAIThinking || !this.wasmAI) return;

    const turnGameId = this.game.getGameId();

    this.isAIThinking = true;
    this.ui.startThinkingTimer();
    this.updateUI();

    try {
        if (this.game.getGameId() !== turnGameId) return;

        const startTime = performance.now();
        
        const aiMove = await this.wasmAI.getBestMove(this.game.getGameState());
        
        const endTime = performance.now();
        this.lastAIThinkingTime = (endTime - startTime) / 1000;

        this.aiTotalThinkingTime += this.lastAIThinkingTime;
        this.aiMoveCount++;
        const avgTime = this.aiTotalThinkingTime / this.aiMoveCount;

        if (this.game.getGameId() !== turnGameId) return;

        if (aiMove && this.game.getBoard().isCellEmpty(aiMove.row, aiMove.col)) {
            this.makeMove(aiMove.row, aiMove.col);
            
            // --- DEBUG / HEATMAP ---
            if (this.ui.isDebugEnabled()) {
                const debugData = await this.wasmAI.getDebugData();
                if (this.renderer && debugData.length > 0) {
                    this.renderer.drawHeatmap(debugData);
                }
            }
        } else {
            this.ui.showMessage("L'IA a retourné un coup invalide.", 'error');
        }
    } catch (error) {
        if (this.game.getGameId() === turnGameId) {
            this.ui.showMessage(`Erreur IA C++: ${error}`, 'error');
        }
    } finally {
        if (this.game.getGameId() === turnGameId) {
            const avgTime = this.aiMoveCount > 0 ? this.aiTotalThinkingTime / this.aiMoveCount : 0;
            await this.ui.stopThinkingTimer(this.lastAIThinkingTime, avgTime);
            this.isAIThinking = false;
            this.updateUI();
        }
    }
  }

  private async triggerLlmMove(): Promise<void> {
    if (this.isAIThinking) return;

    const turnGameId = this.game.getGameId();

    this.isAIThinking = true;
    this.ui.startThinkingTimer();
    this.updateUI();

    try {
      const apiKey = localStorage.getItem(LOCAL_STORAGE_API_KEY);
      const model = localStorage.getItem(LOCAL_STORAGE_MODEL);
      if (!apiKey || !model) throw new Error("Clé API ou Modèle LLM non configuré.");

      this.llmAI = new LlmAI(apiKey, model);
      const startTime = performance.now();
      
      const result = await this.llmAI.getBestMove(
        this.game.getGameState(),
        async (row, col) => await this.game.validateMove(row, col)
      );

      if (this.game.getGameId() !== turnGameId) return;

      const endTime = performance.now();
      this.lastAIThinkingTime = (endTime - startTime) / 1000;

      this.aiTotalThinkingTime += this.lastAIThinkingTime;
      this.aiMoveCount++;

      const llmMove = result.position;
      this.ui.setReasoning(result.reasoning || "Aucun raisonnement disponible.");

      if (llmMove && this.game.getBoard().isCellEmpty(llmMove.row, llmMove.col)) {
        await new Promise(resolve => setTimeout(resolve, 300));
        
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
          const avgTime = this.aiMoveCount > 0 ? this.aiTotalThinkingTime / this.aiMoveCount : 0;
          await this.ui.stopThinkingTimer(this.lastAIThinkingTime, avgTime);
          this.isAIThinking = false;
          this.updateUI();
      }
    }
  }

  private async showAISuggestion(): Promise<void> {
    if (this.isAIThinking || !this.wasmAI) return;
    
    if (this.players[this.game.getCurrentPlayer()] !== 'HUMAN') return;

    const turnGameId = this.game.getGameId();

    this.isAIThinking = true;
    this.ui.startThinkingTimer();
    this.updateUI();

    try {
        const startTime = performance.now();
        const suggestion = await this.wasmAI.getBestMove(this.game.getGameState());
        const endTime = performance.now();
        this.lastAIThinkingTime = (endTime - startTime) / 1000;

        if (this.game.getGameId() !== turnGameId) return;

        if (suggestion) {
            this.suggestionPosition = suggestion;
            this.redraw();
            
            // Efface la suggestion après 3 secondes
            setTimeout(() => {
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

  // ==================================================================================
  // 5. OUTILS & UTILITAIRES
  // ==================================================================================

  private resetGame(isNewGame: boolean, config: GameConfig = {}): void {
    this.game.reset();
    this.showView('IN_GAME');
    
    // Reset états visuels
    this.hoverPosition = null;
    this.suggestionPosition = null;
    this.isAIThinking = false;
    this.lastAIThinkingTime = 0;
    this.aiTotalThinkingTime = 0;
    this.aiMoveCount = 0;
    this.llmAI = null;
    
    // Réactivation du mode Classé
    this.isRanked = true;
    this.ui.setRankedStatus(true);

    let wasmIdentity = Player.WHITE;
    if (this.players[Player.BLACK] === 'AI_WASM') wasmIdentity = Player.BLACK;
    else if (this.players[Player.WHITE] === 'AI_WASM') wasmIdentity = Player.WHITE;
    else {
        const userColor = config.color || Player.BLACK;
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
    this.renderer?.clearWinningLine(); // Nettoyage du laser
    this.renderer?.clearHeatmap();     // Nettoyage heatmap
    this.ui.resetCaptureWinEffect();   // Nettoyage du néon capture
    this.redraw();
    this.updateUI();
    this.ui.clearMessage();
  }

  private startGlobalTimer(): void {
    this.stopGlobalTimer();
    this.turnStartTime = performance.now();
    
    this.gameTimerInterval = setInterval(() => {
        const now = performance.now();
        const deltaSeconds = (now - this.turnStartTime) / 1000;
        this.turnStartTime = now; 

        if (this.game.getCurrentPlayer() === Player.BLACK) {
            this.blackTimeTotal += deltaSeconds;
        } else {
            this.whiteTimeTotal += deltaSeconds;
        }
        
        this.updateUI();
    }, 100);
  }

  private stopGlobalTimer(): void {
    if (this.gameTimerInterval) {
        clearInterval(this.gameTimerInterval);
        this.gameTimerInterval = null;
    }
  }

  private async handleHistoryAction(action: 'START' | 'PREV' | 'NEXT' | 'END'): Promise<void> {
    if (this.isProcessingMove) return;
    this.isProcessingMove = true;
    
    this.renderer?.clearWinningLine();
    this.renderer?.clearHeatmap();

    try {
        const current = this.game.getCurrentMoveIndex();
        const total = this.game.getTotalMoves();
        
        // Si on recule, on passe en mode non classé
        if ((action === 'START' && current > 0) || (action === 'PREV' && current > 0)) {
            if (this.isRanked && this.currentMode === GameMode.PLAYER_VS_AI) {
                this.isRanked = false;
                this.ui.setRankedStatus(false);
                this.ui.showMessage("Mode Replay : Classement désactivé.", 'warning');
            }
        }

        switch (action) {
            case 'START': await this.game.jumpTo(0); break;
            case 'PREV': if (current > 0) await this.game.jumpTo(current - 1); break;
            case 'NEXT': if (current < total) await this.game.jumpTo(current + 1); break;
            case 'END': await this.game.jumpTo(total); break;
        }
        
        const newCurrent = this.game.getCurrentMoveIndex();
        if (newCurrent === 0) {
            this.blackTimeTotal = 0;
            this.whiteTimeTotal = 0;
        } else {
            const history = this.game.getMoveHistory();
            const lastMove = history[newCurrent - 1];
            if (lastMove) {
                this.blackTimeTotal = lastMove.blackTime;
                this.whiteTimeTotal = lastMove.whiteTime;
            }
        }
        
        this.turnStartTime = performance.now();

        if (!this.game.isGameOver()) {
            this.showView('IN_GAME');
        }
        
        this.redraw();
    } finally {
        this.isProcessingMove = false;
    }
  }

  // ==================================================================================
  // 6. GESTION DE L'AFFICHAGE & INPUTS (HELPERS UI)
  // ==================================================================================


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
    this.ui.updateHistoryControls(
        this.game.getCurrentMoveIndex(),
        this.game.getTotalMoves()
    );
  }

  private handleMouseMove(e: MouseEvent): void {
    if (this.appState !== 'IN_GAME' || this.game.isGameOver()) return;
    
    const pos = this.canvasToBoard(e.clientX, e.clientY);
    
    this.hoverPosition = (pos && this.game.getBoard().isCellEmpty(pos.row, pos.col)) ? pos : null;
    
    this.redraw();
  }

  private handleMouseLeave(): void {
    this.hoverPosition = null;
    this.redraw();
  }

  private canvasToBoard(x: number, y: number): Position | null {
    if (!this.renderer) return null;
    return this.renderer.canvasToBoard(x, y);
  }

  private showView(view: AppState): void {
    this.appState = view;
    this.ui.showView(view);
  }

  private async loadAndPopulateModels(): Promise<void> {
    try {
      const response = await fetch('./openrouter_models.json');
      if (!response.ok) throw new Error('Erreur de chargement des modèles LLM.');
      const models = await response.json();
      this.ui.populateModels(models);
    } catch (error) {
      console.error('Erreur lors du chargement des modèles LLM :', error);
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

  private showRulesModal(): void {
    const rulesHTML = `
      <ul>
        <li><b>Victoire par Alignement :</b> Le premier joueur à aligner 5 pierres...</li>
        <li><b>Victoire par Capture :</b> Capturez 10 pierres adverses...</li>
        <li><b>Double-Trois Interdit :</b> Il est interdit de jouer un coup...</li>
      </ul>`;
    this.ui.showModal('Règles du Gomoku', rulesHTML, [{ text: 'Fermer', callback: () => {} }]);
  }

  private confirmReset(): void {
    this.ui.showModal('Recommencer', '<p>Êtes-vous sûr de vouloir recommencer ?</p>', [
        { text: 'Oui', callback: () => this.resetGame(false, this.lastGameConfig), className: 'primary' },
        { text: 'Non', callback: () => {} }
    ]);
  }

  private confirmGoToMenu(): void {
    this.ui.showModal('Menu Principal', '<p>Quitter la partie en cours ?</p>', [
        { text: 'Oui', callback: () => this.showView('MENU'), className: 'primary' },
        { text: 'Non', callback: () => {} }
    ]);
  }

  private findWinningLine(center: Position, player: Player): { start: Position, end: Position } | null {
    const board = this.game.getBoard();
    const directions = [
        { dr: 0, dc: 1 },  // Horizontal
        { dr: 1, dc: 0 },  // Vertical
        { dr: 1, dc: 1 },  // Diagonale \
        { dr: 1, dc: -1 }  // Diagonale /
    ];

    // --- 1. Vérification Rapide Autour du Dernier Coup ---
    if (board.getPiece(center.row, center.col) === player) {
        for (const { dr, dc } of directions) {
            let rStart = center.row;
            let cStart = center.col;
            while (board.getPiece(rStart - dr, cStart - dc) === player) {
                rStart -= dr;
                cStart -= dc;
            }

            let rEnd = center.row;
            let cEnd = center.col;
            while (board.getPiece(rEnd + dr, cEnd + dc) === player) {
                rEnd += dr;
                cEnd += dc;
            }

            const steps = Math.max(Math.abs(rEnd - rStart), Math.abs(cEnd - cStart)) + 1;
            
            if (steps >= 5) {
                return { start: { row: rStart, col: cStart }, end: { row: rEnd, col: cEnd } };
            }
        }
    }

    // --- 2. Fallback : Scan Complet (Victoire à retardement) ---
    // Si le dernier coup n'est pas le gagnant, ou ne complète pas la ligne, on cherche partout
    const size = board.getSize();
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (board.getPiece(r, c) !== player) continue;

            for (const { dr, dc } of directions) {
                let k = 1;
                while (k < 5 && board.getPiece(r + k * dr, c + k * dc) === player) {
                    k++;
                }

                if (k >= 5) {
                    return {
                        start: { row: r, col: c },
                        end: { row: r + (k - 1) * dr, col: c + (k - 1) * dc }
                    };
                }
            }
        }
    }

    return null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    const gameController = new GameController('boardContainer');
    window.gameController = gameController;
  } catch (error) {
    console.error('Échec de l\'initialisation du jeu :', error);
  }
});