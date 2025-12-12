/**
 * Moteur de Règles Gomoku - En-tête
 * Logique pure pour les règles du jeu, séparée de la stratégie IA.
 */

#ifndef GOMOKU_RULES_H
#define GOMOKU_RULES_H

#include <vector>
#include <string>

// =================================================================================
//                              CONSTANTES & ENUMS
// =================================================================================

const int BOARD_SIZE = 6;

// Représentation des joueurs
enum Player {
    NONE = 0,
    BLACK = 1,
    WHITE = 2
};

// Statuts de validation d'un coup
enum MoveStatus {
    VALID = 0,
    INVALID_BOUNDS = 1,     // Hors plateau
    INVALID_OCCUPIED = 2,   // Case déjà prise
    INVALID_SUICIDE = 3,    // Coup suicidaire (interdit sauf si capture)
    INVALID_DOUBLE_THREE = 4 // Double-trois (interdit sauf si capture)
};

// Structures géométriques
struct Point {
    int r, c;
};

struct Direction {
    int r, c;
};

// Axes de vérification (4 directions : Horizontal, Vertical, Diag1, Diag2)
const Direction AXES[4] = {
    {0, 1}, {1, 0}, {1, 1}, {1, -1}
};

// Directions de capture (8 directions autour de la pierre)
const Direction CAPTURE_DIRECTIONS[8] = {
    {0, 1}, {0, -1}, {1, 0}, {-1, 0},
    {1, 1}, {-1, -1}, {1, -1}, {-1, 1}
};

// =================================================================================
//                              CLASSE DE RÈGLES
// =================================================================================

class GomokuRules {
public:
    // ============================================================
    // 1. VALIDATION MAÎTRE (Point d'entrée principal)
    // ============================================================
    
    /**
     * Effectue une validation complète d'un coup.
     * Simule le coup et les captures pour résoudre les cas limites
     * (ex: Suicide autorisé s'il capture, Double-Trois autorisé s'il capture).
     * 
     * @return MoveStatus (VALID=0 si autorisé)
     */
    static MoveStatus validateMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player);

    // ============================================================
    // 2. UTILITAIRES DE BASE (Lecture seule)
    // ============================================================
    
    // Vérifie si les coordonnées sont dans le plateau (0-18)
    static bool isOnBoard(int row, int col);
    
    // Vérifie si une case est physiquement libre (sans règle complexe)
    static bool isEmptyCell(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col);
    
    // Récupère le joueur à une position (Safe check)
    static Player getPlayerAt(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col);

    // ============================================================
    // 3. MÉCANIQUE DE JEU (Physique & Captures)
    // ============================================================

    /**
     * Applique un coup sur le plateau :
     * 1. Pose la pierre.
     * 2. Calcule et retire les pierres capturées.
     * 
     * @param capturedStonesOut Buffer de sortie pour stocker les coords capturées.
     * @return Nombre de pierres capturées (paires * 2).
     */
    static int applyMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStonesOut[][2]);

    /**
     * Annule un coup (Rollback) :
     * 1. Restaure les pierres capturées.
     * 2. Retire la pierre jouée.
     */
    static void undoMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStonesOut[][2], int captureCount);

    /**
     * Calcule les captures potentielles SANS modifier le plateau.
     * @param capturedStonesOut (Optionnel) Buffer pour stocker les résultats.
     */
    static int checkCaptures(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStonesOut[][2] = nullptr);

    // ============================================================
    // 4. RÈGLES COMPLEXES (Interdictions)
    // ============================================================

    // Vérifie si le coup est un "Suicide" (complète un motif de capture adverse)
    static bool isSuicideMove(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player);

    // Vérifie si le coup crée deux "Free Threes" simultanés
    static bool checkDoubleThree(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player);

    // ============================================================
    // 5. CONDITIONS DE VICTOIRE
    // ============================================================

    // Vérifie si 5 pierres sont alignées ET incassables par capture, OU si 10 pierres sont capturées.
    static bool checkWin(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStones);

private:
    // ============================================================
    // 6. HELPERS INTERNES
    // ============================================================
    
    static bool isLineBreakableByCapture(const int board[BOARD_SIZE][BOARD_SIZE], const std::vector<Point>& line, int opponent);
    static bool isFreeThree(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, Direction dir, int player);
    static std::string getLinePattern(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, Direction dir, int player);
};

// =================================================================================
//                              RAII HELPER
// =================================================================================

/**
 * ScopedMove (RAII Pattern)
 * Applique un coup à la construction et l'annule automatiquement à la destruction.
 * Sécurise la gestion de l'état du plateau lors des simulations.
 */
struct ScopedMove {
    int (*board)[BOARD_SIZE];
    int row, col, player;
    int captured[16][2];
    int numCaptured;

    ScopedMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player);
    ~ScopedMove();
};

#endif // GOMOKU_RULES_H