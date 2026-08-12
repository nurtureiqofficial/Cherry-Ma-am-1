import React, { useState, useEffect, useRef } from "react";
import { MathRenderer } from "./MathRenderer";
import { motion } from "motion/react";

interface ChalkTypewriterProps {
  text: string;
  state?: string;       // e.g. "speaking", "listening", "idle", etc.
  cherryVolume?: number; // 0.0 to 1.0 (real-time voice volume)
  latestSpeech?: string;
  isAcademicNotes?: boolean;
  isFallback?: boolean;
}

/**
 * Adaptive Latency Buffer & Audio Stream Alignment Helper
 * Computes the character index in currentTarget that matches the last completed word
 * processed in the audio stream (latestSpeech).
 */
function findSpeechAlignmentIndex(currentTarget: string, latestSpeech?: string): number | null {
  if (!latestSpeech || !latestSpeech.trim() || !currentTarget || !currentTarget.trim()) {
    return null;
  }

  // Clean and normalize speech text
  const cleanSpeech = latestSpeech
    .replace(/[#*`_~$\-\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const speechWords = cleanSpeech.split(" ").filter(w => w.length > 1);
  if (speechWords.length === 0) return null;

  // Clean target text for matching
  const cleanTarget = currentTarget.toLowerCase();

  // Try matching a phrase of the last 3 to 4 words from speech
  for (let windowSize = Math.min(4, speechWords.length); windowSize >= 1; windowSize--) {
    const phrase = speechWords.slice(-windowSize).join(" ");
    if (phrase.length < 3) continue;

    const matchIdx = cleanTarget.lastIndexOf(phrase);
    if (matchIdx !== -1) {
      // Return character index after the matched phrase
      return matchIdx + phrase.length;
    }
  }

  // Fallback: check last individual word if long enough (>3 chars)
  const lastWord = speechWords[speechWords.length - 1];
  if (lastWord && lastWord.length >= 4) {
    const matchIdx = cleanTarget.lastIndexOf(lastWord);
    if (matchIdx !== -1) {
      return matchIdx + lastWord.length;
    }
  }

  return null;
}

interface SectionBoundary {
  index: number;
  headerText: string;
  keywords: string[];
}

function getSectionHeaderKeywords(headerText: string): string[] {
  const lower = headerText.toLowerCase();
  
  if (lower.includes("poll") || lower.includes("prediction") || lower.includes("❓") || lower.includes("question") || lower.includes("sawaal") || lower.includes("option")) {
    return ["poll", "prediction", "sawaal", "sawal", "prashna", "question", "option", "chuno", "kya lagta", "socho", "a)", "b)", "dhoondho", "jawab", "batao", "inertia", "option a", "option b", "what do you think", "brake", "bus", "aage", "kyu", "kaise", "suno", "pucho"];
  }
  if (lower.includes("source") || lower.includes("📖") || lower.includes("definition") || lower.includes("content")) {
    return ["source", "content", "definition", "paribhasha", "equation", "formula", "text", "padhte", "dekho", "shuru", "arth"];
  }
  if (lower.includes("decode") || lower.includes("💡") || lower.includes("cherry") || lower.includes("analogy")) {
    return ["decode", "simple decode", "cherry's decode", "analogy", "asani", "samjho", "moti baat", "meaning", "daily life", "rasoi"];
  }
  if (lower.includes("pitfall") || lower.includes("trap") || lower.includes("⚠️") || lower.includes("mistake")) {
    return ["pitfall", "trap", "exam pitfall", "mistake", "examiner", "galti", "dhyan", "warning", "savdhan", "alert"];
  }
  if (lower.includes("formula") || lower.includes("📐") || lower.includes("equation")) {
    return ["formula", "core formula", "sutra", "equation", "katex", "si unit"];
  }
  if (lower.includes("mnemonic") || lower.includes("jugad") || lower.includes("jugaad") || lower.includes("🧠")) {
    return ["mnemonic", "jugad", "jugaad", "memory trick", "trick yaad"];
  }
  if (lower.includes("worked example") || lower.includes("deep dive") || lower.includes("🔬")) {
    return ["worked example", "numerical", "deep dive", "calculation", "step 1"];
  }
  if (lower.includes("topper") || lower.includes("keyword") || lower.includes("🎯")) {
    return ["topper", "exam keyword", "marking scheme", "full marks"];
  }
  if (lower.includes("diagram") || lower.includes("figure") || lower.includes("vector")) {
    return ["diagram", "chitra", "figure", "visual"];
  }
  
  return headerText
    .replace(/[#*`_~$\-\[\]():]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function parseSectionBoundaries(text: string): SectionBoundary[] {
  if (!text) return [];
  const boundaries: SectionBoundary[] = [];
  const regex = /(?:^|\n)(#{1,3}\s+[^\n]+)/g;
  let match: RegExpExecArray | null;
  
  while ((match = regex.exec(text)) !== null) {
    const fullMatch = match[0];
    const headerLine = match[1].trim();
    const matchIndex = match.index + (fullMatch.startsWith("\n") ? 1 : 0);
    
    boundaries.push({
      index: matchIndex,
      headerText: headerLine,
      keywords: getSectionHeaderKeywords(headerLine),
    });
  }
  
  return boundaries;
}

export const ChalkTypewriter: React.FC<ChalkTypewriterProps> = ({ 
  text, 
  state = "disconnected", 
  cherryVolume = 0, 
  latestSpeech, 
  isAcademicNotes = false,
  isFallback = false
}) => {
  // We animate character-by-character for live active text.
  // Fallback mode shows text directly.
  const shouldStartEmpty = !isFallback && text && text.length > 0;

  const [displayedText, setDisplayedText] = useState(shouldStartEmpty ? "" : text);
  const indexRef = useRef(shouldStartEmpty ? 0 : text.length);
  const textRef = useRef(text);
  const isTypingActiveRef = useRef(false);
  const timerIdRef = useRef<any>(null);

  // Sync state reference to avoid stale closures in timeouts
  const stateRef = useRef(state);
  const volumeRef = useRef(cherryVolume);
  const isAcademicNotesRef = useRef(isAcademicNotes);
  const wasFallbackRef = useRef(isFallback);
  const latestSpeechRef = useRef(latestSpeech);

  // Section-Gating refs for phase-wise part-by-part blackboard unrolling
  const unlockedSectionIndexRef = useRef(0);
  const boundaryWaitStartTimeRef = useRef(Date.now());
  const sectionBoundariesRef = useRef<SectionBoundary[]>([]);

  useEffect(() => {
    latestSpeechRef.current = latestSpeech;
  }, [latestSpeech]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    volumeRef.current = cherryVolume;
  }, [cherryVolume]);

  useEffect(() => {
    isAcademicNotesRef.current = isAcademicNotes;
  }, [isAcademicNotes]);

  // Synchronize when incoming text changes with smart transduction-noise filtering.
  useEffect(() => {
    const wasFallback = wasFallbackRef.current;
    wasFallbackRef.current = isFallback;

    // Is it fallback mode right now? Ensure instant rendering!
    if (isFallback) {
      textRef.current = text;
      indexRef.current = text.length;
      setDisplayedText(text);
      isTypingActiveRef.current = false;
      if (timerIdRef.current) {
        clearTimeout(timerIdRef.current);
        timerIdRef.current = null;
      }
      return;
    }

    // Did we just exit fallback mode (e.g., actual notes arrived)?
    if (wasFallback && !isFallback) {
      textRef.current = text;
      indexRef.current = text.length;
      setDisplayedText(text);
      isTypingActiveRef.current = false;
      if (timerIdRef.current) {
        clearTimeout(timerIdRef.current);
        timerIdRef.current = null;
      }
      return;
    }

    const prevText = textRef.current;
    
    // Clean strings for comparison
    const prevClean = prevText ? prevText.replace(/[\\/\s\n]+$/g, "").trim() : "";
    const textClean = text ? text.replace(/[\\/\s\n]+$/g, "").trim() : "";
    
    const isWiped = !textClean;
    const isMuchShorter = prevClean && textClean && textClean.length < prevClean.length - 15;
    const isPrefixChanged = prevClean && textClean && !textClean.toLowerCase().startsWith(prevClean.toLowerCase().substring(0, Math.min(10, prevClean.length)));
    
    const needsReset = isWiped || isMuchShorter || isPrefixChanged;

    if (!needsReset) {
      // Just update the target text we're typing towards
      textRef.current = text;
      sectionBoundariesRef.current = parseSectionBoundaries(text);
      
      if (indexRef.current > text.length) {
        indexRef.current = text.length;
        setDisplayedText(text);
      }
      
      if (!isTypingActiveRef.current && indexRef.current < text.length) {
        startTypingLoop(20);
      }
    } else {
      // Complete reset for brand new content (e.g., topic switches or manual board clearance)
      if (timerIdRef.current) {
        clearTimeout(timerIdRef.current);
        timerIdRef.current = null;
      }
      setDisplayedText("");
      indexRef.current = 0;
      textRef.current = text;
      sectionBoundariesRef.current = parseSectionBoundaries(text);
      unlockedSectionIndexRef.current = 0;
      boundaryWaitStartTimeRef.current = Date.now();

      if (text) {
        startTypingLoop(50);
      } else {
        isTypingActiveRef.current = false;
      }
    }
  }, [text]);

  // Initial trigger if component mounted with text to type
  useEffect(() => {
    if (text && indexRef.current < text.length && !isTypingActiveRef.current && !isFallback) {
      startTypingLoop(50);
    }
  }, []);

  const startTypingLoop = (initialDelay = 30) => {
    isTypingActiveRef.current = true;

    if (timerIdRef.current) {
      clearTimeout(timerIdRef.current);
    }

    const runTypewriter = () => {
      const currentTarget = textRef.current;
      const currentIndex = indexRef.current;

      if (!currentTarget) {
        setDisplayedText("");
        indexRef.current = 0;
        isTypingActiveRef.current = false;
        return;
      }

      // 0. Section-Gated Real-Time Audio Unroll Engine (Unrolls Phase 2/3 board sections part-by-part as Cherry Ma'am speaks)
      const boundaries = sectionBoundariesRef.current;
      const speech = (latestSpeechRef.current || "").toLowerCase();
      const isCherrySpeaking = stateRef.current === "speaking" || volumeRef.current > 0.005 || speech.length > 0;
      const isFinishedOrListening = stateRef.current === "listening" || stateRef.current === "idle" || stateRef.current === "disconnected";

      const timeSinceNewText = Date.now() - boundaryWaitStartTimeRef.current;
      // If Cherry finished her turn or is waiting for student input (or 2.5s passed since new text arrived), unlock ALL remaining sections
      if ((isFinishedOrListening && !isCherrySpeaking && timeSinceNewText > 1500) || timeSinceNewText > 2500) {
        unlockedSectionIndexRef.current = boundaries.length;
      } else if (speech && boundaries.length > 1) {
        // Check if spoken words contain keywords matching any locked section
        for (let i = unlockedSectionIndexRef.current + 1; i < boundaries.length; i++) {
          const kwList = boundaries[i].keywords;
          if (kwList.some(kw => speech.includes(kw))) {
            unlockedSectionIndexRef.current = Math.max(unlockedSectionIndexRef.current, i);
            boundaryWaitStartTimeRef.current = Date.now();
          }
        }
      }

      // Check section gate at boundary
      if (boundaries.length > 1 && currentIndex < currentTarget.length) {
        let nextLockedBoundary: SectionBoundary | null = null;
        let nextLockedIdx = -1;
        for (let i = 0; i < boundaries.length; i++) {
          if (i > unlockedSectionIndexRef.current && currentIndex >= boundaries[i].index) {
            nextLockedBoundary = boundaries[i];
            nextLockedIdx = i;
            break;
          }
        }

        if (nextLockedBoundary) {
          const elapsedAtBoundary = Date.now() - boundaryWaitStartTimeRef.current;
          const isPollHeader = nextLockedBoundary.headerText.toLowerCase().includes("poll") || 
                               nextLockedBoundary.headerText.toLowerCase().includes("prediction") ||
                               nextLockedBoundary.headerText.includes("❓");

          // Section boundary unlocks when Cherry Ma'am speaks matching keywords OR after a quick fallback timeout (2.5s)
          const requiredWaitMs = isPollHeader ? 2500 : 2000;
          const keywordMatched = speech && nextLockedBoundary.keywords.some(kw => speech.includes(kw));

          if (keywordMatched || elapsedAtBoundary > requiredWaitMs) {
            unlockedSectionIndexRef.current = Math.max(unlockedSectionIndexRef.current, nextLockedIdx);
            boundaryWaitStartTimeRef.current = Date.now();
          } else {
            // Hold typewriter at boundary start index without resetting or clearing typed text
            if (currentIndex >= nextLockedBoundary.index) {
              timerIdRef.current = setTimeout(runTypewriter, 50);
              return;
            }
          }
        }
      }

      // 1. SVG Tag Atomic Protection
      const prefix = currentTarget.slice(0, currentIndex);
      const lastOpenSvg = prefix.toLowerCase().lastIndexOf("<svg");
      const lastCloseSvg = prefix.toLowerCase().lastIndexOf("</svg>");
      const isInsideSvgRange = lastOpenSvg !== -1 && lastOpenSvg > lastCloseSvg;

      if (isInsideSvgRange) {
        const fullRemaining = currentTarget.slice(lastOpenSvg);
        const closeTagIndex = fullRemaining.toLowerCase().indexOf("</svg>");
        if (closeTagIndex !== -1) {
          const nextIndex = lastOpenSvg + closeTagIndex + 6;
          indexRef.current = nextIndex;
          setDisplayedText(currentTarget.slice(0, nextIndex));
          timerIdRef.current = setTimeout(runTypewriter, 30);
          return;
        } else {
          // If no </svg> tag found yet, check if a Markdown header begins after the SVG block
          const headerMatch = fullRemaining.match(/\n#{1,3}\s+/);
          if (headerMatch && headerMatch.index !== undefined && headerMatch.index > 0) {
            const nextIndex = lastOpenSvg + headerMatch.index;
            indexRef.current = nextIndex;
            setDisplayedText(currentTarget.slice(0, nextIndex));
            timerIdRef.current = setTimeout(runTypewriter, 30);
            return;
          } else {
            indexRef.current = currentTarget.length;
            setDisplayedText(currentTarget);
            timerIdRef.current = setTimeout(runTypewriter, 60);
            return;
          }
        }
      }

      if (currentIndex < currentTarget.length) {
        const sliceFromCurrent = currentTarget.slice(currentIndex);
        const lowerSlice = sliceFromCurrent.toLowerCase();
        
        if (lowerSlice.startsWith("<svg") || lowerSlice.startsWith("```xml\n<svg") || lowerSlice.startsWith("```svg\n<svg")) {
          const svgStartOffset = lowerSlice.indexOf("<svg");
          const absoluteOpenSvg = currentIndex + svgStartOffset;
          const fullRemaining = currentTarget.slice(absoluteOpenSvg);
          const closeTagIndex = fullRemaining.toLowerCase().indexOf("</svg>");
          
          if (closeTagIndex !== -1) {
            const nextIndex = absoluteOpenSvg + closeTagIndex + 6;
            indexRef.current = nextIndex;
            setDisplayedText(currentTarget.slice(0, nextIndex));
            timerIdRef.current = setTimeout(runTypewriter, 30);
            return;
          } else {
            const headerMatch = fullRemaining.match(/\n#{1,3}\s+/);
            if (headerMatch && headerMatch.index !== undefined && headerMatch.index > 0) {
              const nextIndex = absoluteOpenSvg + headerMatch.index;
              indexRef.current = nextIndex;
              setDisplayedText(currentTarget.slice(0, nextIndex));
              timerIdRef.current = setTimeout(runTypewriter, 30);
              return;
            } else {
              indexRef.current = currentTarget.length;
              setDisplayedText(currentTarget);
              timerIdRef.current = setTimeout(runTypewriter, 60);
              return;
            }
          }
        }

        // 1b. Parametric Diagram & Primitive Tag Atomic Protection (Layer 1 Instant Vector Graphics)
        if (lowerSlice.startsWith("<diagram") || lowerSlice.startsWith("<primitive") || lowerSlice.startsWith("```xml\n<diagram")) {
          const tagStartOffset = Math.max(0, lowerSlice.indexOf("<"));
          const absoluteOpenTag = currentIndex + tagStartOffset;
          const fullRemaining = currentTarget.slice(absoluteOpenTag);
          const closeBracketIdx = fullRemaining.indexOf(">");
          
          if (closeBracketIdx !== -1) {
            const nextIndex = absoluteOpenTag + closeBracketIdx + 1;
            indexRef.current = nextIndex;
            setDisplayedText(currentTarget.slice(0, nextIndex));
            timerIdRef.current = setTimeout(runTypewriter, 30);
            return;
          } else {
            indexRef.current = currentTarget.length;
            setDisplayedText(currentTarget);
            timerIdRef.current = setTimeout(runTypewriter, 60);
            return;
          }
        }

        // 2. Atomic LaTeX Math Block Jump for Crisp Instant Formula Rendering
        if (lowerSlice.startsWith("$$") || lowerSlice.startsWith("\\[") || lowerSlice.startsWith("\\begin{")) {
          let mathEnd = -1;
          if (lowerSlice.startsWith("$$")) {
            const endIdx = sliceFromCurrent.slice(2).indexOf("$$");
            if (endIdx !== -1) mathEnd = endIdx + 4;
          } else if (lowerSlice.startsWith("\\[")) {
            const endIdx = sliceFromCurrent.slice(2).indexOf("\\]");
            if (endIdx !== -1) mathEnd = endIdx + 4;
          } else if (lowerSlice.startsWith("\\begin{")) {
            const envNameMatch = sliceFromCurrent.match(/^\\begin\{([^}]+)\}/);
            if (envNameMatch) {
              const envName = envNameMatch[1];
              const closeTag = `\\end{${envName}}`;
              const endIdx = sliceFromCurrent.indexOf(closeTag);
              if (endIdx !== -1) mathEnd = endIdx + closeTag.length;
            }
          }
          if (mathEnd > 0) {
            const nextIndex = currentIndex + mathEnd;
            indexRef.current = nextIndex;
            setDisplayedText(currentTarget.slice(0, nextIndex));
            timerIdRef.current = setTimeout(runTypewriter, 18);
            return;
          }
        }

        // 2b. Markdown Header Instant Reveal for Crisp Board Section Anchors (EXCEPT Prediction Poll headers which type character-by-character)
        if (lowerSlice.startsWith("#")) {
          const isPollHeader = lowerSlice.includes("poll") || lowerSlice.includes("prediction") || lowerSlice.includes("❓");
          if (!isPollHeader) {
            const endOfHeaderLine = sliceFromCurrent.indexOf("\n");
            const headerLen = endOfHeaderLine !== -1 ? endOfHeaderLine + 1 : sliceFromCurrent.length;
            const nextIndex = currentIndex + headerLen;
            indexRef.current = nextIndex;
            setDisplayedText(currentTarget.slice(0, nextIndex));
            timerIdRef.current = setTimeout(runTypewriter, 12);
            return;
          }
        }

        // 3. Adaptive Latency Buffer & Audio Stream Word Synchronization Engine
        const speechIdx = findSpeechAlignmentIndex(currentTarget, latestSpeechRef.current);
        const isCherrySpeaking = stateRef.current === "speaking" || volumeRef.current > 0.005 || (latestSpeechRef.current && latestSpeechRef.current.trim().length > 0);
        const lagLength = currentTarget.length - currentIndex;

        // Adaptive Latency Buffer Check:
        if (isCherrySpeaking && speechIdx !== null) {
          // A. Audio Jitter Jump / Catch-up: If audio leaped ahead, align visible text directly to the last completed word
          if (speechIdx > currentIndex + 10) {
            const snappedIndex = Math.min(speechIdx, currentTarget.length);
            indexRef.current = snappedIndex;
            setDisplayedText(currentTarget.slice(0, snappedIndex));
            timerIdRef.current = setTimeout(runTypewriter, 15);
            return;
          }
        }

        let charsPerStep = 2;
        let baseDelay = 20;

        const isInsidePollContent = sliceFromCurrent.toLowerCase().includes("poll") || 
                                    currentTarget.slice(0, currentIndex).toLowerCase().includes("prediction poll") ||
                                    currentTarget.slice(0, currentIndex).includes("❓");

        if (isCherrySpeaking) {
          // Real-time voice-writing pacing dynamically tuned to audio rate & backlog
          if (isInsidePollContent) {
            // Fast, smooth voice-synced typing for Prediction Poll text (~50-60 chars/sec)
            charsPerStep = 2;
            baseDelay = 22;
          } else if (lagLength > 150) {
            charsPerStep = 4;
            baseDelay = 12;
          } else if (lagLength > 70) {
            charsPerStep = 3;
            baseDelay = 15;
          } else if (lagLength > 20) {
            charsPerStep = 2;
            baseDelay = 18;
          } else {
            charsPerStep = 1;
            baseDelay = 22;
          }
        } else {
          // When Cherry is silent, catch up remaining text smoothly without stuttering
          if (lagLength > 100) {
            charsPerStep = 5;
            baseDelay = 10;
          } else if (lagLength > 30) {
            charsPerStep = 3;
            baseDelay = 14;
          } else {
            charsPerStep = 2;
            baseDelay = 16;
          }
        }

        const nextIndex = Math.min(currentIndex + charsPerStep, currentTarget.length);

        // Natural speech & line-break pauses matching human enunciation
        const currentChar = currentTarget[currentIndex];
        
        if (currentChar === "." || currentChar === "?" || currentChar === "!") {
          baseDelay += isCherrySpeaking ? 60 : 20;
        } else if (currentChar === "," || currentChar === ";") {
          baseDelay += isCherrySpeaking ? 30 : 10;
        } else if (currentChar === "\n") {
          baseDelay += isCherrySpeaking ? 70 : 20;
        } else if (currentChar === ":" && currentTarget[currentIndex - 1] !== "\\") {
          baseDelay += isCherrySpeaking ? 40 : 15;
        }

        indexRef.current = nextIndex;
        setDisplayedText(currentTarget.slice(0, nextIndex));
        
        timerIdRef.current = setTimeout(runTypewriter, baseDelay);
      } else {
        // Reached target end, pause loop
        isTypingActiveRef.current = false;
      }
    };

    timerIdRef.current = setTimeout(runTypewriter, 10);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerIdRef.current) {
        clearTimeout(timerIdRef.current);
      }
    };
  }, []);

  return (
    <span className="relative inline-wrap w-full select-text">
      <MathRenderer text={displayedText} latestSpeech={latestSpeech} />
      {displayedText.length < text.length && (
        <span className="relative inline-block" style={{ verticalAlign: "middle" }}>
          <motion.span
            initial={{ rotate: -15, scale: 0.9 }}
            animate={{
              rotate: [-15, -5, -25, -15],
              y: [0, -1.5, 1.5, -0.5, 0],
              x: [0, 0.5, -0.5, 0.5, 0]
            }}
            transition={{
              repeat: Infinity,
              duration: 0.18,
              ease: "linear"
            }}
            className="inline-block w-1.5 h-4 ml-1 rounded-sm bg-zinc-100/90 border border-zinc-200/50 shadow-sm origin-bottom-left"
            style={{
              boxShadow: "0 0 6px rgba(228, 228, 231, 0.7), inset 0 1px 1px rgba(255, 255, 255, 0.9)",
            }}
          />
        </span>
      )}
    </span>
  );
};
