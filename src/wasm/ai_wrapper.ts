/**
 * WebAssembly AI Wrapper
 * Handles communication between TypeScript and C++ AI via WebAssembly
 */

import { Player, Position, GameState } from '../core/types.js';

export class WasmAI {
    private wasmModule: any = null;
    private isInitialized: boolean = false;
    private aiPlayer: Player = Player.WHITE; // AI plays as WHITE by default

    constructor() {
        this.loadWasmModule();
    }

    /**
     * Load the WebAssembly module
     */
    private async loadWasmModule(): Promise<void> {
        try {
            // Load the JavaScript wrapper that includes the WASM module
            const moduleScript = document.createElement('script');
            moduleScript.src = 'ia_core.js';
            
            await new Promise<void>((resolve, reject) => {
                moduleScript.onload = () => resolve();
                moduleScript.onerror = () => reject(new Error('Failed to load ia_core.js'));
                document.head.appendChild(moduleScript);
            });

            // @ts-ignore - GomokuAI will be available globally after script loads
            const GomokuAIModule = (window as any).GomokuAI;
            if (!GomokuAIModule) {
                throw new Error('GomokuAI module not found');
            }

            // Initialize the module
            const module = await GomokuAIModule();
            this.wasmModule = module;
            this.isInitialized = true;
            console.log('WebAssembly AI module loaded successfully');
        } catch (error) {
            console.error('Failed to load WebAssembly AI module:', error);
            this.isInitialized = false;
        }
    }

    /**
     * Initialize the AI with the player color
     */
    public initAI(aiPlayer: Player): void {
        if (!this.isInitialized) {
            throw new Error('WebAssembly AI module not initialized');
        }
        
        if (!this.wasmModule._initAI) {
            throw new Error('WebAssembly AI module missing required function: _initAI');
        }
        
        this.aiPlayer = aiPlayer;
        this.wasmModule._initAI(aiPlayer);
        console.log(`AI initialized for player ${aiPlayer === Player.BLACK ? 'BLACK' : 'WHITE'}`);
    }

    /**
     * Update the AI with the current game state
     */
    public updateGameState(gameState: GameState): void {
        if (!this.isInitialized) {
            throw new Error('WebAssembly AI module not initialized');
        }
        
        if (!this.wasmModule._setBoard) {
            throw new Error('WebAssembly AI module missing required function: _setBoard');
        }
        
        // Convert 2D board to flattened array
        const flatBoard = this.flattenBoard(gameState.board);
        
        // Use Emscripten's helper function to write array to memory
        const boardPtr = this.wasmModule.allocate(flatBoard, 'i32', this.wasmModule.ALLOC_NORMAL);
        
        // Update AI with new board state
        this.wasmModule._setBoard(boardPtr);
        
        // Free the allocated memory
        this.wasmModule._free(boardPtr);
    }

    /**
     * Make a move on the AI's internal board
     */
    public makeMove(position: Position, player: Player): void {
        if (!this.isInitialized) {
            throw new Error('WebAssembly AI module not initialized');
        }
        
        if (!this.wasmModule._makeMove) {
            throw new Error('WebAssembly AI module missing required function: _makeMove');
        }
        
        this.wasmModule._makeMove(position.row, position.col, player);
    }

    /**
     * Get the best move from the AI
     */
    public getBestMove(): Position | null {
        if (!this.isInitialized) {
            throw new Error('WebAssembly AI module not initialized');
        }
        
        if (!this.wasmModule._getBestMove) {
            throw new Error('WebAssembly AI module missing required function: _getBestMove');
        }
        
        const result = this.wasmModule._getBestMove();
        
        if (result === -1) {
            throw new Error('AI failed to generate a valid move');
        }
        
        // Decode result: row * 100 + col
        const row = Math.floor(result / 100);
        const col = result % 100;
        
        if (row < 0 || row >= 19 || col < 0 || col >= 19) {
            throw new Error(`AI returned invalid move coordinates: row=${row}, col=${col}`);
        }
        
        return { row, col };
    }

    /**
     * Convert 2D board array to flattened 1D array
     */
    private flattenBoard(board: Player[][]): number[] {
        const flatBoard: number[] = new Array(19 * 19);
        
        for (let row = 0; row < 19; row++) {
            for (let col = 0; col < 19; col++) {
                flatBoard[row * 19 + col] = board[row][col];
            }
        }
        
        return flatBoard;
    }

    /**
     * Check if the WebAssembly module is ready
     */
    public isReady(): boolean {
        return this.isInitialized && this.wasmModule !== null;
    }

    /**
     * Get the AI player color
     */
    public getAIPlayer(): Player {
        return this.aiPlayer;
    }

    /**
     * Clean up AI resources
     */
    public cleanup(): void {
        if (!this.isInitialized) {
            return;
        }
        
        if (this.wasmModule._cleanupAI) {
            this.wasmModule._cleanupAI();
        }
        this.isInitialized = false;
        this.wasmModule = null;
    }
}

/**
 * Factory function to create AI instance
 */
export async function createWasmAI(): Promise<WasmAI> {
    const ai = new WasmAI();
    
    // Wait for WASM module to load
    while (!ai.isReady()) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return ai;
}
