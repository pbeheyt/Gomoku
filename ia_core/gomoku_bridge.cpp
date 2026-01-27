#include "gomoku_ai.h"
#include "gomoku_rules.h"

// =================================================================================
//                            1. GESTION MÉMOIRE
// =================================================================================

// Buffer statique pour le Plateau (19x19)
static int BRIDGE_BOARD_BUFFER[BOARD_SIZE * BOARD_SIZE];

// Buffer statique pour les Captures
static int BRIDGE_CAPTURE_BUFFER[64];

// Buffer statique pour les Candidates moves (row, col, score, type)
static int BRIDGE_CANDIDATES_MOVE[4096];

extern "C"
{

    // Helper pour obtenir l'adresse du buffer plateau depuis JS
    int *get_board_buffer()
    {
        return BRIDGE_BOARD_BUFFER;
    }

    // =================================================================================
    //                            2. CYCLE DE VIE DE L'IA
    // =================================================================================

    void initAI(int aiPlayer)
    {
        GomokuAI *ai = getGlobalAI();
        if (ai != nullptr)
        {
            delete ai;
        }
        new GomokuAI(aiPlayer);
    }

    void setBoard(const int *flatBoard, int blackCaptures, int whiteCaptures)
    {
        GomokuAI *ai = getGlobalAI();
        if (ai != nullptr)
        {
            ai->setBoard(flatBoard, blackCaptures, whiteCaptures);
        }
    }

    void cleanupAI()
    {
        GomokuAI *ai = getGlobalAI();
        if (ai != nullptr)
        {
            delete ai;
        }
    }

    // =================================================================================
    //                            3. ACTIONS DE JEU
    // =================================================================================

    void makeMove(int row, int col, int player)
    {
        GomokuAI *ai = getGlobalAI();
        if (ai != nullptr)
        {
            ai->makeMove(row, col, player);
        }
    }

    int getBestMove()
    {
        GomokuAI *ai = getGlobalAI();
        if (ai == nullptr)
            return -1;

        int bestRow, bestCol;
        ai->getBestMove(bestRow, bestCol);

        // Encodage simple : Row * 100 + Col
        if (bestRow >= 0 && bestCol >= 0)
        {
            return bestRow * 100 + bestCol;
        }
        return -1;
    }

    // =================================================================================
    //                            4. MOTEUR DE RÈGLES (EXPORTS)
    // =================================================================================

    // Retourne : 0=VALID, 1=BOUNDS, 2=OCCUPIED, 3=SUICIDE, 4=DOUBLE_THREE
    int rules_validateMove(int row, int col, int player)
    {
        GomokuAI *ai = getGlobalAI();
        if (ai == nullptr)
            return 1;

        auto board = const_cast<int (*)[BOARD_SIZE]>(ai->getBoard());

        return (int)GomokuRules::validateMove(board, row, col, player);
    }

    int rules_checkWinAt(int row, int col, int player)
    {
        GomokuAI *ai = getGlobalAI();
        if (ai == nullptr)
            return 0;

        auto board = const_cast<int (*)[BOARD_SIZE]>(ai->getBoard());

        ScopedMove move(board, row, col, player);

        int currentCaptures = ai->getCaptures(player);
        int totalCaptures = currentCaptures + move.numCaptured;

        return GomokuRules::checkWinAt(board, row, col, player, player, totalCaptures);
    }

    int rules_checkWin(int player)
    {
        GomokuAI *ai = getGlobalAI();
        if (ai == nullptr)
            return 0;

        auto board = const_cast<int (*)[BOARD_SIZE]>(ai->getBoard());

        int currentCaptures = ai->getCaptures(player);
        int lastMovePlayer = ai->getOpponent(player);

        return GomokuRules::checkWin(board, player, lastMovePlayer, currentCaptures);
    }

    int rules_checkStalemate(int player)
    {
        GomokuAI *ai = getGlobalAI();
        if (ai == nullptr)
            return 0;

        auto board = const_cast<int (*)[BOARD_SIZE]>(ai->getBoard());
        return GomokuRules::checkStalemate(board, player) ? 1 : 0;
    }

    int *rules_checkCaptures(int row, int col, int player)
    {
        GomokuAI *ai = getGlobalAI();
        BRIDGE_CAPTURE_BUFFER[0] = 0;

        if (ai == nullptr)
            return BRIDGE_CAPTURE_BUFFER;

        auto board = const_cast<int (*)[BOARD_SIZE]>(ai->getBoard());

        {
            ScopedMove move(board, row, col, player);

            BRIDGE_CAPTURE_BUFFER[0] = move.numCaptured;

            // Aplatissement des coordonnées
            for (int i = 0; i < move.numCaptured; i++)
            {
                BRIDGE_CAPTURE_BUFFER[1 + (i * 2)] = move.captured[i][0];     // Row
                BRIDGE_CAPTURE_BUFFER[1 + (i * 2) + 1] = move.captured[i][1]; // Col
            }
        }

        return BRIDGE_CAPTURE_BUFFER;
    }

    int *getAiCandidateMoves()
    {
        GomokuAI *ai = getGlobalAI();
        BRIDGE_CANDIDATES_MOVE[0] = 0;

        if (ai == nullptr)
            return BRIDGE_CANDIDATES_MOVE;

        auto candidatesMoves = ai->getCandidates();
        int count = candidatesMoves.size();
        
        // Sécurité overflow buffer (4 ints par move)
        if (count > 1000) count = 1000;

        BRIDGE_CANDIDATES_MOVE[0] = count;

        for (int i = 0; i < count; i++)
        {
            int baseIdx = 1 + (i * 4);
            BRIDGE_CANDIDATES_MOVE[baseIdx]     = candidatesMoves[i].row;
            BRIDGE_CANDIDATES_MOVE[baseIdx + 1] = candidatesMoves[i].col;
            BRIDGE_CANDIDATES_MOVE[baseIdx + 2] = candidatesMoves[i].score;
            BRIDGE_CANDIDATES_MOVE[baseIdx + 3] = candidatesMoves[i].algoType;
        }

        return BRIDGE_CANDIDATES_MOVE;
    }

} // extern "C"