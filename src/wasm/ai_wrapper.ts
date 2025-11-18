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
    private bestMovePromise: Promise<Position> | null = null;
    private resolveBestMove: BestMoveResolve | null = null;
    private aiPlayer: Player = Player.WHITE;

    constructor() {
        this.isReadyPromise = new Promise(resolve => {
            this.resolveIsReady = resolve;
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
                    case 'error':
                        console.error('Error from AI Worker:', payload);
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
        await this.isReadyPromise;
        this.aiPlayer = aiPlayer;
        this.worker?.postMessage({ type: 'initAI', payload: { aiPlayer } });
        console.log(`AI initialized for player ${aiPlayer === Player.BLACK ? 'BLACK' : 'WHITE'}`);
    }

    public async updateGameState(gameState: GameState): Promise<void> {
        await this.isReadyPromise;
        const flatBoard = this.flattenBoard(gameState.board);
        this.worker?.postMessage({ type: 'updateGameState', payload: { flatBoard } });
    }

    public getBestMove(): Promise<Position> {
        if (!this.bestMovePromise) {
            this.bestMovePromise = new Promise(async (resolve) => {
                await this.isReadyPromise;
                this.resolveBestMove = resolve;
                this.worker?.postMessage({ type: 'getBestMove' });
            });
        }
        return this.bestMovePromise;
    }

    private flattenBoard(board: Player[][]): number[] {
        const flatBoard: number[] = new Array(19 * 19);
        for (let row = 0; row < 19; row++) {
            for (let col = 0; col < 19; col++) {
                flatBoard[row * 19 + col] = board[row][col];
            }
        }
        return flatBoard;
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
