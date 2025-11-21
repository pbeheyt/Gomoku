/**
 * Web Worker for Gomoku AI
 * This script runs in a separate thread to avoid blocking the UI.
 * It loads the WebAssembly module and communicates with the main thread.
 */

// Interface describing the Emscripten Module exports
interface GomokuModule {
  _initAI: (player: number) => void;
  _setBoard: (ptr: number) => void;
  _makeMove: (row: number, col: number, player: number) => void;
  _getBestMove: () => number;
  _cleanupAI: () => void;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAP32: Int32Array;
}

let wasmModule: GomokuModule | null = null;

/**
 * Load and initialize the WebAssembly module.
 */
async function loadWasmModule() {
    // The 'ia_core.js' script is expected to be in the same directory as the worker script
    // in the final build output.
    self.importScripts('ia_core.js');

    // @ts-expect-error - GomokuAI is loaded globally by importScripts
    const GomokuAIModule = self.GomokuAI;

    if (!GomokuAIModule) {
        throw new Error('GomokuAI module not found in worker');
    }

    wasmModule = await GomokuAIModule();
    if (!wasmModule) {
        throw new Error('Failed to instantiate WebAssembly module in worker');
    }
}

// Load the module as soon as the worker starts.
const wasmReadyPromise = loadWasmModule().then(() => {
    console.log('WebAssembly AI module loaded successfully in worker');
    // Signal to the main thread that the worker is ready.
    self.postMessage({ type: 'worker_ready' });
}).catch(error => {
    console.error('Error loading Wasm in worker:', error);
    // Signal a failure to the main thread.
    self.postMessage({ type: 'worker_error', payload: error.message });
});

/**
 * Handle messages from the main thread.
 */
self.onmessage = async (event) => {
    // Ensure the Wasm module is ready before processing commands.
    await wasmReadyPromise;

    if (!wasmModule) {
        self.postMessage({ type: 'error', payload: 'Wasm module not initialized.' });
        return;
    }

    const { type, payload } = event.data;

    try {
        switch (type) {
            case 'initAI':
                wasmModule._initAI(payload.aiPlayer);
                break;

            case 'getBestMove': {
                // Expect flatBoard as payload in this request
                const flatBoard = payload?.flatBoard;

                if (!flatBoard || !Array.isArray(flatBoard)) {
                    self.postMessage({ type: 'error', payload: 'Invalid or missing flatBoard in getBestMove payload' });
                    break;
                }

                // Modern replacement for deprecated allocate/ALLOC_NORMAL
                // 1. Calculate size (int32 = 4 bytes)
                const bytesPerElement = 4;
                const ptr = wasmModule._malloc(flatBoard.length * bytesPerElement);

                try {
                    // 2. Copy data to Wasm Heap (divide pointer by 4 because HEAP32 is an Int32Array view)
                    wasmModule.HEAP32.set(flatBoard, ptr >> 2);

                    // 3. Call C++ function to set board in Wasm memory
                    wasmModule._setBoard(ptr);

                    // 4. Compute best move
                    const result = wasmModule._getBestMove();
                    const row = Math.floor(result / 100);
                    const col = result % 100;

                    // Send the result back to the main thread.
                    self.postMessage({ type: 'bestMoveResult', payload: { row, col } });
                } finally {
                    // 5. Free memory as soon as possible
                    wasmModule._free(ptr);
                }
                break;
            }

            case 'cleanup':
                if (wasmModule._cleanupAI) {
                    wasmModule._cleanupAI();
                }
                wasmModule = null;
                break;
        }
    } catch (error) {
        console.error(`Error in worker processing message type ${type}:`, error);
        self.postMessage({ type: 'error', payload: (error as Error).message });
    }
};