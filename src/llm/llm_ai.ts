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
    // console.log("%c--- PROMPT ENVOYÉ AU LLM ---", "color: cyan; font-weight: bold;", "\n", prompt);

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
    const boardString = this.formatBoard(gameState.board, playerChar, opponentChar);

    return `
Tu es un stratège expert du jeu de Gomoku. Ton objectif est de gagner en suivant un processus de raisonnement rigoureux.

**Règles du Jeu (Rappel) :**
- **Alignement :** Gagne en alignant 5 pierres.
- **Capture :** Gagne en capturant 10 pierres adverses (5 paires). Une paire (XX) est capturée en l'encerclant (OXXO).
- **Menaces :** Une ligne de 4 pierres non bloquée (un "quatre libre" comme \`_XXXX_\`) est une menace de victoire immédiate. Une ligne de 3 pierres non bloquée (un "trois libre" comme \`_XXX_\`) est une menace très puissante.

**État Actuel du Plateau :**
\`\`\`
${boardString}
\`\`\`

**Ton Tour :**
Tu joues avec les pierres '${playerChar}'.

**Instructions de Réflexion (TRÈS IMPORTANT) :**
Avant de donner ta réponse finale, tu DOIS suivre ces 3 étapes de raisonnement à l'intérieur d'une balise <thinking>:

1.  **<analyse>**
    -   Décris la situation. Où sont les menaces de l'adversaire ? (Ex: "L'adversaire a un trois semi-ouvert en ligne 8.")
    -   Où sont tes propres opportunités ? (Ex: "Je peux étendre ma ligne en colonne D pour former un trois.")
    **</analyse>**

2.  **<candidats>**
    -   Liste 2 ou 3 coups possibles.
    -   Pour chaque coup, explique brièvement la stratégie. (Ex: "Coup 1: (8, 10) - Bloque la menace adverse et prolonge ma propre ligne. Coup 2: (12, 5) - Crée une nouvelle menace loin du combat principal.")
    **</candidats>**

3.  **<decision>**
    -   Choisis le meilleur coup parmi tes candidats et justifie ton choix final. (Ex: "Je choisis (8, 10) car la défense est prioritaire. Bloquer sa menace est plus important que de créer la mienne.")
    **</decision>**

</thinking>

**Format de Réponse Final :**
Après ta réflexion dans la balise <thinking>, et SANS AUCUN AUTRE TEXTE APRÈS, fournis ton coup final dans le format JSON strict suivant :
{"row": R, "col": C}
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