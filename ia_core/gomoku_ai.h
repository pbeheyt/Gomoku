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

struct TTEntry
{
    int depth;
    int score;
    int flag; // 0: EXACT, 1: ALPHA, 2: BETA
};

struct Move
{
    int row, col, score;
    int algoType; // 0: Candidate (Heuristic), 1: Minimax (Deep Search)
    Move() : row(-1), col(-1), score(0), algoType(0) {}
    Move(int r, int c, int s = 0, int t = 0) : row(r), col(c), score(s), algoType(t) {}
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
    int player;

    MoveRecord(const Move &m, int p = NONE) : move(m), player(p) {}
};

struct GameState
{
    int capturedByBlack, capturedByWhite;
    GameState() : capturedByBlack(0), capturedByWhite(0) {}
};

class GomokuAI
{
private:
    int board[BOARD_SIZE][BOARD_SIZE];
    std::vector<Move> aiCandidateMoves;
    
    int aiPlayer, humanPlayer;
    int currentHash;

    GameState gameState;

    // Move history for undo - with full capture tracking
    std::stack<MoveRecord> moveHistory;
    std::vector<GameState> stateHistory;

    // Direction vectors: horizontal, vertical, diagonal, anti-diagonal
    const int dx[4] = {1, 0, 1, 1};
    const int dy[4] = {0, 1, 1, -1};

    // Minimax search with alpha-beta pruning
    int minimax(int depth, int alpha, int beta, int player);

    // Move generation and ordering
    std::vector<Move> getCandidateMoves(int player);

    // move and board evaluation
    int evaluateBoard(int player);
    int evaluateMoveQuick(int row, int col, int player);
    bool checkWinQuick(int row, int col, int player);


    void undoMove();

    void makeMoveInternal(int row, int col, int player);

public:
    GomokuAI(int aiPlayerColor);

    void clearBoard();
    void setBoard(const int *flatBoard, int blackCaptures, int whiteCaptures);

    void makeMove(int row, int col, int player);
    bool isValidMove(int row, int col);

    void getBestMove(int &bestRow, int &bestCol);

    const int (*getBoard() const)[BOARD_SIZE]
    {
        return board;
    }

    const std::vector<Move> getCandidates() const
    {
        return aiCandidateMoves;
    }


    int getCaptures(int player) const
    {
        return (player == BLACK) ? gameState.capturedByBlack : gameState.capturedByWhite;
    }

    int getOpponent(int player)
    {
        return (player == BLACK) ? WHITE : BLACK;
    }
};

#endif
