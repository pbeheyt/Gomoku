/**
 * Web Worker for Gomoku AI
 * This script runs in a separate thread to avoid blocking the UI.
 * It loads the WebAssembly module and communicates with the main thread.
 */

let wasmModule: any = null;

/**
 * Load and initialize the WebAssembly module.
 */
async function loadWasmModule() {
    // The 'ia_core.js' script is expected to be in the same directory as the worker script
    // in the final build output.
    self.importScripts('ia_core.js');

    // @ts-ignore - GomokuAI is loaded globally by importScripts
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

            case 'updateGameState':
                const flatBoard = payload.flatBoard;
                // Modern replacement for deprecated allocate/ALLOC_NORMAL
                // 1. Calculate size (int32 = 4 bytes)
                const bytesPerElement = 4;
                const ptr = wasmModule._malloc(flatBoard.length * bytesPerElement);
                
                // 2. Copy data to Wasm Heap (divide pointer by 4 because HEAP32 is an Int32Array view)
                wasmModule.HEAP32.set(flatBoard, ptr >> 2);
                
                // 3. Call C++ function
                wasmModule._setBoard(ptr);
                
                // 4. Free memory
                wasmModule._free(ptr);
                break;

            case 'getBestMove':
                const result = wasmModule._getBestMove();
                const row = Math.floor(result / 100);
                const col = result % 100;
                
                // Send the result back to the main thread.
                self.postMessage({ type: 'bestMoveResult', payload: { row, col } });
                break;

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