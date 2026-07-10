import { randomBytes } from "crypto";
import { 
  RoomStatus, 
  GameStatus, 
  Player, 
  ActiveRoomState, 
  GuessRecord, 
  GameState, 
  BattleStats,
  ChatMessage 
} from "../src/types";

// Database storage instances
export const users: { [id: string]: { id: string; username: string; createdAt: string } } = {};
export const rooms: { [id: string]: ActiveRoomState } = {};
export const games: { [id: string]: GameState } = {};
export const battleStats: { [key: string]: BattleStats } = {};
export const chats: { [roomId: string]: ChatMessage[] } = {};

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generates a cryptographically secure 6-character room code.
 */
export function generateRoomCode(): string {
  let code = "";
  const len = ROOM_CODE_ALPHABET.length;
  while (code.length < 6) {
    const byte = randomBytes(1)[0];
    if (byte < 256 - (256 % len)) {
      code += ROOM_CODE_ALPHABET[byte % len];
    }
  }
  return code;
}

/**
 * Generates a secure, random hex token of given size.
 */
export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function getRoomByCode(code: string): ActiveRoomState | undefined {
  const upperCode = code.toUpperCase();
  return Object.values(rooms).find((r) => r.roomCode === upperCode);
}

export function createRoom(turnTimerSec: number | null): ActiveRoomState {
  const id = generateId("rm");
  const roomCode = generateRoomCode();
  
  const newRoom: ActiveRoomState = {
    id,
    roomCode,
    turnTimerSec,
    status: "CREATED",
    players: [],
    activeGameId: null
  };
  
  rooms[id] = newRoom;
  chats[id] = [];
  return newRoom;
}

export function addPlayerToRoom(
  roomId: string,
  username: string,
  providedPlayerId?: string
): Player | null {
  const room = rooms[roomId];
  if (!room) return null;
  if (room.players.length >= 2) return null;

  const slot = (room.players.length + 1) as 1 | 2;
  const playerId = providedPlayerId || generateId("usr");
  const sessionToken = generateSecureToken();

  const newPlayer: Player = {
    playerId,
    userId: playerId, // support instant guest profiles
    username: username || `Guest#${Math.floor(1000 + Math.random() * 9000)}`,
    slot,
    connected: true,
    sessionToken
  };

  room.players.push(newPlayer);
  room.status = room.players.length === 1 ? "WAITING_FOR_PLAYER" : "READY";
  return newPlayer;
}

export function createGame(
  roomId: string, 
  player1Secret: string, 
  player2Secret: string
): GameState {
  const id = generateId("gm");
  const newGame: GameState = {
    id,
    roomId,
    player1Secret,
    player2Secret,
    player1Revealed: ["_", "_", "_", "_"],
    player2Revealed: ["_", "_", "_", "_"],
    player1Guesses: [],
    player2Guesses: [],
    currentTurnSlot: 1,
    turnNumber: 1,
    status: "IN_PROGRESS",
    timerEndsAt: null,
    winnerSlot: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    consecutiveTimeouts: { 1: 0, 2: 0 }
  };

  games[id] = newGame;
  
  // Set room state to active playing
  const room = rooms[roomId];
  if (room) {
    room.activeGameId = id;
    room.status = "PLAYING";
  }

  return newGame;
}

export function getBattleStats(p1Id: string, p2Id: string): BattleStats {
  const [p1Key, p2Key] = [p1Id, p2Id].sort();
  const key = `${p1Key}_${p2Key}`;

  if (!battleStats[key]) {
    battleStats[key] = {
      id: generateId("bs"),
      player1Key: p1Key,
      player2Key: p2Key,
      gamesPlayed: 0,
      winsPlayer1: 0,
      winsPlayer2: 0,
      currentStreakOf: null,
      currentStreak: 0,
      longestStreakOf: null,
      longestStreak: 0,
      totalGuesses: 0,
      averageGuesses: 0,
      averageDurationSec: 0,
      fastestVictorySec: null,
      slowestVictorySec: null
    };
  }

  return battleStats[key];
}

export function updateBattleStats(
  p1Id: string,
  p2Id: string,
  winnerSlot: 1 | 2,
  durationSec: number,
  totalGuesses: number
): BattleStats {
  const stats = getBattleStats(p1Id, p2Id);
  const [p1Key, p2Key] = [p1Id, p2Id].sort();

  // Map winner slot back to actual user IDs
  // Since key is sorted, let's find which actual player is p1Key and p2Key
  const winnerId = winnerSlot === 1 ? p1Id : p2Id;

  stats.gamesPlayed += 1;
  stats.totalGuesses += totalGuesses;
  stats.averageGuesses = stats.totalGuesses / stats.gamesPlayed;

  // Track fast/slow duration
  if (stats.fastestVictorySec === null || durationSec < stats.fastestVictorySec) {
    stats.fastestVictorySec = durationSec;
  }
  if (stats.slowestVictorySec === null || durationSec > stats.slowestVictorySec) {
    stats.slowestVictorySec = durationSec;
  }
  stats.averageDurationSec = 
    (stats.averageDurationSec * (stats.gamesPlayed - 1) + durationSec) / stats.gamesPlayed;

  const isP1Winner = winnerId === p1Key;
  if (isP1Winner) {
    stats.winsPlayer1 += 1;
  } else {
    stats.winsPlayer2 += 1;
  }

  // Streak calculations
  if (stats.currentStreakOf === winnerId) {
    stats.currentStreak += 1;
  } else {
    stats.currentStreakOf = winnerId;
    stats.currentStreak = 1;
  }

  if (stats.longestStreakOf === null || stats.currentStreak > stats.longestStreak) {
    stats.longestStreakOf = stats.currentStreakOf;
    stats.longestStreak = stats.currentStreak;
  }

  return stats;
}
