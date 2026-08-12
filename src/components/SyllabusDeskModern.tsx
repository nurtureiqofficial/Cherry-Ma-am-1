import React, { useState, useEffect } from "react";
import { 
  ArrowLeft, User, Sparkles, CheckCircle, Upload, RefreshCw, Youtube, Video, FileText,
  ChevronRight, GraduationCap, BookOpen, Clock, History, Play, Check, Flame, HelpCircle
} from "lucide-react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { HomeworkMaker } from "./HomeworkMaker";

interface SyllabusDeskModernProps {
  studentDetails: {
    name: string;
    grade: string;
    subject: string;
    board?: string;
    mediumOfLearning?: string;
  };
  setStudentDetails: React.Dispatch<React.SetStateAction<any>>;
  activeDocument: any;
  setActiveDocument: React.Dispatch<React.SetStateAction<any>>;
  uploadMode: "explain" | "mistake" | "homework";
  setUploadMode: (mode: "explain" | "mistake" | "homework") => void;
  youtubeUrl: string;
  setYoutubeUrl: (url: string) => void;
  isYoutubeLoading: boolean;
  setIsYoutubeLoading: (loading: boolean) => void;
  isUploading: boolean;
  handleFileUpload: (file: File) => void;
  setCurrentScreen: (screen: "home" | "syllabus" | "classroom") => void;
  setShowStudentAccountHub: (show: boolean) => void;
  addToast: (msg: string, type: "success" | "error" | "info") => void;
  auth: any;
  db: any;
  user: any;
  setUser: React.Dispatch<React.SetStateAction<any>>;
  setSessionId: React.Dispatch<React.SetStateAction<any>>;
  setDialogueHistory: React.Dispatch<React.SetStateAction<any>>;
  setCustomBoardContent: React.Dispatch<React.SetStateAction<any>>;
  setTopicBoardsContent: React.Dispatch<React.SetStateAction<any>>;
  setPastSessions: React.Dispatch<React.SetStateAction<any>>;
  loadPastSessions: (uid: string) => void;
  disconnect: () => void;
  setUploadedButWaitingWakeup: React.Dispatch<React.SetStateAction<any>>;
  setActiveTopicIndex: React.Dispatch<React.SetStateAction<any>>;
  extractYoutubeId: (url: string) => string | null;
  pastSessions?: any[];
  handleLoadPastSession?: (sess: any) => void;
}

export const SyllabusDeskModern: React.FC<SyllabusDeskModernProps> = ({
  studentDetails,
  setStudentDetails,
  activeDocument,
  setActiveDocument,
  uploadMode,
  setUploadMode,
  youtubeUrl,
  setYoutubeUrl,
  isYoutubeLoading,
  setIsYoutubeLoading,
  isUploading,
  handleFileUpload,
  setCurrentScreen,
  setShowStudentAccountHub,
  addToast,
  auth,
  db,
  user,
  setUser,
  setSessionId,
  setDialogueHistory,
  setCustomBoardContent,
  setTopicBoardsContent,
  setPastSessions,
  loadPastSessions,
  disconnect,
  setUploadedButWaitingWakeup,
  setActiveTopicIndex,
  extractYoutubeId,
  pastSessions = [],
  handleLoadPastSession,
}) => {
  // Local state for interactive UI micro-tabs inside content cards
  const [contentTab, setContentTab] = useState<"upload" | "youtube">("upload");
  const [showTopicPrompt, setShowTopicPrompt] = useState(false);
  const [typedTopic, setTypedTopic] = useState("");

  const handleStartDirectStudy = async () => {
    if (!typedTopic.trim()) return;
    const topicTitle = typedTopic.trim();
    setShowTopicPrompt(false);

    let currentUser = auth.currentUser || user;
    if (!currentUser) {
      try {
        const anonResult = await signInAnonymously(auth);
        currentUser = anonResult.user;
      } catch (err) {
        console.warn("Anonymous sign-in failed during direct study, using local guest fallback:", err);
        currentUser = {
          uid: "local_guest_student",
          displayName: studentDetails.name || "Guest Student",
          isAnonymous: true,
        } as any;
        setUser(currentUser);
        localStorage.setItem("local_active_user", JSON.stringify(currentUser));
      }
    }

    // Smart Subject Auto-Detection!
    let finalSubject = studentDetails.subject || "Mathematics";
    const titleLower = topicTitle.toLowerCase();
    
    // Physics keywords
    const physicsTerms = ["force", "motion", "gravity", "gravitation", "sound", "light", "wave", "optics", "thermo", "electric", "magnet", "energy", "velocity", "acceleration", "friction", "newton", "einstein", "speed", "lens", "mirror", "heat", "current", "voltage", "resistance", "ohm", "circuit", "pressure", "work", "power", "density", "physics", "भौतिक"];
    // Chemistry keywords
    const chemistryTerms = ["chemical", "reaction", "bond", "atom", "molecule", "element", "acid", "base", "salt", "organic", "polymer", "catalyst", "electron", "proton", "neutron", "gas", "matter", "periodic", "metal", "non-metal", "carbon", "compound", "chemistry", "रसायन"];
    // Mathematics keywords
    const mathTerms = ["math", "fraction", "algebra", "calculus", "geometry", "trigonometry", "ratio", "number", "sum", "multiply", "divide", "theorem", "matrix", "vector", "percent", "probability", "statistics", "integral", "derivative", "equation", "arithmetic", "triangle", "circle", "square", "rectangle", "polygon", "graph", "coordinate", "angle", "division", "multiplication", "addition", "subtraction", "decimal", "integer", "rational", "irrational", "set theory", "function", "quadrilat", "polynomial", "quadratic", "linear", "ap", "arithmetic progression", "gp", "geometric progression", "logarithm", "sine", "cosine", "tangent", "secant", "cosecant", "cotangent", "derivative", "differentiation", "integration", "mathematics", "गणित"];
    // Biology / Science keywords
    const scienceTerms = ["science", "cell", "plant", "animal", "human", "digestion", "evolution", "organism", "biology", "photosynthesis", "respiration", "reproduction", "heredity", "tissue", "disease", "health", "ecology", "environment", "neuron", "brain", "heart", "kidney", "lung", "blood", "gene", "chromosome", "dna", "rna", "virus", "bacteria", "fungus", "nutrition", "hormone", "enzyme", "ecosystem", "science", "विज्ञान"];

    let detectedSubject = null;
    if (physicsTerms.some(term => titleLower.includes(term))) {
      detectedSubject = "Physics";
    } else if (chemistryTerms.some(term => titleLower.includes(term))) {
      detectedSubject = "Chemistry";
    } else if (mathTerms.some(term => titleLower.includes(term))) {
      detectedSubject = "Mathematics";
    } else if (scienceTerms.some(term => titleLower.includes(term))) {
      detectedSubject = "All Science";
    }

    if (detectedSubject && detectedSubject !== studentDetails.subject) {
      // If current subject is "All Science" and grade is 10th or below, keep "All Science" since it's an integrated course!
      const isJuniorOrSecondary = ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10"].includes(studentDetails.grade || "");
      if (studentDetails.subject === "All Science" && isJuniorOrSecondary && (detectedSubject === "Physics" || detectedSubject === "Chemistry" || detectedSubject === "Biology")) {
        console.log(`Preserving "All Science" for integrated grade ${studentDetails.grade}`);
        detectedSubject = "All Science";
      }
    }

    if (detectedSubject && detectedSubject !== studentDetails.subject) {
      finalSubject = detectedSubject;
      setStudentDetails((prev: any) => ({ ...prev, subject: detectedSubject }));
      addToast(`Aha! Identified "${topicTitle}" as a ${detectedSubject} topic. Automatically matching your subject selection! ✨`, "info");
      
      if (currentUser && !currentUser.isAnonymous) {
        const profileRef = doc(db, "studentProfiles", currentUser.uid);
        setDoc(profileRef, { subject: detectedSubject }, { merge: true })
          .catch((e) => console.warn("Could not sync subject:", e));
      }
    }

    const newSessionId = "session_" + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    setSessionId(newSessionId);
    setDialogueHistory([]);
    setCustomBoardContent("");
    setTopicBoardsContent({});

    // Create a beautifully structured custom syllabus markdown for the typed topic so Cherry lectures on it perfectly!
    const syntheticDoc = {
      filename: `${topicTitle}.md`,
      mimeType: "text/markdown",
      markdown: `# 1. Introduction to ${topicTitle}\nWelcome! Let's build a rock-solid foundation for "${topicTitle}". In this introductory slide, we'll discover the primary core essence, significance, and fundamental roadmap of our topic. Let's make learning super engaging!\n\n# 2. Core Concepts & Definitions of ${topicTitle}\nLet's look at the key concepts, core formulas, essential rules, and definitions of "${topicTitle}". Please note down these formulas and definitions carefully on your blackboard!\n\n# 3. Practical Example & Solved Problems\nLet's solve a real-world numerical or conceptual problem step-by-step to see "${topicTitle}" in action. This will help us master the practical applications!\n\n# 4. Interactive Quiz & Doubts Session\nIt's time to test your understanding! Let's clear any doubts and make sure you have understood "${topicTitle}" completely. Ask any questions you have!`
    };
    setActiveDocument(syntheticDoc);
    setActiveTopicIndex(0);
    setCurrentScreen("classroom");

    if (currentUser) {
      const newSessionObj = {
        sessionId: newSessionId,
        userId: currentUser.uid,
        grade: studentDetails.grade,
        subject: finalSubject,
        activeDocumentName: syntheticDoc.filename,
        customBoardContent: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const cachedKey = `pastSessions_${currentUser.uid}`;
      const cachedStr = localStorage.getItem(cachedKey);
      let sessions = [];
      if (cachedStr) {
        try { sessions = JSON.parse(cachedStr); } catch (_) {}
      }
      sessions = [newSessionObj, ...sessions.filter((s: any) => s.sessionId !== newSessionId)];
      localStorage.setItem(cachedKey, JSON.stringify(sessions));
      setPastSessions(sessions);

      if (currentUser.uid !== "local_guest_student" && !currentUser.uid.startsWith("local_")) {
        const sessionRef = doc(db, "classSessions", newSessionId);
        setDoc(sessionRef, {
          sessionId: newSessionId,
          userId: currentUser.uid,
          grade: studentDetails.grade,
          subject: finalSubject,
          activeDocumentName: syntheticDoc.filename,
          customBoardContent: "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }).then(() => {
          loadPastSessions(currentUser!.uid);
        }).catch((dbErr) => {
          console.warn("Could not sync session in background:", dbErr);
        });
      }
    }
    addToast(`Starting Blackboard Lecture on: ${topicTitle}! 🖊️🎨`, "success");
  };

  // Load past sessions locally as fallback if needed
  useEffect(() => {
    if (user && user.uid) {
      loadPastSessions(user.uid);
    }
  }, [user, loadPastSessions]);

  return (
    <div className="flex-1 flex flex-col justify-between z-10 w-full px-4 py-4 md:px-6 select-none bg-[#f8fafc] overflow-y-auto max-h-[100dvh] font-sans text-slate-800 antialiased" id="premium-study-desk-root">
      
      {/* =========================================
          PREMIUM APP HEADER BAR
          ========================================= */}
      <div className="flex items-center justify-between pb-3 mb-4 shrink-0 border-b border-slate-200/80">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-[#0a3641]" />
          <span className="text-[12px] font-sans font-black uppercase tracking-widest text-[#0a3641]">Study Desk</span>
        </div>

        {/* Premium Profile Badge */}
        <button
          onClick={() => setShowStudentAccountHub(true)}
          className="flex items-center gap-2 p-1 px-3 bg-white border border-slate-200 hover:border-slate-300 rounded-2xl cursor-pointer active:scale-95 transition-all shadow-2xs text-left"
          id="profile-passport-trigger"
        >
          <div className="w-6 h-6 rounded-xl bg-[#0a3641] text-white flex items-center justify-center font-bold text-xs">
            {studentDetails.name ? studentDetails.name.charAt(0).toUpperCase() : <User className="w-3 h-3" />}
          </div>
          <div className="hidden xs:flex flex-col min-w-0 max-w-[120px]">
            <p className="text-[10px] font-black truncate leading-none text-slate-800">
              {studentDetails.name || "My Profile"}
            </p>
            <p className="text-[8px] font-mono text-slate-400 font-bold tracking-wide mt-0.5 uppercase">
              {studentDetails.board || "CBSE"} • {studentDetails.mediumOfLearning || "Hinglish"}
            </p>
          </div>
          <span className="text-[8px] bg-[#c4f500]/25 text-[#0a3641] px-1.5 py-0.5 rounded-lg font-mono font-black border border-[#0a3641]/10">
            {studentDetails.grade}
          </span>
        </button>
      </div>

      {/* =========================================
          MAIN WORKSPACE LAYOUT
          ========================================= */}
      <div className="space-y-4 flex-1 flex flex-col justify-start overflow-y-auto pr-0.5 pb-4">
        
        {/* PREMIUM VISUAL PASSPORT / WELCOME BANNER */}
        <div className="bg-gradient-to-br from-[#0a3641] via-[#0d4756] to-[#12596b] text-white p-5 rounded-[28px] text-left relative overflow-hidden shadow-[0_10px_25px_rgba(10,54,65,0.15)] shrink-0 border border-white/5">
          {/* Glowing ambient blobs */}
          <div className="absolute -right-8 -bottom-8 w-28 h-28 bg-gradient-to-tr from-[#c4f500] to-emerald-400 opacity-20 blur-2xl rounded-full animate-pulse" />
          <div className="absolute -left-6 -top-6 w-20 h-20 bg-white opacity-5 blur-xl rounded-full" />
          
          <div className="flex justify-between items-start relative z-10">
            <div>
              <span className="inline-flex items-center gap-1 text-[8.5px] bg-white/10 backdrop-blur-md text-[#c4f500] border border-white/10 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider font-mono">
                <Sparkles className="w-3 h-3 text-[#c4f500]" /> Active Study Room
              </span>
              <h3 className="text-base font-black mt-2 tracking-tight leading-none text-white">
                Namaste, {studentDetails.name || "Student"}! 👋
              </h3>
              <p className="text-[10px] text-teal-100/90 mt-1.5 leading-relaxed font-semibold max-w-[280px]">
                Welcome to your interactive study room! Choose a subject, upload homework notes or paste a YouTube lecture below.
              </p>
            </div>
            
            {/* Animated Learning Streak */}
            <div className="flex flex-col items-center bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-2 shrink-0 shadow-sm">
              <Flame className="w-5 h-5 text-[#c4f500] animate-bounce" />
              <span className="text-[10px] font-black mt-1">1 Day</span>
              <span className="text-[6.5px] font-mono text-teal-200/90 uppercase font-bold tracking-wider leading-none">Streak</span>
            </div>
          </div>
          
          {/* Quick learning passport details */}
          <div className="mt-4 pt-3.5 border-t border-white/10 flex items-center justify-between relative z-10 text-[9px] font-mono">
            <div className="flex gap-1.5">
              <span className="bg-white/10 backdrop-blur-md px-2.5 py-1 rounded-xl border border-white/5 flex items-center gap-1 font-bold">
                <GraduationCap className="w-3.5 h-3.5 text-[#c4f500]" /> {studentDetails.grade}
              </span>
              <span className="bg-white/10 backdrop-blur-md px-2.5 py-1 rounded-xl border border-white/5 flex items-center gap-1 font-bold">
                <BookOpen className="w-3.5 h-3.5 text-[#c4f500]" /> {studentDetails.subject}
              </span>
            </div>
            
            <span className="text-teal-200 font-bold uppercase tracking-widest text-[8px] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> System Live
            </span>
          </div>
        </div>

        {/* =========================================
            STEP 1: CHOOSE SUBJECT (BENTO GRID DESIGN)
            ========================================= */}
        <div className="bg-white border border-slate-200/80 rounded-[28px] p-4 shadow-xs text-left space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-mono font-black uppercase text-[#0a3641] tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#c4f500]" /> Personalized Subjects / विषय चुनें
            </h4>
            <span className="text-[8px] bg-slate-100 text-[#486a73] font-mono font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Step 1 of 2</span>
          </div>

          {/* Personalized Curriculum Header Indicator Badge */}
          <div className="flex items-center justify-between bg-slate-50 border border-slate-100/80 rounded-2xl px-3 py-2 text-[10px] text-slate-700">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[8px] font-bold bg-[#0a3641]/10 text-[#0a3641] px-2 py-0.5 rounded-lg border border-[#0a3641]/15 font-mono uppercase">
                🏛️ {studentDetails.board || "CBSE"}
              </span>
              <span className="text-[8px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-lg border border-emerald-200 font-mono">
                🎓 {studentDetails.grade || "Class 10"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowStudentAccountHub(true)}
              className="text-[9px] font-black text-teal-700 hover:text-teal-900 underline transition-all font-mono shrink-0 cursor-pointer"
            >
              Change / बदलें ✏️
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            {(() => {
              const isSeniorSecondary = 
                studentDetails.grade === "Class 11" || 
                studentDetails.grade === "Class 12" || 
                studentDetails.grade === "JEE/NEET Prep" || 
                studentDetails.grade === "College Level";

              const isMiddleSchool = 
                studentDetails.grade === "Class 6" || 
                studentDetails.grade === "Class 7" || 
                studentDetails.grade === "Class 8";

              const curBoard = studentDetails.board || "CBSE";

              // Dynamic curriculum-aligned subject listing
              let defaultSubjects: string[] = [];

              if (isSeniorSecondary) {
                // Class 11, 12, JEE/NEET, College Level
                if (curBoard === "ICSE" || curBoard === "ISC") {
                  defaultSubjects = ["Physics", "Chemistry", "Biology", "Mathematics", "Computer Science", "English"];
                } else if (curBoard === "CBSE") {
                  defaultSubjects = ["Physics", "Chemistry", "Biology", "Mathematics", "Computer Science", "Economics", "English"];
                } else {
                  // State Boards (Bihar, Jharkhand, West Bengal, Odisha, etc.)
                  defaultSubjects = ["Physics", "Chemistry", "Biology", "Mathematics", "Computer Science", "English"];
                }
              } else if (isMiddleSchool) {
                // Class 6, 7, 8
                if (curBoard === "ICSE") {
                  // ICSE has separate Physics, Chemistry, Biology, and Computer Applications early in Middle School
                  defaultSubjects = ["Mathematics", "Physics", "Chemistry", "Biology", "Computer Applications", "English"];
                } else if (curBoard === "CBSE") {
                  defaultSubjects = ["Mathematics", "All Science", "Social Science", "Environmental Studies", "English"];
                } else {
                  // State Boards
                  defaultSubjects = ["Mathematics", "All Science", "Social Science", "English"];
                }
              } else {
                // Class 9 & 10 (Secondary School)
                if (curBoard === "ICSE") {
                  defaultSubjects = ["Physics", "Chemistry", "Biology", "Mathematics", "Computer Applications", "English"];
                } else if (curBoard === "CBSE") {
                  // CBSE uses Integrated Science but separated for targeted prep, plus Math and Social Science
                  defaultSubjects = ["Mathematics", "All Science", "Physics", "Chemistry", "Biology", "Social Science", "English"];
                } else {
                  // State Boards (Bihar, Jharkhand, West Bengal, Odisha, etc.)
                  defaultSubjects = ["Mathematics", "All Science", "Social Science", "English"];
                }
              }

              const dynamicSubjects = [...defaultSubjects];
              const detected = activeDocument?.detectedSubject;
              if (detected && !dynamicSubjects.includes(detected)) {
                dynamicSubjects.push(detected);
              }
              if (studentDetails.subject && !dynamicSubjects.includes(studentDetails.subject)) {
                dynamicSubjects.push(studentDetails.subject);
              }
              
              return dynamicSubjects.map((subj) => {
                let translation = "विशेष विषय";
                let activeStyle = "bg-teal-500/10 border-teal-500 text-teal-950 shadow-xs ring-2 ring-teal-500/10";
                let hoverStyle = "hover:bg-teal-500/5 hover:border-teal-300";
                let subjectIcon = "📚";
  
                if (subj === "Mathematics") {
                  translation = "गणित (📐)";
                  hoverStyle = "hover:bg-amber-500/5 hover:border-amber-300";
                  activeStyle = "bg-amber-500/10 border-amber-500 text-amber-950 shadow-xs ring-2 ring-amber-500/10";
                  subjectIcon = "📐";
                } else if (subj === "Physics") {
                  translation = "भौतिकी (⚛️)";
                  hoverStyle = "hover:bg-blue-500/5 hover:border-blue-300";
                  activeStyle = "bg-blue-500/10 border-blue-500 text-blue-950 shadow-xs ring-2 ring-blue-500/10";
                  subjectIcon = "⚛️";
                } else if (subj === "Chemistry") {
                  translation = "रसायन (🧪)";
                  hoverStyle = "hover:bg-purple-500/5 hover:border-purple-300";
                  activeStyle = "bg-purple-500/10 border-purple-500 text-purple-950 shadow-xs ring-2 ring-purple-500/10";
                  subjectIcon = "🧪";
                } else if (subj === "Biology") {
                  translation = "जीव विज्ञान (🌿)";
                  hoverStyle = "hover:bg-emerald-500/5 hover:border-emerald-300";
                  activeStyle = "bg-emerald-500/10 border-emerald-500 text-emerald-950 shadow-xs ring-2 ring-emerald-500/10";
                  subjectIcon = "🌿";
                } else if (subj === "All Science") {
                  translation = "विज्ञान (🔬)";
                  hoverStyle = "hover:bg-teal-500/5 hover:border-teal-300";
                  activeStyle = "bg-teal-500/10 border-teal-500 text-teal-950 shadow-xs ring-2 ring-teal-500/10";
                  subjectIcon = "🔬";
                } else if (subj === "Computer Science" || subj === "Computer Applications") {
                  translation = "कंप्यूटर (💻)";
                  hoverStyle = "hover:bg-indigo-500/5 hover:border-indigo-300";
                  activeStyle = "bg-indigo-500/10 border-indigo-500 text-indigo-950 shadow-xs ring-2 ring-indigo-500/10";
                  subjectIcon = "💻";
                } else if (subj === "Economics") {
                  translation = "अर्थशास्त्र (📊)";
                  hoverStyle = "hover:bg-rose-500/5 hover:border-rose-300";
                  activeStyle = "bg-rose-500/10 border-rose-500 text-rose-950 shadow-xs ring-2 ring-rose-500/10";
                  subjectIcon = "📊";
                } else if (subj === "Social Science") {
                  translation = "सामाजिक विज्ञान (🌍)";
                  hoverStyle = "hover:bg-red-500/5 hover:border-red-300";
                  activeStyle = "bg-red-500/10 border-red-500 text-red-950 shadow-xs ring-2 ring-red-500/10";
                  subjectIcon = "🌍";
                } else if (subj === "Environmental Studies") {
                  translation = "पर्यावरण अध्ययन (🌱)";
                  hoverStyle = "hover:bg-lime-500/5 hover:border-lime-300";
                  activeStyle = "bg-lime-500/10 border-lime-500 text-lime-950 shadow-xs ring-2 ring-lime-500/10";
                  subjectIcon = "🌱";
                } else if (subj === "English") {
                  translation = "अंग्रेजी (📝)";
                  hoverStyle = "hover:bg-sky-500/5 hover:border-sky-300";
                  activeStyle = "bg-sky-500/10 border-sky-500 text-sky-950 shadow-xs ring-2 ring-sky-500/10";
                  subjectIcon = "📝";
                }

                const isAutoDetected = !defaultSubjects.includes(subj);
                if (isAutoDetected) {
                  hoverStyle = "hover:bg-teal-500/5 hover:border-teal-300";
                  activeStyle = "bg-[#c4f500]/15 border-teal-500 text-teal-950 shadow-xs ring-2 ring-teal-500/10";
                  subjectIcon = "✨";
                }

                const isActive = studentDetails.subject === subj;

                return (
                  <button
                    key={subj}
                    type="button"
                    onClick={async () => {
                      setStudentDetails((prev: any) => ({ ...prev, subject: subj }));
                      const currentUser = auth.currentUser;
                      if (currentUser && !currentUser.isAnonymous) {
                        const profileRef = doc(db, "studentProfiles", currentUser.uid);
                        setDoc(profileRef, { subject: subj }, { merge: true })
                          .catch((e) => console.warn("Could not sync subject:", e));
                      }
                      addToast(`Subject set to ${subj}! 📚`, "success");
                    }}
                    className={`p-2.5 border rounded-2xl transition-all duration-300 font-bold cursor-pointer flex items-center gap-2 text-left leading-tight active:scale-95 ${
                      isActive ? activeStyle : `bg-slate-50/50 border-slate-200/60 text-slate-600 ${hoverStyle}`
                    }`}
                  >
                    <span className="text-base shrink-0">{subjectIcon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black truncate text-slate-800 flex items-center gap-1 leading-none">
                        {subj}
                        {isAutoDetected && (
                          <Sparkles className="w-2.5 h-2.5 text-teal-600 animate-pulse" />
                        )}
                      </p>
                      <p className="text-[8px] font-mono text-slate-400 mt-1 leading-none">
                        {translation}
                      </p>
                    </div>
                  </button>
                );
              });
            })()}
          </div>
        </div>

        {/* =========================================
            STEP 2: CHOOSE LEARNING MODE
            ========================================= */}
        <div className="bg-white border border-slate-200/80 rounded-[28px] p-4 shadow-xs text-left space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-mono font-black uppercase text-[#0a3641] tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#c4f500]" /> Choose Learning Mode / मोड चुनें
            </h4>
            <span className="text-[8px] bg-slate-100 text-[#486a73] font-mono font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Step 2 of 2</span>
          </div>

          {/* Premium Horizontal Segmented Grid */}
          <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-slate-100/90 rounded-[22px] border border-slate-200/80 shadow-inner">
            <button
              type="button"
              onClick={() => {
                setUploadMode("explain");
                addToast("Mode set: Continuous Lecture Teaching! 📖", "info");
              }}
              className={`py-2.5 px-1.5 sm:px-3 rounded-2xl flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 transition-all duration-300 cursor-pointer text-center select-none ${
                uploadMode === "explain"
                  ? "bg-white text-[#0a3641] shadow-md border border-slate-200/90 ring-2 ring-[#0a3641]/10 font-black scale-[1.02]"
                  : "bg-white/40 text-slate-600 hover:bg-white/80 hover:text-slate-900 border border-transparent font-semibold"
              }`}
            >
              <span className="text-sm sm:text-base">📖</span>
              <span className="text-[10px] sm:text-xs tracking-tight leading-tight">Course Syllabus</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setUploadMode("mistake");
                addToast("Mode set: Find & Explain My Mistake! 🔍", "info");
              }}
              className={`py-2.5 px-1.5 sm:px-3 rounded-2xl flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 transition-all duration-300 cursor-pointer text-center select-none ${
                uploadMode === "mistake"
                  ? "bg-white text-[#0a3641] shadow-md border border-slate-200/90 ring-2 ring-[#0a3641]/10 font-black scale-[1.02]"
                  : "bg-white/40 text-slate-600 hover:bg-white/80 hover:text-slate-900 border border-transparent font-semibold"
              }`}
            >
              <span className="text-sm sm:text-base">🔍</span>
              <span className="text-[10px] sm:text-xs tracking-tight leading-tight">Find My Mistake</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setUploadMode("homework");
                addToast("Mode set: Home Work Maker! 📝", "info");
              }}
              className={`py-2.5 px-1.5 sm:px-3 rounded-2xl flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 transition-all duration-300 cursor-pointer text-center select-none ${
                uploadMode === "homework"
                  ? "bg-gradient-to-br from-[#0a3641] to-teal-950 text-[#c4f500] shadow-md border border-teal-800 ring-2 ring-teal-500/20 font-black scale-[1.02]"
                  : "bg-white/40 text-slate-600 hover:bg-white/80 hover:text-slate-900 border border-transparent font-semibold"
              }`}
            >
              <span className="text-sm sm:text-base">📝</span>
              <span className="text-[10px] sm:text-xs tracking-tight leading-tight">Home Work Maker</span>
            </button>
          </div>

          {/* Description of Selected Mode */}
          <div className="px-1.5 py-1 text-[9.5px] leading-relaxed text-slate-500">
            {uploadMode === "explain" ? (
              <p>
                <strong className="text-[#0a3641]">Continuous Course Mode:</strong> Cherry Ma'am acts as a supportive school teacher, walking through notes sequentially, and writing math/science steps on the board.
              </p>
            ) : uploadMode === "mistake" ? (
              <p>
                <strong className="text-[#0a3641]">Calculations Scan Mode:</strong> Designed to debug math questions or homework sheets. Upload a page photo; Cherry isolates incorrect steps and draws correct solutions!
              </p>
            ) : (
              <p>
                <strong className="text-[#0a3641]">Home Work Maker Mode:</strong> Dedicated Chat Box UI for school homework across all subjects! Generates text, step-by-step formulas, & diagrams without launching live voice or blackboard.
              </p>
            )}
          </div>
        </div>

        {/* =========================================
            CONTENT SOURCE CONTAINER (UPLOAD, YOUTUBE DECK, OR HOMEWORK MAKER)
            ========================================= */}
        {uploadMode === "homework" ? (
          <div className="bg-white border border-slate-200/80 rounded-[28px] p-0 shadow-md text-left h-[calc(100vh-140px)] min-h-[580px] max-h-[920px] flex flex-col overflow-hidden">
            <HomeworkMaker
              studentName={studentDetails.name}
              grade={studentDetails.grade}
              subject={studentDetails.subject}
              board={studentDetails.board}
              mediumOfLearning={studentDetails.mediumOfLearning}
              addToast={addToast}
            />
          </div>
        ) : (
          <div className="bg-white border border-slate-200/80 rounded-[28px] p-4 shadow-xs text-left space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <h4 className="text-xs font-mono font-bold uppercase text-[#0a3641] tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#008069] animate-pulse" />
                <span>Content Source / अध्ययन सामग्री</span>
              </h4>

              {uploadMode === "explain" && (
                <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 shadow-2xs gap-1">
                  <button
                    type="button"
                    onClick={() => setContentTab("upload")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                      contentTab === "upload"
                        ? "bg-white text-[#0a3641] shadow-xs border border-slate-200/80 ring-1 ring-slate-900/5 font-extrabold"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/60 font-semibold"
                    }`}
                  >
                    <FileText className={`w-3.5 h-3.5 ${contentTab === "upload" ? "text-[#008069]" : "text-slate-500"}`} />
                    <span>Document</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setContentTab("youtube")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                      contentTab === "youtube"
                        ? "bg-red-600 text-white shadow-xs border border-red-700/20 ring-1 ring-red-500/20 font-extrabold"
                        : "bg-red-50/90 text-red-600 hover:bg-red-100/90 hover:text-red-700 font-bold border border-red-200/60"
                    }`}
                  >
                    <Youtube className={`w-3.5 h-3.5 ${contentTab === "youtube" ? "text-white" : "text-red-600"}`} />
                    <span>YouTube</span>
                  </button>
                </div>
              )}
            </div>

          {/* Tab 1: Upload Documents */}
          {(uploadMode === "mistake" || contentTab === "upload") && (
            <div className="space-y-3">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileUpload(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => document.getElementById("file-syllabus-upload-modern")?.click()}
                className="border-2 border-dashed border-slate-200 hover:border-[#0a3641]/50 bg-slate-50/50 hover:bg-slate-50 rounded-2xl flex flex-col items-center justify-center text-center p-5 space-y-2.5 transition-all duration-300 cursor-pointer group min-h-[140px] active:scale-[0.99] relative overflow-hidden shadow-2xs"
              >
                <input
                  type="file"
                  id="file-syllabus-upload-modern"
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                />
                
                {isUploading ? (
                  <div className="space-y-2.5 flex flex-col items-center z-10">
                    <RefreshCw className="w-6 h-6 text-[#0a3641] animate-spin" />
                    <p className="text-[11px] font-mono font-bold text-[#0a3641] uppercase tracking-wider animate-pulse leading-none">
                      Analyzing Content...
                    </p>
                    <p className="text-[9px] text-slate-500 leading-normal max-w-[210px]">
                      {uploadMode === "mistake"
                        ? "Scanning calculation lines and math steps..."
                        : "Mapping index chapters & study units..."}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="p-3 rounded-2xl bg-white border border-slate-150 group-hover:scale-105 transition-transform shadow-3xs">
                      <Upload className="w-5 h-5 text-slate-400 group-hover:text-[#0a3641] transition-colors" />
                    </div>
                    <div className="space-y-1 z-10">
                      <p className="text-[11px] font-black text-slate-800 leading-snug">
                        {uploadMode === "mistake" 
                          ? "Upload Homework Sheet or Calculation Image" 
                          : "Upload Course Syllabus notes or PDF chapter"}
                      </p>
                      <p className="text-[8.5px] text-slate-400 max-w-[240px] mx-auto leading-normal font-medium">
                        Drag PDF, PNG, JPG files here or tap to select. Max size 3MB.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: YouTube Lecture URL */}
          {uploadMode === "explain" && contentTab === "youtube" && (
            <div className="bg-red-50/50 border border-red-100 rounded-2xl p-3.5 space-y-3 shadow-3xs text-left animate-fade-in">
              <div className="flex items-start gap-2.5">
                <div className="p-2 bg-red-600 rounded-xl text-white shrink-0 shadow-xs">
                  <Youtube className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-[#0a3641] uppercase tracking-wider flex items-center gap-1 leading-none">
                    Import YouTube Course Lecture
                  </p>
                  <p className="text-[8.5px] text-slate-500 font-medium leading-normal mt-1">
                    Cherry Ma'am reads the lecture, extracts sequential blackboard topics, and designs active slides!
                  </p>
                </div>
              </div>

              <div className="flex gap-1.5 items-center">
                <input
                  type="text"
                  placeholder="Paste YouTube class URL here"
                  value={youtubeUrl}
                  onChange={(e) => {
                    setYoutubeUrl(e.target.value);
                  }}
                  disabled={isYoutubeLoading}
                  className="flex-1 text-[11px] font-mono py-2 px-3 border border-red-150 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-200 bg-white rounded-xl transition-all shadow-3xs"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!youtubeUrl.trim()) {
                      addToast("Please enter a valid YouTube URL first! 🎥", "error");
                      return;
                    }
                    const vidId = extractYoutubeId(youtubeUrl);
                    if (!vidId) {
                      addToast("Could not recognize a valid YouTube Video ID! ❌", "error");
                      return;
                    }

                    const newSessionId = "session_yt_" + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
                    setSessionId(newSessionId);

                    setIsYoutubeLoading(true);
                    addToast("Initiating lecture content generation...", "info");
                    
                    const anim1 = setTimeout(() => addToast(`Analyzing YouTube Video...`, "info"), 1000);
                    const anim2 = setTimeout(() => addToast(`Designing customized study module...`, "info"), 2200);
                    
                    try {
                      const resYt = await fetch("/api/parse-youtube", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          youtubeUrl: youtubeUrl,
                          grade: studentDetails.grade || "Class 10",
                          board: studentDetails.board || "CBSE",
                          subject: studentDetails.subject || "Mathematics",
                          medium: studentDetails.mediumOfLearning || "Hinglish",
                          sessionId: newSessionId,
                        }),
                      });

                      clearTimeout(anim1);
                      clearTimeout(anim2);

                      if (!resYt.ok) {
                        const rawErrText = await resYt.text().catch(() => "");
                        let errorMsg = "Server could not generate curriculum";
                        if (rawErrText.trim().startsWith("{")) {
                          try {
                            const errData = JSON.parse(rawErrText);
                            errorMsg = errData.error || errorMsg;
                          } catch (_) {}
                        }
                        throw new Error(errorMsg);
                      }

                      const rawText = await resYt.text();
                      if (!rawText.trim().startsWith("{")) {
                        throw new Error("The YouTube parser received an invalid/empty response from the server.");
                      }
                      const result = JSON.parse(rawText);
                      setIsYoutubeLoading(false);
                      addToast("Success! Beautiful board curriculum generated! 🎉", "success");
                      
                      const finalSubj = result.detectedSubject || studentDetails.subject;
                      setStudentDetails((prev: any) => ({ ...prev, subject: finalSubj }));

                      disconnect();
                      setDialogueHistory([]);
                      setUploadedButWaitingWakeup(true);

                      const activeDocObj = {
                        filename: result.filename,
                        mimeType: "video/youtube",
                        markdown: result.markdown,
                        mode: "explain",
                        detectedSubject: result.detectedSubject,
                      };

                      setActiveDocument(activeDocObj);
                      setActiveTopicIndex(0);
                      
                      // Explicitly push active document to server session to guarantee sync
                      fetch("/api/active-document", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          sessionId: newSessionId,
                          activeDocument: activeDocObj
                        })
                      }).catch((e) => console.warn("Failed to sync YouTube active doc:", e));

                      setCurrentScreen("classroom");
                      
                      const syncYTSession = async () => {
                        let currentUser = auth.currentUser || user;
                        if (!currentUser) {
                          try {
                            const anonResult = await signInAnonymously(auth);
                            currentUser = anonResult.user;
                          } catch (err) {
                            console.warn("Anonymous login failed during YouTube sync, using guest fallback:", err);
                            currentUser = {
                              uid: "local_guest_student",
                              displayName: studentDetails.name || "Guest Student",
                              isAnonymous: true,
                            } as any;
                            setUser(currentUser);
                            localStorage.setItem("local_active_user", JSON.stringify(currentUser));
                          }
                        }
                        
                        if (currentUser) {
                          const newSessionObj = {
                            sessionId: newSessionId,
                            userId: currentUser.uid,
                            grade: studentDetails.grade,
                            subject: finalSubj,
                            activeDocumentName: result.filename,
                            customBoardContent: "",
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                          };

                          const cachedKey = `pastSessions_${currentUser.uid}`;
                          const cachedStr = localStorage.getItem(cachedKey);
                          let sessions = [];
                          if (cachedStr) {
                            try { sessions = JSON.parse(cachedStr); } catch (_) {}
                          }
                          sessions = [newSessionObj, ...sessions.filter((s: any) => s.sessionId !== newSessionId)];
                          localStorage.setItem(cachedKey, JSON.stringify(sessions));
                          setPastSessions(sessions);

                          if (currentUser.uid !== "local_guest_student" && !currentUser.uid.startsWith("local_")) {
                            const profileRef = doc(db, "studentProfiles", currentUser.uid);
                            setDoc(profileRef, { subject: finalSubj, updatedAt: serverTimestamp() }, { merge: true })
                              .catch(err => console.warn("Could not sync subject:", err));

                            const sessionRef = doc(db, "classSessions", newSessionId);
                            setDoc(sessionRef, {
                              sessionId: newSessionId,
                              userId: currentUser.uid,
                              grade: studentDetails.grade,
                              subject: finalSubj,
                              activeDocumentName: result.filename,
                              customBoardContent: "",
                              createdAt: serverTimestamp(),
                              updatedAt: serverTimestamp()
                            }).then(() => {
                              loadPastSessions(currentUser!.uid);
                            }).catch(() => {});
                          }
                        }
                      };
                      syncYTSession();
                    } catch (ytErr: any) {
                      clearTimeout(anim1);
                      clearTimeout(anim2);
                      setIsYoutubeLoading(false);
                      console.error("[YouTube Parser UI] Error:", ytErr);
                      addToast(`Failed to parse: ${ytErr.message || "Unknown error"}`, "error");
                    }
                  }}
                  disabled={isYoutubeLoading || !youtubeUrl.trim() || !extractYoutubeId(youtubeUrl)}
                  className={`px-4 py-2 rounded-xl border flex items-center justify-center gap-1 transition-all active:scale-95 duration-200 text-[10px] font-black shrink-0 uppercase tracking-wider ${
                    extractYoutubeId(youtubeUrl) && !isYoutubeLoading
                      ? "bg-red-600 hover:bg-red-700 text-white border-red-700 shadow-sm cursor-pointer"
                      : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  }`}
                >
                  {isYoutubeLoading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Video className="w-3.5 h-3.5" />
                  )}
                  <span>Import</span>
                </button>
              </div>

              {youtubeUrl.trim() && extractYoutubeId(youtubeUrl) && (
                <div className="border border-red-100 bg-white rounded-xl p-2.5 flex items-center gap-2.5 shadow-3xs animate-fade-in">
                  <div className="relative w-16 h-10 bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center shadow-xs">
                    <img
                      src={`https://img.youtube.com/vi/${extractYoutubeId(youtubeUrl)}/hqdefault.jpg`}
                      alt="Thumbnail preview"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="min-w-0 flex-1 leading-none">
                    <p className="text-[10px] font-black text-emerald-600 uppercase flex items-center gap-0.5 tracking-wide">
                      <CheckCircle className="w-3 h-3 text-emerald-500" /> Connected Successfully
                    </p>
                    <p className="text-[8.5px] text-slate-400 font-mono truncate mt-1">
                      ID: {extractYoutubeId(youtubeUrl)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        )}



        {/* =========================================
            DIRECT BLACKBOARD STUDY LAUNCHER
            ========================================= */}
        {uploadMode !== "homework" && (
          <button
            type="button"
            onClick={() => {
              setTypedTopic("");
              setShowTopicPrompt(true);
            }}
            className="w-full py-4 px-4 rounded-[24px] bg-gradient-to-r from-[#0a3641] to-[#154e5c] hover:from-[#114956] hover:to-[#1e5d6d] text-white flex items-center justify-center space-x-2 transition-all duration-300 text-xs font-black uppercase tracking-wider cursor-pointer shadow-[0_5px_15px_rgba(10,54,65,0.15)] active:scale-95 border border-white/5 relative overflow-hidden group"
            id="direct-study-launch-btn"
          >
            {/* Inner breathing animation glow */}
            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span>Direct Study: Live Blackboard 🖊️🎨</span>
            <ChevronRight className="w-4 h-4 text-[#c4f500] group-hover:translate-x-1 transition-transform" />
          </button>
        )}
      </div>



      {/* =========================================
          TOPIC PROMPT MODAL OVERLAY
          ========================================= */}
      {showTopicPrompt && (
        <div className="fixed inset-0 bg-[#04110e]/70 backdrop-blur-md z-[150] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-[28px] border border-slate-200/80 shadow-2xl w-full max-w-sm overflow-hidden animate-scale-up text-left">
            {/* Header */}
            <div className="bg-[#0a3641] px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#c4f500] animate-pulse" />
                <h3 className="text-xs font-black tracking-widest uppercase">Direct Lecture</h3>
              </div>
              <button 
                type="button"
                onClick={() => setShowTopicPrompt(false)} 
                className="text-white/70 hover:text-white hover:scale-110 transition-all text-sm font-bold cursor-pointer w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <p className="text-[9px] font-mono text-[#486a73] font-bold uppercase tracking-wider">Aap Kaunsa Topic Padhna Chahte Hain? 🖊️🎨</p>
                <p className="text-[11px] text-slate-500 leading-normal font-medium">
                  Type the topic you want to learn today. Cherry Ma'am will lecture on this topic with blackboard notes!
                </p>
              </div>
              
              <div>
                <input
                  type="text"
                  placeholder="e.g., Newton's Laws of Motion, Fractions, Sound..."
                  value={typedTopic}
                  onChange={(e) => setTypedTopic(e.target.value)}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0a3641]/20 focus:border-[#0a3641] font-semibold transition-all shadow-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && typedTopic.trim()) {
                      handleStartDirectStudy();
                    }
                  }}
                />
              </div>
              
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTopicPrompt(false)}
                  className="flex-1 py-3 border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 active:scale-98 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleStartDirectStudy}
                  disabled={!typedTopic.trim()}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 ${
                    typedTopic.trim() 
                      ? "bg-[#0a3641] text-[#c4f500] hover:bg-[#124e5d] shadow-md shadow-[#0a3641]/10" 
                      : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5 stroke-[2.5]" />
                  Start Class
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
