/**
 * Gomoku AI Implementation
 * Simple evaluation-based AI with basic strategic thinking
 */

#include <vector>
#include <algorithm>
#include <climits>
#include <cstring>

// Board constants
const int BOARD_SIZE = 19;
const int EMPTY = 0;
const int BLACK = 1;
const int WHITE = 2;

// Direction vectors (horizontal, vertical, diagonal)
const int DX[] = {0, 1, 1, 1, 0, -1, -1, -1};
const int DY[] = {1, 1, 0, -1, -1, -1, 0, 1};

/**
 * Simple AI class for Gomoku
 */
class GomokuAI {
private:
    int board[BOARD_SIZE][BOARD_SIZE];
    int aiPlayer;
    int humanPlayer;
    
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
     * Get the best move using simple evaluation
     */
    void getBestMove(int& bestRow, int& bestCol) {
        bestRow = -1;
        bestCol = -1;
        int bestScore = INT_MIN;
        
        // Get all valid moves (prioritize positions near existing stones)
        std::vector<std::pair<int, int>> candidateMoves = getCandidateMoves();
        
        // Evaluate each candidate move
        for (const auto& move : candidateMoves) {
            int row = move.first;
            int col = move.second;
            
            // Make temporary move
            board[row][col] = aiPlayer;
            int score = evaluatePosition(row, col, aiPlayer);
            
            // Add some randomness to avoid predictable play
            score += (rand() % 10) - 5;
            
            // Undo temporary move
            board[row][col] = EMPTY;
            
            if (score > bestScore) {
                bestScore = score;
                bestRow = row;
                bestCol = col;
            }
        }
        
        // Fallback: if no good moves found, take first valid position
        if (bestRow == -1 && !candidateMoves.empty()) {
            bestRow = candidateMoves[0].first;
            bestCol = candidateMoves[0].second;
        }
    }
    
private:
    /**
     * Get candidate moves (positions near existing stones)
     */
    std::vector<std::pair<int, int>> getCandidateMoves() {
        std::vector<std::pair<int, int>> moves;
        bool boardIsEmpty = true;
        
        // Check if board is empty
        for (int i = 0; i < BOARD_SIZE && boardIsEmpty; i++) {
            for (int j = 0; j < BOARD_SIZE && boardIsEmpty; j++) {
                if (board[i][j] != EMPTY) {
                    boardIsEmpty = false;
                }
            }
        }
        
        // If board is empty, prefer center and nearby positions
        if (boardIsEmpty) {
            int center = BOARD_SIZE / 2;
            moves.push_back({center, center});
            moves.push_back({center - 1, center});
            moves.push_back({center + 1, center});
            moves.push_back({center, center - 1});
            moves.push_back({center, center + 1});
            return moves;
        }
        
        // Get positions around existing stones (within radius 2)
        for (int row = 0; row < BOARD_SIZE; row++) {
            for (int col = 0; col < BOARD_SIZE; col++) {
                if (board[row][col] != EMPTY) {
                    // Add empty positions around this stone
                    for (int dr = -2; dr <= 2; dr++) {
                        for (int dc = -2; dc <= 2; dc++) {
                            int newRow = row + dr;
                            int newCol = col + dc;
                            if (isValidMove(newRow, newCol)) {
                                moves.push_back({newRow, newCol});
                            }
                        }
                    }
                }
            }
        }
        
        // Remove duplicates
        std::sort(moves.begin(), moves.end());
        moves.erase(std::unique(moves.begin(), moves.end()), moves.end());
        
        return moves;
    }
    
    /**
     * Evaluate a position for the given player
     */
    int evaluatePosition(int row, int col, int player) {
        int score = 0;
        
        // Check all four main directions
        for (int dir = 0; dir < 4; dir++) {
            score += evaluateDirection(row, col, dir, player);
        }
        
        return score;
    }
    
    /**
     * Evaluate a specific direction from a position
     */
    int evaluateDirection(int row, int col, int direction, int player) {
        int score = 0;
        int opponent = (player == BLACK) ? WHITE : BLACK;
        
        // Count consecutive stones in both directions
        int countPlayer = 1; // Include the current position
        int countOpponent = 0;
        bool blockedLeft = false;
        bool blockedRight = false;
        
        // Check positive direction
        int r = row + DX[direction];
        int c = col + DY[direction];
        while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
            if (board[r][c] == player) {
                countPlayer++;
            } else if (board[r][c] == opponent) {
                blockedRight = true;
                break;
            } else {
                break;
            }
            r += DX[direction];
            c += DY[direction];
        }
        
        // Check negative direction
        r = row - DX[direction];
        c = col - DY[direction];
        while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
            if (board[r][c] == player) {
                countPlayer++;
            } else if (board[r][c] == opponent) {
                blockedLeft = true;
                break;
            } else {
                break;
            }
            r -= DX[direction];
            c -= DY[direction];
        }
        
        // Evaluate based on pattern
        bool blocked = blockedLeft || blockedRight;
        bool open = !blockedLeft && !blockedRight;
        
        if (countPlayer >= 5) {
            score += 100000; // Winning move
        } else if (countPlayer == 4) {
            if (open) {
                score += 10000; // Open four
            } else {
                score += 1000; // Blocked four
            }
        } else if (countPlayer == 3) {
            if (open) {
                score += 1000; // Open three
            } else {
                score += 100; // Blocked three
            }
        } else if (countPlayer == 2) {
            if (open) {
                score += 100; // Open two
            } else {
                score += 10; // Blocked two
            }
        }
        
        return score;
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
