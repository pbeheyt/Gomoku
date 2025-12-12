/**
 * Bus d'événements
 * 
 * Permet de découpler les modules : le Game (Core) notifie que quelque chose
 * s'est passé, et l'UI ou le Renderer réagissent sans que le Core ne les connaisse.
 */

import { GameEvents, Move, CaptureResult, Player, Position } from './types.js';

export class EventEmitter {
  // Registry des listeners : Map<EventName, Array<Callback>>
  private listeners: { [K in keyof GameEvents]?: GameEvents[K][] } = {};

  // S'abonne à un événement.
  // Le type générique K garantit l'autocomplétion et la sécurité du payload.
  on<K extends keyof GameEvents>(event: K, callback: GameEvents[K]): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(callback);
  }

  // Se désabonne (retire le callback de la liste).
  // Utile pour éviter les fuites de mémoire si un composant est détruit.
  off<K extends keyof GameEvents>(event: K, callback: GameEvents[K]): void {
    if (this.listeners[event]) {
      const index = this.listeners[event]!.indexOf(callback);
      if (index > -1) {
        this.listeners[event]!.splice(index, 1);
      }
    }
  }

  // Diffuse un événement à tous les abonnés.
  // Les args sont typés strictement selon l'interface GameEvents.
  emit<K extends keyof GameEvents>(event: K, ...args: Parameters<GameEvents[K]>): void {
    if (this.listeners[event]) {
      this.listeners[event]!.forEach(callback => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (callback as any)(...args);
      });
    }
  }

  // Nettoyage complet
  clear(): void {
    this.listeners = {};
  }
}

/**
 * Instance Singleton.
 * Garantit que tout le monde (Game, UI, Controller) parle sur le même canal.
 */
export const gameEvents = new EventEmitter();

/**
 * Wrappers pour simplifier l'émission d'événements dans le code métier.
 * Évite d'avoir des strings magiques ('move:made') partout dans le code.
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

export function emitGameDraw(): void {
  gameEvents.emit('game:draw');
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
