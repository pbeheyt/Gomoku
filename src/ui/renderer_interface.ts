import { Player, Position } from '../core/types.js';

export interface IGameRenderer {
  /**
   * Main draw loop
   */
  draw(currentPlayer: Player, hoverPos: Position | null, lastMove: Position | null, suggestionPos: Position | null): void;

  /**
   * Convert screen coordinates (relative to canvas) to board position
   */
  canvasToBoard(x: number, y: number): Position | null;

  /**
   * Get the underlying canvas element (for event binding)
   */
  getCanvas(): HTMLCanvasElement;

  /**
   * Handle resize events
   */
  resize(width: number, height: number): void;

  /**
   * Cleanup resources (WebGL context, DOM elements)
   */
  cleanup(): void;
}