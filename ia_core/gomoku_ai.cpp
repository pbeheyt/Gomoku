
#include "gomoku_ai.h"
#include <algorithm>
#include <climits>
#include <cstring>
#include <set>
#include <random>

static GomokuAI *globalAI = nullptr;

GomokuAI *getGlobalAI()
{
    return globalAI;
}

// Evaluation scores
const int SCORE_FIVE = 100000000;
const int SCORE_LIVE_FOUR = 50000000;
const int SCORE_DEAD_FOUR = 10000000;
const int SCORE_LIVE_THREE = 5000000;
const int SCORE_DEAD_THREE = 500000;
const int SCORE_LIVE_TWO = 100000;
const int SCORE_DEAD_TWO = 10000;
const int SCORE_ONE = 1000;

// Zobrist hashing - Ai brain, to remember pattern and avoid double computation
uint64_t zobristTable[BOARD_SIZE][BOARD_SIZE][3];
std::unordered_map<uint64_t, TTEntry> transpositionTable;

void initZobrist()
{
    static bool initialized = false;
    if (initialized)
        return;

    std::mt19937_64 rng(12345);
    for (int i = 0; i < BOARD_SIZE; i++)
        for (int j = 0; j < BOARD_SIZE; j++)
            for (int k = 0; k < 3; k++)
                zobristTable[i][j][k] = rng();
    initialized = true;
}

GomokuAI::GomokuAI(int aiPlayerColor)
{
    this->aiPlayer = aiPlayerColor;
    this->humanPlayer = (aiPlayerColor == BLACK) ? WHITE : BLACK;
    initZobrist();
    clearBoard();
    globalAI = this;
}

void GomokuAI::clearBoard()
{
    memset(board, NONE, sizeof(board));
    gameState = GameState();
    while (!moveHistory.empty())
        moveHistory.pop();
    stateHistory.clear();
    currentHash = 0;
}

void GomokuAI::setBoard(const int *flatBoard, int blackCaptures, int whiteCaptures)
{
    for (int i = 0; i < BOARD_SIZE; i++)
        for (int j = 0; j < BOARD_SIZE; j++)
            board[i][j] = flatBoard[i * BOARD_SIZE + j];

    gameState.capturedByBlack = blackCaptures;
    gameState.capturedByWhite = whiteCaptures;

    currentHash = 0;
    for (int i = 0; i < BOARD_SIZE; i++)
        for (int j = 0; j < BOARD_SIZE; j++)
            if (board[i][j] != NONE)
                currentHash ^= zobristTable[i][j][board[i][j]];
}

bool GomokuAI::isValidMove(int row, int col)
{
    return GomokuRules::isOnBoard(row, col) && board[row][col] == NONE;
}

void GomokuAI::getBestMove(int &bestRow, int &bestCol)
{
    bestRow = bestCol = -1;

    int stoneCount = 0;
    for (int i = 0; i < BOARD_SIZE; i++)
        for (int j = 0; j < BOARD_SIZE; j++)
            if (board[i][j] != NONE)
                stoneCount++;

    if (stoneCount == 0)
    {
        bestRow = bestCol = BOARD_SIZE / 2;
        return;
    }

    if (stoneCount == 1)
    {
        if (board[BOARD_SIZE / 2][BOARD_SIZE / 2] != NONE)
        {
            bestRow = BOARD_SIZE / 2;
            bestCol = BOARD_SIZE / 2 + 1;
        }
        else
        {
            bestRow = bestCol = BOARD_SIZE / 2;
        }
        return;
    }

    std::vector<Move> candidates = getCandidateMoves(aiPlayer);
    if (candidates.empty())
    {
        bestRow = bestCol = BOARD_SIZE / 2;
        return;
    }

    int bestScore = INT_MIN;

    for (Move &move : candidates)
    {
        board[move.row][move.col] = aiPlayer;
        bool aiWins = checkWinQuick(move.row, move.col, aiPlayer);
        board[move.row][move.col] = NONE;

        if (aiWins)
        {
            bestRow = move.row;
            bestCol = move.col;
            return;
        }

        board[move.row][move.col] = humanPlayer;
        bool oppWins = checkWinQuick(move.row, move.col, humanPlayer);
        board[move.row][move.col] = NONE;

        if (oppWins)
        {
            bestRow = move.row;
            bestCol = move.col;
            return;
        }

        int score = evaluateMoveQuick(move.row, move.col, aiPlayer);
        score += evaluateMoveQuick(move.row, move.col, humanPlayer) * 1.1;

        move.score = score;
        if (score > bestScore)
        {
            bestScore = score;
            bestRow = move.row;
            bestCol = move.col;
        }
    }

    if (bestScore > SCORE_LIVE_THREE)
        return;

    int depth = 10;

    std::sort(candidates.begin(), candidates.end(),
              [](const Move &a, const Move &b)
              { return a.score > b.score; });

    int maxCandidates = std::min(6, (int)candidates.size());

    int alpha = -INT_MAX;
    int beta = INT_MAX;

    for (int i = 0; i < maxCandidates; i++)
    {
        makeMoveInternal(candidates[i].row, candidates[i].col, aiPlayer);
        int score = -minimax(depth - 1, -beta, -alpha, humanPlayer);
        undoMove();

        if (score > alpha)
        {
            alpha = score;
            bestRow = candidates[i].row;
            bestCol = candidates[i].col;
        }

        if (alpha >= beta)
            break;
    }
}

bool GomokuAI::checkWinQuick(int row, int col, int player)
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

    int captures = (player == BLACK) ? gameState.capturedByBlack : gameState.capturedByWhite;
    int potentialCaptures = GomokuRules::checkCaptures(board, row, col, player);

    return captures + potentialCaptures >= MAX_CAPTURE_STONES;
}

int GomokuAI::evaluateMoveQuick(int row, int col, int player)
{
    int score = 0;

    for (int dir = 0; dir < 4; dir++)
    {
        int count = 1;
        int openEnds = 0;

        // Count right
        int r = row + dy[dir];
        int c = col + dx[dir];
        while (GomokuRules::isOnBoard(r, c) && board[r][c] == player && count < 5)
        {
            count++;
            r += dy[dir];
            c += dx[dir];
        }
        if (GomokuRules::isEmptyCell(board, r, c))
            openEnds++;

        // Count left
        r = row - dy[dir];
        c = col - dx[dir];
        while (GomokuRules::isOnBoard(r, c) && board[r][c] == player && count < 5)
        {
            count++;
            r -= dy[dir];
            c -= dx[dir];
        }
        if (GomokuRules::isEmptyCell(board, r, c))
            openEnds++;

        // Score pattern
        if (count >= 5)
            score += SCORE_FIVE;
        else if (count == 4)
            score += (openEnds == 2) ? SCORE_LIVE_FOUR : SCORE_DEAD_FOUR;
        else if (count == 3)
            score += (openEnds == 2) ? SCORE_LIVE_THREE : SCORE_DEAD_THREE;
        else if (count == 2)
            score += (openEnds == 2) ? SCORE_LIVE_TWO : SCORE_DEAD_TWO;
    }

    score += GomokuRules::checkCaptures(board, row, col, player) * SCORE_LIVE_THREE;

    int centerDist = abs(row - BOARD_SIZE / 2) + abs(col - BOARD_SIZE / 2);
    score += (BOARD_SIZE - centerDist) * 50;

    return score;
}

int GomokuAI::minimax(int depth, int alpha, int beta, int player)
{
    if (depth == 0)
        return evaluateBoard(player);

    if (transpositionTable.count(currentHash))
    {
        TTEntry &entry = transpositionTable[currentHash];
        if (entry.depth >= depth)
        {
            if (entry.flag == 0)
                return entry.score;
            if (entry.flag == 1 && entry.score <= alpha)
                return alpha;
            if (entry.flag == 2 && entry.score >= beta)
                return beta;
        }
    }

    int opponent = getOpponent(player);
    int pCaps = (player == BLACK) ? gameState.capturedByBlack : gameState.capturedByWhite;

    if (pCaps >= MAX_CAPTURE_STONES)
        return SCORE_FIVE + depth;

    std::vector<Move> candidates = getCandidateMoves(player);
    if (candidates.empty())
        return evaluateBoard(player);

    for (Move &m : candidates)
        m.score = evaluateMoveQuick(m.row, m.col, player);

    std::sort(candidates.begin(), candidates.end(),
              [](const Move &a, const Move &b)
              { return a.score > b.score; });

    int maxMoves = (depth > 3) ? 4 : 6;

    if (candidates.size() > maxMoves)
        candidates.resize(maxMoves);

    int bestScore = -INT_MAX;
    int oldAlpha = alpha;

    for (const Move &move : candidates)
    {
        makeMoveInternal(move.row, move.col, player);
        int score = -minimax(depth - 1, -beta, -alpha, opponent);
        undoMove();

        if (score > bestScore)
            bestScore = score;
        if (score > alpha)
            alpha = score;
        if (alpha >= beta)
            break;
    }

    TTEntry entry;
    entry.score = bestScore;
    entry.depth = depth;
    entry.flag = (bestScore <= oldAlpha) ? 1 : (bestScore >= beta ? 2 : 0);
    transpositionTable[currentHash] = entry;

    return bestScore;
}

std::vector<Move> GomokuAI::getCandidateMoves(int player)
{
    std::vector<Move> candidates;
    candidates.reserve(50);

    bool visited[BOARD_SIZE][BOARD_SIZE] = {false};
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

                        if (GomokuRules::isOnBoard(nr, nc) &&
                            !visited[nr][nc] &&
                            board[nr][nc] == NONE)
                        {
                            if (GomokuRules::validateMove(board, nr, nc, player) == VALID)
                            {
                                candidates.push_back(Move(nr, nc, 0));
                                visited[nr][nc] = true;
                            }
                        }
                    }
                }
            }
        }
    }

    return candidates;
}

int GomokuAI::evaluateBoard(int player)
{
    int opponent = getOpponent(player);

    int pCaps = (player == BLACK) ? gameState.capturedByBlack : gameState.capturedByWhite;
    int oCaps = (opponent == BLACK) ? gameState.capturedByBlack : gameState.capturedByWhite;

    if (pCaps >= MAX_CAPTURE_STONES)
        return SCORE_FIVE;
    if (oCaps >= MAX_CAPTURE_STONES)
        return -SCORE_FIVE;

    int score = 0;
    int scoreAttack = 0;
    int scoreDefense = 0;

    score += pCaps * SCORE_LIVE_THREE;
    score -= oCaps * SCORE_LIVE_THREE;

    for (int r = 0; r < BOARD_SIZE; r++)
    {
        for (int c = 0; c < BOARD_SIZE; c++)
        {
            if (board[r][c] == player)
            {
                scoreAttack += evaluateMoveQuick(r, c, player);
            }
            else if (board[r][c] == opponent)
            {
                scoreDefense -= evaluateMoveQuick(r, c, opponent);
            }
        }
    }

    score += scoreAttack;
    score += scoreDefense * 1.2;

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
    LineInfo info = {1, 0, 0, false};

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
    if (gaps == 0 && GomokuRules::isEmptyCell(board, r, c))
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
    if (gaps == 0 && GomokuRules::isEmptyCell(board, r, c))
        info.openEnds++;

    return info;
}

void GomokuAI::makeMoveInternal(int row, int col, int player)
{
    currentHash ^= zobristTable[row][col][NONE];
    currentHash ^= zobristTable[row][col][player];

    MoveRecord record(Move(row, col), player);
    stateHistory.push_back(gameState);

    board[row][col] = player;

    int capturedStonesOut[16][2];
    int nbCaptures = GomokuRules::checkCaptures(board, row, col, player, capturedStonesOut);
    int opponent = getOpponent(player);

    for (int i = 0; i < nbCaptures; i++)
    {
        int cr = capturedStonesOut[i][0];
        int cc = capturedStonesOut[i][1];

        record.capturedStones.push_back(CaptureInfo(cr, cc, opponent));

        currentHash ^= zobristTable[cr][cc][opponent];
        currentHash ^= zobristTable[cr][cc][NONE];

        board[cr][cc] = NONE;
    }

    if (player == BLACK)
        gameState.capturedByBlack += nbCaptures;
    else
        gameState.capturedByWhite += nbCaptures;

    moveHistory.push(record);
}

void GomokuAI::undoMove()
{
    if (moveHistory.empty())
        return;

    MoveRecord lastRecord = moveHistory.top();
    moveHistory.pop();

    currentHash ^= zobristTable[lastRecord.move.row][lastRecord.move.col][lastRecord.player];
    currentHash ^= zobristTable[lastRecord.move.row][lastRecord.move.col][NONE];

    gameState = stateHistory.back();
    stateHistory.pop_back();

    board[lastRecord.move.row][lastRecord.move.col] = NONE;

    for (const CaptureInfo &capture : lastRecord.capturedStones)
    {
        currentHash ^= zobristTable[capture.row][capture.col][NONE];
        currentHash ^= zobristTable[capture.row][capture.col][capture.player];

        board[capture.row][capture.col] = capture.player;
    }
}

void GomokuAI::makeMove(int row, int col, int player)
{
    if (GomokuRules::isOnBoard(row, col))
    {
        board[row][col] = player;
        currentHash ^= zobristTable[row][col][NONE];
        currentHash ^= zobristTable[row][col][player];
    }
}

std::vector<Move> GomokuAI::findOpenFours(int player)
{
    std::vector<Move> fours;
    std::vector<Move> candidates = getCandidateMoves(player);

    for (const Move &move : candidates)
    {
        int score = evaluateMoveQuick(move.row, move.col, player);
        if (score >= SCORE_LIVE_FOUR)
            fours.push_back(move);
    }
    return fours;
}

std::vector<Move> GomokuAI::findOpenThrees(int player)
{
    std::vector<Move> threes;
    std::vector<Move> candidates = getCandidateMoves(player);

    for (const Move &move : candidates)
    {
        int score = evaluateMoveQuick(move.row, move.col, player);
        if (score >= SCORE_LIVE_THREE && score < SCORE_DEAD_FOUR)
            threes.push_back(move);
    }
    return threes;
}

void GomokuAI::orderMoves(std::vector<Move> &moves, int player)
{
    for (Move &move : moves)
        move.score = evaluateMoveQuick(move.row, move.col, player);

    std::sort(moves.begin(), moves.end(),
              [](const Move &a, const Move &b)
              { return a.score > b.score; });
}