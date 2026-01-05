#ifndef GOMOKU_AI_H
#define GOMOKU_AI_H

#include <vector>
#include <stack>
#include <unordered_map>
#include <random>
#include "gomoku_rules.h"

class GomokuAI;

GomokuAI *getGlobalAI();

struct Move
{
    int row, col, score;
    Move() : row(-1), col(-1), score(0) {}
    Move(int r, int c, int s = 0) : row(r), col(c), score(s) {}
};

struct CaptureInfo
{
    int row, col, player;
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
    int count, openEnds, gaps;
    LineInfo() : count(0), openEnds(0), gaps(0) {}
};

struct TTEntry
{
    int score;
    int depth;
};

class GomokuAI
{
private:
    int board[BOARD_SIZE][BOARD_SIZE];
    int aiPlayer, humanPlayer;
    GameState gameState;
    std::stack<MoveRecord> moveHistory;
    std::vector<GameState> stateHistory;

    // Optimization Tools
    unsigned long long zobristTable[BOARD_SIZE][BOARD_SIZE][3];
    unsigned long long currentHash;
    std::unordered_map<unsigned long long, TTEntry> transpositionTable;

    const int dx[4] = {1, 0, 1, 1};
    const int dy[4] = {0, 1, 1, -1};

    // Private Logic
    void initZobrist();
    void updateHash(int r, int c, int piece);
    int minimax(int depth, int alpha, int beta, int player, bool isMaximizing);
    std::vector<Move> getCandidateMoves(int player);
    void orderMoves(std::vector<Move> &moves, int player);
    int quickEvaluate(int row, int col, int player);
    int evaluateBoard(int player);
    int evaluateLine(int count, int openEnds);
    LineInfo analyzeLine(int row, int col, int player, int dirIdx);
    void undoMove();
    bool isInBounds(int r, int c) { return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE; }
    bool checkWinAt(int row, int col, int player);
    bool checkWin(int player);
    int getOpponent(int p) { return (p == BLACK) ? WHITE : BLACK; }
    int manhattanDistance(int r1, int c1, int r2, int c2) { return abs(r1 - r2) + abs(c1 - c2); }
    void makeMoveInternal(int row, int col, int player);

public:
    void makeMove(int row, int col, int player);
    GomokuAI(int aiPlayerColor);
    void clearBoard();
    void setBoard(const int *flatBoard, int blackCaptures, int whiteCaptures);
    const int (*getBoard() const)[BOARD_SIZE] { return board; }

    void getBestMove(int &bestRow, int &bestCol);
    int getCaptures(int player) const { return (player == BLACK) ? gameState.capturedByBlack : gameState.capturedByWhite; }
};

#endif