/**
 * Wrapper (Proxy) pour l'IA WebAssembly.
 * 
 * Architecture :
 * Ce fichier sert d'interface entre le Main Thread (UI) et le Worker Thread (Calcul).
 * Il transforme l'API événementielle bas niveau (postMessage) en une API asynchrone moderne (Promise).
 */

import { Player, Position, GameState } from '../core/types.js';

type BestMoveResolve = (value: Position) => void;

export class WasmAI {
    private worker: Worker | null = null;
    
    // Gestion du cycle de vie du Worker
    private workerReadyPromise: Promise<void>;
    private resolveWorkerReady: () => void = () => {};
    private rejectWorkerReady: (reason?: unknown) => void = () => {};
    
    // Gestion de la requête en cours (Pattern Request/Response manuel)
    private bestMovePromise: Promise<Position> | null = null;
    private resolveBestMove: BestMoveResolve | null = null;
    private rejectBestMove: ((reason?: unknown) => void) | null = null;
    
    private aiPlayer: Player = Player.WHITE;

    constructor() {
        // On prépare la promesse d'initialisation
        this.workerReadyPromise = new Promise((resolve, reject) => {
            this.resolveWorkerReady = resolve;
            this.rejectWorkerReady = reject;
        });
        this.initializeWorker();
    }

    private initializeWorker(): void {
        try {
            this.worker = new Worker('ai_worker.js');

            // Routeur de messages (Worker -> Main)
            this.worker.onmessage = (event) => {
                const { type, payload } = event.data;
                switch (type) {
                    case 'worker_ready':
                        console.log('AI Worker is ready.');
                        this.resolveWorkerReady();
                        break;

                    case 'bestMoveResult':
                        // Le calcul est fini, on débloque la Promesse en attente
                        if (this.resolveBestMove) {
                            this.resolveBestMove(payload);
                            // Nettoyage
                            this.bestMovePromise = null;
                            this.resolveBestMove = null;
                        }
                        break;

                    case 'worker_error':
                        console.error('Critical AI Worker Error:', payload);
                        this.rejectWorkerReady(new Error(payload));
                        break;

                    case 'error':
                        console.error('Runtime AI Worker Error:', payload);
                        // Si une requête était en cours, on la fait échouer proprement
                        if (this.rejectBestMove) {
                            this.rejectBestMove(new Error(payload));
                            this.bestMovePromise = null;
                            this.resolveBestMove = null;
                            this.rejectBestMove = null;
                        }
                        break;
                }
            };

            this.worker.onerror = (error) => {
                console.error('An error occurred in the AI Worker:', error);
            };

        } catch (error) {
            console.error('Failed to initialize AI Worker:', error);
        }
    }

    public async initAI(aiPlayer: Player): Promise<void> {
        this.aiPlayer = aiPlayer;
        // On envoie la config sans attendre de réponse bloquante
        this.worker?.postMessage({ type: 'initAI', payload: { aiPlayer } });
        console.log(`AI initialized for player ${aiPlayer === Player.BLACK ? 'BLACK' : 'WHITE'}`);
    }

    /**
     * Demande un calcul de coup.
     * 
     * Promisification
     * 1. On crée une Promise.
     * 2. On stocke ses fonctions de contrôle (resolve/reject) dans l'instance.
     * 3. On envoie le message au Worker.
     * 4. On attend... (le Worker répondra via onmessage qui appellera notre resolve stocké).
     */
    public getBestMove(gameState: GameState): Promise<Position> {
        // Sécurité : Une seule requête à la fois
        if (!this.bestMovePromise) {
            this.bestMovePromise = new Promise((resolve, reject) => {
                this.resolveBestMove = resolve;
                this.rejectBestMove = reject;
                
                // Aplatissement du board (2D -> 1D) pour faciliter le transfert mémoire vers C++
                const flatBoard = gameState.board.flat();
                this.worker?.postMessage({ type: 'getBestMove', payload: { flatBoard } });
            });
        }
        return this.bestMovePromise;
    }

    // Permet à l'UI d'attendre que le binaire Wasm soit chargé et compilé
    public async isReady(): Promise<boolean> {
        await this.workerReadyPromise;
        return this.worker !== null;
    }

    public getAIPlayer(): Player {
        return this.aiPlayer;
    }

    public cleanup(): void {
        if (this.worker) {
            this.worker.postMessage({ type: 'cleanup' });
            this.worker.terminate();
            this.worker = null;
        }
    }
}

// Factory Helper
export async function createWasmAI(): Promise<WasmAI> {
    const ai = new WasmAI();
    await ai.isReady(); // Bloque jusqu'à ce que le Worker soit opérationnel
    return ai;
}
