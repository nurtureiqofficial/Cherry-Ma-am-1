import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Award, CheckCircle, XCircle, RefreshCw, Volume2, HelpCircle, 
  ArrowRight, Zap, Trophy, Brain, TrendingUp, BarChart2, BookOpen, 
  Sparkles, Clock, Target, AlertCircle, Shield, Check, Flame,
  Crown, Medal, Star, UserCheck, Users, RotateCw, ChevronDown, ChevronUp
} from "lucide-react";
import { auth, db } from "../lib/firebase";
import { doc, setDoc, collection, query, orderBy, limit, getDocs, serverTimestamp } from "firebase/firestore";

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  conceptTested?: string;
  theoryTested?: string;
  calculationFormula?: string;
  cognitiveCategory?: string;
  difficulty?: string;
}

// Sample robust question pool for various subjects
const QUIZ_POOL: Record<string, QuizQuestion[]> = {
  Mathematics: [
    {
      id: "m1",
      question: "If a triangle has sides 6cm, 8cm, and 10cm, what is its area?",
      options: ["48 cm²", "24 cm²", "14 cm²", "30 cm²"],
      correctAnswer: 1,
      explanation: "This is a right-angled triangle (6² + 8² = 10²). The area is ½ × base × height = ½ × 6 × 8 = 24 cm².",
      conceptTested: "Right-angled triangle area",
      cognitiveCategory: "Calculations & Solving",
      difficulty: "Medium"
    },
    {
      id: "m2",
      question: "Solve for x: log₂ (x + 3) = 4",
      options: ["x = 13", "x = 5", "x = 1", "x = 11"],
      correctAnswer: 0,
      explanation: "Converting to exponential form: x + 3 = 2⁴ => x + 3 = 16 => x = 13.",
      conceptTested: "Logarithmic calculations",
      cognitiveCategory: "Conceptual Application",
      difficulty: "Hard"
    },
    {
      id: "m3",
      question: "What is the slope of the line perpendicular to y = -3x + 5?",
      options: ["3", "-3", "1/3", "-1/3"],
      correctAnswer: 2,
      explanation: "The slope of a perpendicular line is the negative reciprocal of the original slope. Perpendicular slope = -1 / (-3) = 1/3.",
      conceptTested: "Perpendicular line slopes",
      cognitiveCategory: "Theoretical Core",
      difficulty: "Medium"
    }
  ],
  Science: [
    {
      id: "s1",
      question: "Which cell organelle is known as the powerhouse of the cell?",
      options: ["Nucleus", "Ribosome", "Mitochondria", "Golgi apparatus"],
      correctAnswer: 2,
      explanation: "Mitochondria are called powerhouses because they produce ATP, the energy currency of the cell, through cellular respiration.",
      conceptTested: "Cellular organelles",
      cognitiveCategory: "Theoretical Core",
      difficulty: "Easy"
    },
    {
      id: "s2",
      question: "What is the acceleration due to gravity on Earth's surface (approximate)?",
      options: ["9.8 m/s²", "1.6 m/s²", "24.7 m/s²", "11.2 m/s²"],
      correctAnswer: 0,
      explanation: "The acceleration due to gravity on Earth is approximately 9.8 m/s², representing the gravitational pull on objects.",
      conceptTested: "Gravitational constant",
      cognitiveCategory: "Formula Retention",
      difficulty: "Easy"
    },
    {
      id: "s3",
      question: "If an electric circuit has a voltage of 12V and resistance of 4 Ohms, what is the current?",
      options: ["48 Amps", "3 Amps", "8 Amps", "16 Amps"],
      correctAnswer: 1,
      explanation: "According to Ohm's Law (V = IR), Current (I) = V / R = 12V / 4Ω = 3 Amps.",
      conceptTested: "Ohm's Law application",
      cognitiveCategory: "Calculations & Solving",
      difficulty: "Medium"
    }
  ],
  General: [
    {
      id: "g1",
      question: "Which planet in our solar system is known as the Red Planet?",
      options: ["Venus", "Mars", "Jupiter", "Saturn"],
      correctAnswer: 1,
      explanation: "Mars is called the Red Planet because of the iron oxide (rust) on its surface, giving it a reddish appearance.",
      conceptTested: "Solar system astronomy",
      cognitiveCategory: "Theoretical Core",
      difficulty: "Easy"
    },
    {
      id: "g2",
      question: "Who is known as the father of modern theoretical physics?",
      options: ["Isaac Newton", "Albert Einstein", "Galileo Galilei", "Nikola Tesla"],
      correctAnswer: 1,
      explanation: "Albert Einstein is widely regarded as the father of modern physics, especially for his theory of relativity.",
      conceptTested: "Modern physics history",
      cognitiveCategory: "Theoretical Core",
      difficulty: "Easy"
    },
    {
      id: "g3",
      question: "What is the primary gas that makes up Earth's atmosphere?",
      options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Argon"],
      correctAnswer: 1,
      explanation: "Nitrogen is the most abundant gas in our atmosphere, making up about 78% of it, followed by Oxygen at 21%.",
      conceptTested: "Earth's atmosphere",
      cognitiveCategory: "Theoretical Core",
      difficulty: "Easy"
    }
  ]
};

interface QuickQuizViewProps {
  subject?: string;
  grade?: string;
  state: string; // disconnected, idle, listening, speaking, etc.
  onInjectPrompt: (text: string) => void;
  onToast: (text: string, type: "success" | "info" | "error") => void;
  topics?: string[];
  activeTopicIndex?: number;
  customBoardContent?: string;
  topicBoardsContent?: Record<number, string>;
  sessionId?: string | null;
}

export function QuickQuizView({
  subject = "Mathematics",
  grade = "Class 10",
  state,
  onInjectPrompt,
  onToast,
  topics = [],
  activeTopicIndex = 0,
  customBoardContent = "",
  topicBoardsContent = {},
  sessionId = null
}: QuickQuizViewProps) {
  // Pre-Quiz configuration parameters
  const [isConfiguring, setIsConfiguring] = useState(true);
  const [numQuestions, setNumQuestions] = useState<number>(5);
  const [timePerQuestion, setTimePerQuestion] = useState<number>(30); // in seconds
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [quizSource, setQuizSource] = useState<"present_topic" | "document" | "fallback" | "static">("static");
  const [docName, setDocName] = useState("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isQuizCompleted, setIsQuizCompleted] = useState(false);
  const [streak, setStreak] = useState(0);
  
  // Timer state
  const [timeLeft, setTimeLeft] = useState<number>(30);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Complete detailed history of student answers
  const [answersHistory, setAnswersHistory] = useState<Array<{ 
    questionIndex: number; 
    selectedOption: number; // -1 if timed out/skipped
    isCorrect: boolean;
    conceptTested: string;
    theoryTested: string;
    calculationFormula: string;
    cognitiveCategory: string;
    difficulty: string;
  }>>([]);

  const [isSavingToDb, setIsSavingToDb] = useState(false);
  const [dbStatus, setDbStatus] = useState<"idle" | "saved" | "failed">("idle");

  // Tab navigation & Leaderboard refresh key
  const [activeTab, setActiveTab] = useState<"quiz" | "leaderboard">("quiz");
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState<number>(0);

  // Calculate formatted total time for summary display
  const totalDurationFormatted = useMemo(() => {
    const totalSecs = numQuestions * timePerQuestion;
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    
    if (mins === 0) return `${secs} seconds`;
    if (secs === 0) return `${mins} minute${mins > 1 ? "s" : ""}`;
    return `${mins}m ${secs}s`;
  }, [numQuestions, timePerQuestion]);

  // Load the questions from the server or fallback
  const loadQuiz = async (chosenCount: number) => {
    setLoading(true);
    setAnswersHistory([]);
    setDbStatus("idle");
    try {
      const response = await fetch("/api/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          subject, 
          grade,
          activeTopicIndex,
          topics,
          customBoardContent,
          topicBoardsContent,
          count: chosenCount,
          difficulty: difficulty,
          sessionId: sessionId
        })
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate custom quiz");
      }
      
      const data = await response.json();
      if (data && data.success && data.questions && data.questions.length > 0) {
        const enrichedQuestions = data.questions.map((q: any) => ({
          ...q,
          conceptTested: q.conceptTested || q.concept || "Chalkboard Concept",
          theoryTested: q.theoryTested || "Theoretical core understanding",
          calculationFormula: q.calculationFormula || "Conceptual application - no custom calculation steps needed",
          cognitiveCategory: q.cognitiveCategory || "Conceptual Application",
          difficulty: q.difficulty || "Medium"
        }));

        setQuestions(enrichedQuestions);
        setQuizSource(data.source);
        setDocName(data.documentName || "");
        onToast(
          data.source === "present_topic"
            ? `Generated Live Quiz (${chosenCount} questions) from active whiteboard topics! ⚡📝`
            : data.source === "document"
            ? `Generated custom quiz from syllabus: ${data.documentName || "your topics"}! 📝🎓`
            : `Generated practice quiz for your grade & subject! 📝`,
          "success"
        );
      } else {
        throw new Error("Invalid questions returned");
      }
    } catch (err) {
      console.warn("Dynamic quiz generation failed, falling back to offline pool:", err);
      const normalizedSubject = Object.keys(QUIZ_POOL).find(
        (key) => key.toLowerCase() === subject.toLowerCase()
      ) || "General";
      
      // Slice fallback questions based on selection count
      const fullFallback = QUIZ_POOL[normalizedSubject] || QUIZ_POOL.General;
      const fallbackQuestions = Array.from({ length: chosenCount }, (_, idx) => {
        const template = fullFallback[idx % fullFallback.length];
        return {
          ...template,
          id: `${template.id}_fallback_${idx}`
        };
      });

      setQuestions(fallbackQuestions);
      setQuizSource("static");
      onToast("Loaded practice questions for your subject! 📚", "info");
    } finally {
      setLoading(false);
      setCurrentQuestionIndex(0);
      setSelectedOption(null);
      setIsQuizCompleted(false);
      // Initialize countdown timer
      setTimeLeft(timePerQuestion);
    }
  };

  // Start the quiz
  const handleStartQuiz = () => {
    setIsConfiguring(false);
    loadQuiz(numQuestions);
  };

  // Active Timer Interval
  useEffect(() => {
    if (isConfiguring || loading || isQuizCompleted || questions.length === 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Set up ticking interval
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isConfiguring, loading, isQuizCompleted, questions]);

  // Handle timeout as a clean side effect when timeLeft reaches 0
  useEffect(() => {
    if (!isConfiguring && !loading && !isQuizCompleted && questions.length > 0 && timeLeft === 0) {
      handleTimeOut();
    }
  }, [timeLeft, isConfiguring, loading, isQuizCompleted, questions]);

  // Handle auto-advance when timer ticks to zero
  const handleTimeOut = () => {
    onToast("Samay Samapt! Auto-advancing to next question... ⏰", "info");
    // Register whatever option was selected, or -1 if nothing selected
    const chosenIdx = selectedOption !== null ? selectedOption : -1;
    const currentQ = questions[currentQuestionIndex];
    const isCorrect = chosenIdx === currentQ.correctAnswer;

    // Record answer
    setAnswersHistory((prev) => [
      ...prev,
      {
        questionIndex: currentQuestionIndex,
        selectedOption: chosenIdx,
        isCorrect,
        conceptTested: currentQ.conceptTested || "Topic Mastery",
        theoryTested: currentQ.theoryTested || "Theoretical Core",
        calculationFormula: currentQ.calculationFormula || "None",
        cognitiveCategory: currentQ.cognitiveCategory || "Theoretical Core",
        difficulty: currentQ.difficulty || "Medium"
      }
    ]);

    // Proceed
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setSelectedOption(null);
      setTimeLeft(timePerQuestion);
    } else {
      setIsQuizCompleted(true);
      // Trigger attempt persistence (using precompiled score value)
      const calculatedScore = answersHistory.filter(h => h.isCorrect).length + (isCorrect ? 1 : 0);
      saveQuizAttempt(calculatedScore, [
        ...answersHistory,
        {
          questionIndex: currentQuestionIndex,
          selectedOption: chosenIdx,
          isCorrect,
          conceptTested: currentQ.conceptTested || "Topic Mastery",
          theoryTested: currentQ.theoryTested || "Theoretical Core",
          calculationFormula: currentQ.calculationFormula || "None",
          cognitiveCategory: currentQ.cognitiveCategory || "Theoretical Core",
          difficulty: currentQ.difficulty || "Medium"
        }
      ]);
    }
  };

  // Select an option (during live quiz, no correctness feedback or explanations are shown)
  const handleSelectOption = (idx: number) => {
    setSelectedOption(idx);
  };

  // Student locks option and manually clicks "Next Question"
  const handleManualNext = () => {
    const chosenIdx = selectedOption !== null ? selectedOption : -1;
    const currentQ = questions[currentQuestionIndex];
    const isCorrect = chosenIdx === currentQ.correctAnswer;

    // Record answer
    const updatedHistory = [
      ...answersHistory,
      {
        questionIndex: currentQuestionIndex,
        selectedOption: chosenIdx,
        isCorrect,
        conceptTested: currentQ.conceptTested || "Topic Mastery",
        theoryTested: currentQ.theoryTested || "Theoretical Core",
        calculationFormula: currentQ.calculationFormula || "None",
        cognitiveCategory: currentQ.cognitiveCategory || "Theoretical Core",
        difficulty: currentQ.difficulty || "Medium"
      }
    ];
    setAnswersHistory(updatedHistory);

    // Proceed
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setSelectedOption(null);
      setTimeLeft(timePerQuestion);
    } else {
      setIsQuizCompleted(true);
      // Calculate final score
      const finalScore = updatedHistory.filter(h => h.isCorrect).length;
      saveQuizAttempt(finalScore, updatedHistory);
    }
  };

  // Save score analysis to Firestore with localStorage guest fallback
  const saveQuizAttempt = async (finalScore: number, finalHistory: typeof answersHistory) => {
    setIsSavingToDb(true);
    const uid = auth.currentUser?.uid;
    const isGuest = !uid || uid === "local_guest_student" || uid.startsWith("local_");

    const payload = {
      timestamp: new Date().toISOString(),
      score: finalScore,
      total: questions.length,
      accuracy: Math.round((finalScore / questions.length) * 100),
      source: quizSource,
      docName: docName || "Live Lecture Topics",
      subject: subject,
      grade: grade,
      history: finalHistory
    };

    if (isGuest) {
      try {
        const guestAttempts = JSON.parse(localStorage.getItem(`guest_quiz_attempts_${subject}`) || "[]");
        guestAttempts.push(payload);
        localStorage.setItem(`guest_quiz_attempts_${subject}`, JSON.stringify(guestAttempts));
        setDbStatus("saved");
        setLeaderboardRefreshKey((prev) => prev + 1);
      } catch (err) {
        console.error("Local storage saving failed:", err);
        setDbStatus("failed");
      } finally {
        setIsSavingToDb(false);
      }
    } else {
      try {
        const attemptId = `quiz_attempt_${Date.now()}`;
        const userDocRef = doc(db, "studentProfiles", uid, "quizAttempts", attemptId);
        await setDoc(userDocRef, {
          ...payload,
          attemptId,
          timestamp: serverTimestamp()
        });
        setDbStatus("saved");
        setLeaderboardRefreshKey((prev) => prev + 1);
      } catch (err) {
        console.error("Firestore quiz save failed:", err);
        setDbStatus("failed");
      } finally {
        setIsSavingToDb(false);
      }
    }
  };

  // Return to configuration page to configure/start another quiz
  const handleReturnToSetup = () => {
    setIsConfiguring(true);
    setQuestions([]);
    setIsQuizCompleted(false);
    setAnswersHistory([]);
    setSelectedOption(null);
    setCurrentQuestionIndex(0);
    setDbStatus("idle");
  };

  // Request Cherry Ma'am to voice-quiz about the active question
  const handleVoiceQuizRequest = () => {
    if (state === "disconnected") {
      onToast("Wake up Cherry Ma'am first to trigger a live voice quiz! 🎙️", "info");
      return;
    }
    const currentQ = questions[currentQuestionIndex]?.question || "a challenging concept";
    onInjectPrompt(
      `Ma'am, please ask me a live voice question about this topic: "${currentQ}". Wait for my reply and evaluate my answer on the chalkboard!`
    );
    onToast("Cherry Ma'am is setting up a custom voice quiz! Listen carefully... 🎙️📖", "success");
  };

  // Calculate final score for results display
  const finalCalculatedScore = useMemo(() => {
    return answersHistory.filter(h => h.isCorrect).length;
  }, [answersHistory, isQuizCompleted]);

  // --- MACRO & MICRO DATA CALCULATIONS FOR GRAPHING ---
  const microCategoryData = useMemo(() => {
    const categories = [
      "Conceptual Application",
      "Formula Retention",
      "Calculations & Solving",
      "Theoretical Core"
    ];

    return categories.map(cat => {
      const qInCat = questions.filter(q => q.cognitiveCategory === cat);
      const totalCount = qInCat.length;
      
      let correctCount = 0;
      qInCat.forEach(q => {
        const qIdx = questions.indexOf(q);
        const answeredState = answersHistory.find(h => h.questionIndex === qIdx);
        if (answeredState && answeredState.isCorrect) {
          correctCount++;
        }
      });

      return {
        category: cat,
        total: totalCount,
        correct: correctCount,
        percentage: totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0
      };
    }).filter(d => d.total > 0);
  }, [questions, answersHistory, isQuizCompleted]);

  // Concept Strength lists
  const conceptualStrengths = useMemo(() => {
    return answersHistory
      .filter(h => h.isCorrect)
      .map(h => ({
        concept: h.conceptTested,
        category: h.cognitiveCategory
      }));
  }, [answersHistory]);

  const conceptualGrowthAreas = useMemo(() => {
    return answersHistory
      .filter(h => !h.isCorrect)
      .map(h => ({
        concept: h.conceptTested,
        category: h.cognitiveCategory,
        explanation: questions[h.questionIndex]?.explanation
      }));
  }, [answersHistory, questions]);


  // Top Tab Switcher
  const renderTabHeader = () => (
    <div className="flex items-center justify-between bg-slate-200/80 p-1 rounded-2xl mb-2.5 border border-slate-200 shadow-2xs">
      <button
        type="button"
        onClick={() => setActiveTab("quiz")}
        className={`flex-1 py-1.5 px-3 rounded-xl text-[9.5px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
          activeTab === "quiz"
            ? "bg-[#0a3641] text-white shadow-xs"
            : "text-slate-600 hover:text-slate-900"
        }`}
      >
        <Brain className="w-3.5 h-3.5" />
        <span>Practice Quiz</span>
      </button>

      <button
        type="button"
        onClick={() => setActiveTab("leaderboard")}
        className={`flex-1 py-1.5 px-3 rounded-xl text-[9.5px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
          activeTab === "leaderboard"
            ? "bg-[#0a3641] text-white shadow-xs"
            : "text-slate-600 hover:text-slate-900"
        }`}
      >
        <Trophy className="w-3.5 h-3.5 text-[#c4f500]" />
        <span>Quiz Leaderboard & Rank</span>
      </button>
    </div>
  );

  // 0. Leaderboard Tab Screen
  if (activeTab === "leaderboard") {
    return (
      <div className="space-y-2">
        {renderTabHeader()}
        <QuizLeaderboard
          subject={subject}
          grade={grade}
          onStartQuiz={() => {
            setActiveTab("quiz");
            handleReturnToSetup();
          }}
          onToast={onToast}
          refreshTrigger={leaderboardRefreshKey}
        />
      </div>
    );
  }

  // 1. Loading UI Screen
  if (loading) {
    return (
      <div className="space-y-2">
        {renderTabHeader()}
        <div className="flex flex-col items-center justify-center py-12 px-4 space-y-4 text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-[#c4f500]/15 rounded-full blur-lg animate-pulse" />
            <Brain className="w-10 h-10 text-[#0a3641] animate-bounce" />
          </div>
          <div className="space-y-1 max-w-xs">
            <p className="text-[11px] font-black uppercase tracking-wider text-[#0a3641]">
              Curating Quiz Context...
            </p>
            <p className="text-[9.5px] text-slate-500 font-medium leading-relaxed">
              Cherry Ma'am is reading your live chalkboard notes, equations, and active topic timeline to compile dynamic concept-check questions.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[8.5px] font-mono bg-[#0a3641]/5 text-[#0a3641] px-3 py-1 rounded-full font-bold">
            <RefreshCw className="w-3 h-3 animate-spin text-[#0a3641]" />
            <span>Generating Dynamic Quiz...</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. Pre-Quiz Configuration Screen
  if (isConfiguring) {
    return (
      <div className="space-y-4 py-2 animate-fade-in text-[#0a3641]">
        {renderTabHeader()}
        
        {/* Banner */}
        <div className="bg-[#0a3641]/5 p-3.5 rounded-2xl border border-[#0a3641]/10 flex gap-3 items-center">
          <Brain className="w-8 h-8 text-[#0a3641] fill-[#0a3641]/10 shrink-0" />
          <div className="space-y-0.5">
            <h4 className="text-[11px] font-black uppercase tracking-wider">
              Practice Quiz Settings
            </h4>
            <p className="text-[9.5px] text-slate-500 leading-relaxed font-medium">
              Choose your syllabus depth and time limits. Cherry Ma'am will tailor a classroom-synchronized quiz for you.
            </p>
          </div>
        </div>

        {/* Classroom Synchronization Status */}
        <div className="bg-emerald-500/5 border border-emerald-500/10 p-3.5 rounded-2xl flex flex-col gap-2 text-left">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
            <span className="text-[8.5px] font-mono font-black uppercase tracking-widest text-emerald-700">Classroom Synced</span>
          </div>
          <div className="space-y-2 text-[9.5px]">
            {topics && topics.length > 0 && typeof activeTopicIndex === "number" && (
              <div className="space-y-0.5">
                <span className="font-extrabold text-[#0a3641] uppercase tracking-wide text-[7.5px] block">Active Slide Topic:</span>
                <span className="font-mono bg-white border border-slate-100 px-2 py-0.5 rounded-sm text-[8.5px] font-extrabold inline-block text-emerald-800">
                  Part {activeTopicIndex + 1}: {topics[activeTopicIndex]?.split('\n')[0].replace(/#/g, '').trim()}
                </span>
              </div>
            )}
            {customBoardContent && customBoardContent.trim() ? (
              <div className="space-y-1">
                <span className="font-extrabold text-[#0a3641] uppercase tracking-wide text-[7.5px] block">Live Blackboard Chalk Notes Detected:</span>
                <div className="bg-slate-900 text-slate-200 p-2 rounded-xl text-[8px] font-mono leading-normal max-h-20 overflow-y-auto whitespace-pre-wrap border border-slate-800">
                  {customBoardContent.trim().length > 180 
                    ? customBoardContent.trim().slice(0, 180) + "..." 
                    : customBoardContent.trim()}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <span className="font-extrabold text-[#0a3641] uppercase tracking-wide text-[7.5px] block">Live Blackboard Chalk Notes:</span>
                <p className="text-slate-400 text-[8px] italic font-medium leading-tight">No live handwritten equations/notes on board. Quiz will align with slide syllabus definitions.</p>
              </div>
            )}
          </div>
        </div>

        {/* Configuration Options */}
        <div className="space-y-3 bg-white p-4 border border-slate-100 rounded-2xl shadow-xs">
          
          {/* Question Count Selector */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500 flex justify-between">
              <span>Number of Questions:</span>
              <span className="text-[#0a3641] font-black font-mono">{numQuestions} Questions</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[3, 5, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setNumQuestions(num)}
                  className={`py-2 text-[10px] font-bold rounded-xl border transition-all cursor-pointer ${
                    numQuestions === num
                      ? "border-[#0a3641] bg-[#0a3641] text-white font-extrabold"
                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 text-slate-600"
                  }`}
                >
                  {num} Qs
                </button>
              ))}
            </div>
          </div>

          {/* Time Limit Selector */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500 flex justify-between">
              <span>Time Limit Per Question:</span>
              <span className="text-[#0a3641] font-black font-mono">{timePerQuestion}s / question</span>
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[15, 30, 45, 60].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setTimePerQuestion(sec)}
                  className={`py-2 text-[9.5px] font-bold rounded-xl border transition-all cursor-pointer ${
                    timePerQuestion === sec
                      ? "border-[#0a3641] bg-[#0a3641] text-white font-extrabold"
                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 text-slate-600"
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty Level Selector */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500 flex justify-between">
              <span>Difficulty Level:</span>
              <span className={`font-black font-mono text-[9px] uppercase ${
                difficulty === "Easy" ? "text-emerald-600" : difficulty === "Hard" ? "text-rose-600" : "text-amber-600"
              }`}>{difficulty} Level</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["Easy", "Medium", "Hard"] as const).map((level) => {
                const isSelected = difficulty === level;
                let activeStyle = "";
                if (isSelected) {
                  if (level === "Easy") activeStyle = "border-emerald-500 bg-emerald-500 text-white font-extrabold";
                  else if (level === "Hard") activeStyle = "border-rose-500 bg-rose-500 text-white font-extrabold";
                  else activeStyle = "border-amber-500 bg-amber-500 text-white font-extrabold";
                } else {
                  activeStyle = "border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 text-slate-600";
                }
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setDifficulty(level)}
                    className={`py-2 text-[10px] font-bold rounded-xl border transition-all cursor-pointer ${activeStyle}`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Summary stats */}
          <div className="pt-3 border-t border-slate-50 flex items-center justify-between text-[9px] font-mono text-slate-500 font-medium">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Total Duration:</span>
            </div>
            <span className="font-extrabold text-[#0a3641] bg-slate-100 px-2 py-0.5 rounded-sm">
              {totalDurationFormatted}
            </span>
          </div>

        </div>

        {/* Guidelines / Anti-Cheat warning */}
        <div className="bg-amber-500/5 border border-amber-500/10 p-3 rounded-xl flex items-start gap-2 text-[8.5px] leading-relaxed text-slate-600 font-medium">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-amber-800 block uppercase tracking-wider text-[7.5px]">Important Classroom Guidelines:</span>
            <p>1. No immediate corrections will be shown during the test. Your score & results will be visible after completing the quiz.</p>
            <p>2. Going back or backtracking is strictly forbidden. Lock your choices carefully!</p>
            <p>3. If the timer ticks to zero before selecting, the question automatically advances as unanswered.</p>
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStartQuiz}
          className="w-full py-2.5 bg-[#c4f500] hover:bg-[#b5e200] text-[#0a3641] text-[10px] font-black rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 shadow-sm"
        >
          <PlayIcon className="w-4 h-4" />
          <span>START ALIGNED CLASS QUIZ ⚡</span>
        </button>

      </div>
    );
  }

  // Active Question item
  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="space-y-3.5 animate-fade-in text-left py-1 text-[#0a3641]">
      {renderTabHeader()}
      
      {/* 3. ACTIVE QUIZ TAKE SCREEN */}
      <AnimatePresence mode="wait">
        {!isQuizCompleted && currentQuestion ? (
          <motion.div
            key={currentQuestionIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            {/* Header info banner with active TIMER */}
            <div className="bg-white border border-slate-100 p-3 rounded-2xl shadow-xs flex items-center justify-between">
              
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[7.5px] font-mono font-black uppercase tracking-wider text-slate-400">
                    Question {currentQuestionIndex + 1} of {questions.length}
                  </span>
                </div>
                <h6 className="text-[8px] font-mono font-bold uppercase tracking-wider text-emerald-600">
                  {currentQuestion.cognitiveCategory || "CONCEPT TEST"}
                </h6>
              </div>

              {/* Countdown Ticking Timer */}
              <div className="flex items-center gap-2 bg-[#0a3641]/5 px-3 py-1.5 rounded-xl border border-[#0a3641]/10">
                <Clock className={`w-3.5 h-3.5 text-[#0a3641] ${timeLeft <= 5 ? "animate-spin text-rose-500" : ""}`} />
                <span className={`text-[11px] font-black font-mono tracking-tight ${timeLeft <= 5 ? "text-rose-600 animate-pulse" : "text-[#0a3641]"}`}>
                  {timeLeft}s
                </span>
              </div>
            </div>

            {/* Timer visual progress bar */}
            <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: "100%" }}
                animate={{ width: `${(timeLeft / timePerQuestion) * 100}%` }}
                transition={{ duration: 1, ease: "linear" }}
                className={`h-full rounded-full ${timeLeft <= 5 ? "bg-rose-500" : "bg-[#0a3641]"}`}
              />
            </div>

            {/* Question Details */}
            <div className="bg-white border border-slate-100 p-3 rounded-xl shadow-xs space-y-2">
              <h5 className="text-[11px] font-extrabold text-slate-800 leading-snug">
                {currentQuestion.question}
              </h5>
              
              <div className="flex items-center gap-2">
                <span className="text-[7.5px] font-mono font-bold uppercase tracking-wide bg-slate-50 border border-slate-100 text-slate-500 px-1.5 py-0.5 rounded-sm">
                  Concept: {currentQuestion.conceptTested}
                </span>
                <span className={`text-[7.5px] font-mono font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm ${
                  currentQuestion.difficulty === "Easy" 
                    ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                    : currentQuestion.difficulty === "Hard"
                    ? "bg-rose-50 text-rose-600 border border-rose-100"
                    : "bg-amber-50 text-amber-600 border border-amber-100"
                }`}>
                  Diff: {currentQuestion.difficulty}
                </span>
              </div>
            </div>

            {/* Options List - Gray high contract highlight on selected, with NO immediate correctness check */}
            <div className="grid grid-cols-1 gap-1.5">
              {currentQuestion.options.map((opt, oIdx) => {
                const isSelected = selectedOption === oIdx;
                
                let optionStyle = "border-slate-200 bg-white text-slate-650 hover:bg-slate-50";
                if (isSelected) {
                  // High contrast high-quality selected state, but neutral (no green/red checkmarks)
                  optionStyle = "border-[#0a3641] bg-[#0a3641]/5 text-[#0a3641] font-extrabold shadow-[0_0_8px_rgba(10,54,65,0.08)]";
                }

                return (
                  <button
                    key={oIdx}
                    onClick={() => handleSelectOption(oIdx)}
                    className={`p-2.5 border text-[9.5px] rounded-xl text-left transition-all duration-200 cursor-pointer active:scale-98 flex items-center justify-between ${optionStyle}`}
                  >
                    <span className="leading-tight">{opt}</span>
                    {isSelected && <div className="w-2 h-2 rounded-full bg-[#0a3641] shrink-0 ml-1" />}
                  </button>
                );
              })}
            </div>

            {/* Navigation (Only show 'Next Question' if an option has been selected) */}
            <div className="pt-2">
              <button
                onClick={handleManualNext}
                disabled={selectedOption === null}
                className={`w-full py-2 px-3 text-white text-[9.5px] font-black rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-sm ${
                  selectedOption !== null 
                    ? "bg-[#0a3641] hover:bg-[#0e4b5a]" 
                    : "bg-slate-300 cursor-not-allowed text-slate-500 opacity-60"
                }`}
              >
                <span>{currentQuestionIndex === questions.length - 1 ? "FINISH & GENERATE EXPLANATIONS" : "NEXT QUESTION"}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Help / Voice hints */}
            <button
              onClick={handleVoiceQuizRequest}
              className="w-full py-1.5 bg-[#c4f500]/10 hover:bg-[#c4f500]/20 border border-[#c4f500]/30 text-[8.5px] font-black text-[#0a3641] rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5 text-[#0a3641]" />
              <span>Ask Cherry Ma'am to voice-quiz about this topic! 🎙️</span>
            </button>
          </motion.div>
        ) : (
          
          /* 4. COMPREHENSIVE PERFORMANCE RESULTS & REVIEW PANEL */
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="space-y-4 py-2"
          >
            {/* Visual Score Card Header */}
            <div className="bg-white border border-slate-150 p-4 rounded-2xl shadow-xs text-center relative overflow-hidden space-y-3">
              <div className="absolute top-0 right-0 p-3 text-slate-100 select-none pointer-events-none">
                <Award className="w-20 h-20 -mr-4 -mt-4 opacity-5" />
              </div>
              
              <div className="relative inline-flex items-center justify-center mb-1">
                <div className="absolute inset-0 bg-[#c4f500]/20 rounded-full blur-xl animate-pulse" />
                <div className="bg-[#0a3641] p-3 rounded-full border-2 border-white relative">
                  <Trophy className="w-6 h-6 text-[#c4f500]" />
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[8px] font-mono text-emerald-600 tracking-widest font-extrabold uppercase bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full inline-block">
                  Classroom Analytics Generated
                </span>
                <h5 className="text-xs font-black uppercase tracking-wider text-[#0a3641] mt-1">
                  Topic Quiz Analysis
                </h5>
                <p className="text-[20px] font-black text-[#0a3641] tracking-tight">
                  {finalCalculatedScore} / {questions.length} Correct
                </p>
                <span className="text-[9.5px] font-sans font-bold text-slate-500 max-w-xs block mx-auto leading-tight">
                  {finalCalculatedScore === questions.length
                    ? "✨ Perfection! Absolute master of currently discussed chalkboard topics."
                    : finalCalculatedScore >= questions.length * 0.75
                    ? "🌟 Outstanding grasp of formulas & calculations. Great thinking!"
                    : finalCalculatedScore >= questions.length / 2
                    ? "👍 Good concept retention! A quick chalkboard recap will seal perfection."
                    : "📖 Learning is a progress timeline! Revise concepts on the board."}
                </span>
              </div>

              {/* Circular Gauge */}
              <div className="flex items-center justify-center gap-6 pt-3 border-t border-slate-50">
                <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      className="stroke-slate-100"
                      strokeWidth="5"
                      fill="transparent"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      className="stroke-[#0a3641]"
                      strokeWidth="5"
                      fill="transparent"
                      strokeDasharray="163.3"
                      strokeDashoffset={163.3 - (163.3 * Math.round((finalCalculatedScore / questions.length) * 100)) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-[11px] font-black text-[#0a3641]">
                      {questions.length > 0 ? Math.round((finalCalculatedScore / questions.length) * 100) : 0}%
                    </span>
                    <span className="text-[6px] text-slate-400 font-extrabold uppercase tracking-wide">Accuracy</span>
                  </div>
                </div>

                {/* score values */}
                <div className="text-left space-y-1.5 font-sans">
                  <div className="flex items-center gap-1.5 text-[8.5px] text-slate-600 font-bold">
                    <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[3]" />
                    <span>{finalCalculatedScore} Right Answers</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[8.5px] text-slate-600 font-bold">
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span>{questions.length - finalCalculatedScore} Wrong / Timed Out</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[8.5px] text-slate-600 font-bold">
                    <Clock className="w-3.5 h-3.5 text-[#0a3641]" />
                    <span className="bg-slate-100 px-1 py-0.2 rounded-sm text-[7.5px] font-mono text-[#0a3641] uppercase">Classroom Test Completed</span>
                  </div>
                </div>
              </div>
            </div>

            {/* COGNITIVE CATEGORY BREAKDOWN GRAPH */}
            <div className="bg-white border border-slate-150 p-4 rounded-2xl shadow-xs space-y-3">
              <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                <BarChart2 className="w-4 h-4 text-[#0a3641]" />
                <h6 className="text-[9px] font-sans font-black uppercase tracking-wider text-[#0a3641]">
                  Micro Cognitive Mastery Analysis
                </h6>
              </div>

              <div className="space-y-3">
                {microCategoryData.map((data, index) => {
                  const barColorClass = 
                    data.percentage >= 80 
                      ? "bg-emerald-500" 
                      : data.percentage >= 50 
                      ? "bg-amber-400" 
                      : "bg-rose-400";
                  
                  // Maps internal cognitiveCategory strings to beautiful custom titles
                  const labelMap: Record<string, string> = {
                    "Conceptual Application": "🎯 Concept Clarity (Concept)",
                    "Theoretical Core": "📖 Theoretical Understanding (Theory)",
                    "Calculations & Solving": "🧮 Calculation Precision (Calculations)",
                    "Formula Retention": "⚡ Formula Retention & Recall (Formulas)"
                  };
                  const displayLabel = labelMap[data.category] || data.category;
                  
                  return (
                    <div key={index} className="space-y-1">
                      <div className="flex justify-between items-center text-[8.5px] font-bold">
                        <span className="text-[#0a3641]">{displayLabel}</span>
                        <span className="text-slate-500 font-mono">
                          {data.correct}/{data.total} ({data.percentage}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden relative">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${data.percentage}%` }}
                          transition={{ duration: 0.8, delay: index * 0.1 }}
                          className={`h-full ${barColorClass} rounded-full`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CLASSROOM SYLLABUS & BLACKBOARD COVERAGE REPORT */}
            <div className="bg-white border border-slate-150 p-4 rounded-2xl shadow-xs space-y-3 text-left">
              <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                <Target className="w-4 h-4 text-[#0a3641]" />
                <h6 className="text-[9px] font-sans font-black uppercase tracking-wider text-[#0a3641]">
                  Blackboard Topic Coverage Report
                </h6>
              </div>
              <p className="text-[9px] text-slate-500 font-medium leading-relaxed">
                Cherry Ma'am verified the following core components of the currently discussed topic <strong className="text-slate-700">"{docName || "Active Whiteboard Topic"}"</strong>:
              </p>
              
              <div className="grid grid-cols-1 gap-2.5">
                {/* Concepts list */}
                <div className="bg-[#0a3641]/2 border border-[#0a3641]/5 p-2.5 rounded-xl space-y-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px]">🎯</span>
                    <span className="text-[8.5px] font-black uppercase tracking-wider text-[#0a3641]">Core Concepts Tested</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Array.from(new Set(questions.map(q => q.conceptTested).filter(Boolean))).map((item, i) => (
                      <span key={i} className="text-[8px] font-bold font-mono text-slate-600 bg-slate-100 border border-slate-250 px-2 py-0.5 rounded-sm">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Theories list */}
                <div className="bg-[#0a3641]/2 border border-[#0a3641]/5 p-2.5 rounded-xl space-y-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px]">📖</span>
                    <span className="text-[8.5px] font-black uppercase tracking-wider text-[#0a3641]">Theories & Principles Checked</span>
                  </div>
                  <div className="space-y-1">
                    {Array.from(new Set(questions.map(q => q.theoryTested).filter(Boolean))).map((item, i) => (
                      <div key={i} className="text-[8px] font-medium text-slate-600 leading-tight flex items-start gap-1">
                        <span className="text-[#0a3641] font-black font-mono">•</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Calculations & Formulas list */}
                <div className="bg-[#0a3641]/2 border border-[#0a3641]/5 p-2.5 rounded-xl space-y-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px]">🧮</span>
                    <span className="text-[8.5px] font-black uppercase tracking-wider text-[#0a3641]">Formulas & Calculations Solved</span>
                  </div>
                  <div className="space-y-1">
                    {Array.from(new Set(questions.map(q => q.calculationFormula).filter(f => f && !f.toLowerCase().includes("theoretical check") && !f.toLowerCase().includes("no calculation")))).map((item, i) => (
                      <div key={i} className="text-[8px] font-medium text-slate-600 leading-tight flex items-start gap-1">
                        <span className="text-[#0a3641] font-black font-mono">•</span>
                        <code className="bg-slate-50 border border-slate-100 rounded-sm px-1 text-[7.5px] font-mono text-emerald-700">{item}</code>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* STRENGTHS AND GROWTH AREAS LISTS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
              <div className="bg-white border border-emerald-100 p-3 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-emerald-800 border-b border-emerald-50 pb-1">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-[8.5px] font-black uppercase tracking-wider">Concepts Cleared (Strengths)</span>
                </div>
                {conceptualStrengths.length > 0 ? (
                  <ul className="space-y-1">
                    {conceptualStrengths.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-1 text-[8.5px] font-medium text-slate-600 leading-tight">
                        <span className="text-emerald-500 text-[10px] mt-0.5">•</span>
                        <div>
                          <strong className="text-slate-700">{item.concept}</strong>
                          <span className="text-[7.5px] font-mono text-slate-400 block">({item.category})</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[8px] text-slate-400 font-medium italic">No correct answers logged. Let's do a fast revision with Cherry Ma'am!</p>
                )}
              </div>

              <div className="bg-white border border-amber-150 p-3 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-amber-800 border-b border-amber-50 pb-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-[8.5px] font-black uppercase tracking-wider">Syllabus Review Required</span>
                </div>
                {conceptualGrowthAreas.length > 0 ? (
                  <ul className="space-y-1.5">
                    {conceptualGrowthAreas.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-1 text-[8.5px] font-medium text-slate-600 leading-tight">
                        <span className="text-amber-500 text-[10px] mt-0.5">•</span>
                        <div>
                          <strong className="text-slate-700">{item.concept}</strong>
                          <span className="text-[7.5px] font-mono text-slate-400 block">Category: {item.category}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center justify-center py-2 text-emerald-600 text-center space-y-1">
                    <Sparkles className="w-5 h-5 text-emerald-500 fill-emerald-500 animate-pulse" />
                    <span className="text-[8px] font-bold uppercase">No growth areas! Full Marks Mastery!</span>
                  </div>
                )}
              </div>
            </div>

            {/* Persistence Status Bar Indicator */}
            <div className="flex items-center justify-center gap-1.5 py-1 bg-slate-50 border border-slate-100 rounded-xl">
              <span className={`w-1.5 h-1.5 rounded-full ${dbStatus === "saved" ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
              <span className="text-[7.5px] font-mono text-slate-400 font-bold uppercase tracking-wider">
                {isSavingToDb 
                  ? "Writing Analysis to cloud db..." 
                  : dbStatus === "saved" 
                  ? (auth.currentUser ? "✓ Automatically Synced with Firestore Classroom Profile" : "✓ Saved to Local guest history successfully")
                  : dbStatus === "failed"
                  ? "⚠ Sync failed, saved to offline guest cache"
                  : "Syncing analysis stats..."}
              </span>
            </div>

            {/* DETAILED SOLUTIONS AND EXPLANATIONS REVIEW SECTION */}
            <div className="bg-white border border-slate-150 p-4 rounded-2xl shadow-xs space-y-4 text-left">
              <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <BookOpen className="w-4 h-4 text-[#0a3641]" />
                <h6 className="text-[10px] font-sans font-black uppercase tracking-wider text-[#0a3641]">
                  Detailed Solutions & Review
                </h6>
              </div>

              <div className="space-y-4 divide-y divide-slate-100">
                {questions.map((q, idx) => {
                  const record = answersHistory.find(h => h.questionIndex === idx);
                  const isCorrect = record ? record.isCorrect : false;
                  const selectedOpt = record ? record.selectedOption : -1;

                  return (
                    <div key={q.id || idx} className={`pt-3 first:pt-0 space-y-2`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <span className="text-[8px] font-mono font-black text-slate-400 uppercase">
                            QUESTION {idx + 1}
                          </span>
                          <h5 className="text-[10px] font-extrabold text-slate-800 leading-snug">
                            {q.question}
                          </h5>
                        </div>
                        {selectedOpt === -1 ? (
                          <span className="text-[7.5px] font-bold uppercase bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-sm shrink-0 border border-amber-100">
                            Timed Out
                          </span>
                        ) : isCorrect ? (
                          <span className="text-[7.5px] font-bold uppercase bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-sm shrink-0 border border-emerald-100">
                            Correct
                          </span>
                        ) : (
                          <span className="text-[7.5px] font-bold uppercase bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded-sm shrink-0 border border-rose-100">
                            Incorrect
                          </span>
                        )}
                      </div>

                      {/* Displaying options with feedback colors */}
                      <div className="grid grid-cols-1 gap-1 pl-1">
                        {q.options.map((opt, oIdx) => {
                          const wasSelected = selectedOpt === oIdx;
                          const isTheCorrectOpt = q.correctAnswer === oIdx;

                          let badgeClass = "border-slate-100 text-slate-500 bg-slate-50/40";
                          if (isTheCorrectOpt) {
                            badgeClass = "border-emerald-200 bg-emerald-50 text-emerald-900 font-extrabold";
                          } else if (wasSelected && !isCorrect) {
                            badgeClass = "border-rose-200 bg-rose-50 text-rose-900 font-bold";
                          }

                          return (
                            <div key={oIdx} className={`p-2 border rounded-xl text-[9px] flex items-center justify-between ${badgeClass}`}>
                              <span>{opt}</span>
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                {isTheCorrectOpt && <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />}
                                {wasSelected && !isCorrect && <XCircle className="w-3.5 h-3.5 text-rose-500" />}
                                {wasSelected && (
                                  <span className="text-[6.5px] font-mono font-black uppercase px-1 rounded-sm bg-[#0a3641]/10 text-[#0a3641]">
                                    Your Choice
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Dimensions Tested metadata */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pt-1">
                        <div className="bg-[#0a3641]/2 border border-[#0a3641]/5 p-2 rounded-xl text-[8px] leading-tight space-y-0.5">
                          <span className="font-bold text-[#0a3641] uppercase tracking-wide block text-[7px]">🎯 Concept</span>
                          <span className="text-slate-600 font-medium">{q.conceptTested}</span>
                        </div>
                        <div className="bg-[#0a3641]/2 border border-[#0a3641]/5 p-2 rounded-xl text-[8px] leading-tight space-y-0.5">
                          <span className="font-bold text-[#0a3641] uppercase tracking-wide block text-[7px]">📖 Theory</span>
                          <span className="text-slate-600 font-medium">{q.theoryTested}</span>
                        </div>
                        <div className="bg-[#0a3641]/2 border border-[#0a3641]/5 p-2 rounded-xl text-[8px] leading-tight space-y-0.5">
                          <span className="font-bold text-[#0a3641] uppercase tracking-wide block text-[7px]">🧮 Formula/Calc</span>
                          <code className="text-emerald-700 font-mono font-medium block overflow-x-auto whitespace-pre-wrap leading-none">{q.calculationFormula}</code>
                        </div>
                      </div>

                      {/* Cherry Ma'am's Solution explanation */}
                      <div className="bg-teal-50/30 border border-teal-500/10 p-2.5 rounded-xl text-[8.5px] leading-relaxed">
                        <span className="font-sans font-black uppercase text-teal-800 text-[7px] tracking-wider block mb-0.5">
                          Cherry Ma'am's Explanation:
                        </span>
                        <p className="text-slate-600 font-medium italic">
                          {q.explanation}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Actions to Reset and re-take */}
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActiveTab("leaderboard")}
                className="w-full py-2.5 bg-[#0a3641] hover:bg-[#0e4b5a] text-white text-[9.5px] font-black rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-sm"
              >
                <Trophy className="w-3.5 h-3.5 text-[#c4f500]" />
                <span>VIEW YOUR LEADERBOARD RANK & STANDINGS 🏆</span>
              </button>

              <button
                type="button"
                onClick={handleReturnToSetup}
                className="w-full py-2.5 bg-[#c4f500] hover:bg-[#b5e200] text-[#0a3641] text-[9.5px] font-black rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-sm"
              >
                <Brain className="w-3.5 h-3.5" />
                <span>Configure & Take New Practice Quiz ⚡</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface QuizLeaderboardProps {
  subject: string;
  grade: string;
  onStartQuiz: () => void;
  onToast: (text: string, type: "success" | "info" | "error") => void;
  refreshTrigger?: number;
}

export function QuizLeaderboard({
  subject,
  grade,
  onStartQuiz,
  onToast,
  refreshTrigger = 0
}: QuizLeaderboardProps) {
  const [pastAttempts, setPastAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);

  // Fetch performance data from Firestore (or local guest fallback)
  const fetchLeaderboard = async () => {
    setLoading(true);
    const uid = auth.currentUser?.uid;
    const isGuest = !uid || uid === "local_guest_student" || uid.startsWith("local_");

    if (isGuest) {
      try {
        const guestSubject = JSON.parse(localStorage.getItem(`guest_quiz_attempts_${subject}`) || "[]");
        const guestGeneral = JSON.parse(localStorage.getItem(`guest_quiz_attempts_General`) || "[]");
        const guestMath = JSON.parse(localStorage.getItem(`guest_quiz_attempts_Mathematics`) || "[]");
        const guestSci = JSON.parse(localStorage.getItem(`guest_quiz_attempts_Science`) || "[]");
        
        const combinedMap = new Map();
        [...guestSubject, ...guestGeneral, ...guestMath, ...guestSci].forEach(item => {
          const key = (item.timestamp || "") + "_" + (item.score || "0");
          if (!combinedMap.has(key)) {
            combinedMap.set(key, item);
          }
        });

        const list = Array.from(combinedMap.values()).sort((a: any, b: any) => {
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });

        setPastAttempts(list);
      } catch (err) {
        console.error("Error fetching guest leaderboard:", err);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const attemptsRef = collection(db, "studentProfiles", uid, "quizAttempts");
      const q = query(attemptsRef, orderBy("timestamp", "desc"), limit(30));
      const querySnapshot = await getDocs(q);
      const fetched: any[] = [];

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        let formattedDate = "Recently";
        if (data.timestamp?.toDate) {
          formattedDate = data.timestamp.toDate().toLocaleDateString("en-IN", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          });
        } else if (data.timestamp && typeof data.timestamp === "string") {
          formattedDate = new Date(data.timestamp).toLocaleDateString("en-IN", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          });
        }

        fetched.push({
          id: docSnap.id,
          ...data,
          formattedDate
        });
      });

      setPastAttempts(fetched);
    } catch (err) {
      console.warn("Firestore quiz leaderboard fetch error (using local guest data):", err);
      try {
        const guestSubject = JSON.parse(localStorage.getItem(`guest_quiz_attempts_${subject}`) || "[]");
        setPastAttempts(guestSubject);
      } catch (e) {
        console.error("Guest storage fallback error:", e);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, [subject, refreshTrigger]);

  // Derived metrics
  const filteredAttempts = useMemo(() => {
    if (filterSubject === "all") return pastAttempts;
    return pastAttempts.filter((a) => (a.subject || "").toLowerCase() === filterSubject.toLowerCase());
  }, [pastAttempts, filterSubject]);

  const metrics = useMemo(() => {
    const totalQuizzes = pastAttempts.length;
    if (totalQuizzes === 0) {
      return {
        totalQuizzes: 0,
        avgAccuracy: 0,
        bestAccuracy: 0,
        totalQuestions: 0,
        totalCorrect: 0,
        streak: 0,
        rankTier: "Class Candidate 🌟",
        rankPercentile: "Unranked",
        rankBadge: "🌟"
      };
    }

    const totalQuestions = pastAttempts.reduce((acc, a) => acc + (a.total || 0), 0);
    const totalCorrect = pastAttempts.reduce((acc, a) => acc + (a.score || 0), 0);
    const avgAcc = Math.round((totalCorrect / (totalQuestions || 1)) * 100);
    const bestAcc = Math.max(...pastAttempts.map((a) => a.accuracy !== undefined ? a.accuracy : Math.round(((a.score || 0) / (a.total || 1)) * 100)));

    // Streak calculation (consecutive >= 60% accuracy)
    let streakCount = 0;
    for (const attempt of pastAttempts) {
      const acc = attempt.accuracy !== undefined ? attempt.accuracy : Math.round(((attempt.score || 0) / (attempt.total || 1)) * 100);
      if (acc >= 60) {
        streakCount++;
      } else {
        break;
      }
    }

    let tier = "Rising Star 🥉";
    let percentile = "Top 30%";
    let badge = "🥉";

    if (avgAcc >= 90 && totalQuizzes >= 3) {
      tier = "Grandmaster Scholar 🏆";
      percentile = "Top 1%";
      badge = "🏆";
    } else if (avgAcc >= 80 && totalQuizzes >= 2) {
      tier = "Diamond Achiever 💎";
      percentile = "Top 5%";
      badge = "💎";
    } else if (avgAcc >= 65) {
      tier = "Gold Explorer 🥇";
      percentile = "Top 15%";
      badge = "🥇";
    } else if (avgAcc >= 50) {
      tier = "Silver Challenger 🥈";
      percentile = "Top 25%";
      badge = "🥈";
    }

    return {
      totalQuizzes,
      avgAccuracy: avgAcc,
      bestAccuracy: bestAcc,
      totalQuestions,
      totalCorrect,
      streak: streakCount,
      rankTier: tier,
      rankPercentile: percentile,
      rankBadge: badge
    };
  }, [pastAttempts]);

  // Peer Classroom Benchmark Leaderboard
  const peerLeaderboard = useMemo(() => {
    const studentName = auth.currentUser?.displayName || "You (Student)";
    
    // Classroom benchmark entries
    const benchmarkPeers = [
      { id: "p1", name: "Aarav Sharma", scoreAcc: 96, quizzes: 18, grade: "Class 10", subject: "Mathematics", badge: "🏆 Grandmaster" },
      { id: "p2", name: "Ananya Patel", scoreAcc: 92, quizzes: 15, grade: "Class 10", subject: "Science", badge: "💎 Diamond" },
      { id: "p4", name: "Rohan Verma", scoreAcc: 78, quizzes: 12, grade: "Class 10", subject: "Physics", badge: "🥇 Gold" },
      { id: "p5", name: "Priya Nair", scoreAcc: 70, quizzes: 9, grade: "Class 10", subject: "General", badge: "🥈 Silver" }
    ];

    const currentStudentEntry = {
      id: "current_user",
      name: studentName,
      scoreAcc: metrics.avgAccuracy,
      quizzes: metrics.totalQuizzes,
      grade: grade,
      subject: subject,
      badge: metrics.rankTier,
      isCurrentUser: true
    };

    const combined = [...benchmarkPeers, currentStudentEntry].sort((a, b) => {
      if (b.scoreAcc !== a.scoreAcc) return b.scoreAcc - a.scoreAcc;
      return b.quizzes - a.quizzes;
    });

    return combined.map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));
  }, [metrics, grade, subject]);

  return (
    <div className="space-y-3.5 text-left animate-fade-in text-[#0a3641] py-1">
      
      {/* Banner */}
      <div className="bg-[#0a3641] text-white p-3.5 rounded-2xl shadow-sm relative overflow-hidden flex items-center justify-between gap-3">
        <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
          <Trophy className="w-24 h-24 -mr-4 -mt-4 text-[#c4f500]" />
        </div>
        
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-1.5">
            <span className="text-[7.5px] font-mono font-black uppercase tracking-widest bg-[#c4f500] text-[#0a3641] px-2 py-0.5 rounded-full">
              Classroom Competitive Rank
            </span>
            {auth.currentUser ? (
              <span className="text-[7.5px] font-mono text-emerald-300 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Firestore Synced
              </span>
            ) : (
              <span className="text-[7.5px] font-mono text-amber-300 font-bold">Guest Mode</span>
            )}
          </div>
          
          <h4 className="text-xs font-black uppercase tracking-wider flex items-center gap-2 text-white">
            <span>Quiz Leaderboard & Stats</span>
          </h4>
          
          <p className="text-[9px] text-slate-200 font-medium leading-tight max-w-xs">
            Compare past practice quiz accuracy, test streaks, and syllabus concept mastery with classroom peers.
          </p>
        </div>

        <button
          onClick={() => {
            fetchLeaderboard();
            onToast("Leaderboard updated from Firestore! 🔄", "info");
          }}
          disabled={loading}
          className="bg-white/10 hover:bg-white/20 active:scale-95 text-white p-2 rounded-xl transition-all cursor-pointer shrink-0 relative z-10 border border-white/20"
          title="Refresh Leaderboard Data"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#c4f500]" : ""}`} />
        </button>
      </div>

      {/* Student Rank Overview Card */}
      <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <div className="bg-[#0a3641] text-[#c4f500] p-1.5 rounded-xl font-black text-xs">
              {metrics.rankBadge}
            </div>
            <div>
              <span className="text-[7px] font-mono uppercase font-bold text-slate-400 block tracking-wider">Your Mastery Rank</span>
              <h5 className="text-[11px] font-black text-[#0a3641] uppercase tracking-wide">
                {metrics.rankTier}
              </h5>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[7px] font-mono uppercase font-bold text-slate-400 block tracking-wider">Percentile Tier</span>
            <span className="text-[9.5px] font-black text-emerald-600 font-mono bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full inline-block">
              {metrics.rankPercentile}
            </span>
          </div>
        </div>

        {/* 4 Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-slate-50 border border-slate-100 p-2 rounded-xl space-y-0.5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[7px] font-mono font-bold uppercase tracking-wider">Accuracy</span>
              <Target className="w-3.5 h-3.5 text-[#0a3641]" />
            </div>
            <p className="text-xs font-black text-[#0a3641] font-mono">{metrics.avgAccuracy}%</p>
            <span className="text-[6.5px] text-slate-400 font-medium">Overall Score %</span>
          </div>

          <div className="bg-slate-50 border border-slate-100 p-2 rounded-xl space-y-0.5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[7px] font-mono font-bold uppercase tracking-wider">Quizzes</span>
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <p className="text-xs font-black text-[#0a3641] font-mono">{metrics.totalQuizzes}</p>
            <span className="text-[6.5px] text-slate-400 font-medium">Total Taken</span>
          </div>

          <div className="bg-slate-50 border border-slate-100 p-2 rounded-xl space-y-0.5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[7px] font-mono font-bold uppercase tracking-wider">Best Score</span>
              <Zap className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <p className="text-xs font-black text-[#0a3641] font-mono">{metrics.bestAccuracy}%</p>
            <span className="text-[6.5px] text-slate-400 font-medium">Peak Performance</span>
          </div>

          <div className="bg-slate-50 border border-slate-100 p-2 rounded-xl space-y-0.5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[7px] font-mono font-bold uppercase tracking-wider">Streak</span>
              <Flame className="w-3.5 h-3.5 text-rose-500" />
            </div>
            <p className="text-xs font-black text-[#0a3641] font-mono">{metrics.streak}🔥</p>
            <span className="text-[6.5px] text-slate-400 font-medium">Consecutive ≥60%</span>
          </div>
        </div>
      </div>

      {/* CLASSROOM PEER BENCHMARK LEADERBOARD TABLE */}
      <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-xs space-y-2.5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-1.5">
            <Crown className="w-4 h-4 text-amber-500" />
            <h6 className="text-[9.5px] font-black uppercase tracking-wider text-[#0a3641]">
              Classroom Peer Standings
            </h6>
          </div>
          <span className="text-[7.5px] font-mono text-slate-400 font-bold">
            {grade} • {subject}
          </span>
        </div>

        <div className="space-y-1.5">
          {peerLeaderboard.map((peer) => {
            const isMe = peer.isCurrentUser;
            let rankBadgeClass = "bg-slate-100 text-slate-600";
            if (peer.rank === 1) rankBadgeClass = "bg-amber-400 text-amber-950 font-black";
            else if (peer.rank === 2) rankBadgeClass = "bg-slate-300 text-slate-900 font-black";
            else if (peer.rank === 3 && !isMe) rankBadgeClass = "bg-amber-600 text-white font-black";

            return (
              <div
                key={peer.id}
                className={`p-2 rounded-xl border transition-all flex items-center justify-between ${
                  isMe
                    ? "bg-[#0a3641]/5 border-[#0a3641] shadow-[0_0_12px_rgba(10,54,65,0.08)] font-extrabold"
                    : "bg-white border-slate-100 text-slate-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-5.5 h-5.5 rounded-lg text-[8.5px] font-mono flex items-center justify-center shrink-0 ${rankBadgeClass}`}>
                    #{peer.rank}
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1">
                      <span className="text-[9.5px] font-bold text-[#0a3641]">
                        {peer.name}
                      </span>
                      {isMe && (
                        <span className="bg-[#0a3641] text-[#c4f500] text-[6.5px] font-mono font-black uppercase px-1.5 py-0.2 rounded-full">
                          YOU
                        </span>
                      )}
                    </div>
                    <span className="text-[7px] text-slate-400 block font-medium">
                      {peer.badge} • {peer.quizzes} Quizzes
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-mono font-black text-[#0a3641] block">
                    {peer.scoreAcc}%
                  </span>
                  <span className="text-[6.5px] text-slate-400 uppercase font-mono">Avg Accuracy</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* PAST ATTEMPTS HISTORY LOG FROM FIRESTORE */}
      <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-xs space-y-2.5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#0a3641]" />
            <h6 className="text-[9.5px] font-black uppercase tracking-wider text-[#0a3641]">
              Past Quiz History ({filteredAttempts.length})
            </h6>
          </div>

          {/* Subject Filter Pills */}
          <div className="flex items-center gap-1">
            {["all", subject, "General"].map((subKey) => (
              <button
                key={subKey}
                onClick={() => setFilterSubject(subKey)}
                className={`px-2 py-0.5 text-[7px] font-mono font-bold rounded-sm uppercase transition-all cursor-pointer ${
                  filterSubject.toLowerCase() === subKey.toLowerCase()
                    ? "bg-[#0a3641] text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {subKey}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-6 text-center space-y-2">
            <RefreshCw className="w-4 h-4 text-[#0a3641] animate-spin mx-auto" />
            <p className="text-[8.5px] font-mono text-slate-400 font-bold uppercase">Fetching Firestore Quiz Records...</p>
          </div>
        ) : filteredAttempts.length === 0 ? (
          <div className="py-6 text-center space-y-2 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
            <Brain className="w-7 h-7 text-slate-300 mx-auto" />
            <div className="space-y-0.5">
              <p className="text-[9.5px] font-bold text-slate-600">No Past Quiz Attempts Logged Yet</p>
              <p className="text-[8px] text-slate-400">Take your first aligned classroom quiz to appear on the Firestore leaderboard!</p>
            </div>
            <button
              onClick={onStartQuiz}
              className="mt-1 px-3 py-1 bg-[#c4f500] hover:bg-[#b5e200] text-[#0a3641] text-[8.5px] font-black rounded-xl inline-flex items-center gap-1 transition-all cursor-pointer shadow-xs"
            >
              <span>Take Your First Quiz Now ⚡</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar pr-0.5">
            {filteredAttempts.map((attempt, idx) => {
              const attemptAcc = attempt.accuracy !== undefined 
                ? attempt.accuracy 
                : Math.round(((attempt.score || 0) / (attempt.total || 1)) * 100);
              const isExpanded = expandedAttemptId === (attempt.id || `${idx}`);

              return (
                <div
                  key={attempt.id || idx}
                  className="bg-slate-50/70 border border-slate-150 p-2.5 rounded-xl space-y-1.5 hover:bg-slate-100/60 transition-all text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1">
                        <span className="text-[7px] font-mono font-bold text-slate-400 uppercase">
                          {attempt.formattedDate || "Recently"}
                        </span>
                        <span className="text-[6.5px] font-mono font-extrabold uppercase bg-slate-200 text-slate-600 px-1 py-0.2 rounded-xs">
                          {attempt.subject || subject}
                        </span>
                      </div>
                      <h6 className="text-[9px] font-extrabold text-slate-800 leading-tight">
                        {attempt.docName || "Classroom Live Quiz"}
                      </h6>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`text-[9.5px] font-black font-mono px-2 py-0.5 rounded-full inline-block ${
                        attemptAcc >= 80 
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200" 
                          : attemptAcc >= 60 
                          ? "bg-amber-100 text-amber-800 border border-amber-200" 
                          : "bg-rose-100 text-rose-800 border border-rose-200"
                      }`}>
                        {attempt.score}/{attempt.total} ({attemptAcc}%)
                      </span>
                    </div>
                  </div>

                  {attempt.history && attempt.history.length > 0 && (
                    <div className="pt-0.5">
                      <button
                        onClick={() => setExpandedAttemptId(isExpanded ? null : (attempt.id || `${idx}`))}
                        className="text-[7px] font-mono font-bold text-slate-500 hover:text-[#0a3641] flex items-center gap-1 cursor-pointer"
                      >
                        <span>{isExpanded ? "Hide Concept Breakdown ▲" : "View Concept Breakdown ▼"}</span>
                      </button>

                      {isExpanded && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-200 space-y-1 animate-fade-in">
                          <span className="text-[6.5px] font-mono uppercase font-bold text-slate-400 block">Tested Concepts:</span>
                          <div className="flex flex-wrap gap-1">
                            {attempt.history.map((h: any, hIdx: number) => (
                              <span
                                key={hIdx}
                                className={`text-[7px] font-mono px-1 py-0.2 rounded-xs border ${
                                  h.isCorrect 
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-800 font-bold" 
                                    : "bg-rose-50 border-rose-200 text-rose-800"
                                }`}
                              >
                                {h.conceptTested || `Q${hIdx + 1}`} {h.isCorrect ? "✓" : "✗"}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Action to start a new quiz */}
      <button
        onClick={onStartQuiz}
        className="w-full py-2.5 bg-[#c4f500] hover:bg-[#b5e200] text-[#0a3641] text-[9.5px] font-black rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 shadow-sm"
      >
        <Zap className="w-3.5 h-3.5 fill-[#0a3641]" />
        <span>START NEW QUIZ TO IMPROVE RANK ⚡</span>
      </button>

    </div>
  );
}

// Simple internal play icon component
function PlayIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      width="1em"
      height="1em"
    >
      <polygon points="6 3 20 12 6 21 6 3" fill="currentColor" />
    </svg>
  );
}
