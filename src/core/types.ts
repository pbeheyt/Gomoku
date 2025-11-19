/**
 * Core types and interfaces for Gomoku game
 */

export enum Player {
  NONE = 0,
  BLACK = 1,
  WHITE = 2,
}

export enum GameMode {
  PLAYER_VS_PLAYER = 'pvp',
  PLAYER_VS_AI = 'pva',
  PLAYER_VS_LLM = 'pvllm',
  AI_VS_LLM = 'aivllm',
  AI_SUGGEST = 'suggest',
}

export interface Position {
  row: number;
  col: number;
}

export interface Move {
  position: Position;
  player: Player;
  timestamp: number;
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

export interface CaptureResult {
  capturedPositions: Position[];
  newCaptureCount: number;
}

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

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
  aiLevel: string; // "WASM" or "LLM" or custom like "AI C++"
  playerColor: Player; // Store which color the human played
}

export interface GameEvents {
  'move:made': (move: Move) => void;
  'capture:made': (capture: CaptureResult) => void;
  'game:won': (winner: Player) => void;
  'game:reset': () => void;
  'player:changed': (player: Player) => void;
  'ai:thinking': (isThinking: boolean) => void;
  'ai:move': (position: Position) => void;
}
