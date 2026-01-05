/**
 * Moteur de Règles Gomoku - Implémentation
 * Organisation : Bottom-Up (Primitives -> Physique -> Patterns -> Paires -> Règles -> Arbitrage)
 */

#include "gomoku_rules.h"
#include <algorithm>
#include <iostream>

// =================================================================================
//                              0. TEMPLATE HELPERS (INTERNE)
// =================================================================================

// Factorise la boucle des 8 directions pour la détection de paires.
// Predicate signature: bool(board, p1, p2, opponent)
template <typename Predicate>
static bool scanNeighborPairs(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int subjectPlayer, Predicate predicate)
{
    int opponent = (subjectPlayer == BLACK) ? WHITE : BLACK;

    for (int i = 0; i < 8; i++)
    {
        Direction dir = CAPTURE_DIRECTIONS[i];
        int rAdj = row + dir.r;
        int cAdj = col + dir.c;

        if (!GomokuRules::isOnBoard(rAdj, cAdj))
            continue;

        // Si le voisin est un allié, on a une paire potentielle
        if (GomokuRules::getPlayerAt(board, rAdj, cAdj) == static_cast<Player>(subjectPlayer))
        {
            Point p1 = {row, col};
            Point p2 = {rAdj, cAdj};

            // On délègue la vérification spécifique (Sandwich ou Surround)
            if (predicate(board, p1, p2, opponent))
            {
                return true;
            }
        }
    }
    return false;
}

// =================================================================================
//                              1. PRIMITIVES & UTILITAIRES
// =================================================================================

bool GomokuRules::isOnBoard(int row, int col)
{
    std::cout << "row: " << row << " col: " << col << std::endl;

    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

bool GomokuRules::isEmptyCell(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col)
{
    return isOnBoard(row, col) && board[row][col] == NONE;
}

Player GomokuRules::getPlayerAt(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col)
{
    if (!isOnBoard(row, col))
        return NONE;
    return static_cast<Player>(board[row][col]);
}

// =================================================================================
//                              2. PHYSIQUE DU JEU (CAPTURES)
// =================================================================================

int GomokuRules::checkCaptures(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int playerInt, int capturedStonesOut[][2])
{
    Player player = static_cast<Player>(playerInt);
    int captureCount = 0;
    Player opponent = (player == BLACK) ? WHITE : BLACK;

    for (int i = 0; i < 8; i++)
    {
        Direction dir = CAPTURE_DIRECTIONS[i];

        // Coordonnées des 3 pierres suivantes dans la direction
        int r1 = row + dir.r;
        int c1 = col + dir.c;
        int r2 = row + 2 * dir.r;
        int c2 = col + 2 * dir.c;
        int r3 = row + 3 * dir.r;
        int c3 = col + 3 * dir.c;

        if (!isOnBoard(r1, c1) || !isOnBoard(r2, c2) || !isOnBoard(r3, c3))
            continue;

        // Motif de capture : [NOUS] [EUX] [EUX] [NOUS]
        if (getPlayerAt(board, r1, c1) == opponent &&
            getPlayerAt(board, r2, c2) == opponent &&
            getPlayerAt(board, r3, c3) == player)
        {

            if (capturedStonesOut != nullptr)
            {
                capturedStonesOut[captureCount][0] = r1;
                capturedStonesOut[captureCount][1] = c1;
                capturedStonesOut[captureCount + 1][0] = r2;
                capturedStonesOut[captureCount + 1][1] = c2;
            }
            captureCount += 2;
        }
    }
    return captureCount;
}

int GomokuRules::applyMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStonesOut[][2])
{
    // 1. Pose de la pierre
    board[row][col] = player;

    // 2. Calcul des captures
    int numCaptured = checkCaptures(board, row, col, player, capturedStonesOut);

    // 3. Retrait des pierres capturées
    for (int i = 0; i < numCaptured; i++)
    {
        board[capturedStonesOut[i][0]][capturedStonesOut[i][1]] = NONE;
    }
    return numCaptured;
}

void GomokuRules::undoMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStonesOut[][2], int captureCount)
{
    int opponent = (player == BLACK) ? WHITE : BLACK;

    // 1. Restauration des pierres capturées (remises à l'adversaire)
    for (int i = 0; i < captureCount; i++)
    {
        board[capturedStonesOut[i][0]][capturedStonesOut[i][1]] = opponent;
    }
    // 2. Retrait de la pierre jouée
    board[row][col] = NONE;
}

// =================================================================================
//                              3. ANALYSE DE MOTIFS (PATTERNS)
// =================================================================================

std::vector<Point> GomokuRules::getConsecutiveLine(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, Direction dir, int player)
{
    std::vector<Point> line;
    line.reserve(9); // Optimisation : évite les réallocations pour une ligne max de 9
    line.push_back({row, col});

    // Scanner direction positive
    int r = row + dir.r;
    int c = col + dir.c;
    while (getPlayerAt(board, r, c) == static_cast<Player>(player))
    {
        line.push_back({r, c});
        r += dir.r;
        c += dir.c;
    }

    // Scanner direction négative (insérer au début pour garder l'ordre)
    r = row - dir.r;
    c = col - dir.c;
    while (getPlayerAt(board, r, c) == static_cast<Player>(player))
    {
        line.insert(line.begin(), {r, c});
        r -= dir.r;
        c -= dir.c;
    }
    return line;
}

std::string GomokuRules::getLinePattern(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, Direction dir, int playerInt)
{
    Player player = static_cast<Player>(playerInt);
    std::string line = "";
    // Scanner une fenêtre de -5 à +5 autour du point
    for (int i = -5; i <= 5; i++)
    {
        int r = row + i * dir.r;
        int c = col + i * dir.c;

        if (!isOnBoard(r, c))
        {
            line += 'O'; // Mur/Adversaire (Bloquant)
        }
        else
        {
            Player p = getPlayerAt(board, r, c);
            if (p == player)
                line += 'P';
            else if (p == NONE)
                line += '_';
            else
                line += 'O'; // Adversaire (Bloquant)
        }
    }
    return line;
}

bool GomokuRules::isFreeThree(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, Direction dir, int player)
{
    std::string line = getLinePattern(board, row, col, dir, player);

    // Motifs stricts de Free-Three (Doivent permettre de créer un Open-Four _PPPP_)
    const char *patterns[] = {"__PPP_", "_PPP__", "_P_PP_", "_PP_P_"};

    for (int i = 0; i < 4; i++)
    {
        if (line.find(patterns[i]) != std::string::npos)
            return true;
    }
    return false;
}

bool GomokuRules::checkFreeThree(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player)
{
    for (Direction axeDirection : AXES)
    {
        if (isFreeThree(board, row, col, axeDirection, player))
        {
            return true;
        }
    }

    return false;
}

// =================================================================================
//                              4. LOGIQUE DE PAIRES (HELPER)
// =================================================================================

/**
 * Vérifie si l'adversaire peut légalement jouer à la position (r, c).
 */
bool GomokuRules::tryCaptureAt(const int board[BOARD_SIZE][BOARD_SIZE], int r, int c, int opponent)
{
    if (!isEmptyCell(board, r, c))
        return false;
    // On doit cast le board car validateMove a besoin d'un pointeur non-const pour simuler
    auto mutableBoard = const_cast<int (*)[BOARD_SIZE]>(board);
    return validateMove(mutableBoard, r, c, opponent) == VALID;
}

/**
 * Motif [O P P _] ou [_ P P O] -> Capture Potentielle
 */
bool GomokuRules::isPairSandwiched(const int board[BOARD_SIZE][BOARD_SIZE], Point p1, Point p2, int opponent)
{
    int dr = p2.r - p1.r;
    int dc = p2.c - p1.c;

    // Arrière (côté P1)
    int rBack = p1.r - dr;
    int cBack = p1.c - dc;

    // Avant (côté P2)
    int rFront = p2.r + dr;
    int cFront = p2.c + dc;

    Player opp = static_cast<Player>(opponent);

    // Cas A : [O P P _]
    if (getPlayerAt(board, rBack, cBack) == opp)
    {
        if (tryCaptureAt(board, rFront, cFront, opponent))
            return true;
    }
    // Cas B : [_ P P O]
    if (getPlayerAt(board, rFront, cFront) == opp)
    {
        if (tryCaptureAt(board, rBack, cBack, opponent))
            return true;
    }
    return false;
}

/**
 * Motif [O P P O] -> Suicide / Capture Immédiate
 */
bool GomokuRules::isPairSurrounded(const int board[BOARD_SIZE][BOARD_SIZE], Point p1, Point p2, int opponent)
{
    int dr = p2.r - p1.r;
    int dc = p2.c - p1.c;

    int rBack = p1.r - dr;
    int cBack = p1.c - dc;
    int rFront = p2.r + dr;
    int cFront = p2.c + dc;

    Player opp = static_cast<Player>(opponent);

    return getPlayerAt(board, rBack, cBack) == opp &&
           getPlayerAt(board, rFront, cFront) == opp;
}

// =================================================================================
//                              5. VALIDATION DE VICTOIRE (HELPERS)
// =================================================================================

bool GomokuRules::isStoneCapturable(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int opponent)
{
    // Le sujet est la pierre à (row, col), son adversaire est 'opponent'.
    int subjectPlayer = (opponent == BLACK) ? WHITE : BLACK;
    return scanNeighborPairs(board, row, col, subjectPlayer, isPairSandwiched);
}

int GomokuRules::getLongestSegment(const std::vector<bool> &isRemoved)
{
    int currentRun = 0;
    int maxRun = 0;
    for (bool removed : isRemoved)
    {
        if (!removed)
            currentRun++;
        else
        {
            maxRun = std::max(maxRun, currentRun);
            currentRun = 0;
        }
    }
    return std::max(maxRun, currentRun);
}

bool GomokuRules::isLineBreakableByCapture(const int board[BOARD_SIZE][BOARD_SIZE], const std::vector<Point> &line, int opponentInt)
{
    if (line.size() < 5)
        return false;

    std::vector<bool> isRemoved(line.size(), false);

    for (size_t i = 0; i < line.size(); i++)
    {
        if (isStoneCapturable(board, line[i].r, line[i].c, opponentInt))
        {
            isRemoved[i] = true;
        }
    }
    return getLongestSegment(isRemoved) < 5;
}

// =================================================================================
//                              6. RÈGLES COMPLEXES
// =================================================================================

bool GomokuRules::isSuicideMove(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int playerInt)
{
    // Règle Suicide : Interdit de créer le motif [O X X O]
    return scanNeighborPairs(board, row, col, playerInt, isPairSurrounded);
}

bool GomokuRules::checkDoubleThree(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player)
{
    int freeThreeCount = 0;
    for (int i = 0; i < 4; i++)
    {
        if (isFreeThree(board, row, col, AXES[i], player))
        {
            freeThreeCount++;
        }
    }
    return freeThreeCount >= 2;
}

// =================================================================================
//                              7. ARBITRAGE (WIN & STALEMATE)
// =================================================================================

bool GomokuRules::checkWin(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int playerInt, int capturedStones)
{
    if (capturedStones >= 10)
        return true;

    Player player = static_cast<Player>(playerInt);
    int opponent = (player == BLACK) ? WHITE : BLACK;

    for (int i = 0; i < 4; i++)
    {
        std::vector<Point> currentLine = getConsecutiveLine(board, row, col, AXES[i], playerInt);

        if (currentLine.size() >= 5)
        {
            if (!isLineBreakableByCapture(board, currentLine, opponent))
            {
                return true;
            }
        }
    }
    return false;
}

bool GomokuRules::checkStalemate(const int board[BOARD_SIZE][BOARD_SIZE], int player)
{
    for (int r = 0; r < BOARD_SIZE; r++)
    {
        for (int c = 0; c < BOARD_SIZE; c++)
        {
            if (board[r][c] == NONE)
            {
                if (validateMove(const_cast<int (*)[BOARD_SIZE]>(board), r, c, player) == VALID)
                {
                    return false;
                }
            }
        }
    }
    return true;
}

// =================================================================================
//                              8. VALIDATION MAÎTRE
// =================================================================================

MoveStatus GomokuRules::validateMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player)
{
    if (!isOnBoard(row, col))
        return INVALID_BOUNDS;
    if (board[row][col] != NONE)
        return INVALID_OCCUPIED;

    {
        ScopedMove move(board, row, col, player);

        // Si le coup ne capture rien, on vérifie les interdictions
        if (move.numCaptured == 0)
        {
            if (isSuicideMove(board, row, col, player))
                return INVALID_SUICIDE;
            if (checkDoubleThree(board, row, col, player))
                return INVALID_DOUBLE_THREE;
        }
    }

    return VALID;
}

// =================================================================================
//                              9. RAII HELPER
// =================================================================================

ScopedMove::ScopedMove(int b[BOARD_SIZE][BOARD_SIZE], int r, int c, int p)
    : board(b), row(r), col(c), player(p)
{
    numCaptured = GomokuRules::applyMove(board, row, col, player, captured);
}

ScopedMove::~ScopedMove()
{
    GomokuRules::undoMove(board, row, col, player, captured, numCaptured);
}