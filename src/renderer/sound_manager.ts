/**
 * Gestionnaire Audio (SFX).
 * 
 * Responsabilités :
 * 1. Préchargement des assets (latence zéro).
 * 2. Gestion de la polyphonie (sons simultanés).
 * 3. Persistance de l'état Mute/Unmute.
 */

export class SoundManager {
  private isMuted: boolean = false;
  
  // Cache des éléments audio originaux
  private sounds: { [key: string]: HTMLAudioElement } = {};

  constructor() {
    // Récupération de la préférence utilisateur
    const savedMute = localStorage.getItem('gomoku-muted');
    this.isMuted = savedMute === 'true';

    // Préchargement immédiat pour éviter le lag au premier clic
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

  /**
   * Joue un son spécifique.
   * 
   * Polyphonie via cloneNode()
   * On clone l'élément Audio pour permettre de jouer le même son plusieurs fois 
   * en parallèle (ex: clics rapides) sans couper le précédent.
   */
  private play(key: string): void {
    if (this.isMuted || !this.sounds[key]) return;

    // Clone pour permettre la superposition
    const sound = this.sounds[key].cloneNode() as HTMLAudioElement;
    sound.volume = 0.5; // Volume standardisé
    
    // Gestion silencieuse des erreurs (ex: Autoplay policy du navigateur)
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