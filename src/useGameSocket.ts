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

// Module-level shared singleton socket connection
let sharedSocket: Socket | null = null;

function getSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io({
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
  }
  return sharedSocket;
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
  
  // Mutable refs to prevent stale closures in event listeners
  const playerIdRef = useRef<string>("");
  const sessionTokenRef = useRef<string>("");
  const slotRef = useRef<1 | 2 | null>(null);
  const usernameRef = useRef<string>("");
  const roomStateRef = useRef<ActiveRoomState | null>(null);

  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);
  useEffect(() => { sessionTokenRef.current = sessionToken; }, [sessionToken]);
  useEffect(() => { slotRef.current = slot; }, [slot]);
  useEffect(() => { usernameRef.current = username; }, [username]);
  useEffect(() => { roomStateRef.current = roomState; }, [roomState]);

  // Initialize socket connection & listeners exactly ONCE
  useEffect(() => {
    const s = getSocket();
    socketRef.current = s;
    setSocket(s);

    const handleConnect = () => {
      console.log(`[DIAGNOSTICS] Socket Connected: ${s.id}`);
      setConnection((prev) => ({ ...prev, connected: true, isReconnecting: false }));
      setError(null);

      const cachedPlayerId = localStorage.getItem("nc_player_id") || "";
      const cachedToken = localStorage.getItem("nc_session_token") || "";

      s.emit("register_session", { playerId: cachedPlayerId, sessionToken: cachedToken }, (res: { playerId: string; sessionToken: string }) => {
        setPlayerId(res.playerId);
        setSessionToken(res.sessionToken);
        localStorage.setItem("nc_player_id", res.playerId);
        localStorage.setItem("nc_session_token", res.sessionToken);

        // Check if there is an active room to rejoin (from URL or localStorage)
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoom = urlParams.get("room")?.toUpperCase() || "";
        const storedRoom = localStorage.getItem("nc_room_code") || "";
        const targetRoom = urlRoom || storedRoom;
        const savedUsername = localStorage.getItem("nc_username") || "";

        if (targetRoom && savedUsername) {
          console.log(`[DIAGNOSTICS] Auto-rejoining room: ${targetRoom} with username: ${savedUsername}`);
          console.log("[DIAGNOSTICS] Emit join_room", targetRoom);
          s.emit("join_room", {
            roomCode: targetRoom,
            username: savedUsername,
            playerId: res.playerId,
            sessionToken: res.sessionToken
          }, (resJoin: any) => {
            if (resJoin.success) {
              setSlot(resJoin.slot);
              setUsername(savedUsername);
              localStorage.setItem("nc_room_code", targetRoom);
              setRoomState({
                id: resJoin.roomId,
                roomCode: resJoin.room.roomCode,
                turnTimerSec: resJoin.room.turnTimerSec,
                status: resJoin.room.status,
                players: resJoin.room.players,
                activeGameId: resJoin.game ? resJoin.game.id : null
              });

              if (resJoin.game) {
                setGameState({
                  id: resJoin.game.id,
                  roomId: resJoin.roomId,
                  player1Secret: "",
                  player2Secret: "",
                  player1Revealed: resJoin.slot === 1 ? resJoin.game.myRevealedBoard : resJoin.game.opponentRevealedBoard,
                  player2Revealed: resJoin.slot === 2 ? resJoin.game.myRevealedBoard : resJoin.game.opponentRevealedBoard,
                  player1Guesses: resJoin.slot === 1 ? resJoin.game.myGuesses : resJoin.game.opponentGuesses,
                  player2Guesses: resJoin.slot === 2 ? resJoin.game.myGuesses : resJoin.game.opponentGuesses,
                  currentTurnSlot: resJoin.game.currentTurnSlot,
                  turnNumber: resJoin.game.turnNumber,
                  status: resJoin.game.status,
                  timerEndsAt: resJoin.game.timerEndsAt,
                  winnerSlot: resJoin.game.winnerSlot,
                  startedAt: new Date().toISOString(),
                  endedAt: null,
                  consecutiveTimeouts: { 1: 0, 2: 0 }
                });
              } else {
                setGameState(null);
              }

              if (resJoin.chats) {
                setChats(resJoin.chats);
              }

              window.history.replaceState({}, document.title, window.location.pathname);
            } else {
              localStorage.removeItem("nc_room_code");
              if (resJoin.error) {
                setError(resJoin.error);
              }
            }
          });
        }
      });
    };

    if (s.connected) {
      handleConnect();
    }

    s.on("connect", handleConnect);

    s.on("disconnect", () => {
      console.log("[DIAGNOSTICS] Socket Disconnected");
      setConnection((prev) => ({ ...prev, connected: false }));
    });

    s.on("error", (err: { code: string; message: string }) => {
      console.log("[DIAGNOSTICS] Socket Error:", err);
      setError(err);
    });

    s.on("player_joined", (data: { slot: number; username: string; joinedCount: number; players: any[] }) => {
      console.log("[DIAGNOSTICS] Receive player_joined", data);
      setRoomState((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          status: data.joinedCount === 2 ? "READY" : "WAITING_FOR_PLAYER",
          players: data.players
        };
      });
    });

    s.on("player_ready_status", (data: { slot: number; ready: boolean }) => {
      console.log(`[DIAGNOSTICS] Receive player_ready_status: slot=${data.slot} ready=${data.ready}`);
      console.log(`[DIAGNOSTICS] (11) player_ready_status received by socket=${s.id} currentSlot=${slotRef.current} roomId=${roomStateRef.current?.id || "none"}`);
      setRoomState((prev) => {
        if (!prev) return null;
        const updated = {
          ...prev,
          players: prev.players.map((p) => 
            p.slot === data.slot ? { ...p, secretSubmitted: data.ready } : p
          )
        };
        const p1Ready = updated.players.find(p => p.slot === 1)?.secretSubmitted;
        const p2Ready = updated.players.find(p => p.slot === 2)?.secretSubmitted;
        console.log(`[DIAGNOSTICS] After player_ready_status update: P1 ready=${p1Ready} P2 ready=${p2Ready} roomStatus=${updated.status}`);
        return updated;
      });
    });

    s.on("game_started", (data: { turnTimerSec: number | null; firstTurnSlot: number; timerEndsAt: string | null }) => {
      console.log("[DIAGNOSTICS] Receive game_started", data);
      console.log(`[DIAGNOSTICS] (12) game_started received by socket=${s.id} currentSlot=${slotRef.current} roomId=${roomStateRef.current?.id || "none"}`);
      console.log(`[DIAGNOSTICS] game_started received — setting roomState.status=PLAYING and initialising gameState`);
      setRoomState((prev) => {
        if (!prev) {
          console.log("[DIAGNOSTICS] game_started: roomState is null, cannot transition to PLAYING");
          return null;
        }
        console.log(`[DIAGNOSTICS] game_started: roomState.status was ${prev.status}, transitioning to PLAYING`);
        return { ...prev, status: "PLAYING" };
      });
      setGameState({
        id: "active",
        roomId: roomStateRef.current?.id || "",
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
      console.log("[DIAGNOSTICS] Receive turn_changed", data);
      setGameState((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          currentTurnSlot: data.currentTurnSlot,
          turnNumber: data.turnNumber,
          timerEndsAt: data.timerEndsAt,
          consecutiveTimeouts: {
            ...prev.consecutiveTimeouts,
            [data.currentTurnSlot === 1 ? 2 : 1]: 0
          }
        };
      });
      setStallState({ isStalled: false, stalledSlot: null, message: "" });
    });

    s.on("guess_result", (data: { playerSlot: number; guess: string; correctPosition: number; newlyRevealed: number[]; revealedBoard: string[] }) => {
      console.log("[DIAGNOSTICS] Receive guess_result", data);
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
      
      const currentRoomState = roomStateRef.current;
      if (currentRoomState) {
        const p1 = currentRoomState.players.find(p => p.slot === 1)?.playerId || "p1";
        const p2 = currentRoomState.players.find(p => p.slot === 2)?.playerId || "p2";
        s.emit("get_head_to_head_stats", { roomId: currentRoomState.id, p1Id: p1, p2Id: p2 }, (stats: BattleStats) => {
          setBattleStats(stats);
        });
      }
    });

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

    s.on("rematch_requested", (data: { slot: number }) => {
      if (data.slot !== slotRef.current) {
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
      console.log("[DIAGNOSTICS] Receive room_closed", data);
      localStorage.removeItem("nc_room_code");
      setRoomState((prev) => prev ? { ...prev, status: "CLOSED" } : null);
      setGameState(null);
      setError({ code: "ROOM_CLOSED", message: data.message });
    });

    s.on("chat_broadcast", (msg: ChatMessage) => {
      setChats((prev) => [...prev, msg]);
    });

    return () => {
      s.off("connect");
      s.off("disconnect");
      s.off("error");
      s.off("player_joined");
      s.off("player_ready_status");
      s.off("game_started");
      s.off("turn_changed");
      s.off("guess_result");
      s.off("game_finished");
      s.off("player_disconnected");
      s.off("player_reconnected");
      s.off("stall_detected");
      s.off("stall_resumed");
      s.off("rematch_requested");
      s.off("rematch_accepted");
      s.off("room_closed");
      s.off("chat_broadcast");
    };
  }, []);

  // C2S Actions
  const createNewRoom = useCallback((turnTimerSec: number | null) => {
    const s = getSocket();
    setError(null);
    console.log("[DIAGNOSTICS] Emit create_room");
    s.emit("create_room", { turnTimerSec }, (res: any) => {
      if (res.success === false) {
        setError(res.error);
        return;
      }
      setSlot(1);
      setUsername("Host");
      localStorage.setItem("nc_room_code", res.roomCode);
      localStorage.setItem("nc_username", "Host");

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

      window.history.replaceState({}, document.title, window.location.pathname);
    });
  }, []);

  const joinExistingRoom = useCallback((roomCode: string, userHandle: string) => {
    const s = getSocket();
    setError(null);
    const cleanUsername = userHandle.trim().slice(0, 15);
    const pId = playerIdRef.current;
    const sToken = sessionTokenRef.current;

    console.log("[DIAGNOSTICS] Emit join_room", roomCode);
    s.emit(
      "join_room", 
      { roomCode, username: cleanUsername, playerId: pId, sessionToken: sToken }, 
      (res: any) => {
        if (res.success) {
          setSlot(res.slot);
          setUsername(cleanUsername || (res.slot === 1 ? "Host" : "Opponent"));
          
          localStorage.setItem("nc_room_code", roomCode.toUpperCase());
          localStorage.setItem("nc_username", cleanUsername);

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
          } else {
            setGameState(null);
          }

          if (res.chats) {
            setChats(res.chats);
          }

          if (res.reconnected && res.game) {
            const p1 = res.room.players.find((p: any) => p.slot === 1)?.playerId || "p1";
            const p2 = res.room.players.find((p: any) => p.slot === 2)?.playerId || "p2";
            s.emit("get_head_to_head_stats", { roomId: res.roomId, p1Id: p1, p2Id: p2 }, (stats: BattleStats) => {
              setBattleStats(stats);
            });
          }

          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          localStorage.removeItem("nc_room_code");
          if (res.error) {
            setError(res.error);
          }
        }
      }
    );
  }, []);

  const submitSecret = useCallback((secret: string) => {
    const s = getSocket();
    const currentRoom = roomStateRef.current;
    if (!s || !currentRoom) return;
    setError(null);
    console.log(`[DIAGNOSTICS] Emit submit_secret socket=${s.id} roomId=${currentRoom.id} playerId=${playerIdRef.current} slot=${slotRef.current} secretLength=${secret.length}`);
    s.emit("submit_secret", {
      roomId: currentRoom.id,
      playerId: playerIdRef.current,
      sessionToken: sessionTokenRef.current,
      secret
    }, (res: any) => {
      if (res && !res.success) {
        setError(res.error);
      }
    });
  }, []);

  const submitGuess = useCallback((guess: string) => {
    const s = getSocket();
    const currentRoom = roomStateRef.current;
    if (!s || !currentRoom) return;
    setError(null);
    s.emit("submit_guess", {
      roomId: currentRoom.id,
      playerId: playerIdRef.current,
      sessionToken: sessionTokenRef.current,
      guess
    }, (res: any) => {
      if (res && !res.success) {
        setError(res.error);
      }
    });
  }, []);

  const claimTimeoutVictory = useCallback(() => {
    const s = getSocket();
    const currentRoom = roomStateRef.current;
    if (!s || !currentRoom) return;
    s.emit("claim_timeout_victory", {
      roomId: currentRoom.id,
      playerId: playerIdRef.current,
      sessionToken: sessionTokenRef.current
    }, (res: any) => {
      if (res && !res.success) {
        setError(res.error);
      }
    });
  }, []);

  const keepWaitingStall = useCallback(() => {
    const s = getSocket();
    const currentRoom = roomStateRef.current;
    if (!s || !currentRoom) return;
    s.emit("keep_waiting_stall", {
      roomId: currentRoom.id,
      playerId: playerIdRef.current,
      sessionToken: sessionTokenRef.current
    }, (res: any) => {
      if (res && !res.success) {
        setError(res.error);
      }
    });
  }, []);

  const requestRematch = useCallback(() => {
    const s = getSocket();
    const currentRoom = roomStateRef.current;
    if (!s || !currentRoom) return;
    s.emit("request_rematch", {
      roomId: currentRoom.id,
      playerId: playerIdRef.current,
      sessionToken: sessionTokenRef.current
    }, (res: any) => {
      if (res && !res.success) {
        setError(res.error);
      }
    });
  }, []);

  const sendChat = useCallback((text: string) => {
    const s = getSocket();
    const currentRoom = roomStateRef.current;
    if (!s || !currentRoom || !text.trim()) return;
    s.emit("send_chat", {
      roomId: currentRoom.id,
      playerId: playerIdRef.current,
      sessionToken: sessionTokenRef.current,
      text
    });
  }, []);

  const leaveRoom = useCallback(() => {
    const s = getSocket();
    if (roomStateRef.current) {
      s.emit("leave_room", {
        roomId: roomStateRef.current.id,
        playerId: playerIdRef.current,
        sessionToken: sessionTokenRef.current
      });
    }
    // Hard reset client-side states
    localStorage.removeItem("nc_room_code");
    setRoomState(null);
    setGameState(null);
    setSlot(null);
    setChats([]);
    setBattleStats(null);
    setOpponentRematchRequested(false);
    setMyRematchRequested(false);
    setStallState({ isStalled: false, stalledSlot: null, message: "" });
  }, []);

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
