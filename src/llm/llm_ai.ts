// @src/llm/llm_ai.ts
import { GameState, Player, Position, ValidationResult } from '../core/types.js';

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
   * @param validator Optional callback to validate the move against game rules.
   * @returns A promise that resolves to the position and the reasoning.
   */
  public async getBestMove(
    gameState: GameState, 
    validator?: (row: number, col: number) => ValidationResult
  ): Promise<{ position: Position, reasoning: string }> {
    const prompt = this.generatePrompt(gameState);
    const messages: any[] = [{ role: 'user', content: prompt }];
    const MAX_RETRIES = 3;

    // --- DEBUG: Log the prompt sent to the LLM ---
    console.log("%c--- PROMPT SENT TO LLM ---", "color: cyan; font-weight: bold;", "\n", prompt);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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
            messages: messages
          })
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;

        // --- DEBUG: Log the raw response from the LLM ---
        console.log(`%c--- RÉPONSE BRUTE DU LLM (Essai ${attempt}) ---`, "color: yellow; font-weight: bold;", "\n", content);
        
        // Add the assistant's response to history
        messages.push({ role: 'assistant', content: content });

        // Extract reasoning from <reasoning> tags
        const reasoningMatch = content.match(/<reasoning>([\s\S]*?)<\/reasoning>/);
        const reasoning = reasoningMatch ? reasoningMatch[1].trim() : "Aucun raisonnement fourni.";

        // Parse the response
        const move = this.parseMove(content);
        
        if (move) {
          // 1. Basic Local Validation (Bounds & Empty)
          let validationError = this.validateMove(move, gameState.board);

          // 2. Advanced Rule Validation (Suicide, Double-Three) via callback
          if (!validationError && validator) {
            const result = validator(move.row, move.col);
            if (!result.isValid) {
              validationError = result.reason || "Move violates game rules";
            }
          }
          
          if (!validationError) {
            // Valid move found!
            return { 
              position: move,
              reasoning: reasoning
            };
          }

          // If invalid, add feedback to history and loop again
          console.warn(`LLM suggested invalid move ${JSON.stringify(move)}: ${validationError}`);
          
          // Generate list of occupied spots to help the LLM
          const occupiedList = this.getOccupiedPositions(gameState.board);
          
          messages.push({ 
            role: 'user', 
            content: `⛔ INVALID MOVE DETECTED.
You tried to play at {"row": ${move.row}, "col": ${move.col}}, but this move is INVALID.
Reason: ${validationError}

Here is the JSON list of ALL OCCUPIED coordinates (Forbidden):
${JSON.stringify(occupiedList)}

INSTRUCTION:
1. Look at the list above.
2. Choose a coordinate pair (row, col) that is NOT in that list.
3. Ensure it does not violate game rules (Suicide, Double-Three).
4. Reply with the corrected move in JSON.` 
          });
        } else {
           // Could not parse JSON
           console.warn("Could not parse JSON from LLM response.");
           messages.push({ 
            role: 'user', 
            content: "I could not parse your response. Please ensure you provide the final move in strict JSON format: {\"row\": R, \"col\": C} at the end." 
          });
        }

      } catch (error) {
        console.error("Error inside LLM loop:", error);
        // If it's a network error, we might want to stop or retry. 
        // For now, we rethrow to be handled by the UI.
        throw error;
      }
    }

    throw new Error(`Failed to get a valid move from LLM after ${MAX_RETRIES} attempts.`);
  }

  /**
   * Parses the LLM response to extract row and col.
   */
  private parseMove(content: string): Position | null {
    // More robust parsing using regex to find "row": [number] and "col": [number]
    const rowMatch = content.match(/"row"\s*:\s*(\d+)/);
    const colMatch = content.match(/"col"\s*:\s*(\d+)/);

    if (rowMatch && colMatch && rowMatch[1] && colMatch[1]) {
      const row = parseInt(rowMatch[1], 10);
      const col = parseInt(colMatch[1], 10);

      if (!isNaN(row) && !isNaN(col)) {
        return { row, col };
      }
    }
    return null;
  }

  /**
   * Validates if a move is within bounds and on an empty cell.
   */
  private validateMove(pos: Position, board: Player[][]): string | null {
    const size = board.length;
    if (pos.row < 0 || pos.row >= size || pos.col < 0 || pos.col >= size) {
      return "Coordinates out of board bounds (0-18).";
    }
    if (board[pos.row][pos.col] !== Player.NONE) {
      return "The square is already OCCUPIED by a stone.";
    }
    return null;
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
You are an expert Gomoku strategist. Your goal is to find the best possible move by thinking like a human grandmaster.

**Game Context:**
- **Your Identity:**
  - YOU are playing as '${playerChar}'.
  - The OPPONENT is playing as '${opponentChar}'.
- The OPPONENT just played at ${gameState.lastMove ? `(${gameState.lastMove.row}, ${gameState.lastMove.col})` : 'N/A'}.
- Moves played: ${gameState.moveHistory.length}
- Your captures: ${capturedByCurrentPlayer / 2} pairs. Opponent's captures: ${capturedByOpponent / 2} pairs.

**Current Board State:**
\`\`\`
${boardString}
\`\`\`

**Strategic Guidelines:**
1.  **DIAGONALS ARE CRITICAL:** ASCII boards make diagonals hard to see. CHECK THEM CAREFULLY (Top-Left to Bottom-Right, and Top-Right to Bottom-Left).
2.  **Captures:** Remember you can win by capturing 10 stones. Don't ignore capture opportunities.
3.  **Don't be Suicidal:** Do not place a stone where it will be immediately captured (Suicide Rule).

**Decision Hierarchy:**
1.  **Win Now:** 5-in-a-row or Capture Win (10 stones).
2.  **Must Block:** Opponent has 4-in-a-row or Open-3.
3.  **Attack:** Create Double-3, Open-4, or Capture Threat.
4.  **Develop:** Connect your stones.

**Final Reasoning Format (Strict):**
<reasoning>
Priority: [Which hierarchy level?]
Check: I have checked diagonals and valid moves.
Analysis: [Brief analysis]
Move: [Coordinates]
</reasoning>

**Final Answer Format:**
After the \`<reasoning>\` block, provide your final move in the following strict JSON format:
{"row": R, "col": C}
    `;
  }

  /**
   * Generates a compact JSON list of occupied positions [[r,c], [r,c]...]
   */
  private getOccupiedPositions(board: Player[][]): number[][] {
    const occupied: number[][] = [];
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[r].length; c++) {
        if (board[r][c] !== Player.NONE) {
          occupied.push([r, c]);
        }
      }
    }
    return occupied;
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
      // Add row number at the end for better visual alignment
      line += ` ${r}`;
      boardStr += line + '\n';
    });

    return boardStr;
  }
}