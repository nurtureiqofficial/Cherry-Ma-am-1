import { useState, useRef, useEffect, useCallback } from "react";
import { SessionState, ThemeType, LiveTranscription } from "../types";

interface UseLiveSessionProps {
  onThemeChange: (theme: ThemeType) => void;
  onToast: (message: string, type: "info" | "success" | "error") => void;
  onNextTopic?: () => void;
  onClassComplete?: () => void;
  onTeachingPhaseChange?: (phase: string) => void;
  onUpdateWhiteboard?: (content: string, append: boolean) => void;
  studentName?: string;
  grade?: string;
  board?: string;
  mediumOfLearning?: string;
  subject?: string;
  activeTopicIndex?: number;
  sessionId?: string | null;
}

export function useLiveSession({ 
  onThemeChange, 
  onToast, 
  onNextTopic, 
  onClassComplete, 
  onTeachingPhaseChange, 
  onUpdateWhiteboard,
  studentName,
  grade,
  board,
  mediumOfLearning,
  subject,
  activeTopicIndex,
  sessionId
}: UseLiveSessionProps) {
  const [sessionState, setSessionState] = useState<SessionState>("disconnected");
  const sessionStateRef = useRef<SessionState>("disconnected");
  useEffect(() => {
    sessionStateRef.current = sessionState;
  }, [sessionState]);

  const [teachingPhase, setTeachingPhase] = useState<string>("intro");
  const teachingPhaseRef = useRef<string>("intro");
  useEffect(() => {
    teachingPhaseRef.current = teachingPhase;
  }, [teachingPhase]);

  const nextTopicRef = useRef(onNextTopic);
  const classCompleteRef = useRef(onClassComplete);
  const updateWhiteboardRef = useRef(onUpdateWhiteboard);
  const lastActiveTopicIndexRef = useRef<number | undefined>(activeTopicIndex);

  useEffect(() => { nextTopicRef.current = onNextTopic; }, [onNextTopic]);
  useEffect(() => { classCompleteRef.current = onClassComplete; }, [onClassComplete]);
  useEffect(() => { updateWhiteboardRef.current = onUpdateWhiteboard; }, [onUpdateWhiteboard]);
  useEffect(() => { lastActiveTopicIndexRef.current = activeTopicIndex; }, [activeTopicIndex]);

  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackStreamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Pre-initialize playback context and recording destination.
  useEffect(() => {
    try {
      const playbackCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      playbackCtxRef.current = playbackCtx;
      const cherryAudioDest = playbackCtx.createMediaStreamDestination();
      playbackStreamDestRef.current = cherryAudioDest;
      setPlaybackStream(cherryAudioDest.stream);
      console.log("[useLiveSession] Mounted - Unified recording audio destination pre-warmed!");
    } catch (e) {
      console.warn("[useLiveSession] Failed pre-warming audio recording track on mount:", e);
    }
  }, []);

  const [userVolume, setUserVolume] = useState<number>(0);
  const [cherryVolume, setCherryVolume] = useState<number>(0);
  const [isMicActive, setIsMicActive] = useState<boolean>(true);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);

  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [playbackStream, setPlaybackStream] = useState<MediaStream | null>(null);

  const [userTranscript, setUserTranscript] = useState<LiveTranscription>({ text: "", finished: true });
  const [cherryTranscript, setCherryTranscript] = useState<LiveTranscription>({ text: "", finished: true });

  const wsRef = useRef<WebSocket | null>(null);
  // Monotonically increasing generation invalidates callbacks belonging to stale sockets.
  const connectionGenerationRef = useRef(0);
  const cherryTurnIdRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const intentionalDisconnectRef = useRef<boolean>(false);

  const micCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const activeSources = useRef<AudioBufferSourceNode[]>([]);
  const nextStartTimeRef = useRef<number>(0);
  const userVolSmoothed = useRef<number>(0);
  const cherryVolSmoothed = useRef<number>(0);

  const pcm16ToFloat32 = (buffer: ArrayBuffer): Float32Array => {
    const view = new DataView(buffer);
    const length = buffer.byteLength / 2;
    const result = new Float32Array(length);
    for (let i = 0; i < length; i++) result[i] = view.getInt16(i * 2, true) / 32768.0;
    return result;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const stopPlayback = useCallback(() => {
    activeSources.current.forEach((src) => {
      try { src.stop(); } catch (e) {}
    });
    activeSources.current = [];
    nextStartTimeRef.current = 0;
    setCherryVolume(0);
    cherryVolSmoothed.current = 0;
  }, []);

  const disconnectSession = useCallback((intentional: boolean = true) => {
    // Invalidate every callback from the current socket before tearing it down.
    connectionGenerationRef.current += 1;

    if (intentional) {
      intentionalDisconnectRef.current = true;
      reconnectAttemptsRef.current = 0;
    }

    setSessionState("disconnected");
    setMicStream(null);
    setPlaybackStream(null);

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch (e) {}
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    stopPlayback();

    // Disconnect analyser immediately so the RAF loop cannot observe a dead graph.
    if (playbackAnalyserRef.current) {
      try { playbackAnalyserRef.current.disconnect(); } catch (e) {}
      playbackAnalyserRef.current = null;
    }

    const activeMicCtx = micCtxRef.current;
    const activePlaybackCtx = playbackCtxRef.current;
    micCtxRef.current = null;
    playbackCtxRef.current = null;
    playbackStreamDestRef.current = null;

    setTimeout(() => {
      try {
        if (activeMicCtx && activeMicCtx.state !== "closed") activeMicCtx.close();
      } catch (e) {}
      try {
        if (activePlaybackCtx && activePlaybackCtx.state !== "closed") activePlaybackCtx.close();
      } catch (e) {}
      console.log("[useLiveSession] Web Audio Contexts closed after recording finalization grace period.");
    }, 1500);

    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      try { ws.close(); } catch (e) {}
    }

    setUserVolume(0);
    userVolSmoothed.current = 0;
    setUserTranscript({ text: "", finished: true });
    setCherryTranscript({ text: "", finished: true });
    cherryTurnIdRef.current = null;
  }, [stopPlayback]);

  const handleServerMessage = useCallback(
    async (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "audio" && msg.data) {
          if (!playbackCtxRef.current) return;
          const ctx = playbackCtxRef.current;
          if (ctx.state === "suspended") await ctx.resume();
          setSessionState("speaking");
          const binary = atob(msg.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const float32Data = pcm16ToFloat32(bytes.buffer);
          const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
          audioBuffer.getChannelData(0).set(float32Data);
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          if (playbackAnalyserRef.current) source.connect(playbackAnalyserRef.current);
          else source.connect(ctx.destination);
          if (playbackStreamDestRef.current) source.connect(playbackStreamDestRef.current);
          const currentTime = ctx.currentTime;
          if (nextStartTimeRef.current < currentTime) nextStartTimeRef.current = currentTime + 0.05;
          source.start(nextStartTimeRef.current);
          activeSources.current.push(source);
          source.onended = () => {
            activeSources.current = activeSources.current.filter((s) => s !== source);
            if (activeSources.current.length === 0) {
              setSessionState((prev) => (prev === "speaking" ? "idle" : prev));
              setCherryVolume(0);
              cherryVolSmoothed.current = 0;
            }
          };
          nextStartTimeRef.current += audioBuffer.duration;
        } else if (msg.type === "interrupted") {
          stopPlayback();
          setSessionState("listening");
          setCherryTranscript((prev) => prev.id && prev.id === cherryTurnIdRef.current ? { ...prev, finished: true } : prev);
          cherryTurnIdRef.current = null;
        } else if (msg.type === "toolCall") {
          const { toolCall } = msg;
          if (!toolCall || !toolCall.functionCalls) return;
          for (const fc of toolCall.functionCalls) {
            const { name, args, id } = fc;
            let toolResult: any = { success: true };
            if (name === "openWebsite") {
              try {
                let targetUrl = args.url;
                if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) targetUrl = "https://" + targetUrl;
                window.open(targetUrl, "_blank");
                onToast(`Launching ${args.name || "requested page"}! 🚀`, "success");
                toolResult = { success: true, status: "opened", url: targetUrl };
              } catch (err: any) {
                toolResult = { success: false, error: err.message };
                onToast("Darn, I couldn't open that tab! Check permissions.", "error");
              }
            } else if (name === "changeTheme") {
              try { onThemeChange(args.theme); onToast(`Changed style dashboard to '${args.theme}'! 🎨`, "info"); toolResult = { success: true, theme: args.theme }; }
              catch (err: any) { toolResult = { success: false, error: err.message }; }
            } else if (name === "moveToNextTopic") {
              try {
                if (nextTopicRef.current) { nextTopicRef.current(); toolResult = { success: true, message: "Successfully transitioned the classroom slide to next topic." }; }
                else toolResult = { success: false, error: "onNextTopic callback not registered on front-end" };
              } catch (err: any) { toolResult = { success: false, error: err.message }; }
            } else if (name === "classIsComplete") {
              try {
                if (classCompleteRef.current) { classCompleteRef.current(); toolResult = { success: true, message: "Class graduation sequence completed successfully." }; }
                else toolResult = { success: false, error: "onClassComplete callback not registered on front-end" };
              } catch (err: any) { toolResult = { success: false, error: err.message }; }
            } else if (name === "setTeachingState") {
              try {
                let phase = (args.phase || "intro").toLowerCase().trim();
                if (["explaining", "explanation", "explain", "explanating", "examples"].includes(phase)) phase = "example";
                else if (["concepts", "concept_decoding", "theory"].includes(phase)) phase = "concept";
                else if (["doubts", "doubt_solving", "practice", "qa", "questions"].includes(phase)) phase = "doubt";
                else if (["transitions", "summary", "conclusion", "next_topic"].includes(phase)) phase = "transition";
                else if (["intros", "introduction", "hook"].includes(phase)) phase = "intro";
                else if (["completed", "finish", "finished", "graduation"].includes(phase)) phase = "complete";
                const curPhase = (teachingPhaseRef.current || "intro").toLowerCase();
                const validPhases = ["intro", "concept", "example", "doubt", "transition", "complete"];
                const topicChanged = activeTopicIndex !== undefined && lastActiveTopicIndexRef.current !== activeTopicIndex;
                if (topicChanged) lastActiveTopicIndexRef.current = activeTopicIndex;
                const allowedNext = validPhases.slice();
                if (!validPhases.includes(phase)) toolResult = { success: false, error: `Invalid teaching state: '${phase}'. Allowed phases are: intro, concept, example, doubt, transition, complete.` };
                else if (curPhase !== phase && !allowedNext.includes(phase)) toolResult = { success: false, error: `Sequence violation from '${curPhase}' to '${phase}'.` };
                else { setTeachingPhase(phase); teachingPhaseRef.current = phase; onTeachingPhaseChange?.(phase); toolResult = { success: true, phase }; }
              } catch (err: any) { toolResult = { success: false, error: err.message }; }
            } else if (name === "updateWhiteboard") {
              try {
                const content = args.content || "";
                const append = !!args.append;
                if (updateWhiteboardRef.current) {
                  setTimeout(() => updateWhiteboardRef.current?.(content, append), 300);
                  toolResult = { success: true, message: "Whiteboard update scheduled with 300ms audio-first synchronization delay." };
                } else toolResult = { success: false, error: "onUpdateWhiteboard callback not registered" };
              } catch (err: any) { toolResult = { success: false, error: err.message }; }
            }
            const ws = wsRef.current;
            if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "toolResponse", id, name, response: toolResult }));
          }
        } else if (msg.type === "inputTranscription") {
          setUserTranscript({ text: msg.text, finished: msg.finished });
        } else if (msg.type === "outputTranscription") {
          if (!cherryTurnIdRef.current) {
            cherryTurnIdRef.current = "cherry-" + Math.random().toString(36).substring(2, 11);
            setCherryTranscript({ text: msg.text, finished: msg.finished, id: cherryTurnIdRef.current });
          } else {
            setCherryTranscript((prev) => {
              const currentId = cherryTurnIdRef.current || prev.id;
              return { text: prev.id === currentId ? prev.text + msg.text : msg.text, finished: msg.finished, id: currentId! };
            });
          }
          if (msg.finished) cherryTurnIdRef.current = null;
          if (!msg.finished) setSessionState("speaking");
        } else if (msg.type === "ready") {
          reconnectAttemptsRef.current = 0;
          setSessionState("idle");
          onToast("Cherry's online! Start talking whenever you're ready. 😘", "success");
        } else if (msg.type === "restoreState") {
          if (msg.teachingPhase) {
            let restoredPhase = msg.teachingPhase.toLowerCase().trim();
            if (["explaining", "explanation", "explain", "explanating", "examples"].includes(restoredPhase)) restoredPhase = "example";
            else if (["concepts", "concept_decoding", "theory"].includes(restoredPhase)) restoredPhase = "concept";
            else if (["doubts", "doubt_solving", "practice", "qa", "questions"].includes(restoredPhase)) restoredPhase = "doubt";
            else if (["transitions", "summary", "conclusion", "next_topic"].includes(restoredPhase)) restoredPhase = "transition";
            else if (["intros", "introduction", "hook"].includes(restoredPhase)) restoredPhase = "intro";
            else if (["completed", "finish", "finished", "graduation"].includes(restoredPhase)) restoredPhase = "complete";
            setTeachingPhase(restoredPhase); teachingPhaseRef.current = restoredPhase; onTeachingPhaseChange?.(restoredPhase);
          }
          if (msg.whiteboardNotes && updateWhiteboardRef.current) updateWhiteboardRef.current(msg.whiteboardNotes, false);
        } else if (msg.type === "error") {
          console.error("[Client Hook] Server error:", msg.error);
          setSessionState("error");
          onToast(msg.error || "A connection fault occurred.", "error");
        }
      } catch (err) {
        console.error("[Client Hook] WS process message failed:", err);
      }
    },
    [activeTopicIndex, onThemeChange, onToast, onTeachingPhaseChange, stopPlayback]
  );

  const connectSession = async () => {
    if (sessionState !== "disconnected") return;

    intentionalDisconnectRef.current = false;
    const connectionGeneration = connectionGenerationRef.current + 1;
    connectionGenerationRef.current = connectionGeneration;
    setSessionState("connecting");
    onToast("Connecting to Cherry...", "info");

    let stream: MediaStream | null = null;
    let micCtx: AudioContext | null = null;
    let scriptProcessor: ScriptProcessorNode | null = null;
    let fallbackMic = false;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (connectionGenerationRef.current !== connectionGeneration) { stream.getTracks().forEach((t) => t.stop()); return; }
      micStreamRef.current = stream;
      setMicStream(stream);
      setIsMicActive(true);
    } catch (micErr: any) {
      fallbackMic = true;
      setIsMicActive(false);
      onToast("Speaker-Only Mode active! (Mic access blocked or failed). You can still listen and type questions below! 🔊💬", "info");
    }

    try {
      if (connectionGenerationRef.current !== connectionGeneration) return;
      if (!fallbackMic && stream) {
        micCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        micCtxRef.current = micCtx;
        if (micCtx.state === "suspended") await micCtx.resume();
        if (connectionGenerationRef.current !== connectionGeneration) { await micCtx.close(); return; }
        const sourceNode = micCtx.createMediaStreamSource(stream);
        scriptProcessor = micCtx.createScriptProcessor(2048, 1, 1);
        processorRef.current = scriptProcessor;
        sourceNode.connect(scriptProcessor);
        scriptProcessor.connect(micCtx.destination);
      }

      let playbackCtx = playbackCtxRef.current;
      if (!playbackCtx || playbackCtx.state === "closed") {
        playbackCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        playbackCtxRef.current = playbackCtx;
      }
      if (playbackCtx.state === "suspended") await playbackCtx.resume();
      if (connectionGenerationRef.current !== connectionGeneration) return;

      let cherryAudioDest = playbackStreamDestRef.current;
      if (!cherryAudioDest || cherryAudioDest.context !== playbackCtx) {
        cherryAudioDest = playbackCtx.createMediaStreamDestination();
        playbackStreamDestRef.current = cherryAudioDest;
        setPlaybackStream(cherryAudioDest.stream);
      }

      if (!fallbackMic && stream) {
        try {
          const micSourceInPlayback = playbackCtx.createMediaStreamSource(stream);
          micSourceInPlayback.connect(cherryAudioDest);
          const silentGain = playbackCtx.createGain();
          silentGain.gain.value = 0;
          micSourceInPlayback.connect(silentGain);
          silentGain.connect(playbackCtx.destination);
        } catch (mixErr) {
          console.warn("[useLiveSession] Failed mixing student mic into the recording audio track:", mixErr);
        }
      }

      const analyser = playbackCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(playbackCtx.destination);
      playbackAnalyserRef.current = analyser;

      const isHttps = window.location.protocol === "https:";
      const wsProtocol = isHttps ? "wss:" : "ws:";
      const targetHost = window.location.host;
      const params = new URLSearchParams();
      if (grade) params.append("grade", grade);
      if (board) params.append("board", board);
      if (mediumOfLearning) params.append("mediumOfLearning", mediumOfLearning);
      if (studentName) params.append("studentName", studentName);
      if (subject) params.append("subject", subject);
      if (typeof activeTopicIndex === "number") params.append("activeTopicIndex", String(activeTopicIndex));
      if (sessionId) params.append("sessionId", sessionId);
      const wsUrl = `${wsProtocol}//${targetHost}/api/live?${params.toString()}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (connectionGenerationRef.current !== connectionGeneration || wsRef.current !== ws) return;
        void handleServerMessage(event);
      };

      ws.onclose = (ev) => {
        if (connectionGenerationRef.current !== connectionGeneration || wsRef.current !== ws) return;
        console.log("[Client Hook] WebSocket connection closed.", ev);
        if (!intentionalDisconnectRef.current && reconnectAttemptsRef.current < 3) {
          reconnectAttemptsRef.current += 1;
          const attemptNum = reconnectAttemptsRef.current;
          onToast(`Network drop detected. Reconnecting automatically (${attemptNum}/3)... 🔄`, "info");
          disconnectSession(false);
          setTimeout(() => {
            if (!intentionalDisconnectRef.current && sessionStateRef.current === "disconnected") connectSession();
          }, attemptNum * 1500);
        } else {
          disconnectSession(true);
        }
      };

      ws.onerror = (err) => {
        if (connectionGenerationRef.current !== connectionGeneration || wsRef.current !== ws) return;
        console.error("[Client Hook] WebSocket error:", err);
        setSessionState("error");
        onToast("Mic socket disconnected. Is server running?", "error");
      };

      if (scriptProcessor && ws) {
        scriptProcessor.onaudioprocess = (e) => {
          if (connectionGenerationRef.current !== connectionGeneration || wsRef.current !== ws) return;
          const floatData = e.inputBuffer.getChannelData(0);
          let sum = 0;
          for (let i = 0; i < floatData.length; i++) sum += floatData[i] * floatData[i];
          const rms = Math.sqrt(sum / floatData.length);
          userVolSmoothed.current = userVolSmoothed.current * 0.75 + rms * 0.25;
          setUserVolume(userVolSmoothed.current);
          if (rms > 0.02) setSessionState((prev) => prev === "idle" ? "listening" : prev);
          const pcm16Buffer = new Int16Array(floatData.length);
          for (let i = 0; i < floatData.length; i++) {
            const sample = Math.max(-1, Math.min(1, floatData[i]));
            pcm16Buffer[i] = sample < 0 ? sample * 32768 : sample * 32767;
          }
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "audio", data: arrayBufferToBase64(pcm16Buffer.buffer) }));
        };
      }

      const interval = setInterval(() => {
        if (connectionGenerationRef.current !== connectionGeneration || wsRef.current !== ws) { clearInterval(interval); return; }
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, 15000);
      ws.addEventListener("close", () => clearInterval(interval), { once: true });
    } catch (err: any) {
      if (connectionGenerationRef.current !== connectionGeneration) return;
      console.error("[Client Hook] Failed opening mic or web socket session:", err);
      setSessionState("error");
      onToast(err.message || "Failed initializing audio streams. Make sure standard speaker permissions are allowed.", "error");
      disconnectSession();
    }
  };

  useEffect(() => () => { disconnectSession(); }, [disconnectSession]);

  useEffect(() => {
    let animId: number;
    const dataArray = new Uint8Array(128);
    const updateVolume = () => {
      if (playbackAnalyserRef.current && sessionState === "speaking") {
        playbackAnalyserRef.current.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < 128; i++) { const v = (dataArray[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / 128);
        cherryVolSmoothed.current = cherryVolSmoothed.current * 0.75 + rms * 0.25;
        setCherryVolume(cherryVolSmoothed.current > 0.002 ? cherryVolSmoothed.current : 0);
      } else {
        setCherryVolume((prev) => prev !== 0 ? 0 : prev);
        cherryVolSmoothed.current = 0;
      }
      animId = requestAnimationFrame(updateVolume);
    };
    updateVolume();
    return () => cancelAnimationFrame(animId);
  }, [sessionState]);

  const injectPromptText = useCallback((text: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "injectPrompt", text }));
  }, []);

  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && typeof activeTopicIndex === "number") {
      ws.send(JSON.stringify({ type: "syncActiveTopic", activeTopicIndex }));
    }
  }, [activeTopicIndex]);

  return {
    state: sessionState,
    userVolume,
    cherryVolume,
    userTranscript,
    cherryTranscript,
    connect: connectSession,
    disconnect: disconnectSession,
    stopPlayback,
    injectPromptText,
    isMicActive,
    teachingPhase,
    setTeachingPhase,
    micStream,
    playbackStream,
  };
}
