
interface GomokuModule {
  _initAI: (player: number) => void;
  _setBoard: (
    ptr: number,
    blackCaptures: number,
    whiteCaptures: number
  ) => void;
  _makeMove: (row: number, col: number, player: number) => void;
  _getBestMove: () => number;
  _cleanupAI: () => void;

  // Exports
  _rules_validateMove: (row: number, col: number, player: number) => number;
  _rules_checkWinAt: (row: number, col: number, player: number) => number;
  _rules_checkWin: (player: number) => number;
  _rules_checkCaptures: (row: number, col: number, player: number) => number;
  _rules_checkStalemate: (player: number) => number;

  _get_board_buffer: () => number;
  _getAiCandidateMoves: () => number;
  HEAP32: Int32Array;
}

let wasmModule: GomokuModule | null = null;

async function loadWasmModule() {
  self.importScripts("ia_core.js");

  // @ts-expect-error (GomokuAI est injecté dans le scope global par importScripts)
  const GomokuAIModule = self.GomokuAI;

  if (!GomokuAIModule) {
    throw new Error("Module GomokuAI pas trouvé après importScripts");
  }

  // Logs C++
  wasmModule = await GomokuAIModule({
    print: (text: string) =>
      console.log("%c[C++ LOG]", "color: cyan; font-weight: bold;", text),
    printErr: (text: string) =>
      console.error("%c[C++ ERR]", "color: red; font-weight: bold;", text),
  });

  if (!wasmModule) {
    throw new Error(
      "Échec de l'instanciation du module WebAssembly dans le worker"
    );
  }
}

const wasmReadyPromise = loadWasmModule()
  .then(() => {
    console.log("Module IA WebAssembly chargé avec succès dans le worker");
    self.postMessage({ type: "worker_ready" });
  })
  .catch((error) => {
    console.error("Erreur lors du chargement du Wasm dans le worker :", error);
    self.postMessage({ type: "worker_error", payload: error.message });
  });


self.onmessage = async (event) => {
  await wasmReadyPromise;

  if (!wasmModule) {
    self.postMessage({
      type: "error",
      payload: "Module WebAssembly non initialisé.",
    });
    return;
  }

  const { type, payload } = event.data;

  try {
    switch (type) {
      case "initAI":
        wasmModule._initAI(payload.aiPlayer);
        break;

      case "setBoard": {
        const flatBoard = payload?.flatBoard;
        const blackCaptures = payload?.blackCaptures || 0;
        const whiteCaptures = payload?.whiteCaptures || 0;

        if (!flatBoard || !Array.isArray(flatBoard)) break;

        const ptr = wasmModule._get_board_buffer();
        wasmModule.HEAP32.set(flatBoard, ptr >> 2);
        wasmModule._setBoard(ptr, blackCaptures, whiteCaptures);

        self.postMessage({ type: "setBoard_done" });
        break;
      }

      case "makeMove": {
        wasmModule._makeMove(payload.row, payload.col, payload.player);
        self.postMessage({ type: "makeMove_done" });
        break;
      }

      case "getBestMove": {
        const flatBoard = payload?.flatBoard;

        if (!flatBoard || !Array.isArray(flatBoard)) {
          self.postMessage({
            type: "error",
            payload:
              "flatBoard invalide ou manquant dans le payload de getBestMove",
          });
          break;
        }

        const ptr = wasmModule._get_board_buffer();
        // ptr est en octets, HEAP32 est une vue int32, donc diviser par 4
        wasmModule.HEAP32.set(flatBoard, ptr >> 2);
        wasmModule._setBoard(ptr, 0, 0);

        const result = wasmModule._getBestMove();
        const row = Math.floor(result / 100);
        const col = result % 100;

        self.postMessage({ type: "bestMoveResult", payload: { row, col } });
        break;
      }

      // --- REQUÊTES DE RÈGLES ---

      case "rules_validateMove":
        self.postMessage({
          type: "rules_validateMove_result",
          payload: wasmModule._rules_validateMove(
            payload.row,
            payload.col,
            payload.player
          ),
        });
        break;

      case "rules_checkWinAt":
        self.postMessage({
          type: "rules_checkWin_result",
          payload:
            wasmModule._rules_checkWinAt(
              payload.row,
              payload.col,
              payload.player
            ) === 1,
        });
        break;

      case "rules_checkWin":
        self.postMessage({
          type: "rules_checkWin_result",
          payload: wasmModule._rules_checkWin(payload.player) === 1,
        });
        break;

      case "rules_checkStalemate":
        self.postMessage({
          type: "rules_checkStalemate_result",
          payload: wasmModule._rules_checkStalemate(payload.player) === 1,
        });
        break;
      case "rules_checkCaptures": {
        const ptr = wasmModule._rules_checkCaptures(
          payload.row,
          payload.col,
          payload.player
        );

        // Conversion Pointeur octets -> int32
        const startIdx = ptr >> 2;

        // Lecture du compteur de pierres (Index 0)
        const stoneCount = wasmModule.HEAP32[startIdx];

        const captures = [];

        let readCursor = startIdx + 1;

        // Boucle par paire de pierres (Une capture = 2 pierres)
        for (let i = 0; i < stoneCount; i += 2) {
          const r1 = wasmModule.HEAP32[readCursor++];
          const c1 = wasmModule.HEAP32[readCursor++];
          const r2 = wasmModule.HEAP32[readCursor++];
          const c2 = wasmModule.HEAP32[readCursor++];

          captures.push({
            capturedPositions: [
              { row: r1, col: c1 },
              { row: r2, col: c2 },
            ],
            newCaptureCount: 0,
          });
        }

        self.postMessage({
          type: "rules_checkCaptures_result",
          payload: captures,
        });
        break;
      }

      case "getDebugData": {
        const ptr = wasmModule._getAiCandidateMoves();
        const startIdx = ptr >> 2;
        const count = wasmModule.HEAP32[startIdx];
        
        const moves = [];
        let cursor = startIdx + 1;
        
        for (let i = 0; i < count; i++) {
            const r = wasmModule.HEAP32[cursor++];
            const c = wasmModule.HEAP32[cursor++];
            const s = wasmModule.HEAP32[cursor++];
            const t = wasmModule.HEAP32[cursor++];
            
            moves.push({ row: r, col: c, score: s, type: t });
        }
        
        self.postMessage({ type: "getDebugData_result", payload: moves });
        break;
      }

      case "cleanup":
        if (wasmModule._cleanupAI) {
          wasmModule._cleanupAI();
        }
        wasmModule = null;
        break;
    }
  } catch (error) {
    console.error(
      `Erreur lors du traitement du type de message ${type} dans le worker :`,
      error
    );
    self.postMessage({ type: "error", payload: (error as Error).message });
  }
};
