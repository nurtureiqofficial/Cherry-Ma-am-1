import React, { useState, useRef, useEffect } from "react";
import { Maximize2, X, Download, RefreshCw, ZoomIn, ZoomOut, Sliders, Sparkles, Box } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { parseAndRenderDiagramTag } from "../utils/parametricPrimitives";
import { sanitizeSvg } from "../utils/sanitizeSvg";

interface VectorDisplayProps {
  rawSvg: string;
  index: number;
  isComplete?: boolean;
  isLightBg?: boolean;
  isHighlighted?: boolean;
  latestSpeech?: string;
}

export const VectorDisplay: React.FC<VectorDisplayProps> = ({ rawSvg, index, isComplete = true, isLightBg, isHighlighted, latestSpeech }) => {
  const [renderMode, setRenderMode] = useState<"rough" | "laser">("rough");
  const [glowIntensity, setGlowIntensity] = useState<number>(1); // 1px default as requested
  const [chalkTurbulence, setChalkTurbulence] = useState<number>(0.5); // 0.5 default as requested
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
  const [animationKey, setAnimationKey] = useState(0); // Trigger draw animate
  const [localZoom, setLocalZoom] = useState(1);
  const [shouldAnimate, setShouldAnimate] = useState(true);
  const canvasRef = useRef<HTMLDivElement>(null);
  const modalCanvasRef = useRef<HTMLDivElement>(null);

  // Active board background theme style detection
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const checkTheme = () => {
      const el = document.getElementById("chalkboard-main-slate");
      setIsLight(el ? el.classList.contains("light-board-chalk") : false);
    };
    checkTheme();

    const target = document.getElementById("chalkboard-main-slate");
    if (!target) return;
    const observer = new MutationObserver(() => {
      checkTheme();
    });
    observer.observe(target, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const effectiveIsLight = isLightBg || isLight;

  // Student Annotation Canvas scribble layers
  const [isScribbleActive, setIsScribbleActive] = useState(false);
  const [scribbleColor, setScribbleColor] = useState("#c4f500"); // Yellow neon chalk default

  useEffect(() => {
    setScribbleColor(isLight ? "#0f172a" : "#c4f500");
  }, [isLight]);
  const scribbleCanvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(400);
  const [canvasHeight, setCanvasHeight] = useState(250);
  const [isDrawing, setIsDrawing] = useState(false);

  // ResizeObserver to physically size the canvas elements matching the parent container
  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasWidth(width);
        setCanvasHeight(height);
        
        const canvas = scribbleCanvasRef.current;
        if (canvas) {
          canvas.width = width;
          canvas.height = height;
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [canvasRef, isScribbleActive]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = scribbleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = scribbleColor;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    // Glowing handdrawn chalk properties
    ctx.shadowBlur = 4;
    ctx.shadowColor = scribbleColor;

    setIsDrawing(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = scribbleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = scribbleCanvasRef.current;
    if (!canvas) return;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}
    setIsDrawing(false);
  };

  const clearScribbles = () => {
    const canvas = scribbleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // Force 100% stable static SVG illustration drawing instantly (no tracing animation or truncation risk)
  useEffect(() => {
    setShouldAnimate(false);
    const makeStatic = (container: HTMLDivElement | null) => {
      if (!container) return;
      const svg = container.querySelector("svg");
      if (!svg) return;
      const shapes = svg.querySelectorAll<SVGGeometryElement>(
        "path, line, circle, rect, ellipse, polyline, polygon, g, text, tspan"
      );
      shapes.forEach((shape) => {
        shape.style.strokeDasharray = "";
        shape.style.strokeDashoffset = "";
        shape.style.transition = "";
        shape.style.opacity = "1";
        shape.style.animation = "";
      });
      svg.style.opacity = "1";
    };

    // Make static immediately on mount & setup
    makeStatic(canvasRef.current);
    if (isZoomModalOpen) {
      makeStatic(modalCanvasRef.current);
    }

    const timer = setTimeout(() => {
      makeStatic(canvasRef.current);
      if (isZoomModalOpen) {
        makeStatic(modalCanvasRef.current);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [rawSvg, animationKey, isZoomModalOpen, isComplete]);

  // Helper to convert raw LaTeX chunks of mathematical and greek characters to fully formatted unicode strings
  const cleanLatexInSvg = (text: string): string => {
    if (!text) return text;
    let clean = text;
    
    // Replace LaTeX inline/math delimiters
    clean = clean.replace(/\$/g, "");
    
    // Convert subscripts like _{initial} to _initial
    clean = clean.replace(/_{(.*?)}/g, "_$1");
    // Convert superscripts like ^{2} to ² or simple super expressions
    clean = clean.replace(/\^{(.*?)}/g, "^$1");
    
    // Pre-convert standard squared/cubed symbols for high fidelity representation
    clean = clean.replace(/\^2\b/g, "²");
    clean = clean.replace(/\^3\b/g, "³");
    
    // Clean up typical LaTeX commands using standard unicode equivalents
    const latexMap: Record<string, string> = {
      "\\\\theta": "θ", "\\theta": "θ",
      "\\\\Delta": "Δ", "\\Delta": "Δ",
      "\\\\omega": "ω", "\\omega": "ω",
      "\\\\alpha": "α", "\\alpha": "α",
      "\\\\beta": "β", "\\beta": "β",
      "\\\\gamma": "γ", "\\gamma": "γ",
      "\\\\delta": "δ", "\\delta": "δ",
      "\\\\pi": "π", "\\pi": "π",
      "\\\\sigma": "σ", "\\sigma": "σ",
      "\\\\mu": "μ", "\\mu": "μ",
      "\\\\phi": "φ", "\\phi": "φ",
      "\\\\psi": "ψ", "\\psi": "ψ",
      "\\\\lambda": "λ", "\\lambda": "λ",
      "\\\\eta": "η", "\\eta": "η",
      "\\\\tau": "τ", "\\tau": "τ",
      "\\\\chi": "χ", "\\chi": "χ",
      "\\\\rho": "ρ", "\\rho": "ρ",
      "\\\\epsilon": "ε", "\\epsilon": "ε",
      "\\\\zeta": "ζ", "\\zeta": "ζ",
      "\\\\infty": "∞", "\\infty": "∞",
      "\\\\partial": "∂", "\\partial": "∂",
      "\\\\nabla": "∇", "\\nabla": "∇",
      "\\\\times": "×", "\\times": "×",
      "\\\\div": "÷", "\\div": "÷",
      "\\\\pm": "±", "\\pm": "±",
      "\\\\mp": "∓", "\\mp": "∓",
      "\\\\le": "≤", "\\le": "≤",
      "\\\\ge": "≥", "\\ge": "≥",
      "\\\\neq": "≠", "\\neq": "≠",
      "\\\\approx": "≈", "\\approx": "≈",
      "\\\\propto": "∝", "\\propto": "∝",
      "\\\\rightarrow": "→", "\\rightarrow": "→",
      "\\\\leftarrow": "←", "\\leftarrow": "←",
      "\\\\cdot": "·", "\\cdot": "·",
      "\\\\text": "", "\\text": "",
      "\\\\mathrm": "", "\\mathrm": "",
      "\\\\mathbf": "", "\\mathbf": "",
      "\\\\mathit": "", "\\mathit": "",
      "\\\\vec": "vec ", "\\vec": "vec ",
      "\\\\bar": "bar ", "\\bar": "bar ",
      "\\\\hat": "hat ", "\\hat": "hat "
    };

    const sortedKeys = Object.keys(latexMap).sort((a, b) => b.length - a.length);
    for (const k of sortedKeys) {
      const escaped = k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const rx = new RegExp(escaped, "g");
      clean = clean.replace(rx, latexMap[k]);
    }
    
    // Explicit general cleanup of any trailing backslashes and redundant syntax braces
    clean = clean.replace(/\\/g, "").replace(/[{}]/g, "");
    
    return clean;
  };

  // Process SVG to inject glowing neon properties on lines and paths dynamically if not already styled
  const processSvgString = (rawXml: string) => {
    try {
      let processed = rawXml || "";
      if (!processed.trim()) return "";

      // Layer 1 Hybrid check: If rawXml contains a parametric <diagram> or <primitive> tag, resolve it instantly!
      if (processed.toLowerCase().includes("<diagram") || processed.toLowerCase().includes("<primitive")) {
        const primitiveSvg = parseAndRenderDiagramTag(processed);
        if (primitiveSvg) {
          processed = primitiveSvg;
        }
      }

      // Auto-close unclosed <svg> tags if LLM stream cut off
      if (processed.toLowerCase().includes("<svg") && !processed.toLowerCase().includes("</svg>")) {
        processed = processed + "</svg>";
      }

      // In light mode, convert any dark rect background fill (e.g. #051512, #0f172a, #1e293b, #000, #111) to clean white #ffffff
      if (effectiveIsLight) {
        processed = processed.replace(
          /fill=(['"])(#051512|#051310|#0f172a|#1e293b|#0a192f|#000000|#000|#111111|#111|#1a1a1a|#222222|#222)\1/gi,
          'fill="#ffffff"'
        );
        processed = processed.replace(
          /fill\s*:\s*(#051512|#051310|#0f172a|#1e293b|#0a192f|#000000|#000|#111111|#111|#1a1a1a|#222222|#222)/gi,
          'fill: #ffffff'
        );
      }

      // 1. Convert any embedded LaTeX tags inside SVG text and tspan tag bodies into high fidelity readable Unicode text
    processed = processed.replace(/<tspan\b([^>]*)>([\s\S]*?)<\/tspan>/gi, (match, attrs, content) => {
      return `<tspan${attrs}>${cleanLatexInSvg(content)}</tspan>`;
    });

    processed = processed.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi, (match, attrs, content) => {
      return `<text${attrs}>${cleanLatexInSvg(content)}</text>`;
    });

    // 2. Process text and tspan tags first to convert dark colors to currentColor and default empty fills to currentColor
    processed = processed.replace(/<(text|tspan)\b([^>]*)/gi, (match, tag, attrs) => {
      let refinedAttrs = attrs;
      if (attrs.includes("fill=")) {
        refinedAttrs = refinedAttrs.replace(/fill=(['"])(black|#000000|#000|#111|#111111|#1a1a1a|#222|#222222)\1/gi, 'fill="currentColor"');
      } else if (!attrs.toLowerCase().includes("style=") || !attrs.toLowerCase().includes("fill")) {
        // If there's no fill attribute or style containing fill, append fill="currentColor"
        refinedAttrs += ' fill="currentColor"';
      }
      
      // Clean up any inline text styles with dark colors
      refinedAttrs = refinedAttrs.replace(/fill\s*:\s*(black|#000000|#000|#111|#111111|#1a1a1a|#222|#222222)/gi, "fill: currentColor");
      refinedAttrs = refinedAttrs.replace(/stroke\s*:\s*(black|#000000|#000|#111|#111111|#1a1a1a|#222|#222222)/gi, "stroke: currentColor");
      
      return `<${tag}${refinedAttrs}`;
    });

    // 2. Standardize dark colors inside embed style blocks
    processed = processed.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (match, attrs, cssContent) => {
      let refinedCss = cssContent
        .replace(/(stroke|fill)\s*:\s*(black|#000000|#000|#111|#111111|#1a1a1a|#222|#222222)/gi, "$1: currentColor")
        .replace(/#000000|#000|#111111|#111/gi, "currentColor");
      return `<style${attrs}>${refinedCss}</style>`;
    });

    // 3. Standardize dark colors / black lines on general shape tags so they are perfectly visible as chalk white / neon lines on dark board
    processed = processed
      .replace(/stroke=(['"])(black|#000000|#000|#111|#111111|#1a1a1a|#222|#222222)\1/gi, 'stroke="currentColor"')
      .replace(/fill=(['"])(black|#000000|#000|#111|#111111|#1a1a1a|#222|#222222)\1/gi, 'fill="none"')
      // Support standard styled strokes/fills inside elements or general tags
      .replace(/stroke\s*:\s*(black|#000000|#000|#111|#111111|#1a1a1a|#222|#222222)/gi, 'stroke: currentColor')
      .replace(/fill\s*:\s*(black|#000000|#000|#111|#111111|#1a1a1a|#222|#222222)/gi, 'fill: none')
      // If there are standard strokes from PDF/sheet templates without specific width, make them thicker for blackboard chalk effect
      .replace(/stroke-width=(['"])1(\.0)?px?\1/gi, 'stroke-width="2"')
      .replace(/stroke-width=(['"])0\.5px?\1/gi, 'stroke-width="1.5"');

    // 4. Ensure every path, line, polyline, polygon, circle, rect has beautiful round caps and linejoins for handdrawn feel
    const tagsToRefine = ["path", "line", "polyline", "polygon", "circle", "rect"];
    tagsToRefine.forEach(tag => {
      // Capture structural attributes and optional self-closing slash separately to preserve valid XML/SVG syntax
      const tagRegex = new RegExp(`<${tag}\\b([^>]*?)(/?)>`, "gi");
      processed = processed.replace(tagRegex, (match, attrs, selfClosing) => {
        let refinedAttrs = attrs;
        if (!attrs.includes("stroke-linecap")) {
          refinedAttrs += ' stroke-linecap="round"';
        }
        if (!attrs.includes("stroke-linejoin")) {
          refinedAttrs += ' stroke-linejoin="round"';
        }
        return `<${tag}${refinedAttrs}${selfClosing}>`;
      });
    });

    // 5. Ensure svg has standard viewbox (case-insensitive checks)
    if (!processed.includes("viewBox") && !processed.includes("viewbox")) {
      processed = processed.replace(/<svg/i, "<svg viewBox='0 0 400 250'");
    }

    // 6. Inject standard responsive width and height metrics on root SVG tag and strip rigid pixel/decimal/percentage widths/heights
    const svgTagMatch = processed.match(/<svg([^>]*)/i);
    if (svgTagMatch) {
      let attrs = svgTagMatch[1];
      // Strip any existing width or height attribute value cleanly (supporting integers, decimals, spaces, or percentages)
      attrs = attrs.replace(/\b(width|height)\s*=\s*(['"])[^'"]*\2/gi, "");
      processed = processed.replace(svgTagMatch[1], `${attrs} width="100%" height="auto" style="display: block; max-height: 480px; margin: 0 auto;"`);
    }

    // 7. Inject custom glow styles based on the glowIntensity state safely
    const glowColorFilter = effectiveIsLight 
      ? "none" 
      : `drop-shadow(0 0 ${glowIntensity}px rgba(52, 211, 153, 0.6))`;
    const injectStyles = `filter: ${glowColorFilter}; transition: filter 0.3s ease;`;

    const finalSvgMatch = processed.match(/<svg([^>]*)/i);
    if (finalSvgMatch) {
      const fullOpeningAttributes = finalSvgMatch[1];
      const styleMatch = fullOpeningAttributes.match(/style=(['"])(.*?)\1/i);
      if (styleMatch) {
        const quote = styleMatch[1];
        const existingStyleValues = styleMatch[2];
        const updatedStyleAttribute = `style=${quote}${injectStyles} ${existingStyleValues}${quote}`;
        const oldStyleString = styleMatch[0];
        const updatedAttributes = fullOpeningAttributes.replace(oldStyleString, updatedStyleAttribute);
        processed = processed.replace(fullOpeningAttributes, updatedAttributes);
      } else {
        processed = processed.replace(/<svg/i, `<svg style="${injectStyles}"`);
      }
    }

      return processed;
    } catch (e) {
      console.error("SVG processing error, returning raw XML:", e);
      return rawXml || "";
    }
  };

  const processedSvgString = sanitizeSvg(processSvgString(rawSvg));

  const handleDownload = () => {
    try {
      const blob = new Blob([processedSvgString], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cherry-chalkboard-diagram-${index}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed downloading SVG vector asset:", e);
    }
  };

  const triggerAnimationReset = () => {
    setAnimationKey((prev) => prev + 1);
  };

  const isDiagramActiveInSpeech = React.useMemo(() => {
    if (isHighlighted) return true;
    if (!latestSpeech || latestSpeech.trim().length < 3) return false;
    const lower = latestSpeech.toLowerCase();
    return /\b(diagram|figure|svg|vector|drawing|schematic|chitra|aarekh|चित्र|आरेख|सचित्र|structure|atom|lens|circuit|wave|pulley|projectile|inclined|plane|fbd|molecule|organelle)\b/i.test(lower);
  }, [isHighlighted, latestSpeech]);

  return (
    <div 
      key={animationKey}
      className={`my-4 p-3 rounded-2xl flex flex-col items-center justify-center shadow-sm relative group max-w-full select-none border transition-all duration-300 ${
        isDiagramActiveInSpeech
          ? effectiveIsLight
            ? "bg-cyan-50/80 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.3)] scale-[1.01]"
            : "bg-[#04201a] border-[#22d3ee] shadow-[0_0_22px_rgba(34,211,238,0.35)] scale-[1.01]"
          : effectiveIsLight 
            ? "bg-white border-slate-200 text-slate-800 shadow-sm" 
            : "bg-[#051512] border-emerald-950/45 text-emerald-300 shadow-lg"
      }`}
      id={`interactive-drawing-${index}`}
      data-html2canvas-ignore="true"
    >
      {/* Dynamic Chalk-stroke Hybrid rendering details banner style */}
      <style>{`
        .hybrid-glow-pulse {
          animation: hybridGlowPulse 2.5s infinite alternate ease-in-out;
        }
        @keyframes hybridGlowPulse {
          from { filter: drop-shadow(0 0 1px rgba(52, 211, 153, 0.4)); }
          to { filter: drop-shadow(0 0 4px rgba(52, 211, 153, 0.75)); }
        }
      `}</style>

      {/* Grid coordinate background overlay */}
      <div className={`absolute inset-0 pointer-events-none ${
        effectiveIsLight 
          ? "bg-[radial-gradient(rgba(15,23,42,0.03)_1.2px,transparent_1.2px)]" 
          : "bg-[radial-gradient(rgba(255,255,255,0.025)_1.2px,transparent_1.2px)]"
      } bg-[size:15px_15px]`} />

      {/* Unique chalk texture roughness selector declaration */}
      <svg className="absolute w-0 h-0" xmlns="http://www.w3.org/2000/svg" data-html2canvas-ignore="true">
        <defs>
          <filter id={`chalk-rough-filter-${index}`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="4" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale={chalkTurbulence} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      {/* Subtle hover controls for download / redraw / maximize */}
      <div className="absolute top-2.5 right-2.5 z-30 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-auto">
        <button
          onClick={triggerAnimationReset}
          className={`p-1 rounded border transition-all cursor-pointer ${
            effectiveIsLight ? "bg-slate-100 border-slate-300 text-slate-600 hover:text-slate-900" : "bg-black/60 border-emerald-950/40 text-zinc-400 hover:text-emerald-300"
          }`}
          title="Redraw diagram stroke animations"
        >
          <RefreshCw className="w-3 h-3" />
        </button>

        <button
          onClick={handleDownload}
          className={`p-1 rounded border transition-all cursor-pointer ${
            effectiveIsLight ? "bg-slate-100 border-slate-300 text-slate-600 hover:text-slate-900" : "bg-black/60 border-emerald-950/40 text-zinc-400 hover:text-emerald-300"
          }`}
          title="Export precise SVG to device"
        >
          <Download className="w-3 h-3" />
        </button>

        <button
          onClick={() => setIsZoomModalOpen(true)}
          className={`p-1 rounded border transition-all cursor-pointer ${
            effectiveIsLight ? "bg-slate-100 border-slate-300 text-slate-600 hover:text-slate-900" : "bg-black/60 border-emerald-950/40 text-zinc-400 hover:text-emerald-300"
          }`}
          title="Open in Zoomable Full-Sized Workspace"
        >
          <Maximize2 className="w-3 h-3" />
        </button>
      </div>

      {/* RENDER CANVAS CONTAINER WITH CHALK BRUSH FILTER AND VECTOR ANIMATION */}
      <div 
        ref={canvasRef}
        className={`w-full flex items-center justify-center p-3 rounded-xl relative z-10 transition-transform duration-300 min-h-[160px] overflow-hidden border ${
          effectiveIsLight 
            ? "bg-white border-slate-100" 
            : "bg-black/20 border-emerald-950/10"
        }`}
      >
        {/* Real-time Streaming State Watermark Badge */}
        {!isComplete && (
          <div className={`absolute top-2 left-2 z-30 flex items-center gap-1.5 px-2 py-0.5 rounded text-[8px] font-mono animate-pulse uppercase select-none tracking-widest font-extrabold shadow-md pointer-events-none ${
            effectiveIsLight ? "bg-slate-100 border border-slate-300 text-slate-700" : "bg-emerald-950/85 border border-emerald-500/35 text-emerald-300"
          }`}>
            <RefreshCw className="w-2.5 h-2.5 text-emerald-500 animate-spin" />
            <span>Drawing...</span>
          </div>
        )}

        {/* Always render the dynamic SVG node so streaming elements draw step-by-step */}
        <div 
          className={`w-full flex items-center justify-center max-w-full md:max-w-2xl mx-auto relative z-10 ${
            effectiveIsLight ? "text-slate-900" : "hybrid-glow-pulse text-emerald-300"
          }`}
          style={renderMode === "rough" ? { filter: `url(#chalk-rough-filter-${index})` } : {}}
          dangerouslySetInnerHTML={{ __html: processedSvgString }}
        />

        {/* Transparent Interactive Drawing Stage */}
        <canvas
          ref={scribbleCanvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={`absolute inset-0 z-20 cursor-crosshair rounded-xl ${
            isScribbleActive ? "pointer-events-auto block" : "pointer-events-none hidden"
          }`}
          style={{ width: "100%", height: "100%", touchAction: "none" }}
        />
      </div>

      {/* FULL-SCREEN IMMERSIVE VECTOR STUDY MODAL */}
      <AnimatePresence>
        {isZoomModalOpen && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className={`w-full max-w-3xl h-[85vh] rounded-3xl flex flex-col overflow-hidden relative shadow-2xl border-2 transition-all duration-300 ${
              isLight 
                ? "bg-[#cfece8] border-[#99d3cb] text-[#1c3b36]" 
                : "bg-[#051310] border-emerald-800/40 text-emerald-300"
            }`}>
              
              {/* Grid backdrop */}
              <div className={`absolute inset-0 pointer-events-none ${
                isLight 
                  ? "bg-[radial-gradient(rgba(15,23,42,0.02)_2px,transparent_2px)]" 
                  : "bg-[radial-gradient(rgba(255,255,255,0.025)_2px,transparent_2px)]"
              } bg-[size:18px_18px]`} />

              {/* Modal slate header */}
              <div className={`p-5 border-b flex items-center justify-between z-10 ${
                isLight ? "border-[#99d3cb]/50 bg-white/20" : "border-emerald-950/60 bg-black/20"
              }`}>
                <div className="space-y-1">
                  <h3 className={`text-xs font-bold font-mono tracking-wider uppercase flex items-center gap-2 ${
                    isLight ? "text-[#1c3b36]" : "text-emerald-400"
                  }`}>
                    <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                    Interactive Full-Screen Drawing Board
                  </h3>
                  <p className={`text-[10px] font-medium ${
                    isLight ? "text-zinc-600" : "text-zinc-500"
                  }`}>
                    Analyze handwritten vectors, physics cycles, and diagram equations in absolute detail
                  </p>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setLocalZoom(prev => Math.max(0.5, prev - 0.25))}
                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                      isLight 
                        ? "bg-white border-[#99d3cb]/60 hover:bg-zinc-50 text-zinc-700 hover:text-[#1c3b36]" 
                        : "bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white"
                    }`}
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className={`text-[10px] font-mono font-bold select-none w-8 text-center py-0.5 rounded ${
                    isLight ? "bg-white text-zinc-700" : "bg-zinc-950 text-zinc-400"
                  }`}>
                    {Math.round(localZoom * 100)}%
                  </span>
                  <button
                    onClick={() => setLocalZoom(prev => Math.min(3, prev + 0.25))}
                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                      isLight 
                        ? "bg-white border-[#99d3cb]/60 hover:bg-zinc-50 text-zinc-700 hover:text-[#1c3b36]" 
                        : "bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white"
                    }`}
                    title="Zoom In"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  
                  <div className={`w-0.5 h-6 ${isLight ? "bg-[#99d3cb]/50" : "bg-zinc-900"}`} />

                  <button
                    onClick={() => setIsZoomModalOpen(false)}
                    className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                      isLight 
                        ? "bg-white border-[#99d3cb]/60 hover:bg-rose-50 text-zinc-700 hover:text-rose-600" 
                        : "bg-zinc-900 hover:bg-rose-950/30 border-zinc-800 hover:border-rose-900/40 text-zinc-400 hover:text-rose-400"
                    }`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Large responsive drawing viewer */}
              <div ref={modalCanvasRef} className="flex-1 overflow-auto flex items-center justify-center p-6 relative">
                {!isComplete && (
                  <div className={`absolute top-3 left-4 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded text-[8px] font-mono animate-pulse uppercase tracking-widest font-extrabold shadow-md ${
                    isLight 
                      ? "bg-white border border-[#99d3cb]/60 text-zinc-700" 
                      : "bg-emerald-950/75 border border-emerald-500/35 text-emerald-300"
                  }`}>
                    <RefreshCw className="w-2.5 h-2.5 text-emerald-400 animate-spin" />
                    <span>Drawing SVG live...</span>
                  </div>
                )}
                
                <div 
                  className={`transition-transform duration-200 origin-center ${
                    isLight ? "text-[#1c3b36]" : "hybrid-glow-pulse text-emerald-300"
                  }`}
                  style={{ 
                    transform: `scale(${localZoom})`,
                    filter: renderMode === "rough" ? `url(#chalk-rough-filter-${index})` : ""
                  }}
                  dangerouslySetInnerHTML={{ __html: processedSvgString }}
                />
              </div>

              {/* Modal footer hints */}
              <div className={`p-4 border-t font-mono text-[9px] text-center flex items-center justify-between px-6 z-10 ${
                isLight 
                  ? "bg-white/20 border-[#99d3cb]/50 text-zinc-600" 
                  : "bg-black/40 border-t border-emerald-950/40 text-zinc-500"
              }`}>
                <span>Diagram No: #{index}</span>
                <span className={`uppercase tracking-widest font-bold ${
                  isLight ? "text-amber-850" : "text-amber-450"
                }`}>Press ESC or click close to return to class</span>
              </div>

            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
