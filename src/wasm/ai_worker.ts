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
  _rules_validateMove: (row: number, col: number, player: number) => number;
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
        throw new Error('Module GomokuAI pas trouvé après importScripts');
    }

    // Injection des canaux de sortie pour les logs C++
    wasmModule = await GomokuAIModule({
        print: (text: string) => console.log("%c[C++ LOG]", "color: cyan; font-weight: bold;", text),
        printErr: (text: string) => console.error("%c[C++ ERR]", "color: red; font-weight: bold;", text)
    });

    if (!wasmModule) {
        throw new Error('Échec de l\'instanciation du module WebAssembly dans le worker');
    }
}

// Initialisation au démarrage du Worker
const wasmReadyPromise = loadWasmModule().then(() => {
    console.log('Module IA WebAssembly chargé avec succès dans le worker');
    self.postMessage({ type: 'worker_ready' });
}).catch(error => {
    console.error('Erreur lors du chargement du Wasm dans le worker :', error);
    self.postMessage({ type: 'worker_error', payload: error.message });
});

/**
 * Gestionnaire de messages (Main Thread -> Worker).
 */
self.onmessage = async (event) => {
    // On attend que le C++ soit prêt avant de traiter la requête
    await wasmReadyPromise;

    if (!wasmModule) {
        self.postMessage({ type: 'error', payload: 'Module WebAssembly non initialisé.' });
        return;
    }

    const { type, payload } = event.data;

    try {
        switch (type) {
            case 'initAI':
                wasmModule._initAI(payload.aiPlayer);
                break;

            case 'setBoard': {
                const flatBoard = payload?.flatBoard;
                if (!flatBoard || !Array.isArray(flatBoard)) break;

                // Stratégie Zero Malloc
                const ptr = wasmModule._get_board_buffer();
                wasmModule.HEAP32.set(flatBoard, ptr >> 2);
                wasmModule._setBoard(ptr);
                
                // Confirmation
                self.postMessage({ type: 'setBoard_done' });
                break;
            }

            case 'makeMove': {
                wasmModule._makeMove(payload.row, payload.col, payload.player);
                self.postMessage({ type: 'makeMove_done' });
                break;
            }

            case 'getBestMove': {
                // Payload : Le board aplati (1D Array)
                const flatBoard = payload?.flatBoard;

                if (!flatBoard || !Array.isArray(flatBoard)) {
                    self.postMessage({ type: 'error', payload: "flatBoard invalide ou manquant dans le payload de getBestMove" });
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

            case 'rules_validateMove':
                self.postMessage({ 
                    type: 'rules_validateMove_result', 
                    payload: wasmModule._rules_validateMove(payload.row, payload.col, payload.player)
                });
                break;

            case 'rules_checkWin':
                self.postMessage({ 
                    type: 'rules_checkWin_result', 
                    payload: wasmModule._rules_checkWin(payload.row, payload.col, payload.player) === 1 
                });
                break;

            case 'rules_checkCaptures': {

                // Appel au C++ : Récupération du pointeur vers le buffer statique
                const ptr = wasmModule._rules_checkCaptures(payload.row, payload.col, payload.player);
                
                // Conversion Pointeur (octets) -> Index (int32)
                const startIdx = ptr >> 2;
                
                // Lecture du compteur de pierres (Index 0)
                const stoneCount = wasmModule.HEAP32[startIdx];
                
                const captures = [];
                
                // Curseur de lecture : Démarre juste après le compteur
                let readCursor = startIdx + 1;
                
                // Boucle par paire de pierres (Une capture = 2 pierres)
                for (let i = 0; i < stoneCount; i += 2) {
                    // Lecture séquentielle des coordonnées (Ligne, Colonne) pour la paire
                    const r1 = wasmModule.HEAP32[readCursor++];
                    const c1 = wasmModule.HEAP32[readCursor++];
                    const r2 = wasmModule.HEAP32[readCursor++];
                    const c2 = wasmModule.HEAP32[readCursor++];
                    
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
        console.error(`Erreur lors du traitement du type de message ${type} dans le worker :`, error);
        self.postMessage({ type: 'error', payload: (error as Error).message });
    }
};