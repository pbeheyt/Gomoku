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
  _malloc: (size: number) => number; // Allocation mémoire manuelle
  _free: (ptr: number) => void;      // Libération mémoire manuelle
  HEAP32: Int32Array;                // Vue directe sur la RAM du Wasm (Entiers 32 bits)
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
                // Payload : Le plateau aplati (1D Array)
                const flatBoard = payload?.flatBoard;

                if (!flatBoard || !Array.isArray(flatBoard)) {
                    self.postMessage({ type: 'error', payload: 'Invalid or missing flatBoard in getBestMove payload' });
                    break;
                }

                // --- GESTION MÉMOIRE (CRITIQUE) ---
                // Le C++ ne peut pas lire les objets JS. Il faut copier les données dans SA mémoire (Heap).
                
                // 1. Allocation : On réserve de l'espace dans le Heap Wasm.
                // int32 = 4 octets par case.
                const bytesPerElement = 4;
                const ptr = wasmModule._malloc(flatBoard.length * bytesPerElement);

                try {
                    // 2. Copie : JS -> Wasm Heap.
                    // HEAP32 est une vue Int32Array.
                    // On divise le pointeur (octets) par 4 pour obtenir l'index (entiers).
                    // (ptr >> 2) est équivalent à (ptr / 4) mais plus idiomatique/rapide.
                    wasmModule.HEAP32.set(flatBoard, ptr >> 2);

                    // 3. Exécution : On passe le POINTEUR au C++.
                    wasmModule._setBoard(ptr);

                    // 4. Calcul
                    const result = wasmModule._getBestMove();
                    const row = Math.floor(result / 100);
                    const col = result % 100;

                    // 5. Réponse
                    self.postMessage({ type: 'bestMoveResult', payload: { row, col } });
                } finally {
                    // 6. Nettoyage : INDISPENSABLE.
                    // Contrairement au JS, il n'y a pas de Garbage Collector ici.
                    // Si on ne free pas, on leak de la mémoire à chaque tour.
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