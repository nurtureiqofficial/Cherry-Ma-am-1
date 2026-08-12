import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Mic, MicOff, Power, Sparkles, ExternalLink, RefreshCw, Volume2, Info, Palette, HelpCircle, Flame, Trash2, Terminal, GraduationCap, BookOpen, Upload, FileText, User, ArrowLeft, CheckCircle, ChevronRight, LogOut, Download, Library, Youtube, Video, Brain, XCircle, Maximize2, Minimize2, Home } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useLiveSession } from "./hooks/useLiveSession";
import { useBlackboardRecorder } from "./hooks/useBlackboardRecorder";
import html2canvas from "html2canvas";
import { compressImageIfPossible } from "./utils/imageCompressor";
import WaveVisualizer from "./components/WaveVisualizer";
import { THEME_CONFIGS, ThemeType } from "./types";
import { MathRenderer } from "./components/MathRenderer";
import { ClassroomBoard } from "./components/ClassroomBoard";
import { StudentAccountHub } from "./components/StudentAccountHub";
import { StudentOnboardingForm } from "./components/StudentOnboardingForm";
import { AnimatedChalkboardGraph } from "./components/AnimatedChalkboardGraph";
import { ConciergeAssistant } from "./components/ConciergeAssistant";
import { QuickQuizView } from "./components/QuickQuizView";
import { SyllabusDeskModern } from "./components/SyllabusDeskModern";
import { LearnerProfileModal } from "./components/LearnerProfileModal";
import { QuickDoubtWidget } from "./components/QuickDoubtWidget";
import AmbientFocusAudio from "./components/AmbientFocusAudio";
import katex from "katex";
import { triggerCelebrationConfetti } from "./utils/confetti";
import { smartMergeWhiteboardNotes } from "./utils/boardFilter";

// Firebase and Firestore integration
import { 
  db, 
  auth, 
  googleProvider, 
  OperationType, 
  handleFirestoreError 
} from "./lib/firebase";
import { 
  signInWithPopup, 
  signInAnonymously, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from "firebase/auth";
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc,
  collection, 
  addDoc,
  query, 
  where, 
  getDocs, 
  orderBy,
  serverTimestamp
} from "firebase/firestore";

interface Toast {
  id: string;
  message: string;
  type: "info" | "success" | "error";
}

/**
 * Extract YouTube Video ID from standard, mobile, shorts, or embed URLs
 */
export function extractYoutubeId(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Direct 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Regex matching watch, shorts, live, embed, v, youtu.be, mobile URLs, query params
  const match = trimmed.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (match && match[1] && match[1].length === 11) {
    return match[1];
  }

  return null;
}

export default function App() {
  const [theme, setTheme] = useState<ThemeType>("cherry");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showTips, setShowTips] = useState(false);
  const [showCaptions, setShowCaptions] = useState(false);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<"board" | "document">("board");
  const [isFullScreenBoard, setIsFullScreenBoard] = useState(false);
  
  // Custom screen state routing: home state -> syllabus configuration -> immersive classroom whiteboard
  const [currentScreen, setCurrentScreen] = useState<"home" | "syllabus" | "classroom">("home");
  const [studentDetails, setStudentDetails] = useState<{ name: string; grade: string; subject: string; board?: string; mediumOfLearning?: string }>({
    name: "",
    grade: "Class 10",
    subject: "Mathematics",
    board: "CBSE",
    mediumOfLearning: "Hinglish"
  });

  // --- Firebase integration states ---
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pastSessions, setPastSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [showStudentAccountHub, setShowStudentAccountHub] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  // Document-driven teaching system states
  const [activeDocument, setActiveDocument] = useState<{ filename: string; mimeType: string; markdown: string; mode?: string; detectedSubject?: string } | null>(null);
  const [uploadMode, setUploadMode] = useState<"explain" | "mistake" | "homework">("explain");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedButWaitingWakeup, setUploadedButWaitingWakeup] = useState(false);
  const [activeTopicIndex, setActiveTopicIndex] = useState(0);
  const [customBoardContent, setCustomBoardContent] = useState("");
  const [topicBoardsContent, setTopicBoardsContent] = useState<Record<number, string>>({});
  const [sessionSnapshots, setSessionSnapshots] = useState<any[]>([]);
  const sessionSnapshottedTopics = useRef<Set<string>>(new Set());

  // YouTube Course Explanation states
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isYoutubeLoading, setIsYoutubeLoading] = useState(false);
  const [isYtPlayerExpanded, setIsYtPlayerExpanded] = useState(true);
  const [showMobileYtPlayer, setShowMobileYtPlayer] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<"mic" | "topics" | "doubt" | "quiz">("quiz");
  const [isQuizFullScreenOpen, setIsQuizFullScreenOpen] = useState(false);
  const [isLearnerProfileModalOpen, setIsLearnerProfileModalOpen] = useState(false);

  // Parse markdown content into distinct sequential slides or topics
  const topics = useMemo(() => {
    if (!activeDocument?.markdown) return [];
    
    const raw = activeDocument.markdown;
    const lines = raw.split("\n");
    const parsedTopics: string[] = [];
    let currentBlock = "";
    
    let hasHeaders = false;
    for (const line of lines) {
      if (line.trim().startsWith("#")) {
        hasHeaders = true;
        break;
      }
    }
    
    if (hasHeaders) {
      for (const line of lines) {
        if (line.trim().startsWith("#")) {
          if (currentBlock.trim()) {
            parsedTopics.push(currentBlock.trim());
          }
          currentBlock = line + "\n";
        } else {
          currentBlock += line + "\n";
        }
      }
      if (currentBlock.trim()) {
        parsedTopics.push(currentBlock.trim());
      }
    } else {
      // Split by empty paragraphs
      const sections = raw.split(/\n\s*\n+/);
      for (const sec of sections) {
        if (sec.trim()) {
          parsedTopics.push(sec.trim());
        }
      }
    }
    
    return parsedTopics;
  }, [activeDocument]);

  // Sync active syllabus document on mount with auto-retry
  useEffect(() => {
    let active = true;
    const fetchWithRetry = (retries = 5, delay = 800) => {
      fetch("/api/active-document")
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP error: ${res.status}`);
          }
          return res.text();
        })
        .then((text) => {
          if (text.trim().startsWith("{")) {
            return JSON.parse(text);
          }
          throw new Error("Invalid json response payload format");
        })
        .then((data) => {
          if (!active) return;
          if (data && data.activeDocument) {
            setActiveDocument(data.activeDocument);
            setActiveTopicIndex(0);
          }
        })
        .catch((err) => {
          if (!active) return;
          if (retries > 0) {
            console.warn(`[Client] Fetch active document failed, retrying in ${delay}ms... (${retries} attempts left)`);
            setTimeout(() => {
              fetchWithRetry(retries - 1, delay * 1.5);
            }, delay);
          } else {
            console.error("Error fetching active document on load after retries:", err);
          }
        });
    };

    fetchWithRetry();

    return () => {
      active = false;
    };
  }, []);

  // Synchronize activeDocument and sessionId to the server when they change
  useEffect(() => {
    const syncDoc = async () => {
      try {
        await fetch("/api/active-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionId || "default",
            activeDocument
          })
        });
      } catch (err) {
        console.warn("Failed to sync activeDocument to server:", err);
      }
    };
    syncDoc();
  }, [activeDocument, sessionId]);

  // Subtitle history and autoscroll ASR components
  const [dialogueHistory, setDialogueHistory] = useState<Array<{ id: string; sender: "user" | "cherry"; text: string }>>([]);
  const [typedInput, setTypedInput] = useState("");
  const subtitlesScrollRef = useRef<HTMLDivElement | null>(null);
  const portraitTranscriptScrollRef = useRef<HTMLDivElement | null>(null);

  // Trigger floating notifications
  const addToast = useCallback((message: string, type: "info" | "success" | "error") => {
    const id = Math.random().toString(36).substring(3);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // --- Firebase integration logic helpers ---

  const loadPastSessions = useCallback(async (uid: string) => {
    setSessionsLoading(true);
    // Safe guard: if the user is a local guest or not authenticated in Firebase, bypass Firestore entirely to prevent permission denied errors
    if (!auth.currentUser || uid === "local_guest_student" || uid.startsWith("local_")) {
      const cached = localStorage.getItem(`pastSessions_${uid}`);
      if (cached) {
        try {
          const sessions = JSON.parse(cached);
          setPastSessions(sessions);
        } catch (_) {}
      } else {
        setPastSessions([]);
      }
      setSessionsLoading(false);
      return;
    }

    try {
      const q = query(
        collection(db, "classSessions"),
        where("userId", "==", uid),
        orderBy("updatedAt", "desc")
      );
      const snapshot = await getDocs(q);
      const sessions = snapshot.docs.map(d => d.data());
      setPastSessions(sessions);
      localStorage.setItem(`pastSessions_${uid}`, JSON.stringify(sessions));
    } catch (error: any) {
      const isPermissionDenied = error.code === "permission-denied" || 
        (error.message && (
          error.message.includes("permission-denied") || 
          error.message.includes("permission") || 
          error.message.includes("Permissions")
        ));
      
      if (isPermissionDenied) {
        handleFirestoreError(error, OperationType.LIST, "classSessions");
      }

      console.error("Error loading past sessions, falling back to local storage:", error);
      const cached = localStorage.getItem(`pastSessions_${uid}`);
      if (cached) {
        try {
          const sessions = JSON.parse(cached);
          setPastSessions(sessions);
          addToast("Loaded study activities from local cache! 🏛️📱", "info");
        } catch (_) {}
      }
    } finally {
      setSessionsLoading(false);
    }
  }, [addToast]);

  // Listen for Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      let activeUser = firebaseUser;
      
      // Check if we have a locally active mock guest session
      if (!activeUser) {
        const cachedLocalUserStr = localStorage.getItem("local_active_user");
        if (cachedLocalUserStr) {
          try {
            activeUser = JSON.parse(cachedLocalUserStr);
          } catch (_) {}
        }
      }

      setUser(activeUser);
      setAuthLoading(false);
      
      if (activeUser) {
        try {
          const profileRef = doc(db, "studentProfiles", activeUser.uid);
          let profileSnap;
          try {
            if (activeUser.uid === "local_guest_student" || activeUser.uid.startsWith("local_")) {
              throw new Error("Local guest user bypassed database fetch");
            }
            profileSnap = await getDoc(profileRef);
          } catch (dbErr: any) {
            console.warn("Could not load profile from Firestore: student is offline/backend unreachable.", dbErr);
            const cachedProfile = localStorage.getItem(`studentProfile_${activeUser.uid}`);
            if (cachedProfile) {
              const data = JSON.parse(cachedProfile);
              setStudentDetails({
                name: data.name || "",
                grade: data.grade || "Class 10",
                subject: data.subject || "Mathematics",
                board: data.board || "CBSE",
                mediumOfLearning: data.mediumOfLearning || "Hinglish"
              });
              addToast(`Restored local profile ${data.name}! 🎒✨`, "info");
              setCurrentScreen("syllabus");
              setShowLoginModal(false);
            } else {
              setStudentDetails((prev) => ({
                ...prev,
                name: activeUser!.displayName || prev.name || "Student",
                board: "CBSE",
                mediumOfLearning: "Hinglish"
              }));
              setCurrentScreen("syllabus");
              setShowLoginModal(false);
            }
            loadPastSessions(activeUser.uid);
            return;
          }

          if (profileSnap.exists()) {
            const data = profileSnap.data();
            const profileData = {
              name: data.name || "",
              grade: data.grade || "Class 10",
              subject: data.subject || "Mathematics",
              board: data.board || "CBSE",
              mediumOfLearning: data.mediumOfLearning || "Hinglish"
            };
            setStudentDetails(profileData);
            localStorage.setItem(`studentProfile_${firebaseUser.uid}`, JSON.stringify(profileData));
            addToast(`Cloud profile restored for ${data.name}! ☁️✨`, "success");
            setCurrentScreen("syllabus");
            setShowLoginModal(false);
          } else {
            if (firebaseUser.displayName) {
              setStudentDetails((prev) => ({
                ...prev,
                name: firebaseUser.displayName || prev.name,
                board: "CBSE",
                mediumOfLearning: "Hinglish"
              }));
            }
            // Trigger onboarding flow for first-time Google sign-ins (ignores anonymous guest users)
            if (!firebaseUser.isAnonymous) {
              setShowOnboarding(true);
              setShowLoginModal(false);
            }
          }
          loadPastSessions(firebaseUser.uid);
        } catch (error) {
          console.error("Error loading student profile:", error);
        }
      } else {
        setPastSessions([]);
      }
    });

    return () => unsubscribe();
  }, [addToast, loadPastSessions]);

  const handleOnboardingSubmit = async (data: { name: string; grade: string; board: string; mediumOfLearning: string }) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("No authenticated student session found.");
    }

    try {
      const profileData = {
        name: data.name,
        grade: data.grade,
        board: data.board,
        mediumOfLearning: data.mediumOfLearning,
        subject: studentDetails.subject || "Mathematics"
      };

      setStudentDetails(profileData);
      localStorage.setItem(`studentProfile_${currentUser.uid}`, JSON.stringify(profileData));

      setShowOnboarding(false);
      setCurrentScreen("syllabus"); 
      addToast(`Namaste, ${data.name}! Your student profile setup is complete! 🎓🎒`, "success");

      // Write to Firestore in the background
      const profileRef = doc(db, "studentProfiles", currentUser.uid);
      setDoc(profileRef, {
        userId: currentUser.uid,
        name: data.name,
        grade: data.grade,
        board: data.board,
        mediumOfLearning: data.mediumOfLearning,
        subject: studentDetails.subject || "Mathematics",
        updatedAt: serverTimestamp()
      }).then(() => {
        loadPastSessions(currentUser.uid);
      }).catch((dbErr: any) => {
        console.warn("[Onboarding] background Firestore sync issue:", dbErr);
      });
    } catch (offlineErr: any) {
      console.warn("[Onboarding] offline setup:", offlineErr);
      const offlineProfileData = {
        name: data.name,
        grade: data.grade,
        board: data.board,
        mediumOfLearning: data.mediumOfLearning,
        subject: studentDetails.subject || "Mathematics"
      };
      setStudentDetails(offlineProfileData);
      localStorage.setItem(`studentProfile_${currentUser.uid}`, JSON.stringify(offlineProfileData));
      setShowOnboarding(false);
      setCurrentScreen("syllabus");
      addToast(`Profile setup in offline/fallback mode! 🎒`, "info");
      loadPastSessions(currentUser.uid);
    }
  };

  // Google authentication triggers
  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      addToast(`Logged in successfully as ${result.user.displayName}! 🧑‍🎓✨`, "success");
    } catch (error: any) {
      addToast(`Authentication failed: ${error.message}`, "error");
    }
  };

  // Sign out triggers
  const handleSignOut = async () => {
    try {
      localStorage.removeItem("local_active_user");
      setUser(null);
      await signOut(auth);
      setStudentDetails({ name: "", grade: "Class 10", subject: "Mathematics", board: "CBSE", mediumOfLearning: "Hinglish" });
      setSessionId(null);
      setDialogueHistory([]);
      setCustomBoardContent("");
      setTopicBoardsContent({});
      addToast("Signed out successfully. Guest session cleared. 👋", "info");
    } catch (error: any) {
      addToast(`Sign-out failed: ${error.message}`, "error");
    }
  };

  // Persist Dialogue History messages to Firestore subcollection
  const syncedMessagesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentUser = auth.currentUser || user;
    if (!sessionId || !currentUser) return;
    
    // Only attempt Firestore sync for real users
    if (currentUser.uid === "local_guest_student" || currentUser.uid.startsWith("local_")) return;
    
    dialogueHistory.forEach((msg) => {
      const cacheKey = `${msg.id}_${msg.text}`;
      if (!syncedMessagesRef.current.has(cacheKey)) {
        syncedMessagesRef.current.add(cacheKey);
        
        const msgRef = doc(db, "classSessions", sessionId, "dialogueMessages", msg.id);
        setDoc(msgRef, {
          messageId: msg.id,
          sessionId: sessionId,
          sender: msg.sender,
          text: msg.text,
          timestamp: serverTimestamp()
        }).catch((err) => {
          console.warn("Dialogue message sync failure:", err);
        });
      }
    });
  }, [dialogueHistory, sessionId, user]);

  // Whiteboard drawings debounced save to cloud and local cache (highly resilient for both guest and normal users)
  useEffect(() => {
    const currentUser = auth.currentUser || user;
    if (!sessionId || !currentUser) return;
    
    const timeout = setTimeout(async () => {
      // 1. Convert numeric keys in topicBoardsContent to strings for safe Firestore/JSON storage
      const sanitizedTopicBoards: Record<string, string> = {};
      if (topicBoardsContent) {
        Object.entries(topicBoardsContent).forEach(([k, v]) => {
          sanitizedTopicBoards[String(k)] = v as string;
        });
      }

      // 2. Real-time update the current session in the pastSessions state and localStorage cache
      setPastSessions((prevSessions) => {
        const updated = prevSessions.map((sess) => {
          if (sess.sessionId === sessionId) {
            return {
              ...sess,
              customBoardContent: customBoardContent,
              topicBoardsContent: sanitizedTopicBoards,
              topics: topics,
              subject: studentDetails.subject || sess.subject,
              updatedAt: new Date().toISOString(),
            };
          }
          return sess;
        });

        const cachedKey = `pastSessions_${currentUser.uid}`;
        localStorage.setItem(cachedKey, JSON.stringify(updated));
        return updated;
      });

      // 3. For authenticated cloud users, also persist to Firestore
      if (currentUser.uid !== "local_guest_student" && !currentUser.uid.startsWith("local_")) {
        const sessionRef = doc(db, "classSessions", sessionId);
        try {
          await updateDoc(sessionRef, {
            customBoardContent: customBoardContent,
            topicBoardsContent: sanitizedTopicBoards,
            topics: topics,
            updatedAt: serverTimestamp()
          });
        } catch (dbErr) {
          console.warn("Cloud blackboard sync failed:", dbErr);
        }
      }
    }, 1500);

    return () => clearTimeout(timeout);
  }, [customBoardContent, topicBoardsContent, topics, studentDetails.subject, sessionId, user]);

  // Automatically capture the whiteboard content as a snapshot for a given topic
  const autoCaptureSnapshot = useCallback(async (topicIndex: number, boardContent: string, isManual = false) => {
    const currentUser = auth.currentUser || user;
    if (!boardContent || !boardContent.trim()) return;

    const topicContent = topics[topicIndex] || "";
    let topicTitle = `Topic ${topicIndex + 1}`;
    let topicDescription = "Interactive whiteboard mathematical derivation or chalkboard notes.";

    if (topicContent) {
      const lines = topicContent.split("\n");
      // Find the first non-empty line as a heading candidate
      for (const line of lines) {
        const trimmed = line.replace(/[#*📌$]/g, "").trim();
        if (trimmed) {
          topicTitle = trimmed;
          break;
        }
      }
      
      // Extract a short description
      let descCandidate = "";
      for (let i = 1; i < lines.length; i++) {
        const lineVal = lines[i].replace(/[#*📌$]/g, "").trim();
        if (lineVal && lineVal.length > 8) {
          descCandidate = lineVal;
          break;
        }
      }
      if (descCandidate) {
        topicDescription = descCandidate;
      }
    }

    if (topicDescription.length > 90) {
      topicDescription = topicDescription.substring(0, 87) + "...";
    }

    // Capture unique snapshots based on topic title & content length so we don't spam duplicate snapshot calls
    const key = `${topicTitle}_${boardContent.trim().length}`;
    if (!isManual && sessionSnapshottedTopics.current.has(key)) return;
    sessionSnapshottedTopics.current.add(key);

    try {
      // Using locally bundled html2canvas package

      const element = document.getElementById("chalkboard-main-slate");
      if (!element) return;

      const boardBg = THEME_CONFIGS[theme]?.primary || "#0c201a";

      const canvas = await html2canvas(element, {
        useCORS: true,
        backgroundColor: boardBg,
        scale: 1,
        scrollX: 0,
        scrollY: 0,
        logging: false
      });

      const maxW = 480;
      let w = canvas.width;
      let h = canvas.height;
      if (w > maxW) {
        h = Math.round((h * maxW) / w);
        w = maxW;
      }

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = w;
      tempCanvas.height = h;
      const ctx = tempCanvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = boardBg;
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(canvas, 0, 0, w, h);
      }

      const imgData = tempCanvas.toDataURL("image/jpeg", 0.65);
      
      const newSnapshot = {
        id: `local_snap_${Date.now()}`,
        snapshotId: `auto_snap_${Date.now()}`,
        userId: currentUser?.uid || "guest",
        topicTitle,
        description: topicDescription,
        imgData,
        timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }
      };

      // Add to local state so guests and users have immediate access during the session
      setSessionSnapshots((prev) => [newSnapshot, ...prev]);

       if (currentUser) {
        // Save locally first to be 100% resilient
        const cachedKey = `snapshots_${currentUser.uid}`;
        const cachedStr = localStorage.getItem(cachedKey);
        let localSnaps = [];
        if (cachedStr) {
          try { localSnaps = JSON.parse(cachedStr); } catch (_) {}
        }
        localSnaps = [newSnapshot, ...localSnaps];
        localStorage.setItem(cachedKey, JSON.stringify(localSnaps));

        if (currentUser.uid !== "local_guest_student" && !currentUser.uid.startsWith("local_")) {
          try {
            const snapRef = collection(db, "studentProfiles", currentUser.uid, "boardSnapshots");
            await addDoc(snapRef, {
              snapshotId: newSnapshot.snapshotId,
              userId: currentUser.uid,
              topicTitle,
              description: topicDescription,
              imgData,
              timestamp: serverTimestamp()
            });
          } catch (dbErr) {
            console.warn("Could not sync snapshot to firestore database:", dbErr);
          }
        }
      }
      
      addToast(
        isManual 
          ? `Chalkboard snapshot saved of "${topicTitle}"! 📸📘`
          : `Automatically captured whiteboard for topic: "${topicTitle}"! 📸☁️`, 
        "success"
      );
    } catch (err) {
      console.warn("Whiteboard snapshot capture failed:", err);
    }
  }, [topics, addToast, theme]);

  // Handle manual/instant save snapshots triggered by onClick handler on active Blackboard
  const handleManualSaveSnapshot = useCallback(async () => {
    if (!customBoardContent || !customBoardContent.trim()) {
      addToast("Blackboard matches an empty slate! Write something first. 📝✍️", "warning");
      return;
    }
    await autoCaptureSnapshot(activeTopicIndex, customBoardContent, true);
  }, [activeTopicIndex, customBoardContent, autoCaptureSnapshot, addToast]);

  // Automatic snapshot trigger that takes a screenshot of the blackboard 
  // after writing stabilizes (e.g., 6 seconds of inactivity)
  useEffect(() => {
    if (!customBoardContent || !customBoardContent.trim()) return;

    const delayDebounceFn = setTimeout(() => {
      autoCaptureSnapshot(activeTopicIndex, customBoardContent);
    }, 6000); // 6 seconds debounce to ensure writing has completed

    return () => clearTimeout(delayDebounceFn);
  }, [customBoardContent, activeTopicIndex, autoCaptureSnapshot]);

  const handleLoadPastSession = async (sess: any) => {
    try {
      setSessionId(sess.sessionId);
      
      setStudentDetails((prev) => ({
        ...prev,
        grade: sess.grade || prev.grade,
        subject: sess.subject || prev.subject
      }));
      setCustomBoardContent(sess.customBoardContent || "");
      
      // Restore topic-wise blackboard contents if present
      if (sess.topicBoardsContent) {
        const restoredBoards: Record<number, string> = {};
        Object.entries(sess.topicBoardsContent).forEach(([k, v]) => {
          restoredBoards[Number(k)] = v as string;
        });
        setTopicBoardsContent(restoredBoards);
      } else {
        setTopicBoardsContent({});
      }
      
      const messagesRef = collection(db, "classSessions", sess.sessionId, "dialogueMessages");
      const q = query(messagesRef, orderBy("timestamp", "asc"));
      const querySnap = await getDocs(q);
      const dialogueLogs = querySnap.docs.map(docSnap => {
        const item = docSnap.data();
        return {
          id: item.messageId,
          sender: item.sender as "user" | "cherry",
          text: item.text
        };
      });
      setDialogueHistory(dialogueLogs);
      
      if (sess.activeDocumentName) {
        addToast(`Loading syllabus file: "${sess.activeDocumentName}" from cloud session...`, "info");
        fetch("/api/active-document")
          .then((res) => {
            if (!res.ok) throw new Error("Network error");
            return res.text();
          })
          .then((text) => {
            if (text.trim().startsWith("{")) {
              return JSON.parse(text);
            }
            throw new Error("Invalid json format");
          })
          .then((data) => {
            if (data && data.activeDocument && data.activeDocument.filename === sess.activeDocumentName) {
              setActiveDocument(data.activeDocument);
            } else {
              setActiveDocument({
                 filename: sess.activeDocumentName,
                 mimeType: "text/markdown",
                 markdown: `# ${sess.subject} Study Session\nWelcome back to your saved classroom board! Here you can resume explaining equations or diagnostics with Cherry Ma'am.\n`
              });
            }
          })
          .catch(() => {
             setActiveDocument({
                filename: sess.activeDocumentName,
                mimeType: "text/markdown",
                markdown: `# ${sess.subject} Study Session\nWelcome back to your saved classroom board! Here you can resume explaining equations or diagnostics with Cherry Ma'am.\n`
             });
          });
      } else {
        setActiveDocument(null);
      }
      
      setCurrentScreen("classroom");
      addToast(`Restored cloud session successfully! ☁️🖊️`, "success");
    } catch (error: any) {
      addToast(`Could not restore cloud session: ${error.message}`, "error");
    }
  };

  const handleDeletePastSession = async (sessId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    
    try {
      await deleteDoc(doc(db, "classSessions", sessId));
      addToast("Cloud session deleted successfully! 🗑️", "success");
      loadPastSessions(currentUser.uid);
    } catch (dbErr) {
      handleFirestoreError(dbErr, OperationType.DELETE, `classSessions/${sessId}`);
    }
  };

  const handleThemeChange = useCallback((newTheme: ThemeType) => {
    const sanitized = (newTheme || "").toString().toLowerCase() as ThemeType;
    let appliedTheme: ThemeType = "cherry";
    if (THEME_CONFIGS[sanitized]) {
      appliedTheme = sanitized;
    }
    setTheme(appliedTheme);
    const themeNames: Record<ThemeType, string> = {
      cherry: "Teal Forest Cherry 🍒",
      matrix: "Digital Matrix Code 📟",
      cyber: "Neon Cyberpunk ⚡",
      sunset: "Twilight Sunset 🌅",
      slate: "Modern Graphite Slate 📓",
      ivory: "Premium Ice White 🥼"
    };
    addToast(`Blackboard theme changed to: ${themeNames[appliedTheme]}`, "success");
  }, [addToast]);

  const onNextTopicRef = useRef<() => void>();
  const onClassCompleteRef = useRef<() => void>();

  // Hook live session handlers
  const {
    state,
    userVolume,
    cherryVolume,
    userTranscript,
    cherryTranscript,
    connect,
    disconnect,
    injectPromptText,
    teachingPhase,
    micStream,
    playbackStream,
  } = useLiveSession({
    onThemeChange: handleThemeChange,
    onToast: addToast,
    onNextTopic: () => onNextTopicRef.current?.(),
    onClassComplete: () => {
      onClassCompleteRef.current?.();
      triggerCelebrationConfetti();
    },
    onTeachingPhaseChange: (phase) => {
      const phaseLabels: Record<string, string> = {
        intro: "Intro (Prichey) 🎒",
        concept: "Concept (Chalk Notes) 🖊️",
        example: "Deep Dive (Explanations) 🔍",
        doubt: "Doubts Solving (Sawal-Jawab) ❓",
        transition: "Transition Sequence 🚀",
        complete: "Class Graduation 🎉🎓"
      };
      if (phase.toLowerCase() === "complete") {
        triggerCelebrationConfetti();
      }
      addToast(`Cherry Ma'am moved to: ${phaseLabels[phase] || phase}`, "info");
    },
    onUpdateWhiteboard: (content, append) => {
      setCustomBoardContent((prev) => smartMergeWhiteboardNotes(prev, content, append));
    },
    studentName: studentDetails.name,
    grade: studentDetails.grade,
    board: studentDetails.board,
    mediumOfLearning: studentDetails.mediumOfLearning,
    subject: studentDetails.subject,
    activeTopicIndex: activeTopicIndex,
    sessionId: sessionId
  });

  const [mainCanvas, setMainCanvas] = useState<HTMLCanvasElement | null>(null);
  const [recordingsRevision, setRecordingsRevision] = useState(0);

  const { 
    isRecording, 
    recordingDuration,
    pendingRecording,
    savePendingRecording,
    discardPendingRecording,
    downloadPendingRecording,
    stopRecording
  } = useBlackboardRecorder({
    mainCanvas,
    micStream,
    playbackStream,
    isClassRunning: currentScreen === "classroom" && state !== "disconnected" && state !== "connecting" && playbackStream !== null,
    theme,
    themeConfig: THEME_CONFIGS[theme] || THEME_CONFIGS.cherry,
    studentName: studentDetails.name,
    subject: studentDetails.subject,
    lessonTitle: topics[activeTopicIndex] || "Chalk Blackboard Lesson",
    boardText: customBoardContent || (topics && topics[activeTopicIndex]) || activeDocument?.markdown || "",
    cherrySpeechText: cherryTranscript.text,
    cherryIsSpeaking: state === "speaking",
    teachingPhase: teachingPhase,
    sessionId,
    onToast: addToast,
    onRecordingSaved: () => setRecordingsRevision(prev => prev + 1),
  });

  const activeColors = THEME_CONFIGS[theme] || THEME_CONFIGS.cherry;

  // Slide player transitions and Cherry notifications (seamless, in-place, no disconnects!)
  const handleNextTopic = useCallback(() => {
    if (customBoardContent && customBoardContent.trim()) {
      autoCaptureSnapshot(activeTopicIndex, customBoardContent);
    }
    setActiveTopicIndex((prev) => {
      const nextIndex = prev + 1 < topics.length ? prev + 1 : prev;
      if (nextIndex !== prev) {
        addToast(`Syllabus screen updated to topic: Part ${nextIndex + 1}! 📖`, "info");
        setCustomBoardContent(topicBoardsContent[nextIndex] || "");
      }
      return nextIndex;
    });
  }, [topics, addToast, activeTopicIndex, customBoardContent, autoCaptureSnapshot, topicBoardsContent]);

  const handlePrevTopic = useCallback(() => {
    if (customBoardContent && customBoardContent.trim()) {
      autoCaptureSnapshot(activeTopicIndex, customBoardContent);
    }
    setActiveTopicIndex((prev) => {
      const prevIndex = prev > 0 ? prev - 1 : prev;
      if (prevIndex !== prev) {
        addToast(`Syllabus screen updated to topic: Part ${prevIndex + 1}! 📖`, "info");
        setCustomBoardContent(topicBoardsContent[prevIndex] || "");
      }
      return prevIndex;
    });
  }, [addToast, activeTopicIndex, customBoardContent, autoCaptureSnapshot, topicBoardsContent]);



  const handleSyncBoardContent = useCallback((idx: number, content: string) => {
    setTopicBoardsContent((prev) => {
      if (prev[idx] === content) return prev;
      return {
        ...prev,
        [idx]: content
      };
    });
  }, []);

  // Synchronize customBoardContent specifically for Phase 1 ('intro') so the blackboard immediately displays the topic heading and prediction poll structure when empty
  useEffect(() => {
    const currentPhase = (teachingPhase || "intro").toLowerCase();
    const isIntroPhase = currentPhase === "intro";
    
    if (isIntroPhase && (!customBoardContent || customBoardContent.trim() === "")) {
      const activeTopicText = (topics && topics.length > activeTopicIndex && topics[activeTopicIndex]) 
        ? topics[activeTopicIndex] 
        : "";
      const topicHeaderLine = activeTopicText.split("\n")[0] || "";
      const cleanHeader = topicHeaderLine.trim() 
        ? (topicHeaderLine.startsWith("#") ? topicHeaderLine : `# ${topicHeaderLine}`) 
        : `# ${topics[activeTopicIndex] ? "Topic " + (activeTopicIndex + 1) : (studentDetails.subject || "Classroom Lesson")}`;
      
      const phase1BoardContent = cleanHeader;
      console.log(`[Phase 1 Sync Hook] Initializing Phase 1 blackboard notes for Part ${activeTopicIndex + 1}.`);
      setCustomBoardContent(phase1BoardContent);
    }
  }, [teachingPhase, activeTopicIndex, topics, customBoardContent, studentDetails.subject]);

  // Synchronize customBoardContent with topics when transitioning to concept/example/doubt phases so the board displays slide contents immediately if empty
  useEffect(() => {
    const currentPhase = (teachingPhase || "intro").toLowerCase();
    const isConceptOrLater = currentPhase === "concept" || currentPhase === "example" || currentPhase === "doubt" || currentPhase === "transition";
    
    if (isConceptOrLater && topics && topics.length > 0 && activeTopicIndex < topics.length) {
      const activeTopicText = topics[activeTopicIndex] || "";
      if (activeTopicText.trim() !== "") {
        const isCurrentlyEmpty = !customBoardContent || customBoardContent.trim() === "";
                                         
        if (isCurrentlyEmpty) {
          console.log(`[Concept Sync Hook] Displaying Part ${activeTopicIndex + 1} contents on the blackboard.`);
          setCustomBoardContent(activeTopicText);
        }
      }
    }
  }, [teachingPhase, activeTopicIndex, topics, customBoardContent]);

  useEffect(() => {
    onNextTopicRef.current = handleNextTopic;
  }, [handleNextTopic]);



  // Automatically start teaching the continuous document when class connects
  const lastStateRef = useRef<string>("disconnected");
  useEffect(() => {
    if (state === "idle" && lastStateRef.current === "connecting" && activeDocument) {
      const isMistakeMode = activeDocument.mode === "mistake";
      const isYoutubeMode = activeDocument.mimeType === "video/youtube";
      
      let prompt = "";
      let toastMessage = "";
      
      if (isMistakeMode) {
        prompt = `[SYSTEM TRIGGER]: Student "${studentDetails.name || "student"}" (Grade: ${studentDetails.grade}, Board: ${studentDetails.board}) has entered the classroom. 'Find My Mistake' mode is active for document "${activeDocument.filename}".
If you have already greeted the student or started speaking, do NOT repeat your greeting or start-of-class remarks; continue teaching seamlessly.
If you have not yet greeted the student, sassyly greet them once, announce that you have checked their uploaded notes file, and start discussing their student attempt from Part 1 immediately!`;
        toastMessage = "Cherry is starting to diagnose your mistakes step-by-step! 🎙️🔍";
      } else if (isYoutubeMode) {
        prompt = `[SYSTEM TRIGGER]: Student "${studentDetails.name || "student"}" (Grade: ${studentDetails.grade}, Board: ${studentDetails.board}) has entered the classroom. YouTube Study Engine mode is active for video syllabus "${activeDocument.filename}".
If you have already greeted the student or started speaking, do NOT repeat your greeting or start-of-class remarks; continue teaching seamlessly.
If you have not yet greeted the student, sassyly greet them once, introduce the synchronized YouTube study course, and start teaching Part 1 immediately!`;
        toastMessage = "Cherry is beginning the board-synchronized YouTube lesson! 🎙️🎥";
      } else {
        prompt = `[SYSTEM TRIGGER]: Student "${studentDetails.name || "student"}" (Grade: ${studentDetails.grade}, Board: ${studentDetails.board}) has entered the classroom for "${activeDocument.filename}".
MANDATORY PHASE 1 ('intro') EXECUTION:
1. Immediately at t=0ms, call \`setTeachingState(phase='intro')\` AND call \`updateWhiteboard\` to draw the Hero Visual Schematic SVG, write '# [Topic Title]', and '### ❓ PREDICTION POLL: Option A vs Option B' on the board. (STRICT RULE: Do NOT write 'Real-World Curiosity Hook' or 'REAL-WORLD MYSTERY' text/headers or verbatim document text/definitions on the board in Phase 1!).
2. Warmly and sassyly greet student "${studentDetails.name || "beta"}" in high-energy Hinglish.
3. Tell the intriguing real-world curiosity story hook in spoken voice and ask the prediction poll question ('Option A vs Option B?').
4. Stop speaking immediately and WAIT for the student's voice response!`;
        toastMessage = "Cherry Ma'am is starting Phase 1: Real-World Mystery & Prediction Poll! 🎙️⚡";
      }
      
      // Fire trigger prompt immediately upon connection without delay
      injectPromptText(prompt);
      addToast(toastMessage, "success");
    }
    lastStateRef.current = state;
  }, [state, activeDocument, injectPromptText, addToast]);

  // Sync state to automatically exit the uploaded waiting screen as soon as state is active
  useEffect(() => {
    if (state !== "disconnected") {
      setUploadedButWaitingWakeup(false);
    }
  }, [state]);

  // Client-side VAD Silence Detection Effect for Phase 4 (Doubt / Q&A)
  const hasTriggeredSilenceProbeRef = useRef(false);
  useEffect(() => {
    // Reset probe trigger when phase changes or state changes from listening
    if (teachingPhase !== "doubt" || state !== "listening") {
      hasTriggeredSilenceProbeRef.current = false;
      return;
    }

    // When student speaks (volume threshold), reset probe ref
    if (userVolume > 0.08) {
      hasTriggeredSilenceProbeRef.current = false;
      return;
    }

    if (hasTriggeredSilenceProbeRef.current) return;

    const timer = setTimeout(() => {
      if (
        teachingPhase === "doubt" &&
        state === "listening" &&
        !hasTriggeredSilenceProbeRef.current &&
        userVolume < 0.08
      ) {
        hasTriggeredSilenceProbeRef.current = true;
        console.log("[Client VAD] 7s Silence detected in Doubt phase. Triggering gentle probe prompt.");
        injectPromptText("[SYSTEM_EVENT: STUDENT_SILENT_7_SEC]");
      }
    }, 7000);

    return () => clearTimeout(timer);
  }, [teachingPhase, state, userVolume, injectPromptText]);

  // ASR Live Dialogue Sync Logic
  useEffect(() => {
    if (cherryTranscript.text && cherryTranscript.text.trim() && cherryTranscript.id) {
      setDialogueHistory((prev) => {
        const index = prev.findIndex((item) => item.id === cherryTranscript.id);
        if (index !== -1) {
          const next = [...prev];
          next[index] = { ...next[index], text: cherryTranscript.text };
          return next;
        } else {
          return [
            ...prev,
            { id: cherryTranscript.id!, sender: "cherry", text: cherryTranscript.text },
          ];
        }
      });
    }
  }, [cherryTranscript.text, cherryTranscript.id]);

  // Keep subtitles terminal scrolled to latest subtitle
  useEffect(() => {
    if (subtitlesScrollRef.current) {
      subtitlesScrollRef.current.scrollTop = subtitlesScrollRef.current.scrollHeight;
    }
  }, [dialogueHistory, cherryTranscript.text, cherryTranscript.id]);

  // Keep portrait live transcript scrolled to latest dialogue
  useEffect(() => {
    if (portraitTranscriptScrollRef.current) {
      portraitTranscriptScrollRef.current.scrollTop = portraitTranscriptScrollRef.current.scrollHeight;
    }
  }, [dialogueHistory]);

  // Gracefully end, compile, and archive the active session
  const handleEndAndArchiveSession = useCallback(async (targetSessionId: string | null = sessionId) => {
    if (!targetSessionId) return;
    
    const currentUser = auth.currentUser || user;
    if (!currentUser) return;

    // Stop recording first if active, so the audio context and playback stream are captured BEFORE being destroyed!
    if (isRecording && stopRecording) {
      console.log("[App] Stopping blackboard recorder before disconnecting live session to preserve mixed audio...");
      stopRecording();
    }

    // Disconnect live stream if active
    if (state !== "disconnected") {
      disconnect();
    }

    // Convert numeric keys in topicBoardsContent to strings for Firestore/JSON storage
    const sanitizedTopicBoards: Record<string, string> = {};
    if (topicBoardsContent) {
      Object.entries(topicBoardsContent).forEach(([k, v]) => {
        sanitizedTopicBoards[String(k)] = v as string;
      });
    }

    // Save final state immediately to pastSessions and localStorage
    setPastSessions((prevSessions) => {
      const updated = prevSessions.map((sess) => {
        if (sess.sessionId === targetSessionId) {
          return {
            ...sess,
            customBoardContent: customBoardContent,
            topicBoardsContent: sanitizedTopicBoards,
            topics: topics,
            subject: studentDetails.subject || sess.subject,
            updatedAt: new Date().toISOString(),
          };
        }
        return sess;
      });
      const cachedKey = `pastSessions_${currentUser.uid}`;
      localStorage.setItem(cachedKey, JSON.stringify(updated));
      return updated;
    });

    // Save immediately to Firestore
    if (currentUser.uid !== "local_guest_student" && !currentUser.uid.startsWith("local_")) {
      const sessionRef = doc(db, "classSessions", targetSessionId);
      try {
        await updateDoc(sessionRef, {
          customBoardContent: customBoardContent,
          topicBoardsContent: sanitizedTopicBoards,
          topics: topics,
          updatedAt: serverTimestamp()
        });
      } catch (dbErr) {
        console.warn("Immediate cloud blackboard sync failed on archiving:", dbErr);
      }
    }

    // Reset active session state
    setSessionId(null);
    setDialogueHistory([]);
    setCustomBoardContent("");
    setTopicBoardsContent({});
    
    addToast("Lesson notes automatically compiled and saved to 'Archived Classroom Lecture Books'! 📁🎓", "success");
    setCurrentScreen("syllabus");
  }, [sessionId, user, state, disconnect, customBoardContent, topicBoardsContent, topics, studentDetails, addToast, isRecording, stopRecording]);

  // Disconnect & Auto-Archive session if student navigates away from the Classroom screen
  useEffect(() => {
    if (currentScreen !== "classroom" && sessionId) {
      handleEndAndArchiveSession(sessionId);
    } else if (currentScreen !== "classroom" && state !== "disconnected") {
      disconnect();
    }
  }, [currentScreen, sessionId, state, disconnect, handleEndAndArchiveSession]);

  const handlePowerToggle = () => {
    if (state === "disconnected") {
      setUploadedButWaitingWakeup(false);
      if (!sessionId) {
        const fallbackSessionId = "session_" + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
        setSessionId(fallbackSessionId);
      }
      connect();
    } else {
      if (sessionId) {
        handleEndAndArchiveSession(sessionId);
      } else {
        disconnect();
        addToast("Cherry Ma'am is heading to the staff room. Talk later! 📚☕", "info");
      }
    }
  };

  const handleClassComplete = useCallback(() => {
    triggerCelebrationConfetti();
    if (sessionId) {
      handleEndAndArchiveSession(sessionId);
    } else {
      disconnect();
    }
    addToast("Congratulations! Class is complete. Cherry is heading to the staff room! 🎓🎉☕", "success");
  }, [sessionId, handleEndAndArchiveSession, disconnect, addToast]);

  useEffect(() => {
    onClassCompleteRef.current = handleClassComplete;
  }, [handleClassComplete]);

  // Human-friendly sass helper based on active states
  const getSubTitleText = () => {
    switch (state) {
      case "disconnected":
        return "Class is at recess. Wake up Cherry Ma'am to start studying! 🤓🎒";
      case "connecting":
        return "Cherry Ma'am is preparing today's sassy lesson slides... Brief moment... ☕📝";
      case "idle":
        return "Ask anything—Maths, Physics formulas, or poetic classics! 📐✨";
      case "listening":
        return "Tell me your query... I'm listening like an incredibly smart friend! 🧠👂";
      case "speaking":
        return "Listen closely, I'm delivering some effortless intellect! 🎙️🌟";
      case "error":
        return "Oops student, class network dropped. Let's hit reconnect... 💔🔌";
      default:
        return "Connected and ready to learn.";
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);

    const isImage = file.type && file.type.startsWith("image/");
    const isPDFOrDoc = !isImage;

    // Strict 3MB limit for PDF / raw text files to guarantee secure API Gateway transfer
    if (isPDFOrDoc && file.size > 3 * 1024 * 1024) {
      addToast(`Syllabus document size of ${(file.size / (1024 * 1024)).toFixed(1)}MB exceeds the 3MB gateway limit for non-image files. Please upload a more compact PDF or text file.`, "error");
      setIsUploading(false);
      return;
    }

    addToast(isImage ? "Optimizing calculations image..." : "Analyzing document with Gemini...", "info");

    try {
      // Compress if it's an image (resized to max 1200px, 0.70 quality to compress under ~200KB)
      // Otherwise reads normally as Data URL via FileReader fallback inside our promise utility.
      const result = await compressImageIfPossible(file, 1200, 0.70);
      if (!result) {
        throw new Error("Failed to read document contents safely.");
      }

      const splitResult = result.split(",");
      if (splitResult.length < 2) {
        throw new Error("Invalid base64 payload returned from document reader.");
      }

      const base64Data = splitResult[1];
      const payload = {
        filename: file.name,
        mimeType: file.type || "application/pdf",
        base64Data,
        mode: uploadMode,
      };

      let response: Response | null = null;
      const attempts = 3;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          const res = await fetch("/api/upload-document", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });
          response = res;
          // Break immediately on success, or on specific handled HTTP statuses (like 413 too large or 500 server error)
          if (res.ok || res.status === 413 || res.status === 500) {
            break;
          }
          throw new Error(`Server returned HTTP status ${res.status}`);
        } catch (fetchErr: any) {
          console.warn(`Upload attempt ${attempt} failed:`, fetchErr);
          if (attempt === attempts) {
            throw fetchErr; // Out of attempts, let the outer catch deal with it
          }
          addToast(`Upload interrupted. Retrying automatically (attempt ${attempt + 1}/${attempts})...`, "info");
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Handle server-side non-ok responses (e.g. 413, 500)
      if (!response || !response.ok) {
        let errorMsg = "Internal server or gateway error during upload";
        if (response) {
          try {
            const rawText = await response.text();
            if (rawText.trim().startsWith("{")) {
              const errData = JSON.parse(rawText);
              errorMsg = errData.error || errorMsg;
            } else if (rawText.toLowerCase().includes("payload too large") || response.status === 413) {
              errorMsg = "File is too large! Please upload a syllabus document or image smaller than 3MB to avoid network timeouts.";
            } else {
              errorMsg = `Server error (Status ${response.status}). Please try optimizing your document content or try again.`;
            }
          } catch (pErr) {
            if (response.status === 413) {
              errorMsg = "Request entity too large! Please upload a smaller document (< 4MB) to bypass server buffers.";
            }
          }
        }
        addToast(errorMsg, "error");
        setIsUploading(false);
        return;
      }

      let data: any;
      try {
        const rawText = await response.text();
        if (!rawText.trim().startsWith("{")) {
          throw new Error("Invalid response format received from the server.");
        }
        data = JSON.parse(rawText);
      } catch (jsonErr: any) {
        throw new Error(jsonErr?.message || "The classroom portal received an unreadable response from the diagnostic server. Please try a smaller or more optimized document file.");
      }
      
      if (data.success) {
        disconnect();
        setDialogueHistory([]);
        setUploadedButWaitingWakeup(true);
        setActiveDocument({
          filename: data.filename,
          mimeType: data.mimeType,
          markdown: data.markdown,
          mode: data.mode,
          detectedSubject: data.detectedSubject,
        });
        setActiveTopicIndex(0);
        
        const finalSb = data.detectedSubject || studentDetails.subject;
        setStudentDetails(prev => ({ ...prev, subject: finalSb }));

        // Auto-redirect to immersive Classroom Blackboard Room screen
        setCurrentScreen("classroom");

        const newSessionId = "session_" + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
        setSessionId(newSessionId);

        // Sync with Firestore database in background
        const firestoreSync = async () => {
          let currentUser = auth.currentUser || user;
          if (!currentUser) {
            try {
              const anonResult = await signInAnonymously(auth);
              currentUser = anonResult.user;
            } catch (err) {
              console.warn("Anonymous authentication failed, using local guest fallback:", err);
              currentUser = {
                uid: "local_guest_student",
                displayName: studentDetails.name || "Guest Student",
                email: null,
                isAnonymous: true,
                emailVerified: false,
              } as any;
              setUser(currentUser);
              localStorage.setItem("local_active_user", JSON.stringify(currentUser));
            }
          }

          if (currentUser) {
            // Save locally first to be 100% resilient
            const newSessionObj = {
              sessionId: newSessionId,
              userId: currentUser.uid,
              grade: studentDetails.grade,
              subject: finalSb,
              activeDocumentName: data.filename || "Uploaded Notes",
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
              setDoc(profileRef, { subject: finalSb, updatedAt: serverTimestamp() }, { merge: true })
                .catch(profileErr => console.warn("Could not sync detected subject to student profile:", profileErr));

              const sessionRef = doc(db, "classSessions", newSessionId);
              setDoc(sessionRef, {
                sessionId: newSessionId,
                userId: currentUser.uid,
                grade: studentDetails.grade,
                subject: finalSb,
                activeDocumentName: data.filename || "Uploaded Notes",
                customBoardContent: "",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              }).then(() => {
                loadPastSessions(currentUser!.uid);
              }).catch(dbErr => {
                console.warn("Could not sync session to Firestore:", dbErr);
              });
            }
          }
        };
        firestoreSync();

        addToast(data.mode === "mistake" 
          ? "Calculations notes diagnostic processed. Click 'Wake Up' to check your mistakes! 🔍✨" 
          : "Syllabus document loaded silently in Cherry's memory. Press 'Wake Up' to start the board! 📚✨", "success");
      } else {
        addToast(data.error || "Failed to analyze document.", "error");
      }
    } catch (err: any) {
      console.error("Upload fetch error inside reader load:", err);
      addToast("Gateway upload failed. Try optimizing the file size (under 3MB for PDF documents, or use jpeg/png images).", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleClearDocument = async () => {
    try {
      const res = await fetch("/api/clear-document", { method: "POST" });
      const rawText = await res.text();
      let data: any = {};
      if (rawText.trim().startsWith("{")) {
        data = JSON.parse(rawText);
      }
      if (data.success) {
        setActiveDocument(null);
        setUploadedButWaitingWakeup(false);
        setActiveTopicIndex(0);
        setCustomBoardContent("");
        setTopicBoardsContent({});
        addToast("Syllabus cleared. General teaching mode active!", "info");
      } else {
        throw new Error(data.error || "Failed to parse clear-document JSON response.");
      }
    } catch (err) {
      console.error("Failed clearing document:", err);
      // Clean up client-side state anyway for better UX resilience
      setActiveDocument(null);
      setUploadedButWaitingWakeup(false);
      setActiveTopicIndex(0);
      setCustomBoardContent("");
      setTopicBoardsContent({});
      addToast("Active document state reset locally.", "info");
    }
  };

  const handleOpenSyllabus = () => {
    setActiveWorkspaceTab("document");
    setIsFullScreenBoard(false);
    addToast("Opening Syllabus Doc view...", "info");
    // Soft delay to wait for React tab transitions
    setTimeout(() => {
      document.getElementById("file-syllabus-upload")?.click();
    }, 200);
  };

  const handleSendPromptText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedInput.trim()) return;
    
    const safeMsgId = "student_typed_" + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    
    // Add prompt text to local history immediately for student feedback
    setDialogueHistory((prev) => [
      ...prev,
      {
        id: safeMsgId,
        sender: "user",
        text: typedInput,
      }
    ]);
    
    // Inject the prompt text into Gemini socket loop!
    injectPromptText(typedInput);
    addToast(`Prompt sent to Cherry Ma'am!`, "success");
    setTypedInput("");
  };

  const studentAskedForWritingOrDrawing = useMemo(() => {
    const keywords = [
      // English keywords
      "write", "draw", "sketch", "diagram", "plot", "graph", "formula", "equation", "solve", 
      "calculate", "show me", "explain on board", "table", "chart", "figure", "visualize", "illustrate", "derive",
      // Hindi / Indian keywords
      "likh", "likho", "likhiye", "bana", "banao", "banaye", "draw karo", "solve karo", "dikhao", "dikhaye", "diagram banao", "graph banao", "figure banao", "board pe"
    ];

    // 1. Check current real-time spoken transcript of user
    if (userTranscript?.text) {
      const lower = userTranscript.text.toLowerCase();
      if (keywords.some((kw) => lower.includes(kw))) {
        return true;
      }
    }

    // 2. Check the last user message in the history
    const userMessages = dialogueHistory.filter((item) => item.sender === "user");
    if (userMessages.length > 0) {
      const lastMsg = userMessages[userMessages.length - 1].text.toLowerCase();
      if (keywords.some((kw) => lastMsg.includes(kw))) {
        return true;
      }
    }

    return false;
  }, [dialogueHistory, userTranscript?.text]);

  const latestSpeechText = cherryTranscript.text || (dialogueHistory.filter((item) => item.sender === "cherry").slice(-1)[0]?.text || "");

  const handleSelectPrompt = (promptText: string) => {
    const isLive = state !== "disconnected" && state !== "connecting" && state !== "error";
    if (isLive) {
      injectPromptText(promptText);
      addToast(`Sending query: "${promptText}"`, "info");
    } else {
      addToast(`To ask Cherry Ma'am, read aloud: "${promptText}" or connect the live session first!`, "warning");
    }
  };

  return (
    <div
      className="min-h-screen bg-[#071312] text-[#0a3641] flex flex-col items-center justify-center font-sans relative select-none p-0 md:p-6 transition-all duration-1000 overflow-hidden"
    >
      {/* Background decoration for the desktop study room / desk view */}
      <div className="absolute inset-0 bg-[radial-gradient(#152d29_1.5px,transparent_1.5px)] [background-size:24px_24px] pointer-events-none opacity-40 z-0" />
      
      {/* Dynamic Floating Desktop Backlights */}
      <div className="hidden md:block absolute top-10 left-10 w-[500px] h-[500px] rounded-full blur-[120px] opacity-[0.08] pointer-events-none z-0"
        style={{ background: `radial-gradient(circle, ${activeColors.primary} 0%, transparent 85%)` }} />
      <div className="hidden md:block absolute bottom-10 right-10 w-[500px] h-[500px] rounded-full blur-[120px] opacity-[0.08] pointer-events-none z-0"
        style={{ background: `radial-gradient(circle, ${activeColors.accent} 0%, transparent 85%)` }} />

      {/* Modern High-Fidelity Mobile Device Frame Mockup */}
      <div 
        id="studyverse-mobile-frame"
        className="relative w-full h-[100dvh] md:h-[860px] md:w-[410px] md:max-w-md bg-[#04110e] md:rounded-[44px] md:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95),0_0_0_12px_#1c2825,0_0_0_13px_#121b19,0_0_30px_5px_rgba(196,245,0,0.12)] flex flex-col overflow-hidden z-10 border border-teal-500/10 transition-all duration-500"
      >
        {/* Mobile Status Bar (iOS/Android Style) */}
        <div className={`w-full h-8 bg-black/40 backdrop-blur-md px-5 flex items-center justify-between shrink-0 select-none z-30 border-b border-white/[0.04] font-mono text-[10px] font-bold text-white/90 ${currentScreen === "classroom" ? "landscape:hidden" : ""}`}>
          <div className="flex items-center space-x-1">
            <span>12:00 PM</span>
          </div>
          {/* Dynamic Island Notch */}
          <div className="absolute left-1/2 -translate-x-1/2 top-1.5 w-24 h-4.5 bg-black rounded-full hidden md:flex items-center justify-center border border-white/[0.08] z-40">
            <div className="w-1.5 h-1.5 bg-[#c4f500] rounded-full animate-pulse mr-auto ml-2" />
            <span className="text-[7px] text-[#c4f500]/90 font-black uppercase tracking-widest mr-2 leading-none">STUDYVERSE</span>
          </div>
          <div className="flex items-center space-x-1.5 text-white/80">
            {/* Cell signal bar */}
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2 22h20V2z" />
            </svg>
            {/* WiFi */}
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21l-12-12c4-4 10-6 12-6s8 2 12 6l-12 12z" />
            </svg>
            {/* Battery percentage */}
            <span className="text-[8px] opacity-75 font-sans mr-0.5">100%</span>
            <div className="w-4.5 h-2.5 border border-white/40 rounded-xs p-0.5 flex items-center">
              <div className="w-full h-full bg-[#c4f500] rounded-2xs" />
            </div>
          </div>
        </div>

        {/* The App Main Viewport wrapper */}
        <div className="flex-1 flex flex-col relative overflow-hidden min-h-0 bg-[#f4f7f5] text-[#0a3641]">
          {/* Inner ambient gradients of the active study theme */}
          <div className={`absolute inset-0 bg-gradient-to-b ${activeColors.bgGradient} transition-all duration-1000 z-0`} />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.012)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none opacity-40 mix-blend-overlay z-0" />
          <div className="absolute top-1/4 left-1/4 w-[120%] h-[50%] rounded-full blur-[80px] opacity-[0.06] pointer-events-none transition-all duration-1000 z-0"
            style={{ background: `radial-gradient(circle, ${activeColors.primary} 0%, transparent 80%)` }} />

          {/* Scrolling active viewport box */}
          <div className="flex-1 flex flex-col min-h-0 relative z-10 overflow-y-auto overflow-x-hidden scroll-smooth">
            {/* =========================================
                SCREEN I: STUDENTS HOME PAGE & REGISTRATION
                ========================================= */}
            {currentScreen === "home" && !showStudentAccountHub && (
        <div className="flex-1 flex flex-col justify-between z-10 w-full max-w-6xl mx-auto px-4 py-6 md:py-12">
          {/* Subtle Top Navigation bar */}
          <div className="flex items-center justify-between border-b border-[#dae1dd] pb-3 mb-6 z-20">
            <div className="flex items-center space-x-1.5">
              <span className="p-0.5 px-1.5 rounded-md text-[8px] font-mono uppercase bg-[#0a3641] text-[#c4f500] font-black tracking-wider leading-none animate-pulse">Live</span>
              <span className="text-xs font-mono text-[#486a73] font-black">CHERRY MA'AM</span>
            </div>
            
            {/* Top Right Action - Login / Register button */}
            <div>
              {user ? (
                studentDetails.name ? (
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => setCurrentScreen("syllabus")}
                      className="bg-[#0a3641] hover:bg-[#124e5d] text-[#c4f500] active:scale-95 text-[10px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all shadow-sm cursor-pointer select-none"
                    >
                      <span>Study Desk 🎒</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsLearnerProfileModalOpen(true)}
                      className="p-1.5 rounded-lg border border-[#dae1dd] hover:border-[#0a3641] text-[#0a3641] hover:bg-[#c4f500]/20 transition-all cursor-pointer bg-white"
                      title="Learner Memory & Weak Topics Hub (DPDP 2023)"
                    >
                      <Brain className="w-3.5 h-3.5 text-[#0a3641]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowStudentAccountHub(true)}
                      className="p-1.5 rounded-lg border border-[#dae1dd] hover:border-[#0a3641] text-[#0a3641] hover:bg-slate-50 transition-all cursor-pointer bg-white"
                      title="Open My Profile & Stats"
                    >
                      <User className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="p-1.5 rounded-lg border border-[#dae1dd] text-[#486a73] hover:text-red-500 hover:border-red-100 transition-colors cursor-pointer bg-white"
                      title="Sign Out"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => setShowOnboarding(true)}
                      className="bg-[#0a3641] hover:bg-[#124e5d] text-[#c4f500] text-[10px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all shadow-sm cursor-pointer"
                    >
                      <span>Complete Setup 🎒</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="p-1.5 rounded-lg border border-[#dae1dd] text-[#486a73] hover:text-red-500 hover:border-red-100 transition-colors cursor-pointer bg-white"
                      title="Sign Out"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => setShowLoginModal(true)}
                  className="bg-[#0a3641] hover:bg-[#124e5d] text-[#c4f500] text-[10px] font-black tracking-wide uppercase px-3 py-2 rounded-lg flex items-center gap-1 transition-all shadow-sm cursor-pointer select-none active:scale-95"
                >
                  <User className="w-3.5 h-3.5 text-[#c4f500]" />
                  <span>Login / Register 🧑‍🎓</span>
                </button>
              )}
            </div>
          </div>

          {/* SECTION 1: MODERN HERO SPLIT VIEW */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center my-auto py-4 md:py-8 border-b border-[#dae1dd]/40 pb-12">
            
            {/* Left Column - Dynamic Value Pitch */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-[#c4f500]/25 border border-[#0a3641]/15 text-[#0a3641] text-xs font-semibold font-mono"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#0a3641]" />
                <span>Next-Gen Interactive Hinglish Classroom</span>
              </motion.div>
              
              <motion.h1 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.1] font-sans text-[#0a3641]"
              >
                All Indian Boards & Multi-Lingual Study from <span className="bg-[#c4f500] text-[#0a3641] px-3.5 py-1 rounded-2xl shadow-sm border border-[#0a3641]/10 inline-block font-black rotate-[-1deg] hover:rotate-[1deg] transition-transform duration-300">Cherry Ma'am</span> Live!
              </motion.h1>

              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-sm md:text-base text-[#486a73] leading-relaxed max-w-2xl font-medium"
              >
                Cherrish the power of real-time voice conversations! Cherry Ma'am isn't just another boring, monotone bot. She is your encouraging, smart, sassy Hinglish tutor friend who writes customized chalk equations on the black board in perfect sync with her voice.
              </motion.p>

              {/* Call to Actions */}
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex flex-col gap-2.5 pt-1.5 w-full"
              >
                {user ? (
                  <button
                    type="button"
                    onClick={() => setCurrentScreen("syllabus")}
                    className="w-full bg-[#0a3641] hover:bg-[#124e5d] text-[#c4f500] active:scale-95 text-xs font-black tracking-wider uppercase py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer select-none"
                  >
                    <span>Enter My Study Desk 🎒</span>
                    <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowLoginModal(true)}
                      className="w-full bg-[#0a3641] hover:bg-[#1c4b57] text-[#c4f500] active:scale-95 text-xs font-black tracking-wide uppercase py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg cursor-pointer select-none"
                    >
                      <User className="w-4 h-4 text-[#c4f500]" />
                      <span>Login or Register Now 🧑‍🎓</span>
                      <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                    </button>
                    
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          let anonUser;
                          try {
                            const anonResult = await signInAnonymously(auth);
                            anonUser = anonResult.user;
                          } catch (err) {
                            console.warn("Firebase anonymous authentication failed, using local fallback:", err);
                            anonUser = {
                              uid: "local_guest_student",
                              displayName: "Quick Student",
                              email: null,
                              isAnonymous: true,
                              emailVerified: false,
                            } as any;
                            setUser(anonUser);
                            localStorage.setItem("local_active_user", JSON.stringify(anonUser));
                          }

                          if (anonUser) {
                            setStudentDetails({
                              name: "Quick Student",
                              grade: "Class 10",
                              subject: "Mathematics",
                              board: "CBSE"
                            });
                            // Save profile to local storage cache for local-only reliability
                            const localProfile = {
                              name: "Quick Student",
                              grade: "Class 10",
                              subject: "Mathematics",
                              board: "CBSE",
                              mediumOfLearning: "Hinglish"
                            };
                            localStorage.setItem(`studentProfile_${anonUser.uid}`, JSON.stringify(localProfile));

                            if (anonUser.uid !== "local_guest_student" && !anonUser.uid.startsWith("local_")) {
                              // Trigger auto update profile in the background
                              const profileRef = doc(db, "studentProfiles", anonUser.uid);
                              setDoc(profileRef, {
                                userId: anonUser.uid,
                                ...localProfile,
                                updatedAt: serverTimestamp()
                              }).catch((e) => {
                                console.warn("Could not write quick profile to database, staying local", e);
                              });
                            }
                            setCurrentScreen("syllabus");
                            addToast("Welcome! Entered custom Study Desk as Guest 🎒", "success");
                          }
                        } catch (err: any) {
                          addToast("Quick guest session failed, please use normal login", "error");
                        }
                      }}
                      className="w-full bg-white hover:bg-[#f7f9f6] text-[#0a3641] active:scale-95 border-2 border-[#0a3641]/10 text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center transition-all cursor-pointer"
                    >
                      <span>Try as Instant Guest ⚡</span>
                    </button>
                  </>
                )}
              </motion.div>

              {/* Quick Trust / Highlight metrics */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#dae1dd]/40 max-w-lg">
                <div>
                  <h4 className="text-base font-black text-[#0a3641] leading-none mb-1">Live AI</h4>
                  <p className="text-[10px] text-[#486a73] font-medium uppercase tracking-wider font-mono">Gemini Voice Sync</p>
                </div>
                <div>
                  <h4 className="text-base font-black text-[#0a3641] leading-none mb-1">Class 6-12</h4>
                  <p className="text-[10px] text-[#486a73] font-medium uppercase tracking-wider font-mono">IIT-JEE & Board Prep</p>
                </div>
                <div>
                  <h4 className="text-base font-black text-[#0a3641] leading-none mb-1">Instant Scan</h4>
                  <p className="text-[10px] text-[#486a73] font-medium uppercase tracking-wider font-mono">Mistake Pinpoint</p>
                </div>
              </div>
            </div>

            {/* Right Column - Premium Animated Virtual Chalkboard Mockup */}
            <div className="lg:col-span-5 relative mt-6 lg:mt-0">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="w-full bg-[#1b2b29] border-[12px] border-[#392e27] rounded-3xl p-5 md:p-6 shadow-xl relative overflow-hidden flex flex-col justify-between text-left select-none group"
              >
                {/* Board gloss glares */}
                <div className="absolute inset-0 bg-gradient-to-tr from-white/0 to-white/[0.04] pointer-events-none" />
                <div className="absolute top-2 right-2 flex items-center space-x-1 font-mono text-[8px] text-slate-400 font-bold bg-[#14201e]/80 py-1 px-2.5 rounded-full border border-teal-500/10">
                  <span className="w-1.5 h-1.5 bg-[#c4f500] rounded-full animate-ping" />
                  <span>CHALK SLATE SIMULATION v2.4</span>
                </div>

                {/* Chalk board grids */}
                <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.015)_1.5px,transparent_1.5px)] [background-size:24px_24px] pointer-events-none" />

                {/* Drawn formula & dynamic annotations component */}
                <div className="space-y-4 pt-6 z-10 w-full">
                  <div className="space-y-1">
                    <span className="text-[9px] font-mono font-bold tracking-widest text-emerald-400 uppercase bg-[#0f1d1c] px-2 py-0.5 rounded border border-emerald-500/15">
                      ACTIVE MATHEMATICAL SYSTEM
                    </span>
                  </div>

                  {/* Fully reactive real mathematical curve graph */}
                  <AnimatedChalkboardGraph />
                </div>

                {/* Simulated teacher live dialogue pop in real-time Hinglish */}
                <div className="mt-4 bg-[#14201e] border border-teal-500/10 rounded-xl p-3 text-left space-y-1 z-10">
                  <p className="text-[9px] font-mono text-[#c4f500] font-black uppercase tracking-wider flex items-center gap-1">
                    <span>💬 Cherry Ma'am's Blackboard Output:</span>
                  </p>
                  <p className="text-[11px] font-sans font-medium text-teal-150 leading-relaxed text-slate-100">
                    "Look at this graph! Calculus se darna nahi hai babu! Just integral coordinates focus karo and exact area visible ho jayega! 📐✨"
                  </p>
                </div>

              </motion.div>
            </div>

          </div>

          {/* SECTION 2: BENTO GRID VALUE PROPOSITION / FEATURES */}
          <div id="features" className="py-12 md:py-16 border-b border-[#dae1dd]/40">
            <div className="text-center space-y-3 max-w-2xl mx-auto mb-10">
              <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-[#0a3641] bg-[#c4f500]/30 px-3 py-1 rounded-full">Explore High-End Features</span>
              <h2 className="text-2xl md:text-3.5xl font-black text-[#0a3641] leading-tight">What makes Cherry Ma'am unlike any ordinary AI bot</h2>
              <p className="text-xs md:text-sm text-[#486a73] font-medium">Equipped with ultra-fast Gemini Live streaming, chalkslate physics renders, and student homework diagnostic scanners.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Feature 1: Real-time Voice Chat */}
              <div className="bg-white border border-[#dae1dd] hover:border-[#0a3641]/30 hover:shadow-lg transition-all rounded-3xl p-6 text-left space-y-4 flex flex-col justify-between group">
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#0a3641]/5 flex items-center justify-center text-xl text-[#0a3641] border border-[#0a3641]/10 group-hover:bg-[#c4f500]/25 transition-all">
                    🎙️
                  </div>
                  <h3 className="text-sm font-extrabold text-[#0a3641] uppercase tracking-wide">Dynamic Bi-directional Voice</h3>
                  <p className="text-xs text-[#486a73] leading-relaxed font-semibold">
                    Speak naturally. No delay, no awkward waiting. Interrupt whenever you want, just like a real class teacher!
                  </p>
                </div>
                <span className="text-[9px] font-mono font-extrabold text-[#0a3641]/40 uppercase tracking-widest">Powered by Gemini Live API</span>
              </div>

              {/* Feature 2: Synced Chalk Blackboard */}
              <div className="bg-white border border-[#dae1dd] hover:border-[#0a3641]/30 hover:shadow-lg transition-all rounded-3xl p-6 text-left space-y-4 flex flex-col justify-between group">
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#0a3641]/5 flex items-center justify-center text-xl text-[#0a3641] border border-[#0a3641]/10 group-hover:bg-[#c4f500]/25 transition-all">
                    📐
                  </div>
                  <h3 className="text-sm font-extrabold text-[#0a3641] uppercase tracking-wide">LaTeX Slate Chalkboard</h3>
                  <p className="text-xs text-[#486a73] leading-relaxed font-semibold">
                    Drawn formulas, step-by-step calculus steps, and physics state diagrams display dynamically on the slate as she speaks.
                  </p>
                </div>
                <span className="text-[9px] font-mono font-extrabold text-[#0a3641]/40 uppercase tracking-widest">Instant Math & graph rendering</span>
              </div>

              {/* Feature 3: Doubt Scan Diagnostic */}
              <div className="bg-white border border-[#dae1dd] hover:border-[#0a3641]/30 hover:shadow-lg transition-all rounded-3xl p-6 text-left space-y-4 flex flex-col justify-between group">
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#0a3641]/5 flex items-center justify-center text-xl text-[#0a3641] border border-[#0a3641]/10 group-hover:bg-[#c4f500]/25 transition-all">
                    🔍
                  </div>
                  <h3 className="text-sm font-extrabold text-[#0a3641] uppercase tracking-wide">Find My Mistake Tracker</h3>
                  <p className="text-xs text-[#486a73] leading-relaxed font-semibold">
                    Upload handwritten calculations or whiteboard sketches. Cherry scans lines, pinpoints exactly where your equation went wrong!
                  </p>
                </div>
                <span className="text-[9px] font-mono font-extrabold text-[#0a3641]/40 uppercase tracking-widest">Full Document/Image parsing</span>
              </div>

            </div>
          </div>

          {/* SECTION 3: STEP-BY-STEP COHESIVE LEARNING JOURNEY */}
          <div id="how-it-works" className="py-12 md:py-16 border-b border-[#dae1dd]/40">
            <div className="text-center space-y-3 max-w-2xl mx-auto mb-12">
              <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-[#0a3641]">How Study Desk Journey Operates</span>
              <h2 className="text-2xl md:text-3.5xl font-black text-[#0a3641] leading-tight">3 Simple steps to sitting on Cherry Ma'am's blackboard desk</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
              {/* Connector line behind on desktop */}
              <div className="hidden md:block absolute top-12 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-teal-100 via-[#c4f500]/50 to-teal-100 z-0 pointer-events-none" />

              {/* Step 1 */}
              <div className="text-center space-y-3 p-4 bg-white/40 border border-[#dae1dd]/60 rounded-3xl relative z-10 hover:shadow-sm">
                <div className="w-12 h-12 bg-[#0a3641] font-black text-[#c4f500] text-sm font-mono flex items-center justify-center rounded-2xl mx-auto shadow-md">
                  01
                </div>
                <h3 className="text-sm font-black text-[#0a3641] uppercase tracking-wide">Set Up Target Board & Class</h3>
                <p className="text-xs text-[#486a73] leading-relaxed max-w-xs mx-auto font-medium">
                  Define your exact academic profile (Class 6-12, IIT-JEE preparative, board guidelines). This teaches Cherry's brain to match your syllabus.
                </p>
              </div>

              {/* Step 2 */}
              <div className="text-center space-y-3 p-4 bg-white/40 border border-[#dae1dd]/60 rounded-3xl relative z-10 hover:shadow-sm">
                <div className="w-12 h-12 bg-[#0a3641] font-black text-[#c4f500] text-sm font-mono flex items-center justify-center rounded-2xl mx-auto shadow-md">
                  02
                </div>
                <h3 className="text-sm font-black text-[#0a3641] uppercase tracking-wide">Provide Your Homework or Document</h3>
                <p className="text-xs text-[#486a73] leading-relaxed max-w-xs mx-auto font-medium">
                  Drop math question sheets, coordinate papers, physics textbooks or PDF notes. Cherry reads them and designs live slate modules around them.
                </p>
              </div>

              {/* Step 3 */}
              <div className="text-center space-y-3 p-4 bg-white/40 border border-[#dae1dd]/60 rounded-3xl relative z-10 hover:shadow-sm">
                <div className="w-12 h-12 bg-[#0a3641] font-black text-[#c4f500] text-sm font-mono flex items-center justify-center rounded-2xl mx-auto shadow-md animate-pulse">
                  03
                </div>
                <h3 className="text-sm font-black text-[#0a3641] uppercase tracking-wide">Start Active Hinglish Dialogue</h3>
                <p className="text-xs text-[#486a73] leading-relaxed max-w-xs mx-auto font-medium">
                  Click live on the study desk. Start conversational speaking as she illustrates formulas on the slate with funny friendly feedback.
                </p>
              </div>

            </div>
          </div>

          {/* SECTION 4: STUDENT SPOTLIGHT / BUZZ OR TESTIMONIALS */}
          <div className="py-12 md:py-16 border-b border-[#dae1dd]/40 text-left">
            <div className="max-w-xl mb-10 space-y-2">
              <span className="text-[10px] font-mono font-black text-[#0a3641] uppercase tracking-widest bg-[#c4f500]/30 px-3 py-1 rounded-full">Hear the Student Buzz</span>
              <h2 className="text-2xl md:text-3xl font-black text-[#0a3641]">Indian Students are raving about Cherry's sassy classes!</h2>
              <p className="text-xs text-[#486a73] font-medium">Pure peer level motivation combined with brilliant scientific logical support.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Review 1 */}
              <div className="p-5 rounded-2xl bg-white border border-[#dae1dd] hover:scale-[1.01] transition-transform shadow-sm space-y-4">
                <p className="text-xs font-serif italic text-slate-700 leading-relaxed">
                  "Class 11 math was giving me serious trust issues, especially Calculus. But Cherry Ma'am's voice sync whiteboard matches perfectly. She literally roasted me for missing a negative sign but corrected it within 5 seconds! 😂 IIT preparation feels so much cleaner now."
                </p>
                <div className="flex items-center space-x-3 pt-2">
                  <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-xs font-black text-orange-700">R</div>
                  <div>
                    <h5 className="text-[11px] font-bold text-[#0a3641]">Rahul S.</h5>
                    <p className="text-[9px] font-mono text-emerald-600 font-bold">Class 12 student • KOTA DESK</p>
                  </div>
                </div>
              </div>

              {/* Review 2 */}
              <div className="p-5 rounded-2xl bg-white border border-[#dae1dd] hover:scale-[1.01] transition-transform shadow-sm space-y-4">
                <p className="text-xs font-serif italic text-slate-700 leading-relaxed">
                  "CBSE Science Board prep handles notes perfectly with her PDF syllabus scanner! I dropped my entire Term 1 syllabus document, and Cherry Ma'am designed study units for me. English-Hindi peer mix is super helpful and very native to study."
                </p>
                <div className="flex items-center space-x-3 pt-2">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-xs font-black text-purple-700">P</div>
                  <div>
                    <h5 className="text-[11px] font-bold text-[#0a3641]">Priya K.</h5>
                    <p className="text-[9px] font-mono text-emerald-600 font-bold">Class 10 CBSE • NCR REGION</p>
                  </div>
                </div>
              </div>

              {/* Review 3 */}
              <div className="p-5 rounded-2xl bg-white border border-[#dae1dd] hover:scale-[1.01] transition-transform shadow-sm space-y-4">
                <p className="text-xs font-serif italic text-slate-700 leading-relaxed">
                  "I was tired of static videos where nobody clears your specific doubt. With Cherry Ma'am, I simply upload my step calculation, she points out exact error lines, and we talk over the blackboard! This acts like a real personal tutor friend."
                </p>
                <div className="flex items-center space-x-3 pt-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-black text-emerald-700">K</div>
                  <div>
                    <h5 className="text-[11px] font-bold text-[#0a3641]">Kartik R.</h5>
                    <p className="text-[9px] font-mono text-emerald-600 font-bold">JEE aspirant • BIHAR BOARD</p>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* SECTION 5: FAQS ACCORDIONS SECTION */}
          <div id="faq" className="py-12 md:py-16 text-left max-w-6xl mx-auto">
            <div className="text-center space-y-3 max-w-xl mx-auto mb-10">
              <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-[#0a3641] bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">Frequently Asked Queries & Companion</span>
              <h2 className="text-2xl md:text-3.5xl font-black text-[#0a3641]">Aapke Sawaal, Cherry Ke Jawaab 🎯</h2>
              <p className="text-xs text-[#486a73] font-medium leading-relaxed">Read common questions, or simply ask our dynamic voice advisor assistant **Aditi** live about this applet's interactive classroom guidelines below!</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Column: Traditional FAQs */}
              <div className="lg:col-span-7 space-y-4">
                <div className="border-b-2 border-dashed border-[#dae1dd] pb-2 mb-4">
                  <h3 className="text-sm font-extrabold text-[#0a3641] uppercase tracking-wider flex items-center gap-2">
                    <span>📋 FAQ Cheat Sheet</span>
                  </h3>
                </div>

                {/* Question 1 */}
                <div className="border border-[#dae1dd] rounded-2xl bg-white overflow-hidden transition-all duration-300 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setActiveFaq(activeFaq === 0 ? null : 0)}
                    className="w-full flex items-center justify-between p-5 text-left text-xs font-bold text-[#0a3641] transition-colors hover:bg-[#f7f9f6]"
                  >
                    <span className="text-xs md:text-sm">Is Cherry Ma'am an actual teacher? / क्या चेरी मैम कोई सचमुच की टीचर हैं?</span>
                    <span className="text-xs text-emerald-600 font-black">{activeFaq === 0 ? "▲" : "▼"}</span>
                  </button>
                  {activeFaq === 0 && (
                    <div className="px-5 pb-5 pt-1 border-t border-[#dae1dd]/30 text-xs text-[#486a73] leading-relaxed font-semibold">
                      Cherry Ma'am is an interactive, voice-first AI virtual tutor powered by Google's Gemini Live API! She possesses infinite mathematical, algebraical and physical calculations knowledge, and responds in warm, sassy Hinglish peer dialogue to make tutoring completely fun.
                    </div>
                  )}
                </div>

                {/* Question 2 */}
                <div className="border border-[#dae1dd] rounded-2xl bg-white overflow-hidden transition-all duration-300 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setActiveFaq(activeFaq === 1 ? null : 1)}
                    className="w-full flex items-center justify-between p-5 text-left text-xs font-bold text-[#0a3641] transition-colors hover:bg-[#f7f9f6]"
                  >
                    <span className="text-xs md:text-sm">How does mistake pointing scanner scan? / मिस्टेक डिटेक्टर कैसे काम करता है?</span>
                    <span className="text-xs text-emerald-600 font-black">{activeFaq === 1 ? "▲" : "▼"}</span>
                  </button>
                  {activeFaq === 1 && (
                    <div className="px-5 pb-5 pt-1 border-t border-[#dae1dd]/30 text-xs text-[#486a73] leading-relaxed font-semibold">
                      Simply take a photo or screenshot of your handwritten mathematics calculation or physics schematic diagram, then set the Session Mode on your Study Desk to "Quick Hint & Diagnostic". Cherry scans the uploaded work, points out exactly which step of your algebraic operation has an error, and explains how to solve it correctly on her interactive blackboard.
                    </div>
                  )}
                </div>

                {/* Question 3 */}
                <div className="border border-[#dae1dd] rounded-2xl bg-white overflow-hidden transition-all duration-300 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setActiveFaq(activeFaq === 2 ? null : 2)}
                    className="w-full flex items-center justify-between p-5 text-left text-xs font-bold text-[#0a3641] transition-colors hover:bg-[#f7f9f6]"
                  >
                    <span className="text-xs md:text-sm">What school levels are supported? / क्लास लेवल कौन-कौन से सपोर्टेड हैं?</span>
                    <span className="text-xs text-emerald-600 font-black">{activeFaq === 2 ? "▲" : "▼"}</span>
                  </button>
                  {activeFaq === 2 && (
                    <div className="px-5 pb-5 pt-1 border-t border-[#dae1dd]/30 text-xs text-[#486a73] leading-relaxed font-semibold">
                      We fully support Class 6, 7, 8, 9, 10, 11, and 12, as well as competitive IIT-JEE and NEET foundation preparations across CBSE and national Board guidelines. The student can customize board syllabus dynamically inside the setup onboarding page.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Interactive Voice Concierge Assistant Aditi */}
              <div className="lg:col-span-5 space-y-4">
                <div className="border-b-2 border-dashed border-[#dae1dd] pb-2 mb-4">
                  <h3 className="text-sm font-extrabold text-[#0a3641] uppercase tracking-wider flex items-center gap-2">
                    <span>🎙️ Talk to Aditi Live (Hindi/English)</span>
                  </h3>
                </div>
                
                <ConciergeAssistant />
              </div>

            </div>
          </div>

          <div className="text-center pt-8 border-t border-[#dae1dd] mt-auto">
            <p className="text-[10px] text-[#486a73] font-mono font-bold tracking-wider">CHERRY MA'AM'S INTERACTIVE CLASS • POWERED BY GEMINI LIVE API</p>
          </div>
        </div>
      )}

      {/* =========================================
          SCREEN II: SYLLABUS & DOCUMENT DESK WORKSPACE
          ========================================= */}
      {currentScreen === "syllabus" && !showStudentAccountHub && (
        <SyllabusDeskModern
          studentDetails={studentDetails}
          setStudentDetails={setStudentDetails}
          activeDocument={activeDocument}
          setActiveDocument={setActiveDocument}
          uploadMode={uploadMode}
          setUploadMode={setUploadMode}
          youtubeUrl={youtubeUrl}
          setYoutubeUrl={setYoutubeUrl}
          isYoutubeLoading={isYoutubeLoading}
          setIsYoutubeLoading={setIsYoutubeLoading}
          isUploading={isUploading}
          handleFileUpload={handleFileUpload}
          setCurrentScreen={setCurrentScreen}
          setShowStudentAccountHub={setShowStudentAccountHub}
          addToast={addToast}
          auth={auth}
          db={db}
          user={user}
          setUser={setUser}
          setSessionId={setSessionId}
          setDialogueHistory={setDialogueHistory}
          setCustomBoardContent={setCustomBoardContent}
          setTopicBoardsContent={setTopicBoardsContent}
          setPastSessions={setPastSessions}
          loadPastSessions={loadPastSessions}
          disconnect={disconnect}
          setUploadedButWaitingWakeup={setUploadedButWaitingWakeup}
          setActiveTopicIndex={setActiveTopicIndex}
          extractYoutubeId={extractYoutubeId}
          pastSessions={pastSessions}
          handleLoadPastSession={handleLoadPastSession}
        />
      )}

      {/* =========================================
          SCREEN III: CLEAN IMMERSIVE CLASSROOM BOARD ROOM
          ========================================= */}
      {currentScreen === "classroom" && !showStudentAccountHub && (
        <div id="live-classroom-container" className="flex-1 flex flex-col justify-between w-full h-[100dvh] md:h-screen overflow-hidden relative bg-[#f8fafc]">
          
          {/* Subtle Mobile Top HUD - Sleek, Clean, Modern Light Header Bar matching Study Desk */}
          <header 
            className={`w-full bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-2 sm:px-5 py-1.5 sm:py-2.5 flex items-center justify-between gap-1 sm:gap-4 z-20 shrink-0 font-sans select-none transition-all duration-300 shadow-2xs overflow-x-auto no-scrollbar ${
              isFullScreenBoard ? "hidden" : "landscape:hidden"
            }`}
          >
            {/* Left: Class Info Header */}
            <div className="flex-shrink min-w-0 flex items-center gap-1.5 sm:gap-2.5 justify-start">
              <div className="hidden xs:flex w-7.5 h-7.5 sm:w-9.5 sm:h-9.5 rounded-xl items-center justify-center border border-slate-200 bg-slate-100 text-[#0a3641] flex-shrink-0 shadow-2xs">
                <GraduationCap className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" />
              </div>

              <div className="flex flex-col min-w-0 text-left">
                <span className="text-[10px] xs:text-xs sm:text-sm font-sans font-extrabold tracking-wide text-[#0a3641] uppercase truncate max-w-[65px] xs:max-w-[130px] sm:max-w-[240px]">
                  {studentDetails.subject || "Study Session"}
                </span>
                <span 
                  className="text-[7.5px] xs:text-[8px] sm:text-[9.5px] font-mono tracking-wider uppercase font-bold text-slate-500 truncate mt-0.5"
                >
                  {studentDetails.grade || "Grade 10"}
                </span>
              </div>
            </div>

            {/* Center: Live Control Center / Dynamic Island */}
            <div className="flex-shrink-0 flex items-center justify-center px-0.5 sm:px-1">
              {state === "disconnected" ? (
                <button
                  onClick={handlePowerToggle}
                  className="relative overflow-hidden px-2.5 py-1 xs:px-3.5 xs:py-1.5 sm:px-4.5 sm:py-2 rounded-full transition-all duration-300 active:scale-95 shadow-md shadow-rose-600/20 border border-rose-300/80 bg-gradient-to-r from-[#ff1053] to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white flex items-center gap-1 sm:gap-2 flex-shrink-0 cursor-pointer"
                >
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                  </span>
                  <span className="text-[8.5px] xs:text-[9px] sm:text-[10px] font-sans font-black tracking-widest text-white uppercase leading-none mt-[1px] whitespace-nowrap">
                    START CLASS
                  </span>
                </button>
              ) : (
                <div 
                  className="px-2 py-1 xs:px-2.5 xs:py-1.5 sm:px-4 sm:py-2 rounded-full border border-slate-200 bg-slate-50 flex items-center gap-1.5 sm:gap-2.5 shadow-xs transition-all duration-300 flex-shrink-0"
                >
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-500" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  
                  <span className="text-[8px] xs:text-[8.5px] sm:text-[9.5px] font-mono tracking-widest uppercase font-black text-[#0a3641] whitespace-nowrap">
                    {state === "connecting" ? "STARTING..." : "LIVE"}
                  </span>

                  {isRecording && (
                    <>
                      <div className="h-3 w-[1px] bg-slate-200" />
                      <div className="flex items-center gap-1 text-red-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse shrink-0" />
                        <span className="text-[8px] xs:text-[8.5px] font-mono font-bold tracking-wider uppercase leading-none whitespace-nowrap">
                          REC {recordingDuration}
                        </span>
                      </div>
                    </>
                  )}

                  <div className="h-3 w-[1px] bg-slate-200" />

                  <button
                    onClick={handlePowerToggle}
                    className="p-0.5 sm:p-1 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-all duration-200 active:scale-90 cursor-pointer shrink-0"
                    title="Halt Session / Recess"
                  >
                    <MicOff className="w-3.5 h-3.5 animate-pulse" />
                  </button>
                </div>
              )}
            </div>

            {/* Right: Glass Quick Actions Panel with Safe Touch Targets and Generous Spacing */}
            <div className="flex-shrink-0 flex items-center justify-end">
              <div 
                className="flex items-center gap-1 xs:gap-1.5 sm:gap-3 p-1 xs:p-1.5 sm:p-2 rounded-2xl border border-slate-200/90 bg-slate-50/90 shadow-2xs flex-shrink-0"
              >
                {/* Wipe Blackboard Trigger inside top header bar */}
                <button 
                  onClick={() => {
                    setDialogueHistory([]);
                    setCustomBoardContent("");
                    setTopicBoardsContent({});
                    addToast("Whiteboard wiped clean!", "success");
                  }}
                  className="w-8 h-8 xs:w-8.5 xs:h-8.5 sm:w-10 sm:h-10 rounded-xl text-rose-600 hover:bg-rose-50 hover:border-rose-300 active:scale-95 cursor-pointer transition-all duration-200 flex items-center justify-center bg-white border border-rose-200/80 shadow-2xs shrink-0"
                  title="Erase Chalkboard"
                >
                  <Trash2 className="w-3.5 h-3.5 xs:w-4 xs:h-4 sm:w-4.5 sm:h-4.5" />
                </button>

                {/* Change Blackboard Theme */}
                <button 
                  onClick={() => {
                    const themesList: ThemeType[] = Object.keys(THEME_CONFIGS) as ThemeType[];
                    const nextIdx = (themesList.indexOf(theme) + 1) % themesList.length;
                    handleThemeChange(themesList[nextIdx]);
                  }}
                  className="w-8 h-8 xs:w-8.5 xs:h-8.5 sm:w-10 sm:h-10 rounded-xl text-[#0a3641] hover:bg-slate-100 hover:border-slate-300 active:scale-95 cursor-pointer transition-all duration-200 flex items-center justify-center bg-white border border-slate-200/90 shadow-2xs shrink-0"
                  title="Change Blackboard Theme"
                >
                  <Palette className="w-3.5 h-3.5 xs:w-4 xs:h-4 sm:w-4.5 sm:h-4.5" />
                </button>

                {/* Direct Color Dots Background Selector (visible on sm+) */}
                <div className="hidden sm:flex items-center gap-2 px-2.5 border-l border-slate-200/90">
                  {(Object.keys(THEME_CONFIGS) as ThemeType[]).map((thmKey) => {
                    const thm = THEME_CONFIGS[thmKey];
                    const isActive = theme === thmKey;
                    const dotColor = thmKey === "ivory" ? "#ffffff" : thm.primary;
                    const borderClass = thmKey === "ivory" ? "border-zinc-300" : "border-transparent";
                    
                    return (
                      <button
                        key={thmKey}
                        onClick={() => handleThemeChange(thmKey)}
                        className={`w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full border ${borderClass} transition-all hover:scale-125 active:scale-90 cursor-pointer flex items-center justify-center relative ${
                          isActive 
                            ? "ring-2 ring-[#0a3641]/60 ring-offset-1 scale-110 shadow-xs" 
                            : "opacity-75 hover:opacity-100"
                        }`}
                        style={{ backgroundColor: dotColor }}
                        title={`${thmKey.charAt(0).toUpperCase() + thmKey.slice(1)} Blackboard Background`}
                      >
                        {isActive && (
                          <span 
                            className={`w-1 h-1 rounded-full ${
                              thmKey === "ivory" ? "bg-zinc-800" : "bg-white"
                            }`} 
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Ambient Focus Headphones Audio Button */}
                <div className="shrink-0 flex items-center justify-center">
                  <AmbientFocusAudio primaryColor={activeColors.primary} accentColor={activeColors.accent} compact={true} />
                </div>

                {/* Full Screen Mode Toggle Button */}
                <button 
                  onClick={() => {
                    setIsFullScreenBoard(!isFullScreenBoard);
                    addToast(
                      `Blackboard Full Fit ${!isFullScreenBoard ? "Enabled" : "Disabled"}`, 
                      "info"
                    );
                  }}
                  className="w-8 h-8 xs:w-8.5 xs:h-8.5 sm:w-10 sm:h-10 rounded-xl text-slate-700 hover:bg-slate-100 hover:border-slate-300 active:scale-95 cursor-pointer transition-all duration-200 flex items-center justify-center bg-white border border-slate-200/90 shadow-2xs shrink-0"
                  title="Toggle Full Screen Fit Mode"
                >
                  {isFullScreenBoard ? (
                    <Minimize2 className="w-3.5 h-3.5 xs:w-4 xs:h-4 sm:w-4.5 sm:h-4.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5 xs:w-4 xs:h-4 sm:w-4.5 sm:h-4.5" />
                  )}
                </button>

                {/* YouTube Video Source Toggle Button */}
                {activeDocument && activeDocument.mimeType === "video/youtube" && (
                  <button
                    onClick={() => setShowMobileYtPlayer(!showMobileYtPlayer)}
                    className={`w-8 h-8 xs:w-8.5 xs:h-8.5 sm:w-10 sm:h-10 rounded-xl transition-all duration-200 flex items-center justify-center active:scale-95 cursor-pointer border shadow-2xs shrink-0 ${
                      showMobileYtPlayer ? "bg-red-50 text-red-600 border-red-200 font-bold" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                    title="Watch YouTube Source Video"
                  >
                    <Youtube className="w-3.5 h-3.5 xs:w-4 xs:h-4 sm:w-4.5 sm:h-4.5" />
                  </button>
                )}
              </div>
            </div>
          </header>

          {/* Core Interactive Blackboard Slate Section */}
          <div className="flex-1 flex flex-col relative min-h-0 w-full overflow-hidden">
            
            {/* WHITE BOARD: Spans entire layout width & height, floats inside a nice padded card on desktop */}
            <div className={`w-full flex-1 md:aspect-auto md:flex-1 shrink-0 landscape:aspect-auto landscape:flex-1 landscape:h-full flex flex-col relative min-h-0 bg-[#f8fafc] transition-all duration-300 ${
              isFullScreenBoard ? "p-0" : "p-3 md:p-6"
            }`}>
              
              {/* Mobile YouTube Video Banner Overlay */}
              {showMobileYtPlayer && activeDocument?.mimeType === "video/youtube" && (() => {
                const matchYtId = activeDocument?.filename?.match(/\(ID:\s*([a-zA-Z0-9_-]{11})\)/);
                const currentVideoId = matchYtId ? matchYtId[1] : null;
                if (!currentVideoId) return null;
                return (
                  <div className="w-full bg-white border-b border-red-100 p-2 space-y-1.5 animate-fade-in text-left z-20 absolute top-0 inset-x-0 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-red-600 text-[9px] font-mono font-black uppercase">
                        <Youtube className="w-3 h-3 text-red-600 animate-pulse" />
                        <span>Source Video</span>
                      </div>
                      <button
                        onClick={() => setShowMobileYtPlayer(false)}
                        className="text-[8px] font-bold text-red-600 hover:text-red-750 px-1.5 py-0.5 border border-red-200 rounded"
                      >
                        ✕ Close
                      </button>
                    </div>
                    <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black shadow-lg">
                      <iframe
                        src={`https://www.youtube.com/embed/${currentVideoId}?autoplay=0&rel=0`}
                        title="Chalkboard YouTube Mobile reference"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="absolute top-0 left-0 w-full h-full border-0"
                      />
                    </div>
                  </div>
                );
              })()}

              {uploadedButWaitingWakeup ? (
                <ClassroomBoard
                  latestSpeech=""
                  state={state}
                  primaryColor={activeColors.primary}
                  accentColor={activeColors.accent}
                  onClearBoard={() => {
                    setDialogueHistory([]);
                    setCustomBoardContent("");
                    setTopicBoardsContent({});
                  }}
                  onSelectPrompt={handleSelectPrompt}
                  overrideBlank={true}
                  activeDocumentText={activeDocument?.markdown || ""}
                  hasActiveDocument={!!activeDocument}
                  studentAskedForWritingOrDrawing={studentAskedForWritingOrDrawing}
                  isFullScreen={isFullScreenBoard}
                  onToggleFullScreen={() => setIsFullScreenBoard(!isFullScreenBoard)}
                  cherryVolume={cherryVolume}
                  onOpenSyllabus={handleOpenSyllabus}
                  onWakeUp={handlePowerToggle}
                  teachingPhase={teachingPhase}
                  customBoardContent={customBoardContent}
                  onSaveSnapshot={handleManualSaveSnapshot}
                  topics={topics}
                  activeTopicIndex={activeTopicIndex}
                  topicBoardsContent={topicBoardsContent}
                  onSyncBoardContent={handleSyncBoardContent}
                  detectedSubject={activeDocument?.detectedSubject}
                  onCanvasRef={setMainCanvas}
                />
              ) : state === "connecting" ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-2 bg-[#0c201a] blackboard-chalk m-1.5 rounded-lg min-h-[220px]">
                  <RefreshCw className="w-6 h-6 text-amber-500 animate-spin" />
                  <p className="text-zinc-400 text-[10px] font-mono tracking-widest uppercase">Preparing Blackboard slides...</p>
                </div>
              ) : (
                <ClassroomBoard
                  latestSpeech={latestSpeechText}
                  state={state}
                  primaryColor={activeColors.primary}
                  accentColor={activeColors.accent}
                  onClearBoard={() => {
                    setDialogueHistory([]);
                    setCustomBoardContent("");
                    setTopicBoardsContent({});
                  }}
                  onSelectPrompt={handleSelectPrompt}
                  activeDocumentText={activeDocument?.markdown || ""}
                  hasActiveDocument={!!activeDocument}
                  studentAskedForWritingOrDrawing={studentAskedForWritingOrDrawing}
                  isFullScreen={isFullScreenBoard}
                  onToggleFullScreen={() => setIsFullScreenBoard(!isFullScreenBoard)}
                  cherryVolume={cherryVolume}
                  onOpenSyllabus={handleOpenSyllabus}
                  onWakeUp={handlePowerToggle}
                  teachingPhase={teachingPhase}
                  customBoardContent={customBoardContent}
                  onSaveSnapshot={handleManualSaveSnapshot}
                  topics={topics}
                  activeTopicIndex={activeTopicIndex}
                  topicBoardsContent={topicBoardsContent}
                  onSyncBoardContent={handleSyncBoardContent}
                  detectedSubject={activeDocument?.detectedSubject}
                  onCanvasRef={setMainCanvas}
                />
              )}

              {/* FLOATING SUBTITLE FEED ON BOARD */}
              {showCaptions && dialogueHistory.length > 0 && (
                <div className="absolute bottom-4 inset-x-3 z-20 pointer-events-none flex justify-center">
                  <div className="bg-white/95 backdrop-blur-md border border-[#0a3641]/20 text-[#0a3641] px-3.5 py-2 rounded-xl shadow-md text-[10px] text-center max-w-sm animate-bounce-short leading-relaxed pointer-events-auto font-medium">
                    <span className="font-mono text-[#486a73] text-[8px] block uppercase tracking-wider mb-0.5 font-bold">Cherry Ma'am:</span>
                    <p className="italic">
                      &quot;{dialogueHistory.filter((item) => item.sender === "cherry").slice(-1)[0]?.text || "Speak loudly, let's learn!"}&quot;
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* FLOATING QUICK DOUBT BUTTON & POPOVER */}
            <QuickDoubtWidget
              state={state}
              onInjectPrompt={injectPromptText}
              onToast={addToast}
              setDialogueHistory={setDialogueHistory}
            />

          </div>

        </div>
      )}

      {/* Full Screen Quiz Overlay Modal */}
      <AnimatePresence>
        {isQuizFullScreenOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-[#0a3641]/40 backdrop-blur-md z-55 flex flex-col justify-center items-center p-0 md:p-6"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white md:rounded-[24px] w-full h-full md:h-auto max-w-none md:max-w-lg shadow-[0_20px_50px_rgba(10,54,65,0.2)] border-0 md:border border-slate-200 flex flex-col max-h-screen md:max-h-[90vh] overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 pt-10 pb-4 md:pt-4 border-b border-slate-100 bg-[#0a3641] text-white shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="bg-[#c4f500] p-1.5 rounded-xl">
                    <Brain className="w-4 h-4 text-[#0a3641] font-black" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-[11px] font-black uppercase tracking-wider text-white leading-none">Quick Quiz Desk</h3>
                    <p className="text-[8.5px] text-[#c4f500] font-bold tracking-wide mt-0.5 uppercase">Test your knowledge live!</p>
                  </div>
                </div>
                
                <button
                  onClick={() => setIsQuizFullScreenOpen(false)}
                  className="p-1.5 hover:bg-white/10 active:scale-95 text-slate-200 hover:text-white rounded-xl transition-all cursor-pointer font-bold flex items-center gap-1.5"
                >
                  <span className="text-[8.5px] uppercase font-extrabold tracking-widest mr-0.5 hidden sm:inline">Close</span>
                  <XCircle className="w-5 h-5 text-red-400 hover:text-red-300 transition-colors" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 overflow-y-auto no-scrollbar flex-1 bg-slate-50/50">
                <QuickQuizView
                  subject={studentDetails.subject}
                  grade={studentDetails.grade}
                  state={state}
                  onInjectPrompt={injectPromptText}
                  onToast={addToast}
                  topics={topics}
                  activeTopicIndex={activeTopicIndex}
                  customBoardContent={customBoardContent}
                  topicBoardsContent={topicBoardsContent}
                  sessionId={sessionId}
                />
              </div>
              
              {/* Modal Footer */}
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-center shrink-0">
                <span className="text-[8px] font-mono font-extrabold tracking-widest text-[#486a73] uppercase">
                  CHERRY MA'AM CLASSROOM • LEARN WITH FUN
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HELP INSTRUCTIONS & SIDEBAR DRAWER PANEL */}
      <AnimatePresence>
        {showTips && (
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="w-full bg-white border-t border-[#dae1dd] p-6 z-20"
          >
            <div className="max-w-xl mx-auto space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-[#dae1dd] pb-2.5">
                <h3 className="text-sm font-mono tracking-wider text-[#0a3641] uppercase flex items-center gap-1.5 font-bold"><GraduationCap className="w-4 h-4 text-[#0a3641]"/> Class Information & Tips</h3>
                <button 
                  id="close-tips-btn"
                  onClick={() => setShowTips(false)} 
                  className="text-xs text-[#486a73] hover:text-[#0a3641] underline cursor-pointer font-bold"
                >
                  Close
                </button>
              </div>
              <ul className="text-xs text-[#486a73] space-y-2.5 list-disc pl-4 leading-relaxed p-1 font-medium">
                <li>
                  <strong className="text-[#0a3641]">Live Voice Learning</strong>: Cherry Ma'am communicates strictly over live interactive audio. No boring typing inputs required—just speak casually!
                </li>
                <li>
                  <strong className="text-[#0a3641]">Hinglish Medium</strong>: Ask in a blend of Hindi & English. She responds in a friendly, conversational mix of casual Hinglish, like a super-smart buddy.
                </li>
                <li>
                  <strong className="text-[#0a3641]">Math & Science Formulas</strong>: Ask for Maths calculations, Physics numerical equations, or Chemical bonds. She outputs formatted LaTeX equations, rendered live in pristine blackboard style on screen!
                </li>
                <li>
                  <strong className="text-[#0a3641]">Speech and Typing Parity</strong>: The blackboard typewriter automatically tracks and coordinates characters rendering dynamically matched with the exact pacing of her vocalization.
                </li>
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DRAWER FOOTER LOGO CREDITS (rendered only when on home screen for pristine cleanliness on board) */}
      {currentScreen === "home" && !showStudentAccountHub && (
        <footer className="w-full text-center py-4 border-t border-[#dae1dd] text-[10px] font-mono tracking-widest text-[#486a73] z-10 select-none font-bold">
          CHERRY MA'AM • THE SASSY INTERACTIVE CLASSROOM • POWERED BY GEMINI LIVE BIDIRECTIONAL BATCH
        </footer>
      )}

      {/* Dynamic Student Account overlays & Whiteboard Camera Snapper */}
      <AnimatePresence>
        {showStudentAccountHub && (
          <StudentAccountHub
            onClose={() => setShowStudentAccountHub(false)}
            studentName={studentDetails.name}
            grade={studentDetails.grade}
            subject={studentDetails.subject}
            board={studentDetails.board}
            mediumOfLearning={studentDetails.mediumOfLearning}
            totalSessionsCount={pastSessions.length}
            customBoardContent={customBoardContent}
            pastSessions={pastSessions}
            sessionSnapshots={sessionSnapshots}
            topics={topics}
            activeTopicIndex={activeTopicIndex}
            topicBoardsContent={topicBoardsContent}
            sessionId={sessionId}
            recordingsRevision={recordingsRevision}
            onEnterClassroom={() => {
              setCurrentScreen("classroom");
              setShowStudentAccountHub(false);
            }}
            onRefreshProfile={async () => {
              if (user) {
                try {
                  const profileRef = doc(db, "studentProfiles", user.uid);
                  let profileSnap;
                  try {
                    profileSnap = await getDoc(profileRef);
                  } catch (dbErr: any) {
                    console.warn("Could not load profile from Firestore on refresh (offline/unreachable):", dbErr);
                    // Fallback to localStorage
                    const cachedProfile = localStorage.getItem(`studentProfile_${user.uid}`);
                    if (cachedProfile) {
                      const data = JSON.parse(cachedProfile);
                      setStudentDetails({
                        name: data.name || "",
                        grade: data.grade || "Class 10",
                        subject: data.subject || "Mathematics",
                        board: data.board || "CBSE",
                        mediumOfLearning: data.mediumOfLearning || "Hinglish"
                      });
                    }
                    return;
                  }

                  if (profileSnap && profileSnap.exists()) {
                     const data = profileSnap.data();
                     const profileData = {
                       name: data.name || "",
                       grade: data.grade || "Class 10",
                       subject: data.subject || "Mathematics",
                       board: data.board || "CBSE",
                       mediumOfLearning: data.mediumOfLearning || "Hinglish"
                     };
                     setStudentDetails(profileData);
                     localStorage.setItem(`studentProfile_${user.uid}`, JSON.stringify(profileData));
                  }
                } catch (e: any) {
                  console.warn("Failed refreshing active settings gracefully (offline):", e.message || e);
                }
              }
            }}
          />
        )}

        {showOnboarding && (
          <StudentOnboardingForm
            initialName={studentDetails.name}
            onSubmit={handleOnboardingSubmit}
          />
        )}

        {showLoginModal && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-3 overflow-y-auto no-scrollbar">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-teal-100/50 overflow-hidden relative my-auto"
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={() => setShowLoginModal(false)}
                className="absolute top-4 right-4 text-slate-450 hover:text-slate-700 transition-colors w-8 h-8 rounded-full bg-slate-100/80 hover:bg-slate-200/80 flex items-center justify-center cursor-pointer font-bold text-xs"
              >
                ✕
              </button>

              {/* Header Banner */}
              <div className="bg-[#0a3641] px-6 py-6 text-white relative text-center">
                <div className="w-12 h-12 rounded-xl bg-[#c4f500]/10 border border-[#c4f500]/20 flex items-center justify-center mx-auto mb-3 text-[#c4f500]">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold tracking-tight">Student Login & Registration</h3>
                <p className="text-teal-100/70 text-[11px] mt-1 max-w-xs mx-auto font-medium">
                  Connect your profile to save stats, classroom sessions, and custom syllabi.
                </p>
              </div>

              {/* Login Modal Body */}
              <div className="p-6 space-y-5 text-left">
                {/* Fast Access via Google */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#486a73] block">
                    Fast Access via Cloud Profile
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await handleGoogleSignIn();
                        setShowLoginModal(false);
                      } catch (err) {
                        console.error("Popup Error:", err);
                      }
                    }}
                    className="w-full bg-white hover:bg-slate-50 text-[#0a3641] border border-[#dae1dd] py-3 px-4 rounded-xl flex items-center justify-center gap-2.5 transition-all shadow-sm cursor-pointer text-xs font-bold hover:border-[#0a3641]/40"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Login with Google Account</span>
                  </button>
                </div>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-[#dae1dd]"></div>
                  <span className="flex-shrink mx-3 text-[10px] font-mono text-slate-400 font-bold uppercase">Or Guest Access / या बिना अकाउंट</span>
                  <div className="flex-grow border-t border-[#dae1dd]"></div>
                </div>

                {/* Anonymous Guest Registration */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!studentDetails.name.trim()) {
                      addToast("Please tell us your name first to sit on the desk! 🧑‍🎓", "error");
                      return;
                    }

                    try {
                      let currentUser = auth.currentUser || user;
                      if (!currentUser) {
                        try {
                          const anonResult = await signInAnonymously(auth);
                          currentUser = anonResult.user;
                        } catch (anonErr) {
                          console.warn("Anonymous registration failed, using guest fallback:", anonErr);
                          currentUser = {
                            uid: "local_guest_student",
                            displayName: studentDetails.name,
                            isAnonymous: true,
                          } as any;
                          setUser(currentUser);
                          localStorage.setItem("local_active_user", JSON.stringify(currentUser));
                        }
                      }

                      if (currentUser) {
                        const localProfile = {
                          name: studentDetails.name,
                          grade: studentDetails.grade,
                          subject: studentDetails.subject || "Mathematics",
                          board: studentDetails.board || "CBSE",
                          mediumOfLearning: studentDetails.mediumOfLearning || "Hinglish",
                        };
                        localStorage.setItem(`studentProfile_${currentUser.uid}`, JSON.stringify(localProfile));

                        if (currentUser.uid !== "local_guest_student" && !currentUser.uid.startsWith("local_")) {
                          const profileRef = doc(db, "studentProfiles", currentUser.uid);
                          setDoc(profileRef, {
                            userId: currentUser.uid,
                            ...localProfile,
                            updatedAt: serverTimestamp()
                          }).then(() => {
                            loadPastSessions(currentUser!.uid);
                          }).catch((dbErr: any) => {
                            console.warn("Firestore guest profile issue background:", dbErr);
                          });
                        } else {
                          loadPastSessions(currentUser.uid);
                        }
                        addToast(`Namaste, ${studentDetails.name}! Profile set up successfully! 🎒✨`, "success");
                      }
                      setShowLoginModal(false);
                      setCurrentScreen("syllabus");
                    } catch (err: any) {
                      console.error("Auth routing exception:", err);
                      setShowLoginModal(false);
                      setCurrentScreen("syllabus");
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-mono font-bold text-[#486a73] block">
                      Student Name / आपका नाम
                    </label>
                    <input
                      type="text"
                      required
                      value={studentDetails.name}
                      onChange={(e) => setStudentDetails({ ...studentDetails, name: e.target.value })}
                      placeholder="E.g., Nehal Sharma"
                      className="w-full bg-[#f7f9f6] border border-[#dae1dd] focus:border-[#0a3641] focus:ring-1 focus:ring-[#0a3641]/20 rounded-xl px-3.5 py-2.5 text-xs text-[#0a3641] placeholder-[#486a73]/50 outline-none transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-mono font-bold text-[#486a73] block">
                      Your Grade Level / क्लास
                    </label>
                    <div className="relative">
                      <select
                        value={studentDetails.grade}
                        onChange={(e) => setStudentDetails({ ...studentDetails, grade: e.target.value })}
                        className="w-full bg-[#f7f9f6] text-[#0a3641] border border-[#dae1dd] focus:border-[#0a3641] rounded-xl px-3.5 py-2.5 text-xs outline-none appearance-none cursor-pointer font-medium"
                      >
                        <option value="Class 6">Class 6</option>
                        <option value="Class 7">Class 7</option>
                        <option value="Class 8">Class 8</option>
                        <option value="Class 9">Class 9</option>
                        <option value="Class 10">Class 10</option>
                        <option value="Class 11">Class 11</option>
                        <option value="Class 12">Class 12</option>
                      </select>
                      <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-slate-400 font-bold text-[9px]">
                        ▼
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#0a3641] hover:bg-[#124e5d] text-white font-extrabold text-xs py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer select-none"
                  >
                    <span>Register & Study 🎒</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </form>
              </div>

              <div className="border-t border-[#dae1dd] py-3.5 bg-slate-50 text-center">
                <span className="text-[9px] font-mono font-bold text-[#486a73] flex items-center justify-center gap-1">
                  🔒 Encrypted instant guest/google session setup
                </span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

          </div> {/* Closing scrolling active viewport box */}

          {/* =========================================
              SMART MOBILE NATIVE BOTTOM TAB BAR (HIGH FIDELITY NAVIGATION)
              ========================================= */}
          <div className={`w-full bg-white/95 backdrop-blur-md border-t border-slate-200/80 py-1.5 px-3 flex items-center justify-between shrink-0 z-40 select-none ${
            isFullScreenBoard ? "hidden" : "landscape:hidden"
          }`}
            style={{
              boxShadow: "0 -4px 16px rgba(0, 0, 0, 0.04)"
            }}
          >
            {/* 1. Home Button */}
            <button
              onClick={() => {
                setCurrentScreen("home");
                setShowStudentAccountHub(false);
                setIsQuizFullScreenOpen(false);
              }}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all duration-300 relative ${
                (currentScreen === "home" && !showStudentAccountHub && !isQuizFullScreenOpen) ? "text-[#0a3641] scale-105" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Home className={`w-4.5 h-4.5 transition-all ${(currentScreen === "home" && !showStudentAccountHub && !isQuizFullScreenOpen) ? "stroke-[2.5px] text-[#0a3641]" : "stroke-[2px]"}`} />
              <span className="text-[8px] font-bold mt-1 tracking-tight leading-none">Home</span>
              <span className="text-[7px] font-mono opacity-85 mt-0.5 leading-none">होम</span>
              {(currentScreen === "home" && !showStudentAccountHub && !isQuizFullScreenOpen) && (
                <span className="absolute bottom-0 w-4 h-0.5 bg-[#0a3641] rounded-full" />
              )}
            </button>

            {/* 2. Desk Button */}
            <button
              onClick={() => {
                if (!user) {
                  setShowLoginModal(true);
                  addToast("Please login/register to access Study Desk!", "info");
                } else if (!studentDetails.name) {
                  setShowOnboarding(true);
                  addToast("Please complete your profile first!", "info");
                } else {
                  setCurrentScreen("syllabus");
                  setShowStudentAccountHub(false);
                  setIsQuizFullScreenOpen(false);
                }
              }}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all duration-300 relative ${
                (currentScreen === "syllabus" && !showStudentAccountHub && !isQuizFullScreenOpen) ? "text-[#0a3641] scale-105" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <BookOpen className={`w-4.5 h-4.5 transition-all ${(currentScreen === "syllabus" && !showStudentAccountHub && !isQuizFullScreenOpen) ? "stroke-[2.5px] text-[#0a3641]" : "stroke-[2px]"}`} />
              <span className="text-[8px] font-bold mt-1 tracking-tight leading-none">Desk</span>
              <span className="text-[7px] font-mono opacity-85 mt-0.5 leading-none">डेस्क</span>
              {(currentScreen === "syllabus" && !showStudentAccountHub && !isQuizFullScreenOpen) && (
                <span className="absolute bottom-0 w-4 h-0.5 bg-[#0a3641] rounded-full" />
              )}
            </button>

            {/* 3. Central Quiz Button (Elevated Action Button with Glowing Pulse Ring) */}
            <div className="flex-1 flex flex-col items-center justify-center -translate-y-2 relative">
              <div className="absolute -inset-1.5 bg-[#c4f500]/40 rounded-full blur-md opacity-80 animate-pulse" />
              <button
                onClick={() => {
                  if (!user) {
                    setShowLoginModal(true);
                    addToast("Please login/register to play Quick Quiz!", "info");
                  } else {
                    setIsQuizFullScreenOpen(true);
                    setShowStudentAccountHub(false);
                  }
                }}
                className={`relative p-2.5 bg-gradient-to-tr border rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 shadow-[0_4px_16px_rgba(10,54,65,0.25)] active:scale-90 ${
                  isQuizFullScreenOpen 
                    ? "from-[#c4f500] to-[#e4ff66] border-[#c4f500] text-[#0a3641]" 
                    : "from-[#0a3641] to-[#0d4756] border-[#0a3641]/20 hover:border-[#c4f500]/40 text-[#c4f505]"
                }`}
                title="Start Quick Quiz"
              >
                {/* Badge of sparkle */}
                <div className="absolute -top-1 -right-1 bg-[#c4f500] text-[#0a3641] p-0.5 rounded-full animate-pulse shadow-xs border border-[#0a3641]/20">
                  <Sparkles className="w-2.5 h-2.5" />
                </div>
                <Brain className={`w-4.5 h-4.5 font-black ${isQuizFullScreenOpen ? "text-[#0a3641]" : "text-[#c4f505]"}`} />
              </button>
              <span className="text-[8px] font-black mt-1 text-[#0a3641] leading-none">Quiz</span>
              <span className="text-[7px] font-mono font-bold text-[#486a73] leading-none">क्विज़</span>
            </div>

            {/* 4. Classroom Button */}
            <button
              onClick={() => {
                if (!user) {
                  setShowLoginModal(true);
                  addToast("Please login/register to join the classroom!", "info");
                } else if (!studentDetails.name) {
                  setShowOnboarding(true);
                  addToast("Please complete your profile first!", "info");
                } else {
                  setCurrentScreen("classroom");
                  setShowStudentAccountHub(false);
                  setIsQuizFullScreenOpen(false);
                }
              }}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all duration-300 relative ${
                (currentScreen === "classroom" && !showStudentAccountHub && !isQuizFullScreenOpen) ? "text-[#0a3641] scale-105" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <GraduationCap className={`w-4.5 h-4.5 transition-all ${(currentScreen === "classroom" && !showStudentAccountHub && !isQuizFullScreenOpen) ? "stroke-[2.5px] text-[#0a3641]" : "stroke-[2px]"}`} />
              <span className="text-[8px] font-bold mt-1 tracking-tight leading-none">Class</span>
              <span className="text-[7px] font-mono opacity-85 mt-0.5 leading-none">क्लास</span>
              {(currentScreen === "classroom" && !showStudentAccountHub && !isQuizFullScreenOpen) && (
                <span className="absolute bottom-0 w-4 h-0.5 bg-[#0a3641] rounded-full" />
              )}
            </button>

            {/* 5. Profile / Account Hub Button */}
            <button
              onClick={() => {
                if (!user) {
                  setShowLoginModal(true);
                  addToast("Please login/register to view your profile!", "info");
                } else {
                  setShowStudentAccountHub(true);
                  setIsQuizFullScreenOpen(false);
                }
              }}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all duration-300 relative ${
                (showStudentAccountHub && !isQuizFullScreenOpen) ? "text-[#0a3641] scale-105" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <User className={`w-4.5 h-4.5 transition-all ${(showStudentAccountHub && !isQuizFullScreenOpen) ? "stroke-[2.5px] text-[#0a3641]" : "stroke-[2px]"}`} />
              <span className="text-[8px] font-bold mt-1 tracking-tight leading-none">Profile</span>
              <span className="text-[7px] font-mono opacity-85 mt-0.5 leading-none">प्रोफाइल</span>
              {(showStudentAccountHub && !isQuizFullScreenOpen) && (
                <span className="absolute bottom-0 w-4 h-0.5 bg-[#0a3641] rounded-full" />
              )}
            </button>
          </div>

          {/* GLOBAL PENDING RECORDING CONFIRMATION MODAL */}
          <AnimatePresence>
            {pendingRecording && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 bg-[#0a3641]/60 backdrop-blur-md z-[60] flex flex-col justify-center items-center p-4"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 15 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  className="bg-white rounded-[24px] w-full max-w-sm shadow-[0_25px_60px_rgba(10,54,65,0.25)] border border-slate-100 flex flex-col overflow-hidden max-h-[90%] my-auto"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-4 bg-[#0a3641] text-white shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className="bg-[#c4f500] p-1.5 rounded-xl">
                        <Video className="w-4 h-4 text-[#0a3641]" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-xs font-black uppercase tracking-wider text-white leading-none">Lesson Concluded</h3>
                        <p className="text-[9px] text-[#c4f500] font-bold tracking-wide mt-0.5 uppercase">Save Confirmation</p>
                      </div>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-6 text-center bg-slate-50/50 flex-1 overflow-y-auto no-scrollbar">
                    <div className="w-16 h-16 bg-[#0a3641]/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100 shrink-0">
                      <Video className="w-8 h-8 text-[#0a3641]" />
                    </div>
                    
                    <h4 className="text-sm font-bold text-slate-800 mb-1">
                      Save your Blackboard Video Recording?
                    </h4>
                    <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                      The classroom lesson has ended. Choose whether to save this interactive lecture recording to the Student Profile, download it directly, or discard it.
                    </p>

                    {/* Recording Stats */}
                    <div className="bg-white rounded-2xl border border-slate-100 p-4 text-left space-y-2.5 mb-6 shadow-sm">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">Topic Title:</span>
                        <span className="font-semibold text-slate-700 max-w-[150px] truncate">{pendingRecording.topicTitle}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">Subject:</span>
                        <span className="font-semibold text-slate-700 uppercase tracking-wider text-[10px] bg-slate-100 px-2 py-0.5 rounded-full">{pendingRecording.subject}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">Duration:</span>
                        <span className="font-bold text-slate-800 bg-[#c4f500]/20 text-[#0a3641] px-2.5 py-0.5 rounded-full font-mono">{pendingRecording.duration}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">File Size:</span>
                        <span className="font-semibold text-slate-700 font-mono">
                          {((pendingRecording.blob?.size || pendingRecording.arrayBuffer?.byteLength || 0) / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>
                    </div>

                    {/* Actions Grid */}
                    <div className="space-y-2.5">
                      {/* Save Action */}
                      <button
                        onClick={() => savePendingRecording()}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#0a3641] hover:bg-[#0f4553] active:scale-[0.99] text-[#c4f500] font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Save to Student Profile</span>
                      </button>

                      {/* Download Action */}
                      <button
                        onClick={() => downloadPendingRecording()}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-100 hover:bg-slate-200 active:scale-[0.99] text-[#0a3641] font-bold text-xs rounded-xl transition-all cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download Recording File (.webm)</span>
                      </button>

                      {/* Discard Action */}
                      <button
                        onClick={() => {
                          if (window.confirm("Are you absolutely sure you want to discard this recording? It will be permanently lost.")) {
                            discardPendingRecording();
                          }
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 hover:bg-red-50 text-red-500 font-bold text-xs rounded-xl transition-all cursor-pointer border border-transparent hover:border-red-100 mt-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Discard Recording</span>
                      </button>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-center shrink-0">
                    <span className="text-[8px] font-mono font-extrabold tracking-widest text-[#486a73] uppercase">
                      CHERRY MA'AM CLASSROOM • RECORDING HUB
                    </span>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

        </div> {/* Closing The App Main Viewport wrapper */}
      </div> {/* Closing Modern High-Fidelity Mobile Device Frame Mockup */}

      {/* LEARNER PROFILE MEMORY, WEAK TOPICS & DPDP 2023 HUB MODAL */}
      <LearnerProfileModal
        isOpen={isLearnerProfileModalOpen}
        onClose={() => setIsLearnerProfileModalOpen(false)}
        onToast={addToast}
      />

      {/* ABSOLUTE FLOATING SYSTEM TOAST notifications */}
      {currentScreen !== "classroom" && (
        <div id="toast-container" className="absolute top-20 right-6 z-50 flex flex-col space-y-2 pointer-events-none max-w-sm">
          <AnimatePresence>
            {toasts.map((toast) => (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, x: 50, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 50, scale: 0.9 }}
                className={`p-3.5 rounded-xl border backdrop-blur-md shadow-lg flex items-center space-x-2.5 text-xs font-mono pointer-events-auto select-none ${
                  toast.type === "success" 
                    ? "bg-white border-[#dae1dd] text-[#0a3641] font-bold"
                    : toast.type === "error"
                    ? "bg-red-50 border-red-200 text-red-700 font-bold"
                    : "bg-white border-zinc-250 text-zinc-700"
                }`}
              >
                <Sparkles className="w-4 h-4 shrink-0 text-[#0a3641]" />
                <span>{toast.message}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

    </div>
  );
}
