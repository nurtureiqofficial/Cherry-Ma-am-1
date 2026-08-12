import React, { useState } from "react";
import { Send, Sparkles, HelpCircle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface QuickDoubtWidgetProps {
  state: string;
  onInjectPrompt: (text: string) => void;
  onToast: (message: string, type: "success" | "info" | "warning" | "error") => void;
  setDialogueHistory?: React.Dispatch<React.SetStateAction<Array<{ id?: string; sender: "user" | "cherry" | "system"; text: string }>>>;
  isVisible: boolean;
  onClose: () => void;
}

export const QuickDoubtWidget: React.FC<QuickDoubtWidgetProps> = ({
  state,
  onInjectPrompt,
  onToast,
  setDialogueHistory,
  isVisible,
  onClose,
}) => {
  const [doubtText, setDoubtText] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const quickQuestions = [
    "Ma'am please explain again in simple Hindi!",
    "Can you show a real-life example of this?",
    "Is this topic important for board exams?",
    "Ma'am I didn't understand this step!",
  ];

  const handleSendDoubt = (textToSend?: string) => {
    const text = textToSend || doubtText;
    if (!text.trim()) return;

    const formattedPrompt = `[STUDENT QUICK DOUBT DURING LIVE CLASS]: "${text.trim()}". Cherry Ma'am, please answer this briefly in your witty Hinglish style!`;
    
    // Add to dialogue history UI directly
    setDialogueHistory?.((prev) => [
      ...prev,
      {
        id: "msg_" + Date.now(),
        sender: "user",
        text: `💡 Quick Doubt: ${text.trim()}`,
      },
    ]);

    // Send prompt to Gemini Live session if connected
    if (state === "speaking" || state === "listening") {
      onInjectPrompt(formattedPrompt);
      onToast("Quick doubt sent to Cherry Ma'am! 💡", "success");
    } else {
      onToast("Doubt logged! Connect live class to ask Cherry Ma'am 🎙️", "info");
    }

    setDoubtText("");
    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      onClose(); // Hide widget after sending doubt
    }, 1200);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed bottom-20 left-4 md:bottom-8 md:left-8 z-50 select-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 20 }}
            transition={{ type: "spring", damping: 22, stiffness: 320 }}
            className="w-[310px] sm:w-[360px] bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-teal-500/30 overflow-hidden text-left flex flex-col"
          >
            {/* Header */}
            <div className="bg-[#0a3641] text-white p-3.5 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="bg-[#c4f500] p-1.5 rounded-xl text-[#0a3641]">
                  <HelpCircle className="w-4 h-4 font-black" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-white leading-none">Quick Doubt</h4>
                  <p className="text-[9px] text-[#c4f500] font-bold tracking-wide mt-0.5">Ask Cherry Ma'am live without pause</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-3.5 space-y-3 bg-slate-50/90">
              {isSubmitted ? (
                <div className="py-6 flex flex-col items-center justify-center text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 animate-pulse" />
                  </div>
                  <p className="text-xs font-extrabold text-[#0a3641]">Doubt Sent to Cherry Ma'am!</p>
                  <p className="text-[10px] text-slate-500 font-medium">She will address it seamlessly in her flow.</p>
                </div>
              ) : (
                <>
                  {/* Quick Chips */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                      Quick Suggestions:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {quickQuestions.map((q, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSendDoubt(q)}
                          className="text-[10px] bg-white hover:bg-[#0a3641] hover:text-white text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 transition-all active:scale-95 text-left shadow-2xs font-medium cursor-pointer"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Input Form */}
                  <div className="space-y-2 pt-1 border-t border-slate-200/80">
                    <div className="relative">
                      <textarea
                        value={doubtText}
                        onChange={(e) => setDoubtText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendDoubt();
                          }
                        }}
                        placeholder="Type your question or doubt here..."
                        rows={2}
                        className="w-full text-xs bg-white text-slate-800 placeholder-slate-400 p-2.5 pr-9 rounded-xl border border-slate-200 focus:outline-none focus:border-[#0a3641] focus:ring-1 focus:ring-[#0a3641] resize-none font-sans"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSendDoubt()}
                        disabled={!doubtText.trim()}
                        className={`absolute right-2 bottom-3.5 p-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
                          doubtText.trim()
                            ? "bg-[#0a3641] text-[#c4f500] hover:bg-[#07252d] shadow-2xs active:scale-95"
                            : "bg-slate-100 text-slate-300 cursor-not-allowed"
                        }`}
                        title="Send Doubt"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                      <span>Press Enter to send</span>
                      <span>⚡ Non-interrupting voice</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
