import React, { useState, useEffect, useMemo } from "react";
import { 
  User, Award, Calendar, Clock, BookOpen, Download, Trash2, 
  Sparkles, X, LayoutGrid, FileText, Share2, Shield, Bookmark, HardDriveDownload,
  Search, ChevronRight, ChevronDown, Folder, FolderOpen, Youtube,
  Brain, ChevronLeft, HelpCircle, RefreshCw, Maximize2, Minimize2,
  Play, Pause, Heart, Volume2, VolumeX, MessageSquare, Copy, Check,
  Zap, Film, Smartphone, Send, Flame, ThumbsUp
} from "lucide-react";
import katex from "katex";
import { db, auth } from "../lib/firebase"; // Import database configuration
import { 
  collection, 
  getDocs, 
  addDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  serverTimestamp,
  updateDoc,
  onSnapshot
} from "firebase/firestore";
import { getAllRecordings, deleteRecording, SavedRecording } from "../utils/recordingsDB";
import { KiaraCounselor } from "./KiaraCounselor";
import { KiaraLiveVoiceModal } from "./KiaraLiveVoiceModal";

const DIMENSION_DETAILS = [
  {
    name: "🎯 Concept Clarity",
    icon: "🎯",
    description: "Evaluates your capability to synthesize formulas and apply them to novel, non-routine application questions. True mastery means recognizing which formula to use under variable conditions.",
    recommendation: "Your concept clarity is currently at {score}%. Great work! Ensure you are practicing cross-concept whiteboard problem sets to build deductive flexibility.",
    benefit: "Equips you to tackle higher-order thinking (HOTS) board-exam questions and easily crack advanced competitive exams."
  },
  {
    name: "📖 Theoretical Understanding",
    icon: "📖",
    description: "Measures recall of exact textbook definitions, scientific/mathematical constants, core classroom theorems, and textbook-grade proofs.",
    recommendation: "Your core theoretical core score is {score}%. Re-read slide summaries and use the direct hand-handbook PDFs to memorize formal definitions precisely.",
    benefit: "Allows you to write highly structured, formal answers that score 100% marks from strict board examiners."
  },
  {
    name: "🧮 Calculation Precision",
    icon: "🧮",
    description: "Tracks algebraic accuracy, arithmetic transposition precision, algebraic sign changes, and step-by-step mathematical reasoning.",
    recommendation: "Your calculation precision is at {score}%. Silly errors are usually due to transposing terms too quickly. Write out every single algebraic step on your scratchpad.",
    benefit: "Completely eliminates exam-day calculation slip-ups and builds high confidence during high-pressure timed exams."
  },
  {
    name: "⚡ Formula Recall & Recall",
    icon: "⚡",
    description: "Gauges rapid recall of standard formulas, units of measurement, coefficients of equations, and historical/scientific facts discussed on chalkboard.",
    recommendation: "Your formula recall is at {score}%. Boost this immediately by opening the Smart Revision tab and playing the AI flashcards for 5 minutes daily.",
    benefit: "Saves critical minutes during timed tests, leaving you with surplus time to review and polish your calculations."
  },
  {
    name: "🔥 Socratic Stamina & Consistency",
    icon: "🔥",
    description: "Monitors overall active learning consistency. Derived directly from lecture classes attended, custom handbooks generated, and slide snapshots saved.",
    recommendation: "Your Socratic engagement is {score}%. Attend live sessions with Cherry Ma'am consistently, ask interactive questions, and save chalkboard snapshot formulations to keep this at 100%.",
    benefit: "Transforms studying from exhausting late-night cram sessions to steady, permanent cognitive absorption."
  }
];
import { Video as VideoIcon } from "lucide-react";

interface BoardSnapshot {
  id: string;
  snapshotId: string;
  userId: string;
  topicTitle: string;
  description: string;
  imgData: string; // Base64 Compressed Image
  timestamp: any;
}

interface StudentAccountHubProps {
  onClose: () => void;
  studentName: string;
  grade: string;
  subject: string;
  board?: string;
  mediumOfLearning?: string;
  totalSessionsCount?: number;
  onRefreshProfile?: () => void;
  customBoardContent?: string;
  pastSessions?: any[];
  sessionSnapshots?: any[];
  topics?: string[];
  activeTopicIndex?: number;
  topicBoardsContent?: Record<number, string>;
  sessionId?: string | null;
  onEnterClassroom?: () => void;
  recordingsRevision?: number;
}

const escapeHTML = (text: string): string => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const sanitizeTitleForPDF = (title: string, fallbackSubject?: string, topicList?: string[]): string => {
  let firstTopicHeader = "";
  if (topicList && topicList.length > 0) {
    firstTopicHeader = (topicList[0].split("\n")[0] || "").replace(/[#*_]/g, "").trim();
  }

  if (!title) {
    if (firstTopicHeader) {
      return fallbackSubject ? `${fallbackSubject} • ${firstTopicHeader}` : firstTopicHeader;
    }
    return fallbackSubject ? `${fallbackSubject} Classroom Notes` : "Classroom Lecture Notes";
  }

  let clean = title
    .replace(/\.(md|MD|markdown|txt|pdf|docx|jpg|JPG|jpeg|JPEG|png|PNG|webp|WEBP|gif|GIF)$/i, "")
    .replace(/^["']|["']$/g, "")
    .replace(/[\_]/g, " ")
    .trim();

  const isRawFileId = /^\d{8,}$/.test(clean) || (clean.length > 20 && /^[0-9a-fA-F\-]+$/.test(clean));

  if (isRawFileId) {
    if (firstTopicHeader) {
      return fallbackSubject ? `${fallbackSubject} • ${firstTopicHeader}` : firstTopicHeader;
    }
    return fallbackSubject ? `${fallbackSubject} Lecture Handout` : "Classroom Study Handout";
  }

  return clean;
};

const compileWhiteboardToHTML = (markdown: string): string => {
  if (!markdown || !markdown.trim()) {
    return `<div style="text-align: center; color: #94a3b8; font-family: sans-serif; padding: 20px; font-size: 12px; font-style: italic; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px dashed rgba(255,255,255,0.12);">No blackboard notes written on this topic yet.</div>`;
  }

  // Pre-normalize LaTeX markdown delimiters to standard $ and $$ for easier matching
  let normalized = markdown
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$");

  // Clean SVG elements for PDF export
  normalized = normalized.replace(/<svg[\s\S]*?<\/svg>/gi, " <div class='def-pdf-card' style='background: #f0fdfa; border-left-color: #0d9488;'><span class='def-pdf-label' style='color: #0d9488;'>[Vector Blackboard Illustration]</span><span class='def-pdf-detail' style='color: #0f766e;'>Interactive diagram is active on the electronic whiteboard screen.</span></div> ");

  // Split content by display math blocks
  // Regex matches $$...$$ or \begin{env}...\end{env}
  const displayMathRegex = /(\$\$[\s\S]*?\$\$|\\begin\s*\{\s*[a-zA-Z*]+\s*\}[\s\S]*?\\end\s*\{\s*[a-zA-Z*]+\s*\})/gi;
  const parts = normalized.split(displayMathRegex);

  let htmlResult = "";

  parts.forEach((part) => {
    const trimmed = part.trim();
    if (!trimmed) return;

    const isBlockMath = (trimmed.startsWith("$$") && trimmed.endsWith("$$")) || 
                        /^\\begin\s*\{\s*[a-zA-Z*]+\s*\}/i.test(trimmed);

    if (isBlockMath) {
      const isEnv = /^\\begin\s*\{\s*[a-zA-Z*]+\s*\}/i.test(trimmed);
      let formula = isEnv ? trimmed : trimmed.slice(2, -2).trim();
      
      // Clean up double-backslashes inside formulas (preventing duplicate escaping)
      formula = formula.replace(/\\\\([a-zA-Z]+)/g, "\\$1");
      formula = formula.replace(/\\\\([{}_^#&%|()[\]])/g, "\\$1");
      // Normalize spaces inside \begin / \end{
      formula = formula.replace(/\\begin\s*\{\s*([a-zA-Z*]+)\s*\}/gi, "\\begin{$1}");
      formula = formula.replace(/\\end\s*\{\s*([a-zA-Z*]+)\s*\}/gi, "\\end{$1}");

      try {
        const formulaHtml = katex.renderToString(formula, { displayMode: true, throwOnError: false });
        htmlResult += `
          <div class="block-math-pdf-container">
            ${formulaHtml}
          </div>
        `;
      } catch (err) {
        htmlResult += `<div class="error-math-pdf">${escapeHTML(formula)}</div>`;
      }
    } else {
      // Process lines for regular text, headings, lists, and inline math
      const lines = part.split(/\n+/);
      lines.forEach((line) => {
        let trimmedLine = line.trim();
        if (!trimmedLine) return;

        // Convert HEADING: and SUB-HEADING: prefixes to standard headings
        if (/^(HEADING|TITLE|HEADING 1|HEADING 2)\s*:\s*/i.test(trimmedLine)) {
          trimmedLine = `### ${trimmedLine.replace(/^(HEADING|TITLE|HEADING 1|HEADING 2)\s*:\s*/i, "").trim()}`;
        } else if (/^(SUB-HEADING|SUBHEADING|SUB TITLE)\s*:\s*/i.test(trimmedLine)) {
          trimmedLine = `#### ${trimmedLine.replace(/^(SUB-HEADING|SUBHEADING|SUB TITLE)\s*:\s*/i, "").trim()}`;
        }

        // Check if line is a bullet/list item
        const isBullet = trimmedLine.startsWith("-") || trimmedLine.startsWith("*") || trimmedLine.startsWith("•");
        // Check if line is a definition list item (contains ":" or labels like "🌟")
        const isDefinition = trimmedLine.includes(":") && (trimmedLine.startsWith("🌟") || trimmedLine.startsWith("💡") || trimmedLine.startsWith("📌"));
        // Check if heading
        const isSubHeading = trimmedLine.startsWith("####");
        const isHeading = trimmedLine.startsWith("📌") || trimmedLine.startsWith("#") || trimmedLine.startsWith("###");

        // Parse inline math $...$
        let parsedLine = trimmedLine;
        
        // Find $...$ inline math segments
        const inlineMathRegex = /\$([\s\S]*?)\$/g;
        parsedLine = parsedLine.replace(inlineMathRegex, (match, formula) => {
          try {
            return katex.renderToString(formula, { displayMode: false, throwOnError: false });
          } catch {
            return match;
          }
        });

        // Parse Markdown formatting like bold **...** and italics _..._ / *...*
        parsedLine = parsedLine.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        parsedLine = parsedLine.replace(/_([^_]+)_/g, "<em>$1</em>");
        parsedLine = parsedLine.replace(/`([^`]+)`/g, "<code>$1</code>");

        if (isSubHeading) {
          const subHeadingText = parsedLine.replace(/^####\s*/g, "").trim();
          htmlResult += `<h4 class="subheading-pdf" style="color: #67e8f9; font-size: 12.5px; font-weight: 700; margin-top: 10px; margin-bottom: 6px; font-family: 'Space Grotesk', sans-serif;">🔹 ${subHeadingText}</h4>`;
        } else if (isHeading) {
          const headingText = parsedLine.replace(/^📌|^#+\s*/g, "").trim();
          const cleanHeading = headingText.toLowerCase();
          
          let headingColor = "#fef08a"; // Soft Yellow default for headings
          if (cleanHeading.includes("formula") || cleanHeading.includes("equation") || cleanHeading.includes("math") || cleanHeading.includes("variable")) {
            headingColor = "#bae6fd"; // Pastel sky-blue
          } else if (cleanHeading.includes("tip") || cleanHeading.includes("exam") || cleanHeading.includes("warning")) {
            headingColor = "#fca5a5"; // Pastel pink
          }
          
          htmlResult += `<h3 class="heading-pdf" style="color: ${headingColor}; border-bottom-color: ${headingColor}30; margin-top: 12px; margin-bottom: 8px;">📌 ${headingText}</h3>`;
        } else if (isDefinition) {
          const colonIdx = parsedLine.indexOf(":");
          const label = parsedLine.substring(0, colonIdx).trim();
          const detail = parsedLine.substring(colonIdx + 1).trim();
          
          const cleanLabel = label.toLowerCase();
          let borderCol = "#fef08a"; // Default yellow
          let bgCol = "rgba(254, 240, 138, 0.05)";
          let txtCol = "#fef08a";
          let emoji = "🌟";
          
          if (
            /^(warning|alert|tip|hint|exam\s*tip|instruction|danger|attention|caution|error|question|answer|exercise|problem|चेतावनी|सुझाव|प्रश्न|उत्तर)$/i.test(cleanLabel) ||
            cleanLabel.includes("tip") ||
            cleanLabel.includes("warning") ||
            cleanLabel.includes("attention") ||
            cleanLabel.includes("danger")
          ) {
            borderCol = "#fca5a5"; // Pink
            bgCol = "rgba(252, 165, 165, 0.05)";
            txtCol = "#fca5a5";
            emoji = "🌸";
          } else if (
            /^(formula|equation|theorem|lemma|corollary|proof|identity|variable|math|physics|equation|maths|सूत्र|समीकरण)$/i.test(cleanLabel) ||
            cleanLabel.includes("formula") ||
            cleanLabel.includes("equation") ||
            cleanLabel.includes("theorem")
          ) {
            borderCol = "#bae6fd"; // Sky-Blue
            bgCol = "rgba(186, 230, 253, 0.05)";
            txtCol = "#bae6fd";
            emoji = "📐";
          }

          htmlResult += `
            <div class="def-pdf-card" style="border-left-color: ${borderCol}; background-color: ${bgCol}; margin-bottom: 8px;">
              <span class="def-pdf-label" style="color: ${txtCol};">${emoji} ${label}</span>
              <span class="def-pdf-detail">${detail}</span>
            </div>
          `;
        } else if (isBullet) {
          const bulletText = parsedLine.replace(/^[-*•]\s*/, "").trim();
          if (bulletText && bulletText !== "--" && bulletText !== "---" && bulletText !== "-" && bulletText !== "—") {
            htmlResult += `<li class="bullet-pdf" style="margin-bottom: 4px;">${bulletText}</li>`;
          }
        } else {
          if (parsedLine !== "--" && parsedLine !== "---" && parsedLine !== "-") {
            htmlResult += `<p class="paragraph-pdf" style="margin-bottom: 8px;">${parsedLine}</p>`;
          }
        }
      });
    }
  });

  return htmlResult;
};

const renderTextWithKaTeX = (text: string, search?: string): React.ReactNode[] => {
  if (!text) return [];
  
  // Normalize latex delimiters
  let normalized = text
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$");

  const regex = /(\$\$[\s\S]*?\External?\$\$|\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g;
  const standardRegex = /(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g;
  const parts = normalized.split(standardRegex);

  return parts.map((part, index) => {
    const trimmed = part.trim();
    if (!trimmed) return <span key={index}>{part}</span>;

    const isDisplayMath = trimmed.startsWith("$$") && trimmed.endsWith("$$");
    const isInlineMath = trimmed.startsWith("$") && trimmed.endsWith("$");

    if (isDisplayMath) {
      const formula = trimmed.slice(2, -2).trim();
      try {
        const html = katex.renderToString(formula, { displayMode: true, throwOnError: false });
        return <div key={index} className="my-2.5 overflow-x-auto scrollbar-thin scrollbar-thumb-teal-800 scrollbar-track-transparent" dangerouslySetInnerHTML={{ __html: html }} />;
      } catch (err) {
        return <code key={index} className="block text-red-500 bg-red-50 p-2 rounded text-[10px]">{formula}</code>;
      }
    } else if (isInlineMath) {
      const formula = trimmed.slice(1, -1).trim();
      try {
        const html = katex.renderToString(formula, { displayMode: false, throwOnError: false });
        return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
      } catch (err) {
        return <code key={index} className="text-red-500 bg-red-50 px-1 rounded text-[10px]">{formula}</code>;
      }
    }

    if (search && search.trim()) {
      const cleanSearch = search.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'); // escape regex
      const highlightRegex = new RegExp(`(${cleanSearch})`, "gi");
      const textParts = part.split(highlightRegex);
      return (
        <span key={index}>
          {textParts.map((tPart, tIdx) => 
            highlightRegex.test(tPart) ? (
              <mark key={tIdx} className="bg-yellow-200 text-slate-900 font-extrabold rounded-xs px-0.5 shadow-xs border border-yellow-300/30">
                {tPart}
              </mark>
            ) : (
              tPart
            )
          )}
        </span>
      );
    }

    return <span key={index}>{part}</span>;
  });
};

export const StudentAccountHub: React.FC<StudentAccountHubProps> = ({
  onClose,
  studentName,
  grade,
  subject,
  board = "CBSE",
  mediumOfLearning = "Hinglish",
  totalSessionsCount = 0,
  onRefreshProfile,
  customBoardContent = "",
  pastSessions = [],
  sessionSnapshots = [],
  topics = [],
  activeTopicIndex = 0,
  topicBoardsContent = {},
  sessionId = null,
  onEnterClassroom,
  recordingsRevision = 0,
}) => {
  const [snapshots, setSnapshots] = useState<BoardSnapshot[]>([]);
  const [recordings, setRecordings] = useState<SavedRecording[]>([]);
  const [playingVideo, setPlayingVideo] = useState<SavedRecording | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("All");
  const [recordingsSearchQuery, setRecordingsSearchQuery] = useState<string>("");
  const [activeDesktopTab, setActiveDesktopTab] = useState<"books" | "stats" | "counselor">("stats");
  const [activeDimensionIndex, setActiveDimensionIndex] = useState<number>(0);
  const [quizAttempts, setQuizAttempts] = useState<any[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [isKiaraVoiceModalOpen, setIsKiaraVoiceModalOpen] = useState<boolean>(false);

  // Vertical Reels Player & Share States
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [likeCount, setLikeCount] = useState<number>(245);
  const [showNotesDrawer, setShowNotesDrawer] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [shareRecording, setShareRecording] = useState<SavedRecording | null>(null);
  const [copiedLinkToast, setCopiedLinkToast] = useState<boolean>(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const fetchRecordings = async () => {
      try {
        const recs = await getAllRecordings();
        setRecordings(recs);
      } catch (err) {
        console.error("Failed fetching local lecture recordings from IndexedDB:", err);
      }
    };
    fetchRecordings();
  }, [recordingsRevision]);

  // Group and filter recordings by subject
  const filteredAndGroupedRecordings = useMemo(() => {
    const groups: Record<string, SavedRecording[]> = {};
    const query = recordingsSearchQuery.trim().toLowerCase();

    recordings.forEach((rec) => {
      const rawSub = rec.subject ? rec.subject.trim() : "General Syllabus";
      // Normalize subject display title nicely
      const formattedSub = rawSub.charAt(0).toUpperCase() + rawSub.slice(1).toLowerCase();

      // Filter by selected subject
      if (selectedSubjectFilter !== "All" && formattedSub !== selectedSubjectFilter) {
        return;
      }

      // Filter by search query (topic title, subject, theme, or date)
      if (query) {
        const matchesTitle = rec.topicTitle.toLowerCase().includes(query);
        const matchesSubject = rec.subject.toLowerCase().includes(query);
        const matchesDate = rec.date.toLowerCase().includes(query);
        if (!matchesTitle && !matchesSubject && !matchesDate) {
          return;
        }
      }

      if (!groups[formattedSub]) {
        groups[formattedSub] = [];
      }
      groups[formattedSub].push(rec);
    });
    return groups;
  }, [recordings, selectedSubjectFilter, recordingsSearchQuery]);

  // Extract all unique subjects found in recordings
  const allSubjects = useMemo(() => {
    const subs = new Set<string>();
    recordings.forEach((rec) => {
      const rawSub = rec.subject ? rec.subject.trim() : "General Syllabus";
      const formattedSub = rawSub.charAt(0).toUpperCase() + rawSub.slice(1).toLowerCase();
      subs.add(formattedSub);
    });
    return Array.from(subs).sort();
  }, [recordings]);
  
  // Overhauled Archived PDF system core states
  const [archiveSearchQuery, setArchiveSearchQuery] = useState("");
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});

  // Group and format sessions under subject-wise nested architecture
  const sortedAndGroupedSessions = useMemo(() => {
    const groups: Record<string, any[]> = {};

    pastSessions.forEach((sess, index) => {
      // Descriptive user-friendly title
      const originalTitle = sess.activeDocumentName || `Class Lecture Hand-Handbook #${pastSessions.length - index}`;
      
      const creationDate = sess.createdAt || sess.updatedAt;
      let dateString = "Recently Synced";
      if (creationDate) {
        try {
          const date = creationDate.toDate ? creationDate.toDate() : new Date(creationDate.seconds ? creationDate.seconds * 1000 : creationDate);
          
          // Formatter options to generate precisely: "06 June 2026, 03:50 PM"
          const months = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
          ];
          const dayVal = String(date.getDate()).padStart(2, "0");
          const monthVal = months[date.getMonth()];
          const yearVal = date.getFullYear();
          let hours = date.getHours();
          const minutes = String(date.getMinutes()).padStart(2, "0");
          const ampm = hours >= 12 ? "PM" : "AM";
          hours = hours % 12;
          hours = hours ? hours : 12; // the hour '0' should be '12'
          const timeVal = `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
          
          dateString = `${dayVal} ${monthVal} ${yearVal}, ${timeVal}`;
        } catch (e) {
          dateString = "Recently Synced";
        }
      }

      const processedSess = {
        ...sess,
        processedTitle: originalTitle,
        formattedDateTime: dateString,
        index: pastSessions.length - index,
      };

      // Filter based on search query
      const searchTarget = `${processedSess.processedTitle} ${processedSess.subject || "General Syllabus"} ${processedSess.formattedDateTime}`.toLowerCase();
      const queryLower = archiveSearchQuery.toLowerCase();

      if (!archiveSearchQuery || searchTarget.includes(queryLower)) {
        const subName = processedSess.subject ? processedSess.subject.trim() : "General Syllabus";
        if (!groups[subName]) {
          groups[subName] = [];
        }
        groups[subName].push(processedSess);
      }
    });

    return groups;
  }, [pastSessions, archiveSearchQuery]);

  // Hook to expand all matching folders upon entering search criteria
  useEffect(() => {
    if (archiveSearchQuery) {
      const activeSubjects = Object.keys(sortedAndGroupedSessions);
      const expandedState: Record<string, boolean> = {};
      activeSubjects.forEach(sub => {
        expandedState[sub] = true;
      });
      setExpandedSubjects(expandedState);
    }
  }, [archiveSearchQuery, sortedAndGroupedSessions]);
  
  // Combine Firestore snapshots and memory session snapshots for guest compatibility
  const allSnapshots = useMemo(() => {
    const combined = [...snapshots];
    if (sessionSnapshots && sessionSnapshots.length > 0) {
      sessionSnapshots.forEach((local) => {
        const exists = combined.some((fb) => fb.snapshotId === local.snapshotId || fb.topicTitle === local.topicTitle);
        if (!exists) {
          combined.push({
            id: local.id,
            snapshotId: local.snapshotId,
            userId: local.userId,
            topicTitle: local.topicTitle,
            description: local.description,
            imgData: local.imgData,
            timestamp: local.timestamp
          });
        }
      });
    }
    return combined;
  }, [snapshots, sessionSnapshots]);

  const [loadingSnapshots, setLoadingSnapshots] = useState(false);

  // Smart Revision Deck States
  const [activeRevisionSession, setActiveRevisionSession] = useState<any | null>(null);
  const [revisionDeckData, setRevisionDeckData] = useState<any | null>(null);
  const [loadingRevision, setLoadingRevision] = useState(false);
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [isFlashcardFlipped, setIsFlashcardFlipped] = useState(false);

    // New highly interactive states
  const [activeRevisionTab, setActiveRevisionTab] = useState<"flashcards" | "mindmap">("flashcards");
  const [masteredCards, setMasteredCards] = useState<Record<string, boolean>>({});
  const [mindMapSearch, setMindMapSearch] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Record<number, boolean>>({ 0: true });
  const [isVisualMapCollapsed, setIsVisualMapCollapsed] = useState(() => {
    return typeof window !== "undefined" ? window.innerWidth < 768 : true;
  });
  const [mindMapQuickFilter, setMindMapQuickFilter] = useState<"all" | "formulas" | "tips" | "concepts">("all");
  const [lastSelectedNodeId, setLastSelectedNodeId] = useState<number | null>(null);
  const [selectedSubNode, setSelectedSubNode] = useState<{ nodeId: number; subIdx: number } | null>(null);
  const [mindMapViewMode, setMindMapViewMode] = useState<"interactive" | "list">("interactive");
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [mindMapStyle, setMindMapStyle] = useState<"slate" | "pastel">("pastel");

  const getPastelTheme = (index: number) => {
    const themes = [
      { fill: "#ffccd5", stroke: "#db2777", text: "#831843", badgeBg: "#fbc4b6", badgeText: "#450a0a" }, // Pink
      { fill: "#ffe3cc", stroke: "#ea580c", text: "#7c2d12", badgeBg: "#fed7aa", badgeText: "#431407" }, // Peach Orange
      { fill: "#f3e8ff", stroke: "#7c3aed", text: "#4c1d95", badgeBg: "#e9d5ff", badgeText: "#2e1065" }, // Lavender Purple
      { fill: "#e2faf5", stroke: "#0d9488", text: "#115e59", badgeBg: "#ccfbf1", badgeText: "#042f2e" }, // Mint Green
      { fill: "#fff9db", stroke: "#eab308", text: "#713f12", badgeBg: "#fef08a", badgeText: "#422006" }, // Soft Yellow
    ];
    return themes[index % themes.length];
  };

  const getSubNodePastelTheme = (parentIdx: number) => {
    const subThemes = [
      { fill: "#ccfbf1", stroke: "#0d9488", text: "#042f2e" }, // Mint Green
      { fill: "#f3e8ff", stroke: "#7c3aed", text: "#2e1065" }, // Lavender Purple
      { fill: "#ffe3cc", stroke: "#ea580c", text: "#431407" }, // Orange/Peach
      { fill: "#ffccd5", stroke: "#db2777", text: "#831843" }, // Coral/Pink
      { fill: "#fff9db", stroke: "#eab308", text: "#422006" }, // Soft Yellow
    ];
    return subThemes[(parentIdx + 1) % subThemes.length];
  };

  const getSubItems = (node: any) => {
    if (!node) return [];
    const concepts = node.keyConcepts || node.coreConcepts || [];
    const takeaways = node.subNodes || node.quickTakeaways || [];
    const items: { type: "concept" | "formula" | "tip"; text: string; label: string }[] = [];
    
    if (node.keyFormula) {
      items.push({ 
        type: "formula", 
        text: node.keyFormula, 
        label: "📐 Formula" 
      });
    }
    
    concepts.forEach((concept: string, idx: number) => {
      items.push({ 
        type: "concept", 
        text: concept, 
        label: `🧠 Concept ${idx + 1}` 
      });
    });
    
    takeaways.forEach((takeaway: string, idx: number) => {
      items.push({ 
        type: "tip", 
        text: takeaway, 
        label: `💡 Exam Tip ${idx + 1}` 
      });
    });
    
    return items;
  };

  const totalCards = revisionDeckData?.flashcards?.length || 0;

  const handleOpenRevisionDeck = (sess: any, data: any) => {
    setActiveRevisionSession(sess);
    setRevisionDeckData(data);
    setCurrentFlashcardIndex(0);
    setIsFlashcardFlipped(false);
    setMindMapSearch("");
    setActiveRevisionTab("flashcards");
    setExpandedNodes({ 0: true });
    setMindMapQuickFilter("all");
    setLastSelectedNodeId(null);
    setSelectedSubNode(null);
    setMindMapViewMode("interactive");
    setIsMapFullscreen(false);
    setIsVisualMapCollapsed(typeof window !== "undefined" ? window.innerWidth < 768 : true);

    // Load mastery cache from local storage
    const storageKey = `revision_mastery_${sess.sessionId || sess.index}`;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setMasteredCards(JSON.parse(saved));
      } else {
        setMasteredCards({});
      }
    } catch (_) {
      setMasteredCards({});
    }
  };

  const handleCloseRevisionDeck = () => {
    setActiveRevisionSession(null);
    setRevisionDeckData(null);
    setMasteredCards({});
    setMindMapSearch("");
    setMindMapQuickFilter("all");
    setLastSelectedNodeId(null);
    setSelectedSubNode(null);
    setMindMapViewMode("interactive");
    setIsMapFullscreen(false);
  };

  const handleDownloadMindMap = (format: "png" | "svg") => {
    // Helper to transform LaTeX formulas into clean, readable Unicode math text
    const formatLatexToReadable = (text: string): string => {
      if (!text) return "";
      let formatted = text;

      const subscripts: { [key: string]: string } = {
        "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
        "a": "ₐ", "e": "ₑ", "o": "ₒ", "x": "ₓ", "h": "ₕ", "k": "ₖ", "l": "ₗ", "m": "ₘ", "n": "ₙ", "p": "ₚ", "s": "ₛ", "t": "ₜ",
        "i": "ᵢ", "j": "ⱼ"
      };

      // Convert subscripts first to eliminate nested braces
      for (let i = 0; i < 5; i++) {
        formatted = formatted.replace(/_\{([a-zA-Z0-9]+)\}/g, (_, chars) => {
          return chars.split('').map((c: string) => subscripts[c] || c).join('');
        });
        formatted = formatted.replace(/_([a-zA-Z0-9])/g, (_, char) => subscripts[char] || char);
      }

      // Replace LaTeX frac with division slash
      for (let i = 0; i < 5; i++) {
        formatted = formatted.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1/$2");
        formatted = formatted.replace(/\\frac\(([^()]+)\)\(([^()]+)\)/g, "$1/$2");
      }

      // LaTeX macros mapping
      formatted = formatted.replace(/\\neq\b/g, "≠");
      formatted = formatted.replace(/\\neq/g, "≠");
      formatted = formatted.replace(/\\quad\b/g, "  ");
      formatted = formatted.replace(/\\text\{([^{}]+)\}/g, "$1");
      formatted = formatted.replace(/\\Rightarrow\b/g, "⇒");
      formatted = formatted.replace(/\\Rightarrow/g, "⇒");
      formatted = formatted.replace(/\\dots\b/g, "...");
      formatted = formatted.replace(/\\dots/g, "...");
      formatted = formatted.replace(/\\cdot\b/g, "·");
      formatted = formatted.replace(/\\cdot/g, "·");
      formatted = formatted.replace(/\\pm\b/g, "±");
      formatted = formatted.replace(/\\pm/g, "±");
      formatted = formatted.replace(/\\ge\b/g, "≥");
      formatted = formatted.replace(/\\le\b/g, "≤");
      formatted = formatted.replace(/\\geq\b/g, "≥");
      formatted = formatted.replace(/\\leq\b/g, "≤");
      formatted = formatted.replace(/\\ge/g, "≥");
      formatted = formatted.replace(/\\le/g, "≤");
      formatted = formatted.replace(/\\geq/g, "≥");
      formatted = formatted.replace(/\\leq/g, "≤");
      formatted = formatted.replace(/\\approx\b/g, "≈");
      formatted = formatted.replace(/\\approx/g, "≈");

      // Greek letters mapping
      formatted = formatted.replace(/\\alpha\b/g, "α");
      formatted = formatted.replace(/\\beta\b/g, "β");
      formatted = formatted.replace(/\\gamma\b/g, "γ");
      formatted = formatted.replace(/\\theta\b/g, "θ");
      formatted = formatted.replace(/\\delta\b/g, "δ");
      formatted = formatted.replace(/\\Delta\b/g, "Δ");
      formatted = formatted.replace(/\\lambda\b/g, "λ");
      formatted = formatted.replace(/\\pi\b/g, "π");
      formatted = formatted.replace(/\\omega\b/g, "ω");
      formatted = formatted.replace(/\\phi\b/g, "φ");
      formatted = formatted.replace(/\\sigma\b/g, "σ");
      formatted = formatted.replace(/\\mu\b/g, "μ");
      formatted = formatted.replace(/\\tau\b/g, "τ");

      // Remove math dollar boundaries
      formatted = formatted.replace(/\$\$/g, "");
      formatted = formatted.replace(/\$/g, "");

      // Normalize spaces
      formatted = formatted.replace(/ \s+/g, " ");

      return formatted.trim();
    };

    // Utility functions to wrap text elegantly
    const wrapText = (text: string, maxCharsPerLine: number = 28): string[] => {
      const words = text.split(" ");
      const lines: string[] = [];
      let currentLine = "";
      
      words.forEach(word => {
        if ((currentLine + " " + word).trim().length <= maxCharsPerLine) {
          currentLine = (currentLine + " " + word).trim();
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      });
      if (currentLine) {
        lines.push(currentLine);
      }
      return lines;
    };

    const wrapParentText = (text: string, maxLen: number = 22): string[] => {
      const words = text.split(" ");
      const lines: string[] = [];
      let currentLine = "";
      words.forEach(word => {
        if ((currentLine + " " + word).trim().length <= maxLen) {
          currentLine = (currentLine + " " + word).trim();
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      });
      if (currentLine) lines.push(currentLine);
      return lines;
    };

    // Helper to generate the beautifully crafted, high-definition complete SVG
    const generateFullDetailedMindMapSVG = () => {
      const nodes = revisionDeckData?.mindMap?.nodes || [];
      const subjectName = activeRevisionSession?.subject || subject || "Syllabus";
      const chapterTitle = activeRevisionSession?.processedTitle || revisionDeckData?.mindMap?.title || "Concept Mind Map";
      const gradeLevel = grade || "10";

      // Canvas config for complete layout
      const width = 1600;
      const height = 1200;
      const cx = 800;
      const cy = 600;
      const rx = 380;
      const ry = 280;
      const subDist = 210; // Comfortable distance for fanning out cards

      let svgContent = "";

      // 1. Gradients and Filters definition
      if (mindMapStyle === "pastel") {
        svgContent += `
          <defs>
            <linearGradient id="dl-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#FAF6F0" />
              <stop offset="100%" stop-color="#FAF6F0" />
            </linearGradient>
            <linearGradient id="dl-hub-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#b4a4eb" />
              <stop offset="100%" stop-color="#9f86f0" />
            </linearGradient>
            <linearGradient id="dl-card-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ffffff" />
              <stop offset="100%" stop-color="#fcfbf9" />
            </linearGradient>
            <filter id="dl-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#000000" flood-opacity="0.08" />
            </filter>
            <marker id="dl-arrow-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#4b5563" />
            </marker>
          </defs>
        `;
      } else {
        svgContent += `
          <defs>
            <linearGradient id="dl-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#021417" />
              <stop offset="50%" stop-color="#051e22" />
              <stop offset="100%" stop-color="#0c2e2c" />
            </linearGradient>
            <linearGradient id="dl-hub-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#0d9488" />
              <stop offset="100%" stop-color="#0f766e" />
            </linearGradient>
            <linearGradient id="dl-node-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#114c47" />
              <stop offset="100%" stop-color="#0d3c38" />
            </linearGradient>
            <linearGradient id="dl-card-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#071b1e" />
              <stop offset="100%" stop-color="#031113" />
            </linearGradient>
            <filter id="dl-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#000000" flood-opacity="0.6" />
            </filter>
          </defs>
        `;
      }

      // Backdrop
      svgContent += `
        <rect width="${width}" height="${height}" fill="url(#dl-bg-grad)" />
        
        <!-- Background organic grid design -->
        <g opacity="${mindMapStyle === "pastel" ? "0.6" : "0.12"}">
      `;
      for (let x = 0; x < width; x += 32) {
        for (let y = 0; y < height; y += 32) {
          svgContent += `<circle cx="${x}" cy="${y}" r="1" fill="${mindMapStyle === "pastel" ? "#e5dcd0" : "#2dd4bf"}" />`;
        }
      }
      svgContent += `</g>`;

      // Outer safety border ring
      svgContent += `
        <circle cx="${cx}" cy="${cy}" r="${rx}" fill="none" stroke="${mindMapStyle === "pastel" ? "#e5dcd0" : "#114c47"}" stroke-width="1.5" stroke-dasharray="12 12" opacity="0.4" />
        <circle cx="${cx}" cy="${cy}" r="${rx + subDist}" fill="none" stroke="${mindMapStyle === "pastel" ? "#e5dcd0" : "#2dd4bf"}" stroke-width="1" stroke-dasharray="6 8" opacity="0.3" />
      `;

      // 2. Draw Connection Lines: Hub to Parent Nodes
      const N = nodes.length || 1;
      nodes.forEach((_: any, index: number) => {
        const angle = (2 * Math.PI * index) / N - Math.PI / 2;
        const targetX = cx + rx * Math.cos(angle);
        const targetY = cy + ry * Math.sin(angle);

        const pTheme = getPastelTheme(index);

        if (mindMapStyle === "pastel") {
          svgContent += `
            <!-- Connection to Topic ${index + 1} -->
            <line 
              x1="${cx}" 
              y1="${cy}" 
              x2="${targetX}" 
              y2="${targetY}" 
              stroke="${pTheme.stroke}" 
              stroke-width="2" 
              stroke-linecap="round"
              marker-end="url(#dl-arrow-head)"
            />
          `;
        } else {
          svgContent += `
            <!-- Connection to Topic ${index + 1} -->
            <line 
              x1="${cx}" 
              y1="${cy}" 
              x2="${targetX}" 
              y2="${targetY}" 
              stroke="#114c47" 
              stroke-width="3.5" 
              stroke-linecap="round"
            />
            <line 
              x1="${cx}" 
              y1="${cy}" 
              x2="${targetX}" 
              y2="${targetY}" 
              stroke="#2dd4bf" 
              stroke-width="1.5" 
              stroke-dasharray="8 6" 
              opacity="0.75"
            />
          `;
        }
      });

      // 3. Draw Sub-branch Connections and Detailed Cards
      nodes.forEach((node: any, index: number) => {
        const angle = (2 * Math.PI * index) / N - Math.PI / 2;
        const targetX = cx + rx * Math.cos(angle);
        const targetY = cy + ry * Math.sin(angle);

        const subItems = getSubItems(node);
        const K = subItems.length;
        if (K === 0) return;

        // Categorize node into sector (left, right, top, bottom) to prevent overlapping
        let sector: "top" | "bottom" | "left" | "right" = "top";
        if (targetX < cx - 80) {
          sector = "left";
        } else if (targetX > cx + 80) {
          sector = "right";
        } else if (targetY < cy) {
          sector = "top";
        } else {
          sector = "bottom";
        }

        subItems.forEach((subItem: any, i: number) => {
          let subX = targetX;
          let subY = targetY;
          let parentConnectorX = targetX;
          let parentConnectorY = targetY;
          let childConnectorX = targetX;
          let childConnectorY = targetY;

          const cardW = 195;
          const cardH = 95;

          if (sector === "left") {
            // Stack vertically in a column on the left side
            const vSpacing = 112;
            const startY = targetY - ((K - 1) * vSpacing) / 2;
            subX = targetX - 225;
            subY = startY + i * vSpacing;

            parentConnectorX = targetX - 105; // Left edge of parent capsule
            parentConnectorY = targetY;
            childConnectorX = subX + cardW / 2; // Right edge of child card
            childConnectorY = subY;
          } else if (sector === "right") {
            // Stack vertically in a column on the right side
            const vSpacing = 112;
            const startY = targetY - ((K - 1) * vSpacing) / 2;
            subX = targetX + 225;
            subY = startY + i * vSpacing;

            parentConnectorX = targetX + 105; // Right edge of parent capsule
            parentConnectorY = targetY;
            childConnectorX = subX - cardW / 2; // Left edge of child card
            childConnectorY = subY;
          } else if (sector === "top") {
            // Align horizontally above
            if (K <= 3) {
              const hSpacing = 215;
              const startX = targetX - ((K - 1) * hSpacing) / 2;
              subX = startX + i * hSpacing;
              subY = targetY - 145;
            } else {
              // Split into two neat rows to prevent side-clipping
              const row1Count = Math.min(3, Math.ceil(K / 2));
              const row2Count = K - row1Count;
              if (i < row1Count) {
                const startX = targetX - ((row1Count - 1) * 215) / 2;
                subX = startX + i * 215;
                subY = targetY - 105;
              } else {
                const row2Idx = i - row1Count;
                const startX = targetX - ((row2Count - 1) * 215) / 2;
                subX = startX + row2Idx * 215;
                subY = targetY - 220;
              }
            }

            parentConnectorX = targetX;
            parentConnectorY = targetY - 28; // Top edge of parent capsule
            childConnectorX = subX;
            childConnectorY = subY + cardH / 2; // Bottom edge of child card
          } else {
            // Align horizontally below
            if (K <= 3) {
              const hSpacing = 215;
              const startX = targetX - ((K - 1) * hSpacing) / 2;
              subX = startX + i * hSpacing;
              subY = targetY + 145;
            } else {
              const row1Count = Math.min(3, Math.ceil(K / 2));
              const row2Count = K - row1Count;
              if (i < row1Count) {
                const startX = targetX - ((row1Count - 1) * 215) / 2;
                subX = startX + i * 215;
                subY = targetY + 105;
              } else {
                const row2Idx = i - row1Count;
                const startX = targetX - ((row2Count - 1) * 215) / 2;
                subX = startX + row2Idx * 215;
                subY = targetY + 220;
              }
            }

            parentConnectorX = targetX;
            parentConnectorY = targetY + 28; // Bottom edge of parent capsule
            childConnectorX = subX;
            childConnectorY = subY - cardH / 2; // Top edge of child card
          }

          const cardX = subX - cardW / 2;
          const cardY = subY - cardH / 2;

          const pTheme = getPastelTheme(index);
          const subTheme = getSubNodePastelTheme(index);

          let typeLabel = "";
          let accentColor = "#38bdf8"; // Concept (sky blue)
          if (subItem.type === "formula") {
            typeLabel = "📐 RULE / FORMULA";
            accentColor = mindMapStyle === "pastel" ? subTheme.stroke : "#f59e0b"; // Formula (amber)
          } else if (subItem.type === "tip") {
            typeLabel = "💡 EXAM PRO-TIP";
            accentColor = mindMapStyle === "pastel" ? subTheme.stroke : "#10b981"; // Tip (emerald)
          } else {
            typeLabel = "🧠 KEY CONCEPT";
            accentColor = mindMapStyle === "pastel" ? subTheme.stroke : "#38bdf8";
          }

          // Connector line from parent node to sub-card
          if (mindMapStyle === "pastel") {
            svgContent += `
              <line 
                x1="${parentConnectorX}" 
                y1="${parentConnectorY}" 
                x2="${childConnectorX}" 
                y2="${childConnectorY}" 
                stroke="${pTheme.stroke}" 
                stroke-width="1.5" 
                marker-end="url(#dl-arrow-head)"
              />
            `;
          } else {
            svgContent += `
              <line 
                x1="${parentConnectorX}" 
                y1="${parentConnectorY}" 
                x2="${childConnectorX}" 
                y2="${childConnectorY}" 
                stroke="${accentColor}" 
                stroke-width="1.8" 
                stroke-dasharray="4 3.5" 
                opacity="0.85"
              />
              <circle cx="${childConnectorX}" cy="${childConnectorY}" r="3.5" fill="${accentColor}" />
            `;
          }

          const cardFill = mindMapStyle === "pastel" ? subTheme.fill : "url(#dl-card-grad)";
          const cardStroke = mindMapStyle === "pastel" ? subTheme.stroke : accentColor;
          const labelFill = mindMapStyle === "pastel" ? subTheme.text : accentColor;
          const textFill = mindMapStyle === "pastel" ? subTheme.text : "#e2e8f0";

          // Beautiful detailed card container with shadow
          svgContent += `
            <g filter="url(#dl-shadow)">
              <rect 
                x="${cardX}" 
                y="${cardY}" 
                width="${cardW}" 
                height="${cardH}" 
                rx="12" 
                ry="12" 
                fill="${cardFill}" 
                stroke="${cardStroke}" 
                stroke-width="1.5" 
              />
              
              <!-- Subtle accent top header plate -->
              <path 
                d="M ${cardX + 12} ${cardY} L ${cardX + cardW - 12} ${cardY} A 12 12 0 0 1 ${cardX + cardW} ${cardY + 12} L ${cardX + cardW} ${cardY + 22} L ${cardX} ${cardY + 22} L ${cardX} ${cardY + 12} A 12 12 0 0 1 ${cardX + 12} ${cardY} Z" 
                fill="${cardStroke}" 
                opacity="0.08"
              />
              
              <!-- Header badge text inside card -->
              <text 
                x="${subX}" 
                y="${cardY + 14}" 
                text-anchor="middle" 
                fill="${labelFill}" 
                font-size="8.5" 
                font-weight="900" 
                font-family="'JetBrains Mono', monospace" 
                letter-spacing="1"
              >
                ${typeLabel}
              </text>
          `;

          // Wrap actual detailed text content beautifully
          const readableText = formatLatexToReadable(subItem.text);
          const wrappedLines = wrapText(readableText, 28);
          const displayLines = wrappedLines.slice(0, 4); // Show maximum 4 lines to fit card neatly
          const lineCount = displayLines.length;
          
          // Vertically center the text lines inside card body
          const textBlockHeight = lineCount * 12;
          const startY = subY + 11 - textBlockHeight / 2;

          displayLines.forEach((lineText: string, lineIdx: number) => {
            // Escape any XML entities to ensure output SVG parses cleanly
            const escapedText = lineText
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&apos;");

            const isLastLineTruncated = lineIdx === 3 && wrappedLines.length > 4;
            const lineToRender = isLastLineTruncated ? escapedText.slice(0, 24) + "..." : escapedText;

            svgContent += `
              <text 
                x="${subX}" 
                y="${startY + lineIdx * 12}" 
                text-anchor="middle" 
                fill="${textFill}" 
                font-size="8.5" 
                font-weight="600" 
                font-family="'Inter', system-ui, sans-serif"
              >
                ${lineToRender}
              </text>
            `;
          });

          svgContent += `</g>`;
        });
      });

      // 4. Draw Parent Node Capsules (Drawn on top of lines for high-quality layering)
      nodes.forEach((node: any, index: number) => {
        const angle = (2 * Math.PI * index) / N - Math.PI / 2;
        const targetX = cx + rx * Math.cos(angle);
        const targetY = cy + ry * Math.sin(angle);

        const capW = 210;
        const capH = 56;
        const capX = targetX - capW / 2;
        const capY = targetY - capH / 2;

        const topicName = node.topicName || `Topic ${index + 1}`;
        const wrappedName = wrapParentText(topicName, 22);

        const pTheme = getPastelTheme(index);

        if (mindMapStyle === "pastel") {
          svgContent += `
            <!-- Topic Capsule ${index + 1} -->
            <g filter="url(#dl-shadow)">
              <rect 
                x="${capX}" 
                y="${capY}" 
                width="${capW}" 
                height="${capH}" 
                rx="14" 
                ry="14" 
                fill="${pTheme.fill}" 
                stroke="${pTheme.stroke}" 
                stroke-width="2" 
              />
              
              <!-- Left-side vertical indicator strip -->
              <rect 
                x="${capX + 8}" 
                y="${capY + 8}" 
                width="4" 
                height="${capH - 16}" 
                rx="2" 
                fill="${pTheme.stroke}" 
              />
              
              <!-- Bullet Badge counter index -->
              <circle 
                cx="${capX + 26}" 
                cy="${targetY}" 
                r="10" 
                fill="${pTheme.stroke}" 
                stroke="${pTheme.text}" 
                stroke-width="1.5" 
              />
              <text 
                x="${capX + 26}" 
                y="${targetY + 3.5}" 
                text-anchor="middle" 
                fill="#ffffff" 
                font-size="9" 
                font-weight="900" 
                font-family="'JetBrains Mono', monospace"
              >
                ${index + 1}
              </text>
          `;

          if (wrappedName.length <= 1) {
            const line = wrappedName[0] || topicName;
            svgContent += `
              <text 
                x="${capX + 46}" 
                y="${targetY + 4}" 
                fill="${pTheme.text}" 
                font-size="11.5" 
                font-weight="800" 
                font-family="'Inter', system-ui, sans-serif"
                letter-spacing="0.3"
              >
                ${line.toUpperCase()}
              </text>
            `;
          } else {
            svgContent += `
              <text 
                x="${capX + 46}" 
                y="${targetY - 2}" 
                fill="${pTheme.text}" 
                font-size="10.5" 
                font-weight="800" 
                font-family="'Inter', system-ui, sans-serif"
                letter-spacing="0.3"
              >
                ${wrappedName[0].toUpperCase()}
              </text>
              <text 
                x="${capX + 46}" 
                y="${targetY + 10}" 
                fill="${pTheme.stroke}" 
                font-size="9.5" 
                font-weight="800" 
                font-family="'Inter', system-ui, sans-serif"
                letter-spacing="0.3"
              >
                ${wrappedName[1].toUpperCase()}
              </text>
            `;
          }
        } else {
          svgContent += `
            <!-- Topic Capsule ${index + 1} -->
            <g filter="url(#dl-shadow)">
              <rect 
                x="${capX}" 
                y="${capY}" 
                width="${capW}" 
                height="${capH}" 
                rx="14" 
                ry="14" 
                fill="url(#dl-node-grad)" 
                stroke="#0f766e" 
                stroke-width="2" 
              />
              
              <!-- Left-side vertical indicator strip -->
              <rect 
                x="${capX + 8}" 
                y="${capY + 8}" 
                width="4" 
                height="${capH - 16}" 
                rx="2" 
                fill="#2dd4bf" 
              />
              
              <!-- Bullet Badge counter index -->
              <circle 
                cx="${capX + 26}" 
                cy="${targetY}" 
                r="10" 
                fill="#0c2e2c" 
                stroke="#2dd4bf" 
                stroke-width="1.5" 
              />
              <text 
                x="${capX + 26}" 
                y="${targetY + 3.5}" 
                text-anchor="middle" 
                fill="#2dd4bf" 
                font-size="9" 
                font-weight="900" 
                font-family="'JetBrains Mono', monospace"
              >
                ${index + 1}
              </text>
          `;

          if (wrappedName.length <= 1) {
            const line = wrappedName[0] || topicName;
            svgContent += `
              <text 
                x="${capX + 46}" 
                y="${targetY + 4}" 
                fill="#ffffff" 
                font-size="11.5" 
                font-weight="800" 
                font-family="'Inter', system-ui, sans-serif"
                letter-spacing="0.3"
              >
                ${line.toUpperCase()}
              </text>
            `;
          } else {
            svgContent += `
              <text 
                x="${capX + 46}" 
                y="${targetY - 2}" 
                fill="#ffffff" 
                font-size="10.5" 
                font-weight="800" 
                font-family="'Inter', system-ui, sans-serif"
                letter-spacing="0.3"
              >
                ${wrappedName[0].toUpperCase()}
              </text>
              <text 
                x="${capX + 46}" 
                y="${targetY + 10}" 
                fill="#2dd4bf" 
                font-size="9.5" 
                font-weight="800" 
                font-family="'Inter', system-ui, sans-serif"
                letter-spacing="0.3"
              >
                ${wrappedName[1].toUpperCase()}
              </text>
            `;
          }
        }

        svgContent += `</g>`;
      });

      // 5. Draw Central Hub Bubble (Drawn on top at exact center)
      const hubW = 290;
      const hubH = 92;
      const hubX = cx - hubW / 2;
      const hubY = cy - hubH / 2;

      if (mindMapStyle === "pastel") {
        svgContent += `
          <!-- Central Hub -->
          <g filter="url(#dl-shadow)">
            <rect 
              x="${hubX}" 
              y="${hubY}" 
              width="${hubW}" 
              height="${hubH}" 
              rx="24" 
              ry="24" 
              fill="url(#dl-hub-grad)" 
              stroke="#7c3aed" 
              stroke-width="3" 
            />
            <!-- Highlighting Yellow crown banner -->
            <rect 
              x="${cx - 65}" 
              y="${hubY - 6}" 
              width="130" 
              height="18" 
              rx="6" 
              ry="6" 
              fill="#ffca28" 
            />
            <text 
              x="${cx}" 
              y="${hubY + 6}" 
              text-anchor="middle" 
              fill="#3e2723" 
              font-size="8.5" 
              font-weight="900" 
              font-family="'JetBrains Mono', monospace" 
              letter-spacing="1.5"
            >
              REVISION CENTER
            </text>
            
            <text 
              x="${cx}" 
              y="${cy + 8}" 
              text-anchor="middle" 
              fill="#ffffff" 
              font-size="14" 
              font-weight="900" 
              font-family="'Inter', system-ui, sans-serif" 
              letter-spacing="0.5"
            >
              ${subjectName.toUpperCase()}
            </text>
            
            <text 
              x="${cx}" 
              y="${cy + 27}" 
              text-anchor="middle" 
              fill="#fdfaf6" 
              font-size="9.5" 
              font-weight="800" 
              font-family="'Inter', system-ui, sans-serif" 
              letter-spacing="0.5"
              opacity="0.9"
            >
              CLASS ${gradeLevel} • ${chapterTitle.toUpperCase().slice(0, 36)}
            </text>
          </g>
        `;
      } else {
        svgContent += `
          <!-- Central Hub -->
          <g filter="url(#dl-shadow)">
            <rect 
              x="${hubX}" 
              y="${hubY}" 
              width="${hubW}" 
              height="${hubH}" 
              rx="24" 
              ry="24" 
              fill="url(#dl-hub-grad)" 
              stroke="#2dd4bf" 
              stroke-width="3" 
            />
            <!-- Highlighting Orange crown banner -->
            <rect 
              x="${cx - 65}" 
              y="${hubY - 6}" 
              width="130" 
              height="18" 
              rx="6" 
              ry="6" 
              fill="#f59e0b" 
            />
            <text 
              x="${cx}" 
              y="${hubY + 6}" 
              text-anchor="middle" 
              fill="#0f172a" 
              font-size="8.5" 
              font-weight="900" 
              font-family="'JetBrains Mono', monospace" 
              letter-spacing="1.5"
            >
              REVISION CENTER
            </text>
            
            <text 
              x="${cx}" 
              y="${cy + 8}" 
              text-anchor="middle" 
              fill="#ffffff" 
              font-size="14" 
              font-weight="900" 
              font-family="'Inter', system-ui, sans-serif" 
              letter-spacing="0.5"
            >
              ${subjectName.toUpperCase()}
            </text>
            
            <text 
              x="${cx}" 
              y="${cy + 27}" 
              text-anchor="middle" 
              fill="#e2e8f0" 
              font-size="9.5" 
              font-weight="800" 
              font-family="'Inter', system-ui, sans-serif" 
              letter-spacing="0.5"
              opacity="0.9"
            >
              CLASS ${gradeLevel} • ${chapterTitle.toUpperCase().slice(0, 36)}
            </text>
          </g>
        `;
      }

      // Wrapping inside proper standard XML container
      const finalSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg 
  xmlns="http://www.w3.org/2000/svg" 
  viewBox="0 0 ${width} ${height}" 
  width="${width}" 
  height="${height}"
>
  <style>
    text {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      user-select: none;
    }
  </style>
  ${svgContent}
</svg>`;

      return finalSvg;
    };

    const title = revisionDeckData?.mindMap?.title || "Concept_Mind_Map";
    const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, "_").replace(/__+/g, "_");
    const subName = (activeRevisionSession?.subject || subject || "Syllabus").replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `${cleanTitle}_${subName}`;

    const svgString = generateFullDetailedMindMapSVG();

    if (format === "svg") {
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      // PNG format - convert SVG to high-definition Canvas
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        // Super high resolution rendering (1600x1200)
        canvas.width = 1600;
        canvas.height = 1200;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Draw SVG onto canvas
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Clean up object URL
        URL.revokeObjectURL(url);
        
        // Download PNG
        const pngUrl = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = pngUrl;
        link.download = `${filename}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      };
      
      img.onerror = () => {
        // Fallback to direct SVG if PNG rendering fails due to canvas security/conversions
        const fallbackLink = document.createElement("a");
        fallbackLink.href = url;
        fallbackLink.download = `${filename}.svg`;
        document.body.appendChild(fallbackLink);
        fallbackLink.click();
        document.body.removeChild(fallbackLink);
      };
      
      img.src = url;
    }
  };

  const toggleCardMastery = (cardId: string) => {
    if (!activeRevisionSession) return;
    setMasteredCards(prev => {
      const updated = { ...prev, [cardId]: !prev[cardId] };
      const storageKey = `revision_mastery_${activeRevisionSession.sessionId || activeRevisionSession.index}`;
      localStorage.setItem(storageKey, JSON.stringify(updated));
      return updated;
    });
  };

  const toggleNodeExpansion = (nodeIdx: number) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeIdx]: !prev[nodeIdx]
    }));
    setLastSelectedNodeId(nodeIdx);
    setSelectedSubNode(null);
  };

  const handleSvgNodeClick = (nodeIdx: number) => {
    setExpandedNodes({ [nodeIdx]: true });
    setLastSelectedNodeId(nodeIdx);
    setSelectedSubNode(null);
    setTimeout(() => {
      const element = document.getElementById(`mindmap-node-${nodeIdx}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  };

  const handleGenerateRevisionDeck = async (sess: any) => {
    setActiveRevisionSession(sess);
    setLoadingRevision(true);
    setRevisionDeckData(null);
    setCurrentFlashcardIndex(0);
    setIsFlashcardFlipped(false);
    setMindMapSearch("");
    setMindMapQuickFilter("all");
    setLastSelectedNodeId(null);
    setSelectedSubNode(null);
    setMindMapViewMode("interactive");
    setIsMapFullscreen(false);
    
    try {
      const combinedChalkContent = sess.customBoardContent || 
        (sess.topicBoardsContent ? Object.values(sess.topicBoardsContent).join("\n") : "");

      const response = await fetch("/api/generate-revision-deck", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionTitle: sess.processedTitle,
          subject: sess.subject || subject,
          topics: sess.topics || [],
          blackboardContent: combinedChalkContent
        })
      });

      if (!response.ok) {
        throw new Error("Generation request failed");
      }

      const resData = await response.json();
      if (resData.success && resData.data) {
        localStorage.setItem(`revision_deck_${sess.sessionId || sess.index}`, JSON.stringify(resData.data));
        handleOpenRevisionDeck(sess, resData.data);
      } else {
        throw new Error(resData.error || "Invalid response structure");
      }
    } catch (error) {
      console.error("Error generating revision deck:", error);
      alert("Sorry, could not generate revision deck at this time. Please try again!");
      setActiveRevisionSession(null);
    } finally {
      setLoadingRevision(false);
    }
  };

  const [activeTab, setActiveTab] = useState<"activity" | "gallery">("activity");
  const [activeMobileSubTab, setActiveMobileSubTab] = useState<"profile" | "books" | "stats" | "counselor">("stats");
  const [editingProfile, setEditingProfile] = useState(false);
  
  // States for student editable metrics
  const [editName, setEditName] = useState(studentName);
  const [editGrade, setEditGrade] = useState(grade);
  const [editSubject, setEditSubject] = useState(subject);
  const [editBoard, setEditBoard] = useState(board);
  const [editMediumOfLearning, setEditMediumOfLearning] = useState(mediumOfLearning);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setEditName(studentName);
    setEditGrade(grade);
    setEditSubject(subject);
    setEditBoard(board);
    setEditMediumOfLearning(mediumOfLearning);
  }, [studentName, grade, subject, board, mediumOfLearning]);

  const currentUser = auth.currentUser || (() => {
    const cached = localStorage.getItem("local_active_user");
    if (cached) {
      try { return JSON.parse(cached); } catch (_) {}
    }
    return null;
  })();

  // Retrieve blackboard snapshots from Firebases
  const fetchSnapshots = async () => {
    if (!currentUser) return;
    setLoadingSnapshots(true);
    try {
      if (currentUser.uid === "local_guest_student" || currentUser.uid.startsWith("local_")) {
        throw new Error("Local guest user bypassed database fetch");
      }
      const snapRef = collection(db, "studentProfiles", currentUser.uid, "boardSnapshots");
      const q = query(snapRef, orderBy("timestamp", "desc"));
      const snapshotDocs = await getDocs(q);
      const parsed = snapshotDocs.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          snapshotId: d.snapshotId || docSnap.id,
          userId: d.userId,
          topicTitle: d.topicTitle || "Mathematics Concept Formulation",
          description: d.description || "Interactive calculation whiteboard screenshot.",
          imgData: d.imgData,
          timestamp: d.timestamp
        } as BoardSnapshot;
      });
      setSnapshots(parsed);
      localStorage.setItem(`snapshots_${currentUser.uid}`, JSON.stringify(parsed));
    } catch (e) {
      console.warn("Could not read student whiteboard snapshots from Firestore, loading local cache:", e);
      const cached = localStorage.getItem(`snapshots_${currentUser.uid}`);
      if (cached) {
        try {
          setSnapshots(JSON.parse(cached));
        } catch (_) {}
      }
    } finally {
      setLoadingSnapshots(false);
    }
  };

  // Real-time snapshots and quiz attempts listeners
  useEffect(() => {
    if (!currentUser) return;
    const isGuest = currentUser.uid === "local_guest_student" || currentUser.uid.startsWith("local_");
    if (isGuest) {
      // Local Guest fallbacks
      const cachedSnaps = localStorage.getItem(`snapshots_${currentUser.uid}`);
      if (cachedSnaps) {
        try { setSnapshots(JSON.parse(cachedSnaps)); } catch (_) {}
      }
      const cachedQuizzes = localStorage.getItem(`guest_quiz_attempts_${subject}`);
      if (cachedQuizzes) {
        try { setQuizAttempts(JSON.parse(cachedQuizzes)); } catch (_) {}
      }
      return;
    }

    // 1. Real-time board snapshots listener
    const snapRef = collection(db, "studentProfiles", currentUser.uid, "boardSnapshots");
    const qSnaps = query(snapRef, orderBy("timestamp", "desc"));
    const unsubSnaps = onSnapshot(qSnaps, (snapshotDocs) => {
      const parsed = snapshotDocs.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          snapshotId: d.snapshotId || docSnap.id,
          userId: d.userId,
          topicTitle: d.topicTitle || "Mathematics Concept Formulation",
          description: d.description || "Interactive calculation whiteboard screenshot.",
          imgData: d.imgData,
          timestamp: d.timestamp
        } as BoardSnapshot;
      });
      setSnapshots(parsed);
      localStorage.setItem(`snapshots_${currentUser.uid}`, JSON.stringify(parsed));
    }, (error) => {
      console.warn("Realtime board snapshots listener failed:", error);
    });

    // 2. Real-time quiz attempts listener
    const attemptsRef = collection(db, "studentProfiles", currentUser.uid, "quizAttempts");
    const qQuizzes = query(attemptsRef, orderBy("timestamp", "desc"));
    const unsubQuizzes = onSnapshot(qQuizzes, (snapshotDocs) => {
      const parsed = snapshotDocs.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          attemptId: docSnap.id,
          timestamp: d.timestamp,
          score: d.score,
          total: d.total,
          accuracy: d.accuracy,
          source: d.source,
          docName: d.docName,
          subject: d.subject,
          grade: d.grade,
          history: d.history || []
        };
      });
      setQuizAttempts(parsed);
      localStorage.setItem(`quizAttempts_${currentUser.uid}`, JSON.stringify(parsed));
    }, (error) => {
      console.warn("Realtime quiz attempts listener failed:", error);
    });

    return () => {
      unsubSnaps();
      unsubQuizzes();
    };
  }, [currentUser?.uid, subject]);

  // Compute dashboard statistics in real-time
  const dashboardStats = useMemo(() => {
    // Filter attempts for currently selected subject, or use all as fallback if active subject has no attempts
    let subjectAttempts = quizAttempts.filter(
      (a) => (a.subject || "").toLowerCase() === subject.toLowerCase()
    );
    if (subjectAttempts.length === 0) {
      subjectAttempts = quizAttempts; // Fallback to all
    }

    // Default dimensions if no attempts are recorded
    let conceptClarity = 75;
    let theoreticalCore = 70;
    let calculationPrecision = 60;
    let formulaRecall = 65;
    
    // Strengths & Growth lists
    let strengths: Array<{ concept: string; category: string }> = [];
    let growths: Array<{ concept: string; category: string; explanation: string }> = [];

    if (subjectAttempts.length > 0) {
      // Gather all question answers
      let conceptCorrect = 0, conceptTotal = 0;
      let theoryCorrect = 0, theoryTotal = 0;
      let calcCorrect = 0, calcTotal = 0;
      let formulaCorrect = 0, formulaTotal = 0;

      subjectAttempts.forEach((attempt) => {
        const history = attempt.history || [];
        history.forEach((h: any) => {
          const category = (h.cognitiveCategory || "").toLowerCase();
          const isCorrect = !!h.isCorrect;
          
          if (category.includes("concept") || category.includes("clarity")) {
            conceptTotal++;
            if (isCorrect) conceptCorrect++;
          } else if (category.includes("theory") || category.includes("theoretical") || category.includes("core")) {
            theoryTotal++;
            if (isCorrect) theoryCorrect++;
          } else if (category.includes("calculation") || category.includes("solving") || category.includes("precision")) {
            calcTotal++;
            if (isCorrect) calcCorrect++;
          } else if (category.includes("formula") || category.includes("retention") || category.includes("recall")) {
            formulaTotal++;
            if (isCorrect) formulaCorrect++;
          }

          // Gather strengths and growths
          if (isCorrect) {
            if (h.conceptTested && !strengths.some(s => s.concept === h.conceptTested)) {
              strengths.push({ concept: h.conceptTested, category: h.cognitiveCategory || "Topic Mastery" });
            }
          } else {
            if (h.conceptTested && !growths.some(g => g.concept === h.conceptTested)) {
              growths.push({ 
                concept: h.conceptTested, 
                category: h.cognitiveCategory || "Topic Mastery",
                explanation: h.explanation || h.theoryTested || "A quick chalkboard review will help solidify this concept!"
              });
            }
          }
        });
      });

      if (conceptTotal > 0) conceptClarity = Math.round((conceptCorrect / conceptTotal) * 100);
      if (theoryTotal > 0) theoreticalCore = Math.round((theoryCorrect / theoryTotal) * 100);
      if (calcTotal > 0) calculationPrecision = Math.round((calcCorrect / calcTotal) * 100);
      if (formulaTotal > 0) formulaRecall = Math.round((formulaCorrect / formulaTotal) * 100);
    }

    // Classroom Engagement / Socratic Stamina calculation
    const classesSess = pastSessions?.length || 0;
    const totalSnapshots = snapshots?.length || 0;
    const totalQuizzes = quizAttempts?.length || 0;
    const masteredCount = Object.keys(masteredCards).filter(k => masteredCards[k]).length;

    const sessionScore = Math.min(45, classesSess * 15);
    const snapScore = Math.min(25, totalSnapshots * 5);
    const quizScore = Math.min(20, totalQuizzes * 10);
    const cardScore = Math.min(10, masteredCount * 2);
    
    const socraticStamina = Math.min(100, Math.max(30, sessionScore + snapScore + quizScore + cardScore));

    // Default lists if empty to keep dashboard lively
    if (strengths.length === 0) {
      strengths = [
        { concept: "Linear Equation Formulation", category: "Conceptual Application" },
        { concept: "Standard Chalkboard Definitions", category: "Theoretical Core" },
      ];
    }
    if (growths.length === 0) {
      growths = [
        { 
          concept: "Multi-Step Calculation Flow", 
          category: "Calculations & Solving", 
          explanation: "Watch for signs when transposing terms across algebraic equations." 
        },
        { 
          concept: "Formulas for Area & Volume", 
          category: "Formula Retention", 
          explanation: "Practice active recall on area coefficients of common geometric shapes." 
        }
      ];
    }

    return {
      conceptClarity,
      theoreticalCore,
      calculationPrecision,
      formulaRecall,
      socraticStamina,
      strengths,
      growths,
      subjectAttempts
    };
  }, [quizAttempts, subject, pastSessions, snapshots, masteredCards]);

  const lowestMetric = useMemo(() => {
    const metrics = [
      { name: "Concept Clarity", score: dashboardStats.conceptClarity, icon: "🎯" },
      { name: "Theoretical Core", score: dashboardStats.theoreticalCore, icon: "📖" },
      { name: "Calculation Precision", score: dashboardStats.calculationPrecision, icon: "⚡" },
      { name: "Formula Recall", score: dashboardStats.formulaRecall, icon: "🧠" },
      { name: "Socratic Stamina", score: dashboardStats.socraticStamina, icon: "🔥" },
    ];
    return metrics.reduce((min, m) => (m.score < min.score ? m : min), metrics[0]);
  }, [dashboardStats]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setSavingProfile(true);
    try {
      const profileData = {
        name: editName,
        grade: editGrade,
        subject: editSubject,
        board: editBoard,
        mediumOfLearning: editMediumOfLearning
      };
      localStorage.setItem(`studentProfile_${currentUser.uid}`, JSON.stringify(profileData));

      if (currentUser.uid !== "local_guest_student" && !currentUser.uid.startsWith("local_")) {
        const profileRef = doc(db, "studentProfiles", currentUser.uid);
        await updateDoc(profileRef, {
          ...profileData,
          updatedAt: serverTimestamp()
        });
      }
      setEditingProfile(false);
      if (onRefreshProfile) onRefreshProfile();
    } catch (err) {
      console.warn("Failed saving student updates to Firestore, saved locally:", err);
      setEditingProfile(false);
      if (onRefreshProfile) onRefreshProfile();
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteSnapshot = async (id: string) => {
    if (!currentUser) return;
    if (!confirm("Are you sure you want to delete this board snapshot?")) return;
    try {
      // Delete from local storage cache
      const cachedKey = `snapshots_${currentUser.uid}`;
      const cachedStr = localStorage.getItem(cachedKey);
      if (cachedStr) {
        try {
          const localSnaps = JSON.parse(cachedStr);
          const filtered = localSnaps.filter((s: any) => s.id !== id && s.snapshotId !== id);
          localStorage.setItem(cachedKey, JSON.stringify(filtered));
        } catch (_) {}
      }
      setSnapshots((prev) => prev.filter((s) => s.id !== id && s.snapshotId !== id));

      if (currentUser.uid !== "local_guest_student" && !currentUser.uid.startsWith("local_")) {
        await deleteDoc(doc(db, "studentProfiles", currentUser.uid, "boardSnapshots", id));
      }
    } catch (e) {
      console.warn("Failed deleting snapshot from Firestore, deleted locally:", e);
    }
  };

  const handleDownloadImage = (snapshot: BoardSnapshot) => {
    try {
      const link = document.createElement("a");
      link.href = snapshot.imgData;
      link.download = `${snapshot.topicTitle.replace(/[^a-zA-Z0-9]/g, "_")}_board.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed downloading snapshot image file:", err);
    }
  };

  const formatDate = (ts: any) => {
    if (!ts) return "Just now";
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return "Saved Topic";
    }
  };

  const handleExportSessionToPDF = (sess: any) => {
    try {
      const isCurrentSessionObj = !sess || sess.sessionId === sessionId;
      const sessTopics = sess && sess.topics ? sess.topics : (isCurrentSessionObj ? topics : []);
      const sessTopicBoards = sess && sess.topicBoardsContent ? sess.topicBoardsContent : (isCurrentSessionObj ? topicBoardsContent : {});
      const sessCustomBoard = sess && sess.customBoardContent ? sess.customBoardContent : (isCurrentSessionObj ? customBoardContent : "");

      const activeSubjectName = sess?.subject || subject || "Hindi";
      const rawTitle = sess && sess.activeDocumentName 
        ? sess.activeDocumentName 
        : (isCurrentSessionObj ? (`${activeSubjectName} - Active Classroom Session`) : "Classroom Lecture Notes");
      
      const cleanSessionTitle = sanitizeTitleForPDF(rawTitle, activeSubjectName, sessTopics);
      
      const sessionDateStr = sess && sess.updatedAt?.seconds 
        ? new Date(sess.updatedAt.seconds * 1000).toLocaleString()
        : new Date().toLocaleString();

      let compiledHtml = "";

      if (sessTopics && sessTopics.length > 0) {
        // Compile all topic sequential parts with their chalk content!
        sessTopics.forEach((topicText: string, index: number) => {
          const headerLine = topicText.split("\n")[0] || "";
          const rawHeader = headerLine.replace(/[\#\*\_]/g, "").trim() || `Topic Part ${index + 1}`;
          const cleanHeader = sanitizeTitleForPDF(rawHeader);
          
          const boardContentForTopic = sessTopicBoards[index] || "";
          
          // Fallback to custom board content for first page if empty
          let displayNotes = boardContentForTopic;
          if (index === 0 && !displayNotes && sessCustomBoard) {
            displayNotes = sessCustomBoard;
          }
          
          const cleanNotes = displayNotes ? displayNotes.trim() : "";
          const notesHTML = compileWhiteboardToHTML(cleanNotes);

          compiledHtml += `
            <div class="pdf-page-wrapper" style="margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1.5px dashed rgba(255, 255, 255, 0.15); page-break-inside: avoid;">
              <div class="slide-header" style="display: flex; justify-content: space-between; font-size: 10px; font-family: 'JetBrains Mono', monospace; color: #67e8f9; font-weight: bold; padding-bottom: 8px; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08);">
                <span>📝 TOPIC SECTION ${index + 1}</span>
                <span>CHERRY LECTURE HANDOUT</span>
              </div>
              <h2 class="slide-title" style="font-family: 'Space Grotesk', sans-serif; font-size: 14px; color: #ffffff; margin-top: 0; margin-bottom: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
                📌 ${cleanHeader}
              </h2>
              <div class="parsed-latex-topic-content font-chalk text-left" style="background-color: #0b241e; border: 1.5px solid rgba(103, 232, 249, 0.2); color: #f3f4f6; padding: 20px; border-radius: 12px; font-family: 'Inter', sans-serif; font-size: 12.5px; line-height: 1.7; box-shadow: inset 0 2px 6px rgba(0,0,0,0.3);">
                ${notesHTML}
              </div>
            </div>
          `;
        });
      } else {
        // Fallback for single general topic
        const cleanContent = sessCustomBoard ? sessCustomBoard.trim() : "";
        const notesHTML = compileWhiteboardToHTML(cleanContent);
        compiledHtml += `
          <div class="pdf-page-wrapper" style="margin-bottom: 24px; page-break-inside: avoid;">
            <div class="slide-header" style="display: flex; justify-content: space-between; font-size: 10px; font-family: 'JetBrains Mono', monospace; color: #67e8f9; font-weight: bold; padding-bottom: 8px; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08);">
              <span>📝 BLACKBOARD SHEET</span>
              <span>CHERRY LECTURE HANDOUT</span>
            </div>
            <h2 class="slide-title" style="font-family: 'Space Grotesk', sans-serif; font-size: 14px; color: #ffffff; margin-top: 0; margin-bottom: 12px; font-weight: 800; text-transform: uppercase;">
              📌 Main Chalkboard Calculations
            </h2>
            <div class="parsed-latex-topic-content font-chalk text-left" style="background-color: #0b241e; border: 1.5px solid rgba(103, 232, 249, 0.2); color: #f3f4f6; padding: 20px; border-radius: 12px; font-family: 'Inter', sans-serif; font-size: 12.5px; line-height: 1.7; box-shadow: inset 0 2px 6px rgba(0,0,0,0.3);">
              ${notesHTML}
            </div>
          </div>
        `;
      }

      // 2. Open pop-up window formatted perfectly as a digital Blackboard hand-book
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        alert("Pop-up blocker is preventing PDF generation. Please allow pop-ups for this site to export study materials!");
        return;
      }

      const bookTitle = `${cleanSessionTitle} - Blackboard Book`;

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${bookTitle.replace(/[^a-zA-Z0-9]/g, "_")}</title>
          <meta charset="utf-8">
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;505;600;700;850&family=Space+Grotesk:wght@600;750;850&family=JetBrains+Mono&display=swap">
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
          <script src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
          <script src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js"></script>
          <style>
            body {
              font-family: 'Inter', system-ui, sans-serif;
              color: #f1f5f9;
              line-height: 1.6;
              margin: 0;
              padding: 30px;
              background-color: #041411; /* Dark aesthetic blackboard classroom canvas background */
            }
            .book-container {
              max-width: 860px;
              margin: 0 auto;
              background: #061c18; /* Rich slate dark green board sheet */
              border: 1.5px solid rgba(196, 245, 0, 0.2);
              border-radius: 20px;
              padding: 40px;
              box-shadow: 0 10px 40px rgba(0,0,0,0.4);
            }
            .print-header {
              border-bottom: 2px solid #c4f500;
              padding-bottom: 16px;
              margin-bottom: 24px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .print-title {
              font-family: 'Space Grotesk', sans-serif;
              color: #ffffff;
              font-size: 20px;
              font-weight: 850;
              letter-spacing: -0.5px;
              margin: 0;
              text-transform: uppercase;
            }
            .print-subtitle {
              color: #c4f500;
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 1.5px;
              margin: 4px 0 0 0;
            }
            .print-brand {
              font-family: 'Space Grotesk', sans-serif;
              font-weight: 800;
              font-size: 11px;
              color: #061c18;
              background-color: #c4f500;
              padding: 6px 14px;
              border-radius: 8px;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 12px;
              background-color: rgba(196, 245, 0, 0.05);
              padding: 18px;
              border-radius: 12px;
              margin-bottom: 30px;
              border: 1px solid rgba(196, 245, 0, 0.1);
            }
            .meta-item {
              display: flex;
              flex-direction: column;
            }
            .meta-label {
              font-size: 9px;
              font-family: 'JetBrains Mono', monospace;
              text-transform: uppercase;
              color: #8fa09d;
              font-weight: 700;
              letter-spacing: 0.5px;
            }
            .meta-value {
              font-size: 12px;
              font-weight: 700;
              color: #ffffff;
              margin-top: 2px;
            }
            .block-math-pdf-container {
              background: rgba(255,255,255,0.04);
              border-radius: 8px;
              padding: 16px;
              margin: 16px 0;
              overflow-x: auto;
              border-left: 3.5px solid #c4f500;
              text-align: center;
              box-shadow: inset 0 1px 4px rgba(0,0,0,0.2);
            }
            .block-math-pdf-container .katex-display {
              margin: 0;
            }
            .def-pdf-card {
              border-left: 4px solid #c4f500;
              background-color: rgba(255,255,255,0.03);
              padding: 12px;
              border-radius: 0 8px 8px 0;
              margin: 12px 0;
            }
            .def-pdf-label {
              display: block;
              font-weight: 800;
              font-family: 'Space Grotesk', sans-serif;
              font-size: 11px;
              color: #c4f500;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-bottom: 2px;
            }
            .def-pdf-detail {
              font-size: 12px;
              color: #e2e8f0;
            }
            .heading-pdf {
              font-family: 'Space Grotesk', sans-serif;
              font-size: 13px;
              color: #c4f500;
              border-bottom: 1px solid rgba(255,255,255,0.1);
              padding-bottom: 4px;
              margin-top: 20px;
              margin-bottom: 10px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .print-footer {
              margin-top: 40px;
              border-top: 1px solid rgba(196,245,0,0.15);
              padding-top: 16px;
              font-size: 10.5px;
              color: #cbd5e1;
              font-weight: 600;
              text-transform: uppercase;
              text-align: center;
              letter-spacing: 1px;
            }
            .action-panel {
              background: #082621;
              border: 1.5px dashed rgba(196, 245, 0, 0.3);
              border-radius: 12px;
              padding: 16px;
              margin-bottom: 24px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              color: white;
            }
            .action-btn {
              background-color: #c4f500;
              color: #061c18;
              border: none;
              padding: 10px 20px;
              font-size: 12px;
              font-family: 'Space Grotesk', sans-serif;
              font-weight: 800;
              border-radius: 8px;
              cursor: pointer;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              transition: all 0.2s;
            }
            .action-btn:hover {
              background-color: #b0dc00;
              transform: translateY(-1px);
            }
            @media print {
              .no-print {
                display: none !important;
              }
              body {
                padding: 0;
                background-color: transparent;
                color: #000000 !important;
              }
              .book-container {
                border: none;
                padding: 0;
                box-shadow: none;
                background: transparent !important;
              }
              .print-title {
                color: #1e293b !important;
              }
              .print-brand {
                border: 1.5px solid #0f766e !important;
                background-color: transparent !important;
                color: #0f766e !important;
              }
              .meta-grid {
                background-color: #f1f5f9 !important;
                border: 1px solid #cbd5e1 !important;
              }
              .meta-value {
                color: #1e293b !important;
              }
              .meta-label {
                color: #64748b !important;
              }
              .parsed-latex-topic-content {
                background-color: #f8fafc !important;
                border: 1.5px solid #e2e8f0 !important;
                color: #1e293b !important;
                box-shadow: none !important;
              }
              .block-math-pdf-container {
                background: #f1f5f9 !important;
                border-left-color: #0f766e !important;
              }
              .heading-pdf {
                color: #0f766e !important;
                border-bottom-color: #cbd5e1 !important;
              }
              .def-pdf-card {
                border-left-color: #0f766e !important;
              }
              .def-pdf-label {
                color: #0f766e !important;
              }
              .def-pdf-detail {
                color: #334155 !important;
              }
              body {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="action-panel no-print">
            <div style="text-align: left;">
              <span style="font-size: 13px; font-weight: 850; color: #ffffff;">Board-Book Generation Center</span>
              <p style="font-size: 11px; color: #cbd5e1; margin: 4px 0 0 0;">Review your formatted math calculations & chalkboard slides, then tap below to download as a secure PDF.</p>
            </div>
            <button class="action-btn" onclick="window.print()">🖨️ Save as PDF / Print Book</button>
          </div>

          <div class="book-container">
            <div class="print-header">
              <div style="text-align: left;">
                <h1 class="print-title">${cleanSessionTitle}</h1>
                <p class="print-subtitle">Maestry Whiteboard Session Study Handout</p>
              </div>
              <div class="print-brand">
                Cherry Ma'am
              </div>
            </div>

            <div class="meta-grid">
              <div class="meta-item">
                <span class="meta-label">Prepared For</span>
                <span class="meta-value">${studentName || "Cherry's Student"}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Class Year & Subject</span>
                <span class="meta-value">${grade} • ${subject}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Class Topic</span>
                <span class="meta-value">${cleanSessionTitle}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Saved Time</span>
                <span class="meta-value">${sessionDateStr}</span>
              </div>
            </div>

            <div class="notes-section">
              ${compiledHtml}
            </div>

            <div class="print-footer">
              Study material synchronized via Maestry Cloud Sync • Optimized for PDF Printout 🌸
            </div>
          </div>

          <script>
            window.addEventListener('DOMContentLoaded', () => {
              if (window.renderMathInElement) {
                renderMathInElement(document.body, {
                  delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false}
                  ]
                });
              }
              setTimeout(() => {
                window.print();
              }, 800);
            });
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      console.error("Single Session PDF download compilation failed:", err);
    }
  };

  const handleExportToPDF = (sessionTitle: string, latexContent: string, timestampStr: string) => {
    try {
      const cleanTitle = sanitizeTitleForPDF(sessionTitle, subject, topics);
      // 1. Compile LaTeX blackboard to highly formatted print-ready HTML
      const parsedHTML = compileWhiteboardToHTML(latexContent);

      // 2. Open pop-up window for clean native system printing
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        alert("Pop-up blocker is preventing PDF generation. Please allow pop-ups for this site to export study materials!");
        return;
      }

      // 3. Populate HTML template styled perfectly for print-to-PDF output
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Session Study Notes - ${sessionTitle.replace(/[^a-zA-Z0-9]/g, "_")}</title>
          <meta charset="utf-8">
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700&family=JetBrains+Mono&display=swap');
            
            body {
              font-family: 'Inter', system-ui, sans-serif;
              color: #1e293b;
              line-height: 1.6;
              margin: 0;
              padding: 45px;
              background-color: #ffffff;
            }
            .print-header {
              border-bottom: 2px dashed #0f766e;
              padding-bottom: 16px;
              margin-bottom: 28px;
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
            }
            .header-main {
              flex: 1;
            }
            .print-title {
              font-family: 'Space Grotesk', sans-serif;
              color: #0f3c42;
              font-size: 24px;
              font-weight: 800;
              letter-spacing: -0.5px;
              margin: 0;
              text-transform: uppercase;
            }
            .print-subtitle {
              color: #0f766e;
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 2px;
              margin: 6px 0 0 0;
            }
            .print-brand {
              text-align: right;
              font-family: 'Space Grotesk', sans-serif;
              font-weight: 700;
              font-size: 11px;
              color: #0f766e;
              border: 1.5px solid #0f766e;
              padding: 4px 10px;
              border-radius: 8px;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 16px;
              background: #f0fdfa;
              border: 1px solid #ccfbf1;
              border-radius: 12px;
              padding: 16px;
              margin-bottom: 32px;
              font-size: 12.5px;
            }
            .meta-item {
              display: flex;
              flex-direction: column;
            }
            .meta-label {
              color: #0d9488;
              font-weight: 700;
              text-transform: uppercase;
              font-size: 9.5px;
              letter-spacing: 0.8px;
            }
            .meta-value {
              color: #1e293b;
              font-weight: 650;
              margin-top: 3px;
            }
            .notes-section {
              margin-top: 20px;
              min-height: 300px;
            }
            .heading-pdf {
              font-family: 'Space Grotesk', sans-serif;
              color: #0c4f52;
              font-size: 17px;
              font-weight: 750;
              margin-top: 28px;
              margin-bottom: 12px;
              border-left: 4.5px solid #14b8a6;
              padding-left: 12px;
              page-break-after: avoid;
            }
            .paragraph-pdf {
              font-size: 13px;
              margin-bottom: 12px;
              color: #334155;
              text-align: justify;
            }
            .bullet-pdf {
              font-size: 13px;
              margin-bottom: 8px;
              color: #334155;
              margin-left: 24px;
              list-style-type: square;
            }
            .block-math-pdf-container {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 20px;
              margin: 20px 0;
              text-align: center;
              overflow-x: auto;
              page-break-inside: avoid;
              box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.02);
            }
            .katex-display {
              margin: 0.5em 0 !important;
              overflow-x: auto;
              overflow-y: hidden;
            }
            .def-pdf-card {
              background: #fffbeb;
              border-left: 4.5px solid #f59e0b;
              border-radius: 4px 10px 10px 4px;
              padding: 14px 18px;
              margin: 18px 0;
              page-break-inside: avoid;
            }
            .def-pdf-label {
              display: block;
              font-size: 10px;
              text-transform: uppercase;
              font-weight: 800;
              color: #b45309;
              letter-spacing: 0.8px;
            }
            .def-pdf-detail {
              display: block;
              font-size: 12.5px;
              color: #78350f;
              margin-top: 5px;
              font-weight: 500;
            }
            code {
              font-family: 'JetBrains Mono', monospace;
              background-color: #f1f5f9;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 12px;
              color: #0f172a;
              border: 1px solid #e2e8f0;
            }
            strong {
              color: #0f172a;
              font-weight: 700;
            }
            .error-math-pdf {
              color: #ef4444;
              font-family: 'JetBrains Mono', monospace;
              background: #fef2f2;
              border: 1px solid #fee2e2;
              padding: 12px;
              border-radius: 10px;
              margin: 12px 0;
              font-size: 11px;
            }
            .print-footer {
              margin-top: 60px;
              border-top: 1.5px solid #e2e8f0;
              padding-top: 20px;
              text-align: center;
              font-size: 10.5px;
              color: #64748b;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 1px;
              page-break-inside: avoid;
            }
            @media print {
              body {
                padding: 0;
              }
              .no-print {
                display: none;
              }
              @page {
                size: A4;
                margin: 2cm;
              }
            }
          </style>
        </head>
        <body>
          <div class="print-header">
            <div class="header-main">
              <h1 class="print-title">${cleanTitle}</h1>
              <p class="print-subtitle">Maestry Interactive Classroom Handout</p>
            </div>
            <div class="print-brand">
              Cherry Ma'am
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-item">
              <span class="meta-label">Prepared For</span>
              <span class="meta-value">\${studentName || "Cherry's Student"}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Class Year & Subject</span>
              <span class="meta-value">\${grade} • \${subject}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Class Topic</span>
              <span class="meta-value">\${cleanTitle}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Saved Time</span>
              <span class="meta-value">\${timestampStr}</span>
            </div>
          </div>

          <div class="notes-section">
            \${parsedHTML}
          </div>

          <div class="print-footer">
            Study material synchronized via Maestry Cloud Sync • Optimized for PDF Printout 🌸
          </div>

          <script>
            window.addEventListener('DOMContentLoaded', () => {
              setTimeout(() => {
                window.print();
              }, 600);
            });
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      console.error("PDF generator crash details:", err);
    }
  };

  const handleExportCombinedPDF = () => {
    try {
      const isSnapshotsEmpty = !allSnapshots || allSnapshots.length === 0;
      
      const bookTitle = `${subject} Combined Blackboard Lecture-Book`;
      const subTitle = isSnapshotsEmpty 
        ? "Syllabus Taught Sequence Handouts" 
        : "Whiteboard Snapped Lecture Pages";

      let combinedHtml = "";
      
      const sortedSnapshots = [...allSnapshots].sort((a, b) => {
        const timeA = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : new Date(a.timestamp).getTime();
        const timeB = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : new Date(b.timestamp).getTime();
        return timeA - timeB;
      });

      if (!isSnapshotsEmpty) {
        sortedSnapshots.forEach((item, index) => {
          const dateStr = formatDate(item.timestamp);
          const cleanSlideTitle = sanitizeTitleForPDF(item.topicTitle);
          combinedHtml += `
            <div class="pdf-page-wrapper">
              <div class="slide-header">
                <span class="slide-number">BOARD SLIDE #${String(index + 1).padStart(2, '0')}</span>
                <span class="slide-time">📅 ${dateStr}</span>
              </div>
              
              <h2 class="slide-title">📌 ${cleanSlideTitle}</h2>
              
              <div class="chalkboard-frame-container">
                ${item.imgData ? `
                  <img src="${item.imgData}" alt="${cleanSlideTitle}" class="chalkboard-image" referrerpolicy="no-referrer" />
                ` : `
                  <div class="no-image-placeholder">Visual Board Frame Preview Pending</div>
                `}
              </div>

              <div class="slide-notes-card">
                <div class="notes-badge">🎓 TOPIC EXPLANATION & STUDY NOTE</div>
                <p class="notes-text">${item.description || "Interactive whiteboard derivations, drawings, and chalkboard notes."}</p>
              </div>
            </div>
          `;
        });
      } else if (topics && topics.length > 0) {
        // Compile ALL topics/slides from active syllabus in chronological sequence! This is an amazing feature!
        topics.forEach((topicContent, index) => {
          const rawHeading = topicContent.split("\n")[0].replace(/[#*]/g, "").trim() || `Topic ${index + 1}`;
          const headingText = sanitizeTitleForPDF(rawHeading);
          const contentHTML = compileWhiteboardToHTML(topicContent);
          
          combinedHtml += `
            <div class="pdf-page-wrapper">
              <div class="slide-header">
                <span class="slide-number">SYLLABUS TOPIC #${String(index + 1).padStart(2, '0')}</span>
                <span class="slide-time">📚 Sequence Taught Material</span>
              </div>
              
              <h2 class="slide-title">📌 ${headingText}</h2>
              
              <div class="parsed-latex-topic-content">
                ${contentHTML}
              </div>
            </div>
          `;
        });
      } else {
        const fallbackHTML = compileWhiteboardToHTML(customBoardContent || "No active whiteboard chalkboard notes compiled in active lecture workspace yet.");
        combinedHtml += `
          <div class="pdf-page-wrapper">
            <div class="slide-header">
              <span class="slide-number">ACTIVE SLATE BOARD</span>
              <span class="slide-time">📸 Instant Handout</span>
            </div>
            <h2 class="slide-title">📌 Active Whiteboard Formulas</h2>
            <div class="parsed-latex-topic-content">
              ${fallbackHTML}
            </div>
          </div>
        `;
      }

      const finalHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${bookTitle} - ${studentName || "Cherry's Student"}</title>
          <meta charset="utf-8">
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700&family=JetBrains+Mono&display=swap">
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
          <script src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
          <script src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js"></script>
          <style>
            body {
              font-family: 'Inter', system-ui, sans-serif;
              color: #1e293b;
              line-height: 1.6;
              margin: 0;
              padding: 30px;
              background-color: #f8fafc;
            }
            .book-container {
              max-width: 840px;
              margin: 0 auto;
              background: #ffffff;
              border: 1px solid #e2e8f0;
              border-radius: 20px;
              padding: 40px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.03);
            }
            .print-header {
              border-bottom: 2px solid #0f766e;
              padding-bottom: 16px;
              margin-bottom: 24px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .print-title {
              font-family: 'Space Grotesk', sans-serif;
              color: #0f3c42;
              font-size: 21px;
              font-weight: 850;
              letter-spacing: -0.5px;
              margin: 0;
              text-transform: uppercase;
            }
            .print-subtitle {
              color: #0d9488;
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 1.5px;
              margin: 4px 0 0 0;
            }
            .print-brand {
              font-family: 'Space Grotesk', sans-serif;
              font-weight: 800;
              font-size: 11px;
              color: #0f766e;
              border: 2px solid #0f766e;
              padding: 6px 12px;
              border-radius: 10px;
              text-transform: uppercase;
              letter-spacing: 1px;
              background: #f0fdfa;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 12px;
              background: #f1f5f9;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 12px 18px;
              margin-bottom: 30px;
              font-size: 11px;
            }
            .meta-item {
              display: flex;
              flex-direction: column;
              text-align: left;
            }
            .meta-label {
              color: #64748b;
              font-weight: 700;
              text-transform: uppercase;
              font-size: 9px;
              letter-spacing: 0.8px;
            }
            .meta-value {
              color: #0f172a;
              font-weight: 700;
              margin-top: 2px;
            }
            .instructions-box {
              background-color: #fffbeb;
              border: 1px solid #fef3c7;
              border-left: 4px solid #f59e0b;
              border-radius: 8px;
              padding: 12px 16px;
              margin-bottom: 24px;
              text-align: left;
              font-size: 11.5px;
              color: #78350f;
            }
            .pdf-page-wrapper {
              page-break-after: always;
              border: 1px solid #e2e8f0;
              border-radius: 16px;
              padding: 24px;
              margin-bottom: 30px;
              background: #ffffff;
            }
            .pdf-page-wrapper:last-child {
              page-break-after: avoid;
              margin-bottom: 0;
            }
            .slide-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 1px solid #f1f5f9;
              padding-bottom: 10px;
              margin-bottom: 16px;
              font-family: 'JetBrains Mono', monospace;
              font-size: 10.5px;
              color: #0d9488;
              font-weight: bold;
            }
            .slide-number {
              background: rgba(13, 148, 136, 0.1);
              color: #0f766e;
              padding: 2px 8px;
              border-radius: 4px;
            }
            .slide-time {
              color: #64748b;
            }
            .slide-title {
              font-family: 'Space Grotesk', sans-serif;
              color: #0f3c42;
              font-size: 16.5px;
              font-weight: 800;
              margin: 0 0 16px 0;
              text-align: left;
            }
            .chalkboard-frame-container {
              background: #0c201a;
              border-radius: 12px;
              padding: 8px;
              aspect-ratio: 16 / 9;
              display: flex;
              align-items: center;
              justify-content: center;
              border: 3px solid #0a2d24;
              box-shadow: 0 4px 12px rgba(0,0,0,0.08);
              margin-bottom: 16px;
              overflow: hidden;
            }
            .chalkboard-image {
              width: 100%;
              height: 105%;
              object-fit: contain;
              border-radius: 8px;
            }
            .no-image-placeholder {
              color: #10b981;
              font-family: 'JetBrains Mono', monospace;
              font-size: 11px;
            }
            .slide-notes-card {
              background: #f0fdfa;
              border-left: 4px solid #0d9488;
              border-radius: 4px 12px 12px 4px;
              padding: 12px 16px;
              text-align: left;
            }
            .notes-badge {
              font-family: 'JetBrains Mono', monospace;
              color: #0d9488;
              font-size: 9px;
              font-weight: bold;
              letter-spacing: 0.5px;
              margin-bottom: 4px;
            }
            .notes-text {
              font-size: 11.5px;
              color: #334155;
              margin: 0;
              font-weight: 500;
              line-height: 1.5;
            }
            .parsed-latex-topic-content {
              text-align: left;
              font-size: 12px;
              color: #0f172a;
              background: #faf8f5;
              border: 1px solid #edd1d1;
              padding: 18px;
              border-radius: 12px;
              font-family: 'Inter', system-ui, sans-serif;
              line-height: 1.6;
            }
            .parsed-latex-topic-content h1, .parsed-latex-topic-content h2, .parsed-latex-topic-content h3 {
              font-family: 'Space Grotesk', sans-serif;
              color: #0f3c42;
              margin-top: 0;
            }
            .parsed-latex-topic-content code {
              font-family: 'JetBrains Mono', monospace;
              background: #eaebf0;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 11px;
            }
            .print-footer {
              margin-top: 40px;
              border-top: 1px solid #e2e8f0;
              padding-top: 16px;
              text-align: center;
              font-size: 10px;
              color: #94a3b8;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .action-blocks {
              display: flex;
              gap: 12px;
              margin-bottom: 24px;
              justify-content: center;
            }
            .action-btn {
              background: #0f766e;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 8px;
              font-weight: bold;
              font-family: 'Space Grotesk', sans-serif;
              cursor: pointer;
              box-shadow: 0 4px 6px rgba(0,0,0,0.05);
              font-size: 13px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              transition: background 0.2s;
            }
            .action-btn:hover {
              background: #0d9488;
            }
            .action-btn-alt {
              background: #e2e8f0;
              color: #334155;
            }
            .action-btn-alt:hover {
              background: #cbd5e1;
            }

            @media print {
              body {
                padding: 0;
                background-color: #ffffff;
              }
              .book-container {
                border: none;
                padding: 0;
                box-shadow: none;
                max-width: 100%;
              }
              .instructions-box, .action-blocks {
                display: none !important;
              }
              .pdf-page-wrapper {
                border: none;
                padding: 20px 0;
                margin-bottom: 0;
                page-break-after: always;
              }
              .pdf-page-wrapper:last-child {
                page-break-after: avoid;
              }
              @page {
                size: A4 portrait;
                margin: 1.5cm;
              }
            }
          </style>
        </head>
        <body>
          <div class="book-container">
            <div class="action-blocks">
              <button class="action-btn" onclick="window.print()">🖨️ Save as PDF / Print Book</button>
              <button class="action-btn action-btn-alt" onclick="window.close()">❌ Close Book</button>
            </div>

            <div class="instructions-box">
              <strong>📘 Direct PDF Save Option:</strong> Click the <strong>"Save as PDF / Print Book"</strong> button above, or press <strong>Ctrl + P</strong> (Cmd + P on Mac). Choose <strong>"Save as PDF"</strong> as your destination, and hit save!
            </div>

            <div class="print-header">
              <div class="header-main">
                <h1 class="print-title">${bookTitle}</h1>
                <p class="print-subtitle">${subTitle}</p>
              </div>
              <div class="print-brand">
                Maestry Learning Sync
              </div>
            </div>

            <div class="meta-grid">
              <div class="meta-item">
                <span class="meta-label">Student Name</span>
                <span class="meta-value">${escapeHTML(studentName || "Cherry's Student")}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Class Year</span>
                <span class="meta-value">${escapeHTML(grade)}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Subject Standard</span>
                <span class="meta-value">${escapeHTML(subject)}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Taught Chronology</span>
                <span class="meta-value">${new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            <div class="board-pages-container">
              ${combinedHtml}
            </div>

            <div class="print-footer">
              Digital Lecture Copy Synchronized via Maestry Cloud • Secure Verification PDF
            </div>
          </div>

          <script>
            document.addEventListener("DOMContentLoaded", function() {
              renderMathInElement(document.body, {
                delimiters: [
                  {left: '$$', right: '$$', display: true},
                  {left: '$', right: '$', display: false},
                  {left: '\\\\(', right: '\\\\)', display: false},
                  {left: '\\\\[', right: '\\\\]', display: true}
                ],
                throwOnError: false
              });
              setTimeout(() => {
                window.print();
              }, 600);
            });
          </script>
        </body>
        </html>
      `;

      const blob = new Blob([finalHtml], { type: "text/html;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Maestry_Lecture_Book_${subject.replace(/[^a-zA-Z0-9]/g, "_")}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Combined PDF export error:", err);
    }
  };

  return (
    <div className="absolute inset-0 bg-white flex flex-col z-30 overflow-hidden">
      <div className="bg-white w-full h-full flex flex-col overflow-hidden relative">
        
        {/* Unified Tab bar Selector */}
        <div className="border-b border-zinc-200 bg-slate-50 shrink-0 select-none">
          {/* Mobile view tabs */}
          <div className="flex md:hidden">
            <button
              type="button"
              onClick={() => setActiveMobileSubTab("profile")}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider text-center border-b-2 transition-all ${
                activeMobileSubTab === "profile" 
                  ? "border-teal-800 text-teal-900 bg-white" 
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              👤 Profile
            </button>
            <button
              type="button"
              onClick={() => { setActiveMobileSubTab("counselor"); setActiveDesktopTab("counselor"); }}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider text-center border-b-2 transition-all ${
                activeMobileSubTab === "counselor" 
                  ? "border-teal-800 text-teal-900 bg-white font-bold" 
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              👩‍🎓 Kiara AI
            </button>
            <button
              type="button"
              onClick={() => { setActiveMobileSubTab("stats"); setActiveDesktopTab("stats"); }}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider text-center border-b-2 transition-all ${
                activeMobileSubTab === "stats" 
                  ? "border-teal-800 text-teal-900 bg-white" 
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              📊 Performance
            </button>
            <button
              type="button"
              onClick={() => { setActiveMobileSubTab("books"); setActiveDesktopTab("books"); }}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider text-center border-b-2 transition-all ${
                activeMobileSubTab === "books" 
                  ? "border-teal-800 text-teal-900 bg-white" 
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              📚 Books
            </button>
          </div>

          {/* Desktop view tabs */}
          <div className="hidden md:flex justify-end px-6 py-2 gap-3 bg-slate-100/50 border-b border-zinc-150">
            <div className="text-xs font-mono font-bold text-[#486a73] flex items-center mr-auto">
              🎯 Classroom Hub Workspaces:
            </div>
            <button
              type="button"
              onClick={() => { setActiveMobileSubTab("stats"); setActiveDesktopTab("stats"); }}
              className={`px-3.5 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeDesktopTab === "stats" && activeMobileSubTab !== "profile"
                  ? "bg-[#0a3641] text-white shadow-sm font-extrabold"
                  : "text-slate-600 hover:text-slate-900 bg-transparent hover:bg-slate-200/50"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>📊 Performance Analytics</span>
            </button>
            <button
              type="button"
              onClick={() => { setActiveMobileSubTab("counselor"); setActiveDesktopTab("counselor"); }}
              className={`px-3.5 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeDesktopTab === "counselor" && activeMobileSubTab !== "profile"
                  ? "bg-gradient-to-r from-teal-800 to-emerald-900 text-white shadow-sm font-extrabold ring-1 ring-emerald-400/30"
                  : "text-teal-900 hover:text-teal-950 bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-500/30"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
              <span>👩‍🎓 Kiara (AI Counselor)</span>
            </button>
            <button
              type="button"
              onClick={() => { setActiveMobileSubTab("books"); setActiveDesktopTab("books"); }}
              className={`px-3.5 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeDesktopTab === "books" && activeMobileSubTab !== "profile"
                  ? "bg-[#0a3641] text-white shadow-sm font-extrabold"
                  : "text-slate-600 hover:text-slate-900 bg-transparent hover:bg-slate-200/50"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>📚 Study Handbooks</span>
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden bg-white">
          
          {/* Left Sidebar: Student Profile Parameter Controls & Milestones */}
          <div className={`${activeMobileSubTab === "profile" ? "flex flex-1 min-h-0" : "hidden md:flex"} w-full md:w-80 bg-slate-50 border-r border-zinc-150 p-4 sm:p-5 flex-col justify-between overflow-y-auto md:shrink-0 select-none`}>
            <div className="space-y-5 sm:space-y-6">
              
              {/* Profile Details section */}
              <div>
                <h3 className="text-[11px] uppercase font-mono font-black tracking-widest text-[#0a3641] flex items-center gap-1.5 pb-2 border-b border-zinc-200">
                  <User className="w-3.5 h-3.5 text-teal-800" /> Student Profile
                </h3>

                {editingProfile ? (
                  <form onSubmit={handleUpdateProfile} className="space-y-3.5 pt-3 text-left">
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-[#486a73] uppercase font-bold">Full Name</label>
                      <input 
                        type="text" 
                        required
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-white border border-[#dae1dd] focus:border-[#0a3641] rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-teal-700"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-[#486a73] uppercase font-bold">Class Grade</label>
                        <select 
                          value={editGrade}
                          onChange={(e) => setEditGrade(e.target.value)}
                          className="w-full bg-white border border-[#dae1dd] text-[#0a3641] rounded-lg px-2 py-1.5 text-xs focus:outline-none cursor-pointer"
                        >
                          <option value="Class 6">Class 6</option>
                          <option value="Class 7">Class 7</option>
                          <option value="Class 8">Class 8</option>
                          <option value="Class 9">Class 9</option>
                          <option value="Class 10">Class 10</option>
                          <option value="Class 11">Class 11</option>
                          <option value="Class 12">Class 12</option>
                          <option value="JEE/NEET Prep">JEE/NEET Prep</option>
                          <option value="College Level">College Level</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-[#486a73] uppercase font-bold">Target Subject</label>
                        <select 
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          className="w-full bg-white border border-[#dae1dd] text-[#0a3641] rounded-lg px-2 py-1.5 text-xs focus:outline-none cursor-pointer"
                        >
                          <option value="Mathematics">Mathematics</option>
                          <option value="Physics">Physics</option>
                          <option value="Chemistry">Chemistry</option>
                          <option value="Biology">Biology</option>
                          <option value="All Science">All Science</option>
                          <option value="Computer Science">Computer Science</option>
                          <option value="Economics">Economics</option>
                          <option value="Social Science">Social Science</option>
                          <option value="Environmental Studies">Environmental Studies</option>
                          <option value="English">English</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-[#486a73] uppercase font-bold">Educational Board</label>
                      <select 
                        value={editBoard}
                        onChange={(e) => setEditBoard(e.target.value)}
                        className="w-full bg-white border border-[#dae1dd] text-[#0a3641] rounded-lg px-2 py-1.5 text-xs focus:outline-none cursor-pointer"
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
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono text-[#486a73] uppercase font-bold">Medium of Learning</label>
                      <select 
                        value={editMediumOfLearning}
                        onChange={(e) => setEditMediumOfLearning(e.target.value)}
                        className="w-full bg-white border border-[#dae1dd] text-[#0a3641] rounded-lg px-2 py-1.5 text-xs focus:outline-none cursor-pointer"
                      >
                        <option value="Hinglish">Hinglish</option>
                        <option value="English">English</option>
                        <option value="Hindi">Hindi</option>
                        <option value="Bangla">Bangla</option>
                        <option value="Oriya">Oriya</option>
                      </select>
                    </div>

                    <div className="flex gap-2 pt-1.5">
                      <button
                        type="submit"
                        disabled={savingProfile}
                        className="flex-1 bg-teal-800 hover:bg-[#0a3641] text-white text-[10px] font-black tracking-wider uppercase py-2 rounded-lg transition-all cursor-pointer shadow-xs"
                      >
                        {savingProfile ? "Saving..." : "Save updates"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingProfile(false)}
                        className="px-3 border border-zinc-200 text-zinc-500 hover:bg-zinc-100 text-[10px] uppercase font-bold rounded-lg transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-3 pt-3 text-left">
                    <div>
                      <span className="text-[9px] font-mono text-[#486a73] uppercase block font-semibold leading-none">Full Name</span>
                      <p className="font-extrabold text-[#0a3641] text-xs py-1 border-b border-transparent leading-relaxed">{studentName || "Cherry's Student"}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[9px] font-mono text-[#486a73] uppercase block font-semibold leading-none">Grade Level</span>
                        <p className="font-bold text-[#0a3641] text-xs mt-0.5">{grade}</p>
                      </div>
                      <div>
                        <span className="text-[9px] font-mono text-[#486a73] uppercase block font-semibold leading-none">Active Subject</span>
                        <p className="font-bold text-[#0a3641] text-xs mt-0.5">{subject}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[9px] font-mono text-[#486a73] uppercase block font-semibold leading-none">Edu Board</span>
                        <p className="font-bold text-[#0a3641] text-xs mt-0.5">{board}</p>
                      </div>
                      <div>
                        <span className="text-[9px] font-mono text-[#486a73] uppercase block font-semibold leading-none">Language</span>
                        <p className="font-bold text-[#0a3641] text-xs mt-0.5">{mediumOfLearning}</p>
                      </div>
                    </div>

                    <div className="pt-1">
                      <span className="text-[9px] font-mono text-[#486a73] uppercase block font-semibold leading-none">Database Status</span>
                      <p className="text-[10px] font-bold text-emerald-700 mt-1 capitalize flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                        {currentUser?.isAnonymous ? "Guest Profile (Local)" : "Verified Cloud Account"}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEditingProfile(true)}
                      className="w-full border border-dashed border-teal-800/40 hover:border-teal-700 hover:bg-teal-50/50 text-[10px] text-[#0a3641] py-2 rounded-xl transition-all cursor-pointer font-black tracking-widest uppercase text-center mt-2.5"
                    >
                      ✏️ Edit particulars
                    </button>
                  </div>
                )}
              </div>

              {/* Milestones & Progress scorecard */}
              <div className="space-y-3.5 pt-2">
                <h3 className="text-[11px] uppercase font-mono font-black tracking-widest text-[#0a3641] flex items-center gap-1.5 pb-2 border-b border-zinc-200">
                  <Award className="w-3.5 h-3.5 text-teal-800" /> Academic Progress
                </h3>

                <div className="space-y-2">
                  <div className="bg-white border border-zinc-200 rounded-xl p-3 flex items-center justify-between text-left shadow-xs">
                    <div>
                      <span className="text-[9px] font-mono text-zinc-500 block uppercase font-semibold">Total Classes Attended</span>
                      <span className="text-xl font-black text-[#0a3641] block mt-0.5">{totalSessionsCount}</span>
                    </div>
                    <span className="text-2xl bg-teal-50 p-1.5 rounded-lg">📈</span>
                  </div>

                  <div className="bg-white border border-zinc-200 rounded-xl p-3 flex items-center justify-between text-left shadow-xs">
                    <div>
                      <span className="text-[9px] font-mono text-zinc-500 block uppercase font-semibold">Total Slides Saved</span>
                      <span className="text-xl font-black text-[#0a3641] block mt-0.5">{allSnapshots.length}</span>
                    </div>
                    <span className="text-2xl bg-teal-50 p-1.5 rounded-lg">📸</span>
                  </div>
                </div>

                <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">🏆</span>
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#0a3641]">Active Scholar Badge</span>
                  </div>
                  <p className="text-[10px] text-[#486a73] font-medium mt-1 leading-relaxed">
                    Automatically unlocked for participating in live lectures and compiling direct board-books!
                  </p>
                </div>

                {/* Kiara AI Student Counselor Widget */}
                <div className="bg-gradient-to-br from-[#06242c] via-[#09323c] to-[#04191f] text-white border border-teal-500/25 rounded-2xl p-3.5 sm:p-4 text-left space-y-2.5 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-teal-400/10 rounded-full blur-2xl pointer-events-none" />
                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 p-0.5 shadow-xs shrink-0 flex items-center justify-center text-sm">
                        <span>👩‍🎓</span>
                      </div>
                      <div>
                        <h4 className="text-xs font-black tracking-wider text-white font-mono flex items-center gap-1.5">
                          KIARA AI
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        </h4>
                        <span className="text-[8px] font-mono font-bold text-teal-300 uppercase tracking-widest block">AI Mindset Counselor</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10.5px] text-teal-100/85 leading-relaxed font-sans relative z-10">
                    Exam stress? Timetable issues? Need mnemonics or study strategies?
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsKiaraVoiceModalOpen(true);
                    }}
                    className="w-full bg-gradient-to-r from-teal-400 via-emerald-400 to-amber-300 hover:from-teal-300 hover:to-emerald-300 text-slate-950 text-[10px] font-black uppercase tracking-wider py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs active:scale-[0.98] relative z-10"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                    <span>Talk to Kiara Counselor (Live Voice 🎙️)</span>
                  </button>
                </div>
              </div>

            </div>

            <div className="text-[9.5px] text-zinc-400 font-mono text-left pt-6 border-t border-zinc-200 mt-6 leading-relaxed">
              * Classroom Handbooks are automatically formatted into optimized multi-page books using integrated LaTeX formulas.
            </div>
          </div>

          {/* Right Column: Unified Board-Book Hub (Main Arena) */}
          <div className={`${(activeMobileSubTab === "books" || activeMobileSubTab === "stats" || activeMobileSubTab === "counselor") ? "flex" : "hidden md:flex"} flex-1 p-3.5 sm:p-4 flex-col space-y-4 overflow-y-auto text-left min-h-0 bg-white`}>
            
            {/* Premium Header - Unified Performance Hub */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-150 pb-2.5 gap-2 shrink-0 select-none">
              <div className="flex items-center gap-2 min-w-0">
                {activeDesktopTab === "counselor" ? (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
                    <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#0a3641] truncate">
                      Kiara • AI Mindset & Academic Success Counselor
                    </h3>
                  </>
                ) : activeDesktopTab === "stats" ? (
                  <>
                    <LayoutGrid className="w-4 h-4 text-[#0a3641] shrink-0" />
                    <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#0a3641] truncate">
                      Performance Analytics & Cognitive Radar
                    </h3>
                  </>
                ) : (
                  <>
                    <BookOpen className="w-4 h-4 text-[#0a3641] shrink-0" />
                    <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#0a3641] truncate">
                      Classroom Study Handbooks (Board-Books)
                    </h3>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[9.5px] bg-[#0a3641] text-[#c4f500] px-2 py-0.5 rounded-md font-mono font-black uppercase tracking-wider">
                  {subject} • {grade}
                </span>
              </div>
            </div>

            {activeDesktopTab === "counselor" ? (
              <div className="flex-1 min-h-[620px] text-left">
                <KiaraCounselor
                  studentName={studentName}
                  grade={grade}
                  subject={subject}
                  board={board}
                  mediumOfLearning={mediumOfLearning}
                  analytics={{
                    conceptClarity: dashboardStats.conceptClarity,
                    theoreticalCore: dashboardStats.theoreticalCore,
                    calculationPrecision: dashboardStats.calculationPrecision,
                    formulaRecall: dashboardStats.formulaRecall,
                    socraticStamina: dashboardStats.socraticStamina,
                    strengths: dashboardStats.strengths,
                    growths: dashboardStats.growths,
                    totalQuizzes: quizAttempts?.length || 0,
                    classesCompleted: pastSessions?.length || 0,
                    snapshotsSaved: snapshots?.length || 0,
                    lowestMetric: lowestMetric,
                  }}
                  onNavigateToClassroom={onEnterClassroom}
                  onStartVoiceCall={() => setIsKiaraVoiceModalOpen(true)}
                />
              </div>
            ) : activeDesktopTab === "stats" ? (
              <div className="space-y-4 animate-fade-in text-left">
                {/* Dashboard Introduction Header - Compact & Sleek */}
                <div className="bg-gradient-to-r from-[#0a3641] to-[#041a1e] px-3.5 py-2.5 sm:px-4 sm:py-2.5 rounded-2xl text-white shadow-xs relative overflow-hidden flex items-center justify-between gap-3 shrink-0 min-h-[52px]">
                  <div className="flex items-center gap-2.5 min-w-0 z-10">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-400/20 border border-amber-400/30 text-amber-300 flex items-center justify-center text-sm font-bold shrink-0">
                      📊
                    </div>
                    <div className="text-left min-w-0">
                      <h3 className="text-xs sm:text-sm font-black tracking-tight text-white flex items-center gap-1.5 truncate">
                        Namaste, {studentName}! Performance Analytics 🌟
                      </h3>
                      <p className="text-[10px] sm:text-[10.5px] text-teal-100/85 font-medium truncate">
                        Real-time cognitive blueprint based on blackboard activity, saved notes & test accuracy.
                      </p>
                    </div>
                  </div>

                  <span className="hidden sm:inline-flex text-[9px] font-mono font-bold uppercase tracking-wider bg-[#c4f500]/20 text-[#c4f500] px-2.5 py-1 rounded-lg border border-[#c4f500]/20 shrink-0 z-10">
                    Insights Active
                  </span>
                </div>

                {/* Main Bento Grid layout */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* TILE 1: Radar Chart (Cognitive Mastery Dimensions) - Spans 2 columns on desktop */}
                  <div className="lg:col-span-2 bg-white border border-zinc-200 rounded-3xl p-5 shadow-xs flex flex-col md:flex-row items-center gap-6 justify-between">
                    
                    {/* SVG Radar Chart container */}
                    <div className="flex-1 flex flex-col items-center justify-center">
                      <div className="flex items-center justify-between w-full mb-3 pb-1 border-b border-zinc-100">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 font-sans flex items-center gap-1">
                          🛡️ Micro-Cognitive Dimensions
                        </span>
                        <span className="text-[9px] font-mono font-black bg-teal-50 text-teal-800 px-1.5 py-0.5 rounded">
                          Real-time Sync
                        </span>
                      </div>

                      {/* Real dynamic SVG Radar Chart */}
                      {(() => {
                        // Calculate Radar points
                        const width = 300;
                        const height = 300;
                        const cx = width / 2;
                        const cy = height / 2;
                        const rMax = 80;

                        // 5 Dimensions matching the discussed points
                        const keys = [
                          { label: "Concept Clarity", val: dashboardStats.conceptClarity, icon: "🎯" },
                          { label: "Theoretical Core", val: dashboardStats.theoreticalCore, icon: "📖" },
                          { label: "Calculations", val: dashboardStats.calculationPrecision, icon: "🧮" },
                          { label: "Formula Recall", val: dashboardStats.formulaRecall, icon: "⚡" },
                          { label: "Socratic Stamina", val: dashboardStats.socraticStamina, icon: "🔥" }
                        ];

                        const points = keys.map((key, i) => {
                          const angle = (-90 + i * 72) * Math.PI / 180;
                          const length = rMax * (key.val / 100);
                          const x = cx + Math.cos(angle) * length;
                          const y = cy + Math.sin(angle) * length;
                          return { x, y, label: key.label, score: key.val, angle };
                        });

                        const pointsStr = points.map(p => `${p.x},${p.y}`).join(" ");

                        // Grid Polygons
                        const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];

                        return (
                          <div className="relative w-full max-w-[280px] h-[280px]">
                            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible select-none">
                              {/* Background Grids */}
                              {gridLevels.map((lvl, idx) => {
                                const gridPoints = Array.from({ length: 5 }, (_, i) => {
                                  const angle = (-90 + i * 72) * Math.PI / 180;
                                  const x = cx + Math.cos(angle) * rMax * lvl;
                                  const y = cy + Math.sin(angle) * rMax * lvl;
                                  return `${x},${y}`;
                                }).join(" ");

                                return (
                                  <polygon
                                    key={idx}
                                    points={gridPoints}
                                    className="fill-none stroke-zinc-200"
                                    strokeWidth="1"
                                    strokeDasharray={idx < 4 ? "3,3" : "none"}
                                  />
                                );
                              })}

                              {/* Spoke lines */}
                              {Array.from({ length: 5 }, (_, i) => {
                                const angle = (-90 + i * 72) * Math.PI / 180;
                                const x = cx + Math.cos(angle) * rMax;
                                const y = cy + Math.sin(angle) * rMax;
                                return (
                                  <line
                                    key={i}
                                    x1={cx}
                                    y1={cy}
                                    x2={x}
                                    y2={y}
                                    className="stroke-zinc-200"
                                    strokeWidth="1"
                                  />
                                );
                              })}

                              {/* Performance Polygon Area with gradient */}
                              <polygon
                                points={pointsStr}
                                className="fill-teal-500/15 stroke-teal-600"
                                strokeWidth="2.5"
                                strokeLinejoin="round"
                              />

                              {/* Vertex interactive markers */}
                              {points.map((p, i) => {
                                const labelAngle = p.angle;
                                // Shift labels slightly outward based on angle
                                const labelDist = rMax + 18;
                                const lx = cx + Math.cos(labelAngle) * labelDist;
                                const ly = cy + Math.sin(labelAngle) * labelDist;

                                const isSelected = activeDimensionIndex === i;

                                return (
                                  <g key={i} className="cursor-pointer" onClick={() => setActiveDimensionIndex(i)}>
                                    {/* Invisible large hit-target */}
                                    <circle cx={p.x} cy={p.y} r="14" fill="transparent" />
                                    {/* Glowing active point */}
                                    {isSelected && (
                                      <circle cx={p.x} cy={p.y} r="8" className="fill-teal-500/30 animate-ping" />
                                    )}
                                    {/* Score vertex circle */}
                                    <circle
                                      cx={p.x}
                                      cy={p.y}
                                      r={isSelected ? "5.5" : "4.5"}
                                      className={`${isSelected ? "fill-teal-600 stroke-white" : "fill-white stroke-teal-500"}`}
                                      strokeWidth="2"
                                    />
                                    {/* Label text */}
                                    <text
                                      x={lx}
                                      y={ly}
                                      textAnchor="middle"
                                      alignmentBaseline="middle"
                                      className={`text-[8.5px] font-black font-sans transition-all ${
                                        isSelected ? "fill-teal-800 scale-105 font-extrabold" : "fill-zinc-500"
                                      }`}
                                    >
                                      {keys[i].icon} {p.label} ({p.score}%)
                                    </text>
                                  </g>
                                );
                              })}
                            </svg>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Interactive Dimension Educator Insights box */}
                    <div className="w-full md:w-64 bg-slate-50 border border-zinc-150 p-4.5 rounded-2xl flex flex-col justify-between space-y-3.5 h-full min-h-[220px]">
                      {(() => {
                        const dim = DIMENSION_DETAILS[activeDimensionIndex];
                        const dimensionScore = 
                          activeDimensionIndex === 0 ? dashboardStats.conceptClarity :
                          activeDimensionIndex === 1 ? dashboardStats.theoreticalCore :
                          activeDimensionIndex === 2 ? dashboardStats.calculationPrecision :
                          activeDimensionIndex === 3 ? dashboardStats.formulaRecall :
                          dashboardStats.socraticStamina;

                        return (
                          <>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between border-b border-zinc-200 pb-1.5">
                                <span className="text-[9px] font-mono font-black text-teal-800 uppercase tracking-wider">
                                  {dim.icon} Active Dimension
                                </span>
                                <span className="text-[11px] font-black font-mono text-[#0a3641] bg-white px-2 py-0.5 rounded-sm border border-zinc-200">
                                  {dimensionScore}%
                                </span>
                              </div>
                              <h4 className="text-xs font-black text-[#0a3641] tracking-tight">
                                {dim.name}
                              </h4>
                              <p className="text-[10px] text-zinc-500 font-medium leading-relaxed">
                                {dim.description}
                              </p>
                            </div>

                            <div className="bg-white p-3 rounded-xl border border-zinc-150 space-y-1.5">
                              <span className="text-[8px] font-black uppercase text-emerald-700 tracking-wider flex items-center gap-1">
                                💡 Cherry's Strategic Advice:
                              </span>
                              <p className="text-[9.5px] text-zinc-700 font-bold leading-normal italic">
                                "{dim.recommendation.replace("{score}", dimensionScore.toString())}"
                              </p>
                            </div>

                            <div className="text-[8.5px] text-zinc-400 font-mono">
                              * Click other spoke nodes in the radar to inspect.
                            </div>
                          </>
                        );
                      })()}
                    </div>

                  </div>

                  {/* TILE 2: Consistency, Milestone & Badges Progress */}
                  <div className="bg-white border border-zinc-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 font-sans flex items-center gap-1">
                          Consistency Milestone
                        </span>
                        <span className="text-[8.5px] font-bold text-zinc-400 font-mono">
                          Target: Scholar
                        </span>
                      </div>

                      {/* Dynamic Gauge details */}
                      <div className="flex items-center gap-4">
                        <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
                          <svg className="w-full h-full transform -rotate-90">
                            <circle cx="32" cy="32" r="28" className="stroke-slate-100" strokeWidth="4.5" fill="transparent" />
                            <circle
                              cx="32"
                              cy="32"
                              r="28"
                              className="stroke-amber-500 transition-all duration-500"
                              strokeWidth="4.5"
                              fill="transparent"
                              strokeDasharray="175.9"
                              strokeDashoffset={175.9 - (175.9 * dashboardStats.socraticStamina) / 100}
                              strokeLinecap="round"
                            />
                          </svg>
                          <span className="absolute text-xs font-black font-mono text-zinc-800">
                            {dashboardStats.socraticStamina}%
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 block">
                            Socratic Stamina
                          </span>
                          <p className="text-[9.5px] text-zinc-500 font-medium leading-relaxed">
                            Calculated dynamically based on your classroom attendance, notes saved, and quiz participation.
                          </p>
                        </div>
                      </div>

                      {/* Classroom Real-time sync list */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="bg-zinc-50 border border-zinc-150 rounded-xl p-2.5 text-center">
                          <span className="text-[11px] font-black font-mono text-[#0a3641] block">
                            {pastSessions?.length || 0}
                          </span>
                          <span className="text-[7.5px] text-zinc-400 font-bold uppercase tracking-wider block">
                            Classes Done
                          </span>
                        </div>
                        <div className="bg-zinc-50 border border-zinc-150 rounded-xl p-2.5 text-center">
                          <span className="text-[11px] font-black font-mono text-[#0a3641] block">
                            {snapshots?.length || 0}
                          </span>
                          <span className="text-[7.5px] text-zinc-400 font-bold uppercase tracking-wider block">
                            Saved Notes
                          </span>
                        </div>
                        <div className="bg-zinc-50 border border-zinc-150 rounded-xl p-2.5 text-center">
                          <span className="text-[11px] font-black font-mono text-[#0a3641] block">
                            {quizAttempts?.length || 0}
                          </span>
                          <span className="text-[7.5px] text-zinc-400 font-bold uppercase tracking-wider block">
                            Quizzes Taken
                          </span>
                        </div>
                        <div className="bg-zinc-50 border border-zinc-150 rounded-xl p-2.5 text-center">
                          <span className="text-[11px] font-black font-mono text-[#0a3641] block">
                            {Object.keys(masteredCards).filter(k => masteredCards[k]).length}
                          </span>
                          <span className="text-[7.5px] text-zinc-400 font-bold uppercase tracking-wider block">
                            Decks Mastered
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Unlocked Badges Row */}
                    <div className="pt-3 border-t border-zinc-100 space-y-2">
                      <span className="text-[7.5px] font-black uppercase text-zinc-400 tracking-widest block">
                        🏆 Earned Scholars Badges:
                      </span>
                      <div className="flex gap-2 flex-wrap">
                        {pastSessions?.length > 0 && (
                          <span className="bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-full px-2 py-0.5 text-[8.5px] font-mono font-black" title="Attended at least 1 live session with Cherry Ma'am">
                            🌿 Chalkboard Pioneer
                          </span>
                        )}
                        {snapshots?.length > 0 && (
                          <span className="bg-blue-50 text-blue-800 border border-blue-100 rounded-full px-2 py-0.5 text-[8.5px] font-mono font-black" title="Saved chalkboard whiteboard equations">
                            📸 Formula Archivist
                          </span>
                        )}
                        {quizAttempts?.length > 0 && (
                          <span className="bg-purple-50 text-purple-800 border border-purple-100 rounded-full px-2 py-0.5 text-[8.5px] font-mono font-black" title="Completed at least 1 practice classroom quiz">
                            📝 Quiz Conqueror
                          </span>
                        )}
                        {Object.keys(masteredCards).filter(k => masteredCards[k]).length > 0 && (
                          <span className="bg-amber-50 text-amber-800 border border-amber-100 rounded-full px-2 py-0.5 text-[8.5px] font-mono font-black" title="Marked flashcards as mastered in spaced recall">
                            ⚡ Recall Prodigy
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* TILE 3: Academic Performance Accuracy Timeline (Smooth Curved Wavy Area/Line Chart) - Spans 2 columns */}
                  <div className="lg:col-span-2 bg-white border border-zinc-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 font-sans flex items-center gap-1">
                          📈 Classroom Quiz Accuracy Trendline
                        </span>
                        <span className="text-[8.5px] font-mono font-bold text-zinc-400">
                          Timeline Order
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 font-medium">
                        Tracks your accuracy percentages chronologically across your class test sittings to visualize your learning trajectory.
                      </p>
                    </div>

                    {/* Elegant custom inline SVG Line Chart */}
                    <div className="h-44 w-full relative flex items-center justify-center">
                      {(() => {
                        // Chronological attempts (ascending order of timestamp)
                        const chronological = [...dashboardStats.subjectAttempts].reverse();
                        const count = chronological.length;

                        if (count === 0) {
                          // Display a beautiful mock visual path for "Initial Baseline"
                          return (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center space-y-2 bg-zinc-50/50 rounded-2xl border border-dashed border-zinc-150 p-4 select-none">
                              <span className="text-lg">⏳</span>
                              <div className="space-y-0.5">
                                <h6 className="text-[10px] font-black text-zinc-500 uppercase tracking-wide">
                                  No Test History Available Yet
                                </h6>
                                <p className="text-[9px] text-zinc-400 font-medium max-w-xs mx-auto leading-relaxed">
                                  Take your first classroom-aligned Quick Quiz to unlock your dynamic learning accuracy trendline and watch your curve grow!
                                </p>
                              </div>
                            </div>
                          );
                        }

                        // Dimensions
                        const w = 480;
                        const h = 150;
                        const paddingX = 40;
                        const paddingY = 20;

                        const chartW = w - paddingX * 2;
                        const chartH = h - paddingY * 2;

                        // Map chronological attempts to chart points
                        const points = chronological.map((att, i) => {
                          const x = paddingX + (count > 1 ? (i / (count - 1)) * chartW : chartW / 2);
                          // Accuracy: 0 to 100
                          const y = h - paddingY - (att.accuracy / 100) * chartH;
                          return { x, y, accuracy: att.accuracy, date: att.docName?.split("•")?.[0]?.trim() || "Quiz" };
                        });

                        // Draw curved path using cubic Bézier curves (smooth wavy curve)
                        let dPath = "";
                        if (points.length === 1) {
                          dPath = `M ${points[0].x - 10} ${points[0].y} L ${points[0].x + 10} ${points[0].y}`;
                        } else if (points.length > 1) {
                          dPath = `M ${points[0].x} ${points[0].y}`;
                          for (let i = 0; i < points.length - 1; i++) {
                            const curr = points[i];
                            const next = points[i + 1];
                            const cp1X = curr.x + (next.x - curr.x) / 2;
                            const cp1Y = curr.y;
                            const cp2X = curr.x + (next.x - curr.x) / 2;
                            const cp2Y = next.y;
                            dPath += ` C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${next.x} ${next.y}`;
                          }
                        }

                        // Area path (closed polygon back to bottom axis for gradient filling)
                        let dArea = "";
                        if (points.length > 1) {
                          dArea = `${dPath} L ${points[points.length - 1].x} ${h - paddingY} L ${points[0].x} ${h - paddingY} Z`;
                        }

                        return (
                          <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full overflow-visible">
                            <defs>
                              <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#0d9488" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="#0d9488" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>

                            {/* Horizontal gridlines */}
                            {[0, 25, 50, 75, 100].map((val) => {
                              const y = h - paddingY - (val / 100) * chartH;
                              return (
                                <g key={val}>
                                  <line x1={paddingX} y1={y} x2={w - paddingX} y2={y} className="stroke-zinc-100" strokeWidth="1" />
                                  <text x={paddingX - 10} y={y} textAnchor="end" alignmentBaseline="middle" className="text-[7px] font-mono font-bold fill-zinc-400">
                                    {val}%
                                  </text>
                                </g>
                              );
                            })}

                            {/* Area Gradient */}
                            {dArea && <path d={dArea} fill="url(#chartAreaGrad)" />}

                            {/* Crisp wavy line path */}
                            {dPath && <path d={dPath} fill="none" className="stroke-teal-600" strokeWidth="2.5" strokeLinecap="round" />}

                            {/* Point circles & tooltips */}
                            {points.map((p, idx) => (
                              <g key={idx} className="cursor-pointer group">
                                <circle cx={p.x} cy={p.y} r="7" className="fill-white stroke-teal-500 opacity-0 group-hover:opacity-20" strokeWidth="4" />
                                <circle cx={p.x} cy={p.y} r="4.5" className="fill-teal-600 stroke-white" strokeWidth="2" />
                                
                                {/* Label index below point */}
                                <text x={p.x} y={h - paddingY + 12} textAnchor="middle" className="text-[6.5px] font-mono font-extrabold fill-zinc-400">
                                  #{idx + 1}
                                </text>

                                {/* Mini overlay tooltip on hover */}
                                <g className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
                                  <rect x={p.x - 30} y={p.y - 24} width="60" height="16" rx="4" className="fill-zinc-900" />
                                  <text x={p.x} y={p.y - 14} textAnchor="middle" className="text-[8px] font-bold fill-white">
                                    {p.accuracy}% Correct
                                  </text>
                                </g>
                              </g>
                            ))}
                          </svg>
                        );
                      })()}
                    </div>

                    <div className="flex items-center justify-between text-[8px] font-mono text-zinc-400 pt-2 border-t border-zinc-100">
                      <span>⬅️ Earlier attempts</span>
                      <span>Latest sittings ➡️</span>
                    </div>
                  </div>

                  {/* TILE 4: Conceptual Strengths (Mastery Highlights) */}
                  <div className="bg-white border border-zinc-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 font-sans flex items-center gap-1">
                          🏆 Conceptual Strengths
                        </span>
                        <span className="text-[8.5px] bg-emerald-50 text-emerald-700 font-mono font-bold px-1.5 py-0.5 rounded-sm">
                          Verified
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 font-medium">
                        Topics & theories where you have demonstrated flawless accuracy and solid deductive clarity in class tests.
                      </p>
                    </div>

                    <div className="flex-1 space-y-2.5 overflow-y-auto max-h-48 scrollbar-thin">
                      {dashboardStats.strengths.slice(0, 4).map((str, idx) => (
                        <div key={idx} className="bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-2xl text-left flex items-start gap-2.5">
                          <span className="p-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs">
                            ✓
                          </span>
                          <div className="space-y-0.5">
                            <span className="text-[8px] font-mono font-black uppercase tracking-wider text-emerald-700 block">
                              {str.category}
                            </span>
                            <p className="text-[10px] text-slate-800 font-extrabold leading-tight">
                              {str.concept}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="text-[8px] text-emerald-600/80 font-bold bg-emerald-500/5 p-2 rounded-xl border border-emerald-500/10 flex items-center gap-1 justify-center">
                      <span>💎 Keep it up! These are ready for board revisions.</span>
                    </div>
                  </div>

                  {/* TILE 5: Growth Areas & Recommendations */}
                  <div className="bg-white border border-zinc-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 font-sans flex items-center gap-1">
                          ⚠️ Mastery Focus Areas
                        </span>
                        <span className="text-[8.5px] bg-amber-50 text-amber-700 font-mono font-bold px-1.5 py-0.5 rounded-sm">
                          Targeted
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 font-medium">
                        Concepts where mistakes were flagged. Revise these carefully to optimize your board examination scores!
                      </p>
                    </div>

                    <div className="flex-1 space-y-2.5 overflow-y-auto max-h-48 scrollbar-thin">
                      {dashboardStats.growths.slice(0, 3).map((g, idx) => (
                        <div key={idx} className="bg-amber-500/5 border border-amber-500/10 p-3 rounded-2xl text-left flex flex-col gap-1.5 font-sans">
                          <div className="flex items-start gap-2">
                            <span className="p-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-black leading-none">
                              !
                            </span>
                            <div className="space-y-0.5">
                              <span className="text-[8px] font-mono font-black uppercase tracking-wider text-amber-700 block">
                                {g.category}
                              </span>
                              <p className="text-[10px] text-slate-800 font-extrabold leading-tight">
                                {g.concept}
                              </p>
                            </div>
                          </div>
                          <p className="text-[9px] text-zinc-600 font-medium bg-white p-2 rounded-xl border border-zinc-150 leading-relaxed">
                            {g.explanation}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="text-[8px] text-amber-700 font-bold bg-amber-500/5 p-2 rounded-xl border border-amber-500/10 flex items-center gap-1 justify-center">
                      <span>📖 Practice flashcards to master these topics!</span>
                    </div>
                  </div>

                </div>

                {/* Dashboard bottom educational advice summary */}
                <div className="bg-slate-50 border border-zinc-150 p-4.5 rounded-2xl flex items-start gap-3.5 text-left text-zinc-500 text-[10.5px] leading-relaxed">
                  <HelpCircle className="w-5 h-5 text-teal-800 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-extrabold text-[#0a3641] block uppercase tracking-wider text-[8.5px]">
                      Why Cognitive Radar-Bento Hub?
                    </span>
                    <p>
                      According to educational psychometrics, learning progress is multi-dimensional. Standard scores mask where a student is stumbling (e.g. they might understand the core theory but fail multi-step algebra calculation precision). By breaking down your performance into <strong className="text-zinc-700">Concept Clarity</strong>, <strong className="text-zinc-700">Theoretical core definitions</strong>, and <strong className="text-zinc-700">Calculation precision</strong>, this board-book synchronizes with your active lectures in real-time, giving you an edge of smart spaced-repetition.
                    </p>
                  </div>
                </div>

              </div>
            ) : (
              <div className="space-y-4 animate-fade-in text-left">
                {/* Unified Board-Book Hub Header - Compact & Sleek (Matching Performance & Kiara) */}
                <div className="bg-gradient-to-r from-[#0a3641] to-[#041a1e] px-3.5 py-2.5 sm:px-4 sm:py-2.5 rounded-2xl text-white shadow-xs relative overflow-hidden flex items-center justify-between gap-3 shrink-0 min-h-[52px]">
                  <div className="flex items-center gap-2.5 min-w-0 z-10">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-400/20 border border-emerald-400/30 text-emerald-300 flex items-center justify-center text-sm font-bold shrink-0">
                      📚
                    </div>
                    <div className="text-left min-w-0">
                      <h3 className="text-xs sm:text-sm font-black tracking-tight text-white flex items-center gap-1.5 truncate">
                        Unified Board-Book Hub 📖
                      </h3>
                      <p className="text-[10px] sm:text-[10.5px] text-teal-100/85 font-medium truncate">
                        Digital learning locker for archived classroom lectures & downloadable PDF handouts.
                      </p>
                    </div>
                  </div>

                  <span className="hidden sm:inline-flex text-[9px] font-mono font-bold uppercase tracking-wider bg-emerald-400/20 text-emerald-300 px-2.5 py-1 rounded-lg border border-emerald-400/20 shrink-0 z-10">
                    Archived ({pastSessions.length})
                  </span>
                </div>

            {/* Panel 2: Past Sessions Board-Book Arc Archives Block (Overhauled Subject-Wise Architecture) */}
            <div className="space-y-4 pt-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-150 pb-2">
                <div className="text-left">
                  <h4 className="text-xs uppercase font-mono tracking-widest text-[#0a3641] font-extrabold flex items-center gap-1.5">
                    <span>📁</span> Archived Classroom Lecture Books ({pastSessions.length})
                  </h4>
                </div>
              </div>

              {pastSessions && pastSessions.length > 0 ? (
                <div className="space-y-3.5">
                  {/* Subject and Title Search Bar */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 stroke-[2.5]" />
                    <input 
                      type="text" 
                      value={archiveSearchQuery} 
                      onChange={(e) => setArchiveSearchQuery(e.target.value)} 
                      placeholder="Search by subject, lecture title, or date..." 
                      className="w-full pl-10 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold placeholder:text-zinc-400 text-zinc-800 focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 transition-all font-mono"
                    />
                    {archiveSearchQuery && (
                      <button 
                        onClick={() => setArchiveSearchQuery("")}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-xs font-mono font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {Object.keys(sortedAndGroupedSessions).length === 0 ? (
                    <div className="border border-dashed border-zinc-200 rounded-2xl p-6 bg-zinc-50/50 text-center select-none">
                      <p className="text-xs font-black text-zinc-400">No matching lecture books found</p>
                      <p className="text-[10px] text-zinc-400 mt-1">Try adjusting your keyword or subject search filter query.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {Object.keys(sortedAndGroupedSessions).sort().map((subName) => {
                        const sessionsInGrp = sortedAndGroupedSessions[subName];
                        const isExpanded = !!expandedSubjects[subName];

                        return (
                          <div 
                            key={subName}
                            className="border border-zinc-150 rounded-2xl bg-white overflow-hidden shadow-xs transition-all duration-200 hover:border-zinc-300"
                          >
                            {/* Subject Accordion Folder Header */}
                            <button
                              onClick={() => setExpandedSubjects(prev => ({ ...prev, [subName]: !prev[subName] }))}
                              className="w-full px-4 py-3 bg-[#fbfcfb] border-b border-zinc-100 flex items-center justify-between gap-3 text-left transition-colors hover:bg-slate-50 cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="p-1 px-1.5 bg-teal-50 text-teal-700 rounded-lg shrink-0">
                                  {isExpanded ? (
                                    <FolderOpen className="w-4 h-4 stroke-[2]" />
                                  ) : (
                                    <Folder className="w-4 h-4 stroke-[2]" />
                                  )}
                                </span>
                                <div className="min-w-0">
                                  <h5 className="text-xs font-black text-[#0a3641] uppercase tracking-wide truncate font-sans">
                                    {subName}
                                  </h5>
                                  <p className="text-[9.5px] text-[#486a73] font-mono leading-none mt-1 font-bold">
                                    {sessionsInGrp.length} Lesson PDF{sessionsInGrp.length === 1 ? "" : "s"} Archived
                                  </p>
                                </div>
                              </div>
                              <span className="text-zinc-400">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 stroke-[2.5]" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                                )}
                              </span>
                            </button>

                            {/* Nested Sub-List: PDF Assets mapped to other subject */}
                            {isExpanded && (
                              <div className="divide-y divide-zinc-100 bg-white">
                                {sessionsInGrp.map((sess, idx) => {
                                  const hasContent = !!(sess.customBoardContent || (sess.topicBoardsContent && Object.keys(sess.topicBoardsContent).length > 0));

                                  const isYoutubeSess = sess.processedTitle?.includes("YouTube") || sess.processedTitle?.includes("(ID: ");

                                  return (
                                    <div 
                                      key={sess.sessionId || idx}
                                      className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-all pl-6 sm:pl-8 border-l-2 ${
                                        isYoutubeSess ? "border-red-500/30 bg-red-50/5 hover:bg-red-50/15" : "border-teal-600/20"
                                      }`}
                                    >
                                      <div className="space-y-1 text-left min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                                            isYoutubeSess ? "bg-red-50 text-red-700 border border-red-100" : "bg-teal-50 text-teal-800"
                                          }`}>
                                            Lesson #{sess.index}
                                          </span>
                                          {isYoutubeSess && (
                                            <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-red-600 text-white flex items-center gap-1 font-mono">
                                              <Youtube className="w-2.5 h-2.5" /> Direct Video Sync
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-xs font-extrabold text-[#0a3641] tracking-tight truncate leading-tight">
                                          {sess.processedTitle}
                                        </p>
                                        <div className="flex items-center gap-x-3 text-[9.5px] font-mono text-zinc-500 font-semibold mt-1">
                                          <span className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3 text-[#4c8491]" /> {sess.formattedDateTime}
                                          </span>
                                          <span>•</span>
                                          <span className={isYoutubeSess ? "text-red-700 font-bold" : "text-teal-700"}>
                                            {(sess.topics && sess.topics.length > 0) ? `${sess.topics.length} Sections` : "Consolidated Study Notes"}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                        <button
                                          onClick={() => {
                                            const cachedDeck = localStorage.getItem(`revision_deck_${sess.sessionId || sess.index}`);
                                            if (cachedDeck) {
                                              try {
                                                const parsed = JSON.parse(cachedDeck);
                                                const hasValidMindMap = parsed && parsed.mindMap && Array.isArray(parsed.mindMap.nodes) && parsed.mindMap.nodes.length > 0;
                                                if (hasValidMindMap) {
                                                  handleOpenRevisionDeck(sess, parsed);
                                                  return;
                                                }
                                              } catch (_) {}
                                            }
                                            handleGenerateRevisionDeck(sess);
                                          }}
                                          disabled={!hasContent}
                                          className={`py-1.5 px-3 rounded-xl text-[10px] font-black tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                            hasContent
                                              ? "bg-amber-50 hover:bg-amber-100/70 text-amber-800 shadow-xs active:scale-[0.98] active:ring-1 active:ring-amber-200"
                                              : "bg-slate-100 text-slate-300 cursor-not-allowed"
                                          }`}
                                          title={hasContent ? "Generate AI Flashcards & Mind Map for this lecture session" : "This session's board notes are empty"}
                                        >
                                          <Sparkles className="w-3.5 h-3.5 stroke-[2.5] text-amber-600 animate-pulse" />
                                          <span>Smart Revision</span>
                                        </button>

                                        <button
                                          onClick={() => handleExportSessionToPDF(sess)}
                                          disabled={!hasContent}
                                          className={`py-1.5 px-3 rounded-xl text-[10px] font-black tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                            hasContent
                                              ? "bg-teal-50 hover:bg-teal-100/80 active:scale-[0.98] text-[#0f766e] shadow-xs active:ring-1 active:ring-teal-200"
                                              : "bg-slate-100 text-slate-300 cursor-not-allowed"
                                          }`}
                                          title={hasContent ? "Download complete Study Handout as a beautiful multi-page PDF" : "This session's board notes are empty"}
                                        >
                                          <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                                          <span>Download PDF</span>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="border border-dashed border-zinc-200 rounded-2xl p-8 bg-zinc-50/50 text-center select-none">
                  <p className="text-xs font-black text-zinc-400">Archive Locker Empty</p>
                  <p className="text-[10px] text-zinc-400 mt-1 max-w-xs mx-auto leading-relaxed">
                    Once you conduct or complete live classrooms with Cherry Ma'am, your completed board-books will compile and archive here automatically under secure token sync.
                  </p>
                </div>
              )}
            </div>

            {/* Panel 3: Automated Lecture Screen Recordings Section */}
            <div className="space-y-4 pt-4 border-t border-zinc-150">
              <div className="flex items-center justify-between flex-wrap gap-2 text-left">
                <div>
                  <h4 className="text-xs uppercase font-mono tracking-widest text-[#0a3641] font-extrabold flex items-center gap-1.5">
                    <Film className="w-4 h-4 text-teal-600" /> Recorded Live Class Reels ({recordings.length})
                  </h4>
                  <p className="text-[10px] text-[#486a73] font-medium mt-1 leading-relaxed">
                    Recorded lectures capture the exact mobile vertical blackboard layout matching Cherry Ma'am's live classroom interface (handout text, formulas, prediction poll questions, and diagrams in 9:16 Reel Format). Watch, recall key concepts, or download!
                  </p>
                </div>
                <span className="text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-teal-500/15 text-teal-800 border border-teal-500/30 flex items-center gap-1 font-mono">
                  📱 9:16 Reel Format
                </span>
              </div>

              {recordings.length === 0 ? (
                <div className="border border-dashed border-zinc-200 rounded-2xl p-8 bg-zinc-50/50 text-center select-none">
                  <Film className="w-8 h-8 text-zinc-300 mx-auto stroke-[1.5] mb-2" />
                  <p className="text-xs font-black text-zinc-400">No Recorded Sessions Yet</p>
                  <p className="text-[10px] text-zinc-400 mt-1 max-w-xs mx-auto leading-relaxed">
                    Start a live lesson with Cherry Ma'am! The system will automatically capture the full live classroom UI (header, handout notes, slate formulas, diagrams, and voice audio), then save the recorded video here.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Premium Subject Selection & Live Filter Dashboard */}
                  <div className="bg-white border border-zinc-150 rounded-2xl p-4 shadow-[0_4px_20px_-4px_rgba(10,54,65,0.06)] space-y-4">
                    {/* Header line inside filter container for modern look */}
                    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
                      <div>
                        <span className="text-[10px] font-bold text-zinc-400 font-sans uppercase tracking-wider block">
                          Filter & Explore Lecture Reels
                        </span>
                        <h5 className="text-[11px] font-extrabold text-[#0a3641] tracking-tight">
                          Find your vertical reels recorded sessions with Cherry Ma'am
                        </h5>
                      </div>
                      
                      {/* Search Bar on Right/Flexible */}
                      <div className="relative w-full md:w-80">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#0a3641]/70" />
                        <input
                          type="text"
                          placeholder="Search topic title, date or subject..."
                          value={recordingsSearchQuery}
                          onChange={(e) => setRecordingsSearchQuery(e.target.value)}
                          className="w-full pl-9 pr-8 py-2.5 bg-zinc-50 hover:bg-zinc-100/50 focus:bg-white border border-transparent focus:border-teal-500/30 rounded-xl text-xs font-semibold text-[#0a3641] transition-all outline-none"
                        />
                        {recordingsSearchQuery && (
                          <button
                            onClick={() => setRecordingsSearchQuery("")}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 font-bold text-[10px]"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Subject Pills Line with label */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                          📂 Choose Subject Area:
                        </span>
                        {selectedSubjectFilter !== "All" && (
                          <button
                            onClick={() => setSelectedSubjectFilter("All")}
                            className="text-[9px] font-extrabold text-teal-600 hover:text-teal-700 transition-all uppercase tracking-wider"
                          >
                            Clear Filter ✕
                          </button>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-zinc-200 scrollbar-track-transparent">
                        <button
                          onClick={() => setSelectedSubjectFilter("All")}
                          className={`shrink-0 py-2 px-3.5 rounded-xl border text-[11px] font-black tracking-wide transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
                            selectedSubjectFilter === "All"
                              ? "bg-[#0a3641] text-white border-[#0a3641] shadow-md shadow-teal-950/10 scale-[1.01]"
                              : "bg-zinc-50/70 hover:bg-zinc-100 text-[#0a3641] border-zinc-200"
                          }`}
                        >
                          <span>✨ All Subjects</span>
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md ${selectedSubjectFilter === "All" ? "bg-white/20 text-white" : "bg-zinc-100 text-[#0a3641]"}`}>
                            {recordings.length}
                          </span>
                        </button>

                        {allSubjects.map((subName) => {
                          const count = recordings.filter((r) => {
                            const rs = r.subject ? r.subject.trim() : "General Syllabus";
                            return rs.charAt(0).toUpperCase() + rs.slice(1).toLowerCase() === subName;
                          }).length;
                          
                          const getSubEmoji = (sub: string) => {
                            const s = sub.toLowerCase();
                            if (s.includes("math")) return "📐";
                            if (s.includes("science") || s.includes("vigyan")) return "🧪";
                            if (s.includes("physics") || s.includes("bhautik")) return "⚡";
                            if (s.includes("chemistry") || s.includes("rasayan")) return "🧪";
                            if (s.includes("biology") || s.includes("jeev")) return "🌿";
                            if (s.includes("english") || s.includes("angrezi")) return "✍️";
                            if (s.includes("history") || s.includes("itihas")) return "📜";
                            if (s.includes("geography") || s.includes("bhoogol")) return "🌍";
                            if (s.includes("computer") || s.includes("coding")) return "💻";
                            return "📚";
                          };

                          return (
                            <button
                              key={subName}
                              onClick={() => setSelectedSubjectFilter(subName)}
                              className={`shrink-0 py-2 px-3.5 rounded-xl border text-[11px] font-black tracking-wide transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
                                selectedSubjectFilter === subName
                                  ? "bg-[#0a3641] text-white border-[#0a3641] shadow-md shadow-teal-950/10 scale-[1.01]"
                                  : "bg-zinc-50/70 hover:bg-zinc-100 text-[#0a3641] border-zinc-200"
                              }`}
                            >
                              <span>{getSubEmoji(subName)} {subName}</span>
                              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md ${selectedSubjectFilter === subName ? "bg-white/20 text-white" : "bg-zinc-100 text-[#0a3641]"}`}>
                                {count}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Render filtered recordings list */}
                  {Object.keys(filteredAndGroupedRecordings).length === 0 ? (
                    <div className="border border-zinc-150 rounded-2xl p-8 bg-zinc-50/50 text-center select-none">
                      <p className="text-xs font-black text-zinc-400">No lecture reels match your search or filters.</p>
                      <button
                        onClick={() => {
                          setSelectedSubjectFilter("All");
                          setRecordingsSearchQuery("");
                        }}
                        className="mt-3.5 py-2 px-4 rounded-xl bg-[#0a3641] text-white text-[10px] font-black tracking-wider uppercase transition-all hover:bg-[#0c4756] cursor-pointer"
                      >
                        Reset Search Filters ✕
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {Object.entries(filteredAndGroupedRecordings).map(([subjectName, rawRecs]) => {
                        const subjectRecs = rawRecs as SavedRecording[];
                        const getSubEmoji = (sub: string) => {
                          const s = sub.toLowerCase();
                          if (s.includes("math")) return "📐";
                          if (s.includes("science") || s.includes("vigyan")) return "🧪";
                          if (s.includes("physics") || s.includes("bhautik")) return "⚡";
                          if (s.includes("chemistry") || s.includes("rasayan")) return "🧪";
                          if (s.includes("biology") || s.includes("jeev")) return "🌿";
                          if (s.includes("english") || s.includes("angrezi")) return "✍️";
                          if (s.includes("history") || s.includes("itihas")) return "📜";
                          if (s.includes("geography") || s.includes("bhoogol")) return "🌍";
                          if (s.includes("computer") || s.includes("coding")) return "💻";
                          return "📚";
                        };

                        return (
                          <div key={subjectName} className="space-y-2 text-left">
                            <div className="flex items-center justify-between border-b border-zinc-100 pb-1.5">
                              <span className="text-[11px] font-black uppercase tracking-wider text-[#0a3641] bg-[#0a3641]/5 px-2.5 py-1 rounded-lg">
                                {getSubEmoji(subjectName)} {subjectName}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-zinc-400 font-bold">
                                  ({subjectRecs.length} {subjectRecs.length === 1 ? "reel" : "reels"})
                                </span>
                                <span className="text-[9px] font-sans font-bold text-zinc-300 hidden sm:inline">
                                  Swipe horizontally to browse ↔
                                </span>
                              </div>
                            </div>

                            {/* Horizontal scrollable row - Live Classroom 9:16 Reel Cards */}
                            <div className="flex overflow-x-auto gap-4 pb-3 pt-1 scrollbar-thin scrollbar-thumb-zinc-300 scrollbar-track-transparent snap-x snap-mandatory">
                              {subjectRecs.map((rec) => {
                                return (
                                  <div 
                                    key={rec.id}
                                    className="w-[220px] sm:w-[240px] shrink-0 snap-center border border-zinc-200 rounded-2xl p-3 bg-gradient-to-b from-white to-zinc-50 hover:border-teal-500/50 transition-all duration-200 shadow-xs text-left flex flex-col justify-between space-y-3 relative group"
                                  >
                                    {/* 9:16 Vertical Reel Poster Thumbnail */}
                                    <div 
                                      onClick={() => {
                                        try {
                                          if (videoUrl) URL.revokeObjectURL(videoUrl);
                                          const url = URL.createObjectURL(rec.blob);
                                          setVideoUrl(url);
                                          setPlayingVideo(rec);
                                          setIsPlaying(true);
                                        } catch (err) {
                                          console.error("Failed opening recording:", err);
                                        }
                                      }}
                                      className="relative w-full aspect-[9/13] bg-[#071916] rounded-xl overflow-hidden border border-teal-900/50 p-3 flex flex-col justify-between shadow-inner cursor-pointer group-hover:shadow-teal-900/30 transition-all"
                                    >
                                      {/* Background chalk grid texture */}
                                      <div className="absolute inset-0 bg-[radial-gradient(#2dd4bf_1px,transparent_1px)] [background-size:16px_16px] opacity-15 pointer-events-none" />
                                      
                                      {/* Top Badges */}
                                      <div className="relative z-10 flex items-center justify-between">
                                        <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-teal-400/20 text-teal-300 border border-teal-400/30 font-mono">
                                          {rec.subject.toUpperCase()}
                                        </span>
                                        <span className="text-[8px] font-mono font-bold text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-1 border border-amber-400/30">
                                          <Flame className="w-2.5 h-2.5 text-amber-300 fill-amber-300" /> 9:16 REEL
                                        </span>
                                      </div>

                                      {/* Center Play Pulse Icon */}
                                      <div className="relative z-10 my-auto text-center flex flex-col items-center justify-center gap-1">
                                        <div className="w-12 h-12 rounded-full bg-teal-500/20 group-hover:bg-teal-500/40 border-2 border-teal-400 flex items-center justify-center text-teal-200 backdrop-blur-md transition-transform group-hover:scale-110 shadow-lg">
                                          <Play className="w-6 h-6 fill-teal-200 ml-0.5" />
                                        </div>
                                        <span className="text-[9px] font-mono font-bold text-teal-200/90 bg-black/60 px-2 py-0.5 rounded-full mt-1 border border-teal-500/30">
                                          {rec.duration || "02:15"}
                                        </span>
                                      </div>

                                      {/* Bottom Title Overlay */}
                                      <div className="relative z-10 bg-black/80 backdrop-blur-md border border-white/10 rounded-lg p-2 space-y-1">
                                        <h5 className="text-[11px] font-extrabold text-white tracking-tight leading-tight line-clamp-2">
                                          {rec.topicTitle}
                                        </h5>
                                        <p className="text-[8px] font-mono text-teal-300 flex items-center justify-between pt-0.5">
                                          <span>Cherry AI Classroom</span>
                                          <span>{rec.date}</span>
                                        </p>
                                      </div>
                                    </div>

                                    {/* Action Buttons Row */}
                                    <div className="space-y-2 pt-0.5">
                                      <div className="grid grid-cols-2 gap-1.5">
                                        <button
                                          onClick={() => {
                                            try {
                                              if (videoUrl) URL.revokeObjectURL(videoUrl);
                                              const url = URL.createObjectURL(rec.blob);
                                              setVideoUrl(url);
                                              setPlayingVideo(rec);
                                              setIsPlaying(true);
                                            } catch (err) {
                                              console.error("Failed opening recording:", err);
                                            }
                                          }}
                                          className="py-2 px-1.5 rounded-xl bg-[#0a3641] hover:bg-[#0c4756] text-white text-[9px] font-black tracking-wider uppercase transition-all flex items-center justify-center gap-1 cursor-pointer shadow-xs active:scale-[0.98]"
                                        >
                                          <Play className="w-3 h-3 fill-white" />
                                          <span>Reel 📱</span>
                                        </button>

                                        <button
                                          onClick={() => setShareRecording(rec)}
                                          className="py-2 px-1.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-[9px] font-black tracking-wider uppercase transition-all flex items-center justify-center gap-1 cursor-pointer shadow-xs active:scale-[0.98]"
                                        >
                                          <Share2 className="w-3 h-3" />
                                          <span>Share 🚀</span>
                                        </button>
                                      </div>

                                      <div className="flex items-center justify-between gap-1 text-[9px] font-mono text-zinc-400 pt-0.5 border-t border-zinc-100">
                                        <button
                                          onClick={() => {
                                            try {
                                              const url = URL.createObjectURL(rec.blob);
                                              const a = document.createElement("a");
                                              a.href = url;
                                              const cleanName = rec.topicTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_");
                                              a.download = `cherry_reel_${cleanName}.webm`;
                                              document.body.appendChild(a);
                                              a.click();
                                              document.body.removeChild(a);
                                              setTimeout(() => URL.revokeObjectURL(url), 100);
                                            } catch (err) {
                                              console.error("Download failed:", err);
                                            }
                                          }}
                                          className="text-teal-700 hover:text-teal-900 font-bold flex items-center gap-1 cursor-pointer py-0.5"
                                        >
                                          <Download className="w-3 h-3" /> Save Reel
                                        </button>

                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            if (confirmDeleteId === rec.id) {
                                              try {
                                                await deleteRecording(rec.id);
                                                const updated = await getAllRecordings();
                                                setRecordings(updated);
                                                setConfirmDeleteId(null);
                                              } catch (err) {
                                                console.error("Failed to delete recording:", err);
                                              }
                                            } else {
                                              setConfirmDeleteId(rec.id);
                                              setTimeout(() => {
                                                setConfirmDeleteId(prev => prev === rec.id ? null : prev);
                                              }, 4000);
                                            }
                                          }}
                                          className="text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer py-0.5"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                          {confirmDeleteId === rec.id ? "Confirm?" : "Delete"}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Vertical 9:16 Mobile Reels Recorded Video Player Modal */}
            {playingVideo && videoUrl && (
              <div className="fixed inset-0 bg-[#040f12]/95 backdrop-blur-xl flex items-center justify-center z-50 p-2 sm:p-4 animate-fade-in select-none">
                {/* Reel Smartphone Chassis */}
                <div className="relative w-full max-w-[390px] h-[90vh] max-h-[820px] bg-black border-4 border-zinc-800 sm:border-zinc-700/80 rounded-[38px] shadow-[0_0_60px_rgba(45,212,191,0.25)] overflow-hidden flex flex-col justify-between text-white">
                  
                  {/* Top Smartphone Notch */}
                  <div className="w-28 h-4 bg-zinc-900 rounded-full mx-auto absolute top-2 left-1/2 -translate-x-1/2 z-40 flex items-center justify-center border border-zinc-800/80">
                    <div className="w-2 h-2 rounded-full bg-teal-500/80 animate-pulse" />
                  </div>

                  {/* Reel Top Bar Overlay */}
                  <div className="relative z-30 bg-gradient-to-b from-black/90 via-black/50 to-transparent p-4 pt-7 flex items-center justify-between">
                    <div className="text-left space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-mono font-black uppercase bg-teal-400/20 text-teal-300 px-2 py-0.5 rounded border border-teal-400/30">
                          {playingVideo.subject.toUpperCase()}
                        </span>
                        <span className="text-[8px] font-mono text-amber-300 font-bold flex items-center gap-1 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-400/30">
                          <Flame className="w-2.5 h-2.5 text-amber-300 fill-amber-300" /> 9:16 REEL
                        </span>
                      </div>
                      <h4 className="text-xs font-extrabold tracking-tight truncate max-w-[210px] text-white mt-1">
                        {playingVideo.topicTitle}
                      </h4>
                    </div>

                    <button 
                      onClick={() => {
                        if (videoUrl) URL.revokeObjectURL(videoUrl);
                        setVideoUrl(null);
                        setPlayingVideo(null);
                        setShowNotesDrawer(false);
                      }}
                      className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer backdrop-blur-md"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Center Video Area */}
                  <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
                    <video 
                      ref={videoRef}
                      src={videoUrl}
                      autoPlay
                      loop
                      playsInline
                      onTimeUpdate={() => {
                        if (videoRef.current) {
                          setCurrentTime(videoRef.current.currentTime);
                          setDuration(videoRef.current.duration || 0);
                        }
                      }}
                      onClick={() => {
                        if (videoRef.current) {
                          if (isPlaying) {
                            videoRef.current.pause();
                            setIsPlaying(false);
                          } else {
                            videoRef.current.play();
                            setIsPlaying(true);
                          }
                        }
                      }}
                      className="w-full h-full object-contain cursor-pointer"
                    />

                    {/* Pause Overlay */}
                    {!isPlaying && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs pointer-events-none">
                        <div className="w-16 h-16 rounded-full bg-teal-500/80 border-2 border-white flex items-center justify-center text-white shadow-2xl">
                          <Play className="w-8 h-8 fill-white ml-1" />
                        </div>
                      </div>
                    )}

                    {/* Right Action Bar Controls */}
                    <div className="absolute right-3 bottom-20 z-30 flex flex-col items-center gap-4">
                      {/* Heart Button */}
                      <button
                        onClick={() => {
                          setIsLiked(!isLiked);
                          setLikeCount(prev => isLiked ? prev - 1 : prev + 1);
                        }}
                        className="group flex flex-col items-center gap-1 cursor-pointer"
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${
                          isLiked ? "bg-rose-500 border-rose-400 text-white shadow-lg shadow-rose-500/40 scale-110" : "bg-black/40 border-white/20 text-white hover:bg-black/60"
                        }`}>
                          <Heart className={`w-5 h-5 ${isLiked ? "fill-white" : ""}`} />
                        </div>
                        <span className="text-[9px] font-mono font-bold text-white shadow-xs">{likeCount}</span>
                      </button>

                      {/* Share Button */}
                      <button
                        onClick={() => setShareRecording(playingVideo)}
                        className="flex flex-col items-center gap-1 cursor-pointer group"
                      >
                        <div className="w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 border border-white/20 flex items-center justify-center text-white backdrop-blur-md transition-all group-hover:scale-105">
                          <Share2 className="w-5 h-5 text-teal-300" />
                        </div>
                        <span className="text-[9px] font-mono font-bold text-white">Share</span>
                      </button>

                      {/* Notes / Chalkboard Summary Drawer */}
                      <button
                        onClick={() => setShowNotesDrawer(!showNotesDrawer)}
                        className="flex flex-col items-center gap-1 cursor-pointer group"
                      >
                        <div className={`w-10 h-10 rounded-full border flex items-center justify-center text-white backdrop-blur-md transition-all ${
                          showNotesDrawer ? "bg-teal-500 border-teal-400" : "bg-black/40 border-white/20 hover:bg-black/60"
                        }`}>
                          <FileText className="w-5 h-5 text-teal-200" />
                        </div>
                        <span className="text-[9px] font-mono font-bold text-white">Notes</span>
                      </button>

                      {/* Speed Controller */}
                      <button
                        onClick={() => {
                          const speeds = [1, 1.25, 1.5, 2];
                          const nextIndex = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
                          const newSpeed = speeds[nextIndex];
                          setPlaybackSpeed(newSpeed);
                          if (videoRef.current) videoRef.current.playbackRate = newSpeed;
                        }}
                        className="flex flex-col items-center gap-1 cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 border border-white/20 flex items-center justify-center text-white backdrop-blur-md font-mono text-[10px] font-extrabold text-amber-300">
                          {playbackSpeed}x
                        </div>
                        <span className="text-[9px] font-mono font-bold text-white">Speed</span>
                      </button>

                      {/* Download Reel */}
                      <button
                        onClick={() => {
                          const a = document.createElement("a");
                          a.href = videoUrl;
                          const cleanName = playingVideo.topicTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_");
                          a.download = `cherry_reel_${cleanName}.webm`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        }}
                        className="flex flex-col items-center gap-1 cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 border border-white/20 flex items-center justify-center text-white backdrop-blur-md">
                          <Download className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-[9px] font-mono font-bold text-white">Save</span>
                      </button>
                    </div>

                    {/* Interactive Chalkboard Notes Drawer */}
                    {showNotesDrawer && (
                      <div className="absolute inset-x-0 bottom-0 top-1/3 bg-[#081f1b]/95 border-t-2 border-teal-500/50 backdrop-blur-md p-4 text-left overflow-y-auto z-40 space-y-3">
                        <div className="flex items-center justify-between border-b border-teal-500/30 pb-2">
                          <h5 className="text-xs font-black uppercase text-teal-300 flex items-center gap-1.5 font-mono">
                            <FileText className="w-3.5 h-3.5" /> Chalkboard Class Notes
                          </h5>
                          <button 
                            onClick={() => setShowNotesDrawer(false)}
                            className="text-zinc-400 hover:text-white text-xs font-bold"
                          >
                            ✕ Close
                          </button>
                        </div>

                        <div className="space-y-2 text-[11px] font-mono text-emerald-100/90 leading-relaxed bg-black/40 p-3 rounded-xl border border-teal-500/20">
                          <p className="font-bold text-amber-300">📌 Topic: {playingVideo.topicTitle}</p>
                          <p className="text-[10px] text-zinc-300">
                            • Cherry Ma'am 1-on-1 Socratic Lecture Session<br/>
                            • Formula Derivations & Worked Step-by-Step Examples<br/>
                            • Interactive Doubt Checkpoint Answers
                          </p>
                          <div className="pt-2 border-t border-teal-500/20 text-[10px] text-teal-200/80">
                            💡 Tip: Reel is formatted in 9:16 vertical view for seamless mobile revision & WhatsApp status sharing!
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bottom Reel Caption & Timeline Bar Overlay */}
                  <div className="relative z-30 bg-gradient-to-t from-black via-black/80 to-transparent p-4 pb-6 space-y-2 text-left">
                    {/* Cherry Ma'am AI Avatar Tag */}
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-teal-500 border border-white flex items-center justify-center font-black text-xs text-white shadow-md">
                        🍒
                      </div>
                      <div>
                        <p className="text-[11px] font-extrabold text-white flex items-center gap-1">
                          Cherry Ma'am <span className="bg-teal-400/20 text-teal-300 text-[8px] font-mono px-1.5 py-0.2 rounded">AI Teacher</span>
                        </p>
                        <p className="text-[9px] font-mono text-zinc-300">Vertical Classroom Reel Recap</p>
                      </div>
                    </div>

                    {/* Live Caption Ticker */}
                    <div className="bg-black/60 border border-teal-500/30 rounded-xl p-2.5 text-[10px] font-mono text-teal-200 line-clamp-2">
                      💬 "{playingVideo.topicTitle} — Watch step-by-step blackboard explanation & master the formulas!"
                    </div>

                    {/* Interactive Timeline & Scrubber */}
                    <div className="space-y-1 pt-1">
                      <input 
                        type="range"
                        min="0"
                        max={duration || 100}
                        value={currentTime}
                        onChange={(e) => {
                          const time = Number(e.target.value);
                          setCurrentTime(time);
                          if (videoRef.current) videoRef.current.currentTime = time;
                        }}
                        className="w-full accent-teal-400 h-1 bg-white/30 rounded-lg cursor-pointer"
                      />
                      <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400">
                        <span>
                          {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')} / {Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}
                        </span>
                        <span className="text-amber-300 font-bold">9:16 HD Reel</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* Share & Viral Promotion Modal */}
            {shareRecording && (
              <div className="fixed inset-0 bg-[#06181b]/95 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in select-none">
                <div className="bg-[#0b282d] border-2 border-teal-500/40 rounded-3xl max-w-md w-full p-6 text-white shadow-2xl text-left space-y-5">
                  
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-teal-500/30 pb-3">
                    <div>
                      <span className="text-[9px] font-mono font-black uppercase tracking-wider text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-400/30">
                        🚀 FREE APP PROMOTION
                      </span>
                      <h4 className="text-sm font-extrabold tracking-tight mt-1 text-white">
                        Share Cherry Ma'am's Lecture Reel
                      </h4>
                    </div>
                    <button 
                      onClick={() => setShareRecording(null)}
                      className="text-zinc-400 hover:text-white bg-white/10 w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Reel Info Preview Box */}
                  <div className="bg-[#071916] border border-teal-500/30 rounded-2xl p-4 flex items-center gap-3">
                    <div className="w-12 h-16 rounded-lg bg-teal-950 border border-teal-400/40 flex flex-col items-center justify-center shrink-0">
                      <Smartphone className="w-5 h-5 text-teal-300" />
                      <span className="text-[7px] font-mono text-amber-300 font-bold mt-1">9:16 REEL</span>
                    </div>
                    <div className="space-y-1 min-w-0">
                      <span className="text-[8px] font-mono font-black uppercase text-teal-300 bg-teal-400/10 px-1.5 py-0.5 rounded">
                        {shareRecording.subject.toUpperCase()}
                      </span>
                      <h5 className="text-xs font-bold text-white truncate">
                        {shareRecording.topicTitle}
                      </h5>
                      <p className="text-[9px] font-mono text-zinc-400">
                        1-on-1 AI Classroom • {shareRecording.duration || "02:15"}
                      </p>
                    </div>
                  </div>

                  {/* Share Teaser Message */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-teal-300 block">
                      Pre-Formatted Viral Social Teaser:
                    </label>
                    <div className="bg-black/50 border border-teal-500/30 rounded-xl p-3 text-[11px] font-mono text-emerald-100/90 leading-relaxed select-all">
                      🔥 Main "{shareRecording.topicTitle}" Cherry Ma'am se 1-on-1 Vertical Class me seekh raha hoon! Check out this 9:16 Reel recap & join Cherry AI Class for free: {window.location.origin}
                    </div>
                  </div>

                  {/* Instant Action Buttons */}
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        const msg = `🔥 Main "${shareRecording.topicTitle}" Cherry Ma'am se 1-on-1 Vertical Class me seekh raha hoon! Check out this 9:16 Reel recap & join Cherry AI Class for free: ${window.location.origin}`;
                        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
                      }}
                      className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-[0.98]"
                    >
                      <Send className="w-4 h-4 fill-white" />
                      <span>Share directly on WhatsApp 🟢</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          const msg = `🔥 Main "${shareRecording.topicTitle}" Cherry Ma'am se 1-on-1 Vertical Class me seekh raha hoon! Check out this 9:16 Reel recap & join Cherry AI Class for free: ${window.location.origin}`;
                          window.open(`https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent(msg)}`, '_blank');
                        }}
                        className="py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Telegram 🔵</span>
                      </button>

                      <button
                        onClick={() => {
                          const msg = `🔥 Main "${shareRecording.topicTitle}" Cherry Ma'am se 1-on-1 Vertical Class me seekh raha hoon! Check out this 9:16 Reel recap & join Cherry AI Class for free: ${window.location.origin}`;
                          navigator.clipboard.writeText(msg);
                          setCopiedLinkToast(true);
                          setTimeout(() => setCopiedLinkToast(false), 3000);
                        }}
                        className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedLinkToast ? "Copied! ✅" : "Copy Link 📋"}</span>
                      </button>
                    </div>
                  </div>

                  {copiedLinkToast && (
                    <div className="p-2.5 bg-emerald-500/20 border border-emerald-400/40 rounded-xl text-center text-[10px] font-mono text-emerald-300 animate-fade-in">
                      ✨ Promotional link copied! Share on Instagram Reels or YouTube Shorts to invite friends!
                    </div>
                  )}

                  <p className="text-[9px] font-mono text-zinc-400 text-center">
                    💡 Tip: Sharing reels with friends helps them discover Cherry AI Class while giving you free promotion!
                  </p>

                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>

        {/* Smart Revision Deck Interactive Overlay Modal */}
        {activeRevisionSession && (
          <div className="fixed inset-0 bg-[#06181b]/95 flex items-center justify-center z-50 p-0 md:p-4 animate-fade-in select-none">
            {loadingRevision ? (
              <div className="bg-[#0b282d] border-2 border-teal-500/30 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl space-y-6 flex flex-col items-center mx-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-teal-500/20 border-t-teal-400 animate-spin" />
                  <Sparkles className="w-6 h-6 text-amber-400 absolute inset-0 m-auto animate-pulse" />
                </div>
                <div className="space-y-3">
                  <h3 className="text-xs font-mono tracking-widest font-black uppercase text-amber-400">
                    Cherry's Revision Lab
                  </h3>
                  <h4 className="text-base font-extrabold text-white">
                    Synthesizing Study Materials...
                  </h4>
                  <div className="text-left bg-[#05171a] border border-teal-950 p-4 rounded-xl space-y-2 text-[11px] font-mono text-teal-300">
                    <p className="flex items-center gap-2">
                      <span className="text-teal-400">✓</span> Reading classroom board-book
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="text-teal-400">✓</span> Analyzing scientific formulas
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="text-teal-400">✓</span> Generating visual concept map
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="text-amber-400 animate-pulse">⟳</span> Compiling flashcard recall deck
                    </p>
                  </div>
                  <p className="text-xs text-teal-100/60 leading-relaxed font-sans max-w-xs mx-auto">
                    Cherry Ma'am is preparing custom interactive flashcards and conceptual mind maps to help you master this session's topics.
                  </p>
                </div>
              </div>
            ) : revisionDeckData ? (
              <div className="bg-[#f8fafc] border-0 md:border border-slate-200/80 md:rounded-3xl w-full max-w-7xl h-full md:h-[94vh] flex flex-col overflow-hidden shadow-2xl relative transition-all">
                
                {/* Header of Revision Center */}
                <div className="bg-gradient-to-r from-[#0d2d2a] via-[#113a37] to-[#0c2e2c] border-b border-emerald-800/20 text-white px-4 py-2 sm:px-6 sm:py-3.5 flex items-center justify-between shrink-0">
                  <div className="text-left space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-amber-400 text-slate-950 text-[8.5px] font-black tracking-widest uppercase py-0.5 px-1.5 rounded-md">
                        🧠 SMART REVISION
                      </span>
                      <span className="text-[9.5px] font-mono font-bold text-teal-300 truncate">
                        {activeRevisionSession.subject || subject} • Class {grade}
                      </span>
                    </div>
                    <h3 className="text-xs sm:text-sm md:text-base font-black truncate max-w-xs sm:max-w-md md:max-w-xl text-teal-50">
                      {activeRevisionSession.processedTitle}
                    </h3>
                  </div>
                  
                  <button 
                    onClick={handleCloseRevisionDeck}
                    className="bg-white/10 hover:bg-white/20 text-white p-1.5 rounded-full transition-all cursor-pointer hover:rotate-90 duration-300 shrink-0 ml-2"
                    title="Close Revision Deck"
                  >
                    <X className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>

                {/* Interactive Study Progress Sub-banner */}
                {(() => {
                  const totalCards = revisionDeckData.flashcards?.length || 0;
                  const masteredCount = Object.keys(masteredCards).filter(k => masteredCards[k]).length;
                  const masteryPercentage = totalCards > 0 ? Math.round((masteredCount / totalCards) * 100) : 0;

                  return (
                    <div className="bg-[#fefce8] border-b border-amber-200/40 px-4 py-1.5 sm:px-6 sm:py-2.5 shrink-0 flex items-center justify-between gap-3 text-left">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                        <p className="text-[10px] sm:text-[11px] text-amber-900 font-bold truncate leading-none">
                          <strong className="hidden sm:inline">Cherry Ma'am's Pro-Tip: </strong>
                          <span className="hidden sm:inline">Flip flashcards for active recall & explore mind maps!</span>
                          <span className="inline sm:hidden">🍒 Revision Mode Active</span>
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-[9.5px] sm:text-[11px] font-extrabold text-amber-900 leading-none">
                            {masteredCount}/{totalCards} Mastered ({masteryPercentage}%)
                          </p>
                        </div>
                        <div className="w-16 sm:w-24 bg-amber-100 h-1.5 rounded-full overflow-hidden border border-amber-300/20">
                          <div 
                            className="bg-amber-500 h-full rounded-full transition-all duration-500 shadow-xs"
                            style={{ width: `${masteryPercentage}%` }}
                          />
                        </div>
                        {masteryPercentage === 100 && totalCards > 0 && (
                          <span className="bg-emerald-600 text-white text-[8px] sm:text-[9px] font-black tracking-wider uppercase py-0.5 px-1.5 rounded-sm animate-bounce hidden xs:inline-block">
                            🏆 Ready
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Sub-navigation & Layout Controllers with Hindi labels */}
                <div className="bg-white border-b border-slate-200/50 px-3 py-1.5 sm:py-2.5 shrink-0 flex items-center justify-center">
                  {/* Tab Swappers */}
                  <div className="flex bg-slate-100 p-1 rounded-xl sm:rounded-2xl w-full max-w-xl border border-slate-200/40 shadow-2xs">
                    <button
                      onClick={() => setActiveRevisionTab("flashcards")}
                      className={`flex-1 py-1.5 sm:py-2 px-2 sm:px-4 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black tracking-wider uppercase transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer ${
                        activeRevisionTab === "flashcards"
                          ? "bg-teal-800 text-white shadow-md shadow-teal-900/20"
                          : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
                      }`}
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Interactive Cards</span>
                      <span className="text-[8px] opacity-75 font-normal tracking-normal capitalize font-mono hidden xs:inline">
                        (फ्लैशकार्ड्स)
                      </span>
                    </button>
                    <button
                      onClick={() => setActiveRevisionTab("mindmap")}
                      className={`flex-1 py-1.5 sm:py-2 px-2 sm:px-4 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black tracking-wider uppercase transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer ${
                        activeRevisionTab === "mindmap"
                          ? "bg-teal-800 text-white shadow-md shadow-teal-900/20"
                          : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
                      }`}
                    >
                      <Brain className="w-3.5 h-3.5" />
                      <span>Concept Mind Map</span>
                      <span className="text-[8px] opacity-75 font-normal tracking-normal capitalize font-mono hidden xs:inline">
                        (माइंड मैप)
                      </span>
                    </button>
                  </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-slate-50">
                  
                  {/* Left Column: Interactive Flashcards */}
                  {activeRevisionTab === "flashcards" && (
                    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 md:p-8 pb-24 sm:pb-8 flex flex-col justify-between overflow-y-auto min-h-0 bg-white flex-1 md:rounded-3xl md:shadow-md md:border md:border-slate-100/60 md:my-4">
                      <div className="space-y-6 flex-1 flex flex-col justify-between">
                        <div className="flex items-center justify-between shrink-0">
                          <h4 className="text-xs uppercase font-mono tracking-widest font-black text-slate-500 flex items-center gap-1.5">
                            <HelpCircle className="w-4 h-4 text-teal-700" /> Interactive Flashcards
                          </h4>
                          <span className="text-[10px] font-mono font-black tracking-widest text-slate-600 bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded-lg shadow-2xs">
                            CARD {currentFlashcardIndex + 1} OF {revisionDeckData.flashcards?.length || 0}
                          </span>
                        </div>

                        {/* Ruled index card & chalkboard flashcard animation */}
                        {revisionDeckData.flashcards && revisionDeckData.flashcards.length > 0 ? (
                          (() => {
                            const currentCard = revisionDeckData.flashcards[currentFlashcardIndex];
                            const cardId = currentCard.id || String(currentFlashcardIndex);
                            const isMastered = !!masteredCards[cardId];

                            return (
                              <div className="space-y-6 flex-1 flex flex-col justify-center">
                                <div 
                                  onClick={() => setIsFlashcardFlipped(!isFlashcardFlipped)}
                                  className="w-full max-w-4xl mx-auto h-[22rem] sm:h-[28rem] md:h-[32rem] lg:h-[35rem] cursor-pointer [perspective:1000px] select-none relative group"
                                >
                                  <div className={`relative w-full h-full duration-500 [transform-style:preserve-3d] ${isFlashcardFlipped ? "[transform:rotateY(180deg)]" : ""}`}>
                                    
                                    {/* Card Front: Ruled school notebook style */}
                                    <div className="absolute inset-0 w-full h-full bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 pb-4 sm:pb-6 flex flex-col justify-between shadow-md hover:shadow-lg hover:border-slate-300 transition-all [backface-visibility:hidden] overflow-hidden [background-image:linear-gradient(#f1f5f9_1px,transparent_1px)] [background-size:100%_2rem]">
                                      {/* Mini clipboard metal clip */}
                                      <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-20 h-4 bg-slate-200 rounded-b-md border-x border-b border-slate-300/80 z-20 shadow-2xs flex items-center justify-center">
                                        <div className="w-10 h-1 bg-slate-400 rounded-full" />
                                      </div>

                                      {/* Pink margin index line */}
                                      <div className="absolute left-10 sm:left-12 top-0 bottom-0 w-[1.5px] bg-rose-300/60" />

                                      {/* Front Header Details */}
                                      <div className="flex items-center justify-between z-10 pl-8 sm:pl-12 shrink-0 mt-2">
                                        <span className="bg-teal-50 text-teal-800 border border-teal-100 text-[8.5px] font-mono font-black uppercase px-2.5 py-0.5 rounded-md tracking-wider flex items-center gap-1">
                                          ❓ ACTIVE RECALL
                                        </span>
                                        {isMastered && (
                                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[8px] font-mono font-black uppercase px-2 py-0.5 rounded-full tracking-wider">
                                            ✓ MASTERED
                                          </span>
                                        )}
                                      </div>

                                      {/* Question Body */}
                                      <div className="text-center my-auto py-2 z-10 pl-8 sm:pl-12 overflow-y-auto max-h-[70%] scrollbar-none">
                                        <div className="bg-amber-100/60 text-amber-900 border border-amber-200/30 text-[9.5px] sm:text-[11px] font-mono font-black uppercase px-2.5 py-1 rounded-md tracking-wider inline-block mb-3 sm:mb-4">
                                          Concept: {currentCard.conceptTested || "General Review"}
                                        </div>
                                        <p className="text-base sm:text-xl md:text-2xl lg:text-3xl font-extrabold text-slate-800 leading-snug tracking-tight px-2 sm:px-6">
                                          {currentCard.question}
                                        </p>
                                      </div>

                                      {/* Bottom indicator */}
                                      <div className="text-center pt-2 border-t border-dashed border-slate-100 z-10 pl-8 sm:pl-12 shrink-0">
                                        <p className="text-[10px] sm:text-xs font-bold text-[#4c8491] animate-pulse flex items-center justify-center gap-1.5">
                                          <RefreshCw className="w-3.5 h-3.5 animate-spin-slow text-teal-600" /> Tap card to flip & reveal answer
                                        </p>
                                      </div>
                                    </div>

                                    {/* Card Back: Slate Chalkboard style */}
                                    <div className="absolute inset-0 w-full h-full bg-[#0d2220] text-white rounded-2xl p-6 sm:p-8 pb-4 sm:pb-6 flex flex-col justify-between shadow-2xl [backface-visibility:hidden] [transform:rotateY(180deg)] overflow-hidden">
                                      {/* Realistic blackboard wooden frame shadow border */}
                                      <div className="absolute inset-0 border-[8px] border-[#8b5a2b] rounded-2xl pointer-events-none z-20 shadow-inner" />
                                      {/* Inner chalkboard chalk line border */}
                                      <div className="absolute inset-2.5 border border-dashed border-teal-500/20 rounded-lg pointer-events-none z-10" />

                                      {/* Back Header */}
                                      <div className="flex items-center justify-between z-10 shrink-0 px-4 mt-2">
                                        <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[9.5px] sm:text-[11px] font-mono font-black uppercase px-2.5 py-1 rounded-md tracking-wider">
                                          CHERRY MA'AM'S LESSON ANSWER
                                        </span>
                                        <span className="text-[9px] sm:text-[10px] font-mono text-emerald-300/80">
                                          Double-tap to flip back
                                        </span>
                                      </div>

                                      {/* Answer content (Scrollable if too long) */}
                                      <div className="text-left my-auto py-4 px-4 overflow-y-auto max-h-[70%] scrollbar-thin scrollbar-thumb-amber-400/20 scrollbar-track-transparent pr-1 z-10">
                                        <div className="text-sm sm:text-base md:text-lg lg:text-xl font-extrabold text-teal-50 leading-relaxed space-y-3">
                                          {renderTextWithKaTeX(currentCard.answer)}
                                        </div>
                                      </div>

                                      {/* Card back action layout */}
                                      <div 
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex items-center justify-center gap-3 pt-3 sm:pt-4 border-t border-dashed border-[#1c4e49] shrink-0 z-30 px-4"
                                      >
                                        <button
                                          onClick={() => toggleCardMastery(cardId)}
                                          className={`py-2 px-5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                                            isMastered 
                                              ? "bg-slate-700/60 hover:bg-slate-700 text-slate-200 border border-slate-600/30" 
                                              : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs active:scale-95"
                                          }`}
                                        >
                                          {isMastered ? "⏳ Mark as review later" : "✅ Mark as Mastered!"}
                                        </button>
                                      </div>
                                    </div>

                                  </div>
                                </div>

                                {/* Tactile Navigation Controls */}
                                <div className="flex items-center justify-between pt-4 max-w-4xl mx-auto w-full shrink-0">
                                  <button
                                    disabled={currentFlashcardIndex === 0}
                                    onClick={() => {
                                      setCurrentFlashcardIndex(prev => prev - 1);
                                      setIsFlashcardFlipped(false);
                                    }}
                                    className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer active:scale-95 shadow-2xs"
                                  >
                                    <ChevronLeft className="w-4 h-4 stroke-[3]" /> Prev
                                  </button>

                                  <button
                                    onClick={() => setIsFlashcardFlipped(!isFlashcardFlipped)}
                                    className="px-6 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95"
                                  >
                                    <RefreshCw className="w-4 h-4" /> Flip Card
                                  </button>

                                  <button
                                    disabled={currentFlashcardIndex === totalCards - 1}
                                    onClick={() => {
                                      setCurrentFlashcardIndex(prev => prev + 1);
                                      setIsFlashcardFlipped(false);
                                    }}
                                    className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer active:scale-95 shadow-2xs"
                                  >
                                    Next <ChevronRight className="w-4 h-4 stroke-[3]" />
                                  </button>
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <div className="bg-white border rounded-2xl p-12 text-center text-slate-400 text-xs shadow-2xs flex-1 flex items-center justify-center">
                            No flashcards available.
                          </div>
                        )}
                      </div>
                      
                      <div className="pt-4 border-t border-slate-200 mt-6 text-center shrink-0">
                        <p className="text-[9.5px] font-mono text-slate-400 font-black tracking-wider uppercase">
                          Active recall helps translate whiteboard explanations into exam success.
                        </p>
                      </div>
                    </div>
                  )}

                  {activeRevisionTab === "mindmap" && (
                    <div className="w-full max-w-4xl mx-auto p-3 sm:p-5 md:p-6 flex flex-col overflow-hidden min-h-0 bg-white flex-1 md:rounded-3xl md:shadow-md md:border md:border-slate-100/60 md:my-4">
                      {/* Top Action Header */}
                      <div className="border-b border-slate-150 pb-3 mb-4 shrink-0 flex flex-col text-left">
                        <div className="flex flex-col">
                          <h4 className="text-xs uppercase font-mono tracking-widest font-black text-slate-500 flex items-center gap-1.5">
                            <Brain className="w-4 h-4 text-teal-800 animate-pulse" /> CONCEPT RECALL MIND MAP
                          </h4>
                          <p className="text-[10.5px] text-slate-400 font-extrabold mt-0.5 uppercase tracking-wide">
                            {revisionDeckData.mindMap?.title || "Classroom Conceptual Flow Diagram"}
                          </p>
                        </div>
                      </div>

                      {/* MODE 1: INTERACTIVE MAP GRAPH VIEW */}
                      <div className="flex-1 flex flex-col overflow-hidden min-h-0 text-left animate-fade-in">
                          
                          {/* Instructions Header with Fullscreen & Download Trigger */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3 bg-teal-50/50 border border-teal-100/30 px-3.5 py-2 rounded-xl shrink-0">
                            <p className="text-[10.5px] text-teal-900 font-bold flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-teal-500 animate-ping shrink-0" />
                              <span>Tap any node branch to review details instantly.</span>
                            </p>
                            
                            <div className="flex items-center gap-1.5 self-end sm:self-auto flex-wrap">
                              {/* Download PNG Button */}
                              <button
                                onClick={() => handleDownloadMindMap("png")}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 text-[9.5px] font-mono font-black rounded-lg shadow-xs flex items-center gap-1 transition-all cursor-pointer hover:scale-102 active:scale-95"
                                title="Download Mind Map as Image (PNG)"
                              >
                                <Download className="w-3 h-3" /> PNG
                              </button>

                              {/* Download SVG Button */}
                              <button
                                onClick={() => handleDownloadMindMap("svg")}
                                className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white text-[9.5px] font-mono font-black rounded-lg shadow-xs flex items-center gap-1 transition-all cursor-pointer hover:scale-102 active:scale-95"
                                title="Download Mind Map as Vector Graphic (SVG)"
                              >
                                <HardDriveDownload className="w-3 h-3" /> SVG
                              </button>

                              <button
                                onClick={() => {
                                  setIsMapFullscreen(true);
                                  if (lastSelectedNodeId === null) {
                                    setLastSelectedNodeId(0);
                                    setExpandedNodes({ 0: true });
                                  }
                                }}
                                className="px-2.5 py-1 bg-teal-800 hover:bg-teal-950 text-white text-[9.5px] font-mono font-black rounded-lg shadow-xs flex items-center gap-1.5 transition-all cursor-pointer hover:scale-102"
                              >
                                <Maximize2 className="w-3 h-3" /> FULLSCREEN
                              </button>
                            </div>
                          </div>

                          {/* Map Slate Container */}
                          <div 
                            onClick={() => setSelectedSubNode(null)}
                            className={`border-2 rounded-2xl p-2 sm:p-4 mb-4 relative overflow-visible select-none shrink-0 transition-all duration-300 ${
                              mindMapStyle === "pastel" 
                                ? "bg-[#FAF6F0] border-[#e5dcd0] shadow-[inset_0_2px_8px_rgba(0,0,0,0.01)]" 
                                : "bg-[#051e22] border-teal-950/40 shadow-inner"
                            }`}
                          >
                            {/* Backdrop grid elements */}
                            <div 
                              className={`absolute inset-0 [background-size:16px_16px] pointer-events-none transition-all duration-300 ${
                                mindMapStyle === "pastel"
                                  ? "bg-[radial-gradient(#e5dcd0_1.2px,transparent_1.2px)] opacity-60"
                                  : "bg-[radial-gradient(#1e3b3a_1px,transparent_1px)] opacity-20"
                              }`} 
                            />
                            
                            <svg 
                              id="mindmap-svg"
                              viewBox="0 0 800 420" 
                              width="100%" 
                              className="w-full h-auto max-h-[220px] sm:max-h-[300px] md:max-h-[380px] select-none overflow-visible"
                            >
                              <defs>
                                <filter id="glow-selected" x="-20%" y="-20%" width="140%" height="140%">
                                  <feGaussianBlur stdDeviation="4" result="blur" />
                                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                </filter>
                                <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                                  <feDropShadow 
                                    dx="0" 
                                    dy={mindMapStyle === "pastel" ? "3" : "4"} 
                                    stdDeviation={mindMapStyle === "pastel" ? "2" : "3"} 
                                    floodOpacity={mindMapStyle === "pastel" ? "0.08" : "0.4"} 
                                  />
                                </filter>
                                <linearGradient id="centerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                  <stop offset="0%" stopColor={mindMapStyle === "pastel" ? "#b4a4eb" : "#1e5156"} />
                                  <stop offset="100%" stopColor={mindMapStyle === "pastel" ? "#9f86f0" : "#0a2c30"} />
                                </linearGradient>
                                <linearGradient id="selectedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                  <stop offset="0%" stopColor="#0d9488" />
                                  <stop offset="100%" stopColor="#0f766e" />
                                </linearGradient>
                                <linearGradient id="nodeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                  <stop offset="0%" stopColor="#115e59" />
                                  <stop offset="100%" stopColor="#134e4a" />
                                </linearGradient>
                                <marker 
                                  id="arrow-head" 
                                  viewBox="0 0 10 10" 
                                  refX="8" 
                                  refY="5" 
                                  markerWidth="5" 
                                  markerHeight="5" 
                                  orient="auto-start-reverse"
                                >
                                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={mindMapStyle === "pastel" ? "#4b5563" : "#2dd4bf"} />
                                </marker>
                              </defs>

                              {/* 1. Connecting curves from center (400, 210) to nodes */}
                              {(() => {
                                const nodes = revisionDeckData.mindMap?.nodes || [];
                                const N = nodes.length || 1;
                                const center = { x: 400, y: 210 };
                                const rx = 245;
                                const ry = 135;

                                return nodes.map((node: any, index: number) => {
                                  const angle = (2 * Math.PI * index) / N - Math.PI / 2;
                                  const targetX = center.x + rx * Math.cos(angle);
                                  const targetY = center.y + ry * Math.sin(angle);

                                  const isSelected = lastSelectedNodeId === index;
                                  const isMatched = (() => {
                                    if (!mindMapSearch.trim()) return false;
                                    const queryText = mindMapSearch.toLowerCase();
                                    return (
                                      node.topicName?.toLowerCase().includes(queryText) ||
                                      node.keyFormula?.toLowerCase().includes(queryText) ||
                                      (node.keyConcepts || node.coreConcepts || []).some((c: string) => c.toLowerCase().includes(queryText))
                                    );
                                  })();

                                  const cx1 = center.x + (targetX - center.x) * 0.45;
                                  const cy1 = center.y;
                                  const cx2 = center.x + (targetX - center.x) * 0.55;
                                  const cy2 = targetY;

                                  const pathD = `M ${center.x} ${center.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${targetX} ${targetY}`;
                                  const pTheme = getPastelTheme(index);

                                  return (
                                    <g key={`path-${index}`} className="pointer-events-none">
                                      {isSelected && (
                                        <path 
                                          d={pathD} 
                                          fill="none" 
                                          stroke={mindMapStyle === "pastel" ? pTheme.stroke : "#fbbf24"} 
                                          strokeWidth="7" 
                                          opacity={mindMapStyle === "pastel" ? "0.15" : "0.35"} 
                                          strokeLinecap="round"
                                          className="animate-pulse"
                                        />
                                      )}
                                      <path 
                                        d={pathD} 
                                        fill="none" 
                                        stroke={
                                          mindMapStyle === "pastel"
                                            ? (isSelected ? pTheme.stroke : isMatched ? "#10b981" : "#4b5563")
                                            : (isSelected ? "#fbbf24" : isMatched ? "#2dd4bf" : "#114c47")
                                        } 
                                        strokeWidth={isSelected ? "2.5" : isMatched ? "2" : "1.5"} 
                                        strokeDasharray={
                                          mindMapStyle === "pastel" 
                                            ? "none" 
                                            : (isMatched || isSelected ? "none" : "5 4")
                                        }
                                        markerEnd={mindMapStyle === "pastel" ? "url(#arrow-head)" : undefined}
                                        className="transition-all duration-300"
                                        strokeLinecap="round"
                                      />
                                      {isSelected && (
                                        <circle 
                                          cx={targetX} 
                                          cy={targetY} 
                                          r="12" 
                                          fill="none" 
                                          stroke={mindMapStyle === "pastel" ? pTheme.stroke : "#fbbf24"} 
                                          strokeWidth="1.5" 
                                          className="animate-ping" 
                                          opacity="0.6"
                                        />
                                      )}
                                    </g>
                                  );
                                });
                              })()}

                              {/* 2. Central Hub Bubble */}
                              <g filter="url(#shadow)" className="cursor-pointer" onClick={(e) => {
                                e.stopPropagation();
                                setLastSelectedNodeId(0);
                                setExpandedNodes({ 0: true });
                                setSelectedSubNode(null);
                              }}>
                                <rect 
                                  x="290" 
                                  y="175" 
                                  width="220" 
                                  height="70" 
                                  rx="20" 
                                  ry="20" 
                                  fill="url(#centerGrad)" 
                                  stroke={mindMapStyle === "pastel" ? "#7c3aed" : "#0d9488"} 
                                  strokeWidth="2.5" 
                                  className="hover:stroke-teal-400 transition-all duration-300 active:scale-98"
                                />
                                <rect 
                                  x="355" 
                                  y="165" 
                                  width="90" 
                                  height="18" 
                                  rx="6" 
                                  ry="6" 
                                  fill={mindMapStyle === "pastel" ? "#ffca28" : "#f59e0b"} 
                                />
                                <text 
                                  x="400" 
                                  y="177" 
                                  textAnchor="middle" 
                                  fill={mindMapStyle === "pastel" ? "#3e2723" : "#0f172a"} 
                                  fontSize="8" 
                                  fontWeight="900" 
                                  letterSpacing="1"
                                  className="font-mono uppercase select-none"
                                >
                                  CORE SUBJECT
                                </text>
                                <text 
                                  x="400" 
                                  y="205" 
                                  textAnchor="middle" 
                                  fill="#ffffff" 
                                  fontSize="12" 
                                  fontWeight="800" 
                                  className="font-sans tracking-wide uppercase select-none"
                                >
                                  {activeRevisionSession.subject || subject}
                                </text>
                                <text 
                                  x="400" 
                                  y="224" 
                                  textAnchor="middle" 
                                  fill={mindMapStyle === "pastel" ? "#fdfaf6" : "#99f6e4"} 
                                  fontSize="9" 
                                  fontWeight="700" 
                                  className="font-mono uppercase tracking-widest select-none opacity-90"
                                >
                                  CONCEPT HUB • CL {grade}
                                </text>
                              </g>

                              {/* 3. Branch Concept Capsules */}
                              {(() => {
                                const nodes = revisionDeckData.mindMap?.nodes || [];
                                const N = nodes.length || 1;
                                const center = { x: 400, y: 210 };
                                const rx = 245;
                                const ry = 135;

                                return nodes.map((node: any, index: number) => {
                                  const angle = (2 * Math.PI * index) / N - Math.PI / 2;
                                  const targetX = center.x + rx * Math.cos(angle);
                                  const targetY = center.y + ry * Math.sin(angle);

                                  const isSelected = lastSelectedNodeId === index;
                                  const isMatched = (() => {
                                    if (!mindMapSearch.trim()) return false;
                                    const queryText = mindMapSearch.toLowerCase();
                                    return (
                                      node.topicName?.toLowerCase().includes(queryText) ||
                                      node.keyFormula?.toLowerCase().includes(queryText) ||
                                      (node.keyConcepts || node.coreConcepts || []).some((c: string) => c.toLowerCase().includes(queryText))
                                    );
                                  })();

                                  const capW = 164;
                                  const capH = 48;
                                  const capX = targetX - capW / 2;
                                  const capY = targetY - capH / 2;

                                  const maxLen = 18;
                                  const rawName = node.topicName || "General Topic";
                                  const dispName = rawName.length > maxLen ? rawName.slice(0, maxLen - 2) + "..." : rawName;
                                  const pTheme = getPastelTheme(index);

                                  return (
                                    <g 
                                      key={`node-${index}`} 
                                      filter="url(#shadow)" 
                                      className="cursor-pointer group select-none"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setLastSelectedNodeId(index);
                                        setExpandedNodes({ [index]: true });
                                        setSelectedSubNode(null);
                                      }}
                                    >
                                      {/* Outer border highlight */}
                                      <rect 
                                        x={capX - (isSelected ? 3 : 1)} 
                                        y={capY - (isSelected ? 3 : 1)} 
                                        width={capW + (isSelected ? 6 : 2)} 
                                        height={capH + (isSelected ? 6 : 2)} 
                                        rx="14" 
                                        ry="14" 
                                        fill="none" 
                                        stroke={
                                          mindMapStyle === "pastel"
                                            ? (isSelected ? pTheme.stroke : isMatched ? "#10b981" : "transparent")
                                            : (isSelected ? "#fbbf24" : isMatched ? "#2dd4bf" : "transparent")
                                        } 
                                        strokeWidth={isSelected ? "3" : isMatched ? "2" : "0"} 
                                        opacity={isSelected ? "1" : isMatched ? "0.85" : "0"}
                                        className="transition-all duration-300"
                                      />

                                      {/* Core node capsule */}
                                      <rect 
                                        x={capX} 
                                        y={capY} 
                                        width={capW} 
                                        height={capH} 
                                        rx="12" 
                                        ry="12" 
                                        fill={
                                          mindMapStyle === "pastel"
                                            ? pTheme.fill
                                            : (isSelected ? "url(#selectedGrad)" : "url(#nodeGrad)")
                                        } 
                                        stroke={
                                          mindMapStyle === "pastel"
                                            ? (isSelected ? "#7c3aed" : isMatched ? "#059669" : pTheme.stroke)
                                            : (isSelected ? "#f59e0b" : isMatched ? "#0f766e" : "#0d3c38")
                                        } 
                                        strokeWidth={mindMapStyle === "pastel" ? "1.8" : "1.5"} 
                                        className="transition-all duration-300 group-hover:stroke-teal-400 group-active:scale-98"
                                      />

                                      {/* Index Circle Indicator */}
                                      <circle 
                                        cx={capX + 16} 
                                        cy={targetY} 
                                        r="8.5" 
                                        fill={
                                          mindMapStyle === "pastel"
                                            ? pTheme.stroke
                                            : (isSelected ? "#115e59" : "#0d3d39")
                                        } 
                                        stroke={
                                          mindMapStyle === "pastel"
                                            ? pTheme.text
                                            : (isSelected ? "#fbbf24" : "#0d9488")
                                        }
                                        strokeWidth="1"
                                      />
                                      <text 
                                        x={capX + 16} 
                                        y={targetY + 3} 
                                        textAnchor="middle" 
                                        fill={
                                          mindMapStyle === "pastel"
                                            ? "#ffffff"
                                            : (isSelected ? "#fbbf24" : "#2dd4bf")
                                        } 
                                        fontSize="8" 
                                        fontWeight="900" 
                                        className="font-mono select-none"
                                      >
                                        {index + 1}
                                      </text>

                                      {/* Main Text Label */}
                                      <text 
                                        x={capX + 32} 
                                        y={targetY + 3} 
                                        fill={mindMapStyle === "pastel" ? pTheme.text : "#ffffff"} 
                                        fontSize="9.5" 
                                        fontWeight="900" 
                                        className="font-sans uppercase tracking-wide select-none group-hover:opacity-80 transition-colors"
                                      >
                                        {dispName}
                                      </text>

                                      {/* Mini Item Counter badge */}
                                      <g transform={`translate(${capX + capW - 24}, ${targetY - 6.5})`}>
                                        <rect 
                                          width="16" 
                                          height="13" 
                                          rx="4" 
                                          ry="4" 
                                          fill={
                                            mindMapStyle === "pastel"
                                              ? pTheme.stroke
                                              : (isSelected ? "#0d534f" : "#114c47")
                                          } 
                                          opacity={mindMapStyle === "pastel" ? "0.15" : "1"}
                                        />
                                        <text 
                                          x="8" 
                                          y="9" 
                                          textAnchor="middle" 
                                          fill={mindMapStyle === "pastel" ? pTheme.text : "#ffffff"} 
                                          fontSize="7.5" 
                                          fontWeight="bold" 
                                          className="font-mono"
                                        >
                                          {getSubItems(node).length}
                                        </text>
                                      </g>
                                    </g>
                                  );
                                });
                              })()}

                              {/* 4. Sub-branch nodes for the selected parent node */}
                              {(() => {
                                if (lastSelectedNodeId === null) return null;
                                const parentNode = revisionDeckData.mindMap?.nodes?.[lastSelectedNodeId];
                                if (!parentNode) return null;

                                const nodes = revisionDeckData.mindMap?.nodes || [];
                                const N = nodes.length || 1;
                                const center = { x: 400, y: 210 };
                                const rx = 245;
                                const ry = 135;

                                const angle = (2 * Math.PI * lastSelectedNodeId) / N - Math.PI / 2;
                                const targetX = center.x + rx * Math.cos(angle);
                                const targetY = center.y + ry * Math.sin(angle);

                                const subItems = getSubItems(parentNode);
                                const K = subItems.length;
                                if (K === 0) return null;

                                const spread = K <= 1 ? 0 : Math.min(Math.PI * 0.75, (K - 1) * 0.38);
                                const startAngle = angle - spread / 2;

                                const pTheme = getPastelTheme(lastSelectedNodeId);
                                const subTheme = getSubNodePastelTheme(lastSelectedNodeId);

                                return subItems.map((subItem: any, i: number) => {
                                  const subAngle = K <= 1 ? angle : startAngle + (i * spread) / (K - 1);
                                  const subDist = 80;
                                  const subX = targetX + subDist * Math.cos(subAngle);
                                  const subY = targetY + subDist * Math.sin(subAngle);

                                  const subW = 114;
                                  const subH = 28;
                                  const subX_rect = subX - subW / 2;
                                  const subY_rect = subY - subH / 2;

                                  const isSubSelected = selectedSubNode?.nodeId === lastSelectedNodeId && selectedSubNode?.subIdx === i;

                                  return (
                                    <g 
                                      key={`sub-${lastSelectedNodeId}-${i}`}
                                      className="cursor-pointer group select-none animate-fade-in"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedSubNode({ nodeId: lastSelectedNodeId, subIdx: i });
                                      }}
                                    >
                                      {/* Connector Line */}
                                      <line
                                        x1={targetX}
                                        y1={targetY}
                                        x2={subX}
                                        y2={subY}
                                        stroke={
                                          mindMapStyle === "pastel"
                                            ? pTheme.stroke
                                            : (isSubSelected ? "#fbbf24" : "#2dd4bf")
                                        }
                                        strokeWidth={
                                          mindMapStyle === "pastel"
                                            ? "1.5"
                                            : (isSubSelected ? "2" : "1.2")
                                        }
                                        strokeDasharray={
                                          mindMapStyle === "pastel"
                                            ? "none"
                                            : (isSubSelected ? "none" : "3 2")
                                        }
                                        markerEnd={mindMapStyle === "pastel" ? "url(#arrow-head)" : undefined}
                                        opacity="0.8"
                                      />
                                      
                                      {/* Sub-node bubble */}
                                      <rect
                                        x={subX_rect}
                                        y={subY_rect}
                                        width={subW}
                                        height={subH}
                                        rx="8"
                                        ry="8"
                                        fill={
                                          mindMapStyle === "pastel"
                                            ? (isSubSelected ? "#ffca28" : subTheme.fill)
                                            : (isSubSelected ? "#fbbf24" : "#0f3a40")
                                        }
                                        stroke={
                                          mindMapStyle === "pastel"
                                            ? (isSubSelected ? "#d97706" : subTheme.stroke)
                                            : (isSubSelected ? "#d97706" : subItem.type === "formula" ? "#f59e0b" : subItem.type === "tip" ? "#34d399" : "#38bdf8")
                                        }
                                        strokeWidth={isSubSelected ? "2" : "1.5"}
                                        className="transition-all duration-300 group-hover:scale-105"
                                      />
                                      
                                      {/* Label */}
                                      <text
                                        x={subX}
                                        y={subY + 3.5}
                                        textAnchor="middle"
                                        fill={
                                          mindMapStyle === "pastel"
                                            ? (isSubSelected ? "#431407" : subTheme.text)
                                            : (isSubSelected ? "#0f172a" : "#e2e8f0")
                                        }
                                        fontSize="7.5"
                                        fontWeight="900"
                                        className="font-mono tracking-wider select-none uppercase"
                                      >
                                        {subItem.label}
                                      </text>
                                    </g>
                                  );
                                });
                              })()}
                            </svg>

                            {/* Floating Custom HTML Tooltip / Popover inside the board */}
                            {selectedSubNode && (() => {
                              const nodeIdx = selectedSubNode.nodeId;
                              const subIdx = selectedSubNode.subIdx;
                              const activeNode = revisionDeckData.mindMap?.nodes?.[nodeIdx];
                              if (!activeNode) return null;
                              
                              const subItems = getSubItems(activeNode);
                              const subItem = subItems[subIdx];
                              if (!subItem) return null;
                              
                              const N = revisionDeckData.mindMap?.nodes?.length || 1;
                              const center = { x: 400, y: 210 };
                              const rx = 245;
                              const ry = 135;
                              
                              const angle = (2 * Math.PI * nodeIdx) / N - Math.PI / 2;
                              const targetX = center.x + rx * Math.cos(angle);
                              const targetY = center.y + ry * Math.sin(angle);
                              
                              const K = subItems.length;
                              const spread = K <= 1 ? 0 : Math.min(Math.PI * 0.75, (K - 1) * 0.38);
                              const startAngle = angle - spread / 2;
                              const subAngle = K <= 1 ? angle : startAngle + (subIdx * spread) / (K - 1);
                              
                              const subDist = 80;
                              const subX = targetX + subDist * Math.cos(subAngle);
                              const subY = targetY + subDist * Math.sin(subAngle);
                              
                              const leftPercent = (subX / 800) * 100;
                              const topPercent = (subY / 420) * 100;
                              
                              const xOffset = subX > 400 ? -260 : 20;
                              const yOffset = subY > 210 ? -120 : 10;
                              
                              return (
                                <div 
                                  className={`absolute border rounded-2xl p-4 shadow-2xl z-40 w-64 text-left animate-fade-in backdrop-blur-md pointer-events-auto transition-all ${
                                    mindMapStyle === "pastel"
                                      ? "bg-white/95 border-slate-250/60 text-slate-800"
                                      : "bg-slate-900/95 border-teal-500/30 text-white"
                                  }`}
                                  style={{
                                    left: `calc(${leftPercent}% + ${xOffset}px)`,
                                    top: `calc(${topPercent}% + ${yOffset}px)`,
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className={`flex items-center justify-between border-b pb-1.5 mb-2 shrink-0 ${
                                    mindMapStyle === "pastel" ? "border-slate-100" : "border-teal-800/40"
                                  }`}>
                                    <span className={`text-[9px] font-mono font-black uppercase tracking-widest flex items-center gap-1 ${
                                      mindMapStyle === "pastel" ? "text-indigo-600" : "text-amber-400"
                                    }`}>
                                      {subItem.type === "formula" ? "📐 RULE / FORMULA" : subItem.type === "tip" ? "💡 EXAM TIP" : "🧠 KEY CONCEPT"}
                                    </span>
                                    <button 
                                      onClick={() => setSelectedSubNode(null)}
                                      className={`font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                        mindMapStyle === "pastel"
                                          ? "text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200"
                                          : "text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800"
                                      }`}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  <div className={`text-[11px] sm:text-xs font-semibold leading-relaxed overflow-y-auto max-h-40 scrollbar-thin ${
                                    mindMapStyle === "pastel" ? "text-slate-700" : "text-teal-50"
                                  }`}>
                                    {renderTextWithKaTeX(subItem.text)}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                        </div>



                      {/* Small Bottom Info Disclaimer */}
                      <div className="pt-3 border-t border-slate-100 mt-4 shrink-0 text-center">
                        <p className="text-[9.5px] font-mono text-slate-400 font-bold">
                          Concept map parsed dynamically from Direct Classroom parameters
                        </p>
                      </div>
                    </div>
                  )}

                  {/* IMMERSIVE FULLSCREEN MODE BACKDROP PORTAL OVERLAY */}
                  {activeRevisionTab === "mindmap" && isMapFullscreen && (
                    <div 
                      onClick={() => setSelectedSubNode(null)}
                      className={`fixed inset-0 z-50 flex flex-col overflow-hidden animate-fade-in text-left transition-all duration-300 ${
                        mindMapStyle === "pastel"
                          ? "bg-[#FAF6F0] text-slate-800"
                          : "bg-[#031316] text-white"
                      }`}
                    >
                      
                      {/* Interactive Diagram chalkboard panel */}
                      <div className="flex-1 flex flex-col min-w-0 h-full relative">
                        {/* Chalkboard Slate Grid */}
                        <div 
                          className={`absolute inset-0 [background-size:24px_24px] pointer-events-none transition-all duration-300 ${
                            mindMapStyle === "pastel"
                              ? "bg-[radial-gradient(#e5dcd0_1.5px,transparent_1.5px)] opacity-60"
                              : "bg-[radial-gradient(#1e3b3a_1.2px,transparent_1.2px)] opacity-25"
                          }`}
                        />
                        
                        {/* Fullscreen Overlay Header */}
                        <div className={`p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 z-10 shrink-0 ${
                          mindMapStyle === "pastel"
                            ? "bg-[#FAF6F0]/95 border-[#e5dcd0]"
                            : "bg-[#041a1e]/95 border-teal-950/80"
                        }`}>
                          <div className="flex items-center gap-2.5">
                            <span className="p-2 bg-amber-500 text-slate-900 rounded-xl">
                              <Brain className="w-4 h-4 animate-pulse" />
                            </span>
                            <div>
                              <h3 className={`text-xs sm:text-sm font-mono font-black tracking-widest uppercase ${
                                mindMapStyle === "pastel" ? "text-indigo-700" : "text-amber-400"
                              }`}>
                                IMMERSIVE CONCEPTUAL FLOW BOARD
                              </h3>
                              <p className={`text-[10px] font-semibold uppercase tracking-wide ${
                                mindMapStyle === "pastel" ? "text-slate-600" : "text-teal-100/70"
                              }`}>
                                {activeRevisionSession.subject || subject} • Class {grade}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Theme Toggle Button in Fullscreen Header */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setMindMapStyle(prev => prev === "slate" ? "pastel" : "slate");
                              }}
                              className={`px-3 py-2 rounded-xl text-xs font-mono font-black flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-md ${
                                mindMapStyle === "pastel"
                                  ? "bg-slate-200 hover:bg-slate-300 text-slate-800"
                                  : "bg-teal-900/80 hover:bg-teal-800 text-teal-200"
                              }`}
                            >
                              🎨 THEME: {mindMapStyle === "pastel" ? "PASTEL (LIGHT)" : "DARK SLATE"}
                            </button>

                            {/* Download PNG Button */}
                            <button
                              onClick={() => handleDownloadMindMap("png")}
                              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-mono font-black flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-md"
                              title="Download Mind Map as Image (PNG)"
                            >
                              <Download className="w-3.5 h-3.5" /> DOWNLOAD PNG
                            </button>

                            {/* Download SVG Button */}
                            <button
                              onClick={() => handleDownloadMindMap("svg")}
                              className="px-3 py-2 bg-teal-800 hover:bg-teal-750 text-teal-100 border border-teal-700/50 rounded-xl text-xs font-mono font-black flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-md"
                              title="Download Mind Map as Vector Graphic (SVG)"
                            >
                              <HardDriveDownload className="w-3.5 h-3.5" /> SVG
                            </button>

                            <button
                              onClick={() => setIsMapFullscreen(false)}
                              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white border border-rose-500/30 rounded-xl text-xs font-mono font-black flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-md"
                            >
                              <Minimize2 className="w-3.5 h-3.5" /> EXIT FULLSCREEN
                            </button>
                          </div>
                        </div>

                        {/* Interactive Large SVG Viewport */}
                        <div className="flex-1 flex items-center justify-center p-4 overflow-auto min-h-0 select-none">
                          <svg 
                            id="mindmap-fullscreen-svg"
                            viewBox="0 0 800 420" 
                            width="100%" 
                            className="w-full max-w-4xl h-auto select-none overflow-visible"
                          >
                            <defs>
                              <filter id="glow-selected" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="4" result="blur" />
                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                              </filter>
                              <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                                <feDropShadow 
                                  dx="0" 
                                  dy={mindMapStyle === "pastel" ? "3" : "4"} 
                                  stdDeviation={mindMapStyle === "pastel" ? "2" : "3"} 
                                  floodOpacity={mindMapStyle === "pastel" ? "0.08" : "0.4"} 
                                />
                              </filter>
                              <linearGradient id="centerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor={mindMapStyle === "pastel" ? "#b4a4eb" : "#1e5156"} />
                                <stop offset="100%" stopColor={mindMapStyle === "pastel" ? "#9f86f0" : "#0a2c30"} />
                              </linearGradient>
                              <linearGradient id="selectedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#0d9488" />
                                <stop offset="100%" stopColor="#0f766e" />
                              </linearGradient>
                              <linearGradient id="nodeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#115e59" />
                                <stop offset="100%" stopColor="#134e4a" />
                              </linearGradient>
                              <marker 
                                id="arrow-head" 
                                viewBox="0 0 10 10" 
                                refX="8" 
                                refY="5" 
                                markerWidth="5" 
                                markerHeight="5" 
                                orient="auto-start-reverse"
                              >
                                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={mindMapStyle === "pastel" ? "#4b5563" : "#2dd4bf"} />
                              </marker>
                            </defs>

                            {/* 1. Curved lines */}
                            {(() => {
                              const nodes = revisionDeckData.mindMap?.nodes || [];
                              const N = nodes.length || 1;
                              const center = { x: 400, y: 210 };
                              const rx = 245;
                              const ry = 135;

                              return nodes.map((node: any, index: number) => {
                                const angle = (2 * Math.PI * index) / N - Math.PI / 2;
                                const targetX = center.x + rx * Math.cos(angle);
                                const targetY = center.y + ry * Math.sin(angle);

                                const isSelected = lastSelectedNodeId === index;
                                const isMatched = (() => {
                                  if (!mindMapSearch.trim()) return false;
                                  const queryText = mindMapSearch.toLowerCase();
                                  return (
                                    node.topicName?.toLowerCase().includes(queryText) ||
                                    node.keyFormula?.toLowerCase().includes(queryText) ||
                                    (node.keyConcepts || node.coreConcepts || []).some((c: string) => c.toLowerCase().includes(queryText))
                                  );
                                })();

                                const cx1 = center.x + (targetX - center.x) * 0.45;
                                  const cy1 = center.y;
                                  const cx2 = center.x + (targetX - center.x) * 0.55;
                                  const cy2 = targetY;

                                  const pathD = `M ${center.x} ${center.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${targetX} ${targetY}`;
                                  const pTheme = getPastelTheme(index);

                                return (
                                  <g key={`fs-path-${index}`} className="pointer-events-none">
                                    {isSelected && (
                                      <path 
                                        d={pathD} 
                                        fill="none" 
                                        stroke={mindMapStyle === "pastel" ? pTheme.stroke : "#fbbf24"} 
                                        strokeWidth="7" 
                                        opacity={mindMapStyle === "pastel" ? "0.15" : "0.35"} 
                                        strokeLinecap="round"
                                        className="animate-pulse"
                                      />
                                    )}
                                    <path 
                                      d={pathD} 
                                      fill="none" 
                                      stroke={
                                        mindMapStyle === "pastel"
                                          ? (isSelected ? pTheme.stroke : isMatched ? "#10b981" : "#4b5563")
                                          : (isSelected ? "#fbbf24" : isMatched ? "#2dd4bf" : "#114c47")
                                      } 
                                      strokeWidth={isSelected ? "2.5" : isMatched ? "2" : "1.5"} 
                                      strokeDasharray={
                                        mindMapStyle === "pastel" 
                                          ? "none" 
                                          : (isMatched || isSelected ? "none" : "5 4")
                                      }
                                      markerEnd={mindMapStyle === "pastel" ? "url(#arrow-head)" : undefined}
                                      className="transition-all duration-300"
                                      strokeLinecap="round"
                                    />
                                    {isSelected && (
                                      <circle 
                                        cx={targetX} 
                                        cy={targetY} 
                                        r="12" 
                                        fill="none" 
                                        stroke={mindMapStyle === "pastel" ? pTheme.stroke : "#fbbf24"} 
                                        strokeWidth="1.5" 
                                        className="animate-ping" 
                                        opacity="0.6"
                                      />
                                    )}
                                  </g>
                                );
                              });
                            })()}

                            {/* 2. Central Hub bubble */}
                            <g filter="url(#shadow)" className="cursor-pointer" onClick={(e) => {
                              e.stopPropagation();
                              setLastSelectedNodeId(0);
                              setExpandedNodes({ 0: true });
                              setSelectedSubNode(null);
                            }}>
                              <rect 
                                x="290" 
                                y="175" 
                                width="220" 
                                height="70" 
                                rx="20" 
                                ry="20" 
                                fill="url(#centerGrad)" 
                                stroke={mindMapStyle === "pastel" ? "#7c3aed" : "#0d9488"} 
                                strokeWidth="2.5" 
                              />
                              <rect 
                                x="355" 
                                y="165" 
                                width="90" 
                                height="18" 
                                rx="6" 
                                ry="6" 
                                fill={mindMapStyle === "pastel" ? "#ffca28" : "#f59e0b"} 
                              />
                              <text 
                                x="400" 
                                y="177" 
                                textAnchor="middle" 
                                fill={mindMapStyle === "pastel" ? "#3e2723" : "#0f172a"} 
                                fontSize="8" 
                                fontWeight="900" 
                                letterSpacing="1"
                                className="font-mono uppercase select-none"
                              >
                                CORE SUBJECT
                              </text>
                              <text 
                                x="400" 
                                y="205" 
                                textAnchor="middle" 
                                fill="#ffffff" 
                                fontSize="12" 
                                fontWeight="800" 
                                className="font-sans tracking-wide uppercase select-none"
                              >
                                {activeRevisionSession.subject || subject}
                              </text>
                              <text 
                                x="400" 
                                y="224" 
                                textAnchor="middle" 
                                fill={mindMapStyle === "pastel" ? "#fdfaf6" : "#99f6e4"} 
                                fontSize="9" 
                                fontWeight="700" 
                                className="font-mono uppercase tracking-widest select-none opacity-90"
                              >
                                CONCEPT HUB • CL {grade}
                              </text>
                            </g>

                            {/* 3. Capsules */}
                            {(() => {
                              const nodes = revisionDeckData.mindMap?.nodes || [];
                              const N = nodes.length || 1;
                              const center = { x: 400, y: 210 };
                              const rx = 245;
                              const ry = 135;

                              return nodes.map((node: any, index: number) => {
                                const angle = (2 * Math.PI * index) / N - Math.PI / 2;
                                const targetX = center.x + rx * Math.cos(angle);
                                const targetY = center.y + ry * Math.sin(angle);

                                const isSelected = lastSelectedNodeId === index;
                                const isMatched = (() => {
                                  if (!mindMapSearch.trim()) return false;
                                  const queryText = mindMapSearch.toLowerCase();
                                  return (
                                    node.topicName?.toLowerCase().includes(queryText) ||
                                    node.keyFormula?.toLowerCase().includes(queryText) ||
                                    (node.keyConcepts || node.coreConcepts || []).some((c: string) => c.toLowerCase().includes(queryText))
                                  );
                                })();

                                const capW = 164;
                                const capH = 48;
                                const capX = targetX - capW / 2;
                                const capY = targetY - capH / 2;

                                const maxLen = 18;
                                const rawName = node.topicName || "General Topic";
                                const dispName = rawName.length > maxLen ? rawName.slice(0, maxLen - 2) + "..." : rawName;
                                const pTheme = getPastelTheme(index);

                                return (
                                  <g 
                                    key={`fs-node-${index}`} 
                                    filter="url(#shadow)" 
                                    className="cursor-pointer group select-none"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setLastSelectedNodeId(index);
                                      setExpandedNodes({ [index]: true });
                                      setSelectedSubNode(null);
                                    }}
                                  >
                                    <rect 
                                      x={capX - (isSelected ? 3 : 1)} 
                                      y={capY - (isSelected ? 3 : 1)} 
                                      width={capW + (isSelected ? 6 : 2)} 
                                      height={capH + (isSelected ? 6 : 2)} 
                                      rx="14" 
                                      ry="14" 
                                      fill="none" 
                                      stroke={
                                        mindMapStyle === "pastel"
                                          ? (isSelected ? pTheme.stroke : isMatched ? "#10b981" : "transparent")
                                          : (isSelected ? "#fbbf24" : isMatched ? "#2dd4bf" : "transparent")
                                      } 
                                      strokeWidth={isSelected ? "3" : isMatched ? "2" : "0"} 
                                      opacity={isSelected ? "1" : isMatched ? "0.85" : "0"}
                                      className="transition-all duration-300"
                                    />
                                    <rect 
                                      x={capX} 
                                      y={capY} 
                                      width={capW} 
                                      height={capH} 
                                      rx="12" 
                                      ry="12" 
                                      fill={
                                        mindMapStyle === "pastel"
                                          ? pTheme.fill
                                          : (isSelected ? "url(#selectedGrad)" : "url(#nodeGrad)")
                                      } 
                                      stroke={
                                        mindMapStyle === "pastel"
                                          ? (isSelected ? "#7c3aed" : isMatched ? "#059669" : pTheme.stroke)
                                          : (isSelected ? "#f59e0b" : isMatched ? "#0f766e" : "#0d3c38")
                                      } 
                                      strokeWidth={mindMapStyle === "pastel" ? "1.8" : "1.5"} 
                                      className="transition-all duration-300 group-hover:stroke-teal-400 group-active:scale-98"
                                    />
                                    <circle 
                                      cx={capX + 16} 
                                      cy={targetY} 
                                      r="8.5" 
                                      fill={
                                        mindMapStyle === "pastel"
                                          ? pTheme.stroke
                                          : (isSelected ? "#115e59" : "#0d3d39")
                                      } 
                                      stroke={
                                        mindMapStyle === "pastel"
                                          ? pTheme.text
                                          : (isSelected ? "#fbbf24" : "#0d9488")
                                      }
                                      strokeWidth="1"
                                    />
                                    <text 
                                      x={capX + 16} 
                                      y={targetY + 3} 
                                      textAnchor="middle" 
                                      fill={
                                        mindMapStyle === "pastel"
                                          ? "#ffffff"
                                          : (isSelected ? "#fbbf24" : "#2dd4bf")
                                      } 
                                      fontSize="8" 
                                      fontWeight="900" 
                                      className="font-mono select-none"
                                    >
                                      {index + 1}
                                    </text>
                                    <text 
                                      x={capX + 32} 
                                      y={targetY + 3} 
                                      fill={mindMapStyle === "pastel" ? pTheme.text : "#ffffff"} 
                                      fontSize="9.5" 
                                      fontWeight="900" 
                                      className="font-sans uppercase tracking-wide select-none group-hover:opacity-80 transition-colors"
                                    >
                                      {dispName}
                                    </text>
                                    <g transform={`translate(${capX + capW - 24}, ${targetY - 6.5})`}>
                                      <rect 
                                        width="16" 
                                        height="13" 
                                        rx="4" 
                                        ry="4" 
                                        fill={
                                          mindMapStyle === "pastel"
                                            ? pTheme.stroke
                                            : (isSelected ? "#0d534f" : "#114c47")
                                        } 
                                        opacity={mindMapStyle === "pastel" ? "0.15" : "1"}
                                      />
                                      <text 
                                        x="8" 
                                        y="9" 
                                        textAnchor="middle" 
                                        fill={mindMapStyle === "pastel" ? pTheme.text : "#ffffff"} 
                                        fontSize="7.5" 
                                        fontWeight="bold" 
                                        className="font-mono"
                                      >
                                        {getSubItems(node).length}
                                      </text>
                                    </g>
                                  </g>
                                );
                              });
                            })()}

                            {/* 4. Sub-branch nodes for the selected parent node in fullscreen */}
                            {(() => {
                              if (lastSelectedNodeId === null) return null;
                              const parentNode = revisionDeckData.mindMap?.nodes?.[lastSelectedNodeId];
                              if (!parentNode) return null;

                              const nodes = revisionDeckData.mindMap?.nodes || [];
                              const N = nodes.length || 1;
                              const center = { x: 400, y: 210 };
                              const rx = 245;
                              const ry = 135;

                              const angle = (2 * Math.PI * lastSelectedNodeId) / N - Math.PI / 2;
                              const targetX = center.x + rx * Math.cos(angle);
                              const targetY = center.y + ry * Math.sin(angle);

                              const subItems = getSubItems(parentNode);
                              const K = subItems.length;
                              if (K === 0) return null;

                              const spread = K <= 1 ? 0 : Math.min(Math.PI * 0.75, (K - 1) * 0.38);
                              const startAngle = angle - spread / 2;

                              const pTheme = getPastelTheme(lastSelectedNodeId);
                              const subTheme = getSubNodePastelTheme(lastSelectedNodeId);

                              return subItems.map((subItem: any, i: number) => {
                                const subAngle = K <= 1 ? angle : startAngle + (i * spread) / (K - 1);
                                const subDist = 80;
                                const subX = targetX + subDist * Math.cos(subAngle);
                                const subY = targetY + subDist * Math.sin(subAngle);

                                const subW = 114;
                                const subH = 28;
                                const subX_rect = subX - subW / 2;
                                const subY_rect = subY - subH / 2;

                                const isSubSelected = selectedSubNode?.nodeId === lastSelectedNodeId && selectedSubNode?.subIdx === i;

                                return (
                                  <g 
                                    key={`fs-sub-${lastSelectedNodeId}-${i}`}
                                    className="cursor-pointer group select-none animate-fade-in"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedSubNode({ nodeId: lastSelectedNodeId, subIdx: i });
                                    }}
                                  >
                                    {/* Connector Line */}
                                    <line
                                      x1={targetX}
                                      y1={targetY}
                                      x2={subX}
                                      y2={subY}
                                      stroke={
                                        mindMapStyle === "pastel"
                                          ? pTheme.stroke
                                          : (isSubSelected ? "#fbbf24" : "#2dd4bf")
                                      }
                                      strokeWidth={
                                        mindMapStyle === "pastel"
                                          ? "1.5"
                                          : (isSubSelected ? "2" : "1.2")
                                      }
                                      strokeDasharray={
                                        mindMapStyle === "pastel"
                                          ? "none"
                                          : (isSubSelected ? "none" : "3 2")
                                      }
                                      markerEnd={mindMapStyle === "pastel" ? "url(#arrow-head)" : undefined}
                                      opacity="0.8"
                                    />
                                    
                                    {/* Sub-node bubble */}
                                    <rect
                                      x={subX_rect}
                                      y={subY_rect}
                                      width={subW}
                                      height={subH}
                                      rx="8"
                                      ry="8"
                                      fill={
                                        mindMapStyle === "pastel"
                                          ? (isSubSelected ? "#ffca28" : subTheme.fill)
                                          : (isSubSelected ? "#fbbf24" : "#0f3a40")
                                      }
                                      stroke={
                                        mindMapStyle === "pastel"
                                          ? (isSubSelected ? "#d97706" : subTheme.stroke)
                                          : (isSubSelected ? "#d97706" : subItem.type === "formula" ? "#f59e0b" : subItem.type === "tip" ? "#34d399" : "#38bdf8")
                                      }
                                      strokeWidth={isSubSelected ? "2" : "1.5"}
                                      className="transition-all duration-300 group-hover:scale-105"
                                    />
                                    
                                    {/* Label */}
                                    <text
                                      x={subX}
                                      y={subY + 3.5}
                                      textAnchor="middle"
                                      fill={
                                        mindMapStyle === "pastel"
                                          ? (isSubSelected ? "#431407" : subTheme.text)
                                          : (isSubSelected ? "#0f172a" : "#e2e8f0")
                                      }
                                      fontSize="7.5"
                                      fontWeight="900"
                                      className="font-mono tracking-wider select-none uppercase"
                                    >
                                      {subItem.label}
                                    </text>
                                  </g>
                                );
                              });
                            })()}
                          </svg>
                        </div>

                        {/* Interactive Hint */}
                        <div className={`absolute bottom-4 left-1/2 transform -translate-x-1/2 border px-4 py-1.5 rounded-full flex items-center gap-2 shadow-lg shrink-0 select-none z-10 pointer-events-none ${
                          mindMapStyle === "pastel"
                            ? "bg-white/95 border-slate-200"
                            : "bg-slate-950/80 backdrop-blur-xs border-teal-500/20"
                        }`}>
                          <span className={`w-2 h-2 rounded-full animate-pulse ${
                            mindMapStyle === "pastel" ? "bg-indigo-600" : "bg-teal-400"
                          }`} />
                          <p className={`text-[10px] font-mono font-bold uppercase tracking-wider ${
                            mindMapStyle === "pastel" ? "text-indigo-900" : "text-teal-300"
                          }`}>
                            TAP BRANCH CAPSULES ABOVE TO REVEAL KEY DETAIL METADATA INSTANTLY
                          </p>
                        </div>

                        {/* Floating Custom HTML Tooltip / Popover inside fullscreen board */}
                        {selectedSubNode && (() => {
                          const nodeIdx = selectedSubNode.nodeId;
                          const subIdx = selectedSubNode.subIdx;
                          const activeNode = revisionDeckData.mindMap?.nodes?.[nodeIdx];
                          if (!activeNode) return null;
                          
                          const subItems = getSubItems(activeNode);
                          const subItem = subItems[subIdx];
                          if (!subItem) return null;
                          
                          const N = revisionDeckData.mindMap?.nodes?.length || 1;
                          const center = { x: 400, y: 210 };
                          const rx = 245;
                          const ry = 135;
                          
                          const angle = (2 * Math.PI * nodeIdx) / N - Math.PI / 2;
                          const targetX = center.x + rx * Math.cos(angle);
                          const targetY = center.y + ry * Math.sin(angle);
                          
                          const K = subItems.length;
                          const spread = K <= 1 ? 0 : Math.min(Math.PI * 0.75, (K - 1) * 0.38);
                          const startAngle = angle - spread / 2;
                          const subAngle = K <= 1 ? angle : startAngle + (subIdx * spread) / (K - 1);
                          
                          const subDist = 80;
                          const subX = targetX + subDist * Math.cos(subAngle);
                          const subY = targetY + subDist * Math.sin(subAngle);
                          
                          const leftPercent = (subX / 800) * 100;
                          const topPercent = (subY / 420) * 100;
                          
                          const xOffset = subX > 400 ? -260 : 20;
                          const yOffset = subY > 210 ? -120 : 10;
                          
                          return (
                            <div 
                              className={`absolute border rounded-2xl p-4 shadow-2xl z-40 w-64 text-left animate-fade-in backdrop-blur-md pointer-events-auto transition-all ${
                                mindMapStyle === "pastel"
                                  ? "bg-white/95 border-slate-250/60 text-slate-800"
                                  : "bg-slate-900/95 border-teal-500/30 text-white"
                              }`}
                              style={{
                                left: `calc(${leftPercent}% + ${xOffset}px)`,
                                top: `calc(${topPercent}% + ${yOffset}px)`,
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className={`flex items-center justify-between border-b pb-1.5 mb-2 shrink-0 ${
                                mindMapStyle === "pastel" ? "border-slate-100" : "border-teal-800/40"
                              }`}>
                                <span className={`text-[9px] font-mono font-black uppercase tracking-widest flex items-center gap-1 ${
                                  mindMapStyle === "pastel" ? "text-indigo-600" : "text-amber-400"
                                }`}>
                                  {subItem.type === "formula" ? "📐 RULE / FORMULA" : subItem.type === "tip" ? "💡 EXAM TIP" : "🧠 KEY CONCEPT"}
                                </span>
                                <button 
                                  onClick={() => setSelectedSubNode(null)}
                                  className={`font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                    mindMapStyle === "pastel"
                                      ? "text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200"
                                      : "text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800"
                                  }`}
                                >
                                  ✕
                                </button>
                              </div>
                              <div className={`text-[11px] sm:text-xs font-semibold leading-relaxed overflow-y-auto max-h-40 scrollbar-thin ${
                                mindMapStyle === "pastel" ? "text-slate-700" : "text-teal-50"
                              }`}>
                                {renderTextWithKaTeX(subItem.text)}
                              </div>
                            </div>
                          );
                        })()}

                      </div>
                    </div>
                  )}

                </div>

                {/* Footer of Revision Center */}
                <div className="bg-slate-50 border-t border-slate-200/60 p-4 shrink-0 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400 font-black tracking-wider uppercase">
                    Cherry Ma'am Study Companion v2.5
                  </span>
                  <button 
                    onClick={handleCloseRevisionDeck}
                    className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer active:scale-95 shadow-2xs"
                  >
                    Close Deck
                  </button>
                </div>

              </div>
            ) : null}
          </div>
        )}

        {/* Kiara Live Voice Counselor Modal */}
        <KiaraLiveVoiceModal
          isOpen={isKiaraVoiceModalOpen}
          onClose={() => setIsKiaraVoiceModalOpen(false)}
          studentName={studentName}
          grade={grade}
          board={board}
          subject={subject}
          lowestMetric={lowestMetric}
          performanceData={{
            conceptClarity: dashboardStats.conceptClarity,
            theoreticalCore: dashboardStats.theoreticalCore,
            calculationPrecision: dashboardStats.calculationPrecision,
            formulaRecall: dashboardStats.formulaRecall,
            socraticStamina: dashboardStats.socraticStamina,
            strengths: dashboardStats.strengths,
            growths: dashboardStats.growths,
            totalQuizzes: quizAttempts?.length || 0,
            classesCompleted: pastSessions?.length || 0,
            snapshotsSaved: snapshots?.length || 0,
            lowestMetric: lowestMetric,
          }}
        />

      </div>
    </div>
  );
};
