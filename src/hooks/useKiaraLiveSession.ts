// useKiaraLiveSession.ts
// Decoupled voice session hook for Kiara AI Mindset & Academic Success Counselor

import { useState, useRef, useEffect, useCallback } from "react";
import { AudioStreamer } from "../utils/AudioStreamer";
import { LiveTranscription } from "../types";

export type KiaraLiveState = "disconnected" | "connecting" | "idle" | "listening" | "speaking" | "error";

interface UseKiaraLiveSessionProps {
  onToast: (message: string, type: "info" | "success" | "error") => void;
  studentName?: string;
  grade?: string;
  board?: string;
  subject?: string;
  performanceData?: any;
}

export function useKiaraLiveSession({
  onToast,
  studentName = "",
  grade = "Class 10",
  board = "CBSE",
  subject = "Mathematics",
  performanceData,
}: UseKiaraLiveSessionProps) {
  const [sessionState, setSessionState] = useState<KiaraLiveState>("disconnected");
  const [userVolume, setUserVolume] = useState<number>(0);
  const [kiaraVolume, setKiaraVolume] = useState<number>(0);
  const [userTranscript, setUserTranscript] = useState<LiveTranscription>({ text: "", finished: true });
  const [kiaraTranscript, setKiaraTranscript] = useState<LiveTranscription>({ text: "", finished: true });

  const wsRef = useRef<WebSocket | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);
  const kiaraTurnIdRef = useRef<string | null>(null);

  // Lazy initialize streamer instance
  const getStreamer = (): AudioStreamer => {
    if (!streamerRef.current) {
      streamerRef.current = new AudioStreamer();
    }
    return streamerRef.current;
  };

  // Instantly halts audio output schedule
  const stopKiaraPlayback = useCallback(() => {
    if (streamerRef.current) {
      streamerRef.current.stopPlayback();
    }
    setKiaraVolume(0);
  }, []);

  // Safe and graceful session teardown
  const disconnectKiara = useCallback(() => {
    setSessionState("disconnected");

    if (streamerRef.current) {
      streamerRef.current.destroy();
      streamerRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {}
      wsRef.current = null;
    }

    setUserVolume(0);
    setKiaraVolume(0);
    setUserTranscript({ text: "", finished: true });
    setKiaraTranscript({ text: "", finished: true });
    kiaraTurnIdRef.current = null;
  }, []);

  // Receive server message
  const handleServerMessage = useCallback(
    async (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);

        // Play/Schedule Audio chunks
        if (msg.type === "audio" && msg.data) {
          setSessionState("speaking");
          const streamer = getStreamer();
          await streamer.playAudioChunk(msg.data, () => {
            if (streamer.getPlaybackVolume() === 0) {
              setSessionState((prev) => (prev === "speaking" ? "idle" : prev));
              setKiaraVolume(0);
            }
          });
        }

        // Interruption
        else if (msg.type === "interrupted") {
          console.log("[Kiara Live Hook] Assistant interrupted by student voice.");
          stopKiaraPlayback();
          setSessionState("listening");
          setKiaraTranscript((prev) => ({ ...prev, finished: true }));
          kiaraTurnIdRef.current = null;
        }

        // Transcriptions (Input)
        else if (msg.type === "inputTranscription") {
          setUserTranscript({
            text: msg.text,
            finished: msg.finished,
          });
        }

        // Transcriptions (Output)
        else if (msg.type === "outputTranscription") {
          if (!kiaraTurnIdRef.current) {
            kiaraTurnIdRef.current = "kiara-" + Math.random().toString(36).substring(2, 11);
            setKiaraTranscript({
              text: msg.text,
              finished: msg.finished,
              id: kiaraTurnIdRef.current,
            });
          } else {
            setKiaraTranscript((prev) => {
              const currentId = kiaraTurnIdRef.current || prev.id;
              const originalText = prev.id === currentId ? prev.text : "";
              return {
                text: originalText + msg.text,
                finished: msg.finished,
                id: currentId!,
              };
            });
          }

          if (msg.finished) {
            kiaraTurnIdRef.current = null;
          }

          if (!msg.finished) {
            setSessionState("speaking");
          }
        }

        // Socket ready handshaked
        else if (msg.type === "ready") {
          console.log("[Kiara Live Hook] Handshake completed with Kiara Counselor.");
          setSessionState("idle");
          onToast(`Kiara Counselor is live! Namaste ${studentName || "Student"} 🌸`, "success");
        }

        // Explicit disconnection or error
        else if (msg.type === "disconnected" || msg.type === "error") {
          console.warn("[Kiara Live Hook] Connection finished/errored:", msg.error);
          disconnectKiara();
          if (msg.type === "error") {
            onToast(msg.error || "A connection fault occurred with Kiara AI.", "error");
          }
        }
      } catch (err) {
        console.error("[Kiara Live Hook] Error processing server packet:", err);
      }
    },
    [onToast, stopKiaraPlayback, disconnectKiara, studentName]
  );

  // Send quick text prompt to Kiara over WebSocket
  const sendTopicPrompt = (topicText: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "text",
          text: topicText,
        })
      );
      onToast(`Asked Kiara: "${topicText}"`, "info");
    }
  };

  // Connect to Kiara
  const connectKiara = async () => {
    if (sessionState !== "disconnected") return;

    setSessionState("connecting");
    onToast("Connecting live call with Kiara Counselor...", "info");

    try {
      const streamer = getStreamer();

      // Setup WebSocket URL with student parameters
      const isHttps = window.location.protocol === "https:";
      const wsProtocol = isHttps ? "wss:" : "ws:";
      const targetHost = window.location.host;
      const wsUrl = `${wsProtocol}//${targetHost}/api/kiara-live?studentName=${encodeURIComponent(
        studentName
      )}&grade=${encodeURIComponent(grade)}&board=${encodeURIComponent(board)}&subject=${encodeURIComponent(subject)}${
        performanceData
          ? `&performanceData=${encodeURIComponent(JSON.stringify(performanceData))}`
          : ""
      }`;

      console.log("[Kiara Live Hook] Opening WebSocket stream for Kiara Counselor:", wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = handleServerMessage;
      ws.onclose = () => {
        console.log("[Kiara Live Hook] WebSocket closed.");
        disconnectKiara();
      };
      ws.onerror = (e) => {
        console.error("[Kiara Live Hook] WebSocket error:", e);
        setSessionState("error");
        onToast("Kiara connection interrupted. Please try again! 🎙️", "error");
        disconnectKiara();
      };

      // Handle raw mic recording streams
      await streamer.startRecording(
        (base64PCM) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "audio",
                data: base64PCM,
              })
            );
          }
        },
        (micVolume) => {
          setUserVolume(micVolume);
          if (micVolume > 0.02) {
            setSessionState((prev) => (prev === "idle" ? "listening" : prev));
          }
        }
      );

      // Web Socket keepalive Ping loop
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 15000);

      ws.addEventListener("close", () => clearInterval(pingInterval));
    } catch (err: any) {
      console.error("[Kiara Live Hook] Mic authorization or connection failed:", err);
      setSessionState("error");
      onToast(err.message || "Failed starting microphone. Please grant permission.", "error");
      disconnectKiara();
    }
  };

  // Speaker nodes real-time feedback volume loop
  useEffect(() => {
    let animId: number;
    const monitorVolume = () => {
      if (streamerRef.current && sessionState === "speaking") {
        const vol = streamerRef.current.getPlaybackVolume();
        setKiaraVolume(vol);
      } else {
        setKiaraVolume(0);
      }
      animId = requestAnimationFrame(monitorVolume);
    };
    monitorVolume();
    return () => cancelAnimationFrame(animId);
  }, [sessionState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectKiara();
    };
  }, [disconnectKiara]);

  return {
    state: sessionState,
    userVolume,
    kiaraVolume,
    userTranscript,
    kiaraTranscript,
    connect: connectKiara,
    disconnect: disconnectKiara,
    sendTopicPrompt,
  };
}
