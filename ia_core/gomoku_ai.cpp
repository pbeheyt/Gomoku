/**
 * Gomoku AI Implementation
 */

#include "gomoku_ai.h"
#include <algorithm>
#include <climits>
#include <cstring>
#include <unordered_map>
#include <stack>
#include <iostream>
#include <set>

// Global Instance
static GomokuAI *globalAI = nullptr;

GomokuAI *getGlobalAI()
{
    return globalAI;
}

// Direction vectors
const int DX[] = {0, 1, 1, 1, 0, -1, -1, -1};
const int DY[] = {1, 1, 0, -1, -1, -1, 0, 1};

// Minimax constants
const int MAX_DEPTH = 10;
const int INITIAL_DEPTH = 6;
const int INF = INT_MAX;
const int WIN_SCORE = 10000000;
const int BLOCK_OPPONENT_WIN = 5000000;
const int CAPTURE_PAIR_WEIGHT = 1000000;
const int OPEN_FOUR = 500000;
const int BLOCK_OPEN_FOUR = 250000;
const int FREE_THREE = 100000;
const int BLOCK_FREE_THREE = 50000;
const int THREE_OPEN = 30000;
const int BLOCK_THREE_OPEN = 15000;
const int TWO_OPEN = 10000;
const int BLOCK_TWO_OPEN = 5000;
const int INITIAL_ALPHA = INT_MIN;
const int INITIAL_BETA = INT_MAX;
const int OPPONENT_CRISIS = -10000000;
const int CAPTURE_TO_WIN = 10;

// --- Implementation ---

GomokuAI::GomokuAI(int aiPlayerColor)
{
    this->aiPlayer = aiPlayerColor;
    this->humanPlayer = (aiPlayerColor == BLACK) ? WHITE : BLACK;
    clearBoard();

    // Set global instance
    globalAI = this;
}

void GomokuAI::clearBoard()
{
    for (int i = 0; i < BOARD_SIZE; i++)
    {
        for (int j = 0; j < BOARD_SIZE; j++)
        {
            board[i][j] = NONE;
        }
    }
    gameState = GameState();
    while (!moveHistory.empty())
    {
        moveHistory.pop();
    }
}

void GomokuAI::setBoard(const int* flatBoard, int blackCaptures, int whiteCaptures) {
    for (int i = 0; i < BOARD_SIZE; i++) {
        for (int j = 0; j < BOARD_SIZE; j++) {
            board[i][j] = flatBoard[i * BOARD_SIZE + j];
        }
    }
    gameState.capturedByBlack = blackCaptures;
    gameState.capturedByWhite = whiteCaptures;
}

void GomokuAI::makeMove(int row, int col, int player)
{
    if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE)
    {
        board[row][col] = player;
    }
}

bool GomokuAI::isValidMove(int row, int col)
{
    // We use the strict validator to ensure AI respects Suicide/DoubleThree rules
    // AND sees the "Capture saves Suicide" exceptions.
    return GomokuRules::validateMove(board, row, col, aiPlayer) == VALID;
}

void GomokuAI::sortMovesByScore(std::vector<Move> &moves, int player)
{

    for (Move &move : moves)
    {
        int score = quickEvaluate(move.row, move.col, player);
        move.score = score;
    }

    std::sort(moves.begin(), moves.end(), [](const Move &a, const Move &b)
              { return a.score > b.score; });
}

void GomokuAI::getBestMove(int &bestRow, int &bestCol)
{
    int player = aiPlayer;
    int opponent = humanPlayer;

    std::vector<Move> candidateMoves = getCandidateMoves();

    sortMovesByScore(candidateMoves, player);

    int bestMoveIndex = -1;
    int maxScore = INT_MIN;

    int alpha = INITIAL_ALPHA;
    int beta = INITIAL_BETA;

    for (Move move : candidateMoves)
    {

        makeMoveWithCaptures(move.row, move.col, player);

        if (GomokuRules::checkWin(board, move.row, move.col, player))
        {
            bestRow = move.row;
            bestCol = move.col;
            undoMove();
            return;
        }

        int score = -minimax(MAX_DEPTH - 1, -beta, -alpha, opponent);

        undoMove();

        if (score > maxScore)
        {
            maxScore = score;
            bestMoveIndex = positionCoordinateToIndex(move.row, move.col);
        }

        if (maxScore > alpha)
        {
            alpha = maxScore;
        }
    }

    if (bestMoveIndex == -1)
    {
        std::cerr << "ERROR: No legal move found by AI.\n";
    }

    bestRow = indexToRowCoordinate(bestMoveIndex);
    bestCol = indexToColCoordinate(bestMoveIndex);
}

int GomokuAI::minimax(int depth, int alpha, int beta, int player)
{

    if (depth == 0)
    {
        return evaluateBoard(aiPlayer);
    }

    int opponent = (player == humanPlayer) ? aiPlayer : humanPlayer;

    std::vector<Move> candidateMoves = getCandidateMoves();

    sortMovesByScore(candidateMoves, player);

    int bestScore = INT_MIN;

    for (Move move : candidateMoves)
    {

        if (move.score == WIN_SCORE)
        {
            return WIN_SCORE;
        }

        makeMoveWithCaptures(move.row, move.col, player);
        int score = -minimax(depth - 1, -beta, -alpha, opponent);
        undoMove();

        bestScore = std::max(bestScore, score);
        alpha = std::max(bestScore, score);

        if (alpha >= beta)
        {
            break;
        }
    }

    return bestScore;
}

int GomokuAI::quickEvaluate(int row, int col, int player)
{
    int opponent = (player == aiPlayer) ? humanPlayer : aiPlayer;
    int score = 0;

    int capturedCount = GomokuRules::checkCaptures(board, row, col, player, nullptr);
    score += capturedCount * CAPTURE_PAIR_WEIGHT;

    GomokuAI::makeMove(row, col, player);

    if (GomokuRules::checkWin(board, row, col, player))
    {
        return WIN_SCORE;
    }

    if (GomokuRules::checkFreeThree(board, row, col, player))
    {
        score += FREE_THREE;
    }

    GomokuAI::undoMove();

    return score;
}

int GomokuAI::evaluateBoard(int player)
{
    long long totalScore = 0;
    int opponent = (player == aiPlayer) ? humanPlayer : aiPlayer;

    if (GomokuAI::gameState.capturedByBlack >= CAPTURE_TO_WIN)
    {
        totalScore = (long long)WIN_SCORE;
    }

    if (GomokuAI::gameState.capturedByWhite >= CAPTURE_TO_WIN)
    {
        totalScore = (long long)-WIN_SCORE;
    }

    if (totalScore != 0)
    {
        return player == BLACK ? totalScore : -totalScore;
    }

    //! TODO Capture differential score ??

    // Threats
    totalScore += evaluateImmediateThreats(player);

    if (totalScore > WIN_SCORE)
    {
        return WIN_SCORE - 1;
    }

    if (totalScore < -WIN_SCORE)
    {
        return -WIN_SCORE + 1;
    }

    return totalScore;
}

PatternInfo GomokuAI::analyzePattern(int row, int col, int direction, int player, bool visited[BOARD_SIZE][BOARD_SIZE][4])
{
    PatternInfo info;
    int opponent = (player == BLACK) ? WHITE : BLACK;
    visited[row][col][direction] = true;

    info.startRow = row;
    info.startCol = col;
    info.endRow = row;
    info.endCol = col;
    info.length = 1;

    // Positive
    int r = row + DX[direction];
    int c = col + DY[direction];
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE)
    {
        if (board[r][c] == player)
        {
            info.length++;
            info.endRow = r;
            info.endCol = c;
            visited[r][c][direction] = true;
        }
        else if (board[r][c] == opponent)
        {
            info.blockedRight = true;
            break;
        }
        else
            break;
        r += DX[direction];
        c += DY[direction];
    }

    // Negative
    r = row - DX[direction];
    c = col - DY[direction];
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE)
    {
        if (board[r][c] == player)
        {
            info.length++;
            info.startRow = r;
            info.startCol = c;
            visited[r][c][direction] = true;
        }
        else if (board[r][c] == opponent)
        {
            info.blockedLeft = true;
            break;
        }
        else
            break;
        r -= DX[direction];
        c -= DY[direction];
    }

    if (!info.blockedLeft)
        info.openEnds++;
    if (!info.blockedRight)
        info.openEnds++;
    return info;
}

int GomokuAI::evaluatePatternScore(const PatternInfo &pattern)
{
    if (pattern.length >= 5)
        return WIN_SCORE;
    if (pattern.length == 4)
        return (pattern.openEnds == 2) ? OPEN_FOUR : BLOCK_OPEN_FOUR;
    if (pattern.length == 3)
        return (pattern.openEnds == 2) ? FREE_THREE : (pattern.openEnds == 1 ? BLOCK_FREE_THREE : 0);
    if (pattern.length == 2)
        return (pattern.openEnds == 2) ? TWO_OPEN : (pattern.openEnds == 1 ? BLOCK_TWO_OPEN : 0);
    return 0;
}

int GomokuAI::evaluateAlignments(int player)
{
    int score = 0;
    bool visited[BOARD_SIZE][BOARD_SIZE][4] = {false};
    for (int row = 0; row < BOARD_SIZE; row++)
    {
        for (int col = 0; col < BOARD_SIZE; col++)
        {
            if (board[row][col] != player)
                continue;
            for (int dir = 0; dir < 4; dir++)
            {
                if (!visited[row][col][dir])
                {
                    PatternInfo pattern = analyzePattern(row, col, dir, player, visited);
                    score += evaluatePatternScore(pattern);
                }
            }
        }
    }
    return score;
}

int GomokuAI::evaluateCaptures(int player)
{
    if ((player == BLACK && gameState.capturedByBlack >= 10) ||
        (player == WHITE && gameState.capturedByWhite >= 10))
        return WIN_SCORE;
    return (player == BLACK ? gameState.capturedByBlack : gameState.capturedByWhite) * CAPTURE_PAIR_WEIGHT;
}

int GomokuAI::evaluateImmediateThreats(int player)
{
    int score = 0;
    int opponent = (player == BLACK) ? WHITE : BLACK;
    bool opponentHasOpenFour = false;

    for (int row = 0; row < BOARD_SIZE; row++)
    {
        for (int col = 0; col < BOARD_SIZE; col++)
        {
            if (board[row][col] != opponent)
                continue;
            for (int dir = 0; dir < 4; dir++)
            {
                PatternInfo pattern = getPatternInfo(row, col, dir, opponent);
                if (pattern.length == 4 && pattern.openEnds == 2)
                {
                    opponentHasOpenFour = true;
                    score -= OPEN_FOUR;
                }
                if (pattern.length == 3 && pattern.openEnds == 2)
                    score -= THREE_OPEN;
            }
        }
    }

    if (opponentHasOpenFour)
    {
        for (int row = 0; row < BOARD_SIZE; row++)
        {
            for (int col = 0; col < BOARD_SIZE; col++)
            {
                if (!isValidMove(row, col))
                    continue;
                if (wouldBlockThreat(row, col, player, opponent))
                    score += BLOCK_OPEN_FOUR;
            }
        }
    }

    return score;
}

bool GomokuAI::wouldBlockThreat(int row, int col, int player, int opponent)
{
    saveState();
    board[row][col] = player;
    bool blocksThreat = false;
    for (int dir = 0; dir < 4; dir++)
    {
        PatternInfo pattern = getPatternInfo(row, col, dir, opponent);
        if (pattern.length >= 3 && pattern.openEnds < 2)
        {
            blocksThreat = true;
            break;
        }
    }
    undoMove();
    return blocksThreat;
}

PatternInfo GomokuAI::getPatternInfo(int row, int col, int direction, int player)
{
    PatternInfo info;
    int opponent = (player == BLACK) ? WHITE : BLACK;
    info.startRow = row;
    info.startCol = col;
    info.endRow = row;
    info.endCol = col;
    info.length = 1;

    int r = row + DX[direction];
    int c = col + DY[direction];
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE)
    {
        if (board[r][c] == player)
        {
            info.length++;
            info.endRow = r;
            info.endCol = c;
        }
        else if (board[r][c] == opponent)
        {
            info.blockedRight = true;
            break;
        }
        else
            break;
        r += DX[direction];
        c += DY[direction];
    }

    r = row - DX[direction];
    c = col - DY[direction];
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE)
    {
        if (board[r][c] == player)
        {
            info.length++;
            info.startRow = r;
            info.startCol = c;
        }
        else if (board[r][c] == opponent)
        {
            info.blockedLeft = true;
            break;
        }
        else
            break;
        r -= DX[direction];
        c -= DY[direction];
    }

    if (!info.blockedLeft)
        info.openEnds++;
    if (!info.blockedRight)
        info.openEnds++;
    return info;
}

int GomokuAI::evaluatePatterns(int player)
{
    int score = 0;
    for (int row = 0; row < BOARD_SIZE; row++)
    {
        for (int col = 0; col < BOARD_SIZE; col++)
        {
            if (board[row][col] != player)
                continue;
            score += detectAdvancedPatterns(row, col, player);
        }
    }
    return score;
}

int GomokuAI::detectAdvancedPatterns(int row, int col, int player)
{
    int score = 0;
    if (detectDoubleFreeThree(row, col, player))
        score += 8000;
    if (detectFourPlusThree(row, col, player))
        score += 20000;
    return score;
}

bool GomokuAI::detectDoubleFreeThree(int row, int col, int player)
{
    return GomokuRules::checkDoubleThree(board, row, col, player);
}

bool GomokuAI::detectFourPlusThree(int row, int col, int player)
{
    return false;
}

bool GomokuAI::createsFreeThree(int row, int col, int direction, int player)
{
    return false;
}

bool GomokuAI::hasPlayerWon(int player) {
    int captures = (player == BLACK) ? gameState.capturedByBlack : gameState.capturedByWhite;
    if (captures >= 10) return true;

    for (int row = 0; row < BOARD_SIZE; row++) {
        for (int col = 0; col < BOARD_SIZE; col++) {
            if (board[row][col] == player) {
                if (GomokuRules::checkWin(board, row, col, player, captures)) return true;
            }
        }
    }
    return false;
}

int GomokuAI::countConsecutive(int row, int col, int direction, int player)
{
    int count = 1;
    int r = row + DX[direction];
    int c = col + DY[direction];
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE)
    {
        if (board[r][c] == player)
            count++;
        else
            break;
        r += DX[direction];
        c += DY[direction];
    }
    r = row - DX[direction];
    c = col - DY[direction];
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE)
    {
        if (board[r][c] == player)
            count++;
        else
            break;
        r -= DX[direction];
        c -= DY[direction];
    }
    return count;
}

std::vector<Move> GomokuAI::getCandidateMoves()
{
    std::set<int> candidatesIndices;

    const int RADIUS = 2;

    for (int col = 0; col < BOARD_SIZE; col++)
    {
        for (int row = 0; row < BOARD_SIZE; row++)
        {
            if (isValidMove(row, col))
            {
                continue;
            }

            for (int dcol = -RADIUS; dcol <= RADIUS; dcol++)
            {
                for (int drow = -RADIUS; drow <= RADIUS; drow++)
                {
                    if (dcol == 0 && drow == 0)
                    {
                        continue;
                    }

                    int nearbyRow = row + drow;
                    int nearbyCol = col + dcol;

                    if (isValidMove(nearbyRow, nearbyCol))
                    {
                        int nearbyIndex = positionCoordinateToIndex(nearbyRow, nearbyCol);

                        candidatesIndices.insert(nearbyIndex);
                    }
                }
            }
        }
    }

    std::vector<Move> candidateMoves;

    for (int index : candidatesIndices)
    {
        int row = indexToRowCoordinate(index);
        int col = indexToColCoordinate(index);

        Move move = Move(row, col);
        candidateMoves.push_back(move);
    }

    if (candidateMoves.empty())
    {
        Move move = Move(BOARD_SIZE / 2, BOARD_SIZE / 2);
        candidateMoves.push_back(move);
    }

    return candidateMoves;
}

void GomokuAI::saveState()
{
    MoveHistory history;
    history.capturedByBlack = gameState.capturedByBlack;
    history.capturedByWhite = gameState.capturedByWhite;
    moveHistory.push(history);
}

void GomokuAI::makeMoveWithCaptures(int row, int col, int player)
{
    MoveHistory history;
    history.row = row;
    history.col = col;
    history.player = player;
    history.capturedByBlack = gameState.capturedByBlack;
    history.capturedByWhite = gameState.capturedByWhite;

    board[row][col] = player;

    int captured[16][2];
    int num = GomokuRules::checkCaptures(board, row, col, player, captured);
    history.numCaptured = num;

    for (int i = 0; i < num; i++)
    {
        int r = captured[i][0];
        int c = captured[i][1];
        history.capturedStones[i][0] = r;
        history.capturedStones[i][1] = c;
        board[r][c] = NONE;
    }

    if (player == BLACK)
        gameState.capturedByBlack += num;
    else
        gameState.capturedByWhite += num;

    moveHistory.push(history);
}

void GomokuAI::undoMove()
{
    if (moveHistory.empty())
        return;
    MoveHistory history = moveHistory.top();
    moveHistory.pop();

    if (history.numCaptured > 0)
    {
        gameState.capturedByBlack = history.capturedByBlack;
        gameState.capturedByWhite = history.capturedByWhite;

        for (int i = 0; i < history.numCaptured; i++)
        {
            int r = history.capturedStones[i][0];
            int c = history.capturedStones[i][1];
            int opponent = (history.player == BLACK) ? WHITE : BLACK;
            board[r][c] = opponent;
        }
    }

    if (history.row >= 0)
        board[history.row][history.col] = NONE;
}

int GomokuAI::positionCoordinateToIndex(int row, int col)
{
    return col * BOARD_SIZE + row;
}

int GomokuAI::indexToColCoordinate(int index)
{
    return index / BOARD_SIZE;
}

int GomokuAI::indexToRowCoordinate(int index)
{
    return index % BOARD_SIZE;
}