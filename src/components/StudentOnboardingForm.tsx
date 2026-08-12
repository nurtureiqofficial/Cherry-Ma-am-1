import React, { useState } from "react";
import { GraduationCap, BookOpen, Globe, User, Sparkles, ArrowRight } from "lucide-react";
import { motion } from "motion/react";

interface StudentOnboardingFormProps {
  initialName: string;
  onSubmit: (data: { name: string; grade: string; board: string; mediumOfLearning: string }) => Promise<void>;
}

export function StudentOnboardingForm({ initialName, onSubmit }: StudentOnboardingFormProps) {
  const [name, setName] = useState(initialName || "");
  const [grade, setGrade] = useState("Class 10");
  const [board, setBoard] = useState("CBSE");
  const [mediumOfLearning, setMediumOfLearning] = useState("Hinglish");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please tell us your name so Cherry Ma'am can call you!");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        grade,
        board,
        mediumOfLearning,
      });
    } catch (err: any) {
      console.error("[Onboarding] Submission failed:", err);
      setError(err?.message || "Something went wrong during profile submission.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-3 overflow-y-auto no-scrollbar">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-teal-100/50 overflow-hidden relative my-auto"
      >
        {/* Soft background radial highlights */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-[#c4f500]/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-teal-500/5 rounded-full blur-2xl pointer-events-none" />

        {/* Header Header Banner */}
        <div className="bg-[#0a3641] px-5 py-6 text-white relative text-center">
          <div className="w-10 h-10 rounded-xl bg-[#c4f500]/10 border border-[#c4f500]/20 flex items-center justify-center mx-auto mb-3 text-[#c4f500]">
            <GraduationCap className="w-5 h-5 animate-pulse-slow" />
          </div>
          <h3 className="text-base font-extrabold tracking-tight">Setup Your Student Profile</h3>
          <p className="text-teal-100/70 text-[10px] mt-1 max-w-xs mx-auto font-medium">
            One-time profiling so Cherry Ma'am can customize your studies, teaching tone, and explanations perfectly!
          </p>
        </div>

        {/* Onboarding Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-left">
          {error && (
            <div className="p-2.5 bg-red-50 border border-red-100 text-red-600 rounded-xl text-[11px] font-semibold">
              ⚠️ {error}
            </div>
          )}

          {/* 1. Name Input Field */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a3641] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#0a3641]/60" />
              <span>Full Name</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="E.g., Nehal Sharma"
              className="w-full bg-[#f7f9f6] border border-[#dae1dd] focus:border-[#0a3641] focus:ring-1 focus:ring-[#0a3641] rounded-xl px-3.5 py-2.5 text-xs text-[#0a3641] font-medium outline-none transition-all"
              required
            />
          </div>

          <div className="space-y-4">
            {/* 2. Grade/Class Dropdown Field */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a3641] flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-[#0a3641]/60" />
                <span>Class / Grade</span>
              </label>
              <div className="relative">
                <select
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="w-full bg-[#f7f9f6] border border-[#dae1dd] focus:border-[#0a3641] focus:ring-1 focus:ring-[#0a3641] rounded-xl px-3 py-2.5 text-xs text-[#0a3641] font-bold outline-none appearance-none transition-all cursor-pointer"
                >
                  <option value="Class 6">Class 6</option>
                  <option value="Class 7">Class 7</option>
                  <option value="Class 8">Class 8</option>
                  <option value="Class 9">Class 9</option>
                  <option value="Class 10">Class 10</option>
                  <option value="Class 11">Class 11</option>
                  <option value="Class 12">Class 12</option>
                </select>
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-[#0a3641]/50 font-bold text-[9px]">
                  ▼
                </div>
              </div>
            </div>

            {/* 3. Educational Board Dropdown Field */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a3641] flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[#0a3641]/60" />
                <span>Edu Board</span>
              </label>
              <div className="relative">
                <select
                  value={board}
                  onChange={(e) => setBoard(e.target.value)}
                  className="w-full bg-[#f7f9f6] border border-[#dae1dd] focus:border-[#0a3641] focus:ring-1 focus:ring-[#0a3641] rounded-xl px-3 py-2.5 text-xs text-[#0a3641] font-bold outline-none appearance-none transition-all cursor-pointer"
                >
                  <option value="CBSE">CBSE Board</option>
                  <option value="ICSE">ICSE / ISC Board</option>
                  <option value="UP Board">UP Board (Uttar Pradesh)</option>
                  <option value="MP Board">MP Board (Madhya Pradesh)</option>
                  <option value="Rajasthan Board">Rajasthan Board (RBSE)</option>
                  <option value="Maharashtra Board">Maharashtra Board (MSBSHSE)</option>
                  <option value="Bihar Board">Bihar Board (BSEB)</option>
                  <option value="Jharkhand Board">Jharkhand Board (JAC)</option>
                  <option value="Odisha Board">Odisha Board (CHSE/BSE)</option>
                  <option value="West Bengal Board">West Bengal Board (WBBSE/WBCHSE)</option>
                  <option value="Other State Board">Other State Board</option>
                </select>
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-[#0a3641]/50 font-bold text-[9px]">
                  ▼
                </div>
              </div>
            </div>

            {/* 4. Medium of Learning Dropdown */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#0a3641] flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[#0a3641]/60" />
                <span>Medium (Lang)</span>
              </label>
              <div className="relative">
                <select
                  value={mediumOfLearning}
                  onChange={(e) => setMediumOfLearning(e.target.value)}
                  className="w-full bg-[#f7f9f6] border border-[#dae1dd] focus:border-[#0a3641] focus:ring-1 focus:ring-[#0a3641] rounded-xl px-3 py-2.5 text-xs text-[#0a3641] font-bold outline-none appearance-none transition-all cursor-pointer"
                >
                  <option value="Hinglish">Hinglish</option>
                  <option value="English">English</option>
                  <option value="Hindi">Hindi</option>
                  <option value="Bangla">Bangla</option>
                  <option value="Oriya">Oriya</option>
                </select>
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-[#0a3641]/50 font-bold text-[9px]">
                  ▼
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 flex flex-col items-center gap-3.5 border-t border-[#dae1dd]/50">
            <span className="text-[9px] font-medium text-slate-400 flex items-center gap-1 self-start">
              <Sparkles className="w-3 h-3 text-[#c4f500]" />
              <span>Syllabus adjusts content complexity instantly!</span>
            </span>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#0a3641] text-[#c4f500] hover:bg-[#124e5d] active:scale-95 py-3 px-5 rounded-xl flex items-center justify-center gap-2 transition-all font-bold font-sans text-xs cursor-pointer shadow-md disabled:opacity-50"
            >
              <span>{submitting ? "Saving Profile..." : "Submit to Cherry Ma'am"}</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#c4f500]" />
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
