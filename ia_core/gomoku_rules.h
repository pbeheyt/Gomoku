#ifndef GOMOKU_RULES_H
#define GOMOKU_RULES_H

#include <vector>
#include <string>

// =================================================================================
//                              CONSTANTES & ENUMS
// =================================================================================

const int BOARD_SIZE = 19;
const int MAX_CAPTURE_STONES = 10;

enum Player
{
    NONE = 0,
    BLACK = 1,
    WHITE = 2
};

enum MoveStatus
{
    VALID = 0,
    INVALID_BOUNDS = 1,
    INVALID_OCCUPIED = 2,
    INVALID_SUICIDE = 3,
    INVALID_DOUBLE_THREE = 4
};

struct Point
{
    int r, c;
};

struct Direction
{
    int r, c;
};

const Direction AXES[4] = {
    {0, 1}, {1, 0}, {1, 1}, {1, -1}};

const Direction CAPTURE_DIRECTIONS[8] = {
    {0, 1}, {0, -1}, {1, 0}, {-1, 0}, {1, 1}, {-1, -1}, {1, -1}, {-1, 1}};

class GomokuRules
{
public:
    static MoveStatus validateMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player);

    // --- Primitives (Lecture Seule) ---
    static bool isOnBoard(int row, int col);
    static bool isEmptyCell(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col);
    static Player getPlayerAt(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col);

    // --- Physique du Jeu (Modification du Plateau) ---
    static int applyMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStonesOut[][2]);
    static void undoMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStonesOut[][2], int captureCount);

    // --- Simulation ---
    static int checkCaptures(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStonesOut[][2] = nullptr);
    static bool checkWinAt(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int lastMovePlayer, int capturedStones);
    static bool checkWin(const int board[BOARD_SIZE][BOARD_SIZE], int player, int lastMovePlayer, int capturedStones);
    static bool checkStalemate(const int board[BOARD_SIZE][BOARD_SIZE], int player);

    // --- Helpers ---
    static bool isSuicideMove(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player);
    static bool checkDoubleThree(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player);
    static bool checkFreeThree(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player);
    static bool isStoneCapturable(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int opponent);

private:

    // --- 1. Analyse de Motifs---
    static bool isFreeThree(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, Direction dir, int player);
    static std::string getLinePattern(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, Direction dir, int player);
    static std::vector<Point> getConsecutiveLine(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, Direction dir, int player);

    // --- 2. Logique de Paires ---
    static bool tryCaptureAt(const int board[BOARD_SIZE][BOARD_SIZE], int r, int c, int opponent);
    static bool isPairSandwiched(const int board[BOARD_SIZE][BOARD_SIZE], Point p1, Point p2, int opponent);
    static bool isPairSurrounded(const int board[BOARD_SIZE][BOARD_SIZE], Point p1, Point p2, int opponent);

    // --- 3. Validation de Victoire ---
    static int getLongestSegment(const std::vector<bool> &isRemoved);
    static bool isLineBreakableByCapture(const int board[BOARD_SIZE][BOARD_SIZE], const std::vector<Point> &line, int opponent);
};

// =================================================================================
//                              RAII HELPER
// =================================================================================

struct ScopedMove
{
    int (*board)[BOARD_SIZE];
    int row, col, player;
    int captured[16][2];
    int numCaptured;

    ScopedMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player);
    ~ScopedMove();
};

#endif