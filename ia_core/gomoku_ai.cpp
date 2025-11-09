/**
 * Gomoku AI Implementation
 * Minimax algorithm with Alpha-Beta Pruning and advanced heuristics
 */

#include <vector>
#include <algorithm>
#include <climits>
#include <cstring>
#include <unordered_map>
#include <stack>

// Board constants
const int BOARD_SIZE = 19;
const int EMPTY = 0;
const int BLACK = 1;
const int WHITE = 2;

// Direction vectors (horizontal, vertical, diagonal)
const int DX[] = {0, 1, 1, 1, 0, -1, -1, -1};
const int DY[] = {1, 1, 0, -1, -1, -1, 0, 1};

// Minimax constants
const int MAX_DEPTH = 12;           // Profondeur maximale (au-dessus des 10 requis)
const int INITIAL_DEPTH = 6;        // Commencer avec 6 pour équilibrer perf/qualité
const int WIN_SCORE = 1000000;      // Score pour victoire
const int CAPTURE_WIN_SCORE = 900000; // Score pour victoire par capture
const int INF = INT_MAX;

// Poids pour l'évaluation
const int FOUR_OPEN_WEIGHT = 50000;
const int FOUR_BLOCKED_WEIGHT = 10000;
const int THREE_OPEN_WEIGHT = 5000;
const int THREE_BLOCKED_WEIGHT = 1000;
const int TWO_OPEN_WEIGHT = 500;
const int TWO_BLOCKED_WEIGHT = 100;
const int CAPTURE_WEIGHT = 3000;

// Structure pour représenter un coup
struct Move {
    int row;
    int col;
    int score;
    
    Move() : row(-1), col(-1), score(0) {}
    Move(int r, int c, int s = 0) : row(r), col(c), score(s) {}
};

// Structure pour l'historique des coups (pour undo)
struct MoveHistory {
    int row;
    int col;
    int player;
    int capturedStones[4][2];  // Positions des pierres capturées
    int numCaptured;             // Nombre de pierres capturées
    int capturedByBlack;         // Captures noires avant le coup
    int capturedByWhite;         // Captures blanches avant le coup
    
    MoveHistory() : row(-1), col(-1), player(0), numCaptured(0), 
                     capturedByBlack(0), capturedByWhite(0) {}
};

// Structure pour l'état du jeu
struct GameState {
    int capturedByBlack;  // Paires capturées par noir
    int capturedByWhite;  // Paires capturées par blanc
    
    GameState() : capturedByBlack(0), capturedByWhite(0) {}
};

// Structure pour stocker les informations d'un pattern
struct PatternInfo {
    int length;
    int openEnds;
    bool blockedLeft;
    bool blockedRight;
    int startRow;
    int startCol;
    int endRow;
    int endCol;
    
    PatternInfo() : length(0), openEnds(0), blockedLeft(false), blockedRight(false),
                    startRow(-1), startCol(-1), endRow(-1), endCol(-1) {}
};

/**
 * Advanced Gomoku AI with Minimax and Alpha-Beta Pruning
 */
class GomokuAI {
private:
    int board[BOARD_SIZE][BOARD_SIZE];
    int aiPlayer;
    int humanPlayer;
    GameState gameState;
    std::stack<MoveHistory> moveHistory;
    
public:
    GomokuAI(int aiPlayerColor) {
        this->aiPlayer = aiPlayerColor;
        this->humanPlayer = (aiPlayerColor == BLACK) ? WHITE : BLACK;
        clearBoard();
    }
    
    void clearBoard() {
        for (int i = 0; i < BOARD_SIZE; i++) {
            for (int j = 0; j < BOARD_SIZE; j++) {
                board[i][j] = EMPTY;
            }
        }
        gameState = GameState();
        while (!moveHistory.empty()) {
            moveHistory.pop();
        }
    }
    
    void setBoard(const int* flatBoard) {
        for (int i = 0; i < BOARD_SIZE; i++) {
            for (int j = 0; j < BOARD_SIZE; j++) {
                board[i][j] = flatBoard[i * BOARD_SIZE + j];
            }
        }
    }
    
    void makeMove(int row, int col, int player) {
        if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
            board[row][col] = player;
        }
    }
    
    bool isValidMove(int row, int col) {
        return row >= 0 && row < BOARD_SIZE && 
               col >= 0 && col < BOARD_SIZE && 
               board[row][col] == EMPTY;
    }
    
    /**
     * Get the best move using Minimax with Alpha-Beta Pruning
     */
    void getBestMove(int& bestRow, int& bestCol) {
        bestRow = -1;
        bestCol = -1;
        
        // Obtenir les coups candidats
        std::vector<Move> candidateMoves = getCandidateMoves();
        
        if (candidateMoves.empty()) {
            return;
        }
        
        // Trier les coups par potentiel (move ordering pour alpha-beta)
        std::sort(candidateMoves.begin(), candidateMoves.end(), [this](const Move& a, const Move& b) {
            return quickEvaluate(a.row, a.col, aiPlayer) > quickEvaluate(b.row, b.col, aiPlayer);
        });
        
        // Limiter le nombre de coups à évaluer pour la performance
        int maxMoves = std::min(30, (int)candidateMoves.size());
        
        int bestScore = -INF;
        
        // Évaluer chaque coup candidat
        for (int i = 0; i < maxMoves; i++) {
            const Move& move = candidateMoves[i];
            
            // Sauvegarder l'état actuel
            saveState();
            
            // Faire le coup (avec captures éventuelles)
            makeMoveWithCaptures(move.row, move.col, aiPlayer);
            
            // Appeler Minimax
            int score = minimax(INITIAL_DEPTH - 1, -INF, +INF, false);
            
            // Annuler le coup
            undoMove();
            
            if (score > bestScore) {
                bestScore = score;
                bestRow = move.row;
                bestCol = move.col;
            }
        }
        
        // Fallback si pas de bon coup trouvé
        if (bestRow == -1 && !candidateMoves.empty()) {
            bestRow = candidateMoves[0].row;
            bestCol = candidateMoves[0].col;
        }
    }
    
private:
    /**
     * Algorithme Minimax avec Alpha-Beta Pruning
     */
    int minimax(int depth, int alpha, int beta, bool isMaximizing) {
        // Conditions de terminaison
        if (depth == 0) {
            return evaluateBoard(aiPlayer) - evaluateBoard(humanPlayer);
        }
        
        // Vérifier victoire par capture
        if (gameState.capturedByBlack >= 10 || gameState.capturedByWhite >= 10) {
            if ((aiPlayer == BLACK && gameState.capturedByBlack >= 10) ||
                (aiPlayer == WHITE && gameState.capturedByWhite >= 10)) {
                return WIN_SCORE;
            } else {
                return -WIN_SCORE;
            }
        }
        
        // Vérifier victoire par alignement
        if (hasPlayerWon(aiPlayer)) {
            return WIN_SCORE;
        }
        if (hasPlayerWon(humanPlayer)) {
            return -WIN_SCORE;
        }
        
        if (isMaximizing) {
            // Tour de l'IA - maximiser
            int maxScore = -INF;
            std::vector<Move> moves = getCandidateMoves();
            
            // Trier pour alpha-beta plus efficace
            std::sort(moves.begin(), moves.end(), [this](const Move& a, const Move& b) {
                return quickEvaluate(a.row, a.col, aiPlayer) > quickEvaluate(b.row, b.col, aiPlayer);
            });
            
            int maxMoves = std::min(25, (int)moves.size());
            
            for (int i = 0; i < maxMoves; i++) {
                const Move& move = moves[i];
                
                saveState();
                makeMoveWithCaptures(move.row, move.col, aiPlayer);
                
                int score = minimax(depth - 1, alpha, beta, false);
                
                undoMove();
                
                maxScore = std::max(maxScore, score);
                alpha = std::max(alpha, score);
                
                if (beta <= alpha) {
                    break;  // Beta cut-off
                }
            }
            
            return maxScore;
        } else {
            // Tour de l'adversaire - minimiser
            int minScore = +INF;
            std::vector<Move> moves = getCandidateMoves();
            
            std::sort(moves.begin(), moves.end(), [this](const Move& a, const Move& b) {
                return quickEvaluate(a.row, a.col, humanPlayer) > quickEvaluate(b.row, b.col, humanPlayer);
            });
            
            int maxMoves = std::min(25, (int)moves.size());
            
            for (int i = 0; i < maxMoves; i++) {
                const Move& move = moves[i];
                
                saveState();
                makeMoveWithCaptures(move.row, move.col, humanPlayer);
                
                int score = minimax(depth - 1, alpha, beta, true);
                
                undoMove();
                
                minScore = std::min(minScore, score);
                beta = std::min(beta, score);
                
                if (beta <= alpha) {
                    break;  // Alpha cut-off
                }
            }
            
            return minScore;
        }
    }
    
    /**
     * Évaluation rapide pour move ordering
     */
    int quickEvaluate(int row, int col, int player) {
        if (!isValidMove(row, col)) return -INF;
        
        saveState();
        makeMoveWithCaptures(row, col, player);
        int score = evaluateBoard(player);
        undoMove();
        
        return score;
    }
    
    /**
     * Évaluation complète du plateau avec priorité défensive
     */
    int evaluateBoard(int player) {
        int score = 0;
        
        // Évaluer les alignements
        score += evaluateAlignments(player);
        
        // Évaluer les captures
        score += evaluateCaptures(player);
        
        // Évaluer les patterns avancés
        score += evaluatePatterns(player);
        
        // Évaluer les menaces immédiates (victoire au prochain coup)
        score += evaluateImmediateThreats(player);
        
        return score;
    }
    
    /**
     * Analyser un pattern dans une direction (sans double-comptage)
     */
    PatternInfo analyzePattern(int row, int col, int direction, int player, bool visited[BOARD_SIZE][BOARD_SIZE][4]) {
        PatternInfo info;
        int opponent = (player == BLACK) ? WHITE : BLACK;
        
        // Marquer cette position comme visitée
        visited[row][col][direction] = true;
        
        info.startRow = row;
        info.startCol = col;
        info.endRow = row;
        info.endCol = col;
        info.length = 1;
        info.blockedLeft = false;
        info.blockedRight = false;
        
        // Direction positive
        int r = row + DX[direction];
        int c = col + DY[direction];
        while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
            if (board[r][c] == player) {
                info.length++;
                info.endRow = r;
                info.endCol = c;
                // Marquer toutes les pierres de ce pattern comme visitées
                visited[r][c][direction] = true;
            } else if (board[r][c] == opponent) {
                info.blockedRight = true;
                break;
            } else {
                break;
            }
            r += DX[direction];
            c += DY[direction];
        }
        
        // Direction négative
        r = row - DX[direction];
        c = col - DY[direction];
        while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
            if (board[r][c] == player) {
                info.length++;
                info.startRow = r;
                info.startCol = c;
                // Marquer toutes les pierres de ce pattern comme visitées
                visited[r][c][direction] = true;
            } else if (board[r][c] == opponent) {
                info.blockedLeft = true;
                break;
            } else {
                break;
            }
            r -= DX[direction];
            c -= DY[direction];
        }
        
        // Calculer les extrémités ouvertes
        info.openEnds = 0;
        if (!info.blockedLeft) info.openEnds++;
        if (!info.blockedRight) info.openEnds++;
        
        return info;
    }
    
    /**
     * Évaluer le score d'un pattern
     */
    int evaluatePatternScore(const PatternInfo& pattern) {
        if (pattern.length >= 5) {
            return WIN_SCORE;
        } else if (pattern.length == 4) {
            if (pattern.openEnds == 2) {
                return FOUR_OPEN_WEIGHT;  // Four ouvert
            } else {
                return FOUR_BLOCKED_WEIGHT; // Four bloqué
            }
        } else if (pattern.length == 3) {
            if (pattern.openEnds == 2) {
                return THREE_OPEN_WEIGHT;   // Three ouvert
            } else if (pattern.openEnds == 1) {
                return THREE_BLOCKED_WEIGHT; // Three semi-ouvert
            }
        } else if (pattern.length == 2) {
            if (pattern.openEnds == 2) {
                return TWO_OPEN_WEIGHT;     // Two ouvert
            } else if (pattern.openEnds == 1) {
                return TWO_BLOCKED_WEIGHT;  // Two semi-ouvert
            }
        }
        
        return 0;
    }
    
    /**
     * Évaluer les alignements pour un joueur (sans double-comptage)
     */
    int evaluateAlignments(int player) {
        int score = 0;
        bool visited[BOARD_SIZE][BOARD_SIZE][4] = {false}; // Éviter double-comptage
        
        for (int row = 0; row < BOARD_SIZE; row++) {
            for (int col = 0; col < BOARD_SIZE; col++) {
                if (board[row][col] != player) continue;
                
                // Évaluer dans les 4 directions principales
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
    
    /**
     * Évaluer un pattern dans une direction
     */
    int evaluatePattern(int row, int col, int direction, int player) {
        int score = 0;
        int opponent = (player == BLACK) ? WHITE : BLACK;
        
        // Compter les pierres consécutives
        int count = 1; // Position actuelle
        bool blockedLeft = false;
        bool blockedRight = false;
        
        // Direction positive
        int r = row + DX[direction];
        int c = col + DY[direction];
        while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
            if (board[r][c] == player) {
                count++;
            } else if (board[r][c] == opponent) {
                blockedRight = true;
                break;
            } else {
                break;
            }
            r += DX[direction];
            c += DY[direction];
        }
        
        // Direction négative
        r = row - DX[direction];
        c = col - DY[direction];
        while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
            if (board[r][c] == player) {
                count++;
            } else if (board[r][c] == opponent) {
                blockedLeft = true;
                break;
            } else {
                break;
            }
            r -= DX[direction];
            c -= DY[direction];
        }
        
        // Évaluer selon le pattern
        bool open = !blockedLeft && !blockedRight;
        bool semiOpen = (!blockedLeft && blockedRight) || (blockedLeft && !blockedRight);
        
        if (count >= 5) {
            score += WIN_SCORE;
        } else if (count == 4) {
            if (open) {
                score += FOUR_OPEN_WEIGHT;  // Four ouvert
            } else {
                score += FOUR_BLOCKED_WEIGHT; // Four bloqué
            }
        } else if (count == 3) {
            if (open) {
                score += THREE_OPEN_WEIGHT;   // Three ouvert
            } else if (semiOpen) {
                score += THREE_BLOCKED_WEIGHT; // Three semi-ouvert
            }
        } else if (count == 2) {
            if (open) {
                score += TWO_OPEN_WEIGHT;     // Two ouvert
            } else if (semiOpen) {
                score += TWO_BLOCKED_WEIGHT;  // Two semi-ouvert
            }
        }
        
        return score;
    }
    
    /**
     * Évaluer les captures
     */
    int evaluateCaptures(int player) {
        int score = 0;
        
        // Victoire par capture
        if ((player == BLACK && gameState.capturedByBlack >= 10) ||
            (player == WHITE && gameState.capturedByWhite >= 10)) {
            return CAPTURE_WIN_SCORE;
        }
        
        // Score pour captures actuelles
        if (player == BLACK) {
            score += gameState.capturedByBlack * CAPTURE_WEIGHT;
        } else {
            score += gameState.capturedByWhite * CAPTURE_WEIGHT;
        }
        
        return score;
    }
    
    /**
     * Évaluer les menaces immédiates (priorité défensive)
     */
    int evaluateImmediateThreats(int player) {
        int score = 0;
        int opponent = (player == BLACK) ? WHITE : BLACK;
        
        // Vérifier si l'adversaire a un four ouvert (victoire au prochain coup)
        bool opponentHasOpenFour = false;
        
        for (int row = 0; row < BOARD_SIZE; row++) {
            for (int col = 0; col < BOARD_SIZE; col++) {
                if (board[row][col] != opponent) continue;
                
                for (int dir = 0; dir < 4; dir++) {
                    PatternInfo pattern = getPatternInfo(row, col, dir, opponent);
                    
                    // Menace critique : four ouvert adverse
                    if (pattern.length == 4 && pattern.openEnds == 2) {
                        opponentHasOpenFour = true;
                        // Bonus massif pour bloquer cette menace
                        score -= 100000; // Pénalité énorme si on ne bloque pas
                    }
                    
                    // Menace sérieuse : three ouvert adverse
                    if (pattern.length == 3 && pattern.openEnds == 2) {
                        score -= 5000; // Forte pénalité
                    }
                }
            }
        }
        
        // Si l'adversaire a une menace immédiate, donner un bonus massif pour bloquer
        if (opponentHasOpenFour) {
            // Vérifier si ce coup bloque une menace adverse
            for (int row = 0; row < BOARD_SIZE; row++) {
                for (int col = 0; col < BOARD_SIZE; col++) {
                    if (!isValidMove(row, col)) continue;
                    
                    // Simuler ce coup pour voir s'il bloque une menace
                    if (wouldBlockThreat(row, col, player, opponent)) {
                        score += 80000; // Bonus massif pour bloquer
                    }
                }
            }
        }
        
        return score;
    }
    
    /**
     * Vérifier si un coup bloquerait une menace adverse
     */
    bool wouldBlockThreat(int row, int col, int player, int opponent) {
        // Sauvegarder l'état actuel
        saveState();
        
        // Placer la pierre
        board[row][col] = player;
        
        // Vérifier si cela bloque des menaces adverses
        bool blocksThreat = false;
        
        for (int dir = 0; dir < 4; dir++) {
            PatternInfo pattern = getPatternInfo(row, col, dir, opponent);
            
            // Si ce coup empêche un four ouvert adverse
            if (pattern.length >= 3 && pattern.openEnds < 2) {
                blocksThreat = true;
                break;
            }
        }
        
        // Annuler le coup
        undoMove();
        
        return blocksThreat;
    }
    
    /**
     * Obtenir les informations d'un pattern (version simplifiée)
     */
    PatternInfo getPatternInfo(int row, int col, int direction, int player) {
        PatternInfo info;
        int opponent = (player == BLACK) ? WHITE : BLACK;
        
        info.startRow = row;
        info.startCol = col;
        info.endRow = row;
        info.endCol = col;
        info.length = 1;
        info.blockedLeft = false;
        info.blockedRight = false;
        
        // Direction positive
        int r = row + DX[direction];
        int c = col + DY[direction];
        while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
            if (board[r][c] == player) {
                info.length++;
                info.endRow = r;
                info.endCol = c;
            } else if (board[r][c] == opponent) {
                info.blockedRight = true;
                break;
            } else {
                break;
            }
            r += DX[direction];
            c += DY[direction];
        }
        
        // Direction négative
        r = row - DX[direction];
        c = col - DY[direction];
        while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
            if (board[r][c] == player) {
                info.length++;
                info.startRow = r;
                info.startCol = c;
            } else if (board[r][c] == opponent) {
                info.blockedLeft = true;
                break;
            } else {
                break;
            }
            r -= DX[direction];
            c -= DY[direction];
        }
        
        // Calculer les extrémités ouvertes
        info.openEnds = 0;
        if (!info.blockedLeft) info.openEnds++;
        if (!info.blockedRight) info.openEnds++;
        
        return info;
    }
    
    /**
     * Évaluer patterns avancés
     */
    int evaluatePatterns(int player) {
        int score = 0;
        
        // Rechercher des patterns spécifiques
        for (int row = 0; row < BOARD_SIZE; row++) {
            for (int col = 0; col < BOARD_SIZE; col++) {
                if (board[row][col] != player) continue;
                
                // Patterns de menace avancés
                score += detectAdvancedPatterns(row, col, player);
            }
        }
        
        return score;
    }
    
    /**
     * Détecter patterns avancés
     */
    int detectAdvancedPatterns(int row, int col, int player) {
        int score = 0;
        
        // Double-three menacé (attention aux règles!)
        if (detectDoubleFreeThree(row, col, player)) {
            score += 8000;
        }
        
        // Four + Three simultanés
        if (detectFourPlusThree(row, col, player)) {
            score += 20000;
        }
        
        return score;
    }
    
    /**
     * Détecter double-three
     */
    bool detectDoubleFreeThree(int row, int col, int player) {
        int freeThreeCount = 0;
        
        for (int dir = 0; dir < 4; dir++) {
            if (createsFreeThree(row, col, dir, player)) {
                freeThreeCount++;
            }
        }
        
        return freeThreeCount >= 2;
    }
    
    /**
     * Détecter four + three
     */
    bool detectFourPlusThree(int row, int col, int player) {
        bool hasFour = false;
        bool hasThree = false;
        
        for (int dir = 0; dir < 4; dir++) {
            // Logique pour détecter four et three simultanés
            // (implémentation détaillée nécessaire)
        }
        
        return hasFour && hasThree;
    }
    
    /**
     * Vérifier si un coup crée un free-three
     */
    bool createsFreeThree(int row, int col, int direction, int player) {
        // Implémentation détaillée nécessaire
        return false;
    }
    
    /**
     * Vérifier victoire d'un joueur
     */
    bool hasPlayerWon(int player) {
        // Vérifier si le joueur a aligné 5 pierres
        for (int row = 0; row < BOARD_SIZE; row++) {
            for (int col = 0; col < BOARD_SIZE; col++) {
                if (board[row][col] != player) continue;
                
                for (int dir = 0; dir < 4; dir++) {
                    if (countConsecutive(row, col, dir, player) >= 5) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }
    
    /**
     * Compter pierres consécutives
     */
    int countConsecutive(int row, int col, int direction, int player) {
        int count = 1;
        int opponent = (player == BLACK) ? WHITE : BLACK;
        
        // Direction positive
        int r = row + DX[direction];
        int c = col + DY[direction];
        while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
            if (board[r][c] == player) {
                count++;
            } else {
                break;
            }
            r += DX[direction];
            c += DY[direction];
        }
        
        // Direction négative
        r = row - DX[direction];
        c = col - DY[direction];
        while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
            if (board[r][c] == player) {
                count++;
            } else {
                break;
            }
            r -= DX[direction];
            c -= DY[direction];
        }
        
        return count;
    }
    
    /**
     * Coups candidats (positions près des pierres existantes)
     */
    std::vector<Move> getCandidateMoves() {
        std::vector<Move> moves;
        
        // Si plateau vide, commencer au centre
        bool boardIsEmpty = true;
        for (int i = 0; i < BOARD_SIZE && boardIsEmpty; i++) {
            for (int j = 0; j < BOARD_SIZE && boardIsEmpty; j++) {
                if (board[i][j] != EMPTY) {
                    boardIsEmpty = false;
                }
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
        
        // Trouver positions autour des pierres existantes (rayon 2)
        for (int row = 0; row < BOARD_SIZE; row++) {
            for (int col = 0; col < BOARD_SIZE; col++) {
                if (board[row][col] != EMPTY) {
                    // Ajouter positions vides autour
                    for (int dr = -2; dr <= 2; dr++) {
                        for (int dc = -2; dc <= 2; dc++) {
                            int newRow = row + dr;
                            int newCol = col + dc;
                            if (isValidMove(newRow, newCol)) {
                                moves.push_back(Move(newRow, newCol));
                            }
                        }
                    }
                }
            }
        }
        
        // Supprimer doublons
        std::sort(moves.begin(), moves.end(), [](const Move& a, const Move& b) {
            if (a.row != b.row) return a.row < b.row;
            return a.col < b.col;
        });
        moves.erase(std::unique(moves.begin(), moves.end(), 
            [](const Move& a, const Move& b) {
                return a.row == b.row && a.col == b.col;
            }), moves.end());
        
        return moves;
    }
    
    /**
     * Sauvegarder l'état actuel du jeu
     */
    void saveState() {
        MoveHistory history;
        history.capturedByBlack = gameState.capturedByBlack;
        history.capturedByWhite = gameState.capturedByWhite;
        moveHistory.push(history);
    }
    
    /**
     * Faire un coup avec gestion des captures
     */
    void makeMoveWithCaptures(int row, int col, int player) {
        MoveHistory history;
        history.row = row;
        history.col = col;
        history.player = player;
        history.numCaptured = 0;
        history.capturedByBlack = gameState.capturedByBlack;
        history.capturedByWhite = gameState.capturedByWhite;
        
        // Placer la pierre
        board[row][col] = player;
        
        // Vérifier et effectuer les captures
        int captures = checkAndPerformCaptures(row, col, player);
        history.numCaptured = captures;
        
        moveHistory.push(history);
    }
    
    /**
     * Vérifier et effectuer les captures
     */
    int checkAndPerformCaptures(int row, int col, int player) {
        int totalCaptures = 0;
        int opponent = (player == BLACK) ? WHITE : BLACK;
        
        for (int dir = 0; dir < 8; dir++) {
            // Vérifier pattern de capture : Player - Opponent - Opponent - Player
            int r1 = row + DX[dir];
            int c1 = col + DY[dir];
            int r2 = row + 2 * DX[dir];
            int c2 = col + 2 * DY[dir];
            int r3 = row + 3 * DX[dir];
            int c3 = col + 3 * DY[dir];
            
            if (r1 >= 0 && r1 < BOARD_SIZE && c1 >= 0 && c1 < BOARD_SIZE &&
                r2 >= 0 && r2 < BOARD_SIZE && c2 >= 0 && c2 < BOARD_SIZE &&
                r3 >= 0 && r3 < BOARD_SIZE && c3 >= 0 && c3 < BOARD_SIZE) {
                
                if (board[r1][c1] == opponent && 
                    board[r2][c2] == opponent && 
                    board[r3][c3] == player) {
                    
                    // Capture les deux pierres adverses
                    board[r1][c1] = EMPTY;
                    board[r2][c2] = EMPTY;
                    
                    // Enregistrer la capture
                    if (player == BLACK) {
                        gameState.capturedByBlack += 2;
                    } else {
                        gameState.capturedByWhite += 2;
                    }
                    
                    totalCaptures += 2;
                }
            }
        }
        
        return totalCaptures;
    }
    
    /**
     * Annuler le dernier coup
     */
    void undoMove() {
        if (moveHistory.empty()) return;
        
        MoveHistory history = moveHistory.top();
        moveHistory.pop();
        
        // Annuler la capture si nécessaire
        if (history.numCaptured > 0) {
            gameState.capturedByBlack = history.capturedByBlack;
            gameState.capturedByWhite = history.capturedByWhite;
        }
        
        // Retirer la pierre
        if (history.row >= 0 && history.col >= 0) {
            board[history.row][history.col] = EMPTY;
        }
    }
};

/**
 * Global AI instance for WebAssembly interface
 */
static GomokuAI* globalAI = nullptr;

/**
 * WebAssembly interface functions
 */
extern "C" {

/**
 * Initialize the AI with the player color (1=BLACK, 2=WHITE)
 */
void initAI(int aiPlayer) {
    if (globalAI != nullptr) {
        delete globalAI;
    }
    globalAI = new GomokuAI(aiPlayer);
}

/**
 * Set the current board state (flattened 19x19 array)
 */
void setBoard(const int* flatBoard) {
    if (globalAI != nullptr) {
        globalAI->setBoard(flatBoard);
    }
}

/**
 * Make a move on the board (for updating game state)
 */
void makeMove(int row, int col, int player) {
    if (globalAI != nullptr) {
        globalAI->makeMove(row, col, player);
    }
}

/**
 * Get the best move from the AI
 * Returns: row * 100 + col (or -1 if no valid move)
 */
int getBestMove() {
    if (globalAI == nullptr) {
        return -1;
    }
    
    int bestRow, bestCol;
    globalAI->getBestMove(bestRow, bestCol);
    
    if (bestRow >= 0 && bestCol >= 0) {
        return bestRow * 100 + bestCol;
    }
    return -1;
}

/**
 * Clean up AI resources
 */
void cleanupAI() {
    if (globalAI != nullptr) {
        delete globalAI;
        globalAI = nullptr;
    }
}

} // extern "C"
