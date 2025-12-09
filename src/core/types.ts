/**
 * Définitions de types partagées (Contrats d'interface).
 * 
 * Ce fichier garantit la cohérence des données entre le Core, l'UI, le Renderer et les Workers.
 * Si on change une structure ici, TypeScript cassera la compilation partout où c'est nécessaire.
 */

export enum Player {
  NONE = 0,
  BLACK = 1,
  WHITE = 2,
}

export enum GameMode {
  PLAYER_VS_PLAYER = 'pvp',
  PLAYER_VS_AI = 'pva',     // Contre l'IA native (C++)
  PLAYER_VS_LLM = 'pvllm',  // Contre un LLM (GPT/Claude)
  AI_VS_LLM = 'aivllm',     // Mode spectateur (Arena)
  AI_SUGGEST = 'suggest',   // Mode assistance
}

export interface Position {
  row: number;
  col: number;
}

export interface CaptureResult {
  capturedPositions: Position[];
  newCaptureCount: number;
}

// Unité atomique d'historique.
// Contient tout le contexte nécessaire (position + temps + conséquences)
// pour permettre un Replay fiable sans recalcul (Event Sourcing).
export interface Move {
  position: Position;
  player: Player;
  timestamp: number;
  blackTime: number; // Temps cumulé au moment du coup
  whiteTime: number; // Temps cumulé au moment du coup
  captures: CaptureResult[]; // Snapshot des captures pour le replay
}

// Snapshot complet de l'état du jeu.
// C'est l'objet "Stateless" qu'on envoie aux IA pour qu'elles analysent la situation.
export interface GameState {
  board: Player[][];
  currentPlayer: Player;
  blackCaptures: number;
  whiteCaptures: number;
  lastMove: Position | null;
  winner: Player | null;
  gameMode: GameMode;
  moveHistory: Move[];
}

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

// Contrat que doivent respecter toutes les IA (Wasm wrapper ou Service LLM)
export interface AIInterface {
  requestMove(gameState: GameState): Promise<Position>;
  getName(): string;
  getDifficulty(): number;
}

export interface LeaderboardEntry {
  date: string;
  moves: number;
  timeSeconds: number;
  score: number;
  aiLevel: string;
  playerColor: Player;
}

// Typage strict pour l'EventEmitter.
// Mappe le nom de l'événement (clé) à la signature de la fonction callback (valeur).
export interface GameEvents {
  'move:made': (move: Move) => void;
  'capture:made': (capture: CaptureResult) => void;
  'game:won': (winner: Player) => void;
  'game:reset': () => void;
  'player:changed': (player: Player) => void;
  'ai:thinking': (isThinking: boolean) => void;
  'ai:move': (position: Position) => void;
}
