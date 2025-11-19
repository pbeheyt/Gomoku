// @src/renderer/ui_manager.ts
import { Player, GameMode } from '../core/types.js';

export type AppState = 'MENU' | 'IN_GAME' | 'GAME_OVER';
export type ModalButton = { text: string; callback: () => void; className?: string; };

export class UIManager {
  private mainMenuEl: HTMLElement | null;
  private gameOverMenuEl: HTMLElement | null;
  private gameContainerEl: HTMLElement | null;
  private winnerMessageEl: HTMLElement | null;
  private suggestBtnEl: HTMLElement | null;
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
  private messageEl: HTMLElement | null = null;
  
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

  constructor() {
    this.mainMenuEl = document.getElementById('mainMenu');
    this.gameOverMenuEl = document.getElementById('gameOverMenu');
    this.gameContainerEl = document.getElementById('gameContainer');
    this.winnerMessageEl = document.getElementById('winnerMessage');
    this.suggestBtnEl = document.getElementById('suggestBtn');
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

    // Setup Modal
    this.setupModalEl = document.getElementById('setupModal');
    this.setupModelSelectEl = document.getElementById('setupModelSelect') as HTMLSelectElement;
    this.setupColorBtns = document.querySelectorAll('.btn-color');
    this.setupStartBtn = document.getElementById('startGameBtn');
    this.setupCancelBtn = document.getElementById('cancelSetupBtn');
    this.setupModelSection = document.getElementById('modelSelectionSection');
    this.setupColorSection = document.getElementById('colorSelection');
  }

  public showView(view: AppState): void {
    this.mainMenuEl?.classList.toggle('hidden', view !== 'MENU');
    this.gameContainerEl?.classList.toggle('hidden', view !== 'IN_GAME');
    this.gameOverMenuEl?.classList.toggle('hidden', view !== 'GAME_OVER');
  }

  public updateGameInfo(player: Player, blackCaptures: number, whiteCaptures: number, mode: GameMode): void {
    document.getElementById('playerInfoBlack')?.classList.toggle('active-player', player === Player.BLACK);
    document.getElementById('playerInfoWhite')?.classList.toggle('active-player', player === Player.WHITE);
    
    if (document.getElementById('blackCaptures')) document.getElementById('blackCaptures')!.textContent = `Captures: ${blackCaptures} / 10`;
    if (document.getElementById('whiteCaptures')) document.getElementById('whiteCaptures')!.textContent = `Captures: ${whiteCaptures} / 10`;

    const isAiGame = mode === GameMode.PLAYER_VS_AI || mode === GameMode.PLAYER_VS_LLM || mode === GameMode.AI_VS_LLM;
    this.aiTimerSectionEl?.classList.toggle('hidden', !isAiGame);

    const isLlmMode = mode === GameMode.PLAYER_VS_LLM || mode === GameMode.AI_VS_LLM;
    this.aiReasoningSectionEl?.classList.toggle('hidden', !isLlmMode);
    
    this.suggestBtnEl?.classList.toggle('hidden', mode !== GameMode.PLAYER_VS_PLAYER);
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
    this.settingsModalEl?.classList.remove('hidden');
  }

  public hideSettingsModal(): void {
    this.settingsModalEl?.classList.add('hidden');
  }

  public getSettingsValues(): { apiKey: string, model: string } {
    return {
      apiKey: this.apiKeyInputEl?.value || '',
      model: this.modelSelectEl?.value || ''
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
    if (!this.messageEl) {
      this.messageEl = document.createElement('div');
      this.messageEl.id = 'gameMessage';
      this.messageEl.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: white; padding: 10px 20px; border-radius: 5px; z-index: 1000;';
      document.body.appendChild(this.messageEl);
    }
    this.messageEl.textContent = message;
    this.messageEl.style.display = 'block';
    setTimeout(() => { if (this.messageEl) this.messageEl.style.display = 'none'; }, 3000);
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

    // Game Over Buttons
    document.getElementById('replayBtn')?.addEventListener('click', actions.onReplay);
    document.getElementById('gameOverMenuBtn')?.addEventListener('click', actions.onMenu);
  }

  public bindGameControls(actions: {
    onReset: () => void,
    onSuggest: () => void,
  }): void {
    document.getElementById('resetBtn')?.addEventListener('click', actions.onReset);
    this.suggestBtnEl?.addEventListener('click', actions.onSuggest);
  }

  public bindHeaderControls(actions: {
    onHome: () => void,
    onRules: () => void,
    onSettings: () => void,
    onViewToggle: () => void
  }): void {
    document.getElementById('headerHomeBtn')?.addEventListener('click', actions.onHome);
    document.getElementById('headerRulesBtn')?.addEventListener('click', actions.onRules);
    document.getElementById('headerSettingsBtn')?.addEventListener('click', actions.onSettings);
    document.getElementById('headerViewBtn')?.addEventListener('click', actions.onViewToggle);
  }

  public bindSettingsActions(actions: {
    onSave: () => void,
    onCancel: () => void
  }): void {
    document.getElementById('saveSettingsBtn')?.addEventListener('click', actions.onSave);
    document.getElementById('cancelSettingsBtn')?.addEventListener('click', actions.onCancel);
  }
}