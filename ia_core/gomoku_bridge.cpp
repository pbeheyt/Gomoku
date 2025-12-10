/**
 * Gomoku Bridge
 * The Diplomat: Exposes C++ logic to JavaScript via WebAssembly.
 * Contains NO game logic, only interface code.
 */

#include "gomoku_ai.h"
#include "gomoku_rules.h"

extern "C" {

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

/**
 * Returns number of captures.
 * Writes captured coordinates into the buffer pointed to by `out_ptr`.
 * JS must allocate memory: 16 ints (8 pairs * 2 coords) * 4 bytes = 64 bytes.
 */
int rules_checkCaptures(int row, int col, int player, int* out_ptr) {
    GomokuAI* ai = getGlobalAI();
    if (ai == nullptr) return 0;
    return GomokuRules::checkCaptures(ai->getBoard(), row, col, player, (int(*)[2])out_ptr);
}

} // extern "C"