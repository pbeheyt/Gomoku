export enum Player {
  NONE = 0,
  BLACK = 1,
  WHITE = 2,
}

export enum GameMode {
  PLAYER_VS_PLAYER = 'pvp',
  PLAYER_VS_AI = 'pva',     // Contre l'IA native (C++)
  PLAYER_VS_LLM = 'pvllm',  // Contre un LLM
  AI_VS_LLM = 'aivllm',     // Mode spectateur
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
// pour permettre un Replay sans recalcul.
export interface Move {
  position: Position;
  player: Player;
  timestamp: number;
  blackTime: number; // Temps cumulé au moment du coup
  whiteTime: number; // Temps cumulé au moment du coup
  captures: CaptureResult[]; // Snapshot des captures pour le replay
}

// Snapshot complet de l'état du jeu.
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

export interface DebugMove {
  row: number;
  col: number;
  score: number;
  type: 0 | 1 | 2; // 0 = Candidate (Yellow), 1 = Minimax (Red), 2 = One Shot (Purple)
}

// Contrat que doivent respecter toutes les IA (Wasm wrapper ou LLM)
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

// Mappe le nom de l'événement à la signature de la fonction callback.
export interface GameEvents {
  'move:made': (move: Move) => void;
  'capture:made': (capture: CaptureResult) => void;
  'game:won': (winner: Player) => void;
  'game:draw': () => void;
  'game:reset': () => void;
  'player:changed': (player: Player) => void;
  'ai:thinking': (isThinking: boolean) => void;
  'ai:move': (position: Position) => void;
}
