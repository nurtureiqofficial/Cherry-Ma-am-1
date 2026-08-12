import React, { useState, useEffect } from "react";
import { 
  Brain, ShieldCheck, Bookmark, CheckCircle2, AlertTriangle, 
  Trash2, RefreshCw, X, Award, Clock, BookOpen, User, Lock, FileSpreadsheet, Sparkles
} from "lucide-react";
import { 
  loadStudentProfile, 
  saveStudentProfile, 
  resolveParkedConcept, 
  StudentProfile 
} from "../utils/studentProfileStore";

interface LearnerProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast?: (msg: string, type?: "info" | "success" | "warning") => void;
}

export const LearnerProfileModal: React.FC<LearnerProfileModalProps> = ({
  isOpen,
  onClose,
  onToast,
}) => {
  const [profile, setProfile] = useState<StudentProfile>(loadStudentProfile());
  const [activeTab, setActiveTab] = useState<"weak_topics" | "history" | "privacy" | "settings">("weak_topics");

  useEffect(() => {
    if (isOpen) {
      setProfile(loadStudentProfile());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleResolve = (id: string) => {
    resolveParkedConcept(id);
    const updated = loadStudentProfile();
    setProfile(updated);
    if (onToast) onToast("Concept marked as resolved and mastered! 🎉", "success");
  };

  const handleSaveSettings = (updates: Partial<StudentProfile>) => {
    const updated = { ...profile, ...updates };
    saveStudentProfile(updated);
    setProfile(updated);
    if (onToast) onToast("Learner profile preferences updated! 💾", "success");
  };

  const handleClearMemory = () => {
    if (window.confirm("Are you sure you want to clear your saved local profile memory? This cannot be undone.")) {
      localStorage.removeItem("cherry_ai_student_profile_v1");
      const reset = loadStudentProfile();
      setProfile(reset);
      if (onToast) onToast("Local profile memory cleared.", "info");
    }
  };

  const activeParked = profile.parkedConcepts.filter((c) => !c.resolved);
  const resolvedParked = profile.parkedConcepts.filter((c) => c.resolved);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl bg-[#0c201a] text-emerald-100 rounded-2xl border border-emerald-500/30 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-emerald-800/40 bg-[#061511]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#c4f500]/10 border border-[#c4f500]/30 text-[#c4f500]">
              <Brain className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold text-white font-sans tracking-wide">
                  Learner Memory & Progress Hub
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-[#c4f500]" />
                  DPDP 2023 Compliant
                </span>
              </div>
              <p className="text-xs text-emerald-400/80">
                Cross-session learning analytics, weak topic tracking & data privacy control
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-emerald-400 hover:text-white rounded-lg hover:bg-emerald-900/40 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-4 gap-2 p-4 bg-[#081a15] border-b border-emerald-800/30 text-center">
          <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-800/40">
            <span className="text-xs font-semibold text-emerald-400 block">Total Study Time</span>
            <span className="text-lg font-black text-white">{profile.totalStudyMinutes} mins</span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-800/40">
            <span className="text-xs font-semibold text-emerald-400 block">Sessions Completed</span>
            <span className="text-lg font-black text-[#c4f500]">{profile.totalSessionsCompleted}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-800/40">
            <span className="text-xs font-semibold text-emerald-400 block">Parked Concepts</span>
            <span className="text-lg font-black text-amber-400">{activeParked.length}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-800/40">
            <span className="text-xs font-semibold text-emerald-400 block">Preferred Dialect</span>
            <span className="text-sm font-bold text-teal-300 uppercase mt-1 block">{profile.preferredLanguage}</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-emerald-800/40 bg-[#071713] px-4 gap-2 overflow-x-auto">
          {[
            { id: "weak_topics", label: "📌 Parked Concepts & Weak Topics", count: activeParked.length },
            { id: "history", label: "📈 Topic Mastery History", count: profile.topicHistory.length },
            { id: "privacy", label: "🔒 DPDP Privacy & Minor Data", count: null },
            { id: "settings", label: "⚙️ Learner Profile Settings", count: null },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? "border-[#c4f500] text-[#c4f500] bg-[#c4f500]/10"
                  : "border-transparent text-emerald-300/70 hover:text-emerald-100"
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== null && tab.count > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500/30 text-amber-300 text-[10px]">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* TAB 1: PARKED CONCEPTS & WEAK TOPICS */}
          {activeTab === "weak_topics" && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-300">What are Parked Concepts?</h4>
                  <p className="text-[11px] text-amber-200/80 mt-0.5">
                    When you struggle with a specific derivation or question during Level 3 Walkthrough, Cherry Ma'am automatically tags it here so you can revisit it with a fresh mind without disrupting your class flow.
                  </p>
                </div>
              </div>

              {activeParked.length === 0 ? (
                <div className="p-8 text-center text-emerald-400/60 border border-dashed border-emerald-800/40 rounded-xl">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
                  <p className="font-bold text-sm text-emerald-200">No active parked concepts or weak topics!</p>
                  <p className="text-xs mt-1">You are executing all topics with 100% conceptual mastery. Keep it up! 🚀</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <h3 className="font-bold text-emerald-200 uppercase tracking-wider text-[10px]">
                    Active Topics Needing Revisit ({activeParked.length})
                  </h3>
                  {activeParked.map((concept) => (
                    <div
                      key={concept.id}
                      className="p-3.5 rounded-xl bg-[#091f1a] border border-emerald-800/50 flex items-center justify-between gap-3 hover:border-amber-500/40 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{concept.conceptName}</span>
                          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] font-mono">
                            {concept.reason === "level3_failed" ? "Level-3 Walkthrough Revisit" : "Remedial Concept Fix"}
                          </span>
                        </div>
                        <p className="text-emerald-400/80 text-[11px] mt-0.5">
                          Topic: <span className="text-teal-300">{concept.topicName}</span> • Tagged: {new Date(concept.dateAdded).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleResolve(concept.id)}
                        className="px-3 py-1.5 rounded-lg bg-[#c4f500] text-slate-900 font-bold text-xs hover:bg-[#d5ff2e] transition-colors flex items-center gap-1 shrink-0 cursor-pointer shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Mark Mastered</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {resolvedParked.length > 0 && (
                <div className="space-y-2 pt-4 border-t border-emerald-800/40">
                  <h3 className="font-bold text-emerald-400/70 uppercase tracking-wider text-[10px]">
                    Previously Resolved Concepts ({resolvedParked.length})
                  </h3>
                  {resolvedParked.map((concept) => (
                    <div key={concept.id} className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-900/40 flex items-center justify-between opacity-60">
                      <span className="line-through text-emerald-300">{concept.conceptName}</span>
                      <span className="text-[10px] text-emerald-500">Mastered ✓</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TOPIC HISTORY & CONFIDENCE */}
          {activeTab === "history" && (
            <div className="space-y-3">
              <h3 className="font-bold text-emerald-200 uppercase tracking-wider text-[10px]">
                Studied Topics & Mastery Ratings
              </h3>
              {profile.topicHistory.length === 0 ? (
                <p className="text-center text-emerald-400/60 p-6">No session history recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {profile.topicHistory.map((topic, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-[#091f1a] border border-emerald-800/40 flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-white">{topic.topicName}</h4>
                        <p className="text-[10px] text-emerald-400/70">
                          Last studied: {new Date(topic.lastStudied).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-xs font-bold text-emerald-300">Confidence</span>
                          <span className="block text-sm font-black text-[#c4f500]">{topic.confidenceScore}/10</span>
                        </div>
                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                          topic.status === "completed" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        }`}>
                          {topic.status === "completed" ? "Mastered 🎓" : "Revisit Needed 📌"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DPDP ACT 2023 PRIVACY & MINOR DATA SAFETY */}
          {activeTab === "privacy" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-500/30 space-y-3">
                <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                  <ShieldCheck className="w-5 h-5 text-[#c4f500]" />
                  <span>India DPDP Act 2023 & K-12 Minor Data Protection Governance</span>
                </div>
                <ul className="space-y-2 text-emerald-200/90 text-xs list-disc pl-5">
                  <li>
                    <strong>Minor Voice & Session Safety:</strong> All live microphone audio streams are processed in-memory during real-time synthesis and are never sold or repurposed for model training.
                  </li>
                  <li>
                    <strong>Local Data Sovereignty:</strong> Your weak topic lists, study progress, and blackboard notes are stored securely on your device via browser local storage.
                  </li>
                  <li>
                    <strong>Parental & Data Consent:</strong> Parental consent is verified for K-12 students under 18 years of age. You maintain the absolute right to wipe your data at any time.
                  </li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-[#091f1a] border border-emerald-800/40 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white">Reset Local Learner Profile Memory</h4>
                  <p className="text-[11px] text-emerald-400/80">
                    Completely clear stored topic histories, parked concepts, and local profile metrics.
                  </p>
                </div>
                <button
                  onClick={handleClearMemory}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Memory</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: LEARNER PROFILE SETTINGS */}
          {activeTab === "settings" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-emerald-300 mb-1">Student Name</label>
                  <input
                    type="text"
                    value={profile.studentName}
                    onChange={(e) => setProfile({ ...profile, studentName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#061511] border border-emerald-800/60 text-white focus:outline-none focus:border-[#c4f500]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-emerald-300 mb-1">Target Exam</label>
                  <select
                    value={profile.targetExam}
                    onChange={(e) => setProfile({ ...profile, targetExam: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg bg-[#061511] border border-emerald-800/60 text-white focus:outline-none focus:border-[#c4f500]"
                  >
                    <option value="JEE">JEE Main & Advanced</option>
                    <option value="NEET">NEET UG</option>
                    <option value="CBSE Board">CBSE Board Exam</option>
                    <option value="State Board">State Board Exam</option>
                    <option value="Foundation">Class 8-10 Foundation</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-emerald-300 mb-1">Preferred Spoken Dialect</label>
                  <select
                    value={profile.preferredLanguage}
                    onChange={(e) => setProfile({ ...profile, preferredLanguage: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg bg-[#061511] border border-emerald-800/60 text-white focus:outline-none focus:border-[#c4f500]"
                  >
                    <option value="Hinglish">Hinglish (Hindi + English Mix)</option>
                    <option value="Tanglish">Tanglish (Tamil + English Mix)</option>
                    <option value="Benglish">Benglish (Bengali + English Mix)</option>
                    <option value="English">Indian English</option>
                    <option value="Hindi">Pure Hindi</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-emerald-300 mb-1">Grade Level</label>
                  <input
                    type="text"
                    value={profile.gradeLevel}
                    onChange={(e) => setProfile({ ...profile, gradeLevel: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#061511] border border-emerald-800/60 text-white focus:outline-none focus:border-[#c4f500]"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-emerald-800/40 flex justify-end">
                <button
                  onClick={() => handleSaveSettings(profile)}
                  className="px-4 py-2 rounded-xl bg-[#c4f500] hover:bg-[#d5ff2e] text-slate-900 font-extrabold flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Save Preferences</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
