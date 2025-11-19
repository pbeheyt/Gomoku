// @src/renderer/ui_manager.ts
import { Player, GameMode } from '../core/types.js';
import { LeaderboardManager } from './leaderboard_manager.js';

export type AppState = 'MENU' | 'IN_GAME' | 'GAME_OVER';
export type ModalButton = { text: string; callback: () => void; className?: string; };

export class UIManager {
  private mainMenuEl: HTMLElement | null;
  private gameOverMenuEl: HTMLElement | null;
  private gameContainerEl: HTMLElement | null;
  private winnerMessageEl: HTMLElement | null;
  private suggestBtnEl: HTMLElement | null;
  
  // History Controls
  private histStartBtn: HTMLButtonElement | null;
  private histPrevBtn: HTMLButtonElement | null;
  private histNextBtn: HTMLButtonElement | null;
  private histEndBtn: HTMLButtonElement | null;
  private histLabel: HTMLElement | null;
  private blackTimerEl: HTMLElement | null;
  private whiteTimerEl: HTMLElement | null;
  private aiTimerSectionEl: HTMLElement | null;
  private timerLabelEl: HTMLElement | null;
  private timerDisplayEl: HTMLElement | null;
  private miniSpinnerEl: HTMLElement | null;
  private aiReasoningSectionEl: HTMLElement | null;
  private aiReasoningDisplayEl: HTMLElement | null;
  private genericModalEl: HTMLElement | null;
  private modalTitleEl: HTMLElement | null;
  private modalBodyEl: HTMLElement | null;
  private modalFooterEl: HTMLElement | null;
  private settingsModalEl: HTMLElement | null;
  private apiKeyInputEl: HTMLInputElement | null;
  private modelSelectEl: HTMLSelectElement | null;
  private soundToggleEl: HTMLInputElement | null = null;
  private messageEl: HTMLElement | null = null;
  private rankedBadgeEl: HTMLElement | null = null;
  
  // Setup Modal Elements
  private setupModalEl: HTMLElement | null;
  private setupModelSelectEl: HTMLSelectElement | null;
  private setupColorBtns: NodeListOf<Element>;
  private setupStartBtn: HTMLElement | null;
  private setupCancelBtn: HTMLElement | null;
  private setupModelSection: HTMLElement | null;
  private setupColorSection: HTMLElement | null;

  private timerInterval: any = null;
  private thinkingStartTime: number = 0;
  private messageTimeout: any = null;

  constructor() {
    this.mainMenuEl = document.getElementById('mainMenu');
    this.gameOverMenuEl = document.getElementById('gameOverMenu');
    this.gameContainerEl = document.getElementById('gameContainer');
  this.winnerMessageEl = document.getElementById('winnerMessage');
  this.suggestBtnEl = document.getElementById('suggestBtn');
  
  this.histStartBtn = document.getElementById('histStartBtn') as HTMLButtonElement;
  this.histPrevBtn = document.getElementById('histPrevBtn') as HTMLButtonElement;
  this.histNextBtn = document.getElementById('histNextBtn') as HTMLButtonElement;
  this.histEndBtn = document.getElementById('histEndBtn') as HTMLButtonElement;
  this.histLabel = document.getElementById('histLabel');
  this.blackTimerEl = document.getElementById('blackTimer');
  this.whiteTimerEl = document.getElementById('whiteTimer');
  this.aiTimerSectionEl = document.getElementById('aiTimerSection');
    this.timerLabelEl = document.getElementById('timerLabel');
    this.timerDisplayEl = document.getElementById('timer');
    this.miniSpinnerEl = document.getElementById('miniSpinner');
    this.aiReasoningSectionEl = document.getElementById('aiReasoningSection');
    this.aiReasoningDisplayEl = document.getElementById('aiReasoningDisplay');
    this.genericModalEl = document.getElementById('genericModal');
    this.modalTitleEl = document.getElementById('modalTitle');
    this.modalBodyEl = document.getElementById('modalBody');
    this.modalFooterEl = document.getElementById('modalFooter');
    this.settingsModalEl = document.getElementById('settingsModal');
    this.apiKeyInputEl = document.getElementById('apiKeyInput') as HTMLInputElement;
    this.modelSelectEl = document.getElementById('modelSelect') as HTMLSelectElement;
    this.soundToggleEl = document.getElementById('soundToggle') as HTMLInputElement;

    // Setup Modal
    this.setupModalEl = document.getElementById('setupModal');
    this.setupModelSelectEl = document.getElementById('setupModelSelect') as HTMLSelectElement;
    this.setupColorBtns = document.querySelectorAll('.btn-color');
    this.setupStartBtn = document.getElementById('startGameBtn');
    this.setupCancelBtn = document.getElementById('cancelSetupBtn');
    this.setupModelSection = document.getElementById('modelSelectionSection');
    this.setupColorSection = document.getElementById('colorSelection');
    
    // Create Ranked Badge dynamically
    this.rankedBadgeEl = document.createElement('div');
    this.rankedBadgeEl.className = 'ranked-badge hidden';
    this.rankedBadgeEl.textContent = '🚫 NON CLASSÉ';
    
    // Insert into header center group
    const headerCenter = document.getElementById('headerCenter');
    if (headerCenter) {
        headerCenter.appendChild(this.rankedBadgeEl);
    }
  }

  public setRankedStatus(isRanked: boolean): void {
    if (this.rankedBadgeEl) {
        if (isRanked) {
            this.rankedBadgeEl.classList.add('hidden');
        } else {
            this.rankedBadgeEl.classList.remove('hidden');
        }
    }
  }

  public showView(view: AppState): void {
    this.mainMenuEl?.classList.toggle('hidden', view !== 'MENU');
    this.gameContainerEl?.classList.toggle('hidden', view !== 'IN_GAME');
    this.gameOverMenuEl?.classList.toggle('hidden', view !== 'GAME_OVER');
  }

  public updateGameInfo(
    player: Player, 
    blackCaptures: number, 
    whiteCaptures: number, 
    mode: GameMode,
    blackTime: number,
    whiteTime: number
  ): void {
    document.getElementById('playerInfoBlack')?.classList.toggle('active-player', player === Player.BLACK);
    document.getElementById('playerInfoWhite')?.classList.toggle('active-player', player === Player.WHITE);
    
    if (document.getElementById('blackCaptures')) document.getElementById('blackCaptures')!.textContent = `Captures: ${blackCaptures} / 10`;
    if (document.getElementById('whiteCaptures')) document.getElementById('whiteCaptures')!.textContent = `Captures: ${whiteCaptures} / 10`;

  if (this.blackTimerEl) this.blackTimerEl.textContent = this.formatTime(blackTime);
  if (this.whiteTimerEl) this.whiteTimerEl.textContent = this.formatTime(whiteTime);

  const isAiGame = mode === GameMode.PLAYER_VS_AI || mode === GameMode.PLAYER_VS_LLM || mode === GameMode.AI_VS_LLM;
    this.aiTimerSectionEl?.classList.toggle('hidden', !isAiGame);

    const isLlmMode = mode === GameMode.PLAYER_VS_LLM || mode === GameMode.AI_VS_LLM;
    this.aiReasoningSectionEl?.classList.toggle('hidden', !isLlmMode);
    
    this.suggestBtnEl?.classList.toggle('hidden', mode !== GameMode.PLAYER_VS_PLAYER);
  }

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  public showLeaderboardModal(): void {
    const html = LeaderboardManager.generateHTML();
    this.showModal('🏆 Hall of Fame (Vs IA)', html, [{ text: 'Fermer', callback: () => {} }]);
  }

  public setWinnerMessage(winner: Player): void {
    if (this.winnerMessageEl) {
      this.winnerMessageEl.textContent = `🎉 ${winner === Player.BLACK ? 'Noir' : 'Blanc'} a gagné !`;
    }
  }

  public startThinkingTimer(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.thinkingStartTime = performance.now();
    if (this.timerLabelEl) this.timerLabelEl.textContent = "Réflexion en cours...";
    if (this.miniSpinnerEl) this.miniSpinnerEl.classList.remove('hidden');
    
    this.timerInterval = setInterval(() => {
      const current = (performance.now() - this.thinkingStartTime) / 1000;
      if (this.timerDisplayEl) this.timerDisplayEl.textContent = `${current.toFixed(4)}s`;
    }, 50);
  }

  public async stopThinkingTimer(finalDuration: number): Promise<void> {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.timerDisplayEl) this.timerDisplayEl.textContent = `${finalDuration.toFixed(4)}s`;
    
    const MIN_DISPLAY_TIME = 600;
    const elapsed = performance.now() - this.thinkingStartTime;
    if (elapsed < MIN_DISPLAY_TIME) {
      await new Promise(resolve => setTimeout(resolve, MIN_DISPLAY_TIME - elapsed));
    }

    if (this.timerLabelEl) this.timerLabelEl.textContent = "Dernier coup";
    if (this.miniSpinnerEl) this.miniSpinnerEl.classList.add('hidden');
  }

  public setReasoning(text: string): void {
    if (this.aiReasoningDisplayEl) this.aiReasoningDisplayEl.textContent = text;
  }

  public showModal(title: string, contentHTML: string, buttons: ModalButton[]): void {
    if (!this.genericModalEl || !this.modalTitleEl || !this.modalBodyEl || !this.modalFooterEl) return;
    
    this.modalTitleEl.textContent = title;
    this.modalBodyEl.innerHTML = contentHTML;
    this.modalFooterEl.innerHTML = '';

    buttons.forEach(btnInfo => {
      const button = document.createElement('button');
      button.textContent = btnInfo.text;
      button.className = `btn-modal ${btnInfo.className || ''}`;
      button.onclick = () => {
        this.genericModalEl?.classList.add('hidden');
        btnInfo.callback();
      };
      this.modalFooterEl!.appendChild(button);
    });

    this.genericModalEl.classList.remove('hidden');
  }

  public showSettingsModal(apiKey: string, modelId: string): void {
    if (this.apiKeyInputEl) this.apiKeyInputEl.value = apiKey;
    if (this.modelSelectEl) this.modelSelectEl.value = modelId;
    
    if (this.soundToggleEl) {
        const isMuted = localStorage.getItem('gomoku-muted') === 'true';
        this.soundToggleEl.checked = !isMuted;
    }
    
    this.settingsModalEl?.classList.remove('hidden');
  }

  public hideSettingsModal(): void {
    this.settingsModalEl?.classList.add('hidden');
  }

  public getSettingsValues(): { apiKey: string, model: string, soundEnabled: boolean } {
    return {
      apiKey: this.apiKeyInputEl?.value || '',
      model: this.modelSelectEl?.value || '',
      soundEnabled: this.soundToggleEl ? this.soundToggleEl.checked : true
    };
  }

  public populateModels(models: { name: string; id: string }[]): void {
    // Populate global settings select
    if (this.modelSelectEl) {
        this.modelSelectEl.innerHTML = '';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            this.modelSelectEl!.appendChild(option);
        });
    }
    // Populate setup modal select
    if (this.setupModelSelectEl) {
        this.setupModelSelectEl.innerHTML = '';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            this.setupModelSelectEl!.appendChild(option);
        });
    }
  }

  public showSetupModal(
    mode: GameMode, 
    onStart: (config: { color: Player, modelId?: string }) => void,
    onCancel: () => void
  ): void {
    if (!this.setupModalEl) return;

    // Reset state
    this.setupColorBtns.forEach(btn => {
        btn.classList.remove('selected');
        if (btn.getAttribute('data-color') === '1') btn.classList.add('selected');
    });

    // Logic to show/hide sections based on mode
    const needsModel = (mode === GameMode.PLAYER_VS_LLM || mode === GameMode.AI_VS_LLM);
    const needsColor = (mode === GameMode.PLAYER_VS_AI || mode === GameMode.PLAYER_VS_LLM);

    if (this.setupModelSection) this.setupModelSection.classList.toggle('hidden', !needsModel);
    if (this.setupColorSection) this.setupColorSection.classList.toggle('hidden', !needsColor);

    // Pre-select Default Model from Settings
    if (needsModel && this.setupModelSelectEl) {
        const savedModel = localStorage.getItem('gomoku-llm-model');
        if (savedModel) {
            this.setupModelSelectEl.value = savedModel;
        }
    }

    // Bind Color Buttons
    this.setupColorBtns.forEach(btn => {
        (btn as HTMLElement).onclick = () => {
            this.setupColorBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        };
    });

    // Bind Start
    if (this.setupStartBtn) {
        this.setupStartBtn.onclick = () => {
            let selectedColor = Player.BLACK;
            this.setupColorBtns.forEach(btn => {
                if (btn.classList.contains('selected')) {
                    selectedColor = parseInt(btn.getAttribute('data-color') || '1');
                }
            });

            const config: any = { color: selectedColor };
            if (needsModel && this.setupModelSelectEl) {
                config.modelId = this.setupModelSelectEl.value;
            }
            
            this.setupModalEl?.classList.add('hidden');
            onStart(config);
        };
    }

    // Bind Cancel
    if (this.setupCancelBtn) {
        this.setupCancelBtn.onclick = () => {
            this.setupModalEl?.classList.add('hidden');
            onCancel();
        };
    }

    this.setupModalEl.classList.remove('hidden');
  }

  public showMessage(message: string): void {
    // Lazy creation
    if (!this.messageEl) {
      this.messageEl = document.createElement('div');
      this.messageEl.id = 'gameMessage';
      document.body.appendChild(this.messageEl);
    }

    // Clear existing timeout to prevent early closing
    if (this.messageTimeout) {
        clearTimeout(this.messageTimeout);
        this.messageTimeout = null;
    }

    // Set content with Close Button
    this.messageEl.innerHTML = `
        <span>${message}</span>
        <button class="toast-close">&times;</button>
    `;
    
    // Bind click event to the new button
    const closeBtn = this.messageEl.querySelector('.toast-close') as HTMLElement;
    if (closeBtn) {
        closeBtn.onclick = () => this.clearMessage();
    }

    // Show the toast
    this.messageEl.style.display = 'block';
    
    // Auto-hide after 8 seconds (Longer duration)
    this.messageTimeout = setTimeout(() => { 
        this.clearMessage();
    }, 8000);
  }

  public clearMessage(): void {
    if (this.messageEl) this.messageEl.style.display = 'none';
  }

  // Bindings
  public bindMenuButtons(actions: {
    onPvp: () => void,
    onPva: () => void,
    onLlmPvp: () => void,
    onAiVsLlm: () => void,
    onReplay: () => void,
    onMenu: () => void,
    onSettings: () => void
  }): void {
    // Card clicks
    document.getElementById('cardPvp')?.addEventListener('click', actions.onPvp);
    document.getElementById('cardPva')?.addEventListener('click', actions.onPva);
    document.getElementById('cardLlm')?.addEventListener('click', actions.onLlmPvp);
    document.getElementById('cardArena')?.addEventListener('click', actions.onAiVsLlm);
    
    // Main Menu Settings
  document.getElementById('mainSettingsBtn')?.addEventListener('click', actions.onSettings);
  document.getElementById('leaderboardBtn')?.addEventListener('click', () => {
    this.showLeaderboardModal();
  });

    // Game Over Buttons
    document.getElementById('replayBtn')?.addEventListener('click', actions.onReplay);
    document.getElementById('gameOverMenuBtn')?.addEventListener('click', actions.onMenu);
  }

  public bindGameControls(actions: {
    onReset: () => void,
    onSuggest: () => void,
    onHistory?: (action: 'START' | 'PREV' | 'NEXT' | 'END') => void
  }): void {
    document.getElementById('resetBtn')?.addEventListener('click', actions.onReset);
    this.suggestBtnEl?.addEventListener('click', actions.onSuggest);
    
    if (actions.onHistory) {
        this.histStartBtn?.addEventListener('click', () => actions.onHistory!('START'));
        this.histPrevBtn?.addEventListener('click', () => actions.onHistory!('PREV'));
        this.histNextBtn?.addEventListener('click', () => actions.onHistory!('NEXT'));
        this.histEndBtn?.addEventListener('click', () => actions.onHistory!('END'));
    }
  }

  public updateHistoryControls(current: number, total: number): void {
    if (this.histLabel) this.histLabel.textContent = `${current} / ${total}`;
    
    if (this.histStartBtn) this.histStartBtn.disabled = (current === 0);
    if (this.histPrevBtn) this.histPrevBtn.disabled = (current === 0);
    if (this.histNextBtn) this.histNextBtn.disabled = (current === total);
    if (this.histEndBtn) this.histEndBtn.disabled = (current === total);
  }

  public bindHeaderControls(actions: {
    onHome: () => void,
    onRules: () => void,
    onSettings: () => void
  }): void {
    document.getElementById('headerHomeBtn')?.addEventListener('click', actions.onHome);
    document.getElementById('headerRulesBtn')?.addEventListener('click', actions.onRules);
    document.getElementById('headerSettingsBtn')?.addEventListener('click', actions.onSettings);
  }

  public bindSettingsActions(actions: {
    onSave: () => void,
    onCancel: () => void
  }): void {
    document.getElementById('saveSettingsBtn')?.addEventListener('click', actions.onSave);
    document.getElementById('cancelSettingsBtn')?.addEventListener('click', actions.onCancel);
  }
}