#include "gomoku_ai.h"
#include <algorithm>
#include <climits>
#include <cstring>
#include <set>
#include <random>
#include <iostream>

#ifdef DEBUG_AI_LOGS
#include <emscripten.h>
#endif

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

// Defense score multiplier for heuristic evaluation
const float DEFENSE_MULTIPLIER = 1.2f;

#ifdef DEBUG_AI_LOGS

void logMoveAnalysis(int row, int col, int player, int score, bool isBestMove = false)
{
    EM_ASM_({ console.group("%c[AI MOVE ANALYSIS]", "color: #ff6600; font-weight: bold;"); });

    EM_ASM_({ console.log("%c Position: (%d, %d) | Joueur: %s",
                          "font-weight: bold;",
                          $0, $1, $2 == 1 ? "⚫ BLACK" : "⚪ WHITE"); }, row, col, player);

    if (isBestMove)
    {

        EM_ASM_({ console.log("%c[AI BEST MOVE DECISION]", "color: #00ff00; font-weight: bold;",
                              $0.toLocaleString()); }, score);
    }
    else
    {

        EM_ASM_({ console.log("%c\nSCORE DECISION: %s",
                              "color: #ffd700; font-weight: bold; font-size: 14px;",
                              $0.toLocaleString()); }, score);
    }
    EM_ASM_({ console.groupEnd(); });

    EM_ASM_({ console.groupEnd(); });
}

#endif

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

#ifdef DEBUG_AI_LOGS
    EM_ASM_({ console.group("%c[AI PROCESSING BEST MOVE]", "color: #00d4ff; font-weight: bold;"); });
#endif

    bestRow = bestCol = -1;

    int stoneCount = 0;
    for (int i = 0; i < BOARD_SIZE; i++)
        for (int j = 0; j < BOARD_SIZE; j++)
            if (board[i][j] != NONE)
                stoneCount++;

    if (stoneCount == 0)
    {
        bestRow = bestCol = BOARD_SIZE / 2;
#ifdef DEBUG_AI_LOGS
        logMoveAnalysis(bestRow, bestCol, aiPlayer, 0);
#endif
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
#ifdef DEBUG_AI_LOGS
        logMoveAnalysis(bestRow, bestCol, aiPlayer, 0);
#endif
        return;
    }

    std::vector<Move> candidates = getCandidateMoves(aiPlayer);

    // Store ALL candidates for Debug Heatmap (Type 0 = Yellow)
    aiCandidateMoves = candidates;

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
            // Mark winning move as Type 2 (Purple - One Shot)
            for (auto &dm : aiCandidateMoves)
            {
                if (dm.row == move.row && dm.col == move.col)
                {
                    dm.score = SCORE_FIVE;
                    dm.algoType = 2;
                    break;
                }
            }
#ifdef DEBUG_AI_LOGS
            logMoveAnalysis(bestRow, bestCol, aiPlayer, SCORE_FIVE, true);
#endif
            return;
        }

        board[move.row][move.col] = humanPlayer;
        bool oppWins = checkWinQuick(move.row, move.col, humanPlayer);
        board[move.row][move.col] = NONE;

        if (oppWins)
        {
            bestRow = move.row;
            bestCol = move.col;
            // Mark forced block as Type 2 (Purple - One Shot)
            for (auto &dm : aiCandidateMoves)
            {
                if (dm.row == move.row && dm.col == move.col)
                {
                    dm.score = SCORE_FIVE;
                    dm.algoType = 2;
                    break;
                }
            }
#ifdef DEBUG_AI_LOGS
            logMoveAnalysis(bestRow, bestCol, aiPlayer, SCORE_FIVE, true);
#endif
            return;
        }

        int score = evaluateMoveQuick(move.row, move.col, aiPlayer);
        score += evaluateMoveQuick(move.row, move.col, humanPlayer) * DEFENSE_MULTIPLIER;

        if (score < SCORE_LIVE_FOUR && GomokuRules::isStoneCapturable(board, move.row, move.col, humanPlayer)) {
            std::cout << "Capturable stone at (" << move.row << ", " << move.col << ")" << std::endl;
            move.score = INT_MIN;
        }
        else
            move.score = score;

        // Update heuristic score in debug list (Type 0)
        for (auto &dm : aiCandidateMoves)
        {
            if (score == INT_MIN)
                continue;

            if (dm.row == move.row && dm.col == move.col)
            {
                dm.score = score;
                break;
            }
        }

        if (score > bestScore)
        {
            bestScore = score;
            bestRow = move.row;
            bestCol = move.col;
        }
    }

    int depth = 10;

    std::sort(candidates.begin(), candidates.end(),
              [](const Move &a, const Move &b)
              { return a.score > b.score; });

    int maxCandidates = 12;

    int alpha = -INT_MAX;
    int beta = INT_MAX;

    for (int i = 0; i < maxCandidates; i++)
    {
        makeMoveInternal(candidates[i].row, candidates[i].col, aiPlayer);
        int score = -minimax(depth - 1, -beta, -alpha, humanPlayer);
        undoMove();

#ifdef DEBUG_AI_LOGS
        logMoveAnalysis(candidates[i].row, candidates[i].col, aiPlayer, score);
#endif

        if (score > alpha)
        {
            alpha = score;
            bestRow = candidates[i].row;
            bestCol = candidates[i].col;
        }

        // Update the candidate in the global list with Minimax score and Type 1 (Red)
        for (auto &debugMove : aiCandidateMoves)
        {
            if (debugMove.row == candidates[i].row && debugMove.col == candidates[i].col)
            {
                debugMove.score = score;
                debugMove.algoType = 1; // Mark as analyzed by Minimax
                break;
            }
        }

        if (alpha >= beta)
            break;
    }

#ifdef DEBUG_AI_LOGS
    logMoveAnalysis(bestRow, bestCol, aiPlayer, alpha, true);
#endif
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
    int captureCount = GomokuRules::checkCaptures(board, row, col, player);
    int playerCapture = (player == BLACK) ? gameState.capturedByBlack : gameState.capturedByWhite;

    if (playerCapture + captureCount >= MAX_CAPTURE_STONES)
    {
        return SCORE_FIVE;
    }

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
        int patternScore = 0;
        const char *patternType = "";

        switch (count)
        {
        case 5:
            patternScore = SCORE_FIVE;
            break;
        case 4:

            if (openEnds == 2)
                patternScore = SCORE_LIVE_FOUR;
            else
                patternScore = SCORE_DEAD_FOUR;
            break;
        case 3:

            if (openEnds == 2)
                patternScore = SCORE_LIVE_THREE;
            else
                patternScore = SCORE_DEAD_THREE;
            break;
        case 2:

            if (openEnds == 2)
                patternScore = SCORE_LIVE_TWO;
            else
                patternScore = SCORE_DEAD_TWO;

            break;
        case 1:
            patternScore = SCORE_ONE;
            break;

        default:
            break;
        }

        score += patternScore;
    }

    if (score >= SCORE_FIVE)
        return score;

    int captureScore = captureCount * SCORE_DEAD_FOUR * 1.1;
    score += captureScore;

    int centerDist = abs(row - BOARD_SIZE / 2) + abs(col - BOARD_SIZE / 2);
    int centralityBonus = (BOARD_SIZE - centerDist) * 50;
    score += centralityBonus;

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
            bool usable = false;
            if (entry.flag == 0)
                usable = true;
            else if (entry.flag == 1 && entry.score <= alpha)
                usable = true;
            else if (entry.flag == 2 && entry.score >= beta)
                usable = true;

            if (usable)
            {
                return entry.score;
            }
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
    {
        m.score = evaluateMoveQuick(m.row, m.col, player);
        if (m.score < SCORE_LIVE_FOUR && GomokuRules::isStoneCapturable(board, m.row, m.col, getOpponent(player))) {
            std::cout << "Capturable stone at (" << m.row << ", " << m.col << ")" << std::endl;
            m.score = INT_MIN;
        }
    }

    std::sort(candidates.begin(), candidates.end(),
              [](const Move &a, const Move &b)
              { return a.score > b.score; });

    candidates.resize(10);

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

                        if (!GomokuRules::isEmptyCell(board, nr, nc) && visited[nr][nc])
                            continue;

                        if (GomokuRules::validateMove(board, nr, nc, player) != VALID)
                            continue;

                        candidates.push_back(Move(nr, nc, 0));
                        visited[nr][nc] = true;
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

    score += pCaps * SCORE_DEAD_FOUR * 1.1;
    score -= oCaps * SCORE_DEAD_FOUR * 1.1;

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