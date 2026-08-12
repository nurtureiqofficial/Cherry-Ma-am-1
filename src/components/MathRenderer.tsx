import React from "react";
import katex from "katex";
import { VectorDisplay } from "./VectorDisplay";

// Highly efficient caching mechanism to avoid running expensive synchronous KaTeX compilation
// multiple times per second for identical equations on keyframe updates.
const katexCache = new Map<string, string>();

const renderKatexCached = (formula: string, displayMode: boolean): string => {
  const cacheKey = `${displayMode ? "block" : "inline"}:${formula}`;
  if (katexCache.has(cacheKey)) {
    return katexCache.get(cacheKey)!;
  }
  const preprocessed = preprocessMathFormula(formula);
  const html = katex.renderToString(preprocessed, {
    displayMode,
    throwOnError: false,
  });
  katexCache.set(cacheKey, html);
  return html;
};

const highlightSmartKeywords = (text: string, idx: number | string, isLight: boolean = false) => {
  const keywordRegex = /\b(cell|plants?|chloroplast|photosynthesis|mitochondria|nucleus|vacuole|organelle|cellular|biology|organic|harmonics?|force|gravity|velocity|acceleration|circuit|voltage|current|logic|binary|gate|boolean|bit|input|output|theorem|formula|equation|hypotenuse|trigonometry|calculus|derivative|syllabus|syllable|molecule|atoms?|electron|proton|neutron|covalent|methane|bohr|equilibrium|skeletal|supply|demand|price|quantity|market)\b/gi;
  
  const parts = text.split(keywordRegex);
  const defaultClass = isLight ? "text-slate-900 font-sans font-normal" : "text-zinc-100/95 font-sans tracking-wide";
  if (parts.length <= 1) {
    return <span key={idx} className={defaultClass}>{text}</span>;
  }

  return (
    <span key={idx} className="inline-wrap">
      {parts.map((part, pIdx) => {
        if (pIdx % 2 === 0) {
          return part ? <span key={pIdx} className={defaultClass}>{part}</span> : null;
        } else {
          const lower = part.toLowerCase();
          let colorClass = isLight ? "text-slate-900 font-medium" : "text-zinc-100/95";
          let glowColor = isLight ? "none" : "rgba(255, 255, 255, 0.2)";

          if (/^(cell|plants?|chloroplast|photosynthesis|mitochondria|nucleus|vacuole|organelle|cellular|biology|organic)$/.test(lower)) {
            colorClass = isLight ? "text-emerald-800 font-bold" : "text-emerald-300 font-bold";
            glowColor = isLight ? "none" : "rgba(52, 211, 153, 0.4)";
          } else if (/^(harmonics?|force|gravity|velocity|acceleration|circuit|voltage|current|logic|binary|gate|boolean|bit|input|output)$/.test(lower)) {
            colorClass = isLight ? "text-cyan-800 font-bold" : "text-cyan-300 font-bold";
            glowColor = isLight ? "none" : "rgba(34, 211, 238, 0.4)";
          } else if (/^(theorem|formula|equation|hypotenuse|trigonometry|calculus|derivative|syllabus|syllable)$/.test(lower)) {
            colorClass = isLight ? "text-rose-800 font-bold" : "text-rose-300 font-bold";
            glowColor = isLight ? "none" : "rgba(244, 114, 182, 0.4)";
          } else if (/^(molecule|atoms?|electron|proton|neutron|covalent|methane|bohr|equilibrium|skeletal)$/.test(lower)) {
            colorClass = isLight ? "text-amber-800 font-bold" : "text-yellow-200 font-bold";
            glowColor = isLight ? "none" : "rgba(253, 224, 71, 0.4)";
          } else if (/^(supply|demand|price|quantity|market)$/.test(lower)) {
            colorClass = isLight ? "text-orange-800 font-bold" : "text-orange-300 font-bold";
            glowColor = isLight ? "none" : "rgba(249, 115, 22, 0.4)";
          }

          return (
            <span
              key={pIdx}
              className={`${colorClass} px-0.5 mx-0.5 rounded-sm inline-block transition-transform hover:scale-105 duration-200`}
              style={glowColor !== "none" ? { textShadow: `0 0 4px ${glowColor}` } : undefined}
            >
              {part}
            </span>
          );
        }
      })}
    </span>
  );
};

function preprocessMathFormula(formula: string): string {
  let cleaned = formula.trim();

  // Wrap geometric shapes in \text{} for pristine KaTeX font rendering to prevent italicization or sizing errors
  cleaned = cleaned.replace(/(⬡|⬠|⯃|△|☐|◯|▭|▱|⏢|⬨|◊)/g, "\\text{$1}");

  // Normalize multi-backslashes to single backslash for LaTeX macros/symbols before processing,
  // preventing double-backslash rendering and KaTeX syntax failures on standard LaTeX commands.
  cleaned = cleaned.replace(/\\\\([a-zA-Z]+)/g, "\\$1");
  cleaned = cleaned.replace(/\\\\([{}_^#&%|])/g, "\\$1");
  
  // Clean spaces inside \begin{env} and \end{env} so KaTeX parses them correctly
  cleaned = cleaned.replace(/\\begin\s*\{\s*([a-zA-Z*]+)\s*\}/gi, "\\begin{$1}");
  cleaned = cleaned.replace(/\\end\s*\{\s*([a-zA-Z*]+)\s*\}/gi, "\\end{$1}");

  // Match backslash-less vector representations first: "vecOP" or "vec OP" or "\vec OP"
  cleaned = cleaned.replace(/\\?vec\s*([a-zA-Z]{1,3})/g, "\\vec{$1}");
  
  // Replace standalone vector variable OP to \vec{OP} when inside math tags, unless already part of LaTeX macro
  cleaned = cleaned.replace(/\bOP\b/g, "\\vec{OP}");

  const mathSymbolsMap: { [key: string]: string } = {
    "Delta\\s*theta": "\\Delta\\theta",
    "Delta\\s*t": "\\Delta t",
    "Deltat": "\\Delta t",
    "dtheta": "d\\theta",
    "d\\s*theta": "d\\theta",
    "theta": "\\theta",
    "Delta": "\\Delta",
    "delta": "\\delta",
    "alpha": "\\alpha",
    "beta": "\\beta",
    "gamma": "\\gamma",
    "Gamma": "\\Gamma",
    "omega": "\\omega",
    "Omega": "\\Omega",
    "phi": "\\phi",
    "pi": "\\pi",
    "lambda": "\\lambda",
    "mu": "\\mu",
    "tau": "\\tau",
    "sigma": "\\sigma",
  };

  for (const [key, replacement] of Object.entries(mathSymbolsMap)) {
    const regex = new RegExp(`(?<!\\\\)\\b${key}\\b`, 'g');
    cleaned = cleaned.replace(regex, replacement);
  }

  // Support numbered variables like theta1, theta2, phi1, phi2
  cleaned = cleaned.replace(/(?<!\\)\btheta([0-9]+)\b/g, "\\theta_$1");
  cleaned = cleaned.replace(/(?<!\\)\bphi([0-9]+)\b/g, "\\phi_$1");

  return cleaned;
};

// Clean representation for formula and text highlight in real-time




interface MathRendererProps {
  text?: string;
  content?: string;
  latestSpeech?: string;
  isLightBg?: boolean;
}

// Helper to sanitize orphan asterisks from text
const sanitizeLineText = (text: string): string => {
  if (!text) return "";
  let s = text.trim();

  // Remove orphaned asterisks at beginning/end of line or list content
  s = s.replace(/^(\*+\s+)+/g, "");
  s = s.replace(/(\s+\*+)+$/g, "");

  // Normalize internal whitespace inside bold/italic tags
  s = s.replace(/\*\*\s+(.*?)\s+\*\*/g, "**$1**");
  s = s.replace(/\*\s+(.*?)\s+\*/g, "*$1*");

  // Remove stray double/triple asterisks surrounded by spaces
  s = s.replace(/\s+\*+\s+/g, " ");

  return s;
};

// 1. Helper to parse inline tokens like bold, backticks, quotes, brackets, and math symbols
const parseLineToSpans = (rawLine: string, lineKey: string, isLight: boolean = false) => {
  const line = sanitizeLineText(rawLine);
  // Tokenize by double asterisks (**...**), single asterisks (*...*), backticks (`...`), and double quotes ("...")
  const tokenRegex = /(\*\*.*?\*\*|\*.*?\*|`.*?`|"[^"]*")/g;
  const tokens = line.split(tokenRegex);

  return (
    <span key={lineKey} className="inline-wrap leading-relaxed select-text">
      {tokens.map((token, idx) => {
        if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
          const content = token.slice(2, -2).trim();
          return (
            <strong key={idx} className={isLight ? "font-bold text-[#008069] font-sans px-0.5" : "font-extrabold text-yellow-300 font-sans px-0.5"}>
              {content}
            </strong>
          );
        } else if (token.startsWith("*") && token.endsWith("*") && token.length > 2 && !token.startsWith("**")) {
          const content = token.slice(1, -1).trim();
          return (
            <strong key={idx} className={isLight ? "font-semibold text-emerald-900 font-sans px-0.5" : "font-semibold text-emerald-300 font-sans px-0.5"}>
              {content}
            </strong>
          );
        } else if (token.startsWith("`") && token.endsWith("`")) {
          const content = token.slice(1, -1);
          return (
            <code key={idx} className={isLight ? "font-mono text-cyan-950 bg-cyan-50 border border-cyan-300 px-1.5 py-0.5 rounded text-[11px] mx-0.5 font-semibold" : "font-mono text-cyan-200 bg-cyan-950/70 border border-cyan-900/40 px-1.5 py-0.5 rounded text-[11px] mx-0.5"}>
              {content}
            </code>
          );
        } else if (token.startsWith('"') && token.endsWith('"')) {
          const content = token.slice(1, -1);
          return (
            <span key={idx} className={isLight ? "text-emerald-900 italic font-semibold pr-0.5" : "text-emerald-300 italic font-medium pr-0.5"}>
              "{content}"
            </span>
          );
        } else {
          // Split by punctuation brackets, mathematical operators (+, -, =, /), and punctuation marks (exclude asterisk from symRegex)
          const symRegex = /(\(|\)|\{|\}|\[|\]|=|\+|-|\/|:|;|,|\.)/g;
          const subparts = token.split(symRegex);
          return (
            <React.Fragment key={idx}>
              {subparts.map((sub, sIdx) => {
                // Remove any residual stray asterisks from plain text subparts
                const cleanSub = sub.replace(/\*/g, "");
                if (!cleanSub) return null;

                const isBracket = /^[(){}[\]]$/.test(cleanSub);
                const isOp = /^[=+-\/]$/.test(cleanSub);
                const isColonOrSemi = /^[:;]$/.test(cleanSub);
                const isCommaOrDot = /^[,.]$/.test(cleanSub);
                const isNumber = /^\d+$/.test(cleanSub.trim());

                if (isBracket) {
                  return (
                    <span key={sIdx} className={isLight ? "text-sky-800 font-bold font-mono px-0.5" : "text-sky-300 font-bold font-mono px-0.5 animate-pulse-slow"} style={isLight ? undefined : { textShadow: "0 0 3px rgba(125, 211, 252, 0.4)" }}>
                      {cleanSub}
                    </span>
                  );
                } else if (isOp) {
                  return (
                    <span key={sIdx} className={isLight ? "text-emerald-800 font-bold mx-0.5 font-mono inline-block" : "text-rose-400 font-bold mx-1 font-mono hover:scale-105 inline-block"} style={isLight ? undefined : { textShadow: "0 0 3px rgba(244, 114, 182, 0.4)" }}>
                      {cleanSub}
                    </span>
                  );
                } else if (isColonOrSemi) {
                  return (
                    <span key={sIdx} className={isLight ? "text-slate-800 font-extrabold mx-0.5 font-mono" : "text-amber-400 font-extrabold mx-0.5 font-mono"}>
                      {cleanSub}
                    </span>
                  );
                } else if (isCommaOrDot) {
                  return (
                    <span key={sIdx} className={isLight ? "text-slate-700 font-mono font-bold mr-0.5" : "text-stone-400 font-mono font-bold mr-0.5"}>
                      {cleanSub}
                    </span>
                  );
                } else if (isNumber) {
                  return (
                    <span key={sIdx} className={isLight ? "text-amber-900 font-bold font-mono tracking-tight" : "text-amber-300 font-bold font-mono tracking-tight"} style={isLight ? undefined : { textShadow: "0 0 3px rgba(253, 224, 71, 0.3)" }}>
                      {cleanSub}
                    </span>
                  );
                } else {
                  return highlightSmartKeywords(cleanSub, sIdx, isLight);
                }
              })}
            </React.Fragment>
          );
        }
      })}
    </span>
  );
};

// 2. Helper to render text with inline math formulas horizontally
const renderInlineLineContent = (lineText: string, prefixKey: string, isLight: boolean = false) => {
  const inlineMathRegex = /(\$.*?\$)/g;
  const parts = lineText.split(inlineMathRegex);

  return (
    <span key={prefixKey} className="inline-wrap leading-relaxed select-text font-normal">
      {parts.map((part, idx) => {
        if (part.startsWith("$") && part.endsWith("$")) {
          const formula = part.slice(1, -1).trim();
          try {
            const html = renderKatexCached(formula, false);
            return (
              <span
                key={`${prefixKey}-inline-math-${idx}`}
                className={isLight ? "inline-flex max-w-full overflow-x-auto align-middle px-1.5 py-0.5 my-0.5 rounded bg-emerald-50 border border-emerald-300 font-mono text-emerald-950 font-bold select-all text-xs sm:text-sm" : "inline-flex max-w-full overflow-x-auto align-middle px-1.5 py-0.5 my-0.5 rounded bg-emerald-950/40 border border-emerald-900/30 font-mono text-emerald-300 font-bold select-all text-xs sm:text-sm"}
                style={isLight ? undefined : { textShadow: "0 0 3px rgba(52, 211, 153, 0.4)" }}
                dangerouslySetInnerHTML={{ __html: html }}
                id={`math-inline-${prefixKey}-${idx}`}
              />
            );
          } catch (e) {
            return (
              <span key={`${prefixKey}-inline-math-err-${idx}`} className="text-red-500 font-mono">
                {part}
              </span>
            );
          }
        } else {
          return parseLineToSpans(part, `${prefixKey}-text-${idx}`, isLight);
        }
      })}
    </span>
  );
};

const isValidDefinitionLabel = (label: string): boolean => {
  const clean = label.trim();
  // Structural heading is always valid
  if (/^(HEADING|SUB-HEADING|TITLE|TOPIC)$/i.test(clean)) return true;
  // Otherwise, it must be reasonably short (<= 35 characters)
  if (clean.length > 35) return false;
  // It must not contain math/formatting symbols that suggest it's a formula / complex prose
  if (clean.match(/[\$\*\\\{\}\^\[\]_<>]/)) return false;
  // It must not end with typical sentence punctuation except maybe some emojis
  if (clean.match(/[.!?]$/)) return false;
  // Or it could be one of the known labels (case insensitive matching)
  const knownLabels = /^(definition|formula|equation|note|important|hint|instruction|warning|alert|tip|goal|case|proof|theorem|lemma|corollary|syllabus|exercise|question|answer|solution|final\s*answer|explanation|key\s+concept|concept|step|recall|observe|examples|tools\s*used|common\s*tools\s*used|key\s*features|subject|class|grade|board|tip\s*for\s*notebook|परिभाषा|सूत्र|समीकरण|नोट|महत्वपूर्ण|उदाहरण|प्रश्न|उत्तर)$/i;
  if (knownLabels.test(clean)) return true;
  // Otherwise, if it starts with an emoji or contains 1-3 simple words
  const wordsList = clean.split(/\s+/);
  if (wordsList.length > 3) return false;
  return true;
};

// Helper to check if chalkboard background is currently in light theme mode
const checkIsLightBgActive = () => {
  if (typeof document === "undefined") return false;
  const el = document.getElementById("chalkboard-main-slate");
  return el ? el.classList.contains("light-board-chalk") : false;
};

// 3. Main plain text formatting function using slate dust & chalkboard layers
const getChalkThemeForLabel = (label: string, isLightParam?: boolean) => {
  let clean = label.toLowerCase().trim().replace(/^teacher\s+/i, "").replace(/^[*_~\s#\-]+|[*_~\s#\-]+$/g, "");
  const cleanTitle = label.replace(/^teacher\s+/i, "").replace(/^[*_~\s#\-]+|[*_~\s#\-]+$/g, "").trim();
  const isLight = isLightParam !== undefined ? isLightParam : checkIsLightBgActive();
  
  // 1. Tips / Teacher Tips / Hints / Advice (Soft Warm Amber/Yellow)
  if (/^(tip|hint|exam\s*tip|notebook\s*tip|tip\s*for\s*notebook|teacher\s*tip|suggestion|sujhav|सुझाव)$/i.test(clean) || clean.includes("tip")) {
    return {
      color: isLight ? "#854d0e" : "#fef08a",
      bg: isLight ? "#fffbeb" : "rgba(254, 240, 138, 0.05)",
      border: isLight ? "#f59e0b" : "rgba(254, 240, 138, 0.75)",
      shadow: isLight ? "none" : "0 0 4px rgba(254, 240, 138, 0.5)",
      emoji: "💡",
      labelTitle: "Tip for Notebook",
      highlightBg: isLight ? "#fef3c7" : "rgba(254, 240, 138, 0.2)",
      highlightBorder: isLight ? "#d97706" : "rgba(254, 240, 138, 0.9)"
    };
  }
  
  // 2. Question / Given Data (Pastel Blue/Sky)
  if (/^(question|prashna|given|given\s*data|to\s*find|problem|प्रश्न)$/i.test(clean) || clean.includes("question")) {
    return {
      color: isLight ? "#0369a1" : "#bae6fd",
      bg: isLight ? "#f0f9ff" : "rgba(186, 230, 253, 0.05)",
      border: isLight ? "#0284c7" : "rgba(186, 230, 253, 0.75)",
      shadow: isLight ? "none" : "0 0 4px rgba(186, 230, 253, 0.5)",
      emoji: "📌",
      labelTitle: "Question",
      highlightBg: isLight ? "#e0f2fe" : "rgba(186, 230, 253, 0.2)",
      highlightBorder: isLight ? "#0284c7" : "rgba(186, 230, 253, 0.9)"
    };
  }

  // 3. Answer / Final Answer / Solution (Fresh Emerald/Teal)
  if (/^(answer|final\s*answer|solution|uttar|उत्तर|परिणाम)$/i.test(clean) || clean.includes("answer") || clean.includes("solution")) {
    return {
      color: isLight ? "#065f46" : "#a7f3d0",
      bg: isLight ? "#ecfdf5" : "rgba(167, 243, 208, 0.05)",
      border: isLight ? "#10b981" : "rgba(167, 243, 208, 0.75)",
      shadow: isLight ? "none" : "0 0 4px rgba(167, 243, 208, 0.5)",
      emoji: "📝",
      labelTitle: "Answer",
      highlightBg: isLight ? "#d1fae5" : "rgba(167, 243, 208, 0.2)",
      highlightBorder: isLight ? "#059669" : "rgba(167, 243, 208, 0.9)"
    };
  }

  // 4. Subject Detected / Main Concept / Topic / Examples (Soft Indigo/Purple)
  if (/^(subject|subject\s*detected|topic|main\s*concept|concept|examples|tools\s*used|common\s*tools\s*used|key\s*features|विषय)$/i.test(clean) || clean.includes("subject") || clean.includes("concept") || clean.includes("example")) {
    return {
      color: isLight ? "#4338ca" : "#c7d2fe",
      bg: isLight ? "#f5f3ff" : "rgba(199, 210, 254, 0.05)",
      border: isLight ? "#6366f1" : "rgba(199, 210, 254, 0.75)",
      shadow: isLight ? "none" : "0 0 4px rgba(199, 210, 254, 0.5)",
      emoji: "💻",
      labelTitle: cleanTitle || "Subject",
      highlightBg: isLight ? "#ede9fe" : "rgba(199, 210, 254, 0.2)",
      highlightBorder: isLight ? "#4f46e5" : "rgba(199, 210, 254, 0.9)"
    };
  }

  // 5. Formulas / Equations / Step-by-Step (Sky Blue / Turquoise)
  if (/^(formula|equation|step|steps|working|method|सूत्र|समीकरण)$/i.test(clean) || clean.includes("formula") || clean.includes("equation")) {
    return {
      color: isLight ? "#0f766e" : "#99f6e4",
      bg: isLight ? "#f0fdfa" : "rgba(153, 246, 228, 0.05)",
      border: isLight ? "#14b8a6" : "rgba(153, 246, 228, 0.75)",
      shadow: isLight ? "none" : "0 0 4px rgba(153, 246, 228, 0.5)",
      emoji: "📐",
      labelTitle: cleanTitle,
      highlightBg: isLight ? "#ccfbf1" : "rgba(153, 246, 228, 0.2)",
      highlightBorder: isLight ? "#0d9488" : "rgba(153, 246, 228, 0.9)"
    };
  }

  // Default: Clean Yellow/Gold Card
  return {
    color: isLight ? "#854d0e" : "#fef08a",
    bg: isLight ? "#fefce8" : "rgba(254, 240, 138, 0.05)",
    border: isLight ? "#eab308" : "rgba(254, 240, 138, 0.75)",
    shadow: isLight ? "none" : "0 0 4px rgba(254, 240, 138, 0.5)",
    emoji: "🌟",
    labelTitle: cleanTitle,
    highlightBg: isLight ? "#fef9c3" : "rgba(254, 240, 138, 0.2)",
    highlightBorder: isLight ? "#ca8a04" : "rgba(254, 240, 138, 0.9)"
  };
};

// 3. Main plain text formatting function using slate dust & chalkboard layers
const renderPlainTextWithChalkStyle = (textPart: string, keyPrefix: string = "plain", activeHighlightedText?: string, isLight: boolean = false) => {
  const lines = textPart.split("\n");
  return (
    <div className="flex flex-col space-y-2 mt-1 w-full select-text">
      {lines.map((line, lineIndex) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={lineIndex} className="h-1.5" />;
        }

        const isHighlighted = !!(activeHighlightedText && line && line.trim() === activeHighlightedText.trim());

        // Horizontal rule e.g. "---" or "- - -" or "***"
        if (/^(\s*[-*_]\s*){3,}$/.test(trimmed)) {
          return <hr key={lineIndex} className={isLight ? "my-2 border-slate-200" : "my-2 border-emerald-900/40"} />;
        }

        // Markdown headings e.g. "### Question:", "### Answer:"
        const headingMatch = line.match(/^(\s*)(#{1,4})\s*(.*)/);
        if (headingMatch) {
          let headingText = headingMatch[3].trim().replace(/^[\*\#\s\-]+|[\*\#\s\-]+$/g, "");
          headingText = headingText.replace(/teacher\s+tip/gi, "Tip for Notebook");
          return (
            <div key={lineIndex} className="my-2 pt-1 pb-1 border-b border-emerald-200/80 dark:border-emerald-900/50 flex items-center">
              <span className={isLight ? "text-[#008069] font-bold text-sm sm:text-base tracking-wide font-sans flex items-center gap-1.5" : "text-emerald-300 font-bold text-sm sm:text-base tracking-wide font-sans flex items-center gap-1.5"}>
                {renderInlineLineContent(headingText, `${keyPrefix}-h-${lineIndex}`, isLight)}
              </span>
            </div>
          );
        }

        // Is this a list item containing a definition, formula, or note? e.g. "- Definition: ..."
        const listDefMatch = line.match(/^(\s*)(–|-|\*|\d+\.\s+)(definition|formula|equation|note|important|hint|instruction|warning|alert|tip|teacher\s*tip|exam\s*tip|rule|concept|key\s+concept|question|answer|परिभाषा|सूत्र|समीकरण|नोट|महत्वपूर्ण|उदाहरण)\s*:\s*(.*)/i);
        if (listDefMatch) {
          const indent = listDefMatch[1];
          const rawLabel = listDefMatch[3].trim();
          const content = listDefMatch[4];
          const theme = getChalkThemeForLabel(rawLabel, isLight);
          const displayTitle = theme.labelTitle || rawLabel;
          
          return (
            <div 
              key={lineIndex} 
              className={`relative text-left py-2 px-3.5 rounded-xl space-y-1 my-2 border-l-4 transition-all duration-300 ${
                isHighlighted ? "scale-[1.01] ring-1 ring-amber-300/40" : ""
              }`}
              style={{ 
                marginLeft: `${indent.length * 6 + 8}px`,
                backgroundColor: isHighlighted ? theme.highlightBg : theme.bg,
                borderLeftColor: isHighlighted ? theme.highlightBorder : theme.border,
                boxShadow: isHighlighted ? `0 0 14px ${theme.color}40` : undefined
              }}
            >
              <span 
                className="font-bold tracking-wide text-xs select-none block uppercase font-sans flex items-center gap-1.5" 
                style={{ 
                  color: theme.color,
                  textShadow: theme.shadow 
                }}
              >
                {theme.emoji} {displayTitle}
              </span>
              <div className={isLight ? "text-slate-800 text-xs sm:text-sm leading-relaxed font-normal" : "text-zinc-100/95 text-xs sm:text-sm leading-relaxed antialiased"}>
                {renderInlineLineContent(content, `${keyPrefix}-listdef-${lineIndex}`, isLight)}
              </div>
            </div>
          );
        }

        // Is this a list item bullet point?
        const listMatch = line.match(/^(\s*)(-\s*|\*\s*|\d+\.\s+)(.*)/);
        if (listMatch) {
          const indent = listMatch[1];
          const bulletRaw = listMatch[2].trim();
          const content = listMatch[3];
          const isNumbered = /^\d+\.$/.test(bulletRaw);
          
          return (
            <div 
              key={lineIndex} 
              className={`relative flex items-start text-left pl-1 sm:pl-3 py-1 transition-all duration-300 ${
                isHighlighted 
                  ? "bg-[#008069]/10 border border-[#008069]/30 rounded-lg scale-[1.01]" 
                  : ""
              }`}
              style={{ paddingLeft: `${indent.length * 6 + 4}px` }}
            >
              {isNumbered ? (
                <span className={isLight ? "text-[#008069] font-bold mr-2 select-none shrink-0 font-sans text-xs sm:text-sm" : "text-emerald-300 font-bold mr-2 select-none shrink-0 font-sans text-xs sm:text-sm"}>
                  {bulletRaw}
                </span>
              ) : (
                <span className={isLight ? "text-[#008069] font-extrabold mr-2 select-none shrink-0 font-sans text-sm leading-snug" : "text-emerald-400 font-extrabold mr-2 select-none shrink-0 font-sans text-sm leading-snug"}>
                  •
                </span>
              )}
              <span className={isLight ? "flex-1 text-slate-800 leading-relaxed text-xs sm:text-sm font-normal" : "flex-1 text-zinc-150 leading-relaxed text-xs sm:text-sm"}>
                {renderInlineLineContent(content, `${keyPrefix}-list-${lineIndex}`, isLight)}
              </span>
            </div>
          );
        }

        // Is this a definition key? e.g. "Definition: ...", "Note: ...", "Formula: ...", "परिभाषा: ...", "नोट: ..."
        const definitionMatch = line.match(/^([^:]+:\s*)(.*)/);
        if (definitionMatch && !trimmed.startsWith("http")) {
          let rawLabel = definitionMatch[1].replace(/:\s*$/, "").trim();
          rawLabel = rawLabel.replace(/^[\*\#\s\-]+|[\*\#\s\-]+$/g, "");
          if (/teacher\s*tip/i.test(rawLabel)) {
            rawLabel = "Tip for Notebook";
          }
          const content = definitionMatch[2];
          
          if (isValidDefinitionLabel(rawLabel)) {
            const isStructureHeading = /^(HEADING|SUB-HEADING|TITLE|TOPIC)$/i.test(rawLabel);
            
            if (isStructureHeading) {
              const isSub = /^SUB-HEADING$/i.test(rawLabel);
              return (
                <div 
                  key={lineIndex} 
                  className={`relative text-left py-2 border-b ${isLight ? "border-slate-300" : "border-emerald-950/35"} mb-2 mt-1 rounded-lg px-1 transition-all duration-300`}
                >
                  <span className={`${isSub ? (isLight ? "text-emerald-800 text-sm sm:text-base" : "text-[#bae6fd] text-sm sm:text-base") : (isLight ? "text-[#008069] text-base sm:text-lg" : "text-[#fef08a] text-base sm:text-lg")} font-bold block tracking-wider font-sans`} style={isLight ? undefined : { textShadow: isSub ? "0 0 4px rgba(186, 230, 253, 0.4)" : "0 0 5px rgba(254, 240, 138, 0.5)" }}>
                    📌 {renderInlineLineContent(content, `${keyPrefix}-heading-${lineIndex}`, isLight)}
                  </span>
                </div>
              );
            }

            const theme = getChalkThemeForLabel(rawLabel, isLight);
            const displayTitle = theme.labelTitle || rawLabel;

            return (
              <div 
                key={lineIndex} 
                className={`relative text-left py-2 px-3.5 rounded-xl space-y-1 my-2 shadow-xs border-l-4 transition-all duration-300 ${
                  isHighlighted ? "scale-[1.01] ring-1 ring-amber-300/40" : ""
                }`}
                style={{
                  backgroundColor: isHighlighted ? theme.highlightBg : theme.bg,
                  borderLeftColor: isHighlighted ? theme.highlightBorder : theme.border,
                  boxShadow: isHighlighted ? `0 0 16px ${theme.color}45` : undefined
                }}
              >
                <span 
                  className="font-bold tracking-wide text-xs select-none block uppercase font-sans flex items-center gap-1.5" 
                  style={{ 
                    color: theme.color,
                    textShadow: theme.shadow 
                  }}
                >
                  {theme.emoji} {displayTitle}
                </span>
                <div className={isLight ? "text-slate-800 text-xs sm:text-sm leading-relaxed font-normal" : "text-zinc-100/95 text-xs sm:text-sm leading-relaxed antialiased"}>
                  {renderInlineLineContent(content, `${keyPrefix}-def-${lineIndex}`, isLight)}
                </div>
              </div>
            );
          }
        }

        // Standard plain text line
        return (
          <p 
            key={lineIndex} 
            className={isLight ? "relative text-left leading-relaxed text-xs sm:text-sm py-0.5 px-1 rounded-lg text-slate-800 font-normal" : `relative text-left leading-relaxed text-xs sm:text-sm py-1 animate-chalk-fade px-3 rounded-lg transition-all duration-350 ${isHighlighted ? "bg-[#c4f500]/15 border border-[#c4f500]/30 shadow-[0_0_12px_rgba(196,245,0,0.15)] scale-[1.01] text-white" : "hover:bg-white/[0.01]"}`}
          >
            {renderInlineLineContent(line, `${keyPrefix}-plain-${lineIndex}`, isLight)}
          </p>
        );
      })}
    </div>
  );
};

// Clean up and convert standard HTML elements to chalkboard-friendly clean markdown notation
const cleanAndFormatHtmlTags = (rawText: string): string => {
  let cleaned = rawText;

  // Replace Teacher Tip with Tip for Notebook globally
  cleaned = cleaned.replace(/Teacher\s+Tip\s+for\s+Notebook/gi, "Tip for Notebook");
  cleaned = cleaned.replace(/Teacher\s+Tip/gi, "Tip for Notebook");

  // 1. Clean up bullet points or asterisks wrapped around section titles
  // e.g., "- * Subject * * : Computer Science" -> "Subject: Computer Science"
  // e.g., "* Subject ** :" -> "Subject:"
  cleaned = cleaned
    .replace(/^(\s*)[-*•📌📝💡📐✍️✅]?\s*[*_~\s]*(Subject|Question|Answer|Solution|Final Answer|Tip for Notebook|Given Data|Formula|Step\s*\d+)\s*[*_~\s]*:\s*/gim, "$1$2: ")
    .replace(/\b(Question|Answer|Solution|Final Answer|Subject|Class|Grade|Board|Examples|Tools Used|Common Tools Used|Tip for Notebook|Given Data|Formula|Step)\s+:\s*/gi, "$1: ")
    .replace(/(\w+)\s+([.,!?:;])(\s+|$)/g, "$1$2$3")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");

  // 2. Clean up stray leading/trailing asterisks on bullet lines or paragraphs
  // e.g. "- * Digital design refers to ... * *" -> "- Digital design refers to ..."
  cleaned = cleaned
    .replace(/^(\s*-\s*)\*+\s*(.*?)\s*\*+\s*$/gm, "$1$2")
    .replace(/^(\s*)\*+\s*(.*?)\s*\*+\s*$/gm, "$1$2")
    .replace(/\*\*\s+(.*?)\s+\*\*/g, "**$1**")
    .replace(/\*\s+(.*?)\s+\*/g, "*$1*")
    .replace(/\s+\*+\s+\*\s*/g, " ");

  // 3. CRITICAL: Force clear section spacing with double linebreaks (\n\n) before major section titles
  cleaned = cleaned
    .replace(/([^\n])\s*(Answer|Solution|Final Answer)\s*:\s*/gi, "$1\n\nAnswer: ")
    .replace(/([^\n])\s*(Question)\s*:\s*/gi, "$1\n\nQuestion: ")
    .replace(/([^\n])\s*(Tip for Notebook)\s*:\s*/gi, "$1\n\nTip for Notebook: ")
    .replace(/([^\n])\s*(Examples|Key Examples|Common Tools Used|Tools Used|Key Features)\s*:\s*/gi, "$1\n\n$2: ");

  // 4. Strip block level opening/closing containers
  cleaned = cleaned.replace(/<\s*\/?\s*(ul|ol|div)[^>]*>/gi, "\n");

  // 4. Convert standard HTML tags individually
  cleaned = cleaned.replace(/<\s*h1[^>]*>/gi, "\nHEADING: ");
  cleaned = cleaned.replace(/<\s*\/\s*h1\s*>/gi, "\n");

  cleaned = cleaned.replace(/<\s*h2[^>]*>/gi, "\nSUB-HEADING: ");
  cleaned = cleaned.replace(/<\s*\/\s*h2\s*>/gi, "\n");

  cleaned = cleaned.replace(/<\s*h3[^>]*>/gi, "\nSUB-HEADING: ");
  cleaned = cleaned.replace(/<\s*\/\s*h3\s*>/gi, "\n");

  cleaned = cleaned.replace(/<\s*h[4-6][^>]*>/gi, "\nSUB-HEADING: ");
  cleaned = cleaned.replace(/<\s*\/\s*h[4-6]\s*>/gi, "\n");

  // Convert list items
  cleaned = cleaned.replace(/<\s*li[^>]*>/gi, "\n- ");
  cleaned = cleaned.replace(/<\s*\/\s*li\s*>/gi, "\n");

  // Convert paragraphs
  cleaned = cleaned.replace(/<\s*p[^>]*>/gi, "\n");
  cleaned = cleaned.replace(/<\s*\/\s*p\s*>/gi, "\n");

  // 5. Strip inline formatting tags
  cleaned = cleaned.replace(/<\s*(strong|b)[^>]*>/gi, "**");
  cleaned = cleaned.replace(/<\s*\/\s*(strong|b)\s*>/gi, "**");

  cleaned = cleaned.replace(/<\s*(em|i)[^>]*>/gi, "*");
  cleaned = cleaned.replace(/<\s*\/\s*(em|i)\s*>/gi, "*");

  cleaned = cleaned.replace(/<\s*\/?\s*(span|font)[^>]*>/gi, "");

  // 6. Convert line breaks
  cleaned = cleaned.replace(/<\s*br\s*\/?>/gi, "\n");

  // 7. Hide unclosed trailing HTML tags
  cleaned = cleaned.replace(/<[^>]*$/g, "");

  // 8. Clean up excessive sequential newlines
  cleaned = cleaned.replace(/\n\s*\n\s*\n+/g, "\n\n");

  return cleaned;
};

// Helper to clean up punctuation, common Hindi/Hinglish filler words, and map spoken mathematical terms to their formula equivalents
const getNormalizedWords = (rawText: string): Set<string> => {
  const norm = rawText
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'🎙️🎓]/g, " ")
    .replace(/\\/g, " ");
  
  // Split into words, filter minor filler words (both English and Hinglish)
  // this filters things like "hai", "ko", "or", "to", "the", "and", "is", "se", "ki", etc.
  // so we find pure keywords and formula variables!
  const ignoreSet = new Set([
    "the", "and", "or", "to", "in", "of", "on", "at", "by", "for", "with", "about", "against", "after", "before", "each", "every",
    "is", "am", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "a", "an", "this", "that", "these", "those",
    "ko", "se", "ke", "ki", "ka", "me", "par", "hai", "hain", "tha", "thi", "the", "ho", "gaya", "gayi", "aur", "ya", "toh", "ek", "do", "teen",
    "hoga", "hogi", "karo", "kya", "kyun", "kab", "kahan", "kaise", "bhi", "hi", "ne", "re", "arey", "ab", "isame", "isase", "ye", "woh", "voh", "tum",
    "aap", "hum", "main", "mera", "meri", "mere", "apna", "apni", "apne", "use", "usase", "usaki", "usaka", "usake"
  ]);

  const words = norm.split(/\s+/);
  const cleanWordsSet = new Set<string>();

  for (let w of words) {
    w = w.trim();
    if (w.length < 2) continue; // single characters except main variables
    if (ignoreSet.has(w)) continue;
    
    // Map spoken word variants to common LaTeX representations and concept keywords
    if (w === "theta") { cleanWordsSet.add("theta"); cleanWordsSet.add("\\theta"); }
    else if (w === "omega") { cleanWordsSet.add("omega"); cleanWordsSet.add("\\omega"); }
    else if (w === "alpha") { cleanWordsSet.add("alpha"); cleanWordsSet.add("\\alpha"); }
    else if (w === "beta") { cleanWordsSet.add("beta"); cleanWordsSet.add("\\beta"); }
    else if (w === "gamma") { cleanWordsSet.add("gamma"); cleanWordsSet.add("\\gamma"); }
    else if (w === "delta") { cleanWordsSet.add("delta"); cleanWordsSet.add("delta\\theta"); cleanWordsSet.add("\\delta"); cleanWordsSet.add("\\Delta"); }
    else if (w === "lambda") { cleanWordsSet.add("lambda"); cleanWordsSet.add("\\lambda"); }
    else if (w === "pi") { cleanWordsSet.add("pi"); cleanWordsSet.add("\\pi"); }
    else if (w === "tau") { cleanWordsSet.add("tau"); cleanWordsSet.add("\\tau"); }
    else if (w === "frac" || w === "fraction" || w === "divided" || w === "upon" || w === "bata") { cleanWordsSet.add("frac"); cleanWordsSet.add("\\frac"); }
    else if (w === "sutra" || w === "sutram" || w === "formulae") { cleanWordsSet.add("formula"); cleanWordsSet.add("sutra"); }
    else if (w === "samikaran" || w === "samikaranon") { cleanWordsSet.add("equation"); cleanWordsSet.add("samikaran"); }
    else if (w === "paribhasha" || w === "definition") { cleanWordsSet.add("definition"); cleanWordsSet.add("paribhasha"); }
    else if (w === "jugad" || w === "mnemonic" || w === "trick") { cleanWordsSet.add("mnemonic"); cleanWordsSet.add("jugad"); }
    else if (w === "decode" || w === "meaning" || w === "matlab") { cleanWordsSet.add("decode"); cleanWordsSet.add("meaning"); }
    else if (w === "chitra" || w === "aarekh" || w === "diagram" || w === "figure") { cleanWordsSet.add("diagram"); cleanWordsSet.add("figure"); }
    else {
      cleanWordsSet.add(w);
    }
  }

  return cleanWordsSet;
};

const calculateMatchScore = (lineText: string, speechText: string): number => {
  if (!lineText || !speechText) return 0;
  
  const lineWords = getNormalizedWords(lineText);
  const speechWords = getNormalizedWords(speechText);
  
  if (lineWords.size === 0 || speechWords.size === 0) return 0;

  let commonCount = 0;
  for (const lw of lineWords) {
    if (speechWords.has(lw)) {
      commonCount++;
    } else {
      // Fuzzy match for stems (e.g., matching displacement -> displacements)
      for (const sw of speechWords) {
        if (lw.length >= 4 && sw.length >= 4) {
          if (lw.includes(sw) || sw.includes(lw)) {
            commonCount += 0.7; // slight weight for partial stems
            break;
          }
        }
      }
    }
  }

  // Calculate percentage of matched terms in the line (relative density)
  const lineDensity = commonCount / lineWords.size;
  const speechDensity = commonCount / speechWords.size;

  // Let's also check for direct sequence match of 2 or more sequential words!
  let sequentialBonus = 0;
  const cleanLineLower = lineText.toLowerCase().replace(/[#*$`_\\]/g, " ").replace(/\s+/g, " ").trim();
  const cleanSpeechLower = speechText.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ").replace(/\s+/g, " ").trim();
  
  // Find parts of 2-3 words from the line in the speech
  const rawWordsInLine = cleanLineLower.split(/\s+/).filter(w => w.length >= 3 && !new Set(["the", "and", "this", "that"]).has(w));
  for (let i = 0; i <= rawWordsInLine.length - 2; i++) {
    const bigram = `${rawWordsInLine[i]} ${rawWordsInLine[i+1]}`;
    if (cleanSpeechLower.includes(bigram)) {
      sequentialBonus += 3;
    }
  }

  return commonCount * 3 + lineDensity * 12 + speechDensity * 5 + sequentialBonus;
};

const getBestMatchingBlock = (boardText: string, speechText: string): { text: string; score: number } => {
  if (!boardText || !speechText || speechText.trim().length < 4) {
    return { text: "", score: 0 };
  }

  const rawLines = boardText.split("\n");
  const candidates: string[] = [];

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Direct latex displays can also be candidates
    if (trimmed.startsWith("$$") && trimmed.endsWith("$$")) {
      candidates.push(trimmed);
      continue;
    }

    // Isolate pure text from markdown list prefix, definition label, and headers
    let cleaner = trimmed;
    cleaner = cleaner.replace(/^(\s*)(–|-|\*|\d+\.\s+)(definition|formula|equation|note|important|hint|instruction|परिभाषा|सूत्र|समीकरण|नोट|महत्वपूर्ण|उदाहरण)\s*:\s*(.*)/i, "");
    cleaner = cleaner.replace(/^(\s*)(-\s*|\*\s*|\d+\.\s+)/, "");
    cleaner = cleaner.replace(/^HEADING:\s*/gi, "");
    cleaner = cleaner.replace(/^SUB-HEADING:\s*/gi, "");
    cleaner = cleaner.replace(/^([^:]+:\s*)/, ""); // general definition labels

    const cleanedText = cleaner.replace(/[\\/*$#`_]/g, " ").trim();
    if (cleanedText.length >= 4) {
      candidates.push(trimmed); // Store raw original line to match render exact key
    }
  }

  let bestText = "";
  let bestScore = 0;

  for (const cand of candidates) {
    const score = calculateMatchScore(cand, speechText);
    if (score > bestScore) {
      bestScore = score;
      bestText = cand;
    }
  }

  return { text: bestText, score: bestScore };
};

export const MathRenderer: React.FC<MathRendererProps> = ({ text, content, latestSpeech, isLightBg }) => {
  const rawText = text || content || "";
  if (!rawText) return null;

  const isLight = isLightBg || checkIsLightBgActive();

  // Memoize computing the active explained portion in real-time
  const bestBlock = React.useMemo(() => {
    return getBestMatchingBlock(rawText, latestSpeech || "");
  }, [rawText, latestSpeech]);

  // If match score is strong enough, consider it active
  const activeHighlightedText = bestBlock.score >= 3.0 ? bestBlock.text : undefined;

  // Clean SVG code block fences if they exist
  const cleanSvgCode = (code: string) => {
    return code
      .replace(/```xml/gi, "")
      .replace(/```html/gi, "")
      .replace(/```svg/gi, "")
      .replace(/```/g, "")
      .trim();
  };

  // Strip <board> and </board> tags and markdown block code fences to prevent interference with rendering
  let cleanedText = rawText
    .replace(/<\/?board>/gi, "")
    .replace(/```(markdown|text|latex|html|xml|svg|math)?/gi, "")
    .replace(/```/g, "")
    .trim();
  
  // Convert geometric LaTeX macros (with single, double, or more backslashes) to high-fidelity Unicode symbols globally.
  // This ensures they render perfectly both inside KaTeX math blocks and in ordinary markdown/text lines!
  cleanedText = cleanedText
    .replace(/\\{1,4}hexagon\b/g, "⬡")
    .replace(/\\{1,4}pentagon\b/g, "⬠")
    .replace(/\\{1,4}octagon\b/g, "⯃")
    .replace(/\\{1,4}heptagon\b/g, "⬡")
    .replace(/\\{1,4}triangle\b/g, "△")
    .replace(/\\{1,4}square\b/g, "☐")
    .replace(/\\{1,4}circle\b/g, "◯")
    .replace(/\\{1,4}bigcirc\b/g, "◯")
    .replace(/\\{1,4}rectangle\b/g, "▭")
    .replace(/\\{1,4}parallelogram\b/g, "▱")
    .replace(/\\{1,4}trapezoid\b/g, "⏢")
    .replace(/\\{1,4}kite\b/g, "⬨")
    .replace(/\\{1,4}rhombus\b/g, "◊");
  
  // Clean up streaming artifacts: strip trailing slashes, backslashes, or literal /n, \n at the absolute end
  cleanedText = cleanedText.replace(/[\\/]+n$/gi, "").trim();
  cleanedText = cleanedText.replace(/[\\/]+$/g, "").trim();

  // Pre-normalize double backslashes for commands and delimiters to avoid KaTeX and regex parser failures
  let normalizedRawText = cleanedText
    .replace(/\\\\([a-zA-Z]+)/g, "\\$1")
    .replace(/\\\\([{}_^#&%|()[\]])/g, "\\$1");

  // Normalize spaces inside \begin{...} and \end{...} so that the environment name is normalized and easier to match & render.
  normalizedRawText = normalizedRawText.replace(/\\begin\s*\{\s*([a-zA-Z*]+)\s*\}/gi, "\\begin{$1}");
  normalizedRawText = normalizedRawText.replace(/\\end\s*\{\s*([a-zA-Z*]+)\s*\}/gi, "\\end{$1}");

  // Robust real-time parser to separate plain text chunks from SVG diagrams & Parametric Primitives (handles ongoing stream incomplete SVGs/diagrams)
  const parseSegments = (rawText: string) => {
    const segments: { type: "text" | "svg"; content: string; isComplete?: boolean }[] = [];
    let remaining = rawText;
    
    while (remaining.length > 0) {
      const lower = remaining.toLowerCase();
      const svgIndex = lower.indexOf("<svg");
      const diagIndex = lower.indexOf("<diagram");
      const primIndex = lower.indexOf("<primitive");

      const validIndices = [svgIndex, diagIndex, primIndex].filter((idx) => idx !== -1);
      if (validIndices.length === 0) {
        segments.push({ type: "text", content: remaining });
        break;
      }

      const matchIndex = Math.min(...validIndices);
      if (matchIndex > 0) {
        segments.push({ type: "text", content: remaining.slice(0, matchIndex) });
      }

      const rest = remaining.slice(matchIndex);
      const restLower = rest.toLowerCase();

      if (restLower.startsWith("<svg")) {
        const closeIndex = restLower.indexOf("</svg>");
        if (closeIndex !== -1) {
          const svgContent = rest.slice(0, closeIndex + 6);
          segments.push({ type: "svg", content: svgContent, isComplete: true });
          remaining = rest.slice(closeIndex + 6);
        } else {
          // Incomplete SVG being streamed or missing </svg> tag
          const headerMatch = rest.match(/\n#{1,3}\s+/);
          if (headerMatch && headerMatch.index !== undefined && headerMatch.index > 0) {
            const cutoffIndex = headerMatch.index;
            let incompleteSvg = rest.slice(0, cutoffIndex).trim();
            if (!incompleteSvg.toLowerCase().endsWith("</svg>")) {
              incompleteSvg += "\n</svg>";
            }
            segments.push({ type: "svg", content: incompleteSvg, isComplete: true });
            remaining = rest.slice(cutoffIndex);
          } else {
            let incompleteSvg = rest;
            if (!incompleteSvg.toLowerCase().trim().endsWith("</svg>")) {
              incompleteSvg = incompleteSvg + "\n</svg>";
            }
            segments.push({ type: "svg", content: incompleteSvg, isComplete: false });
            break;
          }
        }
      } else {
        // <diagram> or <primitive> parametric tag
        const closeTagIdx = rest.indexOf(">");
        if (closeTagIdx !== -1) {
          const tagContent = rest.slice(0, closeTagIdx + 1);
          segments.push({ type: "svg", content: tagContent, isComplete: true });
          remaining = rest.slice(closeTagIdx + 1);
        } else {
          segments.push({ type: "svg", content: rest, isComplete: false });
          break;
        }
      }
    }
    
    return segments;
  };

  const segments = parseSegments(normalizedRawText);

  return (
    <div className="math-renderer-container inline-wrap whitespace-pre-wrap break-words leading-relaxed select-text w-full space-y-4">
      {/* Chalk roughness filter declaration for dynamic vector drawings */}
      <svg className="absolute w-0 h-0" xmlns="http://www.w3.org/2000/svg" data-html2canvas-ignore="true">
        <defs>
          <filter id="vector-chalk-roughness" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      {segments.map((segment, segIdx) => {
        if (segment.type === "svg") {
          const rawSvg = cleanSvgCode(segment.content);
          return (
            <VectorDisplay 
              key={`vector-svg-${segIdx}`}
              rawSvg={rawSvg}
              index={segIdx}
              isComplete={segment.isComplete}
              isLightBg={isLight}
              latestSpeech={latestSpeech}
            />
          );
        }

        // 2. Normalize LaTeX delimiters for mathematical formulas
        const cleanedText = cleanAndFormatHtmlTags(segment.content);
        const normalizedText = cleanedText
          .replace(/\\\[/g, "$$")
          .replace(/\\\]/g, "$$")
          .replace(/\\\(/g, "$")
          .replace(/\\\)/g, "$");

        // This regex matches BOTH display math delimiters ($$ ... $$ with potential newlines) and latex environments starting with \begin and ending with \end
        const displayMathRegex = /(\$\$[\s\S]*?\$\$|\\begin\s*\{\s*[a-zA-Z*]+\s*\}[\s\S]*?\\end\s*\{\s*[a-zA-Z*]+\s*\})/gi;
        const subParts = normalizedText.split(displayMathRegex);

        return (
          <React.Fragment key={`text-seg-${segIdx}`}>
            {subParts.map((part, index) => {
              const trimmedPart = part.trim();
              const isBlockMath = (trimmedPart.startsWith("$$") && trimmedPart.endsWith("$$")) || 
                                  /^\\begin\s*\{\s*[a-zA-Z*]+\s*\}/i.test(trimmedPart);

              if (isBlockMath) {
                const isEnv = /^\\begin\s*\{\s*[a-zA-Z*]+\s*\}/i.test(trimmedPart);
                const formula = isEnv ? trimmedPart : trimmedPart.slice(2, -2).trim();
                const isMathHighlighted = !!(activeHighlightedText && (part.trim() === activeHighlightedText.trim() || trimmedPart === activeHighlightedText.trim()));
                try {
                  const html = renderKatexCached(formula, true);
                  return (
                    <div
                      key={`block-math-${index}`}
                      className={`my-3 p-3 sm:p-4 rounded-2xl text-center font-mono text-sm sm:text-base leading-normal shadow-sm max-w-full overflow-x-auto custom-math-block relative transition-all duration-300 border-2 scrollbar-thin ${
                        isLight
                          ? "bg-emerald-50 border-emerald-300 text-emerald-950 font-bold"
                          : isMathHighlighted 
                            ? "bg-sky-950/40 border-[#bae6fd]/80 shadow-[0_0_20px_rgba(186,230,253,0.3)] scale-[1.01]" 
                            : "bg-black/20 border-sky-900/30 text-[#bae6fd]"
                      }`}
                      style={isLight ? undefined : {
                        boxShadow: isMathHighlighted 
                          ? "inset 0 0 10px rgba(186, 230, 253, 0.2), 0 0 20px rgba(186, 230, 253, 0.3)" 
                          : "inset 0 0 10px rgba(186, 230, 253, 0.05), 0 0 15px rgba(186, 230, 253, 0.1)",
                        borderColor: isMathHighlighted ? "rgba(186, 230, 253, 0.8)" : "rgba(186, 230, 253, 0.35)"
                      }}
                      id={`math-block-${segIdx}-${index}`}
                    >
                      <div className="overflow-x-auto max-w-full py-0.5 text-center font-mono select-all" dangerouslySetInnerHTML={{ __html: html }} />
                    </div>
                  );
                } catch (e) {
                  return (
                    <span key={`error-block-math-${index}`} className="text-red-500 font-mono">
                      {part}
                    </span>
                  );
                }
              } else {
                // Plain text containing inline math
                let cleanedPart = part.replace(/[\\/]n(?![a-z])/gi, "\n");
                // Remove any leftover raw XML/HTML tags to keep text clean
                cleanedPart = cleanedPart.replace(/<[^>]*>/gi, "");
                return (
                   <React.Fragment key={`plain-${index}`}>
                     {renderPlainTextWithChalkStyle(cleanedPart, `seg-${segIdx}-part-${index}`, activeHighlightedText, isLight)}
                   </React.Fragment>
                );
              }
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
};
