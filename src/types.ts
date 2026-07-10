export type RoomStatus =
  | "CREATED"
  | "WAITING_FOR_PLAYER"
  | "READY"
  | "PLAYING"
  | "GAME_FINISHED"
  | "REMATCH_PENDING"
  | "CLOSED";

export type GameStatus =
  | "IN_PROGRESS"
  | "FINISHED"
  | "ABANDONED";

export interface Player {
  playerId: string;
  userId: string | null;
  username: string;
  slot: 1 | 2;
  connected: boolean;
  sessionToken: string;
  secretSubmitted?: boolean;
}

export interface ActiveRoomState {
  id: string;
  roomCode: string;
  turnTimerSec: number | null;
  status: RoomStatus;
  players: Player[];
  activeGameId: string | null;
}

export interface GuessRecord {
  id: string;
  playerSlot: number;
  turnNumber: number;
  guess: string;
  correctPosition: number;
  newlyRevealed: number[];
  revealedBoard: string[]; // Board representation for the guessing player (e.g. ["_", "1", "_", "4"])
  createdAt: string;
}

export interface GameState {
  id: string;
  roomId: string;
  player1Secret: string;
  player2Secret: string;
  player1Revealed: string[]; // Player 1's discoveries of Player 2's secret
  player2Revealed: string[]; // Player 2's discoveries of Player 1's secret
  player1Guesses: GuessRecord[];
  player2Guesses: GuessRecord[];
  currentTurnSlot: number; // 1 or 2
  turnNumber: number;
  status: GameStatus;
  timerEndsAt: string | null; // ISO UTC timestamp representing turn end
  winnerSlot: number | null;
  startedAt: string;
  endedAt: string | null;
  durationSec?: number;
  consecutiveTimeouts: { [slot: number]: number };
}

export interface BattleStats {
  id: string;
  player1Key: string; // Lexicographically smaller userId/playerId
  player2Key: string; // Lexicographically larger userId/playerId
  gamesPlayed: number;
  winsPlayer1: number;
  winsPlayer2: number;
  currentStreakOf: string | null;
  currentStreak: number;
  longestStreakOf: string | null;
  longestStreak: number;
  totalGuesses: number;
  averageGuesses: number;
  averageDurationSec: number;
  fastestVictorySec: number | null;
  slowestVictorySec: number | null;
}

export interface ChatMessage {
  id: string;
  senderSlot: number;
  senderName: string;
  text: string;
  timestamp: string;
}

// Socket communication payload interfaces
export interface CreateRoomPayload {
  turnTimerSec: number | null;
}

export interface JoinRoomPayload {
  roomCode: string;
  username?: string;
}

export interface SubmitSecretPayload {
  roomId: string;
  playerId: string;
  sessionToken: string;
  secret: string;
}

export interface SubmitGuessPayload {
  roomId: string;
  playerId: string;
  sessionToken: string;
  guess: string;
}

export interface RequestRematchPayload {
  roomId: string;
  playerId: string;
  sessionToken: string;
}

export interface LeaveRoomPayload {
  roomId: string;
  playerId: string;
  sessionToken: string;
}

export interface SendChatPayload {
  roomId: string;
  playerId: string;
  sessionToken: string;
  text: string;
}

// S2C event payloads
export interface RoomCreatedPayload {
  roomCode: string;
  playerId: string;
  sessionToken: string;
  slot: number; // always 1
}

export interface PlayerJoinedPayload {
  slot: number;
  username: string;
  joinedCount: number;
  players: { slot: number; username: string }[];
}

export interface GameStartedPayload {
  turnTimerSec: number | null;
  firstTurnSlot: number; // always 1
  timerEndsAt: string | null;
}

export interface TurnChangedPayload {
  currentTurnSlot: number;
  turnNumber: number;
  timerEndsAt: string | null;
}

export interface GuessResultPayload {
  playerSlot: number;
  guess: string;
  correctPosition: number;
  newlyRevealed: number[];
  revealedBoard: string[];
}

export interface GameFinishedPayload {
  winnerSlot: number;
  player1Secret: string;
  player2Secret: string;
  durationSec: number;
  turnCount: number;
}

export interface PlayerDisconnectedPayload {
  slot: number;
  graceEndsAt: string;
}

export interface RoomClosedPayload {
  reason: "LEAVE" | "ABANDONED" | "TTL_EXPIRY";
  message: string;
}
