
#include "gomoku_ai.h"
#include <algorithm>
#include <climits>
#include <cstring>
#include <set>
#include <random>

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
const float DEFENSE_MULTIPLIER = 1.1f;

#ifdef DEBUG_AI_LOGS
void logMoveAnalysis(int row, int col, int player, const char *decisionMode, int realScore, const ScoreBreakdown *attackBreakdown = nullptr, const ScoreBreakdown *defenseBreakdown = nullptr, float defenseMultiplier = 1.0f)
{
    EM_ASM_({ console.group("%c[AI MOVE ANALYSIS]", "color: #00d4ff; font-weight: bold;"); });

    // Position et joueur
    EM_ASM_({ console.log("%c Position: (%d, %d) | Joueur: %s",
                          "font-weight: bold;",
                          $0, $1, $2 == = 1 ? "⚫ BLACK" : "⚪ WHITE"); }, row, col, player);

    // Mode de décision
    EM_ASM_({ console.log("%c Mode: %s",
                          "color: #ffa500; font-weight: bold;",
                          UTF8ToString($0)); }, decisionMode);

    // Si breakdown fourni, afficher les détails (mode Heuristic uniquement)
    if (attackBreakdown)
    {
        const char *dirNames[4] = {"Horizontal", "Vertical", "Diagonale \\", "Diagonale /"};

        // Affichage des patterns directionnels (Attaque)
        EM_ASM_({ console.log("%c\n[ATTAQUE]", "color: #ff4444; font-weight: bold;"); });
        for (int dir = 0; dir < 4; dir++)
        {
            if (attackBreakdown->patternScores[dir] > 0)
            {
                EM_ASM_({ console.log("  %s: %s (%d stones, %d open) → +%s",
                                      UTF8ToString($0),
                                      UTF8ToString($1),
                                      $2, $3,
                                      $4.toLocaleString()); }, dirNames[dir], attackBreakdown->patternTypes[dir], attackBreakdown->patternCounts[dir], attackBreakdown->patternOpenEnds[dir], attackBreakdown->patternScores[dir]);
            }
        }

        // Affichage des captures (Attaque)
        if (attackBreakdown->captureCount > 0)
        {
            EM_ASM_({ console.log("%cCaptures: %d paires → +%s",
                                  "color: #ff6b35;",
                                  $0, $1.toLocaleString()); }, attackBreakdown->captureCount, attackBreakdown->captureScore);
        }

        // Affichage de la centralité (Attaque)
        EM_ASM_({ console.log("%cCentralité: → +%s",
                              "color: #95e1d3;",
                              $0.toLocaleString()); }, attackBreakdown->centralityBonus);

        EM_ASM_({ console.log("Score Attaque: %s", $0.toLocaleString()); }, attackBreakdown->totalScore);

        // Si breakdown défensif fourni, l'afficher
        if (defenseBreakdown)
        {
            EM_ASM_({
                console.log("%c\n[DEFENSE]", "color: #4444ff; font-weight: bold;");
            });

            for (int dir = 0; dir < 4; dir++)
            {
                if (defenseBreakdown->patternScores[dir] > 0)
                {
                    EM_ASM_({ console.log("  %s: %s (%d stones, %d open) → +%s",
                                          UTF8ToString($0),
                                          UTF8ToString($1),
                                          $2, $3,
                                          $4.toLocaleString()); }, dirNames[dir], defenseBreakdown->patternTypes[dir], defenseBreakdown->patternCounts[dir], defenseBreakdown->patternOpenEnds[dir], defenseBreakdown->patternScores[dir]);
                }
            }

            if (defenseBreakdown->captureCount > 0)
            {
                EM_ASM_({ console.log("%cCaptures: %d paires → +%s",
                                      "color: #ff6b35;",
                                      $0, $1.toLocaleString()); }, defenseBreakdown->captureCount, defenseBreakdown->captureScore);
            }

            EM_ASM_({ console.log("%cCentralité: → +%s",
                                  "color: #95e1d3;",
                                  $0.toLocaleString()); }, defenseBreakdown->centralityBonus);

            EM_ASM_({ console.log("Score Défense brut: %s", $0.toLocaleString()); }, defenseBreakdown->totalScore);

            int defenseTotal = defenseBreakdown->totalScore * defenseMultiplier;
            EM_ASM_({ console.log("× " + $0.toFixed(1) + " = %s", $1.toLocaleString()); }, defenseMultiplier, defenseTotal);
        }
    }

    // Score total
    EM_ASM_({ console.log("%c\nSCORE DECISION: %s",
                          "color: #ffd700; font-weight: bold; font-size: 14px;",
                          $0.toLocaleString()); }, realScore);

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
        logMoveAnalysis(bestRow, bestCol, aiPlayer, "Opening (Hard-coded center)", 0);
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
        logMoveAnalysis(bestRow, bestCol, aiPlayer, "Opening (Near center)", 0);
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
            logMoveAnalysis(bestRow, bestCol, aiPlayer, "Winning Move (5 aligned or 10 captures)", SCORE_FIVE);
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
            logMoveAnalysis(bestRow, bestCol, aiPlayer, "Forced Block (Opponent winning threat)", SCORE_FIVE);
#endif
            return;
        }

        int score = evaluateMoveQuick(move.row, move.col, aiPlayer);
        score += evaluateMoveQuick(move.row, move.col, humanPlayer) * DEFENSE_MULTIPLIER;

        move.score = score;

        // Update heuristic score in debug list (Type 0)
        for (auto &dm : aiCandidateMoves)
        {
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

    //     if (bestScore > SCORE_LIVE_THREE)
    //     {
    //         // Heuristic found a very strong move (Live Three+), skipping Minimax.
    //         // Mark the chosen move as Type 2 (Purple - One Shot).
    //         for (auto &dm : aiCandidateMoves)
    //         {
    //             if (dm.row == bestRow && dm.col == bestCol)
    //             {
    //                 dm.algoType = 2;
    //                 break;
    //             }
    //         }
    // #ifdef DEBUG_AI_LOGS
    //         ScoreBreakdown breakdownAttack, breakdownDefense;
    //         evaluateMoveQuick(bestRow, bestCol, aiPlayer, &breakdownAttack);
    //         evaluateMoveQuick(bestRow, bestCol, humanPlayer, &breakdownDefense);
    //         logMoveAnalysis(bestRow, bestCol, aiPlayer, "Heuristic (Attack + Defense x1.1)", bestScore, &breakdownAttack, &breakdownDefense, DEFENSE_MULTIPLIER);
    // #endif
    //         return;
    //     }

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

        // Update the candidate in the global list with Minimax score and Type 1 (Red)
        for (auto &debugMove : aiCandidateMoves)
        {
            if (debugMove.row == candidates[i].row && debugMove.col == candidates[i].col)
            {
                debugMove.score = std::max(candidates[i].score, score);
                debugMove.algoType = 1; // Mark as analyzed by Minimax
                break;
            }
        }

        if (alpha >= beta)
            break;
    }

#ifdef DEBUG_AI_LOGS
    logMoveAnalysis(bestRow, bestCol, aiPlayer, "Minimax Deep Search", alpha);
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

int GomokuAI::evaluateMoveQuick(int row, int col, int player, ScoreBreakdown *details)
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
        int patternScore = 0;
        const char *patternType = "";

        switch (count)
        {
        case 5:
            patternScore = SCORE_FIVE;
            patternType = "Five";
            break;
        case 4:
            if (openEnds == 2)
            {
                patternScore = SCORE_LIVE_FOUR;
                patternType = "Live Four";
            }
            else
            {
                patternScore = SCORE_DEAD_FOUR;
                patternType = "Dead Four";
            }
            break;
        case 3:
            if (openEnds == 2)
            {
                patternScore = SCORE_LIVE_THREE;
                patternType = "Live Three";
            }
            else
            {
                patternScore = SCORE_DEAD_THREE;
                patternType = "Dead Three";
            }
            break;
        case 2:
            if (openEnds == 2)
            {
                patternScore = SCORE_LIVE_TWO;
                patternType = "Live Two";
            }
            else
            {
                patternScore = SCORE_DEAD_TWO;
                patternType = "Dead Two";
            }
            break;
        case 1:
            patternScore = SCORE_ONE;
            patternType = "One";
            break;

        default:
            break;
        }

        if (details)
        {
            details->patternScores[dir] = patternScore;
            details->patternCounts[dir] = count;
            details->patternOpenEnds[dir] = openEnds;
            details->patternTypes[dir] = patternType;
        }

        score += patternScore;
    }

    int captureCount = GomokuRules::checkCaptures(board, row, col, player);
    int captureScore = captureCount * SCORE_LIVE_THREE;
    score += captureScore;

    if (GomokuRules::isStoneCapturable(board, row, col, getOpponent(player)) && captureCount == 0)
        score -= SCORE_DEAD_FOUR / 2;

    if (details)
    {
        details->captureCount = captureCount;
        details->captureScore = captureScore;
    }

    int centerDist = abs(row - BOARD_SIZE / 2) + abs(col - BOARD_SIZE / 2);
    int centralityBonus = (BOARD_SIZE - centerDist) * 50;
    score += centralityBonus;

    if (details)
    {
        details->centralityBonus = centralityBonus;
        details->totalScore = score;
    }

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
