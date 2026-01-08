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
    int count;
    int openEnds;
    int gaps;
    bool isThreat;

    LineInfo() : count(0), openEnds(0), gaps(0), isThreat(false) {}
};

class GomokuAI
{
private:
    int board[BOARD_SIZE][BOARD_SIZE];
    int aiPlayer, humanPlayer;
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
    void orderMoves(std::vector<Move> &moves, int player);

    // move and board evaluation
    int evaluateMove(int row, int col, int player);
    int evaluateBoard(int player);
    int evaluateLine(int player, int count, int openEnds, int gaps);
    int countPattern(int player, int opponent);

    LineInfo analyzeLine(int row, int col, int player, int dirIdx);

    // Threat detection - finds critical moves
    std::vector<Move> findOpenFours(int player);
    std::vector<Move> findOpenThrees(int player);

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
