/**
 * Moteur de Règles Gomoku - En-tête
 * Logique pure pour les règles du jeu, séparée de la stratégie IA.
 */

#ifndef GOMOKU_RULES_H
#define GOMOKU_RULES_H

#include <vector>
#include <string>

// Constantes du Jeu
const int BOARD_SIZE = 19;

// Enums typés pour la sécurité et la clarté
enum Player {
    NONE = 0,
    BLACK = 1,
    WHITE = 2
};

// Vecteurs de direction pour les Captures (8 directions)
struct Direction {
    int r, c;
};

// Utilisé pour les Axes (4 directions : Horizontal, Vertical, Diag1, Diag2)
const Direction AXES[4] = {
    {0, 1},  // Horizontal
    {1, 0},  // Vertical
    {1, 1},  // Diagonal Backslash
    {1, -1}  // Diagonal Slash
};

const Direction CAPTURE_DIRECTIONS[8] = {
    {0, 1}, {0, -1},   // Horizontal
    {1, 0}, {-1, 0},   // Vertical
    {1, 1}, {-1, -1},  // Diagonal Backslash
    {1, -1}, {-1, 1}   // Diagonal Slash
};

struct Point {
    int r, c;
};

// Status codes for move validation
enum MoveStatus {
    VALID = 0,
    INVALID_BOUNDS = 1,
    INVALID_OCCUPIED = 2,
    INVALID_SUICIDE = 3,
    INVALID_DOUBLE_THREE = 4
};

class GomokuRules {
public:
    // --- Master Validation Function ---
    /**
     * Performs a full validation of a move, including simulation of captures
     * to resolve edge cases (e.g., suicide allowed if it captures).
     * 
     * @return MoveStatus (VALID=0 if allowed)
     */
    static MoveStatus validateMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player);

    // --- Vérifications de Base ---
    /**
     * Vérifie si une position est dans les limites du plateau.
     */
    static bool isValidPosition(int row, int col);
    /**
     * Vérifie si un mouvement est physiquement possible (dans les limites et cellule vide).
     * Ne vérifie PAS les règles complexes comme Suicide ou Double-Trois.
     */
    static bool isValidMove(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col);
    /**
     * Obtient le joueur à une position donnée.
     */
    static Player getPlayerAt(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col);

    // --- Mécanismes de Base ---
    
    /**
     * Vérifie les captures effectuées en plaçant une pierre à (row, col).
     * 
     * @param board Le plateau actuel.
     * @param row La ligne de la nouvelle pierre.
     * @param col La colonne de la nouvelle pierre.
     * @param player Le joueur plaçant la pierre.
     * @param capturedStonesOut Tableau pour stocker les positions capturées [max 16][2].
     * @return Le nombre de captures effectuées (nombre de paires * 2).
     */
    static int checkCaptures(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStonesOut[][2] = nullptr);

    // --- State Management (Physics) ---
    /**
     * Applies a move: places stone, calculates captures, removes captured stones.
     * @return Number of captures (pairs * 2).
     */
    static int applyMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStonesOut[][2]);

    /**
     * Reverts a move: restores captured stones, removes played stone.
     */
    static void undoMove(int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player, int capturedStonesOut[][2], int captureCount);

    // --- Règles Complexes ---
    
    /**
     * Vérifie si un mouvement est un "Suicide" interdit (complète un motif de capture de l'adversaire).
     */
    static bool isSuicideMove(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player);

    /**
     * Vérifie si un mouvement crée deux "Free Threes" simultanément.
     */
    static bool checkDoubleThree(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player);

    // --- Conditions de Victoire ---
    
    /**
     * Vérifie si 5 pierres sont alignées ET non cassables par capture.
     */
    static bool checkWin(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, int player);

private:
    // Aides pour les règles complexes
    static bool isLineBreakableByCapture(const int board[BOARD_SIZE][BOARD_SIZE], const std::vector<Point>& line, int opponent);
    static bool isFreeThree(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, Direction dir, int player);
    static std::string getLinePattern(const int board[BOARD_SIZE][BOARD_SIZE], int row, int col, Direction dir, int player);
};

#endif // GOMOKU_RULES_H