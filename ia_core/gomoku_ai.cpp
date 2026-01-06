/**
 * Gomoku AI Implementation - STRONG AI WITH PROPER THREAT DETECTION
 */

#include "gomoku_ai.h"
#include <algorithm>
#include <climits>
#include <cstring>
#include <iostream>
#include <set>

static GomokuAI *globalAI = nullptr;

GomokuAI *getGlobalAI()
{
    return globalAI;
}

const int MAX_CAPTURE_STONES = 10;

// Evaluation scores
const int SCORE_FIVE = 100000000;
const int SCORE_LIVE_FOUR = 50000000;
const int SCORE_DEAD_FOUR = 10000000;
const int SCORE_LIVE_THREE = 5000000;
const int SCORE_DEAD_THREE = 500000;
const int SCORE_LIVE_TWO = 100000;
const int SCORE_DEAD_TWO = 10000;
const int SCORE_ONE = 1000;
const int SEARCH_DEPTH = 10;

GomokuAI::GomokuAI(int aiPlayerColor)
{
    this->aiPlayer = aiPlayerColor;
    this->humanPlayer = (aiPlayerColor == BLACK) ? WHITE : BLACK;
    clearBoard();
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
    stateHistory.clear();
}

void GomokuAI::setBoard(const int *flatBoard, int blackCaptures, int whiteCaptures)
{
    for (int i = 0; i < BOARD_SIZE; i++)
    {
        for (int j = 0; j < BOARD_SIZE; j++)
        {
            board[i][j] = flatBoard[i * BOARD_SIZE + j];
        }
    }

    gameState.capturedByBlack = blackCaptures;
    gameState.capturedByWhite = whiteCaptures;
}

bool GomokuAI::isValidMove(int row, int col)
{
    return GomokuRules::isOnBoard(row, col) && board[row][col] == NONE;
}

void GomokuAI::getBestMove(int &bestRow, int &bestCol)
{
    bestRow = -1;
    bestCol = -1;

    int stoneCount = 0;
    for (int i = 0; i < BOARD_SIZE; i++)
        for (int j = 0; j < BOARD_SIZE; j++)
            if (board[i][j] != NONE)
                stoneCount++;

    if (stoneCount == 0)
    {
        bestRow = bestCol = BOARD_SIZE / 2;
        std::cout << "AI: Opening move - playing center" << std::endl;
        return;
    }

    // Second move - play near center (opponent took center)
    if (stoneCount == 1 && board[BOARD_SIZE / 2][BOARD_SIZE / 2] != NONE)
    {
        bestRow = BOARD_SIZE / 2;
        bestCol = BOARD_SIZE / 2 + 1;
        std::cout << "AI: Second move - playing near center" << std::endl;
        return;
    }

    // Second move - AI is second player, opponent didn't take center
    if (stoneCount == 1)
    {
        bestRow = bestCol = BOARD_SIZE / 2;
        std::cout << "AI: Second move - playing center" << std::endl;
        return;
    }

    std::vector<Move> candidates = getCandidateMoves(aiPlayer, false);
    if (candidates.empty())
    {
        std::cout << "AI: No legal moves available!" << std::endl;
        return;
    }

    int bestScore = INT_MIN;
    std::vector<Move> criticalMoves;

    for (Move &move : candidates)
    {
        int aiScore = evaluateMove(move.row, move.col, aiPlayer);
        int humanScore = evaluateMove(move.row, move.col, humanPlayer);

        board[move.row][move.col] = aiPlayer;
        bool aiWin = checkWin(aiPlayer);
        board[move.row][move.col] = NONE;

        if (aiWin)
        {
            bestRow = move.row;
            bestCol = move.col;
            std::cout << "AI: WINNING at (" << bestRow << ", " << bestCol << ")" << std::endl;
            return;
        }

        board[move.row][move.col] = humanPlayer;
        bool oppWins = checkWin(humanPlayer);
        board[move.row][move.col] = NONE;

        if (oppWins)
        {
            bestRow = move.row;
            bestCol = move.col;
            std::cout << "AI: BLOCKING at (" << bestRow << ", " << bestCol << ")" << std::endl;
            return;
        }

        // Combined score - offensive + defensive (Slightly favor defense)
        move.score = aiScore + humanScore * 1.1;

        if (move.score > bestScore)
        {
            bestScore = move.score;
            bestRow = move.row;
            bestCol = move.col;
        }
    }

    // If we found a good tactical move
    if (bestScore > SCORE_LIVE_THREE)
    {
        std::cout << "AI: Tactical move at (" << bestRow << ", " << bestCol
                  << ") with score " << bestScore << std::endl;
        return;
    }

    int searchDepth = SEARCH_DEPTH;
    std::cout << "AI: Deep search (depth " << searchDepth << ")..." << std::endl;

    orderMoves(candidates, aiPlayer);

    if (candidates.size() > 12)
        candidates.resize(12);

    int alpha = INT_MIN + 1;
    int beta = INT_MAX;

    for (const Move &move : candidates)
    {
        makeMoveInternal(move.row, move.col, aiPlayer);
        int score = -minimax(searchDepth - 1, -beta, -alpha, humanPlayer, false);
        undoMove();

        if (score > alpha)
        {
            alpha = score;
            bestRow = move.row;
            bestCol = move.col;
        }

        if (alpha >= beta)
            break;
    }

    std::cout << "AI: Playing at (" << bestRow << ", " << bestCol
              << ") with score " << alpha << std::endl;
}

int GomokuAI::evaluateMove(int row, int col, int player)
{
    if (!isValidMove(row, col))
        return INT_MIN;

    int score = 0;

    for (int dir = 0; dir < 4; dir++)
    {
        int count = 1;
        int leftOpen = 0, rightOpen = 0;
        int leftSpace = 0, rightSpace = 0;

        // Count RIGHT
        int r = row + dy[dir];
        int c = col + dx[dir];
        while (GomokuRules::isOnBoard(r, c) && board[r][c] == player && count < 5)
        {
            count++;
            r += dy[dir];
            c += dx[dir];
        }

        if (GomokuRules::isOnBoard(r, c))
        {
            if (board[r][c] == NONE)
            {
                rightOpen = 1;
                rightSpace = 1;
                // Check if there's space for 5
                while (GomokuRules::isOnBoard(r, c) && board[r][c] == NONE && rightSpace < (5 - count + 1))
                {
                    rightSpace++;
                    r += dy[dir];
                    c += dx[dir];
                }
            }
        }

        // Count LEFT
        r = row - dy[dir];
        c = col - dx[dir];
        while (GomokuRules::isOnBoard(r, c) && board[r][c] == player && count < 5)
        {
            count++;
            r -= dy[dir];
            c -= dx[dir];
        }

        if (GomokuRules::isOnBoard(r, c))
        {
            if (board[r][c] == NONE)
            {
                leftOpen = 1;
                leftSpace = 1;
                while (GomokuRules::isOnBoard(r, c) && board[r][c] == NONE && leftSpace < (5 - count + 1))
                {
                    leftSpace++;
                    r -= dy[dir];
                    c -= dx[dir];
                }
            }
        }

        int openEnds = leftOpen + rightOpen;
        int totalSpace = leftSpace + rightSpace + count;

        if (totalSpace < 5)
            continue;

        if (count >= 5)
        {
            score += SCORE_FIVE;
        }
        else if (count == 4)
        {
            if (openEnds == 2)
                score += SCORE_LIVE_FOUR;
            else if (openEnds == 1)
                score += SCORE_DEAD_FOUR;
        }
        else if (count == 3)
        {
            if (openEnds == 2)
                score += SCORE_LIVE_THREE;
            else if (openEnds == 1)
                score += SCORE_DEAD_THREE;
        }
        else if (count == 2)
        {
            if (openEnds == 2)
                score += SCORE_LIVE_TWO;
            else if (openEnds == 1)
                score += SCORE_DEAD_TWO;
        }
        else if (count == 1)
        {
            if (openEnds >= 1)
                score += SCORE_ONE;
        }
    }

    score += checkCaptures(row, col, player) * SCORE_LIVE_THREE;

    int centerDist = abs(row - BOARD_SIZE / 2) + abs(col - BOARD_SIZE / 2);
    score += (BOARD_SIZE - centerDist) * 50;

    return score;
}

int GomokuAI::minimax(int depth, int alpha, int beta, int player, bool isMaximizing)
{
    if (checkWin(aiPlayer))
        return SCORE_FIVE - (SEARCH_DEPTH - depth);
    if (checkWin(humanPlayer))
        return -SCORE_FIVE + (SEARCH_DEPTH - depth);

    if (gameState.capturedByBlack >= MAX_CAPTURE_STONES || gameState.capturedByWhite >= MAX_CAPTURE_STONES)
    {
        int winner = (gameState.capturedByBlack >= MAX_CAPTURE_STONES) ? BLACK : WHITE;
        return (winner == aiPlayer) ? SCORE_FIVE : -SCORE_FIVE;
    }

    if (depth <= 0)
        return evaluateBoard(aiPlayer);

    std::vector<Move> moves = getCandidateMoves(player, false);
    if (moves.empty())
        return evaluateBoard(aiPlayer);

    orderMoves(moves, player);

    if (moves.size() > 10)
        moves.resize(10);

    int bestScore = INT_MIN + 1;

    for (const Move &move : moves)
    {
        makeMoveInternal(move.row, move.col, player);
        int score = -minimax(depth - 1, -beta, -alpha, getOpponent(player), !isMaximizing);
        undoMove();

        bestScore = std::max(bestScore, score);
        alpha = std::max(alpha, score);

        if (alpha >= beta)
            break;
    }

    return bestScore;
}

std::vector<Move> GomokuAI::getCandidateMoves(int player, bool threatOnly)
{
    if (threatOnly)
        return getThreatMoves(player);

    std::set<std::pair<int, int>> positions;
    const int RADIUS = 2;

    for (int r = 0; r < BOARD_SIZE; r++)
    {
        for (int c = 0; c < BOARD_SIZE; c++)
        {
            if (board[r][c] != NONE)
            {
                for (int dr = -RADIUS; dr <= RADIUS; dr++)
                {
                    for (int dc = -RADIUS; dc <= RADIUS; dc++)
                    {
                        int nr = r + dr;
                        int nc = c + dc;
                        if (isValidMove(nr, nc) && !isDoubleFreeThree(nr, nc, player))
                            positions.insert({nr, nc});
                    }
                }
            }
        }
    }

    std::vector<Move> candidates;
    for (const auto &pos : positions)
        candidates.push_back(Move(pos.first, pos.second, 0));

    if (candidates.empty())
        candidates.push_back(Move(BOARD_SIZE / 2, BOARD_SIZE / 2, 0));

    return candidates;
}

void GomokuAI::orderMoves(std::vector<Move> &moves, int player)
{
    for (Move &move : moves)
    {
        int myScore = evaluateMove(move.row, move.col, player);
        int oppScore = evaluateMove(move.row, move.col, getOpponent(player));
        move.score = myScore + oppScore;
    }

    std::sort(moves.begin(), moves.end(),
              [](const Move &a, const Move &b)
              { return a.score > b.score; });
}

int GomokuAI::evaluateBoard(int player)
{
    int opponent = getOpponent(player);

    if (checkWin(player))
        return SCORE_FIVE;
    if (checkWin(opponent))
        return -SCORE_FIVE;

    int pCaps = (player == BLACK) ? gameState.capturedByBlack : gameState.capturedByWhite;
    int oCaps = (player == BLACK) ? gameState.capturedByWhite : gameState.capturedByBlack;

    if (pCaps >= MAX_CAPTURE_STONES)
        return SCORE_FIVE;
    if (oCaps >= MAX_CAPTURE_STONES)
        return -SCORE_FIVE;

    int score = 0;
    score += pCaps * SCORE_LIVE_THREE;
    score -= oCaps * SCORE_LIVE_THREE;
    score += countPattern(player, opponent);
    score -= countPattern(opponent, player) * 1.2;

    return score;
}

int GomokuAI::countPattern(int player, int opponent)
{
    int score = 0;

    for (int r = 0; r < BOARD_SIZE; r++)
    {
        for (int c = 0; c < BOARD_SIZE; c++)
        {
            if (board[r][c] == player)
            {
                for (int dir = 0; dir < 4; dir++)
                {
                    LineInfo info = analyzeLine(r, c, player, dir);
                    score += evaluateLine(player, info.count, info.openEnds, info.gaps);
                }
            }
        }
    }

    return score / 4;
}

int GomokuAI::evaluateLine(int player, int count, int openEnds, int gaps)
{
    if (count >= 5)
        return SCORE_FIVE;
    if (count == 4)
        return (openEnds == 2) ? SCORE_LIVE_FOUR : SCORE_DEAD_FOUR;
    if (count == 3)
        return (openEnds == 2) ? SCORE_LIVE_THREE : SCORE_DEAD_THREE;
    if (count == 2)
        return (openEnds == 2) ? SCORE_LIVE_TWO : SCORE_DEAD_TWO;
    return 0;
}

LineInfo GomokuAI::analyzeLine(int row, int col, int player, int dirIdx)
{
    LineInfo info;
    info.count = 1;
    info.openEnds = 0;
    info.gaps = 0;

    int r = row + dy[dirIdx];
    int c = col + dx[dirIdx];
    int gaps = 0;

    while (GomokuRules::isOnBoard(r, c) && gaps <= 1)
    {
        if (board[r][c] == player)
            info.count++;
        else if (board[r][c] == NONE && gaps == 0)
            gaps++;
        else
            break;
        r += dy[dirIdx];
        c += dx[dirIdx];
    }
    if (gaps == 0 && GomokuRules::isOnBoard(r, c) && board[r][c] == NONE)
        info.openEnds++;

    r = row - dy[dirIdx];
    c = col - dx[dirIdx];
    gaps = 0;

    while (GomokuRules::isOnBoard(r, c) && gaps <= 1)
    {
        if (board[r][c] == player)
            info.count++;
        else if (board[r][c] == NONE && gaps == 0)
            gaps++;
        else
            break;
        r -= dy[dirIdx];
        c -= dx[dirIdx];
    }
    if (gaps == 0 && GomokuRules::isOnBoard(r, c) && board[r][c] == NONE)
        info.openEnds++;

    return info;
}

std::vector<Move> GomokuAI::findWinningMoves(int player)
{
    std::vector<Move> wins;
    std::vector<Move> candidates = getCandidateMoves(player, false);

    for (const Move &move : candidates)
    {
        board[move.row][move.col] = player;
        if (checkWin(player))
            wins.push_back(move);
        board[move.row][move.col] = NONE;
    }

    return wins;
}

std::vector<Move> GomokuAI::findOpenFours(int player)
{
    std::vector<Move> fours;
    std::vector<Move> candidates = getCandidateMoves(player, false);

    for (const Move &move : candidates)
    {
        int score = evaluateMove(move.row, move.col, player);
        if (score >= SCORE_LIVE_FOUR)
            fours.push_back(move);
    }

    return fours;
}

std::vector<Move> GomokuAI::findOpenThrees(int player)
{
    std::vector<Move> threes;
    std::vector<Move> candidates = getCandidateMoves(player, false);

    for (const Move &move : candidates)
    {
        int score = evaluateMove(move.row, move.col, player);
        if (score >= SCORE_LIVE_THREE && score < SCORE_DEAD_FOUR)
            threes.push_back(move);
    }

    return threes;
}

bool GomokuAI::checkWin(int player)
{
    for (int r = 0; r < BOARD_SIZE; r++)
        for (int c = 0; c < BOARD_SIZE; c++)
            if (board[r][c] == player && checkWinAt(r, c, player))
                return true;
    return false;
}

bool GomokuAI::checkWinAt(int row, int col, int player)
{
    for (int dir = 0; dir < 4; dir++)
    {
        int count = 1;

        int r = row + dy[dir];
        int c = col + dx[dir];
        while (GomokuRules::isOnBoard(r, c) && board[r][c] == player)
        {
            count++;
            r += dy[dir];
            c += dx[dir];
        }

        r = row - dy[dir];
        c = col - dx[dir];
        while (GomokuRules::isOnBoard(r, c) && board[r][c] == player)
        {
            count++;
            r -= dy[dir];
            c -= dx[dir];
        }

        if (count >= 5)
            return true;
    }
    return false;
}

int GomokuAI::checkCaptures(int row, int col, int player)
{
    int captures = 0;
    int opponent = getOpponent(player);

    for (int dir = 0; dir < 4; dir++)
    {
        int r1 = row + dy[dir], c1 = col + dx[dir];
        int r2 = row + 2 * dy[dir], c2 = col + 2 * dx[dir];
        int r3 = row + 3 * dy[dir], c3 = col + 3 * dx[dir];

        if (GomokuRules::isOnBoard(r3, c3) && board[r1][c1] == opponent &&
            board[r2][c2] == opponent && board[r3][c3] == player)
            captures++;
    }

    return captures;
}

std::vector<Move> GomokuAI::getThreatMoves(int player)
{
    return findWinningMoves(player);
}

bool GomokuAI::hasForcingThreat(int player)
{
    return !getThreatMoves(player).empty();
}

int GomokuAI::countFreeThrees(int row, int col, int player)
{
    if (!isValidMove(row, col))
        return 0;

    int count = 0;

    for (int dir = 0; dir < 4; dir++)
    {
        board[row][col] = player;

        int stones = 1;
        int leftOpen = 0, rightOpen = 0;

        // Count right
        int r = row + dy[dir];
        int c = col + dx[dir];
        while (GomokuRules::isOnBoard(r, c) && board[r][c] == player && stones < 3)
        {
            stones++;
            r += dy[dir];
            c += dx[dir];
        }
        if (GomokuRules::isOnBoard(r, c) && board[r][c] == NONE)
            rightOpen = 1;

        // Count left
        r = row - dy[dir];
        c = col - dx[dir];
        while (GomokuRules::isOnBoard(r, c) && board[r][c] == player && stones < 3)
        {
            stones++;
            r -= dy[dir];
            c -= dx[dir];
        }
        if (GomokuRules::isOnBoard(r, c) && board[r][c] == NONE)
            leftOpen = 1;

        board[row][col] = NONE;

        if (stones == 3 && leftOpen == 1 && rightOpen == 1)
        {
            count++;
        }
    }

    return count;
}

bool GomokuAI::isDoubleFreeThree(int row, int col, int player)
{
    int freeThrees = countFreeThrees(row, col, player);

    if (freeThrees >= 2)
    {
        std::cout << "  Rejected double-three at (" << row << ", " << col << ")" << std::endl;
        return true;
    }

    return false;
}

void GomokuAI::makeMoveInternal(int row, int col, int player)
{
    MoveRecord record(Move(row, col));
    stateHistory.push_back(gameState);
    board[row][col] = player;

    int opponent = getOpponent(player);
    for (int dir = 0; dir < 4; dir++)
    {
        int r1 = row + dy[dir];
        int c1 = col + dx[dir];

        int r2 = row + 2 * dy[dir];
        int c2 = col + 2 * dx[dir];

        int r3 = row + 3 * dy[dir];
        int c3 = col + 3 * dx[dir];

        if (GomokuRules::isOnBoard(r3, c3) && board[r1][c1] == opponent &&
            board[r2][c2] == opponent && board[r3][c3] == player)
        {
            record.capturedStones.push_back(CaptureInfo(r1, c1, opponent));
            record.capturedStones.push_back(CaptureInfo(r2, c2, opponent));
            board[r1][c1] = NONE;
            board[r2][c2] = NONE;

            if (player == BLACK)
                gameState.capturedByBlack += 2;
            else
                gameState.capturedByWhite += 2;
        }
    }
    moveHistory.push(record);
}

void GomokuAI::undoMove()
{
    if (moveHistory.empty())
        return;

    MoveRecord lastRecord = moveHistory.top();
    moveHistory.pop();

    gameState = stateHistory.back();
    stateHistory.pop_back();

    board[lastRecord.move.row][lastRecord.move.col] = NONE;

    for (const CaptureInfo &capture : lastRecord.capturedStones)
    {
        board[capture.row][capture.col] = capture.player;
    }
}

void GomokuAI::makeMove(int row, int col, int player)
{
    if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE)
    {
        board[row][col] = player;
    }
}