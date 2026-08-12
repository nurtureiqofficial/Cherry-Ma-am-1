import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Mic,
  Volume2,
  PhoneOff,
  PhoneCall,
  Sparkles,
  X,
  AlertCircle,
  Brain,
  Calendar,
  Zap,
  Smile,
  ShieldCheck,
} from "lucide-react";
import { useKiaraLiveSession } from "../hooks/useKiaraLiveSession";

interface KiaraLiveVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentName?: string;
  grade?: string;
  board?: string;
  subject?: string;
  lowestMetric?: { name: string; score: number; icon: string };
  performanceData?: {
    conceptClarity?: number;
    theoreticalCore?: number;
    calculationPrecision?: number;
    formulaRecall?: number;
    socraticStamina?: number;
    strengths?: Array<{ concept: string; category: string }>;
    growths?: Array<{ concept: string; category: string; explanation?: string }>;
    totalQuizzes?: number;
    classesCompleted?: number;
    snapshotsSaved?: number;
    lowestMetric?: { name: string; score: number; icon: string };
  };
}

export const KiaraLiveVoiceModal: React.FC<KiaraLiveVoiceModalProps> = ({
  isOpen,
  onClose,
  studentName = "",
  grade = "Class 10",
  board = "CBSE",
  subject = "Mathematics",
  lowestMetric = { name: "Accuracy", score: 45, icon: "🎯" },
  performanceData,
}) => {
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "info" | "success" | "error";
  } | null>(null);

  const handleToast = (text: string, type: "info" | "success" | "error") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  const {
    state,
    userVolume,
    kiaraVolume,
    userTranscript,
    kiaraTranscript,
    connect,
    disconnect,
    sendTopicPrompt,
  } = useKiaraLiveSession({
    onToast: handleToast,
    studentName,
    grade,
    board,
    subject,
    performanceData,
  });

  if (!isOpen) return null;

  const isActive = state !== "disconnected" && state !== "connecting" && state !== "error";
  const userVolScale = Math.min(2.2, 1 + userVolume * 15);
  const kiaraVolScale = Math.min(2.2, 1 + kiaraVolume * 15);

  const handleClose = () => {
    disconnect();
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in font-sans">
        
        {/* Main Modal Card */}
        <div className="relative w-full max-w-xl bg-gradient-to-b from-[#031d23] via-[#05272f] to-[#021115] border-2 border-emerald-400/40 rounded-3xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.8)] text-white flex flex-col max-h-[92vh]">
          
          {/* Top Header - Ultra Modern Emerald & Gold Gradient */}
          <div className="bg-gradient-to-r from-teal-950 via-emerald-900 to-teal-950 px-4 py-3.5 flex items-center justify-between gap-3 shrink-0 shadow-lg border-b border-emerald-400/30 z-20 relative">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-tr from-amber-200 via-emerald-100 to-white flex items-center justify-center text-xl shadow-md border-2 border-amber-300/70">
                  👩‍🎓
                </div>
                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-400 border-2 border-slate-950 rounded-full flex items-center justify-center shadow-md">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                </span>
              </div>

              <div className="text-left min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm sm:text-base font-black text-white tracking-wide truncate">
                    Kiara AI Counselor 👩‍🎓
                  </h3>
                  <span className="text-[9px] font-mono font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 uppercase tracking-wider shrink-0 shadow-md">
                    LIVE VOICE
                  </span>
                </div>
                <p className="text-xs text-emerald-200/90 truncate flex items-center gap-1.5 font-sans font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span>Online • {studentName || "Student"} • {grade} ({board})</span>
                </p>
              </div>
            </div>

            {/* Priority Focus Badge & Close Button */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden sm:flex items-center gap-1.5 bg-amber-400/15 border border-amber-400/40 rounded-xl px-2.5 py-1 text-left shadow-sm">
                <span className="text-[10px] font-bold text-amber-300 font-mono flex items-center gap-1">
                  <span>{lowestMetric.icon}</span>
                  <span>{lowestMetric.name}:</span>
                  <span className="text-white font-black">{lowestMetric.score}%</span>
                </span>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="w-8.5 h-8.5 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer active:scale-90 border border-white/20 shadow-md"
                title="Close Kiara Live Counselor"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>

          {/* Modal Content Body */}
          <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4 overflow-y-auto relative">
            
            {/* Toast Banner */}
            <AnimatePresence>
              {toastMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-emerald-950/90 border border-emerald-400/40 p-2.5 rounded-xl flex items-center space-x-2 text-xs text-emerald-100 shadow-md font-medium"
                >
                  <AlertCircle className="w-4 h-4 text-amber-300 shrink-0" />
                  <span className="flex-1 text-left">{toastMessage.text}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Session Status Bar */}
            <div className="bg-[#072d36]/90 border border-emerald-400/30 rounded-2xl px-4 py-2.5 flex items-center justify-between text-left shadow-inner">
              <div className="flex items-center gap-2.5">
                <span className={`w-3 h-3 rounded-full ${
                  state === "speaking" ? "bg-amber-300 animate-bounce shadow-[0_0_10px_rgba(252,211,77,0.8)]" :
                  state === "listening" ? "bg-emerald-400 animate-ping shadow-[0_0_10px_rgba(52,211,153,0.8)]" :
                  isActive ? "bg-emerald-400" : "bg-slate-500"
                }`} />
                <span className="text-xs font-mono font-bold text-emerald-100 uppercase tracking-wide">
                  {state === "disconnected" && "Offline • Click Start Call to speak with Kiara"}
                  {state === "connecting" && "Establishing Live Audio Stream..."}
                  {state === "idle" && "Ready • Speak directly into your Mic"}
                  {state === "listening" && "Listening to your voice..."}
                  {state === "speaking" && "Kiara is speaking..."}
                  {state === "error" && "Connection error"}
                </span>
              </div>
              <span className="text-[10px] font-mono text-amber-300 font-bold uppercase tracking-wider hidden sm:inline bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded-md">
                Gemini Audio Live
              </span>
            </div>

            {/* Center Call Visualizer Screen */}
            <div className="bg-gradient-to-b from-[#062c35]/90 via-[#031c22]/90 to-[#011014]/90 border border-emerald-400/30 rounded-3xl p-5 sm:p-7 flex flex-col items-center justify-center min-h-[210px] relative select-none overflow-hidden backdrop-blur-xl shadow-2xl">
              
              {/* Background Radial Aura */}
              <div className="absolute -top-12 -left-12 w-48 h-48 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-amber-400/15 rounded-full blur-3xl pointer-events-none" />

              {state === "disconnected" && (
                <div className="text-center space-y-3.5 max-w-sm my-auto animate-fade-in relative z-10">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-emerald-950 via-teal-900 to-emerald-800 border-2 border-emerald-400/40 text-emerald-300 flex items-center justify-center mx-auto shadow-[0_0_25px_rgba(16,185,129,0.25)]">
                    <Mic className="w-8 h-8 stroke-[1.75]" />
                  </div>
                  <div className="space-y-1.5">
                    <h4 className="text-sm font-black text-amber-300 font-mono tracking-wider uppercase">
                      Live Voice Mindset Counseling
                    </h4>
                    <p className="text-xs text-emerald-100/90 leading-relaxed font-sans font-medium">
                      Talk directly with Kiara AI in natural Hinglish or English about exam stress, study timetables, mnemonics, or subject guidance!
                    </p>
                  </div>
                </div>
              )}

              {state === "connecting" && (
                <div className="text-center space-y-3.5 my-auto relative z-10">
                  <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-2 border-amber-300 border-t-transparent animate-spin" />
                    <Sparkles className="w-7 h-7 text-amber-300" />
                  </div>
                  <h5 className="text-xs font-black text-white font-mono uppercase tracking-widest animate-pulse">
                    Connecting with Kiara AI...
                  </h5>
                </div>
              )}

              {isActive && (
                <div className="w-full flex flex-col items-center justify-between space-y-4 my-auto relative z-10">
                  
                  {/* Equalizer Orbits */}
                  <div className="flex items-center justify-center space-x-6 sm:space-x-10 w-full py-2">
                    
                    {/* User Mic Orbit */}
                    <div className="flex flex-col items-center space-y-2">
                      <div
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-teal-400/60 bg-teal-950/80 flex items-center justify-center transition-all duration-75 relative shadow-[0_0_20px_rgba(20,184,166,0.3)]"
                        style={{ transform: `scale(${userVolScale})` }}
                      >
                        <Mic className={`w-7 h-7 ${state === "listening" ? "text-emerald-300" : "text-white/80"}`} />
                        {state === "listening" && (
                          <div className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping opacity-75" />
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-teal-200 uppercase font-black tracking-wider">
                        Your Mic
                      </span>
                    </div>

                    {/* Beam Connection */}
                    <div className="h-[2px] bg-gradient-to-r from-emerald-500/40 via-amber-300 to-emerald-500/40 w-12 sm:w-16 relative">
                      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-amber-300 ${
                        state === "speaking" || state === "listening" ? "animate-ping" : ""
                      }`} />
                    </div>

                    {/* Kiara Voice Orb */}
                    <div className="flex flex-col items-center space-y-2">
                      <div
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-amber-300/80 bg-gradient-to-tr from-emerald-600 via-teal-500 to-amber-400 flex items-center justify-center transition-all duration-75 relative shadow-[0_0_30px_rgba(245,158,11,0.4)]"
                        style={{ transform: `scale(${kiaraVolScale})` }}
                      >
                        <Volume2 className={`w-7 h-7 ${state === "speaking" ? "text-slate-950" : "text-slate-900"}`} />
                        {state === "speaking" && (
                          <div className="absolute inset-0 rounded-full border-2 border-amber-300 animate-ping opacity-75" />
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-amber-300 uppercase font-black tracking-wider">
                        Kiara Voice
                      </span>
                    </div>

                  </div>
                </div>
              )}
            </div>

            {/* Live Caption / Transcript Box */}
            {(userTranscript.text || kiaraTranscript.text) && (
              <div className="bg-[#021318] border border-emerald-400/30 rounded-2xl p-3.5 text-left space-y-1.5 max-h-28 overflow-y-auto shadow-inner">
                {userTranscript.text && (
                  <p className="text-xs text-teal-100 font-sans leading-snug">
                    <strong className="text-emerald-400 font-mono">You:</strong> {userTranscript.text}
                  </p>
                )}
                {kiaraTranscript.text && (
                  <p className="text-xs text-amber-100 font-sans leading-snug">
                    <strong className="text-amber-300 font-mono">Kiara:</strong> {kiaraTranscript.text}
                  </p>
                )}
              </div>
            )}

            {/* Performance Hub Synced Indicator */}
            {performanceData && (
              <div className="bg-gradient-to-r from-[#052d36] via-[#032027] to-[#052d36] border border-amber-400/40 rounded-2xl p-3 text-left flex items-center justify-between gap-2 shadow-lg">
                <div className="flex items-center gap-2.5 text-emerald-100 text-[11px] font-medium w-full min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                  <span className="font-mono font-bold text-amber-300 shrink-0">Performance Synced:</span>
                  <span className="truncate text-white font-sans font-semibold">
                    Clarity: <strong className="text-amber-300 font-mono">{performanceData.conceptClarity ?? 75}%</strong> • Calculations: <strong className="text-amber-300 font-mono">{performanceData.calculationPrecision ?? 60}%</strong> • Formula: <strong className="text-amber-300 font-mono">{performanceData.formulaRecall ?? 65}%</strong>
                  </span>
                </div>
              </div>
            )}

            {/* Quick One-Tap Topic Guidance Pills */}
            <div className="space-y-2 text-left">
              <span className="text-[10px] font-mono font-black uppercase text-emerald-200 tracking-wider flex items-center justify-between">
                <span>Quick Performance Guidance (Tap during call):</span>
                <span className="text-[9px] text-amber-300 font-sans font-extrabold bg-amber-400/15 border border-amber-400/30 px-2 py-0.5 rounded-md">
                  Full Data Access 📊
                </span>
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  disabled={!isActive}
                  onClick={() =>
                    sendTopicPrompt(
                      `Kiara, mere Performance Hub me mera concept clarity ${performanceData?.conceptClarity ?? 75}%, calculation precision ${performanceData?.calculationPrecision ?? 60}%, aur formula recall ${performanceData?.formulaRecall ?? 65}% hai. Mujhe complete performance analysis aur guidance do!`
                    )
                  }
                  className="bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 disabled:opacity-40 text-amber-200 font-bold text-[11px] py-2.5 px-3 rounded-xl shadow-md cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5 truncate"
                >
                  <Zap className="w-3.5 h-3.5 shrink-0 text-amber-300" />
                  <span className="truncate">Performance Analysis</span>
                </button>

                <button
                  type="button"
                  disabled={!isActive}
                  onClick={() =>
                    sendTopicPrompt(
                      `Kiara, mera lowest metric ${lowestMetric.name} (${lowestMetric.score}%) hai. Ise improve karne ka custom step-by-step plan batao!`
                    )
                  }
                  className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 disabled:opacity-40 text-emerald-200 font-bold text-[11px] py-2.5 px-3 rounded-xl shadow-md cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5 truncate"
                >
                  <Brain className="w-3.5 h-3.5 shrink-0 text-emerald-300" />
                  <span className="truncate">Fix Weak Metric</span>
                </button>

                <button
                  type="button"
                  disabled={!isActive}
                  onClick={() =>
                    sendTopicPrompt(
                      `Kiara, mere Class ${grade} ${subject} ke liye exact 24-hour custom study timetable aur routine batao.`
                    )
                  }
                  className="bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 disabled:opacity-40 text-cyan-200 font-bold text-[11px] py-2.5 px-3 rounded-xl shadow-md cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5 truncate"
                >
                  <Calendar className="w-3.5 h-3.5 shrink-0 text-cyan-300" />
                  <span className="truncate">Study Routine</span>
                </button>

                <button
                  type="button"
                  disabled={!isActive}
                  onClick={() =>
                    sendTopicPrompt(
                      "Kiara, mujhe exam stress aur phobia se deal karne ke liye instant relaxation tips aur guidance do!"
                    )
                  }
                  className="bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 disabled:opacity-40 text-purple-200 font-bold text-[11px] py-2.5 px-3 rounded-xl shadow-md cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5 truncate"
                >
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-purple-300" />
                  <span className="truncate">Exam Stress</span>
                </button>
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="pt-2 border-t border-emerald-400/20 flex flex-col items-center justify-center space-y-2">
              {isActive ? (
                <button
                  type="button"
                  onClick={disconnect}
                  className="w-full bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-600 text-white font-mono text-xs font-black py-3.5 rounded-2xl flex items-center justify-center space-x-2 transition-all shadow-[0_0_20px_rgba(225,29,72,0.4)] active:scale-[0.98] cursor-pointer"
                >
                  <PhoneOff className="w-4 h-4 stroke-[2.5]" />
                  <span>END VOICE CALL WITH KIARA</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={state === "connecting"}
                  onClick={connect}
                  className="w-full bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300 hover:from-emerald-300 hover:to-amber-200 text-slate-950 font-mono text-xs sm:text-sm font-black py-3.5 rounded-2xl flex items-center justify-center space-x-2 transition-all shadow-[0_0_25px_rgba(52,211,153,0.4)] hover:shadow-[0_0_35px_rgba(52,211,153,0.6)] active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  <PhoneCall className="w-4 h-4 stroke-[2.5]" />
                  <span>START LIVE CALL WITH KIARA 🌸</span>
                </button>
              )}

              <p className="text-[9.5px] font-mono text-emerald-200/60 text-center font-medium">
                🔒 Confidential & encrypted voice counseling • Powered by Gemini Live API
              </p>
            </div>

          </div>

        </div>

      </div>
    </AnimatePresence>
  );
};
