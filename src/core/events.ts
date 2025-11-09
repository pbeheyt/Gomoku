/**
 * Event system for game communication
 */

import { GameEvents, Move, CaptureResult, Player, Position } from './types.js';

export class EventEmitter {
  private listeners: { [K in keyof GameEvents]?: GameEvents[K][] } = {};

  /**
   * Subscribe to an event
   */
  on<K extends keyof GameEvents>(event: K, callback: GameEvents[K]): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(callback);
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends keyof GameEvents>(event: K, callback: GameEvents[K]): void {
    if (this.listeners[event]) {
      const index = this.listeners[event]!.indexOf(callback);
      if (index > -1) {
        this.listeners[event]!.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event
   */
  emit<K extends keyof GameEvents>(event: K, ...args: Parameters<GameEvents[K]>): void {
    if (this.listeners[event]) {
      this.listeners[event]!.forEach(callback => {
        (callback as any)(...args);
      });
    }
  }

  /**
   * Clear all listeners
   */
  clear(): void {
    this.listeners = {};
  }
}

/**
 * Game event manager - singleton instance
 */
export const gameEvents = new EventEmitter();

/**
 * Helper functions for common event emissions
 */
export function emitMoveMade(move: Move): void {
  gameEvents.emit('move:made', move);
}

export function emitCaptureMade(capture: CaptureResult): void {
  gameEvents.emit('capture:made', capture);
}

export function emitGameWon(winner: Player): void {
  gameEvents.emit('game:won', winner);
}

export function emitGameReset(): void {
  gameEvents.emit('game:reset');
}

export function emitPlayerChanged(player: Player): void {
  gameEvents.emit('player:changed', player);
}

export function emitAIThinking(isThinking: boolean): void {
  gameEvents.emit('ai:thinking', isThinking);
}

export function emitAIMove(position: Position): void {
  gameEvents.emit('ai:move', position);
}
