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
    
    // Motifs stricts de Free-Three (Doivent permettre de créer un Open-Four _PPPP_)
    // 1. __PPP_ : Espace suffisant pour étendre
    // 2. _PPP__ : Miroir
    // 3. _P_PP_ : Troué (devient _PPPP_ si comblé)
    // 4. _PP_P_ : Miroir
    const char* patterns[] = {"__PPP_", "_PPP__", "_P_PP_", "_PP_P_"};
    
    for (int i = 0; i < 4; i++) {
        if (line.find(patterns[i]) != std::string::npos) return true;
    }
    return false;
}

// =================================================================================
//                              5. CONDITIONS DE VICTOIRE
// =================================================================================

bool GomokuRules::checkWin(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int playerInt, int capturedStones) {
    // 0. Victoire immédiate par capture
    if (capturedStones >= 10) return true;

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

/**
 * Vérifie si l'adversaire peut légalement jouer à la position (r, c) pour effectuer une capture.
 */
static bool tryCaptureAt(const int board[BOARD_SIZE][BOARD_SIZE], int r, int c, int opponent) {
    // 1. La case doit être vide
    if (!GomokuRules::isEmptyCell(board, r, c)) return false;

    // 2. Le coup doit être légal (pas de suicide, etc.)
    // Note : On doit cast le board car validateMove a besoin d'un pointeur non-const pour simuler
    auto mutableBoard = const_cast<int(*)[BOARD_SIZE]>(board);
    return GomokuRules::validateMove(mutableBoard, r, c, opponent) == VALID;
}

/**
 * Analyse une paire de pierres alliées (p1, p2) et regarde si elle est "prenable".
 * Patterns recherchés : [O P P _] ou [_ P P O]
 */
static bool isPairSandwiched(const int board[BOARD_SIZE][BOARD_SIZE], Point p1, Point p2, int opponent) {
    // Calcul des extrémités (Flancs)
    int dr = p2.r - p1.r;
    int dc = p2.c - p1.c;

    // Flanc côté P1 (Arrière)
    int rBack = p1.r - dr;
    int cBack = p1.c - dc;

    // Flanc côté P2 (Avant)
    int rFront = p2.r + dr;
    int cFront = p2.c + dc;

    Player opp = static_cast<Player>(opponent);

    // Cas A : [O P P _] -> Adversaire derrière, Trou devant
    if (GomokuRules::getPlayerAt(board, rBack, cBack) == opp) {
        if (tryCaptureAt(board, rFront, cFront, opponent)) return true;
    }

    // Cas B : [_ P P O] -> Trou derrière, Adversaire devant
    if (GomokuRules::getPlayerAt(board, rFront, cFront) == opp) {
        if (tryCaptureAt(board, rBack, cBack, opponent)) return true;
    }

    return false;
}

// --- FONCTION PRINCIPALE ---

bool GomokuRules::isLineBreakableByCapture(const int board[BOARD_SIZE][BOARD_SIZE], const std::vector<Point>& line, int opponentInt) {
    if (line.size() < 2) return false;
    
    Player opponent = static_cast<Player>(opponentInt);
    Player player = (opponent == BLACK) ? WHITE : BLACK;

    // On parcourt chaque pierre de la ligne gagnante
    for (const Point& stone : line) {
        
        // Pour chaque pierre, on scanne les 4 axes pour voir si elle est attaquée de flanc
        for (int i = 0; i < 4; i++) {
            Direction dir = AXES[i];

            // On regarde les voisins directs pour trouver une paire (Stone + Voisin)
            
            // Voisin 1 (Direction +)
            int rNext = stone.r + dir.r;
            int cNext = stone.c + dir.c;
            
            if (getPlayerAt(board, rNext, cNext) == player) {
                // On a trouvé une paire ! Est-elle en danger ?
                if (isPairSandwiched(board, stone, {rNext, cNext}, opponentInt)) return true;
            }

            // Voisin 2 (Direction -)
            int rPrev = stone.r - dir.r;
            int cPrev = stone.c - dir.c;
            
            if (getPlayerAt(board, rPrev, cPrev) == player) {
                // On a trouvé une paire ! Est-elle en danger ?
                if (isPairSandwiched(board, {rPrev, cPrev}, stone, opponentInt)) return true;
            }
        }
    }
    return false;
}

bool GomokuRules::checkStalemate(const int board[BOARD_SIZE][BOARD_SIZE], int player) {
    for (int r = 0; r < BOARD_SIZE; r++) {
        for (int c = 0; c < BOARD_SIZE; c++) {
            // Si la case est vide
            if (board[r][c] == NONE) {
                // Si au moins un coup est valide, ce n'est pas un Pat
                if (validateMove(const_cast<int(*)[BOARD_SIZE]>(board), r, c, player) == VALID) {
                    return false;
                }
            }
        }
    }
    // Aucun coup valide trouvé
    return true;
}