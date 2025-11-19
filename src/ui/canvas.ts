/**
 * Canvas drawing and rendering utilities
 */

import { Player, Position } from '../core/types.js';
import { GameBoard } from '../core/board.js';
import { IGameRenderer } from './renderer_interface.js';

// Constants
const CELL_SIZE = 35;
const BOARD_MARGIN = 40;
const STONE_RADIUS = 15;

export class CanvasRenderer implements IGameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private board: GameBoard;
  private container: HTMLElement;

  constructor(containerId: string, board: GameBoard) {
    this.board = board;

    this.container = document.getElementById(containerId) as HTMLElement;
    if (!this.container) {
      throw new Error(`Container with id "${containerId}" not found`);
    }

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.container.appendChild(this.canvas);

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get 2D context');
    }
    this.ctx = context;
    
    this.resize(this.container.clientWidth, this.container.clientHeight);
  }

  resize(width: number, height: number): void {
    // 2D Canvas has fixed size based on board content, 
    // but we center it in the container via CSS or just set dimensions.
    const size = this.board.getSize() * CELL_SIZE + BOARD_MARGIN * 2;
    this.canvas.width = size;
    this.canvas.height = size;
    
    this.canvas.style.width = size + 'px';
    this.canvas.style.height = size + 'px';
    this.canvas.style.display = 'block';
  }

  cleanup(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }

  /**
   * Convert canvas coordinates to board position
   */
  canvasToBoard(x: number, y: number): Position | null {
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = x - rect.left;
    const canvasY = y - rect.top;

    const col = Math.round((canvasX - BOARD_MARGIN) / CELL_SIZE);
    const row = Math.round((canvasY - BOARD_MARGIN) / CELL_SIZE);

    if (row >= 0 && row < this.board.getSize() && col >= 0 && col < this.board.getSize()) {
      return { row, col };
    }

    return null;
  }

  /**
   * Main draw function
   */
  draw(currentPlayer: Player, hoverPos: Position | null, lastMove: Position | null = null, suggestionPos: Position | null = null): void {
    this.clearCanvas();
    this.drawBoard();
    this.drawStones();
    if (lastMove) {
      this.drawLastMoveMarker(lastMove);
    }
    if (suggestionPos) {
      this.drawSuggestionHighlight(suggestionPos);
    }
    this.drawHover(currentPlayer, hoverPos);
  }

  /**
   * Clear the canvas
   */
  private clearCanvas(): void {
    this.ctx.fillStyle = '#DEB887';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Draw the game board grid
   */
  private drawBoard(): void {
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 1;

    // Draw grid lines
    for (let i = 0; i < this.board.getSize(); i++) {
      const pos = BOARD_MARGIN + i * CELL_SIZE;

      // Vertical line
      this.ctx.beginPath();
      this.ctx.moveTo(pos, BOARD_MARGIN);
      this.ctx.lineTo(pos, BOARD_MARGIN + (this.board.getSize() - 1) * CELL_SIZE);
      this.ctx.stroke();

      // Horizontal line
      this.ctx.beginPath();
      this.ctx.moveTo(BOARD_MARGIN, pos);
      this.ctx.lineTo(BOARD_MARGIN + (this.board.getSize() - 1) * CELL_SIZE, pos);
      this.ctx.stroke();
    }

    // Draw star points (hoshi)
    this.drawStarPoints();
  }

  /**
   * Draw star points on the board
   */
  private drawStarPoints(): void {
    const starPoints = [
      [3, 3], [3, 9], [3, 15],
      [9, 3], [9, 9], [9, 15],
      [15, 3], [15, 9], [15, 15],
    ];

    this.ctx.fillStyle = '#000000';
    starPoints.forEach(([row, col]) => {
      const x = BOARD_MARGIN + col * CELL_SIZE;
      const y = BOARD_MARGIN + row * CELL_SIZE;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 3, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  /**
   * Draw all stones on the board
   */
  private drawStones(): void {
    for (let row = 0; row < this.board.getSize(); row++) {
      for (let col = 0; col < this.board.getSize(); col++) {
        const piece = this.board.getPiece(row, col);
        if (piece !== Player.NONE) {
          this.drawStone(row, col, piece);
        }
      }
    }
  }

  /**
   * Draw a single stone
   */
  private drawStone(row: number, col: number, player: Player): void {
    const x = BOARD_MARGIN + col * CELL_SIZE;
    const y = BOARD_MARGIN + row * CELL_SIZE;

    // Shadow
    this.ctx.beginPath();
    this.ctx.arc(x + 2, y + 2, STONE_RADIUS, 0, Math.PI * 2);
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.fill();

    // Stone
    this.ctx.beginPath();
    this.ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2);
    
    if (player === Player.BLACK) {
      this.ctx.fillStyle = '#000000';
    } else {
      this.ctx.fillStyle = '#FFFFFF';
    }
    this.ctx.fill();

    // Border
    this.ctx.strokeStyle = player === Player.BLACK ? '#333333' : '#CCCCCC';
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
  }

  /**
   * Draw hover preview
   */
  drawHover(currentPlayer: Player, hoverPos: Position | null): void {
    if (!hoverPos) return;

    const x = BOARD_MARGIN + hoverPos.col * CELL_SIZE;
    const y = BOARD_MARGIN + hoverPos.row * CELL_SIZE;

    this.ctx.beginPath();
    this.ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2);
    
    if (currentPlayer === Player.BLACK) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    } else {
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      this.ctx.strokeStyle = '#888888';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    }
    this.ctx.fill();
  }

  /**
   * Highlight the last move with a small dot
   */
  private drawLastMoveMarker(pos: Position): void {
    const x = BOARD_MARGIN + pos.col * CELL_SIZE;
    const y = BOARD_MARGIN + pos.row * CELL_SIZE;

    this.ctx.beginPath();
    this.ctx.arc(x, y, 5, 0, Math.PI * 2);
    const piece = this.board.getPiece(pos.row, pos.col);
    this.ctx.fillStyle = piece === Player.BLACK ? 'white' : 'black';
    this.ctx.fill();
  }

  /**
   * Highlight a suggested move
   */
  private drawSuggestionHighlight(pos: Position): void {
    const x = BOARD_MARGIN + pos.col * CELL_SIZE;
    const y = BOARD_MARGIN + pos.row * CELL_SIZE;

    this.ctx.beginPath();
    this.ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2);
    this.ctx.strokeStyle = '#00ff89';
    this.ctx.lineWidth = 3;
    this.ctx.stroke();
  }

  // Removed setHoverPosition as it is passed in draw()

  /**
   * Get canvas element
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
}
