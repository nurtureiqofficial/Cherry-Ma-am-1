import React, { useRef, useState, useEffect } from "react";
// @ts-ignore
import html2pdf from "html2pdf.js";
import { MathRenderer } from "./MathRenderer";
import { ChalkTypewriter } from "./ChalkTypewriter";
import { Trash2, GraduationCap, RefreshCw, BookOpen, Sparkles, HelpCircle, Send, Printer, ChevronDown, Power, MicOff, Maximize2, Minimize2 } from "lucide-react";
import { extractBoardContent } from "../utils/boardFilter";
import { triggerCelebrationConfetti } from "../utils/confetti";

interface ClassroomBoardProps {
  latestSpeech: string;
  state: string;
  primaryColor: string;
  accentColor: string;
  onClearBoard?: () => void;
  // Let student trigger interactive lesson prompts with Cherry out loud
  onSelectPrompt?: (promptText: string) => void;
  overrideBlank?: boolean;
  activeDocumentText?: string;
  hasActiveDocument?: boolean;
  studentAskedForWritingOrDrawing?: boolean;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  cherryVolume?: number;
  onOpenSyllabus?: () => void;
  onWakeUp?: () => void;
  teachingPhase?: string;
  customBoardContent?: string;
  onSaveSnapshot?: () => void;
  // Infinite scroll vertical timeline properties
  topics?: string[];
  activeTopicIndex?: number;
  topicBoardsContent?: Record<number, string>;
  onSyncBoardContent?: (topicIndex: number, content: string) => void;
  detectedSubject?: string;
  onCanvasRef?: (canvas: HTMLCanvasElement | null) => void;
  lessonTitle?: string;
}

export const ClassroomBoard: React.FC<ClassroomBoardProps> = ({
  latestSpeech,
  state,
  primaryColor,
  accentColor,
  onClearBoard,
  onSelectPrompt,
  overrideBlank = false,
  activeDocumentText,
  hasActiveDocument,
  studentAskedForWritingOrDrawing = false,
  isFullScreen = false,
  onToggleFullScreen,
  cherryVolume = 0,
  onOpenSyllabus,
  onWakeUp,
  teachingPhase = "intro",
  customBoardContent,
  onSaveSnapshot,
  topics = [],
  activeTopicIndex = 0,
  topicBoardsContent = {},
  onSyncBoardContent,
  detectedSubject,
  onCanvasRef,
  lessonTitle,
}) => {
    const [activeBoardContent, setActiveBoardContent] = useState("");
  const [isBoardTagActive, setIsBoardTagActive] = useState(false);
  const [isDeskExpanded, setIsDeskExpanded] = useState(false);
  const [showExitButton, setShowExitButton] = useState(false);
  const lastProcessedSpeechRef = useRef("");
  const boardSliceRef = useRef<HTMLDivElement>(null);
  const activeBlockRef = useRef<HTMLDivElement>(null);
  const [showJumpBadge, setShowJumpBadge] = useState(false);
  const timeoutRef = useRef<any>(null);

  // Pre-class interactive dashboard states
  const isLightBg = primaryColor === "#f9f9f6" || primaryColor.toLowerCase() === "#ffffff" || primaryColor.toLowerCase() === "#fbfbf9";
  const [chalkColor, setChalkColor] = useState<string>("#ffffff");

  useEffect(() => {
    if (isLightBg) {
      setChalkColor("#0f172a"); // Charcoal dark chalk
    } else {
      setChalkColor("#ffffff"); // White chalk
    }
  }, [primaryColor, isLightBg]);
  const [chalkWidth, setChalkWidth] = useState<number>(3);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const lastXRef = useRef<number>(0);
  const lastYRef = useRef<number>(0);

  // Daily Motivational Thoughts Collection
  const DAILY_MOTIVATIONAL_THOUGHTS = [
    {
      thoughtHi: "सफलता का कोई रहस्य नहीं है, यह तैयारी, कठिन परिश्रम और असफलता से सीखने का परिणाम है।",
      thoughtEn: "Success is no secret. It is the result of preparation, hard work, and learning from failure.",
      author: "Dr. A.P.J. Abdul Kalam",
      tag: "Hard Work & Dedication",
      icon: "🌟"
    },
    {
      thoughtHi: "उठो, जागो और तब तक मत रुको जब तक लक्ष्य की प्राप्ति न हो जाए।",
      thoughtEn: "Arise, awake, and stop not till the goal is reached.",
      author: "Swami Vivekananda",
      tag: "Focus & Determination",
      icon: "🚩"
    },
    {
      thoughtHi: "ज्ञान ही आपकी सबसे बड़ी शक्ति है। हर रोज़ 1% बेहतर बनने की कोशिश करें!",
      thoughtEn: "Knowledge is your greatest power. Strive to be 1% better every single day!",
      author: "Dr. B.R. Ambedkar",
      tag: "Power of Knowledge",
      icon: "📘"
    },
    {
      thoughtHi: "सपने वो नहीं जो हम सोते हुए देखते हैं, सपने वो हैं जो हमें सोने नहीं देते।",
      thoughtEn: "Dreams are not what you see in sleep, dreams are things which do not let you sleep.",
      author: "Dr. A.P.J. Abdul Kalam",
      tag: "Big Dreams",
      icon: "🚀"
    },
    {
      thoughtHi: "शिक्षा सबसे शक्तिशाली हथियार है जिससे आप दुनिया को बदल सकते हैं।",
      thoughtEn: "Education is the most powerful weapon which you can use to change the world.",
      author: "Nelson Mandela",
      tag: "Transformational Education",
      icon: "🌍"
    },
    {
      thoughtHi: "सफलता का सफर छोटा नहीं होता, लेकिन हर एक अध्याय आपको आपकी मंज़िल के करीब लाता है।",
      thoughtEn: "The journey of success is built step-by-step. Every chapter brings you closer to your goal.",
      author: "Albert Einstein",
      tag: "Continuous Progress",
      icon: "🔬"
    },
    {
      thoughtHi: "जो छात्र प्रश्न पूछता है वह 5 मिनट के लिए मूर्ख रहता है, लेकिन जो नहीं पूछता वह जीवन भर मूर्ख रहता है।",
      thoughtEn: "The student who asks a question is a fool for 5 minutes, but he who does not ask remains a fool forever.",
      author: "Chinese Proverb",
      tag: "Curiosity & Learning",
      icon: "💡"
    }
  ];

  const [thoughtIdx, setThoughtIdx] = useState<number>(() => {
    const day = new Date().getDate();
    return day % DAILY_MOTIVATIONAL_THOUGHTS.length;
  });

  const currentThought = DAILY_MOTIVATIONAL_THOUGHTS[thoughtIdx];

  const handleNextThought = () => {
    setThoughtIdx((prev) => (prev + 1) % DAILY_MOTIVATIONAL_THOUGHTS.length);
  };

  // Quiz warm-up state
  const [currentQuizIdx, setCurrentQuizIdx] = useState<number>(0);
  const [selectedQuizOption, setSelectedQuizOption] = useState<number | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<string>("");

  const quizzes = [
    {
      question: "Which of the following describes the Dual Nature of Matter?",
      options: [
        "A. Particle behavior only",
        "B. Wave behavior only",
        "C. Wave-Particle duality ⚛️",
        "D. None of these"
      ],
      correct: 2,
      successMsg: "Kya baat hai! Wave-Particle duality ekdum sahi jawab! 🎯",
      failMsg: "Arre re! Ek baar physics notes revise karo beta, de-Broglie wavelength socho! 🧠"
    },
    {
      question: "Solve this tricky mental math equation: 7 + 7 ÷ 7 + 7 × 7 - 7",
      options: [
        "A. 0",
        "B. 50 🎯",
        "C. 56",
        "D. 14"
      ],
      correct: 1, // 7 + 1 + 49 - 7 = 50
      successMsg: "Sahi answer! BODMAS rules rock! 🎯",
      failMsg: "BODMAS rule dhyan me rakho! Divide first, then multiply, then add, then subtract!"
    },
    {
      question: "Which gas is released when photosynthesis occurs?",
      options: [
        "A. Carbon Dioxide (CO2)",
        "B. Oxygen (O2) 🍀",
        "C. Nitrogen (N2)",
        "D. Hydrogen (H2)"
      ],
      correct: 1,
      successMsg: "Ekdum sahi! Oxygen (O2) release hoti hai aur carbon-dioxide consume hoti h! 🍀",
      failMsg: "Arre beta, plants hamein oxygen pradan karte haina? Koshish karo!"
    }
  ];

  // Checklist state
  const [checklist, setChecklist] = useState([
    { id: "notebook", text: "Rough notebook aur special pen ready kiya? 📝", completed: false },
    { id: "revised", text: "Revision Desk me purane flashcards revise kiye? 🧠", completed: false },
    { id: "mic", text: "Speaker aur micro-phone on karke test kiya? 🎙️", completed: false },
    { id: "water", text: "Paani ki bottle paas me rakh li? 💧", completed: false }
  ]);

  // Audio Ambient Synthesizer state
  const [isSynthPlaying, setIsSynthPlaying] = useState<boolean>(false);
  const audioCtxRef = useRef<any>(null);
  const synthNodesRef = useRef<any[]>([]);

  const toggleChecklist = (id: string) => {
    setChecklist(prev => prev.map(item => item.id === id ? { ...item, completed: !item.completed } : item));
  };

  const handleSelectQuizOption = (optionIdx: number) => {
    setSelectedQuizOption(optionIdx);
    if (optionIdx === quizzes[currentQuizIdx].correct) {
      setQuizFeedback(quizzes[currentQuizIdx].successMsg);
    } else {
      setQuizFeedback(quizzes[currentQuizIdx].failMsg);
    }
  };

  const nextQuiz = () => {
    setSelectedQuizOption(null);
    setQuizFeedback("");
    setCurrentQuizIdx((prev) => (prev + 1) % quizzes.length);
  };

  const startSynth = () => {
    try {
      // @ts-ignore
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      // Base nodes
      const masterVolume = ctx.createGain();
      masterVolume.gain.setValueAtTime(0.08, ctx.currentTime); // Soft volume
      
      const biquadFilter = ctx.createBiquadFilter();
      biquadFilter.type = "lowpass";
      biquadFilter.frequency.setValueAtTime(280, ctx.currentTime); // Warm low cutoff
      biquadFilter.Q.setValueAtTime(1.5, ctx.currentTime);

      masterVolume.connect(biquadFilter);
      biquadFilter.connect(ctx.destination);

      // 4 oscillators representing beautiful cozy chord tones
      const frequencies = [130.81, 196.00, 261.63, 329.63];
      const oscillators: any[] = [];

      frequencies.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = idx % 2 === 0 ? "triangle" : "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        
        // Organic slow pitch modulation
        const lfo = ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.setValueAtTime(0.25 + idx * 0.08, ctx.currentTime);
        
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(1.2, ctx.currentTime);
        
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        
        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(0.03, ctx.currentTime);
        
        osc.connect(oscGain);
        oscGain.connect(masterVolume);
        
        osc.start();
        lfo.start();

        oscillators.push(osc, lfo);
      });

      synthNodesRef.current = oscillators;
      setIsSynthPlaying(true);
    } catch (err) {
      console.warn("Failed to start pre-class ambient synthesizer:", err);
    }
  };

  const stopSynth = () => {
    try {
      synthNodesRef.current.forEach(node => {
        try { node.stop(); } catch (e) {}
      });
      synthNodesRef.current = [];
      
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close();
      }
      audioCtxRef.current = null;
      setIsSynthPlaying(false);
    } catch (e) {
      console.warn("Failed to stop synthesizer:", e);
    }
  };

  const toggleSynth = () => {
    if (isSynthPlaying) {
      stopSynth();
    } else {
      startSynth();
    }
  };

  // Canvas drawing handlers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDrawing(true);
    lastXRef.current = x;
    lastYRef.current = y;
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    drawChalkLine(lastXRef.current, lastYRef.current, x, y);
    
    lastXRef.current = x;
    lastYRef.current = y;
  };

  const handleCanvasMouseUp = () => {
    setIsDrawing(false);
  };

  // Touch drawing support
  const handleCanvasTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    if (!touch) return;
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    setIsDrawing(true);
    lastXRef.current = x;
    lastYRef.current = y;
  };

  const handleCanvasTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    if (!touch) return;
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    drawChalkLine(lastXRef.current, lastYRef.current, x, y);
    
    lastXRef.current = x;
    lastYRef.current = y;
  };

  const drawChalkLine = (x1: number, y1: number, x2: number, y2: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.strokeStyle = chalkColor;
    ctx.lineWidth = chalkWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    // Chalk texture effect: draw with partial opacity + multiple faint brush offsets to simulate dusty edges
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 3; i++) {
      const offset = (Math.random() - 0.5) * 1.5;
      ctx.beginPath();
      ctx.moveTo(x1 + offset, y1 + offset);
      ctx.lineTo(x2 + offset, y2 + offset);
      ctx.stroke();
    }
    
    // Core bold line
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    
    ctx.restore();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // Adjust canvas width/height on mount/render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement;
    if (!container) return;
    
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight || 240;
  }, [canvasRef, state]);

  // Propagate canvas ref to parent App.tsx for automatic recording
  useEffect(() => {
    if (onCanvasRef) {
      onCanvasRef(canvasRef.current);
    }
  }, [canvasRef, onCanvasRef]);

  // Clean up synthesizer on unmount
  useEffect(() => {
    return () => {
      stopSynth();
    };
  }, []);

  // Clean up full screen button timers
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Reset full screen exit button state when not in full screen
  useEffect(() => {
    if (!isFullScreen) {
      setShowExitButton(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    }
  }, [isFullScreen]);

  // Touch/Click handler to reveal the exit button in full screen
  const handleSlateClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isFullScreen) return;
    
    // Ignore clicks on buttons/inputs to avoid event conflicts
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input')) {
      return;
    }
    
    setShowExitButton((prev) => {
      const next = !prev;
      if (next) {
        // Automatically hide the button after 4 seconds of inactivity
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setShowExitButton(false);
        }, 4000);
      } else {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      }
      return next;
    });
  };

  // Propagate real-time whiteboard updates (derived from speaker transcript) back up to parent App
  useEffect(() => {
    if (onSyncBoardContent && activeBoardContent !== undefined) {
      onSyncBoardContent(activeTopicIndex, activeBoardContent);
    }
  }, [activeBoardContent, activeTopicIndex, onSyncBoardContent]);

  // Synchronically align vertical viewport to focus on the active topic block when it changes
  useEffect(() => {
    if (boardSliceRef.current && activeBlockRef.current) {
      const parent = boardSliceRef.current;
      const child = activeBlockRef.current;
      const scrollOffset = child.offsetTop - parent.offsetTop;
      
      parent.scrollTo({
        top: Math.max(0, scrollOffset - 24), // Leave a little padding at the top for aesthetic breathing room
        behavior: "smooth"
      });
    }
  }, [activeTopicIndex]);

  // Keep scrolling to match active writing updates if the student was already near the bottom
  useEffect(() => {
    if (boardSliceRef.current) {
      const el = boardSliceRef.current;
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 240;
      if (isAtBottom && activeBoardContent) {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: "smooth"
        });
      }
    }
  }, [activeBoardContent, teachingPhase]);

  // Handle manual scroll to show/hide the "Jump to Live Focus" floating badge
  const handleScroll = () => {
    if (boardSliceRef.current) {
      const el = boardSliceRef.current;
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 180;
      setShowJumpBadge(!isAtBottom);
    }
  };

  // Jump to active topic handler for student review convenience
  const handleJumpToActive = () => {
    if (boardSliceRef.current && activeBlockRef.current) {
      const parent = boardSliceRef.current;
      const child = activeBlockRef.current;
      const scrollOffset = child.offsetTop - parent.offsetTop;
      
      parent.scrollTo({
        top: Math.max(0, scrollOffset - 24),
        behavior: "smooth"
      });
    }
  };

  const isConnected = state !== "disconnected" && state !== "connecting" && state !== "error";

  interface AutoSavedDraft {
    id: string;
    timestamp: string;
    topicTitle: string;
    blobUrl: string;
    filename: string;
  }

  const [autoSavedDrafts, setAutoSavedDrafts] = useState<AutoSavedDraft[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const lastSavedContentRef = useRef<string>("");

  const handlePrintSession = async (silentFileName?: string): Promise<Blob | undefined> => {
    setIsPrinting(true);
    const originalGetComputedStyle = window.getComputedStyle;
    let iframeOriginalGetComputedStyle: any = null;
    let iframeWindowRef: any = null;

    // Safe replace of oklch and oklab if colors were not pre-calculated as standard RGB
    const resolveOklch = (prop: string, val: string): string => {
      if (!val || typeof val !== "string") return val;
      
      // Match OKLCH / OKLAB case insensitively
      const replaced = val.replace(/(oklch|oklab)\(([^)]+)\)/gi, (match, type, content) => {
        // Replace commas with space, and replace '/' slash with space to easily split
        const normalizedContent = content.replace(/,/g, " ").replace(/\//g, " ");
        const parts = normalizedContent.trim().split(/\s+/);
        const cleanParts = parts.filter(p => p !== "");
        
        let l = 1;
        const lPart = cleanParts[0];
        if (lPart) {
          if (lPart.endsWith("%")) {
            l = parseFloat(lPart) / 100;
          } else {
            l = parseFloat(lPart);
          }
        }
        if (isNaN(l)) l = 1;

        let opacity = 1;
        const lastPart = cleanParts[cleanParts.length - 1];
        // If there are 4 parts, or if slash was used, the last part represents opacity
        if (cleanParts.length >= 4) {
          if (lastPart.endsWith("%")) {
            opacity = parseFloat(lastPart) / 100;
          } else {
            opacity = parseFloat(lastPart);
          }
        }
        if (isNaN(opacity)) opacity = 1;

        const tLow = type.toLowerCase();
        if (tLow === "oklch" && cleanParts.length >= 3) {
          let h = parseFloat(cleanParts[2]);
          if (isNaN(h)) h = 0;
          let c = parseFloat(cleanParts[1]);
          if (isNaN(c)) c = 0;
          const s = Math.min(100, Math.round(c * 150));
          const lightness = Math.min(100, Math.round(l * 100));
          return `hsla(${Math.round(h)}, ${s}%, ${lightness}%, ${opacity})`;
        }

        if (tLow === "oklab" && cleanParts.length >= 3) {
          let a = parseFloat(cleanParts[1]);
          let b = parseFloat(cleanParts[2]);
          if (isNaN(a)) a = 0;
          if (isNaN(b)) b = 0;
          
          let r = Math.round(l * 255);
          let g = Math.round(l * 255);
          let bl = Math.round(l * 255);
          
          if (a > 0.02) {
            r = Math.min(255, r + 50);
            g = Math.max(0, g - 20);
          } else if (a < -0.02) {
            g = Math.min(255, g + 50);
            r = Math.max(0, r - 20);
          }
          if (b > 0.02) {
            r = Math.min(255, r + 30);
            g = Math.min(255, g + 30);
            bl = Math.max(0, bl - 40);
          } else if (b < -0.02) {
            bl = Math.min(255, bl + 50);
            r = Math.max(0, r - 20);
          }
          
          return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(bl)}, ${opacity})`;
        }

        const val255 = Math.round(l * 255);
        return `rgba(${val255}, ${val255}, ${val255}, ${opacity})`;
      });

      return replaced;
    };

    const makeSafeComputedStyle = (style: CSSStyleDeclaration) => {
      return new Proxy(style, {
        get(target, prop) {
          if (prop === 'getPropertyValue') {
            return function(propertyName: string) {
              const val = target.getPropertyValue(propertyName);
              return resolveOklch(propertyName, val);
            };
          }
          const val = Reflect.get(target, prop);
          if (typeof val === 'string') {
            return resolveOklch(String(prop), val);
          }
          if (typeof val === 'function') {
            return val.bind(target);
          }
          return val;
        }
      });
    };

    try {
      // Using locally bundled html2pdf.js package

      const element = document.getElementById("chalkboard-main-slate");
      if (!element) {
        if (!silentFileName) alert("Board content container not found!");
        return undefined;
      }

      // Create an iframe to render the element completely isolated (with no parent oklch stylesheets)
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-9999px";
      iframe.style.top = "0";
      iframe.style.width = `${element.clientWidth || 1024}px`;
      iframe.style.height = `${element.clientHeight || 768}px`;
      iframe.style.border = "none";
      document.body.appendChild(iframe);

      const iframeWindow = iframe.contentWindow;
      const iframeDoc = iframe.contentDocument || iframeWindow?.document;
      if (!iframeDoc || !iframeWindow) {
        throw new Error("Could not access iframe document");
      }

      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Export PDF</title>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Reenie+Beanie&family=Schoolbell&display=swap');
              body {
                margin: 0;
                padding: 0;
                background-color: ${primaryColor || "#0c201a"} !important;
                color: #ffffff !important;
              }
            </style>
          </head>
          <body></body>
        </html>
      `);
      iframeDoc.close();

      // Hook up getComputedStyle overrides
      window.getComputedStyle = function(el, pseudoElt) {
        const style = originalGetComputedStyle.call(window, el, pseudoElt);
        return makeSafeComputedStyle(style);
      };

      iframeOriginalGetComputedStyle = iframeWindow.getComputedStyle;
      iframeWindowRef = iframeWindow;
      iframeWindow.getComputedStyle = function(el, pseudoElt) {
        const style = iframeOriginalGetComputedStyle.call(iframeWindow, el, pseudoElt);
        return makeSafeComputedStyle(style);
      };

      // Clone stylesheet links except tailwind
      const parentStyleSheets = document.querySelectorAll("link[rel='stylesheet'], style");
      parentStyleSheets.forEach(sheetNode => {
        const href = sheetNode.getAttribute("href") || "";
        const isTailwind = href.includes("tailwind") || sheetNode.textContent?.includes("@import");
        if (!isTailwind) {
          iframeDoc.head.appendChild(sheetNode.cloneNode(true));
        }
      });

      // Clone root element
      const clone = element.cloneNode(true) as HTMLElement;
      // Strip interactive elements
      const controls = clone.querySelectorAll("button, form, input, textarea, a");
      controls.forEach(ctrl => ctrl.remove());

      // Essential styles to copy
      const PROPERTIES_TO_COPY = [
        "display", "flex-direction", "justify-content", "align-items", "flex-wrap", "flex-grow", "flex-shrink", "gap",
        "position", "top", "right", "bottom", "left", "z-index",
        "width", "height", "min-width", "min-height", "max-width", "max-height",
        "box-sizing",
        "padding-top", "padding-right", "padding-bottom", "padding-left",
        "margin-top", "margin-right", "margin-bottom", "margin-left",
        "font-family", "font-size", "font-weight", "line-height", "text-align", "text-transform", "letter-spacing",
        "color", "background-color", "background-image", "background-size", "background-position", "background-repeat",
        "border-top-width", "border-top-style", "border-top-color",
        "border-right-width", "border-right-style", "border-right-color",
        "border-bottom-width", "border-bottom-style", "border-bottom-color",
        "border-left-width", "border-left-style", "border-left-color",
        "border-radius", "border-collapse", "border-spacing",
        "box-shadow", "opacity", "overflow", "transform", "vertical-align"
      ];

      const inlineStylesRecursively = (srcNode: Element, destNode: Element) => {
        if (srcNode instanceof HTMLElement && destNode instanceof HTMLElement) {
          const computed = window.getComputedStyle(srcNode);
          for (const prop of PROPERTIES_TO_COPY) {
            const rawVal = computed.getPropertyValue(prop);
            const cleanVal = resolveOklch(prop, rawVal);
            destNode.style.setProperty(prop, cleanVal);
          }
        }
        const srcChildren = srcNode.children;
        const destChildren = destNode.children;
        for (let i = 0; i < srcChildren.length; i++) {
          if (srcChildren[i] && destChildren[i]) {
            inlineStylesRecursively(srcChildren[i], destChildren[i]);
          }
        }
      };

      inlineStylesRecursively(element, clone);

      // Force pixel measurements and stretch height to fit the full chronological vertical scrolling timeline!
      clone.style.width = `${element.getBoundingClientRect().width || 1024}px`;
      clone.style.height = "auto";
      clone.style.maxHeight = "none";
      clone.style.overflow = "visible";

      const clonedInnerSheet = clone.querySelector(".overflow-y-auto");
      if (clonedInnerSheet instanceof HTMLElement) {
        clonedInnerSheet.style.height = "auto";
        clonedInnerSheet.style.maxHeight = "none";
        clonedInnerSheet.style.overflow = "visible";
        clonedInnerSheet.style.paddingBottom = "40px"; // Spacing at the bottom for clean padding in PDF
      }

      iframeDoc.body.appendChild(clone);

      const nameToUse = silentFileName || `Cherry_Classroom_Session_${new Date().toISOString().slice(0, 10)}.pdf`;
      const opt = {
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: nameToUse,
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          backgroundColor: primaryColor || "#0c201a", 
          scrollX: 0,
          scrollY: 0
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const }
      };

      if (silentFileName) {
        const pdfBlob = await html2pdf().from(clone).set(opt).outputPdf("blob");
        document.body.removeChild(iframe);
        return pdfBlob;
      } else {
        await html2pdf().from(clone).set(opt).save();
      }

      document.body.removeChild(iframe);
    } catch (error) {
      console.error("Failed to generate PDF:", error);
    } finally {
      // Restore original getComputedStyle globally to avoid side effects
      window.getComputedStyle = originalGetComputedStyle;
      if (iframeWindowRef && iframeOriginalGetComputedStyle) {
        iframeWindowRef.getComputedStyle = iframeOriginalGetComputedStyle;
      }
      setIsPrinting(false);
    }
    return undefined;
  };

  // Automated background save functionality
  const triggerBackgroundAutoSave = async (reason: string) => {
    if (!activeBoardContent || activeBoardContent.trim() === "" || activeBoardContent === lastSavedContentRef.current) {
      return;
    }
    lastSavedContentRef.current = activeBoardContent;

    const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const filename = `Session_Auto_Draft_${Date.now()}.pdf`;

    const pdfBlob = await handlePrintSession(filename);
    if (pdfBlob && pdfBlob instanceof Blob) {
      const blobUrl = URL.createObjectURL(pdfBlob);
      const newDraft: AutoSavedDraft = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: timestampStr,
        topicTitle: reason,
        blobUrl: blobUrl,
        filename: `Cherry_Classroom_Whiteboard_Draft_${timestampStr.replace(/[:\s]/g, "_")}.pdf`
      };

      setAutoSavedDrafts(prev => [newDraft, ...prev].slice(0, 5));
    }
  };

  // Class completion trigger
  const lastStateRef = useRef(state);
  useEffect(() => {
    const prev = lastStateRef.current;
    const curr = state;
    lastStateRef.current = state;

    if ((prev === "connected" || prev === "idle") && curr === "disconnected") {
      triggerBackgroundAutoSave("Class Ended (Automatic Save)");
    }
  }, [state, activeBoardContent]);

  // Major section / Phase change complete trigger
  const lastPhaseRef = useRef(teachingPhase);
  useEffect(() => {
    const prev = lastPhaseRef.current;
    const curr = teachingPhase;
    lastPhaseRef.current = teachingPhase;

    if (prev && curr && prev !== curr) {
      triggerBackgroundAutoSave(`Phase Complete: ${prev.toUpperCase()}`);
      if (curr.toLowerCase() === "complete") {
        triggerCelebrationConfetti();
      }
    }
  }, [teachingPhase, activeBoardContent]);

  // Sync customBoardContent if provided by the parent
  useEffect(() => {
    if (customBoardContent !== undefined) {
      setActiveBoardContent((prev) => {
        if (prev.trim() === customBoardContent.trim()) return prev;
        setIsBoardTagActive(customBoardContent.trim() !== "");
        return customBoardContent;
      });
    }
  }, [customBoardContent]);
  const [customDoubtText, setCustomDoubtText] = useState("");
  const [showPhasePill, setShowPhasePill] = useState(true);

  useEffect(() => {
    if (teachingPhase) {
      setShowPhasePill(true);
      const timer = setTimeout(() => {
        setShowPhasePill(false);
      }, 3000); // Automatically hide after 3 seconds
      return () => clearTimeout(timer);
    }
  }, [teachingPhase]);

  const phasesList = ["intro", "concept", "example", "doubt", "transition"];

  // Sync latest speech to active blackboard state with persistent note rendering
  useEffect(() => {
    if (!latestSpeech || latestSpeech.trim() === "") {
      lastProcessedSpeechRef.current = "";
      return;
    }
    
    // Skip if we already fully processed this exact speech string to prevent endless state resets or stomp-overs on re-render
    if (latestSpeech === lastProcessedSpeechRef.current) return;
    lastProcessedSpeechRef.current = latestSpeech;
    
    // Check if the model explicitly wants to wipe/clear the board (empty board tag or clear board text trigger)
    const isWipeTrigger = latestSpeech.toLowerCase().includes("<board></board>") || 
                          latestSpeech.toLowerCase().includes("<board> //clear") ||
                          latestSpeech.toLowerCase().includes("<board>clear</board>") ||
                          latestSpeech.toLowerCase().includes("//clear board") ||
                          latestSpeech.toLowerCase().includes("clear the board") ||
                          latestSpeech.toLowerCase().includes("board clear kare");
                          
    if (isWipeTrigger) {
      setActiveBoardContent("");
      setIsBoardTagActive(false);
      return;
    }

    const hasBoardTags = latestSpeech.toLowerCase().includes("<board>");
    const hasActiveToolContent = customBoardContent && customBoardContent.trim() !== "";

    // If customBoardContent already has high-quality tool-generated content AND speech has no explicit <board> tags, return early to avoid conversational jitter
    if (hasActiveToolContent && !hasBoardTags) {
      return;
    }

    // Extract board tags if present in the current speech wave, or fall back to extracting noteworthy academic notes
    const extracted = extractBoardContent(latestSpeech);
    if (extracted && extracted.trim() !== "") {
      // SECURITY GUARD: If we have high-quality, pre-planned notes written by the 'updateWhiteboard' tool,
      // ONLY let spoken speech overwrite it if she explicitly voiced/typed the <board> tags.
      // This protects textbook definitions & clean vector drawings from being ruined by conversational fillers.
      if (hasActiveToolContent && !hasBoardTags) {
        return;
      }
      setActiveBoardContent(extracted);
      setIsBoardTagActive(true);
    }
  }, [latestSpeech, state, customBoardContent, hasActiveDocument]);
  
  // Subject Auto-Detector based on keywords
  const getSubject = (text: string) => {
    if (!text) return { name: "Classroom Introduction", icon: "🎒", theme: "text-rose-300 border-rose-500/30 bg-rose-950/20" };
    const norm = text.toLowerCase();
    if (norm.match(/\\frac|\\sum|\\prod|\\int|equation|quadratic|theorem|trigonometr|algebra|math|matrix|calculus|derive|coefficient|proof/)) {
      return { name: "Mathematics", icon: "📐", theme: "text-amber-300 border-amber-500/30 bg-amber-950/20" };
    }
    if (norm.match(/physics|gravity|mass|velocity|acceleration|quantum|photon|relativity|energy|force|newton|joule|einstein|thermodynamic|numerical/)) {
      return { name: "Physics", icon: "⚛️", theme: "text-blue-300 border-blue-500/30 bg-blue-950/20" };
    }
    if (norm.match(/biology|botany|zoology|cell|mitochondria|photosynthesis|dna|neuron|organism|organelle|plant|animal|chloroplast|genetics|evolution|anatomy/)) {
      return { name: "Biology (Botany + Zoology)", icon: "🌿", theme: "text-emerald-300 border-emerald-500/30 bg-emerald-950/20" };
    }
    if (norm.match(/chemistry|molecule|atom|bond|reaction|covalent|periodic|element|carbon|acid|base|h_2|h2o|co2|catalyst|molecular/)) {
      return { name: "Sci / Chemistry", icon: "🧬", theme: "text-emerald-300 border-emerald-500/30 bg-emerald-950/20" };
    }
    if (norm.match(/poetry|poem|literature|classic|shakespeare|sonnet|epic|rhyme|strophe|verse|metaphor|playwright/)) {
      return { name: "Literature & Art", icon: "📖", theme: "text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-950/20" };
    }
    return { name: "Cherry's Class Lecture", icon: "📚", theme: "text-zinc-300 border-zinc-700 bg-zinc-900/30" };
  };

  const subject = getSubject(activeBoardContent || latestSpeech);

  const fullClassroomReset = () => {
    setActiveBoardContent("");
    setIsBoardTagActive(false);
    if (onClearBoard) {
      onClearBoard();
    }
  };

  return (
    <div className="flex flex-col h-full w-full select-none" id="classroom-whiteboard-main">

      {/* Active Teaching Flow Phase Progress Tracker (State Machine Visualizer) */}
      <div 
        className="hidden" 
        id="teaching-phase-tracker"
      >
        <div className="flex items-center justify-between w-full md:w-auto shrink-0">
          <div className="flex items-center gap-1.5 font-sans text-[10px] text-slate-500 uppercase tracking-wider leading-none font-bold">
            <span className="flex h-1.5 w-1.5 shrink-0 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0a3641] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#0a3641]"></span>
            </span>
            <span>🧠 Teach-Flow State:</span>
          </div>
          {/* Mobile-only current state quick label */}
          <span className="md:hidden text-[9px] font-black text-[#0a3641] bg-[#c4f500]/25 px-2 py-0.5 rounded-full border border-[#0a3641]/10">
            Active: {(teachingPhase || "intro").toUpperCase()}
          </span>
        </div>
        
        {/* Horizontal scrollable row of states on mobile, clean list on desktop */}
        <div className="flex items-center gap-1.5 md:gap-2 text-[10px] font-sans font-semibold tracking-wide text-slate-500 overflow-x-auto no-scrollbar pb-1 md:pb-0 w-full md:w-auto touch-pan-x select-none">
          {[
            { key: "intro", label: "🎒 Intro & Prediction Poll", desc: "Prediction Poll" },
            { key: "concept", label: "🖊️ Concept Notes", desc: "Scaffolded Board" },
            { key: "example", label: "🔍 Deep Dive", desc: "Line-by-Line & Trap Alert" },
            { key: "doubt", label: "❓ Doubts & Probing", desc: "Socratic Practice" },
            { key: "transition", label: "🚀 Transition", desc: "Memory Retrieval" },
            { key: "complete", label: "🎓 Graduation", desc: "Class End" },
          ].map((phaseInfo, pIdx, arr) => {
            const isCurrent = (teachingPhase || "intro").toLowerCase() === phaseInfo.key.toLowerCase();
            const themeColors = isCurrent 
              ? "text-[#0a3641] border-[#0a3641]/35 bg-[#c4f500]/25 shadow-xs scale-[1.03] font-black" 
              : "text-slate-400 border-slate-200 bg-white hover:text-[#0a3641] hover:border-slate-300";
              
            return (
              <React.Fragment key={phaseInfo.key}>
                <div className={`px-2.5 py-1 rounded-full border flex items-center gap-1.5 transition-all duration-300 select-none cursor-default shrink-0 ${themeColors}`}>
                  <span className="whitespace-nowrap text-[8.5px] md:text-[10px] leading-tight font-sans">{phaseInfo.label}</span>
                  <span className="hidden md:inline-block h-2 w-[1px] bg-slate-300" />
                  <span className="text-[8px] opacity-75 font-mono select-none hidden md:inline-block font-semibold">{phaseInfo.desc}</span>
                </div>
                {pIdx < arr.length - 1 && (
                  <span className={`text-[8px] md:text-[10px] font-mono select-none transition-colors duration-300 shrink-0 ${isCurrent ? "text-[#0a3641] animate-pulse font-extrabold" : "text-slate-300 font-bold"}`}>
                    ➔
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* 💾 Background Whiteboard Backups Bar (Hidden as requested: notifications/bar should not show on screen) */}

      {/* Blackboard Content Area */}
      <div 
        className={`relative blackboard-chalk z-0 overflow-hidden flex flex-col w-full h-full min-h-0 ${
          isFullScreen ? "md:h-full md:max-h-none" : "md:h-[640px] md:max-h-[640px]"
        } ${isLightBg ? "light-board-chalk" : ""}`}
        id="chalkboard-main-slate"
        style={{
          backgroundColor: primaryColor,
          borderColor: accentColor ? `${accentColor}4d` : undefined, // 30% opacity border
          boxShadow: accentColor ? `inset 0 0 60px rgba(0, 0, 0, 0.9), 0 4px 30px rgba(0, 0, 0, 0.4), 0 0 20px ${accentColor}1a` : undefined
        }}
        onClick={handleSlateClick}
        onTouchStart={handleSlateClick}
      >


        {/* Universal Floating Exit Full Screen Button - Custom Animated & Touch Activated */}
        {isFullScreen && (
          <div 
            className={`absolute top-4 right-4 z-50 transition-all duration-300 ${
              showExitButton 
                ? "opacity-100 scale-100 translate-y-0 pointer-events-auto" 
                : "opacity-0 scale-75 -translate-y-2 pointer-events-none"
            }`}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFullScreen();
              }}
              className="px-4 py-2 bg-black/80 hover:bg-black text-white hover:text-[#c4f500] rounded-full border border-white/20 hover:border-[#c4f500]/50 shadow-2xl flex items-center gap-2 text-xs font-bold transition-all duration-200 cursor-pointer active:scale-90"
              title="Exit Full Screen Mode"
            >
              <Minimize2 className="w-4 h-4 text-[#c4f500]" />
              <span className="font-sans uppercase tracking-wider text-[10px]">Exit Full Fit</span>
            </button>
          </div>
        )}

        {/* Inner Scrollable Slate Sheet */}
        <div
          ref={boardSliceRef}
          onScroll={handleScroll}
          className={`flex-1 overflow-y-auto p-4 md:p-6 flex flex-col items-center ${
            (activeBoardContent || hasActiveDocument || (activeDocumentText && !overrideBlank) || (topics && topics.length > 0)) 
              ? "justify-start" 
              : "justify-center"
          } select-text scrollbar-thin scrollbar-thumb-emerald-900/60 scrollbar-track-transparent w-full pb-28 touch-pan-y`}
        >
          {/* TEACHER'S ACTIVE EXPLANATIONS (Rendered like realistic chalk equations) */}
          <div className="w-full max-w-4xl lg:max-w-5xl text-center space-y-4 z-10 relative pointer-events-auto">
          {topics && topics.length > 0 ? (
            <div className="w-full text-left space-y-8 py-2 animate-chalk-fade">
              {/* Pre-Class Ready State before clicking Start Class */}
              {state === "disconnected" ? (
                <div className="w-full max-w-2xl mx-auto py-8 px-6 bg-[#0a1a14]/90 border border-[#c4f500]/25 rounded-2xl text-center space-y-5 shadow-2xl backdrop-blur-md animate-chalk-fade my-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#c4f500]/10 border border-[#c4f500]/30 text-[#c4f500] font-mono text-[10px] uppercase font-bold tracking-widest">
                    <span className="w-2 h-2 rounded-full bg-[#c4f500] animate-ping" />
                    <span>🎓 Classroom Board Ready</span>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-lg md:text-xl font-black font-sans text-zinc-100 tracking-wide">
                      {detectedSubject ? `${detectedSubject.toUpperCase()} • ` : ""}
                      {topics[activeTopicIndex]?.split("\n")[0]?.replace(/[\#\*\_]/g, "").trim() || "Uploaded Syllabus"}
                    </h3>
                    <p className="text-xs text-zinc-300 font-sans max-w-md mx-auto leading-relaxed">
                      Syllabus is loaded in Cherry Ma'am's memory! Click below to start your live interactive lesson. She will explain live and write chalkboard notes step-by-step.
                    </p>
                  </div>

                  {topics.length > 0 && (
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1 max-w-lg mx-auto">
                      {topics.map((t, tIdx) => {
                        const tHeader = t.split("\n")[0]?.replace(/[\#\*\_]/g, "").trim() || `Part ${tIdx + 1}`;
                        return (
                          <span
                            key={tIdx}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border ${
                              tIdx === activeTopicIndex
                                ? "bg-[#c4f500]/20 border-[#c4f500]/50 text-[#c4f500]"
                                : "bg-zinc-800/60 border-zinc-700/50 text-zinc-400"
                            }`}
                          >
                            Part {tIdx + 1}: {tHeader.length > 25 ? tHeader.substring(0, 25) + "..." : tHeader}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {onWakeUp && (
                    <div className="pt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onWakeUp();
                        }}
                        className="px-6 py-3 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-black font-mono text-xs tracking-wider uppercase rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.35)] transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer inline-flex items-center gap-2 relative z-10 pointer-events-auto"
                      >
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-900 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-950"></span>
                        </span>
                        <span>▶ WAKE UP CHERRY MA'AM TO START CLASS 🎙️🎓</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : state === "connecting" ? (
                /* Connecting State Card */
                <div className="w-full max-w-xl mx-auto py-10 px-6 bg-[#081812]/90 border border-emerald-500/30 rounded-2xl text-center space-y-3 shadow-2xl animate-pulse my-6">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center mx-auto text-emerald-400 font-mono text-lg">
                    ✍️
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-extrabold font-mono text-emerald-300 uppercase tracking-wider">
                      Connecting to Cherry Ma'am...
                    </p>
                    <p className="text-[11px] text-zinc-400 font-sans">
                      Setting up Phase 1: Interactive Mystery Hook & Live Chalkboard Notes
                    </p>
                  </div>
                </div>
              ) : (
                /* Active Classroom Session Topics Display */
                topics.slice(0, activeTopicIndex + 1).map((topicText, idx) => {
                  const isCurrent = idx === activeTopicIndex;
                  const headerLine = topicText.split("\n")[0] || "";
                  const cleanHeader = headerLine.replace(/[\#\*\_]/g, "").trim() || `Topic Part ${idx + 1}`;
                  
                  // Live topic gets activeBoardContent (Cherry Ma'am's updateWhiteboard output)
                  // Previous topics get their saved topicBoardsContent[idx]
                  const blockContent = isCurrent 
                    ? activeBoardContent 
                    : (topicBoardsContent[idx] || "");
                  
                  return (
                    <div
                      key={idx}
                      ref={isCurrent ? activeBlockRef : null}
                      className={`w-full border-b border-[#dae1dd]/10 pb-8 pt-4 transition-all duration-300 relative ${
                        isCurrent
                          ? "px-2 md:px-4"
                          : "opacity-50 hover:opacity-85 px-2 md:px-4"
                      }`}
                    >
                      {/* Header bar */}
                      <div className="flex items-center justify-between mb-4 select-none">
                        <div className="flex items-center space-x-2">
                          <span 
                            className={`px-2 py-0.5 rounded text-[9px] font-mono tracking-widest font-bold ${
                              isCurrent ? "" : "bg-zinc-800 text-zinc-400"
                            }`}
                            style={isCurrent ? {
                              backgroundColor: accentColor ? `${accentColor}40` : "rgba(196, 245, 0, 0.25)",
                              color: accentColor || "#c4f500"
                            } : undefined}
                          >
                            TOPIC {idx + 1}
                          </span>
                          <h4 className={`text-xs md:text-sm font-sans font-black tracking-wide ${
                            isCurrent ? "text-zinc-100" : "text-zinc-400"
                          }`}>
                            {cleanHeader}
                          </h4>
                        </div>
                        <div>
                          {!isCurrent && (
                            <span className="px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-300 border border-teal-500/20 text-[8.5px] font-mono tracking-wider font-bold">
                              PAST LECTURE NOTE 📚
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Chalk calculations content */}
                      <div className="chalk-font px-2 md:px-4 leading-loose tracking-wide text-zinc-100 select-text w-full text-left">
                        {(() => {
                          const currentPhase = (teachingPhase || "intro").toLowerCase();
                          const isIntro = currentPhase === "intro";
                          const effectiveBlockContent = blockContent || (isCurrent && isIntro 
                            ? `${cleanHeader.startsWith("#") ? cleanHeader : "# " + cleanHeader}\n\n### ❓ PREDICTION POLL: Option A vs Option B\nListen to Cherry Ma'am's real-world mystery hook and predict the correct option!` 
                            : "");

                          return effectiveBlockContent ? (
                            <ChalkTypewriter
                              text={effectiveBlockContent}
                              state={isCurrent ? state : "idle"}
                              cherryVolume={isCurrent ? cherryVolume : 0}
                              latestSpeech={isCurrent ? latestSpeech : ""}
                              isAcademicNotes={!isCurrent || !!(customBoardContent && customBoardContent.trim() !== "")}
                              isFallback={false}
                            />
                          ) : isCurrent ? (
                            <div className="py-6 px-4 rounded-xl bg-black/30 border border-emerald-500/15 text-center space-y-2 animate-pulse">
                              <span className="text-[10px] font-mono uppercase font-bold text-emerald-400 tracking-wider">
                                ⚡ PHASE 1: PREDICTION POLL ACTIVE
                              </span>
                              <p className="text-xs text-zinc-300 font-sans">
                                Cherry Ma'am is drawing live chalk schematics & writing mystery questions on this board...
                              </p>
                            </div>
                          ) : (
                            <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest italic py-3 select-none">
                              No notes written on this past topic.
                            </p>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : activeBoardContent ? (
            <div className="animate-chalk-fade text-left w-full">
              {/* Slate text details and calculations */}
              <div className="chalk-font px-2 md:px-4 leading-loose tracking-wide text-zinc-100 select-text w-full">
                <ChalkTypewriter 
                  text={activeBoardContent} 
                  state={state} 
                  cherryVolume={cherryVolume} 
                  latestSpeech={latestSpeech} 
                  isAcademicNotes={!!(customBoardContent && customBoardContent.trim() !== "")}
                />
              </div>
            </div>
          ) : hasActiveDocument ? (
            <div className="text-zinc-400 py-10 space-y-5 text-center flex flex-col items-center justify-center animate-chalk-fade">
              <BookOpen className="w-14 h-14 mx-auto stroke-[1.2] opacity-40 text-amber-400 animate-pulse-slow" />
              <div className="space-y-1.5 font-mono text-xs tracking-widest leading-relaxed">
                <p className="font-bold uppercase text-amber-400">📚 Syllabus Document Sync Mode</p>
                <p className="text-[10.5px] text-zinc-300 font-sans tracking-wide max-w-md mx-auto normal-case font-medium leading-relaxed px-4">
                  Today's chapters are synced inside Cherry Ma'am's memory! She will write notes on this board topic-by-topic as we discuss each section.
                </p>
                <p className="text-[10px] text-emerald-450 max-w-sm mx-auto flex items-center justify-center gap-1.5 mt-2 bg-emerald-950/20 border border-emerald-900/30 py-1.5 px-3 rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Topic-wise chalkboard flow active</span>
                </p>
              </div>
              {state === "disconnected" && onWakeUp && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onWakeUp();
                  }}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-600 hover:shadow-[0_0_15px_rgba(244,63,94,0.4)] text-white font-bold font-mono text-[10px] tracking-wider uppercase rounded-xl transition-all duration-300 hover:scale-105 cursor-pointer flex items-center gap-2 relative z-10 pointer-events-auto shadow-md"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/80 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-200"></span>
                  </span>
                  <span>WAKE UP CHERRY MA'AM TO START CLASS 🎙️🎓</span>
                </button>
              )}
            </div>
          ) : overrideBlank ? (
            <div className="text-stone-400/50 py-10 space-y-3 text-center animate-pulse">
              <span className="text-2xl">⚡</span>
              <p className="font-mono text-[10px] uppercase tracking-widest font-bold">Cherry is ready. Waiting for "Wake Up" click...</p>
            </div>
          ) : (
            <div className="w-full max-w-5xl mx-auto py-6 px-4 text-left space-y-8 select-none pointer-events-auto animate-fade-in">
              
              {/* Majestic Pre-Class Interactive Header */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-emerald-950/40 pb-5 gap-4 relative">
                {/* Subtle top decoration */}
                <div className="absolute top-0 left-0 w-24 h-[1px] bg-gradient-to-r from-[#c4f500]/60 to-transparent" />
                
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/40 border border-emerald-900/35 backdrop-blur-md shadow-inner">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#c4f500]/60 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#c4f500]"></span>
                    </span>
                    <span className="text-[9.5px] font-mono tracking-widest font-black text-[#c4f500] uppercase">CLASSROOM HUB ACTIVE</span>
                  </div>
                  <h3 className="text-2xl font-sans font-black text-white tracking-tight uppercase leading-none">
                    Cherry Ma'am's <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-[#c4f500] drop-shadow-sm">Interactive Classroom</span>
                  </h3>
                  <p className="text-xs text-zinc-400 font-sans font-medium leading-relaxed max-w-2xl">
                    Ab Blackboard fully interactive hai! Class shuru hone se pehle digi-slate par scribble karke likhein ya preparation check karein.
                  </p>
                </div>
                
                {/* Pre-Class Advanced Focus Audio & Subject Widget */}
                <div className="flex flex-wrap items-center gap-3 shrink-0 lg:self-center">
                  {/* Focus Audio Synthesizer */}
                  <button
                    onClick={toggleSynth}
                    className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border transition-all duration-300 cursor-pointer text-[10px] font-mono font-bold uppercase ${
                      isSynthPlaying
                        ? "bg-[#c4f500]/10 border-[#c4f500]/40 text-[#c4f500] shadow-[0_0_15px_rgba(196,245,0,0.15)] scale-[1.02]"
                        : "bg-zinc-950/40 border-zinc-900/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-800"
                    }`}
                    title="Toggle study-friendly relaxing synth background sound"
                  >
                    <div className="flex items-center gap-1">
                      <span className={`w-1 h-3 bg-current rounded-full transition-all duration-300 ${isSynthPlaying ? "animate-[bounce_0.8s_infinite]" : "opacity-60"}`} />
                      <span className={`w-1 h-4 bg-current rounded-full transition-all duration-300 ${isSynthPlaying ? "animate-[bounce_0.8s_infinite_0.15s]" : "opacity-60"}`} style={{ animationDelay: "0.1s" }} />
                      <span className={`w-1 h-2 bg-current rounded-full transition-all duration-300 ${isSynthPlaying ? "animate-[bounce_0.8s_infinite_0.3s]" : "opacity-60"}`} style={{ animationDelay: "0.2s" }} />
                    </div>
                    <span>{isSynthPlaying ? "Focus Audio: ON" : "Ambient Synth"}</span>
                  </button>

                  {/* Subject Tag */}
                  <div className="flex items-center gap-2.5 bg-zinc-950/45 border border-emerald-950/30 rounded-xl px-4 py-2 hover:border-emerald-900/30 transition-colors duration-300">
                    <GraduationCap className="w-5 h-5 text-[#c4f500] drop-shadow-[0_0_8px_rgba(196,245,0,0.3)]" />
                    <div className="text-left font-mono">
                      <p className="text-[8.5px] text-zinc-500 uppercase tracking-widest font-extrabold">Active Class Subject</p>
                      <p className="text-xs text-zinc-100 font-black tracking-wide">{detectedSubject || "General Science / Maths"}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bento Grid: Redesigned Premium Classroom Lobby & Study Prep Area */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                
                {/* Scoped CSS for premium micro-animations (Neon waves and glows) */}
                <style dangerouslySetInnerHTML={{ __html: `
                  @keyframes preClassWave {
                    0%, 100% {
                      transform: scaleY(0.2);
                      opacity: 0.55;
                    }
                    50% {
                      transform: scaleY(1);
                      opacity: 1;
                      filter: drop-shadow(0 0 4px #c4f500);
                    }
                  }
                  .animate-diagnostics-wave {
                    animation: preClassWave 1.2s infinite ease-in-out;
                  }
                `}} />

                {/* 1. Daily Motivational Thought Card on Blackboard */}
                <div className="lg:col-span-12 bg-[#020b08]/95 border border-amber-500/30 rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-2xl relative overflow-hidden group min-h-[380px] hover:border-amber-400/50 transition-all duration-300">
                  {/* Decorative glowing ambient meshes */}
                  <div className="absolute -top-12 -left-12 w-56 h-56 rounded-full bg-amber-500/10 blur-[70px] pointer-events-none" />
                  <div className="absolute -bottom-20 -right-20 w-56 h-56 rounded-full bg-emerald-500/10 blur-[70px] pointer-events-none" />
                  
                  <div className="space-y-6 z-10 flex-1 flex flex-col justify-between">
                    {/* Header: Daily Motivational Thought Badge */}
                    <div className="flex flex-wrap items-center justify-between border-b border-amber-900/30 pb-4 gap-3">
                      <div className="space-y-1 text-left">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-950/50 border border-amber-500/30 backdrop-blur-md">
                          <span className="text-amber-400 animate-pulse text-xs">🌟</span>
                          <span className="text-[10px] font-mono tracking-widest font-black text-amber-300 uppercase">
                            DAILY MOTIVATIONAL THOUGHT • आज का विचार
                          </span>
                        </div>
                        <h4 className="text-lg font-sans font-black tracking-tight text-white uppercase flex items-center gap-2 mt-1">
                          Inspiration for Learning & Growth {currentThought.icon}
                        </h4>
                      </div>

                      {/* Next Thought Button */}
                      <button
                        onClick={handleNextThought}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:text-amber-200 text-xs font-mono font-bold rounded-xl transition-all duration-200 cursor-pointer active:scale-95 shadow-sm"
                        title="Read another motivational thought"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Next Thought / अगला विचार</span>
                      </button>
                    </div>

                    {/* Main Quote Display Card */}
                    <div className="bg-zinc-950/80 border border-amber-500/20 rounded-2xl p-6 sm:p-7 relative text-left space-y-4 shadow-inner">
                      {/* Big decorative quotation mark */}
                      <span className="absolute -top-3 left-6 text-6xl text-amber-500/20 font-serif leading-none select-none pointer-events-auto">“</span>

                      {/* Hindi Quote */}
                      <p className="text-lg sm:text-xl font-sans font-bold text-amber-100 leading-relaxed tracking-wide pt-2">
                        "{currentThought.thoughtHi}"
                      </p>

                      {/* English Quote */}
                      <p className="text-xs sm:text-sm font-sans italic text-zinc-300 leading-relaxed border-l-2 border-amber-400/50 pl-4 py-0.5">
                        "{currentThought.thoughtEn}"
                      </p>

                      {/* Author & Tag Footer */}
                      <div className="flex flex-wrap items-center justify-between pt-3 border-t border-zinc-900/80 gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">✒️</span>
                          <span className="text-xs sm:text-sm font-mono font-black text-[#c4f500] tracking-wide">
                            — {currentThought.author}
                          </span>
                        </div>

                        <span className="text-[10px] font-mono font-bold px-3 py-1 rounded-md bg-amber-950/40 border border-amber-500/20 text-amber-300 uppercase tracking-wider">
                          🏷️ {currentThought.tag}
                        </span>
                      </div>
                    </div>

                    {/* Pre-Class Warm-Up Prompting Trigger */}
                    <div className="border-t border-emerald-950/30 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 z-10">
                      <div className="text-left">
                        <p className="text-[9px] font-mono font-black text-amber-400 uppercase tracking-widest">
                          Quick Start Prompts:
                        </p>
                        <p className="text-[10.5px] text-zinc-400 leading-normal font-sans font-semibold">
                          Click a prompt or wake up Cherry Ma'am to begin!
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {[
                          detectedSubject === "Biology" ? "Introductory overview bataiye" : "Core concepts explain kariye",
                          "Real-world application dikhaiye",
                          "Basic formula summary likhein",
                          "line by line padhkar samjhaye",
                          "Diagram se samjhaye"
                        ].map((prompt, pIdx) => (
                          <button
                            key={pIdx}
                            onClick={() => onSelectPrompt && onSelectPrompt(prompt)}
                            className="px-3 py-1.5 bg-zinc-950/60 hover:bg-zinc-900 text-[10px] font-sans font-bold text-zinc-300 hover:text-white border border-zinc-800 hover:border-amber-400/40 rounded-xl transition-all duration-200 cursor-pointer active:scale-95 shadow-xs"
                          >
                            💡 {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pulsing Class Launch CTA Station */}
              <div className="pt-2 flex flex-col items-center text-center space-y-4">
                {state === "disconnected" && onWakeUp ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      stopSynth(); // auto close synth on wake up
                      onWakeUp();
                    }}
                    className="py-4 px-10 text-white font-black font-sans text-xs tracking-wider uppercase rounded-2xl transition-all duration-300 hover:scale-[1.04] active:scale-97 cursor-pointer flex items-center justify-center gap-3 relative shadow-2xl border transition-shadow group/wake"
                    style={{
                      background: `linear-gradient(135deg, #f43f5e 0%, #e11d48 50%, #be123c 100%)`,
                      borderColor: "rgba(255, 255, 255, 0.25)",
                      boxShadow: "0 10px 25px rgba(225, 29, 72, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)"
                    }}
                  >
                    <span className="relative flex h-3.5 w-3.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/70 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-200"></span>
                    </span>
                    <span className="font-black tracking-widest text-shadow flex items-center gap-2">
                      WAKE UP CHERRY MA'AM TO START CLASS <span className="animate-[bounce_1s_infinite]">🎙️🎓</span>
                    </span>
                  </button>
                ) : (
                  onOpenSyllabus && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenSyllabus();
                      }}
                      className="w-full max-w-md py-3 px-5 border border-dashed bg-white/[0.02] hover:bg-white/[0.05] text-white rounded-xl text-[10px] font-sans tracking-widest uppercase font-black transition-all duration-300 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-md"
                      style={{
                        borderColor: accentColor ? `${accentColor}33` : "rgba(255, 255, 255, 0.1)"
                      }}
                    >
                      <span style={{ color: accentColor || "#c4f500" }}>📚 Upload Course Syllabus or Lesson Plan</span>
                      <span 
                        className="text-[8px] px-1.5 py-0.5 rounded font-mono font-bold uppercase"
                        style={{ 
                          backgroundColor: accentColor ? `${accentColor}1a` : "rgba(196, 245, 0, 0.1)",
                          color: accentColor || "#c4f500"
                        }}
                      >
                        Click Here
                      </span>
                    </button>
                  )
                )}
              </div>
            </div>
          )}
        </div>
        </div>

        {/* Wood frame Chalk Ledge aesthetic bottom bar */}
        <div className="absolute bottom-0 inset-x-0 h-2 bg-[#422204] z-10 border-t border-black/30 flex items-center shadow-lg pointer-events-none select-none">
          <div className="w-12 h-1 bg-amber-100 rounded opacity-60 ml-10 shadow-inner" title="White Chalk stick" />
          <div className="w-8 h-1 bg-yellow-250 rounded opacity-60 ml-4 shadow-inner" title="Yellow Chalk stick" />
          <div className="w-10 h-1 bg-rose-200 rounded opacity-60 ml-3 shadow-inner" title="Pink Chalk stick" />
          <div className="w-14 h-2 bg-[#8c5a2b] rounded-t border-t border-black/40 ml-auto mr-12 shadow" title="Wooden Eraser block" />
        </div>
      </div>

      {/* 🛠️ CONTROL PANEL & INTERACTIVE DESK SLOTS (Pristinely separated from the physical blackboard) */}
      {false && (isDeskExpanded || (teachingPhase || "").toLowerCase() === "doubt" || (teachingPhase || "").toLowerCase() === "example") && (
        <div className="border-t border-zinc-900 bg-zinc-955/40 p-4" id="classroom-active-overlay-desks">
          <div className="max-w-7xl mx-auto">
            
            {/* STATE 2 FLOW DIAGRAM OVERLAY (Doubt-Buster State Machine Map / Phase 4 Evaluation Desk) */}
            {(teachingPhase || "").toLowerCase() === "doubt" && (
              <div className="p-4 border border-dashed border-amber-500/35 bg-zinc-900/40 backdrop-blur rounded-xl space-y-4 max-w-4xl mx-auto text-left pointer-events-auto shadow-[0_0_20px_rgba(245,158,11,0.12)] animate-chalk-fade relative z-10 select-none">
                <div className="flex items-center justify-between font-mono text-[9px] tracking-wider border-b border-zinc-900 pb-2">
                  <span className="text-amber-400 font-bold flex items-center gap-1.5 uppercase animate-pulse">
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping shrink-0" />
                    🎓 PHASE 4 ACTIVE: EVALUATION (MULYANKAN & SAWAL-JAWAB)
                  </span>
                  <span className="text-zinc-500 font-semibold uppercase">Interactive Desk</span>
                </div>
                
                <p className="text-[11px] text-zinc-350 leading-relaxed font-sans">
                  Cherry Ma'am has paused the active syllabus queue to conduct a <strong>quick conceptual check / feedback loop</strong>. Assess your understanding or answer her queries instantly using the desk controllers below:
                </p>

                {/* Interactive Confidence Level Grader - "Crystal-Clear Meter" */}
                <div className="bg-zinc-950/80 border border-zinc-800/85 p-3 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-amber-300 font-bold uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-400" /> Rate Your Understanding:
                    </span>
                    <span className="text-[9px] font-mono text-zinc-500">Generates custom doubt/feedback prompt</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { 
                        label: "🌟 100% Clear!", 
                        desc: "Duniya hila denge!", 
                        promptText: "Haan Ma'am, bilkul crystal-clear ho gaya! Koi doubt nahi h, dynamic concept completely clear. Let's move to the next topic of the syllabus! 🚀" 
                      },
                      { 
                        label: "🧐 75% Clear!", 
                        desc: "Need small recap", 
                        promptText: "Ma'am, 75% thoda-thoda samajh aya, but is concept ka real-life application example dubaara ek baar samjhao na please! 🔄" 
                      },
                      { 
                        label: "⚠️ 50% Clear!", 
                        desc: "Formula is confusing", 
                        promptText: "Ma'am, concept me maza toh aya par whiteboard pe jo mathematical formula likha h use dubaara expand karke batao na, thoda doubt h." 
                      },
                    ].map((lvl, index) => (
                      <button
                        key={index}
                        type="button"
                        disabled={!isConnected}
                        onClick={() => onSelectPrompt && onSelectPrompt(lvl.promptText)}
                        className="p-2 border border-zinc-800 hover:border-amber-500/80 bg-zinc-950/50 hover:bg-amber-500/10 text-left rounded-lg transition-all cursor-pointer group disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <div className="text-[10px] font-bold text-zinc-150 group-hover:text-amber-300 leading-tight">{lvl.label}</div>
                        <div className="text-[8px] text-zinc-500 font-mono tracking-tight mt-0.5 leading-none group-hover:text-zinc-400">{lvl.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dynamic Q&A Responses for Mulyankan Phase */}
                <div className="bg-zinc-950/80 border border-zinc-800/85 p-3 rounded-xl space-y-2.5">
                  <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
                    <HelpCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> Quick Response Cards:
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { title: "👍 'Bilkul clear hai' Response", text: "Haan Ma'am, sab samajh aa gaya! Main ready hoon agla topic padhne ke liye." },
                      { title: "🔄 'Repeat please' request", text: "Ma'am, whiteboard par jo abhi cyclic notes ya mathematical definition likhi hai use thoda high-level recap kardo please." },
                      { title: "⚡ Ask for shortcut trick", text: "Ma'am, is topic me standard formula solve karne ki koi simple mathematical shortcut key ya trick hai kya? Bataiye na!" },
                      { title: "🎨 Quick SVG vector inquiry", text: "Ma'am, can you draw a quick geometric SVG layout or graph mapping this circular diagram on the blackboard?" }
                    ].map((res, index) => (
                      <button
                        key={index}
                        type="button"
                        disabled={!isConnected}
                        onClick={() => onSelectPrompt && onSelectPrompt(res.text)}
                        className="px-2.5 py-1.5 border border-zinc-800/80 hover:border-emerald-500 bg-zinc-955/20 hover:bg-emerald-500/10 text-left rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <div className="text-[9.5px] font-semibold text-zinc-350 hover:text-white leading-tight">{res.title}</div>
                        <div className="text-[7.5px] text-zinc-500 truncate mt-1 leading-none">{res.text}</div>
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Dynamic Step visual map */}
                <div className="grid grid-cols-5 gap-2 text-center pt-2 select-none border-t border-zinc-900">
                  {[
                    { label: "1. Intro Story", desc: "Prichey Hook", key: "intro" },
                    { label: "2. Chalk Board", desc: "Notes-making", key: "concept" },
                    { label: "3. Deep Dive", desc: "Explanation", key: "example" },
                    { label: "4. Sawal Jawab", desc: "Doubt-solving", key: "doubt" },
                    { label: "5. Next Step", desc: "Transition", key: "transition" },
                  ].map((step, sIdx) => {
                    const isStepCurrent = (teachingPhase || "intro").toLowerCase() === step.key;
                    const isStepDone = phasesList.indexOf((teachingPhase || "intro").toLowerCase()) > sIdx;
                    return (
                      <div key={sIdx} className={`p-1 px-1.5 rounded-lg border text-[8.2px] flex flex-col items-center justify-between h-[45px] transition-all duration-300 ${
                        isStepCurrent 
                          ? "border-amber-400 bg-amber-500/10 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.25)] scale-[1.01]" 
                          : isStepDone 
                            ? "border-emerald-500/30 bg-emerald-950/10 text-emerald-400" 
                            : "border-zinc-900 bg-zinc-950/45 text-zinc-650"
                      }`}>
                        <span className="font-bold tracking-wide uppercase leading-tight whitespace-nowrap">{step.label}</span>
                        <span className="text-[7px] opacity-75 mt-0.5 font-mono leading-none">{step.desc}</span>
                      </div>
                    );
                  })}
                </div>
                
                <div className="text-[8px] text-zinc-500 text-center font-mono leading-tight">
                  💡 Hint: When you are content with her answer, say "Samajh gaya Ma'am, next topic!" to proceed to Phase 5: Transition.
                </div>
              </div>
            )}

            {/* STATE 3 FLOW DIAGRAM OVERLAY (Deep Dive / Lab Simulation Map) */}
            {((isDeskExpanded && (teachingPhase || "").toLowerCase() !== "doubt") || (teachingPhase || "").toLowerCase() === "example") && (
              <div className="p-4 border border-dashed border-emerald-500/35 bg-zinc-900/40 backdrop-blur rounded-xl space-y-3 max-w-4xl mx-auto text-left pointer-events-auto shadow-[0_0_15px_rgba(16,185,129,0.08)] animate-chalk-fade relative z-10 select-none">
                <div className="flex items-center justify-between font-mono text-[9px] tracking-wider">
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5 uppercase animate-pulse">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                    🔬 ORCHESTRATOR STATE MACHINE: STATE 3 ACTIVE (DEEP-DIVE LAB SIMULATION)
                  </span>
                  <span className="text-zinc-500 font-medium">Virtual Interactive Lab Desk</span>
                </div>
                <p className="text-[10.5px] text-zinc-350 leading-relaxed font-sans">
                  You are in <strong className="text-emerald-400">Class Phase 3: Deep Dive (Vishy-Vastoo ka gyan)</strong>! Cherry Ma'am is actively breaking down terms and math formulas. The orchestrator has enabled an <strong className="text-amber-300">interactive dynamic laboratory sketchpad</strong> representing your active course syllabus below:
                </p>
                
                <div className="grid grid-cols-5 gap-2 text-center pt-2 select-none">
                  {[
                    { label: "1. Intro Story", desc: "Prichey Hook", key: "intro" },
                    { label: "2. Chalk Board", desc: "Notes-making", key: "concept" },
                    { label: "3. Deep Dive", desc: "Explanation", key: "example" },
                    { label: "4. Sawal Jawab", desc: "Doubt-solving", key: "doubt" },
                    { label: "5. Next Step", desc: "Transition", key: "transition" },
                  ].map((step, sIdx) => {
                    const isStepCurrent = (teachingPhase || "intro").toLowerCase() === step.key;
                    const isStepDone = phasesList.indexOf((teachingPhase || "intro").toLowerCase()) > sIdx;
                    return (
                      <div key={sIdx} className={`p-1 px-1.5 rounded-lg border text-[8.2px] flex flex-col items-center justify-between h-[45px] transition-all duration-300 ${
                        isStepCurrent 
                          ? "border-emerald-400 bg-emerald-500/10 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.25)] scale-[1.02]" 
                          : isStepDone 
                            ? "border-amber-500/35 bg-amber-950/10 text-amber-400" 
                            : "border-zinc-900 bg-zinc-955/45 text-zinc-650"
                      }`}>
                        <span className="font-bold tracking-wide uppercase leading-tight whitespace-nowrap">{step.label}</span>
                        <span className="text-[7px] opacity-75 mt-0.5 font-mono leading-none">{step.desc}</span>
                      </div>
                    );
                  })}
                </div>
                
                <div className="text-[8.5px] text-zinc-500 text-center font-mono pt-1 leading-tight">
                  💡 Tip: Drag the slider knobs, shift prices, or change inputs in the vector chalkboard tab below to study formulas live!
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* 🙋‍♂️ STUDENT DESK: VOICE INTERRUPTION & DUAL-CHANNEL DOUBT BAR */}
      <div className="hidden w-full bg-zinc-950 border-t border-zinc-900 px-5 py-4 shrink-0 font-sans z-10" id="student-deskside-interrupter">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Left info column - Dynamic Interaction Panel Toggle */}
          <div className="flex items-center space-x-3 shrink-0">
            <button
              type="button"
              onClick={() => setIsDeskExpanded(!isDeskExpanded)}
              className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                isDeskExpanded
                  ? "bg-amber-500/10 border-amber-500 text-amber-300"
                  : "bg-zinc-900 border-zinc-805 text-zinc-400 hover:text-white"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              {isDeskExpanded ? "Close Learn Desk" : "Open Learn Desk"}
            </button>
            <div className="flex flex-col text-left font-mono">
              <span className="text-[10px] font-bold text-zinc-400 capitalize">Phase: {teachingPhase}</span>
              <span className="text-[8px] text-zinc-650">Sawal-jawab & Status</span>
            </div>
          </div>

          {/* Right action area: Dual-channel Doubt bars */}
          <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
            {/* Quick chips container */}
            <div className="flex-1 flex flex-wrap gap-1.5 items-center justify-start">
              {[
                { text: "Ma'am, ye concept dubaara samjhao na? 🔄", label: "Explain Again" },
                { text: "Can you draw a quick diagram/SVG to show this? 🎨", label: "Draw Diagram" },
                { text: "Isko solve karne ki mathematical shortcut trick batao ⚡", label: "Math Trick" },
                { text: "Is term ka daily life practical application kya hai? 🌍", label: "Real Use" },
              ].map((chip) => (
                <button
                  key={chip.label}
                  disabled={!isConnected}
                  onClick={() => onSelectPrompt && onSelectPrompt(chip.text)}
                  className={`px-2.5 py-1 text-[10px] font-semibold border rounded-lg transition-all text-left truncate max-w-[170px] ${
                    isConnected
                      ? "border-zinc-800 bg-zinc-900/60 text-zinc-350 hover:text-white hover:border-amber-500 hover:bg-amber-500/10 cursor-pointer"
                      : "border-zinc-900 bg-zinc-950/20 text-zinc-650 cursor-not-allowed"
                  }`}
                  title={chip.text}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Custom Input Form section */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (!customDoubtText.trim() || !isConnected) return;
                if (onSelectPrompt) {
                  onSelectPrompt(customDoubtText.trim());
                  setCustomDoubtText("");
                }
              }}
              className="flex items-center bg-zinc-900/60 border border-zinc-800 focus-within:border-amber-500/80 rounded-xl px-2.5 py-1.5 gap-2 min-w-[240px]"
            >
              <input
                type="text"
                value={customDoubtText}
                onChange={(e) => setCustomDoubtText(e.target.value)}
                disabled={!isConnected}
                placeholder={isConnected ? "Ask custom doubt..." : "Connect lecture to ask..."}
                className="bg-transparent text-[11px] text-zinc-100 placeholder-zinc-500 focus:outline-none flex-1 font-sans disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!customDoubtText.trim() || !isConnected}
                className={`p-1.5 rounded-lg transition-all ${
                  customDoubtText.trim() && isConnected
                    ? "bg-amber-500 text-black hover:scale-105 hover:shadow-[0_0_10px_rgba(245,158,11,0.3)] cursor-pointer"
                    : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                }`}
                title="Send custom doubt"
              >
                <Send className="w-3 h-3" />
              </button>
            </form>
          </div>

        </div>
      </div>

    </div>
  );
};
