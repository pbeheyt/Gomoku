/**
 * Game logic and rules implementation
 * 
 * Cerveau du jeu (Modèle).
 * Contient toute la logique de validation, les règles de victoire et l'état de la partie.
 * Aucune dépendance vers l'UI ou le rendu ici.
 */

import { Player, Position, Move, GameState, CaptureResult, ValidationResult, GameMode } from './types.js';
import { GameBoard } from './board.js';
import { emitMoveMade, emitCaptureMade, emitGameWon, emitPlayerChanged } from './events.js';

// --- GAME CONSTANTS ---
const WIN_ALIGNMENT = 5;
const WIN_CAPTURES = 10; // 5 paires capturées = victoire instantanée

// --- PATTERNS ---
const FREE_THREE_PATTERNS = ['_PPP_', '_P_PP_', '_PP_P_'];

/**
 * 4 Axes géométriques.
 * Utilisé pour vérifier les alignements (Victoire) et les blocages (Suicide, Double-3).
 * On traite la ligne entière (avant/arrière) comme un seul axe.
 */
const AXES = [
  { r: 0, c: 1 },  // Horizontal
  { r: 1, c: 0 },  // Vertical
  { r: 1, c: 1 },  // Diagonale \
  { r: 1, c: -1 }  // Diagonale /
];

/**
 * 8 Vecteurs de direction.
 * Spécifique pour les CAPTURES où le sens est important (gauche != droite).
 * On scanne autour de la pierre comme un radar.
 */
const CAPTURE_DIRECTIONS = [
    { r: 0, c: 1 }, { r: 0, c: -1 },  // Horizontal (Droite, Gauche)
    { r: 1, c: 0 }, { r: -1, c: 0 },  // Vertical (Bas, Haut)
    { r: 1, c: 1 }, { r: -1, c: -1 }, // Diagonale \ (Bas-D, Haut-G)
    { r: 1, c: -1 }, { r: -1, c: 1 }  // Diagonale / (Bas-G, Haut-D)
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
   * Applique un coup sur le plateau.
   * C'est le point d'entrée principal pour jouer.
   * 
   * Gère tout le cycle :
   * - Time Travel (couper le futur si besoin)
   * - Validation des règles
   * - Application physique (pose + captures)
   * - Vérification de victoire
   * - Passage de tour
   */
  makeMove(row: number, col: number, blackTime: number = 0, whiteTime: number = 0): ValidationResult {
    // 1. History Branching
    // Si on joue alors qu'on est revenu dans le passé, on écrase le futur.
    if (this.currentMoveIndex < this.moveHistory.length) {
      this.moveHistory = this.moveHistory.slice(0, this.currentMoveIndex);
      this.winner = null; 
    }

    // 2. Validation & Simulation
    // On vérifie d'abord si le coup est légal sans toucher au plateau définitif.
    const analysis = this.analyzeMove(row, col, this.currentPlayer);
    if (!analysis.isValid) {
      return analysis;
    }

    // 3. Enregistrement
    // On stocke les captures DANS le coup pour le replay (Event Sourcing)
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
    
    // 4. Mécanique
    // On pose la pierre et on retire les prisonniers.
    this.applyMoveMechanics(row, col, this.currentPlayer, move.captures);

    // Events pour l'UI
    emitMoveMade(move);
    move.captures.forEach(capture => emitCaptureMade(capture));

    // 5. Conditions de Victoire
    // Soit 5 alignés (invulnérables), soit 10 pierres capturées.
    if (this.checkWin(row, col) || this.getCaptures(this.currentPlayer) >= WIN_CAPTURES) {
      this.winner = this.currentPlayer;
      emitGameWon(this.currentPlayer);
      return { isValid: true };
    }

    // 6. Changement de joueur
    this.currentPlayer = this.currentPlayer === Player.BLACK ? Player.WHITE : Player.BLACK;
    emitPlayerChanged(this.currentPlayer);

    return { isValid: true };
  }

  /**
   * Helper pour vérifier un coup sans le jouer (utile pour l'IA ou l'UI).
   */
  validateMove(row: number, col: number, playerOverride?: Player): ValidationResult {
    return this.analyzeMove(row, col, playerOverride || this.currentPlayer);
  }

  /**
   * Le Moteur de Règles.
   * Utilise le pattern "Simulation" : DO -> CHECK -> UNDO.
   * 
   * On pose temporairement la pierre pour voir si elle viole une règle complexe
   * (Suicide ou Double-Trois) ou si elle déclenche une capture.
   */
  private analyzeMove(row: number, col: number, player: Player): ValidationResult & { captures?: CaptureResult[] } {
    if (!this.board.isValidMove(row, col)) {
      return { isValid: false, reason: 'Position invalide ou occupée' };
    }

    // --- PHASE 1 : SIMULATION (DO) ---
    this.board.setPiece(row, col, player);
    
    // --- PHASE 2 : ANALYSE (CHECK) ---
    const captures = this.checkCaptures(row, col);
    const suicide = this.isSuicideMove(row, col, player);
    // Le Double-Three doit être calculé AVEC la pierre sur le plateau
    const doubleThree = this.checkDoubleThree(row, col, player);
    
    // --- PHASE 3 : NETTOYAGE (UNDO) ---
    this.board.setPiece(row, col, Player.NONE);

    // --- PHASE 4 : VERDICT ---
    
    // Règle 1 : Suicide (Interdit de jouer là où on se fait manger direct)
    if (suicide) {
      return { isValid: false, reason: 'Coup suicidaire interdit' };
    }

    // Règle 2 : Double-Trois
    // EXCEPTION IMPORTANTE : Si le coup capture des pierres, le Double-Trois est permis !
    if (doubleThree && captures.length === 0) {
      return { isValid: false, reason: 'Double-trois interdit' };
    }

    return { isValid: true, captures };
  }

  /**
   * Modifie physiquement le plateau.
   * Utilisé par makeMove (jeu) et jumpTo (replay).
   * 
   * @param captures - Liste OBLIGATOIRE des captures (plus de recalcul magique)
   */
  private applyMoveMechanics(row: number, col: number, player: Player, captures: CaptureResult[]): void {
    this.board.setPiece(row, col, player);
    this.lastMove = { row, col };

    // Application des captures (retrait des pierres)
    for (const capture of captures) {
      for (const pos of capture.capturedPositions) {
        this.board.setPiece(pos.row, pos.col, Player.NONE); // On enlève les pierres mangées
      }
      // Mise à jour du score
      if (player === Player.BLACK) this.blackCaptures += 2;
      else this.whiteCaptures += 2;
    }
  }

  /**
   * Détecte les Captures (Sandwich).
   * Pattern : [NOUS] [EUX] [EUX] [NOUS]
   * On utilise 8 directions car capturer à gauche != capturer à droite.
   */
  private checkCaptures(row: number, col: number): CaptureResult[] {
    const captures: CaptureResult[] = [];
    const capturingPlayer = this.board.getPiece(row, col);
    if (capturingPlayer === Player.NONE) return [];

    const opponentPlayer = capturingPlayer === Player.BLACK ? Player.WHITE : Player.BLACK;

    for (const dir of CAPTURE_DIRECTIONS) {
      const r1 = row + dir.r;      // Case +1
      const c1 = col + dir.c;
      const r2 = row + 2 * dir.r;  // Case +2
      const c2 = col + 2 * dir.c;
      const r3 = row + 3 * dir.r;  // Case +3
      const c3 = col + dir.c * 3;

      // Si on encercle une paire adverse...
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

  /**
   * Détecte le Suicide.
   * Pattern : [EUX] [NOUS] [NOUS] [EUX]
   * On vérifie si en posant notre pierre, on complète une paire qui est déjà encerclée.
   */
  private isSuicideMove(row: number, col: number, player: Player): boolean {
    const opponent = player === Player.BLACK ? Player.WHITE : Player.BLACK;
    
    for (const dir of AXES) {
      // Cas A : On complète la paire par la DROITE
      // Pattern : O P [X] O
      const p1 = this.board.getPiece(row - 2 * dir.r, col - 2 * dir.c);
      const p2 = this.board.getPiece(row - 1 * dir.r, col - 1 * dir.c);
      const p3 = this.board.getPiece(row + 1 * dir.r, col + 1 * dir.c);
      
      if (p1 === opponent && p2 === player && p3 === opponent) return true;

      // Cas B : On complète la paire par la GAUCHE
      // Pattern : O [X] P O
      const p4 = this.board.getPiece(row - 1 * dir.r, col - 1 * dir.c);
      const p5 = this.board.getPiece(row + 1 * dir.r, col + 1 * dir.c);
      const p6 = this.board.getPiece(row + 2 * dir.r, col + 2 * dir.c);
      
      if (p4 === opponent && p5 === player && p6 === opponent) return true;
    }
    return false;
  }

  /**
   * Règle spéciale de fin de partie :
   * Une ligne de 5 ne gagne PAS si l'adversaire peut immédiatement capturer une paire à l'intérieur.
   * C'est ce qui rend le Gomoku si tactique.
   */
  private isLineBreakableByCapture(winningLine: Position[], opponent: Player): boolean {
    if (winningLine.length < 2) return false;

    // On récupère la direction de la ligne
    const dir = {
      r: winningLine[1].row - winningLine[0].row,
      c: winningLine[1].col - winningLine[0].col,
    };

    // On scanne chaque paire de la ligne (les maillons de la chaîne)
    for (let i = 0; i < winningLine.length - 1; i++) {
      const stone1 = winningLine[i];
      const stone2 = winningLine[i + 1];

      // On regarde les cases FLANC (juste avant et juste après la paire)
      const flankBeforePos = { row: stone1.row - dir.r, col: stone1.col - dir.c };
      const flankAfterPos = { row: stone2.row + dir.r, col: stone2.col + dir.c };

      const flankBeforePiece = this.board.getPiece(flankBeforePos.row, flankBeforePos.col);
      const flankAfterPiece = this.board.getPiece(flankAfterPos.row, flankAfterPos.col);
      
      let captureMove: Position | null = null;

      // Scénario 1 : O A A _ (L'adversaire doit jouer sur _)
      if (flankBeforePiece === opponent && flankAfterPiece === Player.NONE) {
        captureMove = flankAfterPos;
      } 
      // Scénario 2 : _ A A O
      else if (flankBeforePiece === Player.NONE && flankAfterPiece === opponent) {
        captureMove = flankBeforePos;
      }

      if (captureMove) {
        // Est-ce que l'adversaire a le DROIT de jouer ce coup de défense ?
        // (Il ne doit pas être suicidaire ou double-3 pour lui)
        const validation = this.validateMove(captureMove.row, captureMove.col, opponent);
        if (validation.isValid) return true; // La ligne est cassable !
      }
    }
    return false;
  }

  /**
   * Vérifie la victoire par alignement (5+).
   * Appelle isLineBreakableByCapture pour confirmer que la victoire est solide.
   */
  private checkWin(row: number, col: number): boolean {
    const player = this.board.getPiece(row, col);
    const opponent = player === Player.BLACK ? Player.WHITE : Player.BLACK;

    for (const dir of AXES) {
      // On construit la ligne physiquement (array) pour pouvoir l'analyser ensuite
      const currentLine: Position[] = [{ row, col }];
      let count = 1;

      // Direction Positive
      let r = row + dir.r;
      let c = col + dir.c;
      while (this.board.getPiece(r, c) === player) {
        currentLine.push({ row: r, col: c });
        count++;
        r += dir.r;
        c += dir.c;
      }

      // Direction Négative (unshift pour garder l'ordre logique gauche->droite)
      r = row - dir.r;
      c = col - dir.c;
      while (this.board.getPiece(r, c) === player) {
        currentLine.unshift({ row: r, col: c });
        count++;
        r -= dir.r;
        c -= dir.c;
      }

      if (count >= WIN_ALIGNMENT) {
        // Si 5 alignés, on vérifie si c'est cassable par l'adversaire
        if (!this.isLineBreakableByCapture(currentLine, opponent)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Détecte le Double-Trois.
   * On compte combien de "Free Threes" ce coup crée simultanément.
   * Si >= 2, c'est interdit.
   */
  private checkDoubleThree(row: number, col: number, player: Player): boolean {
    let freeThreeCount = 0;
    for (const dir of AXES) {
      if (this.isFreeThree(row, col, dir, player)) {
        freeThreeCount++;
      }
    }
    return freeThreeCount >= 2;
  }

  /**
   * Vérifie si un alignement est un "Free Three" (Trois Libre).
   * On transforme la ligne en texte (ex: "_PPP_") et on cherche des patterns.
   */
  private isFreeThree(row: number, col: number, direction: { r: number; c: number }, player: Player): boolean {
    const line = this.getLinePattern(row, col, direction, player);
    // On cherche les patterns définis en haut du fichier
    return FREE_THREE_PATTERNS.some(pattern => line.includes(pattern));
  }

  /**
   * Construit une représentation String de la ligne pour l'analyse de patterns.
   * P = Player, _ = Vide, O = Opponent/Wall
   */
  private getLinePattern(row: number, col: number, direction: { r: number; c: number }, player: Player): string {
    let line = '';
    // Fenêtre de scan : -5 à +5 cases autour de la pierre
    for (let i = -5; i <= 5; i++) {
      const r = row + i * direction.r;
      const c = col + i * direction.c;
      
      if (!this.board.isValidPosition(r, c)) {
        line += 'O'; // Le bord du plateau agit comme un mur (Opponent)
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
   * Time Travel: Revient à un point précis de l'histoire.
   * 
   * Stratégie : On reset tout à zéro et on rejoue les coups un par un.
   * C'est la méthode la plus sûre pour garantir que l'état (captures, scores) est intègre.
   */
  jumpTo(index: number): void {
    if (index < 0 || index > this.moveHistory.length) return;

    this.gameId++; // Change l'ID pour invalider les calculs d'IA en cours
    this.board.reset();
    this.blackCaptures = 0;
    this.whiteCaptures = 0;
    this.currentPlayer = Player.BLACK;
    this.winner = null;
    this.lastMove = null;

    // Replay de l'histoire
    for (let i = 0; i < index; i++) {
      const move = this.moveHistory[i];
      
      // On réapplique la mécanique (pose + captures)
      // GRÂCE À L'EVENT SOURCING, on passe juste move.captures.
      this.applyMoveMechanics(move.position.row, move.position.col, move.player, move.captures);
      
      this.currentPlayer = (move.player === Player.BLACK) ? Player.WHITE : Player.BLACK;
      
      // Si on revient sur le coup gagnant, on rétablit la victoire
      if (i === index - 1) {
         if (this.checkWin(move.position.row, move.position.col) || this.getCaptures(move.player) >= WIN_CAPTURES) {
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