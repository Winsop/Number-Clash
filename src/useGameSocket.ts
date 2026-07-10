import { useEffect, useState, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { 
  ActiveRoomState, 
  GameState, 
  ChatMessage, 
  BattleStats 
} from "./types";

export interface ConnectionState {
  connected: boolean;
  isReconnecting: boolean;
  graceEndsAt: string | null;
  opponentDisconnected: boolean;
}

export function useGameSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [playerId, setPlayerId] = useState<string>("");
  const [sessionToken, setSessionToken] = useState<string>("");
  const [slot, setSlot] = useState<1 | 2 | null>(null);
  const [username, setUsername] = useState<string>("");
  
  // Game states
  const [roomState, setRoomState] = useState<ActiveRoomState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [chats, setChats] = useState<ChatMessage[]>([]);
  const [battleStats, setBattleStats] = useState<BattleStats | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  
  // Connectivity indicators
  const [connection, setConnection] = useState<ConnectionState>({
    connected: false,
    isReconnecting: false,
    graceEndsAt: null,
    opponentDisconnected: false
  });

  // Rematch state indicators
  const [opponentRematchRequested, setOpponentRematchRequested] = useState<boolean>(false);
  const [myRematchRequested, setMyRematchRequested] = useState<boolean>(false);
  
  // Stall indicators
  const [stallState, setStallState] = useState<{
    isStalled: boolean;
    stalledSlot: number | null;
    message: string;
  }>({ isStalled: false, stalledSlot: null, message: "" });

  const socketRef = useRef<Socket | null>(null);

  // Initialize socket connection
  useEffect(() => {
    // Read cached session values from localStorage
    const cachedPlayerId = localStorage.getItem("nc_player_id") || "";
    const cachedToken = localStorage.getItem("nc_session_token") || "";

    const s = io({
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = s;
    setSocket(s);

    s.on("connect", () => {
      setConnection((prev) => ({ ...prev, connected: true, isReconnecting: false }));
      setError(null);

      // Handshake / register session
      s.emit("register_session", { playerId: cachedPlayerId, sessionToken: cachedToken }, (res: { playerId: string; sessionToken: string }) => {
        setPlayerId(res.playerId);
        setSessionToken(res.sessionToken);
        localStorage.setItem("nc_player_id", res.playerId);
        localStorage.setItem("nc_session_token", res.sessionToken);
      });
    });

    s.on("disconnect", () => {
      setConnection((prev) => ({ ...prev, connected: false }));
    });

    // Handle universal error broadcasts
    s.on("error", (err: { code: string; message: string }) => {
      setError(err);
    });

    // Real-time synchronization events
    s.on("player_joined", (data: { slot: number; username: string; joinedCount: number; players: any[] }) => {
      setRoomState((prev) => {
        if (!prev) return null;
        // Merge player
        const updatedPlayers = [...prev.players];
        const existingIdx = updatedPlayers.findIndex(p => p.slot === data.slot);
        
        const newPlayer = {
          playerId: `player_${data.slot}`,
          userId: null,
          username: data.username,
          slot: data.slot as 1 | 2,
          connected: true,
          sessionToken: ""
        };

        if (existingIdx !== -1) {
          updatedPlayers[existingIdx] = { ...updatedPlayers[existingIdx], ...newPlayer };
        } else {
          updatedPlayers.push(newPlayer);
        }

        return {
          ...prev,
          status: data.joinedCount === 2 ? "READY" : "WAITING_FOR_PLAYER",
          players: updatedPlayers
        };
      });
    });

    s.on("player_ready_status", (data: { slot: number; ready: boolean }) => {
      setRoomState((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          players: prev.players.map((p) => 
            p.slot === data.slot ? { ...p, secretSubmitted: data.ready } : p
          )
        };
      });
    });

    s.on("game_started", (data: { turnTimerSec: number | null; firstTurnSlot: number; timerEndsAt: string | null }) => {
      setRoomState((prev) => prev ? { ...prev, status: "PLAYING" } : null);
      setGameState({
        id: "active",
        roomId: roomState?.id || "",
        player1Secret: "",
        player2Secret: "",
        player1Revealed: ["_", "_", "_", "_"],
        player2Revealed: ["_", "_", "_", "_"],
        player1Guesses: [],
        player2Guesses: [],
        currentTurnSlot: data.firstTurnSlot,
        turnNumber: 1,
        status: "IN_PROGRESS",
        timerEndsAt: data.timerEndsAt,
        winnerSlot: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
        consecutiveTimeouts: { 1: 0, 2: 0 }
      });
      setChats([]);
      setStallState({ isStalled: false, stalledSlot: null, message: "" });
    });

    s.on("turn_changed", (data: { currentTurnSlot: number; turnNumber: number; timerEndsAt: string | null }) => {
      setGameState((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          currentTurnSlot: data.currentTurnSlot,
          turnNumber: data.turnNumber,
          timerEndsAt: data.timerEndsAt,
          consecutiveTimeouts: {
            ...prev.consecutiveTimeouts,
            // Reset the other player's consecutive timeouts on successful turn swap
            [data.currentTurnSlot === 1 ? 2 : 1]: 0
          }
        };
      });
      // Clear any temporary stall warning
      setStallState({ isStalled: false, stalledSlot: null, message: "" });
    });

    s.on("guess_result", (data: { playerSlot: number; guess: string; correctPosition: number; newlyRevealed: number[]; revealedBoard: string[] }) => {
      setGameState((prev) => {
        if (!prev) return null;
        const newRecord = {
          id: `gs_${Math.random()}`,
          playerSlot: data.playerSlot,
          turnNumber: prev.turnNumber,
          guess: data.guess,
          correctPosition: data.correctPosition,
          newlyRevealed: data.newlyRevealed,
          revealedBoard: data.revealedBoard,
          createdAt: new Date().toISOString()
        };

        const player1Guesses = data.playerSlot === 1 ? [...prev.player1Guesses, newRecord] : prev.player1Guesses;
        const player2Guesses = data.playerSlot === 2 ? [...prev.player2Guesses, newRecord] : prev.player2Guesses;

        return {
          ...prev,
          player1Guesses,
          player2Guesses,
          player1Revealed: data.playerSlot === 1 ? data.revealedBoard : prev.player1Revealed,
          player2Revealed: data.playerSlot === 2 ? data.revealedBoard : prev.player2Revealed
        };
      });
    });

    s.on("game_finished", (data: { winnerSlot: number; player1Secret: string; player2Secret: string; durationSec: number; turnCount: number }) => {
      setRoomState((prev) => prev ? { ...prev, status: "GAME_FINISHED" } : null);
      setGameState((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          status: "FINISHED",
          winnerSlot: data.winnerSlot,
          player1Secret: data.player1Secret,
          player2Secret: data.player2Secret,
          durationSec: data.durationSec,
          turnNumber: data.turnCount
        };
      });
      
      // Fetch stats
      if (roomState) {
        const p1 = roomState.players.find(p => p.slot === 1)?.playerId || "p1";
        const p2 = roomState.players.find(p => p.slot === 2)?.playerId || "p2";
        s.emit("get_head_to_head_stats", { roomId: roomState.id, p1Id: p1, p2Id: p2 }, (stats: BattleStats) => {
          setBattleStats(stats);
        });
      }
    });

    // Connection resilience updates
    s.on("player_disconnected", (data: { slot: number; graceEndsAt: string }) => {
      setConnection((prev) => ({
        ...prev,
        opponentDisconnected: true,
        graceEndsAt: data.graceEndsAt
      }));
      setRoomState((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          players: prev.players.map((p) => p.slot === data.slot ? { ...p, connected: false } : p)
        };
      });
    });

    s.on("player_reconnected", (data: { slot: number }) => {
      setConnection((prev) => ({
        ...prev,
        opponentDisconnected: false,
        graceEndsAt: null
      }));
      setRoomState((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          players: prev.players.map((p) => p.slot === data.slot ? { ...p, connected: true } : p)
        };
      });
    });

    // Stall handling
    s.on("stall_detected", (data: { stalledSlot: number; opponentSlot: number; message: string }) => {
      setStallState({
        isStalled: true,
        stalledSlot: data.stalledSlot,
        message: data.message
      });
    });

    s.on("stall_resumed", (data: { message: string }) => {
      setStallState({ isStalled: false, stalledSlot: null, message: "" });
    });

    // Rematch updates
    s.on("rematch_requested", (data: { slot: number }) => {
      if (data.slot !== slot) {
        setOpponentRematchRequested(true);
      } else {
        setMyRematchRequested(true);
      }
    });

    s.on("rematch_accepted", (data: { message: string }) => {
      setRoomState((prev) => prev ? { ...prev, status: "READY" } : null);
      setGameState(null);
      setOpponentRematchRequested(false);
      setMyRematchRequested(false);
      setStallState({ isStalled: false, stalledSlot: null, message: "" });
    });

    s.on("room_closed", (data: { reason: string; message: string }) => {
      setRoomState((prev) => prev ? { ...prev, status: "CLOSED" } : null);
      setGameState(null);
      setError({ code: "ROOM_CLOSED", message: data.message });
    });

    s.on("chat_broadcast", (msg: ChatMessage) => {
      setChats((prev) => [...prev, msg]);
    });

    return () => {
      s.disconnect();
    };
  }, [slot, roomState?.id]);

  // C2S Actions
  const createNewRoom = useCallback((turnTimerSec: number | null) => {
    if (!socketRef.current) return;
    setError(null);
    socketRef.current.emit("create_room", { turnTimerSec }, (res: { roomCode: string; roomId: string; playerId: string; sessionToken: string; slot: number }) => {
      setSlot(1);
      setUsername("Host");
      setRoomState({
        id: res.roomId,
        roomCode: res.roomCode,
        turnTimerSec,
        status: "CREATED",
        players: [
          {
            playerId: res.playerId,
            userId: res.playerId,
            username: "Host",
            slot: 1,
            connected: true,
            sessionToken: res.sessionToken
          }
        ],
        activeGameId: null
      });
    });
  }, []);

  const joinExistingRoom = useCallback((roomCode: string, userHandle: string) => {
    if (!socketRef.current) return;
    setError(null);
    const cleanUsername = userHandle.trim().slice(0, 15);
    
    socketRef.current.emit(
      "join_room", 
      { roomCode, username: cleanUsername, playerId, sessionToken }, 
      (res: { success: boolean; roomId: string; slot: 1 | 2; playerId?: string; sessionToken?: string; room: any; game?: any; chats?: ChatMessage[]; reconnected?: boolean }) => {
        if (res.success) {
          setSlot(res.slot);
          setUsername(cleanUsername || (res.slot === 1 ? "Host" : "Opponent"));
          
          if (res.playerId && res.sessionToken) {
            setPlayerId(res.playerId);
            setSessionToken(res.sessionToken);
            localStorage.setItem("nc_player_id", res.playerId);
            localStorage.setItem("nc_session_token", res.sessionToken);
          }

          setRoomState({
            id: res.roomId,
            roomCode: res.room.roomCode,
            turnTimerSec: res.room.turnTimerSec,
            status: res.room.status,
            players: res.room.players,
            activeGameId: res.game ? res.game.id : null
          });

          if (res.game) {
            setGameState({
              id: res.game.id,
              roomId: res.roomId,
              player1Secret: "",
              player2Secret: "",
              player1Revealed: res.slot === 1 ? res.game.myRevealedBoard : res.game.opponentRevealedBoard,
              player2Revealed: res.slot === 2 ? res.game.myRevealedBoard : res.game.opponentRevealedBoard,
              player1Guesses: res.slot === 1 ? res.game.myGuesses : res.game.opponentGuesses,
              player2Guesses: res.slot === 2 ? res.game.myGuesses : res.game.opponentGuesses,
              currentTurnSlot: res.game.currentTurnSlot,
              turnNumber: res.game.turnNumber,
              status: res.game.status,
              timerEndsAt: res.game.timerEndsAt,
              winnerSlot: res.game.winnerSlot,
              startedAt: new Date().toISOString(),
              endedAt: null,
              consecutiveTimeouts: { 1: 0, 2: 0 }
            });
          }

          if (res.chats) {
            setChats(res.chats);
          }

          // Fetch head-to-head stats if reconnected
          if (res.reconnected && res.game) {
            const p1 = res.room.players.find((p: any) => p.slot === 1)?.playerId || "p1";
            const p2 = res.room.players.find((p: any) => p.slot === 2)?.playerId || "p2";
            socketRef.current?.emit("get_head_to_head_stats", { roomId: res.roomId, p1Id: p1, p2Id: p2 }, (stats: BattleStats) => {
              setBattleStats(stats);
            });
          }
        }
      }
    );
  }, [playerId, sessionToken]);

  const submitSecret = useCallback((secret: string) => {
    if (!socketRef.current || !roomState) return;
    setError(null);
    socketRef.current.emit("submit_secret", {
      roomId: roomState.id,
      playerId,
      sessionToken,
      secret
    });
  }, [roomState, playerId, sessionToken]);

  const submitGuess = useCallback((guess: string) => {
    if (!socketRef.current || !roomState) return;
    setError(null);
    socketRef.current.emit("submit_guess", {
      roomId: roomState.id,
      playerId,
      sessionToken,
      guess
    });
  }, [roomState, playerId, sessionToken]);

  const claimTimeoutVictory = useCallback(() => {
    if (!socketRef.current || !roomState) return;
    socketRef.current.emit("claim_timeout_victory", {
      roomId: roomState.id,
      playerId,
      sessionToken
    });
  }, [roomState, playerId, sessionToken]);

  const keepWaitingStall = useCallback(() => {
    if (!socketRef.current || !roomState) return;
    socketRef.current.emit("keep_waiting_stall", {
      roomId: roomState.id,
      playerId,
      sessionToken
    });
  }, [roomState, playerId, sessionToken]);

  const requestRematch = useCallback(() => {
    if (!socketRef.current || !roomState) return;
    socketRef.current.emit("request_rematch", {
      roomId: roomState.id,
      playerId,
      sessionToken
    });
  }, [roomState, playerId, sessionToken]);

  const sendChat = useCallback((text: string) => {
    if (!socketRef.current || !roomState || !text.trim()) return;
    socketRef.current.emit("send_chat", {
      roomId: roomState.id,
      playerId,
      sessionToken,
      text
    });
  }, [roomState, playerId, sessionToken]);

  const leaveRoom = useCallback(() => {
    if (!socketRef.current || !roomState) return;
    socketRef.current.emit("leave_room", {
      roomId: roomState.id,
      playerId,
      sessionToken
    });
    // Hard reset client-side states
    setRoomState(null);
    setGameState(null);
    setSlot(null);
    setChats([]);
    setBattleStats(null);
    setOpponentRematchRequested(false);
    setMyRematchRequested(false);
    setStallState({ isStalled: false, stalledSlot: null, message: "" });
  }, [roomState, playerId, sessionToken]);

  const clearError = () => setError(null);

  return {
    socket,
    playerId,
    sessionToken,
    slot,
    username,
    roomState,
    gameState,
    chats,
    battleStats,
    error,
    connection,
    stallState,
    opponentRematchRequested,
    myRematchRequested,
    createNewRoom,
    joinExistingRoom,
    submitSecret,
    submitGuess,
    claimTimeoutVictory,
    keepWaitingStall,
    requestRematch,
    sendChat,
    leaveRoom,
    clearError
  };
}
