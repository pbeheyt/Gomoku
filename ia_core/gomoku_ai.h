/**
 * Gomoku AI Header
 * Declarations for the AI functions
 */

#ifndef GOMOKU_AI_H
#define GOMOKU_AI_H

#ifdef __cplusplus
extern "C" {
#endif

// AI functions
void initAI(int aiPlayer);
void setBoard(const int* flatBoard);
void makeMove(int row, int col, int player);
int getBestMove();
void cleanupAI();

#ifdef __cplusplus
}
#endif

#endif // GOMOKU_AI_H
