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

// Global Instance
static GomokuAI* globalAI = nullptr;

GomokuAI* getGlobalAI() {
    return globalAI;
}

// Direction vectors
const int DX[] = {0, 1, 1, 1, 0, -1, -1, -1};
const int DY[] = {1, 1, 0, -1, -1, -1, 0, 1};

// Minimax constants
const int MAX_DEPTH = 12;             // Profondeur maximale (au-dessus des 10 requis)
const int INITIAL_DEPTH = 6;          // Commencer avec 6 pour équilibrer perf/qualité
const int WIN_SCORE = 1000000;        // Score pour victoire
const int CAPTURE_WIN_SCORE = 900000; // Score pour victoire par capture
const int INF = INT_MAX;
const int FOUR_OPEN_WEIGHT = 50000;
const int FOUR_BLOCKED_WEIGHT = 10000;
const int THREE_OPEN_WEIGHT = 5000;
const int THREE_BLOCKED_WEIGHT = 1000;
const int TWO_OPEN_WEIGHT = 500;
const int TWO_BLOCKED_WEIGHT = 100;
const int CAPTURE_WEIGHT = 3000;

// --- Implementation ---

GomokuAI::GomokuAI(int aiPlayerColor) {
    this->aiPlayer = aiPlayerColor;
    this->humanPlayer = (aiPlayerColor == BLACK) ? WHITE : BLACK;
    clearBoard();
    
    // Set global instance
    globalAI = this;
}

void GomokuAI::clearBoard() {
    for (int i = 0; i < BOARD_SIZE; i++) {
        for (int j = 0; j < BOARD_SIZE; j++) {
            board[i][j] = NONE;
        }
    }
    gameState = GameState();
    while (!moveHistory.empty()) {
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

void GomokuAI::makeMove(int row, int col, int player) {
    if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
        board[row][col] = player;
    }
}

bool GomokuAI::isValidMove(int row, int col) {
    // We use the strict validator to ensure AI respects Suicide/DoubleThree rules
    // AND sees the "Capture saves Suicide" exceptions.
    return GomokuRules::validateMove(board, row, col, aiPlayer) == VALID;
}

void GomokuAI::getBestMove(int& bestRow, int& bestCol) {
    bestRow = -1;
    bestCol = -1;
    
    std::vector<Move> candidateMoves = getCandidateMoves();
    if (candidateMoves.empty()) return;
    
    std::sort(candidateMoves.begin(), candidateMoves.end(), [this](const Move& a, const Move& b) {
        return quickEvaluate(a.row, a.col, aiPlayer) > quickEvaluate(b.row, b.col, aiPlayer);
    });
    
    int maxMoves = std::min(30, (int)candidateMoves.size());
    int bestScore = -INF;
    
    for (int i = 0; i < maxMoves; i++) {
        const Move& move = candidateMoves[i];
        saveState();
        makeMoveWithCaptures(move.row, move.col, aiPlayer);
        int score = minimax(INITIAL_DEPTH - 1, -INF, +INF, false);
        undoMove();
        
        if (score > bestScore) {
            bestScore = score;
            bestRow = move.row;
            bestCol = move.col;
        }
    }
    
    if (bestRow == -1 && !candidateMoves.empty()) {
        bestRow = candidateMoves[0].row;
        bestCol = candidateMoves[0].col;
    }
}

int GomokuAI::minimax(int depth, int alpha, int beta, bool isMaximizing) {
    if (depth == 0) {
        return evaluateBoard(aiPlayer) - evaluateBoard(humanPlayer);
    }
    
    if (gameState.capturedByBlack >= 10 || gameState.capturedByWhite >= 10) {
        if ((aiPlayer == BLACK && gameState.capturedByBlack >= 10) ||
            (aiPlayer == WHITE && gameState.capturedByWhite >= 10)) {
            return WIN_SCORE;
        } else {
            return -WIN_SCORE;
        }
    }
    
    if (hasPlayerWon(aiPlayer)) return WIN_SCORE;
    if (hasPlayerWon(humanPlayer)) return -WIN_SCORE;
    
    int bestVal = isMaximizing ? -INF : INF;
    std::vector<Move> moves = getCandidateMoves();
    
    int targetPlayer = isMaximizing ? aiPlayer : humanPlayer;
    std::sort(moves.begin(), moves.end(), [this, targetPlayer](const Move& a, const Move& b) {
        return quickEvaluate(a.row, a.col, targetPlayer) > quickEvaluate(b.row, b.col, targetPlayer);
    });
    
    int maxMoves = std::min(25, (int)moves.size());
    
    for (int i = 0; i < maxMoves; i++) {
        const Move& move = moves[i];
        saveState();
        makeMoveWithCaptures(move.row, move.col, targetPlayer);
        
        int score = minimax(depth - 1, alpha, beta, !isMaximizing);
        undoMove();
        
        if (isMaximizing) {
            bestVal = std::max(bestVal, score);
            alpha = std::max(alpha, bestVal);
        } else {
            bestVal = std::min(bestVal, score);
            beta = std::min(beta, bestVal);
        }
        
        if (beta <= alpha) break;
    }
    return bestVal;
}

int GomokuAI::quickEvaluate(int row, int col, int player) {
    if (!isValidMove(row, col)) return -INF;
    saveState();
    makeMoveWithCaptures(row, col, player);
    int score = evaluateBoard(player);
    undoMove();
    return score;
}

int GomokuAI::evaluateBoard(int player) {
    int score = 0;
    score += evaluateAlignments(player);
    score += evaluateCaptures(player);
    score += evaluatePatterns(player);
    score += evaluateImmediateThreats(player);
    return score;
}

PatternInfo GomokuAI::analyzePattern(int row, int col, int direction, int player, bool visited[BOARD_SIZE][BOARD_SIZE][4]) {
    PatternInfo info;
    int opponent = (player == BLACK) ? WHITE : BLACK;
    visited[row][col][direction] = true;
    
    info.startRow = row; info.startCol = col;
    info.endRow = row; info.endCol = col;
    info.length = 1;
    
    // Positive
    int r = row + DX[direction]; int c = col + DY[direction];
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        if (board[r][c] == player) {
            info.length++; info.endRow = r; info.endCol = c;
            visited[r][c][direction] = true;
        } else if (board[r][c] == opponent) {
            info.blockedRight = true; break;
        } else break;
        r += DX[direction]; c += DY[direction];
    }
    
    // Negative
    r = row - DX[direction]; c = col - DY[direction];
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        if (board[r][c] == player) {
            info.length++; info.startRow = r; info.startCol = c;
            visited[r][c][direction] = true;
        } else if (board[r][c] == opponent) {
            info.blockedLeft = true; break;
        } else break;
        r -= DX[direction]; c -= DY[direction];
    }
    
    if (!info.blockedLeft) info.openEnds++;
    if (!info.blockedRight) info.openEnds++;
    return info;
}

int GomokuAI::evaluatePatternScore(const PatternInfo& pattern) {
    if (pattern.length >= 5) return WIN_SCORE;
    if (pattern.length == 4) return (pattern.openEnds == 2) ? FOUR_OPEN_WEIGHT : FOUR_BLOCKED_WEIGHT;
    if (pattern.length == 3) return (pattern.openEnds == 2) ? THREE_OPEN_WEIGHT : (pattern.openEnds == 1 ? THREE_BLOCKED_WEIGHT : 0);
    if (pattern.length == 2) return (pattern.openEnds == 2) ? TWO_OPEN_WEIGHT : (pattern.openEnds == 1 ? TWO_BLOCKED_WEIGHT : 0);
    return 0;
}

int GomokuAI::evaluateAlignments(int player) {
    int score = 0;
    bool visited[BOARD_SIZE][BOARD_SIZE][4] = {false};
    for (int row = 0; row < BOARD_SIZE; row++) {
        for (int col = 0; col < BOARD_SIZE; col++) {
            if (board[row][col] != player) continue;
            for (int dir = 0; dir < 4; dir++) {
                if (!visited[row][col][dir]) {
                    PatternInfo pattern = analyzePattern(row, col, dir, player, visited);
                    score += evaluatePatternScore(pattern);
                }
            }
        }
    }
    return score;
}

int GomokuAI::evaluateCaptures(int player) {
    if ((player == BLACK && gameState.capturedByBlack >= 10) ||
        (player == WHITE && gameState.capturedByWhite >= 10)) return CAPTURE_WIN_SCORE;
    return (player == BLACK ? gameState.capturedByBlack : gameState.capturedByWhite) * CAPTURE_WEIGHT;
}

int GomokuAI::evaluateImmediateThreats(int player) {
    int score = 0;
    int opponent = (player == BLACK) ? WHITE : BLACK;
    bool opponentHasOpenFour = false;
    
    for (int row = 0; row < BOARD_SIZE; row++) {
        for (int col = 0; col < BOARD_SIZE; col++) {
            if (board[row][col] != opponent) continue;
            for (int dir = 0; dir < 4; dir++) {
                PatternInfo pattern = getPatternInfo(row, col, dir, opponent);
                if (pattern.length == 4 && pattern.openEnds == 2) {
                    opponentHasOpenFour = true;
                    score -= 100000;
                }
                if (pattern.length == 3 && pattern.openEnds == 2) score -= 5000;
            }
        }
    }
    
    if (opponentHasOpenFour) {
        for (int row = 0; row < BOARD_SIZE; row++) {
            for (int col = 0; col < BOARD_SIZE; col++) {
                if (!isValidMove(row, col)) continue;
                if (wouldBlockThreat(row, col, player, opponent)) score += 80000;
            }
        }
    }
    return score;
}

bool GomokuAI::wouldBlockThreat(int row, int col, int player, int opponent) {
    saveState();
    board[row][col] = player;
    bool blocksThreat = false;
    for (int dir = 0; dir < 4; dir++) {
        PatternInfo pattern = getPatternInfo(row, col, dir, opponent);
        if (pattern.length >= 3 && pattern.openEnds < 2) {
            blocksThreat = true; break;
        }
    }
    undoMove();
    return blocksThreat;
}

PatternInfo GomokuAI::getPatternInfo(int row, int col, int direction, int player) {
    PatternInfo info;
    int opponent = (player == BLACK) ? WHITE : BLACK;
    info.startRow = row; info.startCol = col;
    info.endRow = row; info.endCol = col;
    info.length = 1;
    
    int r = row + DX[direction]; int c = col + DY[direction];
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        if (board[r][c] == player) { info.length++; info.endRow = r; info.endCol = c; }
        else if (board[r][c] == opponent) { info.blockedRight = true; break; }
        else break;
        r += DX[direction]; c += DY[direction];
    }
    
    r = row - DX[direction]; c = col - DY[direction];
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        if (board[r][c] == player) { info.length++; info.startRow = r; info.startCol = c; }
        else if (board[r][c] == opponent) { info.blockedLeft = true; break; }
        else break;
        r -= DX[direction]; c -= DY[direction];
    }
    
    if (!info.blockedLeft) info.openEnds++;
    if (!info.blockedRight) info.openEnds++;
    return info;
}

int GomokuAI::evaluatePatterns(int player) {
    int score = 0;
    for (int row = 0; row < BOARD_SIZE; row++) {
        for (int col = 0; col < BOARD_SIZE; col++) {
            if (board[row][col] != player) continue;
            score += detectAdvancedPatterns(row, col, player);
        }
    }
    return score;
}

int GomokuAI::detectAdvancedPatterns(int row, int col, int player) {
    int score = 0;
    if (detectDoubleFreeThree(row, col, player)) score += 8000;
    if (detectFourPlusThree(row, col, player)) score += 20000;
    return score;
}

bool GomokuAI::detectDoubleFreeThree(int row, int col, int player) {
    return GomokuRules::checkDoubleThree(board, row, col, player);
}

bool GomokuAI::detectFourPlusThree(int row, int col, int player) {
    return false;
}

bool GomokuAI::createsFreeThree(int row, int col, int direction, int player) {
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

int GomokuAI::countConsecutive(int row, int col, int direction, int player) {
    int count = 1;
    int r = row + DX[direction]; int c = col + DY[direction];
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        if (board[r][c] == player) count++; else break;
        r += DX[direction]; c += DY[direction];
    }
    r = row - DX[direction]; c = col - DY[direction];
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        if (board[r][c] == player) count++; else break;
        r -= DX[direction]; c -= DY[direction];
    }
    return count;
}

std::vector<Move> GomokuAI::getCandidateMoves() {
    std::vector<Move> moves;
    bool boardIsEmpty = true;
    for (int i = 0; i < BOARD_SIZE && boardIsEmpty; i++) {
        for (int j = 0; j < BOARD_SIZE && boardIsEmpty; j++) {
            if (board[i][j] != NONE) boardIsEmpty = false;
        }
    }
    
    if (boardIsEmpty) {
        int center = BOARD_SIZE / 2;
        moves.push_back(Move(center, center));
        moves.push_back(Move(center - 1, center));
        moves.push_back(Move(center + 1, center));
        moves.push_back(Move(center, center - 1));
        moves.push_back(Move(center, center + 1));
        return moves;
    }
    
    for (int row = 0; row < BOARD_SIZE; row++) {
        for (int col = 0; col < BOARD_SIZE; col++) {
            if (board[row][col] != NONE) {
                for (int dr = -2; dr <= 2; dr++) {
                    for (int dc = -2; dc <= 2; dc++) {
                        int nr = row + dr; int nc = col + dc;
                        if (isValidMove(nr, nc)) moves.push_back(Move(nr, nc));
                    }
                }
            }
        }
    }
    
    std::sort(moves.begin(), moves.end(), [](const Move& a, const Move& b) {
        return (a.row != b.row) ? a.row < b.row : a.col < b.col;
    });
    moves.erase(std::unique(moves.begin(), moves.end(), [](const Move& a, const Move& b) {
        return a.row == b.row && a.col == b.col;
    }), moves.end());
    return moves;
}

void GomokuAI::saveState() {
    MoveHistory history;
    history.capturedByBlack = gameState.capturedByBlack;
    history.capturedByWhite = gameState.capturedByWhite;
    moveHistory.push(history);
}

void GomokuAI::makeMoveWithCaptures(int row, int col, int player) {
    MoveHistory history;
    history.row = row; history.col = col; history.player = player;
    history.capturedByBlack = gameState.capturedByBlack;
    history.capturedByWhite = gameState.capturedByWhite;
    
    board[row][col] = player;
    
    int captured[16][2];
    int num = GomokuRules::checkCaptures(board, row, col, player, captured);
    history.numCaptured = num;
    
    for (int i = 0; i < num; i++) {
        int r = captured[i][0]; int c = captured[i][1];
        history.capturedStones[i][0] = r;
        history.capturedStones[i][1] = c;
        board[r][c] = NONE;
    }
    
    if (player == BLACK) gameState.capturedByBlack += num;
    else gameState.capturedByWhite += num;
    
    moveHistory.push(history);
}

void GomokuAI::undoMove() {
    if (moveHistory.empty()) return;
    MoveHistory history = moveHistory.top();
    moveHistory.pop();
    
    if (history.numCaptured > 0) {
        gameState.capturedByBlack = history.capturedByBlack;
        gameState.capturedByWhite = history.capturedByWhite;
        
        for (int i = 0; i < history.numCaptured; i++) {
            int r = history.capturedStones[i][0];
            int c = history.capturedStones[i][1];
            int opponent = (history.player == BLACK) ? WHITE : BLACK;
            board[r][c] = opponent;
        }
    }
    
    if (history.row >= 0) board[history.row][history.col] = NONE;
}
