/**
 * Moteur de Règles Gomoku - Implémentation
 * Organisation : Bottom-Up (Primitives -> Physique -> Règles -> Arbitrage -> Validation)
 */

#include "gomoku_rules.h"
#include <algorithm>

// --- Template Helper ---
// Factorise la boucle des 8 directions pour la détection de paires.
// Predicate signature: bool(board, p1, p2, opponent)
template <typename Predicate>
static bool scanNeighborPairs(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int subjectPlayer, Predicate predicate) {
    int opponent = (subjectPlayer == BLACK) ? WHITE : BLACK;
    
    for (int i = 0; i < 8; i++) {
        Direction dir = CAPTURE_DIRECTIONS[i];
        int rAdj = row + dir.r;
        int cAdj = col + dir.c;

        if (!GomokuRules::isOnBoard(rAdj, cAdj)) continue;

        // Si le voisin est un allié, on a une paire potentielle
        if (GomokuRules::getPlayerAt(board, rAdj, cAdj) == static_cast<Player>(subjectPlayer)) {
            Point p1 = {row, col};
            Point p2 = {rAdj, cAdj};
            
            // On délègue la vérification spécifique (Sandwich ou Surround)
            if (predicate(board, p1, p2, opponent)) {
                return true;
            }
        }
    }
    return false;
}

// =================================================================================
//                              1. PRIMITIVES & UTILITAIRES
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
//                              2. PHYSIQUE DU JEU (CAPTURES)
// =================================================================================

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

// =================================================================================
//                              3. ANALYSE DE MOTIFS (PATTERNS)
// =================================================================================

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
//                              4. RÈGLES COMPLEXES (INTERDICTIONS)
// =================================================================================

bool GomokuRules::isSuicideMove(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int playerInt) {
    // Règle Suicide : Interdit de créer le motif [O X X O]
    return scanNeighborPairs(board, row, col, playerInt, isPairSurrounded);
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

// =================================================================================
//                              5. ARBITRAGE (VICTOIRE & PAT)
// =================================================================================

/**
 * Vérifie si l'adversaire peut légalement jouer à la position (r, c) pour effectuer une capture.
 */
bool GomokuRules::tryCaptureAt(const int board[BOARD_SIZE][BOARD_SIZE], int r, int c, int opponent) {
    // 1. La case doit être vide
    if (!isEmptyCell(board, r, c)) return false;

    // 2. Le coup doit être légal (pas de suicide, etc.)
    // Note : On doit cast le board car validateMove a besoin d'un pointeur non-const pour simuler
    auto mutableBoard = const_cast<int(*)[BOARD_SIZE]>(board);
    return validateMove(mutableBoard, r, c, opponent) == VALID;
}

/**
 * Analyse une paire de pierres alliées (p1, p2) et regarde si elle est "prenable".
 * Patterns recherchés : [O P P _] ou [_ P P O]
 */
bool GomokuRules::isPairSandwiched(const int board[BOARD_SIZE][BOARD_SIZE], Point p1, Point p2, int opponent) {
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
    if (getPlayerAt(board, rBack, cBack) == opp) {
        if (tryCaptureAt(board, rFront, cFront, opponent)) return true;
    }

    // Cas B : [_ P P O] -> Trou derrière, Adversaire devant
    if (getPlayerAt(board, rFront, cFront) == opp) {
        if (tryCaptureAt(board, rBack, cBack, opponent)) return true;
    }

    return false;
}

/**
 * Vérifie si une paire est STRICTEMENT entourée par l'adversaire : [O P P O]
 * Utilisé pour la règle du Suicide.
 */
bool GomokuRules::isPairSurrounded(const int board[BOARD_SIZE][BOARD_SIZE], Point p1, Point p2, int opponent) {
    // Calcul des extrémités (Flancs)
    int dr = p2.r - p1.r;
    int dc = p2.c - p1.c;

    // Arrière (côté P1)
    int rBack = p1.r - dr;
    int cBack = p1.c - dc;

    // Avant (côté P2)
    int rFront = p2.r + dr;
    int cFront = p2.c + dc;

    Player opp = static_cast<Player>(opponent);

    // Motif strict : [O P P O]
    return getPlayerAt(board, rBack, cBack) == opp && 
           getPlayerAt(board, rFront, cFront) == opp;
}

bool GomokuRules::isStoneCapturable(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int opponent) {
    // Le sujet est la pierre à (row, col), son adversaire est 'opponent'.
    // Donc la couleur du sujet est l'inverse de l'opponent.
    int subjectPlayer = (opponent == BLACK) ? WHITE : BLACK;
    return scanNeighborPairs(board, row, col, subjectPlayer, isPairSandwiched);
}

bool GomokuRules::isLineBreakableByCapture(const int board[BOARD_SIZE][BOARD_SIZE], const std::vector<Point>& line, int opponentInt) {
    if (line.size() < 5) return false;

    // 1. Identification des pierres menacées (Atomicité)
    std::vector<bool> isRemoved(line.size(), false);
    
    for (size_t i = 0; i < line.size(); i++) {
        // Pour chaque pierre de la ligne, on regarde si elle peut être capturée
        // (peu importe la direction de la capture, même perpendiculaire à la ligne)
        if (isStoneCapturable(board, line[i].r, line[i].c, opponentInt)) {
            isRemoved[i] = true;
        }
    }

    // 2. Vérification de la survie (Continuité)
    // On cherche la plus longue séquence de pierres NON supprimées
    int currentRun = 0;
    int maxRun = 0;
    for (bool removed : isRemoved) {
        if (!removed) {
            currentRun++;
        } else {
            maxRun = std::max(maxRun, currentRun);
            currentRun = 0;
        }
    }
    maxRun = std::max(maxRun, currentRun);

    // Si le plus grand fragment restant est inférieur à 5, la victoire est brisée.
    return maxRun < 5;
}

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

// =================================================================================
//                              6. VALIDATION MAÎTRE (POINT D'ENTRÉE)
// =================================================================================

MoveStatus GomokuRules::validateMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player) {
    // 1. Contrôles basiques
    if (!isOnBoard(row, col)) return INVALID_BOUNDS;
    if (board[row][col] != NONE) return INVALID_OCCUPIED;

    // 2. Simulation RAII (Apply automatique)
    // Le ScopedMove applique le coup et le retire automatiquement à la fin du bloc
    {
        ScopedMove move(board, row, col, player);

        // 3. Vérification Suicide (sur plateau modifié)
        // Règle : Interdit de jouer un coup qui complète une capture adverse...
        // ...SAUF si ce coup capture lui-même des pierres.
        if (move.numCaptured == 0) {
            if (isSuicideMove(board, row, col, player)) {
                return INVALID_SUICIDE; 
            }
        }

        // 4. Vérification Double-Trois
        // Règle : Interdit de créer deux "Free-Three" simultanés...
        // ...SAUF si ce coup capture des pierres.
        if (move.numCaptured == 0) {
            if (checkDoubleThree(board, row, col, player)) {
                return INVALID_DOUBLE_THREE; 
            }
        }
    } // 5. Undo automatique ici (Destructeur ScopedMove)

    return VALID;
}

// =================================================================================
//                              7. RAII HELPER IMPLEMENTATION
// =================================================================================

ScopedMove::ScopedMove(int b[BOARD_SIZE][BOARD_SIZE], int r, int c, int p) 
    : board(b), row(r), col(c), player(p) 
{
    numCaptured = GomokuRules::applyMove(board, row, col, player, captured);
}

ScopedMove::~ScopedMove() {
    GomokuRules::undoMove(board, row, col, player, captured, numCaptured);
}