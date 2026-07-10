export interface GuessEvaluationInput {
  guess: string;        // e.g. "5004"
  secret: string;       // e.g. "1104"
  previouslyRevealed: number[]; // e.g. [2]
}

export interface GuessEvaluationResult {
  correctCount: number; // Total count of locked positions (0 to 4)
  newlyRevealed: number[]; // Indices revealed on this guess
  revealedBoard: string[]; // Board state: ["_", "_", "0", "4"]
  isComplete: boolean;
}

/**
 * Checks if a string consists of exactly 4 numeric digits.
 */
export function isValidDigitString(val: string): boolean {
  return /^\d{4}$/.test(val);
}

/**
 * Authoritative matching engine for evaluating guesses against secrets.
 */
export function evaluateGuess(input: GuessEvaluationInput): GuessEvaluationResult {
  const guessArr = input.guess.split("");
  const secretArr = input.secret.split("");
  
  const newlyRevealed: number[] = [];
  const revealedBoard: string[] = ["_", "_", "_", "_"];
  
  // 1. Populate the board with previously revealed positions
  for (const idx of input.previouslyRevealed) {
    if (idx >= 0 && idx < 4) {
      revealedBoard[idx] = secretArr[idx];
    }
  }
  
  // 2. Evaluate the active guess index-by-index
  for (let i = 0; i < 4; i++) {
    if (guessArr[i] === secretArr[i]) {
      if (!input.previouslyRevealed.includes(i)) {
        newlyRevealed.push(i);
        revealedBoard[i] = secretArr[i];
      }
    }
  }
  
  // 3. Count total active discoveries
  const totalRevealed = [...new Set([...input.previouslyRevealed, ...newlyRevealed])];
  const isComplete = totalRevealed.length === 4;
  
  return {
    correctCount: totalRevealed.length,
    newlyRevealed,
    revealedBoard,
    isComplete
  };
}
