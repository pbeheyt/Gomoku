/**
 * Moteur de Règles Gomoku - Implémentation
 */

#include "gomoku_rules.h"
#include <algorithm>

bool GomokuRules::isValidPosition(int row, int col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

bool GomokuRules::isValidMove(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col) {
    return isValidPosition(row, col) && board[row][col] == NONE;
}

int GomokuRules::applyMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStonesOut[][2]) {
    // 1. Place stone
    board[row][col] = player;

    // 2. Check captures
    int numCaptured = checkCaptures(board, row, col, player, capturedStonesOut);
    
    // 3. Remove captured stones
    for (int i = 0; i < numCaptured; i++) {
        board[capturedStonesOut[i][0]][capturedStonesOut[i][1]] = NONE;
    }
    return numCaptured;
}

void GomokuRules::undoMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStonesOut[][2], int captureCount) {
    int opponent = (player == BLACK) ? WHITE : BLACK;

    // 1. Restore captured stones
    for (int i = 0; i < captureCount; i++) {
        board[capturedStonesOut[i][0]][capturedStonesOut[i][1]] = opponent;
    }
    // 2. Remove played stone
    board[row][col] = NONE;
}

MoveStatus GomokuRules::validateMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player) {
    // 1. Basic Checks
    if (!isValidPosition(row, col)) return INVALID_BOUNDS;
    if (board[row][col] != NONE) return INVALID_OCCUPIED;

    // 2. Simulate Move
    int captured[16][2];
    int numCaptured = applyMove(board, row, col, player, captured);

    // 3. Check Suicide (on cleaned board)
    bool suicide = isSuicideMove(board, row, col, player);

    // 4. Check Double-Three (Only if NO capture)
    // The rule says: Double-three is forbidden UNLESS it captures.
    bool doubleThree = false;
    if (numCaptured == 0 && !suicide) {
        doubleThree = checkDoubleThree(board, row, col, player);
    }

    // 5. Rollback
    undoMove(board, row, col, player, captured, numCaptured);

    // 6. Verdict
    if (suicide) return INVALID_SUICIDE;
    if (doubleThree) return INVALID_DOUBLE_THREE;

    return VALID;
}

Player GomokuRules::getPlayerAt(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col) {
    if (!isValidPosition(row, col)) return NONE;
    return static_cast<Player>(board[row][col]);
}

int GomokuRules::checkCaptures(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int playerInt, int capturedStonesOut[][2]) {
    Player player = static_cast<Player>(playerInt);
    int captureCount = 0;
    Player opponent = (player == BLACK) ? WHITE : BLACK;

    for (int i = 0; i < 8; i++) {
        Direction dir = CAPTURE_DIRECTIONS[i];
        
        int r1 = row + dir.r;     int c1 = col + dir.c;
        int r2 = row + 2 * dir.r; int c2 = col + 2 * dir.c;
        int r3 = row + 3 * dir.r; int c3 = col + 3 * dir.c;

        if (!isValidPosition(r1, c1) || !isValidPosition(r2, c2) || !isValidPosition(r3, c3)) continue;

        // Motif : [Joueur] [Adversaire] [Adversaire] [Joueur]
        if (getPlayerAt(board, r1, c1) == opponent &&
            getPlayerAt(board, r2, c2) == opponent &&
            getPlayerAt(board, r3, c3) == player) {

            if (capturedStonesOut != nullptr) {
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

bool GomokuRules::isSuicideMove(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int playerInt) {
    Player player = static_cast<Player>(playerInt);
    Player opponent = (player == BLACK) ? WHITE : BLACK;

    for (int i = 0; i < 4; i++) {
        Direction dir = AXES[i];

        // Cas A : O P [X] O (Complété depuis la droite)
        // Vérifier -2, -1, +1
        Player p1 = getPlayerAt(board, row - 2 * dir.r, col - 2 * dir.c);
        Player p2 = getPlayerAt(board, row - 1 * dir.r, col - 1 * dir.c);
        Player p3 = getPlayerAt(board, row + 1 * dir.r, col + 1 * dir.c);

        if (p1 == opponent && p2 == player && p3 == opponent) return true;

        // Cas B : O [X] P O (Complété depuis la gauche)
        // Vérifier -1, +1, +2
        Player p4 = getPlayerAt(board, row - 1 * dir.r, col - 1 * dir.c);
        Player p5 = getPlayerAt(board, row + 1 * dir.r, col + 1 * dir.c);
        Player p6 = getPlayerAt(board, row + 2 * dir.r, col + 2 * dir.c);

        if (p4 == opponent && p5 == player && p6 == opponent) return true;
    }
    return false;
}

// --- Logique Double Trois ---

std::string GomokuRules::getLinePattern(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, Direction dir, int playerInt) {
    Player player = static_cast<Player>(playerInt);
    std::string line = "";
    // Scanner -5 à +5
    for (int i = -5; i <= 5; i++) {
        int r = row + i * dir.r;
        int c = col + i * dir.c;

        if (!isValidPosition(r, c)) {
            line += 'O'; // Mur/Adversaire
        } else {
            Player p = getPlayerAt(board, r, c);
            if (p == player) line += 'P';
            else if (p == NONE) line += '_';
            else line += 'O'; // Adversaire
        }
    }
    return line;
}

bool GomokuRules::isFreeThree(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, Direction dir, int player) {
    std::string line = getLinePattern(board, row, col, dir, player);
    // Motifs de game.ts
    const char* patterns[] = {"_PPP_", "_P_PP_", "_PP_P_"};
    
    for (int i = 0; i < 3; i++) {
        if (line.find(patterns[i]) != std::string::npos) return true;
    }
    return false;
}

bool GomokuRules::checkDoubleThree(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player) {
    // Note : Dans une vraie simulation, nous devrions placer temporairement la pierre sur le plateau
    // avant d'appeler ceci, OU getLinePattern doit assumer que la pierre est là.
    // Ici, getLinePattern lit depuis le plateau.
    // SI la pierre n'est PAS encore sur le plateau, getLinePattern verra '_' au centre.
    // Donc nous devons compter sur l'appelant pour placer la pierre, OU patcher getLinePattern.
    // DÉCISION : Pour correspondre à la structure de game.ts (Simuler -> Vérifier -> Annuler),
    // nous assumons que la pierre EST DÉJÀ PLACÉE sur le pointeur de plateau passé.
    
    int freeThreeCount = 0;
    for (int i = 0; i < 4; i++) {
        if (isFreeThree(board, row, col, AXES[i], player)) {
            freeThreeCount++;
        }
    }
    return freeThreeCount >= 2;
}

// --- Logique de Victoire ---

bool GomokuRules::isLineBreakableByCapture(const int board[BOARD_SIZE][BOARD_SIZE], const std::vector<Point>& line, int opponentInt) {
    if (line.size() < 2) return false;
    
    Player opponent = static_cast<Player>(opponentInt);

    // Direction de la ligne
    Direction dir = { line[1].r - line[0].r, line[1].c - line[0].c };

    // Scanner les paires
    for (size_t i = 0; i < line.size() - 1; i++) {
        Point s1 = line[i];
        Point s2 = line[i+1];

        // Flancs
        Point before = { s1.r - dir.r, s1.c - dir.c };
        Point after  = { s2.r + dir.r, s2.c + dir.c };

        Player pBefore = getPlayerAt(board, before.r, before.c);
        Player pAfter  = getPlayerAt(board, after.r, after.c);

        Point captureMove = {-1, -1};

        // Scénario 1 : O A A _
        if (pBefore == opponent && pAfter == NONE) {
            captureMove = after;
        }
        // Scénario 2 : _ A A O
        else if (pBefore == NONE && pAfter == opponent) {
            captureMove = before;
        }

        if (captureMove.r != -1) {
            // L'adversaire peut-il jouer là ?
            // Vérifier validité de base + Suicide
            // Note : Nous ne vérifions pas Double-Trois pour le DÉFENSEUR habituellement,
            // mais les règles strictes pourraient. Restons sur validité de base + suicide pour l'instant.
            if (isValidMove(board, captureMove.r, captureMove.c) && 
                !isSuicideMove(board, captureMove.r, captureMove.c, opponent)) {
                return true;
            }
        }
    }
    return false;
}

bool GomokuRules::checkWin(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int playerInt) {
    Player player = static_cast<Player>(playerInt);
    int opponent = (player == BLACK) ? WHITE : BLACK;

    for (int i = 0; i < 4; i++) {
        Direction dir = AXES[i];
        std::vector<Point> currentLine;
        currentLine.push_back({row, col});
        
        int count = 1;

        // Direction positive
        int r = row + dir.r;
        int c = col + dir.c;
        while (getPlayerAt(board, r, c) == player) {
            currentLine.push_back({r, c});
            count++;
            r += dir.r; c += dir.c;
        }

        // Direction négative (insérer au début pour garder l'ordre)
        r = row - dir.r;
        c = col - dir.c;
        while (getPlayerAt(board, r, c) == player) {
            currentLine.insert(currentLine.begin(), {r, c});
            count++;
            r -= dir.r; c -= dir.c;
        }

        if (count >= 5) {
            if (!isLineBreakableByCapture(board, currentLine, opponent)) {
                return true;
            }
        }
    }
    return false;
}