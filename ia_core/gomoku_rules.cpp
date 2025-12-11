/**
 * Moteur de Règles Gomoku - Implémentation
 */

#include "gomoku_rules.h"
#include <algorithm>

// =================================================================================
//                              RAII HELPER IMPLEMENTATION
// =================================================================================

ScopedMove::ScopedMove(int b[BOARD_SIZE][BOARD_SIZE], int r, int c, int p) 
    : board(b), row(r), col(c), player(p) 
{
    numCaptured = GomokuRules::applyMove(board, row, col, player, captured);
}

ScopedMove::~ScopedMove() {
    GomokuRules::undoMove(board, row, col, player, captured, numCaptured);
}

// =================================================================================
//                              1. VALIDATION MAÎTRE
// =================================================================================

MoveStatus GomokuRules::validateMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player) {
    // 1. Contrôles basiques
    if (!isOnBoard(row, col)) return INVALID_BOUNDS;
    if (board[row][col] != NONE) return INVALID_OCCUPIED;

    // 2. Simulation RAII (Apply automatique)
    {
        ScopedMove move(board, row, col, player);

        // 3. Vérification Suicide (sur plateau modifié)
        if (isSuicideMove(board, row, col, player)) {
            return INVALID_SUICIDE; // Undo automatique ici
        }

        // 4. Vérification Double-Trois
        // Interdit SAUF si capture
        if (move.numCaptured == 0) {
            if (checkDoubleThree(board, row, col, player)) {
                return INVALID_DOUBLE_THREE; // Undo automatique ici
            }
        }
    } // 5. Undo automatique ici (Fin du scope)

    return VALID;
}

// =================================================================================
//                              2. UTILITAIRES DE BASE
// =================================================================================

bool GomokuRules::isOnBoard(int row, int col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

bool GomokuRules::isEmptyCell(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col) {
    return isOnBoard(row, col) && board[row][col] == NONE;
}

Player GomokuRules::getPlayerAt(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col) {
    if (!isOnBoard(row, col)) return NONE;
    return static_cast<Player>(board[row][col]);
}

// =================================================================================
//                              3. MÉCANIQUE DE JEU
// =================================================================================

int GomokuRules::applyMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStonesOut[][2]) {
    // 1. Pose de la pierre
    board[row][col] = player;

    // 2. Calcul des captures
    int numCaptured = checkCaptures(board, row, col, player, capturedStonesOut);
    
    // 3. Retrait des pierres capturées
    for (int i = 0; i < numCaptured; i++) {
        board[capturedStonesOut[i][0]][capturedStonesOut[i][1]] = NONE;
    }
    return numCaptured;
}

void GomokuRules::undoMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStonesOut[][2], int captureCount) {
    int opponent = (player == BLACK) ? WHITE : BLACK;

    // 1. Restauration des pierres capturées (remises à l'adversaire)
    for (int i = 0; i < captureCount; i++) {
        board[capturedStonesOut[i][0]][capturedStonesOut[i][1]] = opponent;
    }
    // 2. Retrait de la pierre jouée
    board[row][col] = NONE;
}

int GomokuRules::checkCaptures(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int playerInt, int capturedStonesOut[][2]) {
    Player player = static_cast<Player>(playerInt);
    int captureCount = 0;
    Player opponent = (player == BLACK) ? WHITE : BLACK;

    for (int i = 0; i < 8; i++) {
        Direction dir = CAPTURE_DIRECTIONS[i];
        
        // Coordonnées des 3 pierres suivantes dans la direction
        int r1 = row + dir.r;     int c1 = col + dir.c;
        int r2 = row + 2 * dir.r; int c2 = col + 2 * dir.c;
        int r3 = row + 3 * dir.r; int c3 = col + 3 * dir.c;

        if (!isOnBoard(r1, c1) || !isOnBoard(r2, c2) || !isOnBoard(r3, c3)) continue;

        // Motif de capture : [NOUS] [EUX] [EUX] [NOUS]
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

// =================================================================================
//                              4. RÈGLES COMPLEXES
// =================================================================================

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

bool GomokuRules::checkDoubleThree(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player) {
    // Note : On assume ici que la pierre est déjà virtuellement sur le plateau
    // car 'isFreeThree' analyse les motifs existants.
    int freeThreeCount = 0;
    for (int i = 0; i < 4; i++) {
        if (isFreeThree(board, row, col, AXES[i], player)) {
            freeThreeCount++;
        }
    }
    return freeThreeCount >= 2;
}

// --- Helpers pour Double-Trois ---

std::string GomokuRules::getLinePattern(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, Direction dir, int playerInt) {
    Player player = static_cast<Player>(playerInt);
    std::string line = "";
    // Scanner une fenêtre de -5 à +5 autour du point
    for (int i = -5; i <= 5; i++) {
        int r = row + i * dir.r;
        int c = col + i * dir.c;

        if (!isOnBoard(r, c)) {
            line += 'O'; // Mur/Adversaire (Bloquant)
        } else {
            Player p = getPlayerAt(board, r, c);
            if (p == player) line += 'P';
            else if (p == NONE) line += '_';
            else line += 'O'; // Adversaire (Bloquant)
        }
    }
    return line;
}

bool GomokuRules::isFreeThree(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, Direction dir, int player) {
    std::string line = getLinePattern(board, row, col, dir, player);
    
    // Motifs de Free-Three (Trois libres)
    // _PPP_  : Classique
    // _P_PP_ : Troué 1
    // _PP_P_ : Troué 2
    const char* patterns[] = {"_PPP_", "_P_PP_", "_PP_P_"};
    
    for (int i = 0; i < 3; i++) {
        if (line.find(patterns[i]) != std::string::npos) return true;
    }
    return false;
}

// =================================================================================
//                              5. CONDITIONS DE VICTOIRE
// =================================================================================

bool GomokuRules::checkWin(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int playerInt) {
    Player player = static_cast<Player>(playerInt);
    int opponent = (player == BLACK) ? WHITE : BLACK;

    for (int i = 0; i < 4; i++) {
        Direction dir = AXES[i];
        std::vector<Point> currentLine;
        currentLine.push_back({row, col});
        
        int count = 1;

        // Scanner direction positive
        int r = row + dir.r;
        int c = col + dir.c;
        while (getPlayerAt(board, r, c) == player) {
            currentLine.push_back({r, c});
            count++;
            r += dir.r; c += dir.c;
        }

        // Scanner direction négative (insérer au début)
        r = row - dir.r;
        c = col - dir.c;
        while (getPlayerAt(board, r, c) == player) {
            currentLine.insert(currentLine.begin(), {r, c});
            count++;
            r -= dir.r; c -= dir.c;
        }

        if (count >= 5) {
            // Si 5 alignés, vérifier si c'est cassable par une capture adverse
            if (!isLineBreakableByCapture(board, currentLine, opponent)) {
                return true;
            }
        }
    }
    return false;
}

// --- Helpers pour Victoire ---

bool GomokuRules::isLineBreakableByCapture(const int board[BOARD_SIZE][BOARD_SIZE], const std::vector<Point>& line, int opponentInt) {
    if (line.size() < 2) return false;
    
    Player opponent = static_cast<Player>(opponentInt);

    // Déduire la direction de la ligne
    Direction dir = { line[1].r - line[0].r, line[1].c - line[0].c };

    // Scanner chaque paire de pierres dans la ligne
    for (size_t i = 0; i < line.size() - 1; i++) {
        Point s1 = line[i];
        Point s2 = line[i+1];

        // Positions flanquantes
        Point before = { s1.r - dir.r, s1.c - dir.c };
        Point after  = { s2.r + dir.r, s2.c + dir.c };

        Player pBefore = getPlayerAt(board, before.r, before.c);
        Player pAfter  = getPlayerAt(board, after.r, after.c);

        Point captureMove = {-1, -1};

        // Scénario 1 : O A A _ (Adversaire, Ami, Ami, Vide)
        if (pBefore == opponent && pAfter == NONE) {
            captureMove = after;
        }
        // Scénario 2 : _ A A O (Vide, Ami, Ami, Adversaire)
        else if (pBefore == NONE && pAfter == opponent) {
            captureMove = before;
        }

        // Si une position de capture existe
        if (captureMove.r != -1) {
            // L'adversaire peut-il jouer là ? (Validité de base + Suicide)
            if (isEmptyCell(board, captureMove.r, captureMove.c) && 
                !isSuicideMove(board, captureMove.r, captureMove.c, opponent)) {
                return true; // La ligne est cassable
            }
        }
    }
    return false;
}