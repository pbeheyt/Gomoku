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

const int BOARD_SIZE = 19;

// Représentation des joueurs
enum Player
{
    NONE = 0,
    BLACK = 1,
    WHITE = 2
};

// Statuts de validation d'un coup
enum MoveStatus
{
    VALID = 0,
    INVALID_BOUNDS = 1,      // Hors plateau
    INVALID_OCCUPIED = 2,    // Case déjà prise
    INVALID_SUICIDE = 3,     // Coup suicidaire (interdit sauf si capture)
    INVALID_DOUBLE_THREE = 4 // Double-trois (interdit sauf si capture)
};

// Structures géométriques
struct Point
{
    int r, c;
};

struct Direction
{
    int r, c;
};

// Axes de vérification (4 directions : Horizontal, Vertical, Diag1, Diag2)
const Direction AXES[4] = {
    {0, 1}, {1, 0}, {1, 1}, {1, -1}};

// Directions de capture (8 directions autour de la pierre)
const Direction CAPTURE_DIRECTIONS[8] = {
    {0, 1}, {0, -1}, {1, 0}, {-1, 0}, {1, 1}, {-1, -1}, {1, -1}, {-1, 1}};

// =================================================================================
//                              CLASSE DE RÈGLES
// =================================================================================

class GomokuRules
{
public:
    // ============================================================
    // SECTION PUBLIQUE : API DU MOTEUR
    // (Seules ces fonctions doivent être appelées depuis l'extérieur)
    // ============================================================

    /**
     * VALIDATION MAÎTRE (Point d'entrée principal)
     * Effectue une validation complète d'un coup.
     * Simule le coup et les captures pour résoudre les cas limites.
     */
    static MoveStatus validateMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player);

    // --- Primitives (Lecture Seule) ---
    static bool isOnBoard(int row, int col);
    static bool isEmptyCell(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col);
    static Player getPlayerAt(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col);

    // --- Physique du Jeu (Modification du Plateau) ---
    static int applyMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStonesOut[][2]);
    static void undoMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStonesOut[][2], int captureCount);
    
    // --- Simulation ---
    static int checkCaptures(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStonesOut[][2] = nullptr);
    static bool checkWin(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStones);
    static bool checkStalemate(const int board[BOARD_SIZE][BOARD_SIZE], int player);

    // --- Helpers Complexes (Accessibles si besoin spécifique) ---
    static bool isSuicideMove(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player);
    static bool checkDoubleThree(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player);
    // Vérifie si 5 pierres sont alignées ET incassables par capture
    static bool checkFreeThree(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player);

private:
    // ============================================================
    // SECTION PRIVÉE : CUISINE INTERNE
    // (Helpers utilisés uniquement pour les calculs internes)
    // ============================================================
    
    // --- 1. Analyse de Motifs (Patterns) ---
    static bool isFreeThree(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, Direction dir, int player);
    static std::string getLinePattern(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, Direction dir, int player);
    static std::vector<Point> getConsecutiveLine(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, Direction dir, int player);
    
    // --- 2. Logique de Paires (Sandwich/Surround) ---
    static bool tryCaptureAt(const int board[BOARD_SIZE][BOARD_SIZE], int r, int c, int opponent);
    static bool isPairSandwiched(const int board[BOARD_SIZE][BOARD_SIZE], Point p1, Point p2, int opponent);
    static bool isPairSurrounded(const int board[BOARD_SIZE][BOARD_SIZE], Point p1, Point p2, int opponent);
    
    // --- 3. Validation de Victoire (Capture Breaks Win) ---
    static bool isStoneCapturable(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int opponent);
    static int getLongestSegment(const std::vector<bool>& isRemoved);
    static bool isLineBreakableByCapture(const int board[BOARD_SIZE][BOARD_SIZE], const std::vector<Point>& line, int opponent);
};

// =================================================================================
//                              RAII HELPER
// =================================================================================

/**
 * ScopedMove (RAII Pattern)
 * Applique un coup à la construction et l'annule automatiquement à la destruction.
 * Sécurise la gestion de l'état du plateau lors des simulations.
 */
struct ScopedMove
{
    int (*board)[BOARD_SIZE];
    int row, col, player;
    int captured[16][2];
    int numCaptured;

    ScopedMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player);
    ~ScopedMove();
};

#endif // GOMOKU_RULES_H