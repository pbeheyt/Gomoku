/**
 * Wrapper (Proxy) pour l'IA WebAssembly.
 * 
 * Architecture :
 * Ce fichier sert d'interface entre le Main Thread (UI) et le Worker Thread (Calcul).
 * Il transforme l'API événementielle bas niveau (postMessage) en une API asynchrone moderne (Promise).
 */

import { Player, Position, GameState } from '../core/types.js';

export class WasmAI {
    private worker: Worker | null = null;
    
    // Gestion du cycle de vie du Worker
    private workerReadyPromise: Promise<void>;
    private resolveWorkerReady: () => void = () => {};
    private rejectWorkerReady: (reason?: unknown) => void = () => {};
    
    // File d'attente générique pour TOUTES les requêtes (Map<TypeRéponse, Résolveur>)
    private pendingQueries: Map<string, {resolve: (val: any) => void, reject: (err: any) => void}> = new Map();
    
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
                        console.log('IA non prête dans le worker');
                        this.resolveWorkerReady();
                        break;

                    case 'setBoard_done':
                        this.resolveQuery('setBoard_done', null);
                        break;
                    case 'makeMove_done':
                        this.resolveQuery('makeMove_done', null);
                        break;

                    case 'bestMoveResult':
                        this.resolveQuery('bestMoveResult', payload);
                        break;

                    // --- RULES RESPONSES ---
                    case 'rules_validateMove_result':
                    case 'rules_checkWin_result':
                    case 'rules_checkCaptures_result':
                        this.resolveQuery(type, payload);
                        break;

                    case 'worker_error':
                        console.error('Erreur critique du worker IA :', payload);
                        this.rejectWorkerReady(new Error(payload));
                        break;

                    case 'error':
                        console.error('Erreur d\'exécution du worker IA :', payload);
                        // Rejeter toutes les requêtes en attente
                        this.pendingQueries.forEach((query) => {
                            query.reject(new Error(payload));
                        });
                        this.pendingQueries.clear();
                        break;
                }
            };

            this.worker.onerror = (error) => {
                console.error('Une erreur est survenue dans le worker IA :', error);
            };

        } catch (error) {
            console.error('Échec de l\'initialisation du worker IA :', error);
        }
    }

    public async initAI(aiPlayer: Player): Promise<void> {
        this.aiPlayer = aiPlayer;
        this.worker?.postMessage({ type: 'initAI', payload: { aiPlayer } });
    }

    public setBoard(flatBoard: number[], blackCaptures: number, whiteCaptures: number): Promise<void> {
        return this.sendQuery('setBoard', 'setBoard_done', { flatBoard, blackCaptures, whiteCaptures });
    }

    public makeMove(row: number, col: number, player: Player): Promise<void> {
        return this.sendQuery('makeMove', 'makeMove_done', { row, col, player });
    }

    /**
     * Demande un calcul de coup.
     * Utilise le système générique de requête.
     */
    public getBestMove(gameState: GameState): Promise<Position> {
        // Aplatissement du board (2D -> 1D) pour faciliter le transfert mémoire vers C++
        const flatBoard = gameState.board.flat();
        return this.sendQuery('getBestMove', 'bestMoveResult', { flatBoard });
    }

    // Permet à l'UI d'attendre que le binaire Wasm soit chargé et compilé
    public async isReady(): Promise<boolean> {
        await this.workerReadyPromise;
        return this.worker !== null;
    }

    // --- RULES API ---

    /**
     * Returns 0 if valid, or an error code > 0.
     */
    public async validateMove(row: number, col: number, player: Player): Promise<number> {
        return this.sendQuery('rules_validateMove', 'rules_validateMove_result', { row, col, player });
    }

    public async checkWin(row: number, col: number, player: Player): Promise<boolean> {
        return this.sendQuery('rules_checkWin', 'rules_checkWin_result', { row, col, player });
    }

    public async checkCaptures(row: number, col: number, player: Player): Promise<any[]> {
        return this.sendQuery('rules_checkCaptures', 'rules_checkCaptures_result', { row, col, player });
    }

    public async checkStalemate(player: Player): Promise<boolean> {
        return this.sendQuery('rules_checkStalemate', 'rules_checkStalemate_result', { player });
    }

    // --- INTERNAL HELPERS ---

    private sendQuery(requestType: string, responseType: string, payload: any): Promise<any> {
        return new Promise((resolve, reject) => {
            // On enregistre le résolveur pour le TYPE DE RÉPONSE ATTENDU
            this.pendingQueries.set(responseType, { resolve, reject });
            this.worker?.postMessage({ type: requestType, payload });
        });
    }

    private resolveQuery(type: string, result: any) {
        const query = this.pendingQueries.get(type);
        if (query) {
            query.resolve(result);
            this.pendingQueries.delete(type);
        }
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
