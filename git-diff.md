diff --git a/src/core/game.ts b/src/core/game.ts
index 4139848..bbb0426 100644
--- a/src/core/game.ts
+++ b/src/core/game.ts
@@ -29,15 +29,18 @@ export class GomokuGame {
    * Make a move and apply all game rules
    */
   makeMove(row: number, col: number): ValidationResult {
-    // Validate basic move
+    // Garde-fou 1: Position valide et vide
     if (!this.board.isValidMove(row, col)) {
       return { isValid: false, reason: 'Position invalide ou occupée' };
     }
 
-    // Check for double-three rule
-    const doubleThreeCheck = this.checkDoubleThree(row, col, this.currentPlayer);
-    if (!doubleThreeCheck.isValid) {
-      return doubleThreeCheck;
+    // Garde-fou 2: Règle du Double-Trois
+    // Un double-trois est interdit, SAUF si le même coup effectue une capture.
+    const preCaptures = this.checkCaptures(row, col);
+    const isDoubleThree = this.checkDoubleThree(row, col, this.currentPlayer);
+
+    if (isDoubleThree && preCaptures.length === 0) {
+      return { isValid: false, reason: 'Double-trois interdit' };
     }
 
     // Place the stone
@@ -189,16 +192,15 @@ export class GomokuGame {
   }
 
   /**
-   * Check for double-three rule
+   * Check for double-three rule. This is a forbidden move unless it
+   * also results in a capture.
+   * @returns {boolean} True if the move creates two or more free-threes.
    */
-  private checkDoubleThree(row: number, col: number, player: Player): ValidationResult {
-    // Temporarily place the stone
-    const originalPiece = this.board.getPiece(row, col);
+  private checkDoubleThree(row: number, col: number, player: Player): boolean {
+    // Temporarily place the stone for analysis
     this.board.setPiece(row, col, player);
 
     let freeThreeCount = 0;
-
-    // Check all four directions
     const directions = [
       { r: 0, c: 1 },  // Horizontal
       { r: 1, c: 0 },  // Vertical
@@ -206,58 +208,58 @@ export class GomokuGame {
       { r: 1, c: -1 }  // Diagonal /
     ];
 
+    // Check each of the 4 axes for a free-three formation
     for (const dir of directions) {
       if (this.isFreeThree(row, col, dir, player)) {
         freeThreeCount++;
       }
     }
 
-    // Restore original state
-    this.board.setPiece(row, col, originalPiece);
-
-    if (freeThreeCount >= 2) {
-      return { isValid: false, reason: 'Double-trois interdit' };
-    }
+    // Restore the board to its original state before the temporary placement
+    this.board.setPiece(row, col, Player.NONE);
 
-    return { isValid: true };
+    return freeThreeCount >= 2;
   }
 
   /**
-   * Check if a position forms a free-three in a specific direction
+   * Check if a move at a given position creates a "free-three" in a specific direction.
+   * A free-three is an alignment of three stones that is not blocked by an opponent
+   * and can be extended to an open-four.
+   * This function assumes the stone has already been temporarily placed on the board for analysis.
    */
   private isFreeThree(row: number, col: number, direction: { r: number; c: number }, player: Player): boolean {
-    // This is a simplified check - in a real implementation, you'd need more sophisticated pattern matching
-    const patterns = [
-      // Pattern: . X X X . (free three)
-      [Player.NONE, player, player, player, Player.NONE],
-      // Pattern: . X X . X . (split three)
-      [Player.NONE, player, player, Player.NONE, player, Player.NONE],
-    ];
+    let line = '';
+    // Extract a line of characters centered on the move. 'P' for player, '_' for empty, 'O' for opponent.
+    // A window of 11 (-5 to +5) is safe to detect patterns of up to 6 characters.
+    for (let i = -5; i <= 5; i++) {
+        const piece = this.board.getPiece(row + i * direction.r, col + i * direction.c);
+        if (piece === player) {
+            line += 'P';
+        } else if (piece === Player.NONE) {
+            line += '_';
+        } else {
+            line += 'O'; // Opponent stone
+        }
+    }
+
+    const centerIndex = 5; // The position of the move within our extracted line string
 
+    // Define free-three patterns and check if the new move is part of them.
+    const patterns = ['_PPP_', '_P_PP_', '_PP_P_'];
     for (const pattern of patterns) {
-      if (this.checkPattern(row, col, direction, pattern)) {
-        return true;
-      }
+        let index = -1;
+        // Search for all occurrences of the pattern in the line
+        while ((index = line.indexOf(pattern, index + 1)) !== -1) {
+            // Check if the move we are analyzing is part of the found pattern instance
+            if (centerIndex >= index && centerIndex < index + pattern.length) {
+                return true;
+            }
+        }
     }
 
     return false;
   }
 
-  /**
-   * Check if a pattern exists starting from a position
-   */
-  private checkPattern(row: number, col: number, direction: { r: number; c: number }, pattern: Player[]): boolean {
-    for (let i = 0; i < pattern.length; i++) {
-      const r = row + (i - Math.floor(pattern.length / 2)) * direction.r;
-      const c = col + (i - Math.floor(pattern.length / 2)) * direction.c;
-      
-      if (this.board.getPiece(r, c) !== pattern[i]) {
-        return false;
-      }
-    }
-    return true;
-  }
-
   /**
    * Get current game state
    */
