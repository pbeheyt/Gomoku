/**
 * WebAssembly AI Wrapper
 * Handles asynchronous communication with the AI Web Worker.
 */

import { Player, Position, GameState } from '../core/types.js';

type BestMoveResolve = (value: Position) => void;

export class WasmAI {
    private worker: Worker | null = null;
    private isReadyPromise: Promise<void>;
    private resolveIsReady: () => void = () => {};
    private rejectIsReady: (reason?: any) => void = () => {};
    private bestMovePromise: Promise<Position> | null = null;
    private resolveBestMove: BestMoveResolve | null = null;
    private rejectBestMove: ((reason?: any) => void) | null = null;
    private aiPlayer: Player = Player.WHITE;

    constructor() {
        this.isReadyPromise = new Promise((resolve, reject) => {
            this.resolveIsReady = resolve;
            this.rejectIsReady = reject;
        });
        this.initializeWorker();
    }

    private initializeWorker(): void {
        try {
            this.worker = new Worker('ai_worker.js');

            this.worker.onmessage = (event) => {
                const { type, payload } = event.data;
                switch (type) {
                    case 'worker_ready':
                        console.log('AI Worker is ready.');
                        this.resolveIsReady();
                        break;
                    case 'bestMoveResult':
                        if (this.resolveBestMove) {
                            this.resolveBestMove(payload);
                            this.bestMovePromise = null;
                            this.resolveBestMove = null;
                        }
                        break;
                    case 'worker_error':
                        // Critical initialization error
                        console.error('Critical AI Worker Error:', payload);
                        this.rejectIsReady(new Error(payload));
                        break;
                    case 'error':
                        console.error('Runtime AI Worker Error:', payload);
                        // If we are waiting for a move, reject it
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
        this.worker?.postMessage({ type: 'initAI', payload: { aiPlayer } });
        console.log(`AI initialized for player ${aiPlayer === Player.BLACK ? 'BLACK' : 'WHITE'}`);
    }

    public getBestMove(gameState: GameState): Promise<Position> {
        if (!this.bestMovePromise) {
            this.bestMovePromise = new Promise((resolve, reject) => {
                this.resolveBestMove = resolve;
                this.rejectBestMove = reject;
                const flatBoard = gameState.board.flat();
                this.worker?.postMessage({ type: 'getBestMove', payload: { flatBoard } });
            });
        }
        return this.bestMovePromise;
    }

    public async isReady(): Promise<boolean> {
        await this.isReadyPromise;
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

export async function createWasmAI(): Promise<WasmAI> {
    const ai = new WasmAI();
    await ai.isReady(); // Wait for the worker to signal it's ready
    return ai;
}
