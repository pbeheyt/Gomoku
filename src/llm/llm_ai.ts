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
   * @returns A promise that resolves to the position and the reasoning.
   */
  public async getBestMove(gameState: GameState): Promise<{ position: Position, reasoning: string }> {
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
      
      // Extract reasoning from <reasoning> tags
      const reasoningMatch = content.match(/<reasoning>([\s\S]*?)<\/reasoning>/);
      const reasoning = reasoningMatch ? reasoningMatch[1].trim() : "Aucun raisonnement fourni.";

      // More robust parsing using regex to find "row": [number] and "col": [number]
      // This avoids strict JSON parsing errors (e.g., leading zeros like "09", trailing commas).
      const rowMatch = content.match(/"row"\s*:\s*(\d+)/);
      const colMatch = content.match(/"col"\s*:\s*(\d+)/);

      if (rowMatch && colMatch && rowMatch[1] && colMatch[1]) {
        const row = parseInt(rowMatch[1], 10);
        const col = parseInt(colMatch[1], 10);

        if (!isNaN(row) && !isNaN(col)) {
          return { 
            position: { row, col },
            reasoning: reasoning
          };
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
Find the best move. Your reasoning process MUST follow the \`Decision Hierarchy\` below. Provide your final analysis in the specified \`<reasoning>\` block. Be extremely concise.

**Decision Hierarchy (Strict Priority Order):**
1.  **Immediate Win:** Can YOU make a 5-in-a-row and win?
2.  **Block Opponent's Win:** Can the OPPONENT make a 5-in-a-row or an open four on their next turn? If yes, you MUST block it.
3.  **Create Forking Attack (Win in 2 moves):** Can you create an attack that generates two simultaneous threats (like a double three, or a four and a capture threat) that the opponent cannot block at the same time?
4.  **Create Major Threat:** Can you create an "open three" (\`_XXX_\`) or a capture threat that forces an immediate response?
5.  **Block Opponent's Major Threat:** Does the opponent have an "open three" that you must neutralize?
6.  **Strategic Development:** If none of the above apply, make the best move to improve your position (e.g., extend a line of two, prepare a future threat).

**Final Reasoning Format (inside a single <reasoning> tag):**
<reasoning>
Priority: [State the number and name of the highest priority from the hierarchy that applies]
Analysis: [ONE sentence explaining the threat or opportunity]
Move: [The coordinates of your chosen move]
</reasoning>

**Final Answer Format:**
After the \`<reasoning>\` block, provide your final move in the following strict JSON format:
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