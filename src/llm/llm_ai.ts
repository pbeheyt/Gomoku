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
    this.model = model || 'deepseek/deepseek-chat'; // Default model
  }

  /**
   * Requests the best move from the LLM based on the current game state.
   * @param gameState The current state of the game.
   * @returns A promise that resolves to the position of the best move.
   */
  public async getBestMove(gameState: GameState): Promise<Position> {
    const prompt = this.generatePrompt(gameState);

    // --- DEBUG: Log the prompt sent to the LLM ---
    console.log("%c--- PROMPT ENVOYÉ AU LLM ---", "color: cyan; font-weight: bold;", "\n", prompt);

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
      
      const move = JSON.parse(content);
      if (typeof move.row === 'number' && typeof move.col === 'number') {
        return move;
      }
      
      throw new Error("Invalid move format received from LLM.");

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
    const boardString = this.formatBoard(gameState.board, playerChar, opponentChar);

    return `
Tu es un joueur expert de Gomoku. Ton objectif est de déterminer le meilleur prochain coup possible.

**Règles Actuelles :**
- Plateau de 19x19.
- Victoire par alignement de 5 pierres ou par capture de 10 pierres adverses.
- Une capture se fait en encerclant exactement deux pierres adverses adjacentes (ex: OXXO).

**État du Plateau :**
Le plateau est représenté ci-dessous. '.' est une case vide, '${playerChar}' représente tes pierres, et '${opponentChar}' représente les pierres de l'adversaire.
\`\`\`
${boardString}
\`\`\`

**Ton Tour :**
Tu joues avec les pierres '${playerChar}'.

**Instructions :**
Analyse la position et choisis le meilleur coup. Pense à l'attaque (créer tes propres menaces) et à la défense (bloquer les menaces de l'adversaire).

**Format de Réponse OBLIGATOIRE :**
Réponds UNIQUEMENT avec un objet JSON contenant les coordonnées de ton coup, comme ceci :
{"row": R, "col": C}

Ne fournis AUCUNE autre explication, salutation ou texte. Ta réponse doit être uniquement le JSON.
    `;
  }

  /**
   * Formats the board into a human-readable string for the prompt.
   * @param board The game board state.
   * @param playerChar The character for the current player.
   * @param opponentChar The character for the opponent.
   * @returns A string representation of the board.
   */
  private formatBoard(board: Player[][], playerChar: string, opponentChar: string): string {
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
      row.forEach(cell => {
        let symbol = '.';
        if (cell === Player.BLACK) {
          symbol = (playerChar === 'X' ? 'X' : 'O');
        } else if (cell === Player.WHITE) {
          symbol = (playerChar === 'O' ? 'X' : 'O');
        }
        line += ` ${symbol} `; // Consistent spacing for all symbols
      });
      boardStr += line.trimEnd() + '\n';
    });

    return boardStr;
  }
}