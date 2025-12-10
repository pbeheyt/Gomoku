/**
 * Gomoku Bridge
 * The Diplomat: Exposes C++ logic to JavaScript via WebAssembly.
 * Contains NO game logic, only interface code.
 */

#include "gomoku_ai.h"
#include "gomoku_rules.h"

// Static buffer for Board Input (19x19) to avoid malloc/free in JS
static int BRIDGE_BOARD_BUFFER[BOARD_SIZE * BOARD_SIZE];

extern "C" {

// Helper to get the address of the static board buffer
int* get_board_buffer() {
    return BRIDGE_BOARD_BUFFER;
}

// --- AI LIFECYCLE ---

void initAI(int aiPlayer) {
    GomokuAI* ai = getGlobalAI();
    if (ai != nullptr) {
        delete ai;
    }
    // Constructor sets the global instance automatically
    new GomokuAI(aiPlayer);
}

void setBoard(const int* flatBoard) {
    GomokuAI* ai = getGlobalAI();
    if (ai != nullptr) {
        ai->setBoard(flatBoard);
    }
}

void makeMove(int row, int col, int player) {
    GomokuAI* ai = getGlobalAI();
    if (ai != nullptr) {
        ai->makeMove(row, col, player);
    }
}

int getBestMove() {
    GomokuAI* ai = getGlobalAI();
    if (ai == nullptr) return -1;
    
    int bestRow, bestCol;
    ai->getBestMove(bestRow, bestCol);
    
    if (bestRow >= 0 && bestCol >= 0) {
        return bestRow * 100 + bestCol;
    }
    return -1;
}

void cleanupAI() {
    GomokuAI* ai = getGlobalAI();
    if (ai != nullptr) {
        delete ai;
        // Global pointer is cleared by the caller logic or re-init
    }
}

// --- RULES ENGINE EXPORTS ---

int rules_isValidMove(int row, int col) {
    GomokuAI* ai = getGlobalAI();
    if (ai == nullptr) return 0;
    return GomokuRules::isValidMove(ai->getBoard(), row, col);
}

int rules_isSuicide(int row, int col, int player) {
    GomokuAI* ai = getGlobalAI();
    if (ai == nullptr) return 0;
    return GomokuRules::isSuicideMove(ai->getBoard(), row, col, player);
}

int rules_checkDoubleThree(int row, int col, int player) {
    GomokuAI* ai = getGlobalAI();
    if (ai == nullptr) return 0;
    return GomokuRules::checkDoubleThree(ai->getBoard(), row, col, player);
}

int rules_checkWin(int row, int col, int player) {
    GomokuAI* ai = getGlobalAI();
    if (ai == nullptr) return 0;
    return GomokuRules::checkWin(ai->getBoard(), row, col, player);
}

// Static buffer to avoid malloc/free in JavaScript
// Max 8 directions * 2 stones * 2 coordinates (row, col) = 32 ints
static int BRIDGE_CAPTURE_BUFFER[32];

/**
 * Returns a pointer to the static capture buffer.
 * The first element of the buffer will contain the NUMBER of stones captured.
 * The following elements are the coordinates: [r1, c1, r2, c2, ...]
 */
int* rules_checkCaptures(int row, int col, int player) {
    GomokuAI* ai = getGlobalAI();
    // Default: 0 captures
    BRIDGE_CAPTURE_BUFFER[0] = 0; 
    
    if (ai == nullptr) return BRIDGE_CAPTURE_BUFFER;

    // We use a temporary buffer for the logic engine
    int tempCaptures[16][2];
    int count = GomokuRules::checkCaptures(ai->getBoard(), row, col, player, tempCaptures);
    
    // Write count at index 0
    BRIDGE_CAPTURE_BUFFER[0] = count;

    // Flatten results into the static buffer starting at index 1
    for (int i = 0; i < count; i++) {
        BRIDGE_CAPTURE_BUFFER[1 + (i * 2)] = tempCaptures[i][0];     // Row
        BRIDGE_CAPTURE_BUFFER[1 + (i * 2) + 1] = tempCaptures[i][1]; // Col
    }

    return BRIDGE_CAPTURE_BUFFER;
}

} // extern "C"