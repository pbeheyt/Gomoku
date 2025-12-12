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

bool GomokuRules::doesCaptureBreakWin(int lineLength, int removeIdx1, int removeIdx2) {
    // On s'assure que idx1 est le plus petit
    if (removeIdx1 > removeIdx2) std::swap(removeIdx1, removeIdx2);

    // Calcul des segments restants après la suppression de la paire [idx1, idx2]
    // Segment 1 : Tout ce qui est avant la première pierre supprimée (0 à idx1-1)
    int segment1Length = removeIdx1;

    // Segment 2 : Tout ce qui est après la deuxième pierre supprimée (idx2+1 à fin)
    int segment2Length = lineLength - 1 - removeIdx2;

    // Si au moins un des segments restants est suffisant pour gagner (>= 5),
    // alors la capture NE CASSE PAS la victoire.
    if (segment1Length >= 5 || segment2Length >= 5) {
        return false;
    }

    // Sinon, la ligne est brisée en morceaux trop petits -> Victoire annulée.
    return true;
}

bool GomokuRules::isLineBreakableByCapture(const int board[BOARD_SIZE][BOARD_SIZE], const std::vector<Point>& line, int opponentInt) {
    // Une ligne de moins de 5 pierres n'est pas une victoire, donc pas "cassable" au sens de la règle
    if (line.size() < 5) return false;
    
    // Règle : "Break this line by capturing a pair WITHIN IT"
    // On parcourt les paires adjacentes DANS la ligne victorieuse.
    // Comme le vecteur 'line' est trié spatialement (construit par scan directionnel),
    // line[i] et line[i+1] sont forcément voisins sur le plateau.
    
    for (size_t i = 0; i < line.size() - 1; i++) {
        Point p1 = line[i];
        Point p2 = line[i+1];

        // Vérifie si cette paire spécifique (qui appartient à la ligne) est prenable
        if (isPairSandwiched(board, p1, p2, opponentInt)) {
            
            // Si elle est prenable, est-ce que ça suffit à empêcher la victoire ?
            // Cas concret : Ligne de 7 pierres. On capture les 2 du bout. Il en reste 5.
            // -> doesCaptureBreakWin renverra FALSE (la victoire persiste).
            if (doesCaptureBreakWin((int)line.size(), (int)i, (int)i+1)) {
                return true; // Victoire invalidée
            }
            // Sinon, on continue de chercher une AUTRE capture qui, elle, casserait tout.
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