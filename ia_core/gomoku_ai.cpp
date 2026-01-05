#include "gomoku_ai.h"
#include <algorithm>
#include <climits>
#include <iostream>

#define H_WIN 1000000000
#define H_OPEN_FOUR 50000000
#define H_FOUR 10000000
#define H_OPEN_THREE 1000000
#define H_THREE 100000
#define H_CAPTURE_PAIR 5000000

static GomokuAI *globalAI = nullptr;

GomokuAI *getGlobalAI()
{
    return globalAI;
}

GomokuAI::GomokuAI(int aiPlayerColor) : aiPlayer(aiPlayerColor)
{
    humanPlayer = getOpponent(aiPlayerColor);
    initZobrist();
    clearBoard();
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

void GomokuAI::initZobrist()
{
    std::mt19937_64 rng(12345);
    for (int i = 0; i < BOARD_SIZE; i++)
        for (int j = 0; j < BOARD_SIZE; j++)
            for (int k = 0; k < 3; k++)
                zobristTable[i][j][k] = rng();
}

void GomokuAI::updateHash(int r, int c, int piece)
{
    currentHash ^= zobristTable[r][c][piece];
}

void GomokuAI::clearBoard()
{
    for (int i = 0; i < BOARD_SIZE; i++)
        for (int j = 0; j < BOARD_SIZE; j++)
            board[i][j] = NONE;
    gameState = GameState();
    currentHash = 0;
    for (int i = 0; i < BOARD_SIZE; i++)
        for (int j = 0; j < BOARD_SIZE; j++)
            currentHash ^= zobristTable[i][j][NONE];
    transpositionTable.clear();
}

// ============================================================================
// SEARCH & DECISION
// ============================================================================

void GomokuAI::getBestMove(int &bestRow, int &bestCol)
{
    std::vector<Move> candidates = getCandidateMoves(aiPlayer);
    orderMoves(candidates, aiPlayer);

    int alpha = -H_WIN * 2;
    int beta = H_WIN * 2;

    // Iterative Deepening to reach Depth 10 safely
    for (int d = 1; d <= 10; d++)
    {
        int currentBestRow = -1, currentBestCol = -1;
        int bestScore = -H_WIN * 2;

        for (const auto &m : candidates)
        {
            makeMoveInternal(m.row, m.col, aiPlayer);
            int score = -minimax(d - 1, -beta, -alpha, humanPlayer, false);
            undoMove();

            if (score > bestScore)
            {
                bestScore = score;
                currentBestRow = m.row;
                currentBestCol = m.col;
            }
            alpha = std::max(alpha, bestScore);
        }
        bestRow = currentBestRow;
        bestCol = currentBestCol;

        // If we found a forced win, stop searching deeper
        if (bestScore >= H_OPEN_FOUR)
            break;
    }
}

int GomokuAI::minimax(int depth, int alpha, int beta, int player, bool isMaximizing)
{
    if (transpositionTable.count(currentHash))
    {
        TTEntry &entry = transpositionTable[currentHash];
        if (entry.depth >= depth)
            return entry.score;
    }

    int opponent = getOpponent(player);
    if (checkWin(opponent))
        return -H_WIN + (10 - depth);
    if (getCaptures(opponent) >= 10)
        return -H_WIN;
    if (depth <= 0)
        return evaluateBoard(aiPlayer);

    std::vector<Move> moves = getCandidateMoves(player);
    orderMoves(moves, player);

    int bestScore = -H_WIN * 2;
    for (const auto &m : moves)
    {
        makeMoveInternal(m.row, m.col, player);
        int score = -minimax(depth - 1, -beta, -alpha, opponent, !isMaximizing);
        undoMove();

        bestScore = std::max(bestScore, score);
        alpha = std::max(alpha, bestScore);
        if (alpha >= beta)
            break;
    }

    transpositionTable[currentHash] = {bestScore, depth};
    return bestScore;
}

// ============================================================================
// PATTERN ANALYSIS (WINDOW SLIDE)
// ============================================================================

LineInfo GomokuAI::analyzeLine(int row, int col, int player, int dirIdx)
{
    LineInfo best;
    int opponent = getOpponent(player);

    for (int offset = -4; offset <= 0; ++offset)
    {
        int rs = row + offset * dy[dirIdx], cs = col + offset * dx[dirIdx];
        int re = rs + 4 * dy[dirIdx], ce = cs + 4 * dx[dirIdx];

        if (!isInBounds(rs, cs) || !isInBounds(re, ce))
            continue;

        int pCount = 0;
        bool blocked = false;
        for (int i = 0; i < 5; ++i)
        {
            int curR = rs + i * dy[dirIdx], curC = cs + i * dx[dirIdx];
            if (board[curR][curC] == opponent)
            {
                blocked = true;
                break;
            }
            if (board[curR][curC] == player)
                pCount++;
        }

        if (!blocked)
        {
            LineInfo cur;
            cur.count = pCount;
            if (isInBounds(rs - dy[dirIdx], cs - dx[dirIdx]) && board[rs - dy[dirIdx]][cs - dx[dirIdx]] == NONE)
                cur.openEnds++;
            if (isInBounds(re + dy[dirIdx], ce + dx[dirIdx]) && board[re + dy[dirIdx]][ce + dx[dirIdx]] == NONE)
                cur.openEnds++;
            if (cur.count > best.count)
                best = cur;
        }
    }
    return best;
}

// ============================================================================
// MOVE MANAGEMENT (WITH HASHING)
// ============================================================================

void GomokuAI::makeMoveInternal(int row, int col, int player)
{
    MoveRecord record(Move(row, col));
    stateHistory.push_back(gameState);

    updateHash(row, col, NONE);   // XOR out empty
    updateHash(row, col, player); // XOR in player
    board[row][col] = player;

    int opponent = getOpponent(player);
    for (int dir = 0; dir < 4; dir++)
    {
        int r1 = row + dy[dir], c1 = col + dx[dir];
        int r2 = row + 2 * dy[dir], c2 = col + 2 * dx[dir];
        int r3 = row + 3 * dy[dir], c3 = col + 3 * dx[dir];

        if (isInBounds(r3, c3) && board[r1][c1] == opponent && board[r2][c2] == opponent && board[r3][c3] == player)
        {
            record.capturedStones.push_back(CaptureInfo(r1, c1, opponent));
            record.capturedStones.push_back(CaptureInfo(r2, c2, opponent));

            // Sync Hash with removal
            updateHash(r1, c1, opponent);
            updateHash(r1, c1, NONE);
            updateHash(r2, c2, opponent);
            updateHash(r2, c2, NONE);

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
    MoveRecord last = moveHistory.top();
    moveHistory.pop();

    updateHash(last.move.row, last.move.col, board[last.move.row][last.move.col]);
    updateHash(last.move.row, last.move.col, NONE);
    board[last.move.row][last.move.col] = NONE;

    for (auto &cap : last.capturedStones)
    {
        updateHash(cap.row, cap.col, NONE);
        updateHash(cap.row, cap.col, cap.player);
        board[cap.row][cap.col] = cap.player;
    }
    gameState = stateHistory.back();
    stateHistory.pop_back();
}

// ============================================================================
// EVALUATION & SORTING
// ============================================================================

void GomokuAI::orderMoves(std::vector<Move> &moves, int player)
{
    for (auto &m : moves)
        m.score = quickEvaluate(m.row, m.col, player);
    std::sort(moves.begin(), moves.end(), [](const Move &a, const Move &b)
              { return a.score > b.score; });
}

int GomokuAI::quickEvaluate(int row, int col, int player)
{
    int score = 0;
    int opponent = getOpponent(player);
    if (checkWinAt(row, col, player))
        return H_WIN;
    if (checkWinAt(row, col, opponent))
        return H_WIN / 2;

    for (int dir = 0; dir < 4; dir++)
    {
        LineInfo my = analyzeLine(row, col, player, dir);
        LineInfo opp = analyzeLine(row, col, opponent, dir);
        score += evaluateLine(my.count, my.openEnds);
        score += evaluateLine(opp.count, opp.openEnds) * 2; // Defensive bias
    }
    return score + (20 - manhattanDistance(row, col, BOARD_SIZE / 2, BOARD_SIZE / 2));
}

int GomokuAI::evaluateBoard(int player)
{
    int opponent = getOpponent(player);
    long long score = 0;
    for (int r = 0; r < BOARD_SIZE; r++)
    {
        for (int c = 0; c < BOARD_SIZE; c++)
        {
            if (board[r][c] == NONE)
                continue;
            int owner = board[r][c];
            for (int dir = 0; dir < 4; dir++)
            {
                LineInfo info = analyzeLine(r, c, owner, dir);
                int val = evaluateLine(info.count, info.openEnds);
                if (owner == player)
                    score += val;
                else
                    score -= (val * 2);
            }
        }
    }
    return (int)(score / 4);
}

int GomokuAI::evaluateLine(int count, int openEnds)
{
    if (count >= 5)
        return H_WIN;
    if (count == 4)
        return (openEnds >= 1) ? H_FOUR : H_FOUR / 10;
    if (count == 3)
        return (openEnds == 2) ? H_OPEN_THREE : H_THREE;
    return 0;
}

bool GomokuAI::checkWinAt(int row, int col, int player)
{
    for (int dir = 0; dir < 4; dir++)
    {
        int count = 1;
        for (int i = 1; i < 5; i++)
        {
            if (isInBounds(row + i * dy[dir], col + i * dx[dir]) && board[row + i * dy[dir]][col + i * dx[dir]] == player)
                count++;
            else
                break;
        }
        for (int i = 1; i < 5; i++)
        {
            if (isInBounds(row - i * dy[dir], col - i * dx[dir]) && board[row - i * dy[dir]][col - i * dx[dir]] == player)
                count++;
            else
                break;
        }
        if (count >= 5)
            return true;
    }
    return false;
}

bool GomokuAI::checkWin(int player)
{
    for (int r = 0; r < BOARD_SIZE; r++)
        for (int c = 0; c < BOARD_SIZE; c++)
            if (board[r][c] == player && checkWinAt(r, c, player))
                return true;
    return false;
}

std::vector<Move> GomokuAI::getCandidateMoves(int player)
{
    std::vector<Move> moves;
    bool checked[BOARD_SIZE][BOARD_SIZE] = {false};
    for (int r = 0; r < BOARD_SIZE; r++)
    {
        for (int c = 0; c < BOARD_SIZE; c++)
        {
            if (board[r][c] != NONE)
            {
                for (int dr = -2; dr <= 2; dr++)
                {
                    for (int dc = -2; dc <= 2; dc++)
                    {
                        int nr = r + dr, nc = c + dc;
                        if (isInBounds(nr, nc) && board[nr][nc] == NONE && !checked[nr][nc])
                        {
                            moves.push_back(Move(nr, nc));
                            checked[nr][nc] = true;
                        }
                    }
                }
            }
        }
    }
    if (moves.empty())
        moves.push_back(Move(BOARD_SIZE / 2, BOARD_SIZE / 2));
    return moves;
}

void GomokuAI::makeMove(int row, int col, int player)
{
    if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE)
    {
        board[row][col] = player;
    }
}