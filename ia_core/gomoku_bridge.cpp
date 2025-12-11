/**
 * Gomoku Bridge
 * Expose la logique C++ vers JavaScript via WebAssembly.
 * Ne contient AUCUNE logique de jeu, uniquement du code d'interface.
 */

#include "gomoku_ai.h"
#include "gomoku_rules.h"

// =================================================================================
//                            GESTION MÉMOIRE (BUFFERS)
// =================================================================================

// Buffer statique pour le Plateau (19x19)
// Permet d'écrire l'état du jeu depuis JS directement dans la mémoire Wasm
// sans faire d'allocation dynamique (malloc/free) à chaque frame.
static int BRIDGE_BOARD_BUFFER[BOARD_SIZE * BOARD_SIZE];

// Buffer statique pour les Captures
// Taille 64 : Suffisant pour le pire cas théorique (8 directions * 2 pierres * 2 coords + header).
static int BRIDGE_CAPTURE_BUFFER[64];

extern "C" {

// Helper pour obtenir l'adresse du buffer plateau
int* get_board_buffer() {
    return BRIDGE_BOARD_BUFFER;
}

// =================================================================================
//                            CYCLE DE VIE DE L'IA
// =================================================================================

void initAI(int aiPlayer) {
    GomokuAI* ai = getGlobalAI();
    if (ai != nullptr) {
        delete ai;
    }
    // Le constructeur définit l'instance globale automatiquement
    new GomokuAI(aiPlayer);
}

void setBoard(const int* flatBoard) {
    GomokuAI* ai = getGlobalAI();
    if (ai != nullptr) {
        ai->setBoard(flatBoard);
    }
}

void cleanupAI() {
    GomokuAI* ai = getGlobalAI();
    if (ai != nullptr) {
        delete ai;
        // Le pointeur global est nettoyé par la logique appelante ou le prochain init
    }
}

// =================================================================================
//                            ACTIONS DE JEU (IA)
// =================================================================================

void makeMove(int row, int col, int player) {
    GomokuAI* ai = getGlobalAI();
    if (ai != nullptr) {
        ai->makeMove(row, col, player);
    }
}

int getBestMove() {
    GomokuAI* ai = getGlobalAI();
    if (ai == nullptr) return -1;
    
    int bestRow, bestCol;
    ai->getBestMove(bestRow, bestCol);
    
    // Encodage simple : Row * 100 + Col
    if (bestRow >= 0 && bestCol >= 0) {
        return bestRow * 100 + bestCol;
    }
    return -1;
}

// =================================================================================
//                            MOTEUR DE RÈGLES (EXPORTS)
// =================================================================================

// Fonction de Validation Maître exposée au JS
// Retourne : 0=VALID, 1=BOUNDS, 2=OCCUPIED, 3=SUICIDE, 4=DOUBLE_THREE
int rules_validateMove(int row, int col, int player) {
    GomokuAI* ai = getGlobalAI();
    if (ai == nullptr) return 1; // Erreur par défaut

    // On a besoin d'un pointeur non-const pour la simulation
    auto board = const_cast<int(*)[BOARD_SIZE]>(ai->getBoard());
    
    return (int)GomokuRules::validateMove(board, row, col, player);
}

int rules_checkWin(int row, int col, int player) {
    GomokuAI* ai = getGlobalAI();
    if (ai == nullptr) return 0;

    auto board = const_cast<int(*)[BOARD_SIZE]>(ai->getBoard());

    // 1. Simulation complète (Pose + Captures) via applyMove
    // C'est plus robuste que de simplement poser la pierre, car cela reflète
    // l'état réel du plateau après le coup (pierres adverses retirées).
    int captured[16][2];
    int count = GomokuRules::applyMove(board, row, col, player, captured);

    // 2. Vérification de la victoire
    bool result = GomokuRules::checkWin(board, row, col, player);

    // 3. Annulation complète (Restauration + Retrait) via undoMove
    GomokuRules::undoMove(board, row, col, player, captured, count);
    
    return result;
}

/**
 * Retourne un pointeur vers le buffer de captures statique.
 * Structure du buffer :
 * [0] : Nombre de pierres capturées (N)
 * [1..N] : Coordonnées [r1, c1, r2, c2, ...]
 */
int* rules_checkCaptures(int row, int col, int player) {
    GomokuAI* ai = getGlobalAI();
    // Par défaut : 0 captures
    BRIDGE_CAPTURE_BUFFER[0] = 0; 
    
    if (ai == nullptr) return BRIDGE_CAPTURE_BUFFER;

    auto board = const_cast<int(*)[BOARD_SIZE]>(ai->getBoard());

    // Simulation physique (Pose + Captures)
    int tempCaptures[16][2];
    int count = GomokuRules::applyMove(board, row, col, player, tempCaptures);
    
    // Annulation physique immédiate
    GomokuRules::undoMove(board, row, col, player, tempCaptures, count);
    
    // Écriture du résultat dans le buffer statique
    BRIDGE_CAPTURE_BUFFER[0] = count;

    // Aplatissement des coordonnées
    for (int i = 0; i < count; i++) {
        BRIDGE_CAPTURE_BUFFER[1 + (i * 2)] = tempCaptures[i][0];     // Row
        BRIDGE_CAPTURE_BUFFER[1 + (i * 2) + 1] = tempCaptures[i][1]; // Col
    }

    return BRIDGE_CAPTURE_BUFFER;
}

} // extern "C"