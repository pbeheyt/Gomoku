// @src/llm/llm_ai.ts
import { GameState, Player, Position } from '../core/types.js';

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Represents an AI player powered by a Large Language Model via OpenRouter.
 */
export class LlmAI {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    if (!apiKey) {
      throw new Error("API key is required for LlmAI");
    }
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Requests the best move from the LLM based on the current game state.
   * @param gameState The current state of the game.
   * @returns A promise that resolves to the position of the best move.
   */
  public async getBestMove(gameState: GameState): Promise<Position> {
    const prompt = this.generatePrompt(gameState);

    // --- DEBUG: Log the prompt sent to the LLM ---
    console.log("%c--- PROMPT SENT TO LLM ---", "color: cyan; font-weight: bold;", "\n", prompt);

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/pbeheyt/Gomoku',
          'X-Title': 'Gomoku AI Project'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      // --- DEBUG: Log the raw response from the LLM ---
      console.log("%c--- RÉPONSE BRUTE DU LLM ---", "color: yellow; font-weight: bold;", "\n", content);
      
      // More robust parsing using regex to find "row": [number] and "col": [number]
      // This avoids strict JSON parsing errors (e.g., leading zeros like "09", trailing commas).
      const rowMatch = content.match(/"row"\s*:\s*(\d+)/);
      const colMatch = content.match(/"col"\s*:\s*(\d+)/);

      if (rowMatch && colMatch && rowMatch[1] && colMatch[1]) {
        const row = parseInt(rowMatch[1], 10);
        const col = parseInt(colMatch[1], 10);

        if (!isNaN(row) && !isNaN(col)) {
          return { row, col };
        }
      }

      throw new Error("Could not parse valid row and col from LLM response.");

    } catch (error) {
      console.error("Error fetching or parsing LLM response:", error);
      // Fallback or re-throw error to be handled by the UI
      throw error;
    }
  }

  /**
   * Generates the complete prompt to be sent to the LLM.
   * @param gameState The current state of the game.
   * @returns The formatted prompt string.
   */
  private generatePrompt(gameState: GameState): string {
    const playerChar = gameState.currentPlayer === Player.BLACK ? 'X' : 'O';
    const opponentChar = gameState.currentPlayer === Player.BLACK ? 'O' : 'X';
    
    const capturedByCurrentPlayer = gameState.currentPlayer === Player.BLACK ? gameState.blackCaptures : gameState.whiteCaptures;
    const capturedByOpponent = gameState.currentPlayer === Player.BLACK ? gameState.whiteCaptures : gameState.blackCaptures;

    const boardString = this.formatBoard(gameState.board, playerChar, opponentChar, gameState.lastMove);

    return `
You are an expert Gomoku strategist. Your goal is to find the best possible move by thinking like a human grandmaster: focusing on priorities and strategic intent.

**Game Context:**
- **Your Identity:**
  - YOU are playing as '${playerChar}'.
  - The OPPONENT is playing as '${opponentChar}'.
  - Always analyze the board from YOUR perspective as '${playerChar}'.
- The OPPONENT just played at ${gameState.lastMove ? `(${gameState.lastMove.row}, ${gameState.lastMove.col})` : 'N/A'}. This is the move marked with [].
- Moves played: ${gameState.moveHistory.length}
- Your captures: ${capturedByCurrentPlayer / 2} pairs. Opponent's captures: ${capturedByOpponent / 2} pairs.

**Current Board State:**
\`\`\`
${boardString}
\`\`\`

**Your Task:**
Find the best move. To do this, follow the hierarchy below and then explain your choice in the Chain of Thought.

**Decision Hierarchy (Follow this strict order of priority):**
1.  **Check for Immediate Win:** Can YOU win in this single move? (e.g., by making a 5-in-a-row). If yes, this is your move.
2.  **Block Immediate Loss:** Can the OPPONENT win on their very next move? (e.g., they have an open four \`_XXXX_\`). If yes, you MUST block them. This is your move.
3.  **Create a Major Threat:** Can you create an "open three" (\`_XXX_\`) or a serious capture threat? This is often the best offensive move.
4.  **Block Opponent's Major Threat:** Does the opponent have an "open three" you need to neutralize? This is often the best defensive move.
5.  **Strategic Development:** If none of the above apply, make the best move to improve your position (e.g., extend a line of two, restrict the opponent's space, prepare a future capture).

**Chain of Thought:**
1.  **<Identity Check>**
    -   State your symbol and the opponent's symbol.
2.  **<Strategic Analysis & Choice>**
    -   **Priority:** Following the Decision Hierarchy, what is the highest priority action? (e.g., "Priority 2: Block Immediate Loss").
    -   **Analysis:** Describe the specific threat or opportunity on the board that corresponds to this priority. (e.g., "Opponent has an open four at row 9, cols 5-8").
    -   **Best Move:** State the coordinates of the one move that satisfies this priority.
    -   **Justification:** Briefly explain why this move is the correct one based on the hierarchy.

</thinking>

**Final Answer Format:**
After your thinking process, provide your final move in the following strict JSON format:
{"row": R, "col": C}
    `;
  }

  /**
   * Formats the board into a human-readable string for the prompt.
   * @param board The game board state.
   * @param playerChar The character for the current player.
   * @param opponentChar The character for the opponent.
   * @param lastMove The last move made on the board.
   * @returns A string representation of the board.
   */
  private formatBoard(board: Player[][], playerChar: string, opponentChar: string, lastMove: Position | null): string {
    // Header for columns, perfectly aligned
    let header = '      ';
    for (let i = 0; i < 19; i++) {
      header += String(i).padStart(2, '0') + ' ';
    }

    let boardStr = header + '\n';

    // Board rows
    board.forEach((row, rowIndex) => {
      const r = String(rowIndex).padStart(2, '0');
      let line = `   ${r}  `; // Prefix for row numbers
      row.forEach((cell, colIndex) => {
        let symbol = '.';
        // Determine which Player enum value corresponds to the LLM's symbol for this turn.
        const currentPlayerNumber = (playerChar === 'X') ? Player.BLACK : Player.WHITE;

        if (cell === currentPlayerNumber) {
            symbol = playerChar; // It's one of our stones
        } else if (cell !== Player.NONE) {
            symbol = opponentChar; // It's an opponent's stone
        }
        
        // Mark the last move with []
        if (lastMove && lastMove.row === rowIndex && lastMove.col === colIndex) {
          line += `[${symbol}]`;
        } else {
          line += ` ${symbol} `;
        }
      });
      boardStr += line + '\n';
    });

    return boardStr;
  }
}