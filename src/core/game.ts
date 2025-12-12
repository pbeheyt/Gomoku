/**
 * Logique du jeu et implémentation des règles
 * 
 * MAINTENANT ASYNCHRONE & PROPULSÉ PAR WASM.
 * Délègue toutes les vérifications de règles au moteur C++ via WasmAI.
 */

import { Player, Position, Move, GameState, CaptureResult, ValidationResult, GameMode } from './types.js';
import { GameBoard, BOARD_SIZE } from './board.js';
import { emitMoveMade, emitCaptureMade, emitGameWon, emitPlayerChanged, emitGameDraw } from './events.js';
import { WasmAI } from '../wasm/ai_wrapper.js';

const STALEMATE_THRESHOLD = 20; // On vérifie le Pat si <= 20 cases vides

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
  
  // Le Moteur de Règles C++
  private wasmAI: WasmAI | null = null;

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

  public setAI(ai: WasmAI) {
    this.wasmAI = ai;
  }

  getGameId(): number { return this.gameId; }

  /**
   * ASYNC : Applique un coup après validation par le Wasm.
   */
  async makeMove(row: number, col: number, blackTime: number = 0, whiteTime: number = 0): Promise<ValidationResult> {
    if (!this.wasmAI) return { isValid: false, reason: 'IA non prête' };

    // 1. Branchement d'Historique
    if (this.currentMoveIndex < this.moveHistory.length) {
      this.moveHistory = this.moveHistory.slice(0, this.currentMoveIndex);
      this.winner = null; 
    }

    // 2. Validation & Simulation (Async)
    const analysis = await this.analyzeMove(row, col, this.currentPlayer);
    if (!analysis.isValid) {
      return analysis;
    }

    // 3. Enregistrement du Coup
    const move: Move = {
      position: { row, col },
      player: this.currentPlayer,
      timestamp: Date.now(),
      blackTime: blackTime,
      whiteTime: whiteTime,
      captures: analysis.captures || []
    };
    this.moveHistory.push(move);
    this.currentMoveIndex++;
    
    // 4. Application Mécanique (Plateau JS Local)
    this.applyMoveMechanics(row, col, this.currentPlayer, move.captures);

    // 5. Synchro État Wasm (CRITIQUE)
    // On envoie l'état COMPLET du plateau et des SCORES pour garantir que le C++ est parfaitement synchro
    await this.wasmAI.setBoard(
        this.board.getBoardState().flat(),
        this.blackCaptures,
        this.whiteCaptures
    );

    // Événements
    emitMoveMade(move);
    move.captures.forEach(capture => emitCaptureMade(capture));

    // 6. Vérification Victoire (Wasm Async - Inclut désormais la victoire par capture)
    const isWin = await this.wasmAI.checkWin(row, col, this.currentPlayer);

    if (isWin) {
      this.winner = this.currentPlayer;
      emitGameWon(this.currentPlayer);
      return { isValid: true };
    }

    // 7. Changement de Joueur
    this.currentPlayer = this.currentPlayer === Player.BLACK ? Player.WHITE : Player.BLACK;
    emitPlayerChanged(this.currentPlayer);

    // 8. Vérification Avancée de Match Nul (Pat / Stalemate)
    // On vérifie si le nouveau joueur est bloqué (aucun coup légal restant)
    // uniquement si le plateau est presque plein.
    if (await this.checkStalemate(this.currentPlayer)) {
      this.winner = Player.NONE;
      emitGameDraw();
    }

    return { isValid: true };
  }

  /**
   * Helper pour vérifier un coup sans le jouer.
   */
  async validateMove(row: number, col: number, playerOverride?: Player): Promise<ValidationResult> {
    return this.analyzeMove(row, col, playerOverride || this.currentPlayer);
  }

  /**
   * Le Moteur de Règles (Délégué au Wasm).
   * Pattern : Simulation locale -> Synchro Wasm -> Vérif Règles -> Annulation.
   */
  private async analyzeMove(row: number, col: number, player: Player): Promise<ValidationResult & { captures?: CaptureResult[] }> {
    if (!this.wasmAI) return { isValid: false, reason: 'IA non prête' };
    if (!this.board.isValidMove(row, col)) {
      return { isValid: false, reason: 'Position invalide ou occupée' };
    }

    // STRATÉGIE : Délégation totale au C++
    // Le Bridge C++ gère maintenant la simulation interne (pose temporaire).
    // CRITIQUE : On force la synchro AVANT de vérifier pour être sûr que le C++ connait les pierres adverses et les SCORES.
    await this.wasmAI.setBoard(
        this.board.getBoardState().flat(),
        this.blackCaptures,
        this.whiteCaptures
    );

    // 1. Validation Unifiée (Single Source of Truth)
    // Le C++ gère maintenant toutes les priorités (Capture > Suicide, Capture > DoubleTrois)
    const status = await this.wasmAI.validateMove(row, col, player);

    if (status !== 0) {
        let reason = 'Coup invalide';
        if (status === 1) reason = 'Hors limites';
        if (status === 2) reason = 'Case occupée';
        if (status === 3) reason = 'Suicide interdit';
        if (status === 4) reason = 'Double-Trois interdit';
        return { isValid: false, reason };
    }

    // 2. Si valide, on récupère les détails des captures pour l'UI
    const rawCaptures = await this.wasmAI.checkCaptures(row, col, player);

    // Formatage des captures pour le JS
    const captures: CaptureResult[] = rawCaptures.map((c: any) => ({
        capturedPositions: c.capturedPositions,
        newCaptureCount: (player === Player.BLACK ? this.blackCaptures : this.whiteCaptures) + 2
    }));

    return { isValid: true, captures };
  }

  private applyMoveMechanics(row: number, col: number, player: Player, captures: CaptureResult[]): void {
    this.board.setPiece(row, col, player);
    this.lastMove = { row, col };

    for (const capture of captures) {
      for (const pos of capture.capturedPositions) {
        this.board.setPiece(pos.row, pos.col, Player.NONE);
      }
      if (player === Player.BLACK) this.blackCaptures += 2;
      else this.whiteCaptures += 2;
    }
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
    
    // Synchro Wasm
    if (this.wasmAI) {
        this.wasmAI.setBoard(this.board.getBoardState().flat(), 0, 0);
    }
  }

  async jumpTo(index: number): Promise<void> {
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
      this.applyMoveMechanics(move.position.row, move.position.col, move.player, move.captures);
      this.currentPlayer = (move.player === Player.BLACK) ? Player.WHITE : Player.BLACK;
      
      // Re-vérification condition de victoire sur le dernier coup du saut
      if (i === index - 1) {
         if (this.wasmAI) {
             await this.wasmAI.setBoard(
                 this.board.getBoardState().flat(),
                 this.blackCaptures,
                 this.whiteCaptures
             );
             const isWin = await this.wasmAI.checkWin(move.position.row, move.position.col, move.player);
             if (isWin) this.winner = move.player;
         }
      }
    }
    this.currentMoveIndex = index;
    
    // Synchro Finale
    if (this.wasmAI) {
        await this.wasmAI.setBoard(
            this.board.getBoardState().flat(),
            this.blackCaptures,
            this.whiteCaptures
        );
    }
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

  /**
   * Vérifie si le joueur est en situation de Pat (aucun coup légal possible).
   */
  private async checkStalemate(player: Player): Promise<boolean> {
    // 1. Optimisation : On ne vérifie que s'il reste peu de place (<= 30 cases)
    const emptyCells = this.board.getEmptyCount();
    if (emptyCells > STALEMATE_THRESHOLD) return false;

    if (!this.wasmAI) return false;

    // 2. Synchro État Wasm
    await this.wasmAI.setBoard(
        this.board.getBoardState().flat(),
        this.blackCaptures,
        this.whiteCaptures
    );

    // 3. Scan complet des cases vides restantes
    // Si on trouve UN SEUL coup valide, la partie continue.
    const boardState = this.board.getBoardState();
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (boardState[r][c] === Player.NONE) {
                const status = await this.wasmAI.validateMove(r, c, player);
                if (status === 0) {
                    return false; // Ce coup est jouable, pas de Pat.
                }
            }
        }
    }

    // Aucun coup valide trouvé -> Match Nul
    return true;
  }
}