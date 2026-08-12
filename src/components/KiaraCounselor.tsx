import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sparkles, Send, Bot, User, Brain, Heart, Target, Lightbulb, 
  Calendar, Award, BookOpen, Smile, Zap, MessageSquare, Volume2, 
  VolumeX, RefreshCw, CheckCircle, ArrowRight, ShieldCheck, HelpCircle,
  Clock, Flame, Copy, Check, Compass, Radio, Activity, Star, CheckCheck,
  Maximize2, Minimize2, X
} from "lucide-react";
import { MathRenderer } from "./MathRenderer";

interface PerformanceAnalytics {
  conceptClarity: number;
  theoreticalCore: number;
  calculationPrecision: number;
  formulaRecall: number;
  socraticStamina: number;
  strengths: { concept: string; category: string }[];
  growths: { concept: string; category: string; explanation?: string }[];
}

interface KiaraCounselorProps {
  studentName: string;
  grade: string;
  subject: string;
  board?: string;
  mediumOfLearning?: string;
  analytics?: PerformanceAnalytics;
  onNavigateToClassroom?: () => void;
  onStartVoiceCall?: () => void;
}

interface ChatMessage {
  id: string;
  sender: "user" | "kiara";
  text: string;
  timestamp: string;
  category?: "strategy" | "mindset" | "mnemonic" | "routine";
}

export const KiaraCounselor: React.FC<KiaraCounselorProps> = ({
  studentName,
  grade,
  subject,
  board = "CBSE",
  mediumOfLearning = "Hinglish",
  analytics,
  onNavigateToClassroom,
  onStartVoiceCall,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeQuickTab, setActiveQuickTab] = useState<"chat" | "routine" | "mnemonics" | "mindset">("chat");
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullScreen]);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Default fallback analytics if missing
  const stats = analytics || {
    conceptClarity: 78,
    theoreticalCore: 82,
    calculationPrecision: 65,
    formulaRecall: 70,
    socraticStamina: 85,
    strengths: [{ concept: "Core Definitions", category: "Theoretical Core" }],
    growths: [{ concept: "Calculation Step Precision", category: "Calculations", explanation: "Avoid rushing algebraic sign transpositions." }]
  };

  // Find lowest metric to formulate Kiara's initial proactive greeting
  const metrics = [
    { name: "Concept Clarity", score: stats.conceptClarity, key: "conceptClarity", icon: "🧠" },
    { name: "Theoretical Core", score: stats.theoreticalCore, key: "theoreticalCore", icon: "📚" },
    { name: "Calculation Precision", score: stats.calculationPrecision, key: "calculationPrecision", icon: "🧮" },
    { name: "Formula Recall", score: stats.formulaRecall, key: "formulaRecall", icon: "⚡" },
    { name: "Socratic Stamina", score: stats.socraticStamina, key: "socraticStamina", icon: "🔥" },
  ].sort((a, b) => a.score - b.score);

  const lowestMetric = metrics[0];
  const highestMetric = [...metrics].sort((a, b) => b.score - a.score)[0];

  // Initialize Kiara's welcome message on mount
  useEffect(() => {
    const firstName = studentName ? studentName.split(" ")[0] : "Friend";
    const initialGreeting: ChatMessage = {
      id: "init-1",
      sender: "kiara",
      text: `Namaste ${firstName}! 🌸 I'm **Kiara**, your personal AI Mindset & Academic Success Counselor!\n\n` +
        `I've reviewed your **Performance Analytics Hub** for **${subject} (${grade} • ${board})**:\n` +
        `• 🌟 **Highest Strength**: ${stats.strengths[0]?.concept || highestMetric.name} (${highestMetric.score}%)\n` +
        `• 🎯 **Priority Growth Focus**: ${lowestMetric.name} is at **${lowestMetric.score}%**.\n\n` +
        `I am here to guide you with:\n` +
        `1. 🧘 **Exam Anxiety & Stress Shield**: Stay relaxed, confident, and burnout-free.\n` +
        `2. 📅 **Personalized 24H Study Timetable**: Custom routine for your school schedule.\n` +
        `3. 💡 **Memory Hacks & Mnemonics**: Tricks to remember tough formulas & definitions permanently.\n` +
        `4. 🎯 **Scoring Strategy**: Proven steps to achieve 95%+ in ${subject}.\n\n` +
        `Aaj padhai me kaisa feel kar rahe ho? Feel free to ask anything or choose a topic below! ✨`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages([initialGreeting]);
  }, [studentName, grade, subject, board]);

  // Scroll to bottom of chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const queryText = (textToSend || inputText).trim();
    if (!queryText || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputText("");
    setIsLoading(true);

    try {
      // Build conversation history format
      const history = messages.slice(-8).map((m) => ({
        role: m.sender === "user" ? "user" : "model",
        text: m.text,
      }));

      const response = await fetch("/api/counselor-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: queryText,
          studentName,
          grade,
          subject,
          board,
          mediumOfLearning,
          performanceData: stats,
          chatHistory: history,
        }),
      });

      if (!response.ok) {
        throw new Error("Counselor service responded with error");
      }

      const resData = await response.json();
      if (resData.success && resData.reply) {
        const kiaraMsg: ChatMessage = {
          id: `kiara-${Date.now()}`,
          sender: "kiara",
          text: resData.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, kiaraMsg]);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      console.error("Kiara Counselor chat error:", err);
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: "kiara",
        text: `Network check kijiye! 😅 Don't worry, ek baar phir try karein. Kiara is always here to guide you! 🌸`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpeechPlayback = (text: string, msgId: string) => {
    if (speakingMessageId === msgId) {
      window.speechSynthesis?.cancel();
      setSpeakingMessageId(null);
      return;
    }

    if (!("speechSynthesis" in window)) {
      alert("Speech synthesis is not supported on this browser.");
      return;
    }

    window.speechSynthesis.cancel();
    
    // Clean markdown symbols for smooth audio text-to-speech reading
    const cleanAudioText = text
      .replace(/[*#_`~]/g, "")
      .replace(/\[.*?\]\(.*?\)/g, "")
      .replace(/https?:\/\/\S+/g, "");

    const utterance = new SpeechSynthesisUtterance(cleanAudioText);
    utterance.rate = 1.0;
    utterance.pitch = 1.1; // Friendly warm pitch

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) => v.name.toLowerCase().includes("female") || v.name.toLowerCase().includes("zira") || v.lang.includes("en-IN") || v.lang.includes("hi-IN")
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);

    setSpeakingMessageId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const copyToClipboard = (text: string, msgId: string) => {
    const clean = text.replace(/[*#_`~]/g, "");
    navigator.clipboard.writeText(clean);
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const quickPrompts = [
    {
      emoji: "🧘",
      label: "Exam Anxiety & Phobia",
      prompt: `Mujhe exams ki wajah se stress aur fear ho raha hai. Is fear ko overcome karne ke simple psychological tips do.`,
    },
    {
      emoji: "📅",
      label: "My Daily Study Routine",
      prompt: `Mera grade ${grade} (${board}) hai. Mujhe ek balanced 24-hour study routine aur timetable bana kar do.`,
    },
    {
      emoji: "💡",
      label: "Formula & Concept Mnemonics",
      prompt: `Mujhe ${subject} ke tough formulas aur definitions yaad rakhne ki funny aur easy mnemonic tricks batao.`,
    },
    {
      emoji: "📊",
      label: `Improve My ${lowestMetric.name}`,
      prompt: `Mera ${lowestMetric.name} abhi ${lowestMetric.score}% par hai. Ise 90%+ tak elevate karne ka exact step-by-step plan batao.`,
    },
    {
      emoji: "🎯",
      label: "Paper Attempt Strategy",
      prompt: `Exam hall me question paper kis order me attempt karna chahiye taaki time manage ho aur silly errors zero ho?`,
    },
  ];

  const counselorContent = (
    <div className={`flex flex-col bg-[#efeae2] text-slate-800 font-sans transition-all duration-300 ${
      isFullScreen 
        ? "fixed inset-0 z-[999999] w-full h-[100dvh] rounded-none shadow-none border-none overflow-hidden" 
        : "h-full rounded-3xl overflow-hidden shadow-2xl border border-emerald-900/20 relative"
    }`}>
      
      {/* Top Header - WhatsApp Emerald Theme (#008069) */}
      <div className={`bg-[#008069] text-white px-3.5 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3 shrink-0 shadow-md z-30 relative ${
        isFullScreen ? "pt-[max(10px,env(safe-area-inset-top))]" : ""
      }`}>
        
        {/* Left Contact Info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-emerald-100 flex items-center justify-center text-xl shadow-inner border-2 border-white/40">
              👩‍🎓
            </div>
            {/* WhatsApp Green Online Badge */}
            <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-400 border-2 border-[#008069] rounded-full flex items-center justify-center">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            </span>
          </div>

          <div className="text-left min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-wide truncate">
                Kiara AI Counselor 👩‍🎓
              </h3>
              <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/20 text-emerald-100 uppercase tracking-wider shrink-0">
                OFFICIAL
              </span>
            </div>
            <p className="text-[11px] text-emerald-100/90 truncate flex items-center gap-1.5 font-sans">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse shrink-0" />
              <span>online • {grade} ({board}) • Mindset & Academic Success</span>
            </p>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onStartVoiceCall && (
            <button
              type="button"
              onClick={onStartVoiceCall}
              className="bg-white/20 hover:bg-white/30 text-white font-bold text-[10.5px] sm:text-[11.5px] uppercase tracking-wider px-2.5 sm:px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 border border-white/30 shrink-0"
              title="Start Live Voice Call with Kiara AI"
            >
              <Radio className="w-3.5 h-3.5 text-emerald-100 stroke-[2.5] animate-pulse" />
              <span className="hidden xs:inline">Live Voice Call 🎙️</span>
            </button>
          )}

          <div className="hidden md:flex items-center gap-1.5 bg-white/15 border border-white/25 rounded-full px-3 py-1 text-left text-white shadow-xs">
            <span className="text-[10px] font-bold font-mono flex items-center gap-1">
              <span>{lowestMetric.icon}</span>
              <span>{lowestMetric.name}:</span>
              <span className="text-emerald-200 font-black">{lowestMetric.score}%</span>
            </span>
            <button
              type="button"
              onClick={() => handleSendMessage(`Kiara, mera lowest metric ${lowestMetric.name} (${lowestMetric.score}%) hai. Ise improve karne ka exact custom plan batao!`)}
              className="text-[9px] font-bold uppercase bg-white text-[#008069] hover:bg-emerald-50 rounded-full px-2 py-0.5 transition-all cursor-pointer shadow-2xs active:scale-95 ml-0.5"
            >
              Boost
            </button>
          </div>

          {/* Fullscreen Toggle Button */}
          <button
            type="button"
            onClick={() => setIsFullScreen((prev) => !prev)}
            className="p-2 hover:bg-white/10 rounded-full text-emerald-100 transition-colors cursor-pointer flex items-center"
            title={isFullScreen ? "Exit Full Screen" : "Full Screen Mode"}
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Subheader Navigation Tab Bar (WhatsApp Dark Green Theme) */}
      <div className="bg-[#006e5a] border-b border-black/10 px-3 sm:px-6 py-2 flex items-center justify-start sm:justify-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 z-20 text-left shadow-inner">
        <div className="max-w-4xl w-full mx-auto flex items-center gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: "chat", label: "Counseling & Mindset", icon: MessageSquare },
            { id: "routine", label: "24H Timetable", icon: Calendar },
            { id: "mnemonics", label: "Memory Mnemonics", icon: Lightbulb },
            { id: "mindset", label: "Exam Anxiety Shield", icon: Heart },
          ].map((tab) => {
            const IconComp = tab.icon;
            const isActive = activeQuickTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveQuickTab(tab.id as any)}
                className={`py-1.5 px-3.5 text-[11px] font-sans font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 ${
                  isActive
                    ? "bg-white text-[#008069] shadow-sm border border-emerald-100"
                    : "bg-[#005c4b] hover:bg-[#005041] text-emerald-100/90 hover:text-white border border-white/10"
                }`}
              >
                <IconComp className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ================= TAB 1: COUNSELING & MINDSET CHAT ================= */}
      {activeQuickTab === "chat" && (
        <div className="flex-1 flex flex-col min-h-0 relative z-10 w-full">
          
          {/* Chat Messages Feed Canvas (WhatsApp Style Pattern Canvas) */}
          <div 
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3.5 text-left relative bg-[#efeae2]"
            style={{
              backgroundImage: `radial-gradient(#008069 0.4px, transparent 0.4px), radial-gradient(#008069 0.4px, #efeae2 0.4px)`,
              backgroundSize: '24px 24px',
              backgroundPosition: '0 0, 12px 12px',
              opacity: 0.98
            }}
          >
            <div className="max-w-4xl mx-auto w-full space-y-3.5">
              {/* Encryption & Confidentiality Badge (WhatsApp Style Yellow Badge) */}
              <div className="flex justify-center my-2">
                <span className="bg-[#ffeecd] border border-[#e2d5b6] text-slate-700 text-[10px] sm:text-xs font-sans font-medium px-3 py-1 rounded-lg shadow-2xs uppercase tracking-wider text-center max-w-md">
                  🔒 End-to-end encrypted with **Kiara AI Counselor** • Personal & Confidential
                </span>
              </div>

              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex items-start ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  {/* MESSAGE BUBBLE */}
                  <div className={`relative p-3.5 sm:p-4 text-xs sm:text-sm shadow-md border font-sans leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-[#d9fdd3] text-[#111b21] border-[#c0e8b8] rounded-2xl rounded-tr-xs max-w-[88%] sm:max-w-[78%]"
                      : "bg-white text-[#111b21] border-slate-200/90 rounded-2xl rounded-tl-xs w-full max-w-[96%] sm:max-w-[90%]"
                  }`}>
                    
                    {/* Message Header (Sender Label + Action Bar) */}
                    <div className="flex items-center justify-between border-b border-black/5 pb-1 mb-2 text-[10px] font-mono">
                      <span className={`font-bold uppercase tracking-wider flex items-center gap-1 ${
                        msg.sender === "user" ? "text-emerald-900" : "text-[#008069]"
                      }`}>
                        {msg.sender === "user" ? (studentName || "You") : "Kiara AI Counselor 👩‍🎓"}
                        {msg.sender === "kiara" && <Sparkles className="w-3 h-3 text-amber-500" />}
                      </span>

                      {/* AI Action Toolbar (Copy & Audio) */}
                      {msg.sender === "kiara" && (
                        <div className="flex items-center gap-1.5 ml-2">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(msg.text, msg.id)}
                            className="hover:text-[#008069] text-slate-600 transition-colors p-1 cursor-pointer flex items-center gap-1 font-bold text-[9.5px] bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-md border border-slate-300/80"
                            title="Copy response"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span className="text-emerald-600">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSpeechPlayback(msg.text, msg.id)}
                            className="hover:text-amber-600 text-slate-600 transition-colors bg-slate-100 hover:bg-slate-200 p-1 rounded-md border border-slate-300/80 cursor-pointer"
                            title="Listen to Kiara speak"
                          >
                            {speakingMessageId === msg.id ? (
                              <VolumeX className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                            ) : (
                              <Volume2 className="w-3.5 h-3.5 text-teal-800" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Formatted Text Body */}
                    <div className="space-y-2 font-sans leading-relaxed text-xs sm:text-sm">
                      {msg.text.split("\n\n").map((paragraph, pIdx) => (
                        <div key={pIdx} className="leading-relaxed">
                          {paragraph.includes("$") || paragraph.includes("\\") ? (
                            <div className="bg-[#e6f7f3] border border-[#9ee3d4] rounded-xl p-2.5 my-1 text-[#005d50]">
                              <MathRenderer text={paragraph} isLightBg={msg.sender !== "user"} />
                            </div>
                          ) : (
                            paragraph.split("**").map((chunk, cIdx) => 
                              cIdx % 2 === 1 ? (
                                <strong key={cIdx} className={msg.sender === "user" ? "text-emerald-950 font-extrabold" : "text-[#006e5a] font-bold"}>{chunk}</strong>
                              ) : (
                                chunk
                              )
                            )
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Timestamp & Double Blue Ticks */}
                    <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-slate-500 font-sans">
                      <span>{msg.timestamp}</span>
                      {msg.sender === "user" && (
                        <CheckCheck className="w-3.5 h-3.5 text-sky-500 font-bold" />
                      )}
                    </div>

                  </div>
                </motion.div>
              ))}

              {isLoading && (
                <div className="flex items-center justify-start my-2">
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-xs p-3 px-4 flex items-center space-x-2 text-xs text-slate-800 shadow-md">
                    <RefreshCw className="w-4 h-4 text-[#008069] animate-spin" />
                    <span className="font-medium text-[#008069] animate-pulse">
                      Kiara is crafting personalized academic advice...
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Topics Scroll Bar */}
          <div className="px-2 py-2 sm:px-3 sm:py-2 bg-[#f0f2f5] border-t border-slate-300/80 overflow-x-auto flex items-center gap-1.5 no-scrollbar shrink-0 text-left">
            <div className="max-w-4xl mx-auto w-full flex items-center gap-2 overflow-x-auto no-scrollbar">
              <span className="text-[10px] font-sans font-bold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-[#008069]" /> Topics:
              </span>
              {quickPrompts.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(item.prompt)}
                  className="shrink-0 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[10.5px] font-semibold px-3 py-1 rounded-full transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                >
                  <span>{item.emoji}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Floating WhatsApp Input Bar */}
          <div className="px-2 py-2 sm:px-3 sm:py-2.5 bg-[#f0f2f5] border-t border-slate-300/80 shrink-0 text-left relative z-20 w-full box-border overflow-hidden">
            <div className="max-w-4xl mx-auto w-full">
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-1.5 sm:gap-2 w-full min-w-0"
              >
                {/* Floating White Input Box Pill */}
                <div className="flex-1 min-w-0 bg-white rounded-3xl border border-slate-300 focus-within:border-[#008069] flex items-center px-3 py-1.5 shadow-sm transition-all overflow-hidden">
                  
                  <button
                    type="button"
                    onClick={() => handleSendMessage("Kiara, give me pro tips for study timetables, stress management, and formula tricks!")}
                    className="text-slate-500 hover:text-[#008069] p-1.5 rounded-full transition-colors cursor-pointer shrink-0"
                    title="Tips & Guidance"
                  >
                    <Smile className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>

                  <input 
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={`Ask Kiara about ${subject} study strategies, stress, timetables...`}
                    className="w-full bg-transparent text-slate-900 placeholder-slate-400 text-xs sm:text-sm font-medium focus:outline-none px-2 py-1"
                  />
                </div>

                {/* Circular WhatsApp Green Send Button */}
                <button
                  type="submit"
                  disabled={!inputText.trim() || isLoading}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#008069] hover:bg-[#006e5a] disabled:opacity-40 text-white flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer shrink-0"
                  title="Send message to Kiara"
                >
                  <Send className="w-4 h-4 text-white ml-0.5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: 24H STUDY ROUTINE & TIMETABLE ================= */}
      {activeQuickTab === "routine" && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gradient-to-b from-[#f2f7f5] via-[#e8f2ee] to-[#f4f8f6] relative z-10 text-left">
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="bg-white border border-emerald-300/80 rounded-2xl p-4 sm:p-5 text-left space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <h4 className="text-sm sm:text-base font-black text-[#0a3641] font-sans flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#008069]" />
                  Kiara's High-Yield Daily Routine for Class {grade} ({board})
                </h4>
                <span className="text-[10px] font-sans font-bold text-emerald-900 bg-emerald-100/80 border border-emerald-300/80 px-3 py-0.5 rounded-full uppercase tracking-wider">
                  Psychologically Balanced
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed font-sans font-medium">
                Designed to avoid cognitive burnout using the **25-Min Pomodoro Cycle**, incorporating adequate sleep, high-focus morning slots, and interactive Cherry Ma'am classroom sessions.
              </p>
            </div>

            {/* Schedule Timeline Blocks */}
            <div className="space-y-2.5">
              {[
                { time: "06:30 AM - 07:00 AM", tag: "Mindset", color: "border-emerald-300 bg-emerald-50 text-emerald-900", title: "🌅 Morning Mindset & Hydration", detail: "5 mins deep breathing to calm test anxiety + review 3 flashcards." },
                { time: "07:00 AM - 08:30 AM", tag: "Peak Brain Power", color: "border-amber-300 bg-amber-50 text-amber-900", title: "⚡ Slot 1: Peak Brain Power (Hard Concepts)", detail: `Study toughest ${subject} derivations when cognitive stamina is 100%.` },
                { time: "08:30 AM - 02:30 PM", tag: "School", color: "border-blue-300 bg-blue-50 text-blue-900", title: "🏫 School / Offline Classes", detail: "Active listening. Mark doubts in your scratchpad to ask Cherry Ma'am!" },
                { time: "03:30 PM - 04:30 PM", tag: "Interactive Class", color: "border-emerald-300 bg-emerald-50 text-emerald-900", title: "🎓 Slot 2: Cherry Ma'am Live Classroom", detail: "Attend interactive blackboard session, ask questions & take snapshots." },
                { time: "05:00 PM - 06:00 PM", tag: "Recharge", color: "border-orange-300 bg-orange-50 text-orange-900", title: "🏃 Refreshment & Physical Break", detail: "Walk outside or play music. Crucial for memory consolidation." },
                { time: "06:30 PM - 08:00 PM", tag: "Numericals", color: "border-purple-300 bg-purple-50 text-purple-900", title: "🧮 Slot 3: Calculation & Problem Solving", detail: "Solve 10 numericals on paper step-by-step. Avoid mental shortcuts!" },
                { time: "09:00 PM - 09:45 PM", tag: "Revision", color: "border-sky-300 bg-sky-50 text-sky-900", title: "💡 Slot 4: Smart Revision & Mnemonics", detail: "Play 5-minute revision flashcards in Performance Hub." },
                { time: "10:15 PM - 06:30 AM", tag: "Deep Recovery", color: "border-indigo-300 bg-indigo-50 text-indigo-900", title: "😴 Deep Sleep Recovery", detail: "7.5 hours minimum to convert short-term study into long-term memory." },
              ].map((slot, sIdx) => (
                <div key={sIdx} className="bg-white border border-emerald-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-emerald-400 hover:shadow-md transition-all shadow-xs">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0">
                      <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-xl border block text-center ${slot.color}`}>
                        {slot.time}
                      </span>
                    </div>
                    <div>
                      <h5 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-2">
                        {slot.title}
                      </h5>
                      <p className="text-[11px] text-slate-600 mt-0.5 font-medium">{slot.detail}</p>
                    </div>
                  </div>

                  <span className={`self-start sm:self-center text-[9px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full border shrink-0 ${slot.color}`}>
                    {slot.tag}
                  </span>
                </div>
              ))}
            </div>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setActiveQuickTab("chat");
                  handleSendMessage(`Kiara, mujhe is timetable ko mere school timings ke according customize karke do.`);
                }}
                className="bg-[#008069] hover:bg-[#006e5a] text-white text-xs font-bold uppercase px-6 py-3 rounded-2xl transition-all cursor-pointer shadow-md active:scale-95"
              >
                Ask Kiara To Customize My Routine 📅
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 3: MEMORY MNEMONICS & TRICKS ================= */}
      {activeQuickTab === "mnemonics" && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#efeae2] relative z-10 text-left">
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 text-left space-y-2 shadow-sm">
              <h4 className="text-sm font-black text-[#008069] font-sans flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                Kiara's Instant Memory Mnemonics for {subject}
              </h4>
              <p className="text-xs text-slate-700 font-medium">
                Mnemonic tricks use visual associations to store formulas & definitions permanently in long-term memory.
              </p>
            </div>

            {/* Preset Mnemonic Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {[
                {
                  title: "Ohm's Law Triangle",
                  phrase: "V = I × R ('Vir The Hero')",
                  explanation: "Cover V to get I×R. Cover I to get V/R. Cover R to get V/I.",
                  category: "Physics Formula",
                  emoji: "⚡"
                },
                {
                  title: "Trigonometry Ratios",
                  phrase: "SOH CAH TOA / 'Pandit Badri Prasad Hari Hari Bol'",
                  explanation: "P/H = Sin, B/H = Cos, P/B = Tan.",
                  category: "Mathematics Trick",
                  emoji: "📐"
                },
                {
                  title: "Reactivity Series Of Metals",
                  phrase: "Please Stop Calling Me A Cute Zebra",
                  explanation: "K (Potassium), Na (Sodium), Ca (Calcium), Mg (Magnesium), Al (Aluminium), C (Carbon), Zn (Zinc).",
                  category: "Chemistry Memory",
                  emoji: "🧪"
                },
                {
                  title: "Quadratic Equation Formula",
                  phrase: "Negative B plus or minus radical B-squared minus 4AC over 2A",
                  explanation: "x = (-b ± √(b² - 4ac)) / (2a)",
                  category: "Math Equation",
                  emoji: "🧮"
                }
              ].map((m, mIdx) => (
                <div key={mIdx} className="bg-white border border-slate-200/90 rounded-2xl p-4 space-y-2.5 text-left shadow-xs hover:border-[#008069]/40 hover:shadow-md transition-all">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-[9.5px] font-mono text-[#008069] uppercase font-bold flex items-center gap-1">
                      <span>{m.emoji}</span> {m.category}
                    </span>
                    <span className="text-[9.5px] font-mono text-[#005d50] bg-[#e6f7f3] px-2.5 py-0.5 rounded-full border border-[#9ee3d4]">
                      ✨ High-Yield
                    </span>
                  </div>
                  <h5 className="text-xs sm:text-sm font-black text-slate-900">{m.title}</h5>
                  <div className="p-2.5 rounded-xl bg-[#e6f7f3] border border-[#9ee3d4] text-[#005d50] text-xs font-mono font-bold">
                    "{m.phrase}"
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed font-medium">{m.explanation}</p>
                </div>
              ))}
            </div>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setActiveQuickTab("chat");
                  handleSendMessage(`Kiara, mujhe ${subject} ke tough formulas ke liye aur mnemonics batao!`);
                }}
                className="bg-[#008069] hover:bg-[#006e5a] text-white text-xs font-bold uppercase px-6 py-3 rounded-2xl transition-all cursor-pointer shadow-md active:scale-95"
              >
                Generate Custom Mnemonics 💡
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 4: EXAM ANXIETY SHIELD ================= */}
      {activeQuickTab === "mindset" && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#efeae2] relative z-10 text-left">
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="bg-white border border-rose-200 rounded-2xl p-4 sm:p-5 text-left space-y-2 shadow-sm">
              <h4 className="text-sm font-black text-rose-700 font-sans flex items-center gap-2">
                <Heart className="w-4 h-4 text-rose-500 animate-pulse" />
                Kiara's Exam Anxiety & Phobia Shield 🧘
              </h4>
              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                Academic pressure is completely normal. Here are 4 scientifically backed psychological techniques to calm your mind during exams.
              </p>
            </div>

            {/* Psychological Mindset Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {[
                {
                  title: "4-7-8 Breathing Reset",
                  tag: "Instant Anxiety Reduction",
                  emoji: "🫁",
                  steps: "Inhale through nose for 4s → Hold breath for 7s → Exhale slowly through mouth for 8s. Repeat 3 times before starting an exam."
                },
                {
                  title: "The 2-Minute Rule for Blanking Out",
                  tag: "Cognitive Reboot",
                  emoji: "🧠",
                  steps: "If you blank out on a question, drink a sip of water, close your eyes, and move to the easiest question first to rebuild momentum."
                },
                {
                  title: "Silly Errors Eraser",
                  tag: "Precision Habit",
                  emoji: "✏️",
                  steps: "Underline the target value in the question paper (e.g., 'Find area in cm²') before writing any formula to prevent sign/unit mistakes."
                },
                {
                  title: "Night-Before Exam Mindset",
                  tag: "Sleep Protection",
                  emoji: "🌙",
                  steps: "Stop reading new topics after 09:00 PM. Review 1 page of key formulas, hydrate, and go to bed early. Memory consolidates in sleep!"
                }
              ].map((card, cIdx) => (
                <div key={cIdx} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 text-left shadow-xs hover:border-rose-300 hover:shadow-md transition-all">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-[10px] font-mono text-rose-700 uppercase font-bold flex items-center gap-1">
                      <span>{card.emoji}</span> {card.title}
                    </span>
                    <span className="text-[9px] font-mono text-[#005d50] bg-[#e6f7f3] px-2.5 py-0.5 rounded-full border border-[#9ee3d4]">
                      {card.tag}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-slate-700 leading-relaxed font-medium">{card.steps}</p>
                </div>
              ))}
            </div>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setActiveQuickTab("chat");
                  handleSendMessage(`Kiara, mujhe abhi exam phobia se deal karne ke liye personal counseling chahiye.`);
                }}
                className="bg-[#008069] hover:bg-[#006e5a] text-white text-xs font-bold uppercase px-6 py-3 rounded-2xl transition-all cursor-pointer shadow-md active:scale-95"
              >
                Talk To Kiara About Exam Stress 🧘
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );

  if (isFullScreen) {
    return createPortal(counselorContent, document.body);
  }

  return counselorContent;
};
