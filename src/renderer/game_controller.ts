// @src/renderer/game_controller.ts

/**
 * Game Controller - Le Chef d'Orchestre (MVC)
 * 
 * Rôle :
 * 1. Fait le lien entre le Modèle (GomokuGame), la Vue (ThreeRenderer/DOM) et les IA.
 * 2. Gère le flux de la partie (Tour par tour, Timers).
 * 3. Orchestre les appels asynchrones aux IA (Wasm & LLM) sans bloquer l'interface.
 * 
 * Note : Ce fichier ne contient aucune règle de jeu (voir game.ts) ni aucun code de dessin 3D (voir three_renderer.ts).
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

// Définit qui contrôle une couleur donnée
type ActorType = 'HUMAN' | 'AI_WASM' | 'AI_LLM';

class GameController {
  // ==================================================================================
  // 1. ÉTAT & COMPOSANTS (STATE)
  // ==================================================================================

  // --- Composants MVC ---
  private game: GomokuGame;            // Le Modèle (Règles & Données)
  private renderer!: ThreeRenderer;    // La Vue 3D (Initialisée tardivement)
  private ui: UIManager;               // La Vue 2D (HTML/CSS)
  private soundManager!: SoundManager; // Le Gestionnaire Audio

  // --- Configuration de la Partie ---
  private currentMode: GameMode = GameMode.PLAYER_VS_PLAYER;
  private lastGameConfig: GameConfig = {}; // Mémorisé pour le bouton "Rejouer"
  
  // Table de routage : Pour chaque couleur, qui joue ?
  // Ex: { BLACK: 'HUMAN', WHITE: 'AI_WASM' }
  private players: { [key in Player]: ActorType } = {
    [Player.BLACK]: 'HUMAN',
    [Player.WHITE]: 'HUMAN',
    [Player.NONE]: 'HUMAN' // Fallback technique
  };

  // --- État Visuel ---
  private hoverPosition: Position | null = null;      // Fantôme sous la souris
  private suggestionPosition: Position | null = null; // Anneau vert (Conseil IA)
  private appState: AppState = 'MENU';                // Vue actuelle (Menu, Jeu, Fin)

  // --- Cerveau IA (Asynchrone) ---
  private wasmAI: WasmAI | null = null;
  private llmAI: LlmAI | null = null;
  
  // MUTEX CRITIQUE : Empêche toute interaction (clic, reset) pendant que l'IA calcule.
  private isAIThinking: boolean = false; 
  private isProcessingMove: boolean = false; // Verrouillage pendant la validation Wasm
  private lastAIThinkingTime: number = 0;

  // --- Chronométrie & Classement ---
  private blackTimeTotal: number = 0; // Cumul secondes Noir
  private whiteTimeTotal: number = 0; // Cumul secondes Blanc
  private turnStartTime: number = 0;  // Timestamp début du tour
  private gameTimerInterval: ReturnType<typeof setInterval> | null = null; // Intervalle du chrono global
  
  // Sécurité Anti-Triche : Passe à false si on utilise l'historique ("Replay")
  private isRanked: boolean = true; 

  // ==================================================================================
  // 2. INITIALISATION (SETUP)
  // ==================================================================================

  constructor(_containerId: string) {
    // Instanciation des sous-systèmes
    this.game = new GomokuGame();
    this.ui = new UIManager();
    this.soundManager = new SoundManager();
    
    // Note : Le Renderer 3D n'est pas créé ici car le conteneur est encore caché (display:none).
    // Il sera créé dans initRenderer() au moment du startGame.

    this.setupBindings();       // Câblage des boutons HTML
    this.setupGameEvents();     // Écoute des événements du Modèle
    this.initializeAI();        // Préchauffage du Wasm (peut être long)
    this.loadAndPopulateModels(); // Récupération des modèles LLM

    this.showView('MENU');
  }

  /**
   * Initialise la 3D une fois que le conteneur est visible.
   * Gère aussi les événements souris "bruts" sur le Canvas.
   */
  private initRenderer(containerId: string): void {
    if (this.renderer) return; // Singleton : on ne le crée qu'une fois

    this.renderer = new ThreeRenderer(containerId, this.game.getBoard());

    // Liaison Input Physique -> Logique
    const canvas = this.renderer.getCanvas();
    canvas.addEventListener('click', (e: MouseEvent) => this.handleClick(e));
    canvas.addEventListener('mousemove', (e: MouseEvent) => this.handleMouseMove(e));
    canvas.addEventListener('mouseleave', (_e: MouseEvent) => this.handleMouseLeave());
      
    // Gestion Responsive
    window.addEventListener('resize', () => {
      if (this.renderer && this.appState === 'IN_GAME') {
        const container = document.getElementById(containerId);
        if (container) {
          this.renderer.resize(container.clientWidth, container.clientHeight);
        }
      }
    });
  }

  /**
   * Relie les actions de l'UI (clics boutons) aux méthodes du Contrôleur.
   */
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
  }

  /**
   * C'est ici que le Contrôleur "écoute" le Modèle.
   * Pattern Observer : Le Modèle change -> Événement -> Mise à jour Vue.
   */
  private setupGameEvents(): void {
    // 1. Un coup a été validé
    gameEvents.on('move:made', (move) => {
        this.redraw(); // Met à jour la 3D
        this.soundManager.playStoneDrop(); // Son "Clack"
    });

    // 2. Une capture a eu lieu
    gameEvents.on('capture:made', () => {
      this.updateUI(); // Met à jour le score HTML
      this.soundManager.playCapture(); // Son "Tchick"
    });

    // 3. Fin de partie (Victoire)
    gameEvents.on('game:won', (winner) => {
      this.stopGlobalTimer(); // Arrêt immédiat du chrono
      this.ui.setWinnerMessage(winner);
      this.showView('GAME_OVER');
      this.updateUI(); 
      
      // --- LOGIQUE DU LEADERBOARD ---
      // On enregistre le score uniquement si :
      // - C'est une victoire Humaine
      // - Contre l'IA C++ (Le vrai challenge)
      // - En mode Classé (Pas de retour en arrière utilisé)
      let isVictory = true;
      const humanColor = this.lastGameConfig.color || Player.BLACK;
      
      if (this.currentMode === GameMode.PLAYER_VS_AI || this.currentMode === GameMode.PLAYER_VS_LLM) {
          isVictory = (winner === humanColor);

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

    // 4. Changement de tour
    gameEvents.on('player:changed', () => {
      // On bascule le chronomètre sur le nouveau joueur
      this.startGlobalTimer();
      this.updateUI();
    });
  }

  // ==================================================================================
  // 3. BOUCLE DE JEU (GAME LOOP)
  // ==================================================================================

  /**
   * Point d'entrée pour démarrer une partie.
   * Gère le cas "Setup nécessaire" (IA) vs "Démarrage immédiat" (PvP).
   */
  private initiateGameStart(mode: GameMode): void {
    // Fast Track pour le PvP local
    if (mode === GameMode.PLAYER_VS_PLAYER) {
      this.startGame(mode, { color: Player.BLACK });
      return;
    }

    // Vérification Pré-requis LLM
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

    // Affiche la modale de configuration (Couleur, Modèle...)
    this.ui.showSetupModal(mode, (config) => {
        this.startGame(mode, config);
    }, () => {});
  }

  /**
   * Configure et lance physiquement la partie.
   */
  private startGame(mode: GameMode, config: GameConfig): void {
    this.currentMode = mode;
    this.lastGameConfig = config;

    // Prépare l'affichage
    this.showView('IN_GAME');
    this.initRenderer('boardContainer');
    
    // Force le redimensionnement pour éviter le bug de taille 0
    const container = document.getElementById('boardContainer');
    if (container && this.renderer) {
      this.renderer.resize(container.clientWidth, container.clientHeight);
    }

    // CONFIGURATION DES ACTEURS (Qui joue quoi ?)
    const userColor = config.color || Player.BLACK;
    const opponentColor = userColor === Player.BLACK ? Player.WHITE : Player.BLACK;

    // Reset par défaut
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

    // Sauvegarde du modèle choisi
    if (config.modelId) {
        localStorage.setItem(LOCAL_STORAGE_MODEL, config.modelId as string);
    }

    // Reset complet et lancement
    this.resetGame(true, config);
    this.startGlobalTimer();
    this.handleTurnStart(); // Déclenche le premier tour (Important si l'IA est Noir)
  }

  /**
   * Gestion du Clic Souris (Input Humain).
   * Agit comme un gardien : vérifie si l'humain a le droit de jouer.
   */
  private async handleClick(e: MouseEvent): Promise<void> {
    // Sécurité globale (Jeu en cours, IA ne réfléchit pas, Traitement en cours)
    if (this.appState !== 'IN_GAME' || this.game.isGameOver() || this.isAIThinking || this.isProcessingMove) return;

    // Sécurité de Tour : Est-ce à l'humain de jouer ?
    const currentPlayer = this.game.getCurrentPlayer();
    if (this.players[currentPlayer] !== 'HUMAN') return;

    // Conversion Pixels -> Case du plateau
    const pos = this.canvasToBoard(e.clientX, e.clientY);
    if (pos) await this.makeMove(pos.row, pos.col);
  }

  /**
   * Exécute un coup (Humain ou IA).
   * ASYNC : Attend la validation du moteur Wasm.
   */
  private async makeMove(row: number, col: number): Promise<void> {
    if (this.isProcessingMove) return;
    this.isProcessingMove = true;

    try {
        // Calcul précis du temps écoulé pour ce coup
        const now = performance.now();
        const deltaSeconds = (now - this.turnStartTime) / 1000;
        
        let currentBlackTime = this.blackTimeTotal;
        let currentWhiteTime = this.whiteTimeTotal;
        
        if (this.game.getCurrentPlayer() === Player.BLACK) {
            currentBlackTime += deltaSeconds;
        } else {
            currentWhiteTime += deltaSeconds;
        }

        // APPEL AU MODÈLE (Async)
        const result = await this.game.makeMove(row, col, currentBlackTime, currentWhiteTime);
        
        // Si coup invalide (règle violée)
        if (!result.isValid) {
          this.ui.showMessage(`Mouvement invalide: ${result.reason}`, 'warning');
          return;
        }
        
        // Nettoyage visuel post-coup
        this.hoverPosition = null;
        this.suggestionPosition = null;

        // Si la partie continue, on passe la main au joueur suivant
        if (!this.game.isGameOver()) {
            this.handleTurnStart();
        }
    } finally {
        this.isProcessingMove = false;
    }
  }

  /**
   * Le Dispatcher : Décide qui doit jouer maintenant.
   * Appelé après chaque coup ou au début de la partie.
   */
  private handleTurnStart(): void {
    const currentPlayer = this.game.getCurrentPlayer();
    const actor = this.players[currentPlayer];

    // On utilise requestAnimationFrame pour laisser le temps au navigateur
    // de dessiner le dernier coup avant de lancer un calcul lourd (IA).
    if (actor === 'AI_WASM') {
        requestAnimationFrame(() => {
            setTimeout(() => this.triggerAIMove(), 50);
        });
    } else if (actor === 'AI_LLM') {
        requestAnimationFrame(() => {
            setTimeout(() => this.triggerLlmMove(), 50);
        });
    } 
    // Si actor === 'HUMAN', on ne fait rien, on attend le handleClick.
  }

  // ==================================================================================
  // 4. ORCHESTRATION DES IA (THE BRAIN)
  // ==================================================================================

  /**
   * Initialise le module WebAssembly (Wasm).
   */
  private async initializeAI(): Promise<void> {
    try {
      this.wasmAI = await createWasmAI();
      this.game.setAI(this.wasmAI); // Inject AI into Game Rule Engine
      console.log('WebAssembly AI initialisée avec succès.');
    } catch (error) {
      console.error('Erreur lors de l\'initialisation de l\'IA WebAssembly :', error);
      this.ui.showMessage("Erreur critique: IA Native (WASM) indisponible.", 'error');
    }
  }

  /**
   * Déclenche le calcul de l'IA C++ (Minimax).
   * Fonction Asynchrone pour ne pas geler l'UI.
   */
  private async triggerAIMove(): Promise<void> {
    if (this.isAIThinking || !this.wasmAI) return;

    // SÉCURITÉ ANTI-ZOMBIE : On note l'ID de la partie actuelle.
    const turnGameId = this.game.getGameId();

    this.isAIThinking = true; // Verrouillage
    this.ui.startThinkingTimer();
    this.updateUI();

    try {
        // Vérification paranoïaque avant calcul
        if (this.game.getGameId() !== turnGameId) return;

        const startTime = performance.now();
        
        // --- CALCUL LOURD (Worker) ---
        // On envoie l'état complet du jeu (Stateless AI)
        const aiMove = await this.wasmAI.getBestMove(this.game.getGameState());
        
        const endTime = performance.now();
        this.lastAIThinkingTime = (endTime - startTime) / 1000;

        // Vérification paranoïaque après calcul
        // Si l'utilisateur a cliqué sur Reset pendant les 3s de calcul,
        // turnGameId ne correspondra plus à this.game.getGameId().
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
        // Déverrouillage uniquement si on est toujours dans la même partie
        if (this.game.getGameId() === turnGameId) {
            await this.ui.stopThinkingTimer(this.lastAIThinkingTime);
            this.isAIThinking = false;
            this.updateUI();
        }
    }
  }

  /**
   * Déclenche la réflexion de l'IA LLM (Via API OpenRouter).
   */
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
      
      // Appel API
      // On passe un validateur ASYNC pour que le LLM puisse vérifier ses propres coups
      const result = await this.llmAI.getBestMove(
        this.game.getGameState(),
        async (row, col) => await this.game.validateMove(row, col)
      );

      if (this.game.getGameId() !== turnGameId) return;

      const endTime = performance.now();
      this.lastAIThinkingTime = (endTime - startTime) / 1000;

      const llmMove = result.position;
      this.ui.setReasoning(result.reasoning || "Aucun raisonnement disponible.");

      if (llmMove && this.game.getBoard().isValidMove(llmMove.row, llmMove.col)) {
        await new Promise(resolve => setTimeout(resolve, 300)); // Petit délai UX
        
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

  /**
   * Demande un conseil à l'IA Wasm sans jouer le coup.
   * Appelé par le bouton "Suggérer un coup".
   */
  private async showAISuggestion(): Promise<void> {
    if (this.isAIThinking || !this.wasmAI) return;
    
    // Seulement si c'est à l'humain de jouer
    if (this.players[this.game.getCurrentPlayer()] !== 'HUMAN') return;

    const turnGameId = this.game.getGameId();

    this.isAIThinking = true; // On verrouille quand même pour éviter les conflits
    this.ui.startThinkingTimer();
    this.updateUI();

    try {
        const startTime = performance.now();
        // On réutilise le même moteur que pour jouer
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

  /**
   * Remet la partie à zéro (Reset).
   * 
   * Nettoyage complet :
   * 1. Modèle : On vide le plateau via game.reset().
   * 2. UI : On efface les fantômes, les suggestions et les messages.
   * 3. IA : On tue l'instance LLM et on reset les timers.
   * 4. Classement : Une nouvelle partie est classée par défaut (isRanked = true).
   */
  private resetGame(isNewGame: boolean, config: GameConfig = {}): void {
    this.game.reset();
    this.showView('IN_GAME');
    
    // Reset états visuels
    this.hoverPosition = null;
    this.suggestionPosition = null;
    this.isAIThinking = false;
    this.lastAIThinkingTime = 0;
    this.llmAI = null;
    
    // Réactivation du mode Classé
    this.isRanked = true;
    this.ui.setRankedStatus(true);

    // Configuration de l'identité de l'IA (pour les suggestions)
    // Si l'IA ne joue pas, on l'initialise à la couleur du joueur pour qu'elle conseille le joueur.
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
    this.redraw();
    this.updateUI();
    this.ui.clearMessage();
  }

  /**
   * Gère le Chronomètre Global de la partie.
   * Utilise performance.now() pour la précision.
   */
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

  /**
   * Gestionnaire de Voyage dans le Temps (Time Travel).
   * Appelé par les boutons de l'historique (<< < > >>).
   * 
   * IMPORTANT :
   * Si le joueur revient en arrière (Action PREV ou START) dans une partie contre l'IA,
   * le mode "Classé" est désactivé immédiatement pour éviter la triche (Retry scumming).
   * La partie continue en mode "Sandbox".
   */
  private async handleHistoryAction(action: 'START' | 'PREV' | 'NEXT' | 'END'): Promise<void> {
    if (this.isProcessingMove) return;
    this.isProcessingMove = true;

    try {
        const current = this.game.getCurrentMoveIndex();
        const total = this.game.getTotalMoves();
        
        // Si on recule, on passe en mode Sandbox (Non classé)
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
        
        // Restauration des timers historiques
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
        
        this.turnStartTime = performance.now(); // Reset delta

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

  /**
   * Orchestre le rafraîchissement visuel complet (3D + 2D).
   * Appelé à chaque mouvement de souris, coup joué ou changement d'état.
   */
  private redraw(): void {
    if (this.renderer) {
        // Envoie toutes les infos visuelles au moteur 3D
        this.renderer.draw(
            this.game.getCurrentPlayer(), // Couleur du fantôme
            this.hoverPosition,           // Position du fantôme
            this.game.getLastMove(),      // Marqueur rouge
            this.suggestionPosition       // Marqueur vert (conseil)
        );
    }
    // Synchronise le HUD (Scores, Timers, Boutons)
    this.updateUI();
  }

  /**
   * Met à jour les éléments HTML (HUD).
   * Cette fonction doit être très rapide car appelée souvent (ex: timer).
   */
  private updateUI(): void {
    this.ui.updateGameInfo(
        this.game.getCurrentPlayer(), 
        this.game.getBlackCaptures(), 
        this.game.getWhiteCaptures(), 
        this.currentMode,
        this.blackTimeTotal,
        this.whiteTimeTotal
    );
    // Grise ou active les boutons << < > >> selon l'index historique
    this.ui.updateHistoryControls(
        this.game.getCurrentMoveIndex(),
        this.game.getTotalMoves()
    );
  }

  /**
   * Gère le "Fantôme" (Ghost Stone) sous la souris.
   * 1. Convertit les pixels en case de grille.
   * 2. Vérifie si le coup est légal (pas sur une autre pierre).
   * 3. Met à jour l'état pour le prochain redraw().
   */
  private handleMouseMove(e: MouseEvent): void {
    // Optimisation : On ne calcule rien si le jeu est fini ou en pause
    if (this.appState !== 'IN_GAME' || this.game.isGameOver()) return;
    
    const pos = this.canvasToBoard(e.clientX, e.clientY);
    
    // On affiche le fantôme SEULEMENT si la case est valide
    this.hoverPosition = (pos && this.game.getBoard().isValidMove(pos.row, pos.col)) ? pos : null;
    
    this.redraw();
  }

  /**
   * Nettoie le fantôme quand la souris quitte la zone de jeu.
   */
  private handleMouseLeave(): void {
    this.hoverPosition = null;
    this.redraw();
  }

  /**
   * Pont entre l'écran 2D (Pixels) et le monde 3D (Raycasting).
   * Délègue le calcul mathématique complexe au ThreeRenderer.
   */
  private canvasToBoard(x: number, y: number): Position | null {
    if (!this.renderer) return null;
    return this.renderer.canvasToBoard(x, y);
  }

  /**
   * Gestionnaire de Vues (Router simple).
   * Bascule l'affichage entre le Menu Principal, le Jeu et l'Écran de Fin.
   */
  private showView(view: AppState): void {
    this.appState = view;
    this.ui.showView(view);
  }

  // ==================================================================================
  // 7. PARAMÈTRES & MODALES (SETTINGS)
  // ==================================================================================

  /**
   * Charge la liste des modèles LLM depuis un fichier JSON externe.
   * Permet de mettre à jour la liste des IA sans recompiler le code.
   */
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

  /**
   * Ouvre la modale de configuration globale.
   * Pré-remplit les champs avec les données du LocalStorage.
   */
  private openSettingsModal(): void {
    const savedApiKey = localStorage.getItem(LOCAL_STORAGE_API_KEY) || '';
    const savedModel = localStorage.getItem(LOCAL_STORAGE_MODEL) || '';
    this.ui.showSettingsModal(savedApiKey, savedModel);
  }

  /**
   * Sauvegarde les préférences utilisateur dans le navigateur (Persistance).
   * Applique immédiatement les changements (ex: couper le son).
   */
  private saveSettings(): void {
    const { apiKey, model, soundEnabled } = this.ui.getSettingsValues();
    
    // On ne sauvegarde que si les valeurs existent
    if (apiKey) localStorage.setItem(LOCAL_STORAGE_API_KEY, apiKey);
    if (model) localStorage.setItem(LOCAL_STORAGE_MODEL, model);
    
    this.soundManager.setMuted(!soundEnabled);
    
    this.ui.hideSettingsModal();
    this.ui.showMessage('Paramètres sauvegardés', 'success');
  }

  /**
   * Affiche les règles du jeu (Rappel pour l'utilisateur).
   */
  private showRulesModal(): void {
    const rulesHTML = `
      <ul>
        <li><b>Victoire par Alignement :</b> Le premier joueur à aligner 5 pierres...</li>
        <li><b>Victoire par Capture :</b> Capturez 10 pierres adverses...</li>
        <li><b>Double-Trois Interdit :</b> Il est interdit de jouer un coup...</li>
      </ul>`;
    this.ui.showModal('Règles du Gomoku', rulesHTML, [{ text: 'Fermer', callback: () => {} }]);
  }

  /**
   * Demande confirmation avant de recommencer (Évite les miss-click).
   */
  private confirmReset(): void {
    this.ui.showModal('Recommencer', '<p>Êtes-vous sûr de vouloir recommencer ?</p>', [
        { text: 'Oui', callback: () => this.resetGame(false, this.lastGameConfig), className: 'primary' },
        { text: 'Non', callback: () => {} }
    ]);
  }

  /**
   * Demande confirmation avant de quitter vers le menu.
   */
  private confirmGoToMenu(): void {
    this.ui.showModal('Menu Principal', '<p>Quitter la partie en cours ?</p>', [
        { text: 'Oui', callback: () => this.showView('MENU'), className: 'primary' },
        { text: 'Non', callback: () => {} }
    ]);
  }
}

/**
 * Point d'entrée global.
 * Instancie le Contrôleur et l'attache à la fenêtre pour le débogage.
 */
document.addEventListener('DOMContentLoaded', () => {
  try {
    const gameController = new GameController('boardContainer');
    window.gameController = gameController;
  } catch (error) {
    console.error('Échec de l\'initialisation du jeu :', error);
  }
});