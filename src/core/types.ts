export enum Player {
  NONE = 0,
  BLACK = 1,
  WHITE = 2,
}

export enum GameMode {
  PLAYER_VS_PLAYER = 'pvp',
  PLAYER_VS_AI = 'pva',     // Contre l'IA native (C++)
  PLAYER_VS_LLM = 'pvllm',  // Contre un LLM
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


export interface Move {
  position: Position;
  player: Player;
  timestamp: number;
  blackTime: number; // Temps cumulé au moment du coup
  whiteTime: number; // Temps cumulé au moment du coup
  captures: CaptureResult[]; // Snapshot des captures pour le replay
  debugData?: DebugMove[]; // Données heatmap
}
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

export type GameResult = 'victory' | 'defeat' | 'draw';

export interface LeaderboardEntry {
  date: string;
  moves: number;
  timeSeconds: number;
  score: number;
  aiLevel: string;
  playerColor: Player;
  result: GameResult;
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
