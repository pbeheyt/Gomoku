/**
 * Gomoku AI Header
 * Declarations for the AI class and structures.
 */

#ifndef GOMOKU_AI_H
#define GOMOKU_AI_H

#include <vector>
#include <stack>
#include "gomoku_rules.h"

// Forward declaration
class GomokuAI;

// Access to the singleton instance for the Bridge
GomokuAI* getGlobalAI();

// --- Data Structures ---

struct Move {
    int row, col, score;
    Move() : row(-1), col(-1), score(0) {}
    Move(int r, int c, int s = 0) : row(r), col(c), score(s) {}
};

struct MoveHistory {
    int row, col, player;
    int capturedStones[4][2];
    int numCaptured;
    int capturedByBlack, capturedByWhite;
    MoveHistory() : row(-1), col(-1), player(0), numCaptured(0), capturedByBlack(0), capturedByWhite(0) {}
};

struct GameState {
    int capturedByBlack, capturedByWhite;
    GameState() : capturedByBlack(0), capturedByWhite(0) {}
};

struct PatternInfo {
    int length, openEnds;
    bool blockedLeft, blockedRight;
    int startRow, startCol, endRow, endCol;
    PatternInfo() : length(0), openEnds(0), blockedLeft(false), blockedRight(false), startRow(-1), startCol(-1), endRow(-1), endCol(-1) {}
};

// --- AI Class Definition ---

class GomokuAI {
private:
    int board[BOARD_SIZE][BOARD_SIZE];
    int aiPlayer;
    int humanPlayer;
    GameState gameState;
    std::stack<MoveHistory> moveHistory;

    // Internal Helpers (Minimax & Heuristics)
    int minimax(int depth, int alpha, int beta, bool isMaximizing);
    int quickEvaluate(int row, int col, int player);
    int evaluateBoard(int player);
    int evaluateAlignments(int player);
    int evaluateCaptures(int player);
    int evaluatePatterns(int player);
    int evaluateImmediateThreats(int player);
    int detectAdvancedPatterns(int row, int col, int player);
    bool hasPlayerWon(int player);
    std::vector<Move> getCandidateMoves();
    void saveState();
    void makeMoveWithCaptures(int row, int col, int player);
    int checkAndPerformCaptures(int row, int col, int player);
    void undoMove();
    
    // Pattern Helpers
    PatternInfo analyzePattern(int row, int col, int direction, int player, bool visited[BOARD_SIZE][BOARD_SIZE][4]);
    int evaluatePatternScore(const PatternInfo& pattern);
    int evaluatePattern(int row, int col, int direction, int player);
    PatternInfo getPatternInfo(int row, int col, int direction, int player);
    bool wouldBlockThreat(int row, int col, int player, int opponent);
    bool detectDoubleFreeThree(int row, int col, int player);
    bool detectFourPlusThree(int row, int col, int player);
    bool createsFreeThree(int row, int col, int direction, int player);
    int countConsecutive(int row, int col, int direction, int player);

public:
    GomokuAI(int aiPlayerColor);
    void clearBoard();
    void setBoard(const int* flatBoard);
    void makeMove(int row, int col, int player);
    bool isValidMove(int row, int col);
    void getBestMove(int& bestRow, int& bestCol);
    
    // Accessor for the Rules Engine Bridge
    const int (*getBoard() const)[BOARD_SIZE] { return board; }
};

#endif // GOMOKU_AI_H
