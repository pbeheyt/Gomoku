/**
 * Sound Manager - File-based Audio
 * Manages loading and playing of game sound assets.
 */
import { Player } from '../core/types.js';

export class SoundManager {
  private isMuted: boolean = false;
  
  private sounds: { [key: string]: HTMLAudioElement } = {};

  constructor() {
    // Load preference
    const savedMute = localStorage.getItem('gomoku-muted');
    this.isMuted = savedMute === 'true';

    // Preload sounds
    this.loadSound('move', './sounds/Move.mp3');
    this.loadSound('capture', './sounds/Capture.mp3');
    this.loadSound('victory', './sounds/Victory.mp3');
    this.loadSound('defeat', './sounds/Defeat.mp3');
  }

  private loadSound(key: string, path: string): void {
    const audio = new Audio(path);
    audio.preload = 'auto';
    this.sounds[key] = audio;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    localStorage.setItem('gomoku-muted', String(muted));
  }

  public isAudioMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Play a sound by key
   */
  private play(key: string): void {
    if (this.isMuted || !this.sounds[key]) return;

    // Clone the node to allow overlapping sounds (e.g., fast moves)
    const sound = this.sounds[key].cloneNode() as HTMLAudioElement;
    sound.volume = 0.5; // Default volume 50%
    
    sound.play().catch(e => {
      console.warn(`Could not play sound ${key}:`, e);
    });
  }

  public playStoneDrop(_player: Player): void {
    this.play('move');
  }

  public playCapture(): void {
    this.play('capture');
  }

  public playWin(isPlayerWinner: boolean): void {
    if (isPlayerWinner) {
        this.play('victory');
    } else {
        this.play('defeat');
    }
  }
}