/**
 * Gomoku AI Header
 * Strong AI with proper threat detection and evaluation
 */

#ifndef GOMOKU_AI_H
#define GOMOKU_AI_H

#include <vector>
#include <stack>
#include <unordered_map>
#include "gomoku_rules.h"

class GomokuAI;

// Access to the singleton instance
GomokuAI *getGlobalAI();

// ============================================================================
// DATA STRUCTURES
// ============================================================================

struct Move
{
    int row, col, score;
    Move() : row(-1), col(-1), score(0) {}
    Move(int r, int c, int s = 0) : row(r), col(c), score(s) {}
};

struct CaptureInfo
{
    int row, col;
    int player;

    CaptureInfo(int r = 0, int c = 0, int p = 0) : row(r), col(c), player(p) {}
};

struct MoveRecord
{
    Move move;
    std::vector<CaptureInfo> capturedStones;
    MoveRecord(const Move &m) : move(m) {}
};

struct GameState
{
    int capturedByBlack, capturedByWhite;
    GameState() : capturedByBlack(0), capturedByWhite(0) {}
};

struct LineInfo
{
    int count;     // Number of player stones
    int openEnds;  // Number of open ends (0, 1, or 2)
    int gaps;      // Number of gaps in the pattern
    bool isThreat; // Is this a forcing threat?

    LineInfo() : count(0), openEnds(0), gaps(0), isThreat(false) {}
};

// ============================================================================
// GOMOKU AI CLASS
// ============================================================================

class GomokuAI
{
private:
    // Board state
    int board[BOARD_SIZE][BOARD_SIZE];
    int aiPlayer, humanPlayer;
    GameState gameState;

    // Move history for undo - with full capture tracking
    std::stack<MoveRecord> moveHistory;
    std::vector<GameState> stateHistory;

    // Transposition table for memoization (optional, for future optimization)
    std::unordered_map<unsigned long long, std::pair<int, int>> transpositionTable;

    // Direction vectors: horizontal, vertical, diagonal, anti-diagonal
    const int dx[4] = {1, 0, 1, 1};
    const int dy[4] = {0, 1, 1, -1};

    // ========================================================================
    // PRIVATE METHODS - CORE AI LOGIC
    // ========================================================================

    // Minimax search with alpha-beta pruning
    int minimax(int depth, int alpha, int beta, int player, bool isMaximizing);
    int quiescenceSearch(int alpha, int beta, int player, int depth);

    // Move generation and ordering
    std::vector<Move> getCandidateMoves(int player, bool threatOnly = false);
    void orderMoves(std::vector<Move> &moves, int player);

    // CRITICAL: Proper move evaluation
    int evaluateMove(int row, int col, int player);
    int quickEvaluate(int row, int col, int player);

    // Board evaluation
    int evaluateBoard(int player);
    int evaluateLine(int player, int count, int openEnds, int gaps);
    int countPattern(int player, int opponent);

    // Pattern analysis
    LineInfo analyzeLine(int row, int col, int player, int dirIdx);
    LineInfo analyzeLineSimple(int row, int col, int player, int dirIdx);

    // Win detection
    bool checkWin(int player);
    bool checkWinAt(int row, int col, int player);

    // Capture detection
    int checkCaptures(int row, int col, int player);

    // Threat detection - finds critical moves
    std::vector<Move> findWinningMoves(int player);
    std::vector<Move> findOpenFours(int player);
    std::vector<Move> findOpenThrees(int player);
    std::vector<Move> getThreatMoves(int player);
    bool hasForcingThreat(int player);

    // Free-three detection (for forbidden moves)
    int countFreeThrees(int row, int col, int player);
    bool isDoubleFreeThree(int row, int col, int player);

    // Internal move management (for search tree)
    void makeMoveInternal(int row, int col, int player);
    void undoMove();

    // Board state checks
    bool isInBounds(int row, int col);

    // Zobrist hashing for transposition table
    unsigned long long computeHash();

    // Utility functions
    int getOpponent(int player)
    {
        return (player == BLACK) ? WHITE : BLACK;
    }

    int manhattanDistance(int r1, int c1, int r2, int c2)
    {
        return abs(r1 - r2) + abs(c1 - c2);
    }

public:
    // ========================================================================
    // PUBLIC INTERFACE
    // ========================================================================

    /**
     * Constructor
     * @param aiPlayerColor The color (BLACK or WHITE) that the AI will play
     */
    GomokuAI(int aiPlayerColor);

    /**
     * Board management
     */
    void clearBoard();
    void setBoard(const int *flatBoard, int blackCaptures, int whiteCaptures);

    /**
     * Game interaction - this is called by the game engine
     */
    void makeMove(int row, int col, int player);
    bool isValidMove(int row, int col);

    /**
     * Main AI decision function - finds the best move
     * @param bestRow Output parameter for the chosen row
     * @param bestCol Output parameter for the chosen column
     */
    void getBestMove(int &bestRow, int &bestCol);

    /**
     * Accessors for the Rules Engine Bridge
     */
    const int (*getBoard() const)[BOARD_SIZE]
    {
        return board;
    }

    int getCaptures(int player) const
    {
        return (player == BLACK) ? gameState.capturedByBlack : gameState.capturedByWhite;
    }
};

#endif // GOMOKU_AI_H
