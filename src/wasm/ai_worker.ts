/**
 * Web Worker IA (Thread dédié).
 * 
 * Rôle : Exécuter le code C++ (via Wasm) sans bloquer le Thread Principal (UI).
 * Responsable de l'allocation mémoire manuelle pour les échanges de données JS <-> C++.
 */

// Interface décrivant les exports du Module Emscripten (C++)
interface GomokuModule {
  _initAI: (player: number) => void;
  _setBoard: (ptr: number) => void;
  _makeMove: (row: number, col: number, player: number) => void;
  _getBestMove: () => number;
  _cleanupAI: () => void;

  // Exports du moteur de règles
  _rules_isValidMove: (row: number, col: number) => number;
  _rules_isSuicide: (row: number, col: number, player: number) => number;
  _rules_checkDoubleThree: (row: number, col: number, player: number) => number;
  _rules_checkWin: (row: number, col: number, player: number) => number;
  // Retourne un pointeur vers un tableau d'entiers statique. Index 0 = nombre, puis l, c, l, c...
  _rules_checkCaptures: (row: number, col: number, player: number) => number; 

  _get_board_buffer: () => number; // Retourne un pointeur vers le buffer statique du board
  HEAP32: Int32Array;
}

let wasmModule: GomokuModule | null = null;

/**
 * Charge et instancie le module WebAssembly.
 * Utilise 'importScripts' (spécifique Worker) pour charger le code de glue Emscripten.
 */
async function loadWasmModule() {
    self.importScripts('ia_core.js');

    // @ts-expect-error - GomokuAI est injecté dans le scope global par importScripts
    const GomokuAIModule = self.GomokuAI;

    if (!GomokuAIModule) {
        throw new Error('GomokuAI module not found in worker');
    }

    wasmModule = await GomokuAIModule();
    if (!wasmModule) {
        throw new Error('Failed to instantiate WebAssembly module in worker');
    }
}

// Initialisation au démarrage du Worker
const wasmReadyPromise = loadWasmModule().then(() => {
    console.log('WebAssembly AI module loaded successfully in worker');
    self.postMessage({ type: 'worker_ready' });
}).catch(error => {
    console.error('Error loading Wasm in worker:', error);
    self.postMessage({ type: 'worker_error', payload: error.message });
});

/**
 * Gestionnaire de messages (Main Thread -> Worker).
 */
self.onmessage = async (event) => {
    // On attend que le C++ soit prêt avant de traiter la requête
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
                // Payload : Le board aplati (1D Array)
                const flatBoard = payload?.flatBoard;

                if (!flatBoard || !Array.isArray(flatBoard)) {
                    self.postMessage({ type: 'error', payload: 'Invalid or missing flatBoard in getBestMove payload' });
                    break;
                }

                // STRATÉGIE ZÉRO MALLOC
                // 1. Obtenir le pointeur vers le buffer statique en C++
                const ptr = wasmModule._get_board_buffer();

                // 2. Écrire les données directement dans la mémoire Wasm
                // ptr est en octets, HEAP32 est une vue int32, donc diviser par 4
                wasmModule.HEAP32.set(flatBoard, ptr >> 2);

                // 3. Dire à l'IA de lire depuis ce buffer
                wasmModule._setBoard(ptr);

                // 4. Calculer
                const result = wasmModule._getBestMove();
                const row = Math.floor(result / 100);
                const col = result % 100;

                self.postMessage({ type: 'bestMoveResult', payload: { row, col } });
                break;
            }

            // --- REQUÊTES DE RÈGLES ---

            case 'rules_isValidMove':
                self.postMessage({ 
                    type: 'rules_isValidMove_result', 
                    payload: wasmModule._rules_isValidMove(payload.row, payload.col) === 1 
                });
                break;

            case 'rules_isSuicide':
                self.postMessage({ 
                    type: 'rules_isSuicide_result', 
                    payload: wasmModule._rules_isSuicide(payload.row, payload.col, payload.player) === 1 
                });
                break;

            case 'rules_checkDoubleThree':
                self.postMessage({ 
                    type: 'rules_checkDoubleThree_result', 
                    payload: wasmModule._rules_checkDoubleThree(payload.row, payload.col, payload.player) === 1 
                });
                break;

            case 'rules_checkWin':
                self.postMessage({ 
                    type: 'rules_checkWin_result', 
                    payload: wasmModule._rules_checkWin(payload.row, payload.col, payload.player) === 1 
                });
                break;

            case 'rules_checkCaptures': {
                // Appelle la fonction C++ qui retourne un pointeur vers le buffer statique
                const ptr = wasmModule._rules_checkCaptures(payload.row, payload.col, payload.player);
                
                // Lire depuis HEAP32
                // L'index 0 contient le nombre
                const startIdx = ptr >> 2;
                const count = wasmModule.HEAP32[startIdx];
                
                const captures = [];
                
                // Les données commencent à l'index 1. Chaque pierre est 2 entiers (ligne, col).
                // Une capture est une paire, donc on boucle par 2 pierres (4 entiers).
                for (let i = 0; i < count; i += 2) {
                    const base = startIdx + 1 + (i * 2);
                    
                    const r1 = wasmModule.HEAP32[base];
                    const c1 = wasmModule.HEAP32[base + 1];
                    const r2 = wasmModule.HEAP32[base + 2];
                    const c2 = wasmModule.HEAP32[base + 3];
                    
                    captures.push({
                        capturedPositions: [{row: r1, col: c1}, {row: r2, col: c2}],
                        newCaptureCount: 0 
                    });
                }
                
                self.postMessage({ type: 'rules_checkCaptures_result', payload: captures });
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