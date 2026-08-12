import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sparkles, Send, Upload, Copy, Check, FileText, Image as ImageIcon, 
  RefreshCw, Calculator, Atom, TestTube, Leaf, Globe, 
  Code, Download, Volume2, VolumeX, Trash2, ArrowRight, HelpCircle, 
  CheckCircle, FileCode, Edit3, ShieldAlert, Maximize2, Minimize2,
  Paperclip, Smile, CheckCheck, MoreVertical, Camera, X, Crop
} from "lucide-react";
import { MathRenderer } from "./MathRenderer";
import { VectorDisplay } from "./VectorDisplay";
import { ImageCropRotateModal } from "./ImageCropRotateModal";

interface HomeworkMakerProps {
  studentName: string;
  grade: string;
  subject?: string;
  board?: string;
  mediumOfLearning?: string;
  addToast: (msg: string, type: "success" | "error" | "info") => void;
}

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  imagePreview?: string;
  timestamp: string;
}

export const HomeworkMaker: React.FC<HomeworkMakerProps> = ({
  studentName,
  grade,
  board = "CBSE",
  mediumOfLearning = "Hinglish",
  addToast,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [homeworkFormat, setHomeworkFormat] = useState<"auto" | "mcq_one_word" | "short_answer" | "long_answer" | "fill_match">("auto");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const [rawImageForCrop, setRawImageForCrop] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Toggle Fullscreen with Browser API + CSS fallback
  const toggleFullscreen = () => {
    const nextState = !isFullscreen;
    setIsFullscreen(nextState);

    try {
      if (nextState) {
        if (containerRef.current && containerRef.current.requestFullscreen) {
          containerRef.current.requestFullscreen().catch(() => {});
        }
      } else {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    } catch (e) {
      // Ignore native API errors
    }

    addToast(nextState ? "Expanded Home Work Maker to Fullscreen! 🖥️" : "Exited Fullscreen mode", "info");
  };

  // Sync state if user exits via ESC key or swipe gesture
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
    };
  }, []);

  // Initial greeting message in WhatsApp format
  useEffect(() => {
    const firstName = studentName ? studentName.split(" ")[0] : "Student";
    const greetingMsg: ChatMessage = {
      id: "init-hw-1",
      sender: "ai",
      text: `Namaste ${firstName}! 📝 Welcome to **Home Work Maker**!\n\n` +
        `I am your dedicated AI Homework Assistant for **${grade} (${board})**.\n\n` +
        `• 📸 **Upload a photo** of your homework question paper or textbook exercise.\n` +
        `• ✍️ **Type or paste** any question (Maths, Science, SST, Hindi, English, EVS, CS, etc.).\n` +
        `• 📓 **Notebook Ready Answers**: Get clean, step-by-step solutions formatted for your school copy!\n\n` +
        `Aapka aaj ka homework kis question ka hai? Upload photo or type below! ✨`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages([greetingMsg]);
  }, [studentName, grade, board]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleGallerySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        addToast("Please select an image smaller than 10MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setImagePreview(dataUrl);
        setSelectedImage(file);
        addToast("Homework photo attached from gallery! 🖼️", "success");
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    }
  };

  const handleCameraSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        addToast("Please capture an image smaller than 10MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setRawImageForCrop(reader.result as string);
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    }
  };

  const handleCropComplete = (croppedDataUrl: string, croppedFile: File) => {
    setImagePreview(croppedDataUrl);
    setSelectedImage(croppedFile);
    setRawImageForCrop(null);
    addToast("Homework photo cropped & attached! 📸", "success");
  };

  const handleCropCancel = () => {
    setRawImageForCrop(null);
  };

  const removeAttachedImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleSendMessage = async (textToSend?: string) => {
    const queryText = (textToSend || inputText).trim();
    if ((!queryText && !selectedImage) || isLoading) return;

    let base64Data: string | undefined = undefined;
    let mimeType: string | undefined = undefined;

    if (imagePreview) {
      base64Data = imagePreview.split(",")[1];
      mimeType = selectedImage?.type || "image/jpeg";
    }

    const userMsg: ChatMessage = {
      id: `user-hw-${Date.now()}`,
      sender: "user",
      text: queryText || "Please solve the question in the attached homework image.",
      imagePreview: imagePreview || undefined,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsLoading(true);

    try {
      const history = messages.slice(-6).map((m) => ({
        role: m.sender === "user" ? "user" : "model",
        text: m.text,
      }));

      const res = await fetch("/api/homework-maker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: queryText,
          imageBase64: base64Data,
          mimeType,
          studentName,
          grade,
          board,
          mediumOfLearning,
          homeworkFormat,
          chatHistory: history,
        }),
      });

      if (!res.ok) {
        throw new Error("Homework generator service error");
      }

      const data = await res.json();
      if (data.success && data.reply) {
        const aiMsg: ChatMessage = {
          id: `ai-hw-${Date.now()}`,
          sender: "ai",
          text: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, aiMsg]);
        addToast("Homework solution generated! 📝", "success");
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err: any) {
      console.error("Homework Maker error:", err);
      const errorMsg: ChatMessage = {
        id: `err-hw-${Date.now()}`,
        sender: "ai",
        text: `Network error aa gaya hai! 😅 Please ek baar try-again karein ya question copy-paste karein. Homework Maker is ready! 📝`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
      addToast("Failed to generate homework response", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, msgId: string) => {
    // Strip step numbers and markdown formatting symbols for clean plain text copy
    const textWithoutSteps = cleanHomeworkText(text);
    const cleanText = textWithoutSteps
      .replace(/```xml[\s\S]*?```/gi, "")
      .replace(/```svg[\s\S]*?```/gi, "")
      .replace(/\$\$/g, "")
      .replace(/\\\[|\\\]/g, "");

    navigator.clipboard.writeText(cleanText);
    setCopiedId(msgId);
    addToast("Copied to clipboard! Ready to write in notebook 📋", "success");
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleSpeechPlayback = (text: string, msgId: string) => {
    if (speakingMessageId === msgId) {
      window.speechSynthesis?.cancel();
      setSpeakingMessageId(null);
      return;
    }

    if (!("speechSynthesis" in window)) {
      addToast("Text-to-speech not supported on this browser", "error");
      return;
    }

    window.speechSynthesis.cancel();
    const cleanAudioText = text
      .replace(/```[\s\S]*?```/g, "")
      .replace(/[*#_`~]/g, "")
      .replace(/https?:\/\/\S+/g, "");

    const utterance = new SpeechSynthesisUtterance(cleanAudioText);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) => v.lang.includes("en-IN") || v.lang.includes("hi-IN") || v.name.toLowerCase().includes("india")
    );
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);

    setSpeakingMessageId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const subjectsList = [
    { name: "Mathematics", icon: "📐" },
    { name: "Physics", icon: "⚛️" },
    { name: "Chemistry", icon: "🧪" },
    { name: "Biology", icon: "🌿" },
    { name: "English", icon: "📝" },
    { name: "Hindi", icon: "✍️" },
    { name: "Social Science", icon: "🌍" },
    { name: "Computer Science", icon: "💻" },
  ];

  const cleanHomeworkText = (text: string): string => {
    if (!text) return text;
    const lines = text.split("\n");
    let inWorkingSection = false;

    const cleanedLines = lines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.includes("Step-by-Step") || trimmed.includes("Answer:") || trimmed.includes("Given Data")) {
        inWorkingSection = true;
      } else if (trimmed.includes("Final Answer:") || trimmed.includes("Tip for Notebook:")) {
        inWorkingSection = false;
      }

      if (inWorkingSection || /^\s*(?:\d+[\.\)]|Step\s*\d+\:?)\s+(?!Question|Answer|Tip|Subject)/i.test(line)) {
        return line.replace(/^\s*(?:\d+[\.\)]|Step\s*\d+\:?)\s+(?!Question|Answer|Tip|Subject)/i, "");
      }
      return line;
    });

    return cleanedLines.join("\n");
  };

  // Helper function to render text containing inline SVG or LaTeX
  const renderFormattedMessageText = (rawText: string) => {
    const textToRender = cleanHomeworkText(rawText);
    const svgRegex = /```(?:xml|svg)?\s*(<svg[\s\S]*?<\/svg>)\s*```/gi;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = svgRegex.exec(textToRender)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", content: textToRender.substring(lastIndex, match.index) });
      }
      parts.push({ type: "svg", content: match[1] });
      lastIndex = svgRegex.lastIndex;
    }

    if (lastIndex < textToRender.length) {
      parts.push({ type: "text", content: textToRender.substring(lastIndex) });
    }

    return (
      <div className="space-y-3 text-slate-800">
        {parts.map((part, pIdx) => {
          if (part.type === "svg") {
            return (
              <VectorDisplay 
                key={pIdx} 
                rawSvg={part.content} 
                index={pIdx} 
                isLightBg={true} 
              />
            );
          }

          return (
            <div key={pIdx} className="leading-relaxed font-sans text-xs sm:text-sm whitespace-pre-wrap text-slate-900">
              <MathRenderer text={part.content} isLightBg={true} />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div 
      ref={containerRef}
      className={`flex flex-col bg-[#efeae2] text-slate-800 font-sans transition-all duration-300 relative ${
        isFullscreen 
          ? "fixed inset-0 z-[9999] w-screen h-screen max-w-none max-h-none rounded-none shadow-2xl border-0 overflow-hidden" 
          : "h-full min-h-[580px] w-full rounded-3xl overflow-hidden border border-emerald-900/20 shadow-2xl"
      }`}
    >
      
      {/* ================= WHATSAPP HEADER ================= */}
      <div className="bg-[#008069] text-white px-3.5 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3 shrink-0 shadow-md z-20 relative">
        
        {/* Contact Info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-emerald-100 flex items-center justify-center text-xl shadow-inner border-2 border-white/40">
              📝
            </div>
            {/* WhatsApp Green Online Badge */}
            <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-400 border-2 border-[#008069] rounded-full flex items-center justify-center">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            </span>
          </div>

          <div className="text-left min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-wide truncate">
                Home Work Maker AI 📝
              </h3>
              <span className="text-[9px] font-mono font-bold px-2 py-0.2 rounded-full bg-white/20 text-emerald-100 uppercase tracking-wider shrink-0">
                OFFICIAL
              </span>
            </div>
            <p className="text-[11px] text-emerald-100/90 truncate flex items-center gap-1.5 font-sans">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse shrink-0" />
              <span>online • {grade} ({board}) • Auto Subject Detection</span>
            </p>
          </div>
        </div>

        {/* Header Action Icons */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          
          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 hover:bg-white/10 rounded-full text-emerald-100 transition-colors cursor-pointer flex items-center"
            title={isFullscreen ? "Exit Full Screen" : "Full Screen Mode"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* WhatsApp More Options Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 hover:bg-white/10 rounded-full text-emerald-100 transition-colors cursor-pointer"
              title="More options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white text-slate-800 rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 text-left text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    const firstName = studentName ? studentName.split(" ")[0] : "Student";
                    setMessages([{
                      id: `init-hw-${Date.now()}`,
                      sender: "ai",
                      text: `Namaste ${firstName}! Chat cleared. 📝 Type your homework question!`,
                      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                    }]);
                    setShowMenu(false);
                    addToast("Chat history cleared!", "info");
                  }}
                  aria-label="Clear chat"
                  className="w-full px-4 py-2 hover:bg-slate-100 text-red-600 flex items-center gap-2 text-left cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear Chat
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toggleFullscreen();
                    setShowMenu(false);
                  }}
                  aria-label={isFullscreen ? "Exit Fullscreen" : "Full Screen"}
                  className="w-full px-4 py-2 hover:bg-slate-100 text-slate-700 flex items-center gap-2 text-left cursor-pointer"
                >
                  {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  {isFullscreen ? "Exit Full Screen" : "Full Screen View"}
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ================= WHATSAPP CHAT MESSAGES CANVAS ================= */}
      <div 
        className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3.5 text-left relative bg-[#efeae2]"
        style={{
          backgroundImage: `radial-gradient(#008069 0.4px, transparent 0.4px), radial-gradient(#008069 0.4px, #efeae2 0.4px)`,
          backgroundSize: '24px 24px',
          backgroundPosition: '0 0, 12px 12px',
          opacity: 0.98
        }}
      >
        {/* Date / Security Header Badge (WhatsApp Style) */}
        <div className="flex justify-center my-2">
          <span className="bg-[#ffeecd] border border-[#e2d5b6] text-slate-700 text-[10px] font-sans font-medium px-3 py-1 rounded-lg shadow-2xs uppercase tracking-wider text-center max-w-md">
            🔒 End-to-end encrypted with **Cherry AI Homework Engine** • Ready for notebook writing
          </span>
        </div>

        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-start ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            {/* WHATSAPP MESSAGE BUBBLE */}
            <div className={`relative p-3.5 sm:p-4 text-xs sm:text-sm shadow-md border font-sans leading-relaxed ${
              msg.sender === "user"
                ? "bg-[#d9fdd3] text-[#111b21] border-[#c0e8b8] rounded-2xl rounded-tr-xs max-w-[88%] sm:max-w-[78%]"
                : "bg-white text-[#111b21] border-slate-200/90 rounded-2xl rounded-tl-xs w-full max-w-[96%] sm:max-w-[90%]"
            }`}>
              
              {/* Message Header (AI Sender Label or Subject Tag) */}
              <div className="flex items-center justify-between border-b border-black/5 pb-1 mb-2 text-[10px] font-mono">
                <span className={`font-bold uppercase tracking-wider flex items-center gap-1 ${
                  msg.sender === "user" ? "text-emerald-900" : "text-[#008069]"
                }`}>
                  {msg.sender === "user" ? (studentName || "You") : "Homework Solution 📝"}
                  {msg.sender === "ai" && <Sparkles className="w-3 h-3 text-amber-500" />}
                </span>

                {/* AI Action Toolbar (Copy & Audio) */}
                {msg.sender === "ai" && (
                  <div className="flex items-center gap-1.5 ml-2">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(msg.text, msg.id)}
                      className="hover:text-[#008069] text-slate-600 transition-colors p-1 cursor-pointer flex items-center gap-1 font-bold text-[9.5px] bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-md border border-slate-300/80"
                      title="Copy solution text for notebook"
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
                      title="Listen to audio"
                    >
                      {speakingMessageId === msg.id ? (
                        <VolumeX className="w-3 h-3 text-amber-600 animate-pulse" />
                      ) : (
                        <Volume2 className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* User Attached Photo Preview */}
              {msg.imagePreview && (
                <div className="mb-2.5 rounded-xl overflow-hidden border border-emerald-300 max-w-xs shadow-sm">
                  <img src={msg.imagePreview} alt="Attached Homework Question" className="w-full max-h-48 object-cover" />
                </div>
              )}

              {/* Message Content Body */}
              {msg.sender === "user" ? (
                <p className="leading-relaxed whitespace-pre-wrap text-slate-900 font-sans">{msg.text}</p>
              ) : (
                renderFormattedMessageText(msg.text)
              )}

              {/* WhatsApp Timestamp & Blue Double Ticks */}
              <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-slate-500 font-sans">
                <span>{msg.timestamp}</span>
                {msg.sender === "user" && (
                  <CheckCheck className="w-3.5 h-3.5 text-sky-500 font-bold" />
                )}
              </div>

            </div>
          </motion.div>
        ))}

        {/* Loading Indicator inside WhatsApp Chat Stream */}
        {isLoading && (
          <div className="flex items-center justify-start my-2">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-xs p-3 px-4 flex items-center space-x-2 text-xs text-slate-800 shadow-md">
              <RefreshCw className="w-4 h-4 text-[#008069] animate-spin" />
              <span className="font-medium text-[#008069] animate-pulse">
                Home Work Maker is writing school copy solution for {grade}...
              </span>
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* ================= WHATSAPP FLOATING INPUT BAR ================= */}
      <div className="px-2 py-2 sm:px-3 sm:py-2.5 bg-[#f0f2f5] border-t border-slate-300/80 shrink-0 text-left relative z-20 w-full box-border overflow-hidden">
        
        {/* Attached image preview banner overlay */}
        {imagePreview && (
          <div className="mb-2 p-2 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2 min-w-0">
              <img src={imagePreview} alt="Preview" className="w-10 h-10 rounded-lg object-cover border border-emerald-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-emerald-950 truncate">Homework Photo Attached 📸</p>
                <p className="text-[9px] text-emerald-700 truncate">{selectedImage?.name || "Cropped Photo"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setRawImageForCrop(imagePreview)}
                className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer border border-emerald-300/80"
                title="Crop or rotate photo"
              >
                <Crop className="w-3.5 h-3.5 text-emerald-700" />
                <span className="hidden sm:inline">Crop/Rotate</span>
              </button>
              <button
                type="button"
                onClick={removeAttachedImage}
                className="text-emerald-800 hover:text-red-600 p-1.5 rounded-lg cursor-pointer transition-colors"
                title="Remove photo"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Answer Format / Style Quick Chips Bar */}
        <div className="mb-1.5 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px] font-sans">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1 pl-0.5">
            <Sparkles className="w-3 h-3 text-[#008069]" /> Format:
          </span>
          
          <button
            type="button"
            onClick={() => setHomeworkFormat("auto")}
            className={`px-2.5 py-0.5 rounded-full border text-[10.5px] font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
              homeworkFormat === "auto"
                ? "bg-[#008069] text-white border-[#008069] shadow-xs"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
            }`}
            title="AI automatically detects question type and generates best solution"
          >
            ⚡ Auto-Detect
          </button>

          <button
            type="button"
            onClick={() => setHomeworkFormat("mcq_one_word")}
            className={`px-2.5 py-0.5 rounded-full border text-[10.5px] font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
              homeworkFormat === "mcq_one_word"
                ? "bg-[#008069] text-white border-[#008069] shadow-xs"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
            }`}
            title="Direct Option & 1-line reason for MCQs or One-Word questions"
          >
            🎯 MCQ / 1-Word
          </button>

          <button
            type="button"
            onClick={() => setHomeworkFormat("short_answer")}
            className={`px-2.5 py-0.5 rounded-full border text-[10.5px] font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
              homeworkFormat === "short_answer"
                ? "bg-[#008069] text-white border-[#008069] shadow-xs"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
            }`}
            title="3-4 crisp exam points for 2-3 mark questions"
          >
            📝 Short Answer
          </button>

          <button
            type="button"
            onClick={() => setHomeworkFormat("long_answer")}
            className={`px-2.5 py-0.5 rounded-full border text-[10.5px] font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
              homeworkFormat === "long_answer"
                ? "bg-[#008069] text-white border-[#008069] shadow-xs"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
            }`}
            title="Detailed headings and full derivation for 5-mark long questions"
          >
            📚 Long Answer
          </button>

          <button
            type="button"
            onClick={() => setHomeworkFormat("fill_match")}
            className={`px-2.5 py-0.5 rounded-full border text-[10.5px] font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
              homeworkFormat === "fill_match"
                ? "bg-[#008069] text-white border-[#008069] shadow-xs"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
            }`}
            title="Formatted as filled blanks or 2-column match table"
          >
            🧩 Fill Blanks / Match
          </button>
        </div>

        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-1.5 sm:gap-2 w-full min-w-0"
        >
          {/* Gallery File input element */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*,.pdf"
            onChange={handleGallerySelect}
            className="hidden"
          />

          {/* Camera File input element */}
          <input
            type="file"
            ref={cameraInputRef}
            accept="image/*"
            capture="environment"
            onChange={handleCameraSelect}
            className="hidden"
          />

          {/* Floating White Input Box Pill */}
          <div className="flex-1 min-w-0 w-0 bg-white rounded-3xl border border-slate-300 focus-within:border-[#008069] flex items-center px-2 sm:px-3 py-1 sm:py-1.5 shadow-sm transition-all overflow-hidden">
            
            {/* Emoji / Sparkles icon button */}
            <button
              type="button"
              onClick={() => addToast("Pro tip: You can paste math symbols or upload textbook photos! 📐", "info")}
              className="text-slate-500 hover:text-[#008069] p-1 sm:p-1.5 rounded-full transition-colors cursor-pointer shrink-0"
              title="Emoji & Hints"
            >
              <Smile className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Paperclip attachment button - Directly opens gallery */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-slate-500 hover:text-[#008069] p-1 sm:p-1.5 rounded-full transition-colors cursor-pointer shrink-0"
              title="Upload Homework Photo from Gallery"
            >
              <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Text Input */}
            <input 
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type homework question..."
              className="flex-1 min-w-0 w-0 bg-transparent border-none focus:outline-none text-slate-800 placeholder-slate-400 text-xs sm:text-sm px-1 sm:px-2 py-1 font-medium"
            />

            {/* Camera button shortcut */}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="text-slate-500 hover:text-[#008069] p-1 sm:p-1.5 rounded-full transition-colors cursor-pointer shrink-0"
              title="Take Camera Photo"
            >
              <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          {/* WhatsApp Circular Green Send Button */}
          <button
            type="submit"
            disabled={(!inputText.trim() && !selectedImage) || isLoading}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#00a884] hover:bg-[#008f70] disabled:opacity-40 text-white flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-md active:scale-90"
            title="Send Message"
          >
            <Send className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" />
          </button>
        </form>

      </div>

      {/* Image Crop & Rotate Modal Overlay */}
      {rawImageForCrop && (
        <ImageCropRotateModal
          imageSrc={rawImageForCrop}
          onComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}

    </div>
  );
};

