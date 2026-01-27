export class SoundManager {
  private isMuted: boolean = false;
  
  private sounds: { [key: string]: HTMLAudioElement } = {};

  constructor() {
    const savedMute = localStorage.getItem('gomoku-muted');
    this.isMuted = savedMute === 'true';

    // Préchargement
    this.loadSound('move', './sounds/Move.mp3');
    this.loadSound('capture', './sounds/Capture.mp3');
    this.loadSound('victory', './sounds/Victory.mp3');
    this.loadSound('defeat', './sounds/Defeat.mp3');
  }

  private loadSound(key: string, path: string): void {
    const audio = new Audio(path);
    audio.preload = 'auto'; // Force le chargement du buffer
    this.sounds[key] = audio;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    localStorage.setItem('gomoku-muted', String(muted));
  }

  public isAudioMuted(): boolean {
    return this.isMuted;
  }

  private play(key: string): void {
    if (this.isMuted || !this.sounds[key]) return;

    // Clone pour permettre la superposition
    const sound = this.sounds[key].cloneNode() as HTMLAudioElement;
    sound.volume = 0.5;
    
    sound.play().catch(e => {
      console.warn(`Échec de la lecture audio (${key}):`, e);
    });
  }

  public playStoneDrop(): void {
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