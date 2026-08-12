import { useEffect, useRef, useState } from "react";
// @ts-ignore
import html2canvas from "html2canvas";
import { saveRecording, SavedRecording } from "../utils/recordingsDB";

interface UseBlackboardRecorderProps {
  mainCanvas: HTMLCanvasElement | null;
  micStream: MediaStream | null;
  playbackStream: MediaStream | null;
  isClassRunning: boolean;
  theme: string;
  themeConfig: {
    primary: string;
    accent: string;
    chalkColors?: string[];
  };
  studentName: string;
  subject: string;
  lessonTitle: string;
  boardText: string; // The typewriter content or session notes
  cherrySpeechText?: string; // Real-time active speech transcript from Cherry Ma'am
  cherryIsSpeaking?: boolean; // Whether Cherry Ma'am is actively speaking/playing audio
  teachingPhase?: string; // The current teaching phase (e.g. concept, example, doubt)
  sessionId: string | null;
  onToast: (msg: string, type: "success" | "info" | "error") => void;
  onRecordingSaved?: () => void;
}

function formatLatexToReadable(text: string): string {
  if (!text) return "";
  let formatted = text;

  const subscripts: { [key: string]: string } = {
    "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
    "a": "ₐ", "b": "♭", "c": "꜀", "d": "ᵈ", "e": "ₑ", "f": "𝒻", "g": "₉", "h": "ₕ", "i": "ᵢ", "j": "ⱼ",
    "k": "ₖ", "l": "ₗ", "m": "ₘ", "n": "ₙ", "o": "ₒ", "p": "ₚ", "r": "ᵣ", "s": "ₛ", "t": "ₜ", "u": "ᵤ",
    "v": "ᵥ", "x": "ₓ", "y": "ᵧ", "z": "₂"
  };

  const superscripts: { [key: string]: string } = {
    "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
    "n": "ⁿ", "x": "ˣ", "y": "ʸ", "v": "ᵛ", "+": "⁺", "-": "⁻"
  };

  // Convert word subscripts like {ideal}, {total}, {net}, {max}, {min}, {in}, {out}, {eff}
  formatted = formatted.replace(/_\{([a-zA-Z0-9\s]+)\}/g, (_, inner) => {
    const wordLower = inner.toLowerCase().trim();
    const wordMap: { [key: string]: string } = {
      "ideal": " (ideal)",
      "total": " (total)",
      "net": " (net)",
      "max": " (max)",
      "min": " (min)",
      "in": " (in)",
      "out": " (out)",
      "eff": " (eff)",
      "initial": " (init)",
      "final": " (final)",
      "mech": " (mech)",
      "kin": " (kin)",
      "pot": " (pot)",
    };
    if (wordMap[wordLower]) return wordMap[wordLower];
    return inner.split('').map((c: string) => subscripts[c] || c).join('');
  });

  // Convert superscripts
  formatted = formatted.replace(/\^\{([a-zA-Z0-9+-]+)\}/g, (_, chars) => {
    return chars.split('').map((c: string) => superscripts[c] || c).join('');
  });
  formatted = formatted.replace(/\^([a-zA-Z0-9+-])/g, (_, char) => superscripts[char] || char);

  // Convert single char subscripts
  formatted = formatted.replace(/_([a-zA-Z0-9])/g, (_, char) => subscripts[char] || char);

  // Common fraction replacements
  formatted = formatted.replace(/\b1\/2\b/g, "½");
  formatted = formatted.replace(/\b1\/4\b/g, "¼");
  formatted = formatted.replace(/\b3\/4\b/g, "¾");

  // Replace LaTeX frac with division slash
  for (let i = 0; i < 5; i++) {
    formatted = formatted.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1 / $2");
    formatted = formatted.replace(/\\frac\(([^()]+)\)\(([^()]+)\)/g, "$1 / $2");
  }

  // LaTeX macros mapping
  formatted = formatted.replace(/\\times\b/g, "×");
  formatted = formatted.replace(/\\times/g, "×");
  formatted = formatted.replace(/\\eta\b/g, "η");
  formatted = formatted.replace(/\\eta/g, "η");
  formatted = formatted.replace(/\(eta\)/g, "η");
  formatted = formatted.replace(/\\neq\b/g, "≠");
  formatted = formatted.replace(/\\neq/g, "≠");
  formatted = formatted.replace(/\\quad\b/g, "  ");
  formatted = formatted.replace(/\\(text|mathrm|mathbf|mathit|textbf|textit|underline)\{([^{}]+)\}/g, "$2");
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

  // Clean any remaining stray backslashes before commands
  formatted = formatted.replace(/\\([a-zA-Z]+)/g, "$1");

  // Normalize spaces
  formatted = formatted.replace(/ \s+/g, " ");

  return formatted.trim();
}

function drawDynamicLessonDiagram(
  bCtx: CanvasRenderingContext2D,
  topicText: string,
  speechText: string,
  theme: string,
  isLight: boolean,
  panelX: number = 670,
  panelY: number = 135,
  panelW: number = 570,
  panelH: number = 540
) {
  const text = (topicText + " " + speechText).toLowerCase();
  
  const cx = panelX + panelW / 2;
  const cy = panelY + panelH / 2;

  // Colors
  const lineCol = isLight ? "#0a3641" : "#ffffff";
  const strokeCol = isLight ? "#0d9488" : "#2dd4bf"; // Teal / Mint chalk
  const accentCol = isLight ? "#d97706" : "#fde047"; // Yellow chalk
  const pinkCol = isLight ? "#e11d48" : "#f87171"; // Pink / Red chalk
  const cyanCol = isLight ? "#0284c7" : "#38bdf8"; // Cyan chalk
  const cardBg = isLight ? "rgba(255,255,255,0.9)" : "#061613";
  const cardBorder = isLight ? "#dae1dd" : "rgba(45, 212, 191, 0.35)";

  bCtx.save();
  bCtx.beginPath();
  bCtx.rect(panelX, panelY, panelW, panelH);
  bCtx.clip();

  // 1. PULLEY / MACHINES DIAGRAM
  if (text.includes("pulley") || text.includes("movable") || text.includes("mechanical advantage") || text.includes("velocity ratio") || text.includes("load") || text.includes("effort")) {
    const ceilY = panelY + 50;
    bCtx.strokeStyle = lineCol;
    bCtx.lineWidth = 3;
    bCtx.beginPath();
    bCtx.moveTo(cx - 160, ceilY);
    bCtx.lineTo(cx + 160, ceilY);
    bCtx.stroke();

    // Ceiling hatching
    bCtx.strokeStyle = isLight ? "rgba(10,54,65,0.4)" : "rgba(255,255,255,0.4)";
    bCtx.lineWidth = 1.5;
    for (let x = cx - 150; x <= cx + 150; x += 15) {
      bCtx.beginPath();
      bCtx.moveTo(x, ceilY);
      bCtx.lineTo(x + 10, ceilY - 12);
      bCtx.stroke();
    }

    // Anchor hook on ceiling (Left Fixed Strand Support)
    const anchorX = cx - 70;
    bCtx.strokeStyle = lineCol;
    bCtx.lineWidth = 3;
    bCtx.beginPath();
    bCtx.moveTo(anchorX, ceilY);
    bCtx.lineTo(anchorX, ceilY + 25);
    bCtx.stroke();

    bCtx.fillStyle = lineCol;
    bCtx.beginPath();
    bCtx.arc(anchorX, ceilY + 28, 4, 0, Math.PI * 2);
    bCtx.fill();

    // Movable Pulley Wheel
    const pulleyX = cx;
    const pulleyY = cy + 10;
    const pulleyR = 45;
    const guideX = cx + 70;

    // Continuous Rope Loop
    bCtx.strokeStyle = accentCol;
    bCtx.lineWidth = 3;
    bCtx.beginPath();
    bCtx.moveTo(anchorX, ceilY + 28);
    bCtx.lineTo(pulleyX - pulleyR, pulleyY);
    bCtx.arc(pulleyX, pulleyY, pulleyR, Math.PI, 0, true);
    bCtx.lineTo(guideX, ceilY + 40);
    bCtx.stroke();

    // Upward Effort Vector Arrow
    bCtx.strokeStyle = pinkCol;
    bCtx.fillStyle = pinkCol;
    bCtx.lineWidth = 3.5;
    bCtx.beginPath();
    bCtx.moveTo(guideX, ceilY + 120);
    bCtx.lineTo(guideX, ceilY + 40);
    bCtx.stroke();
    bCtx.beginPath();
    bCtx.moveTo(guideX, ceilY + 40);
    bCtx.lineTo(guideX - 7, ceilY + 54);
    bCtx.lineTo(guideX + 7, ceilY + 54);
    bCtx.closePath();
    bCtx.fill();

    bCtx.fillStyle = pinkCol;
    bCtx.font = "bold 15px 'Inter', sans-serif";
    bCtx.fillText("Effort E = 100 N", guideX + 15, ceilY + 80);
    bCtx.font = "bold 12px 'JetBrains Mono', monospace";
    bCtx.fillStyle = isLight ? "#64748b" : "#94a3b8";
    bCtx.fillText("Distance dₑ = d", guideX + 15, ceilY + 100);

    // Movable Pulley Body
    bCtx.fillStyle = isLight ? "#e2e8f0" : "#143a35";
    bCtx.strokeStyle = strokeCol;
    bCtx.lineWidth = 3;
    bCtx.beginPath();
    bCtx.arc(pulleyX, pulleyY, pulleyR, 0, Math.PI * 2);
    bCtx.fill();
    bCtx.stroke();

    // Center axle pin
    bCtx.fillStyle = lineCol;
    bCtx.beginPath();
    bCtx.arc(pulleyX, pulleyY, 6, 0, Math.PI * 2);
    bCtx.fill();

    // Tension vectors T
    bCtx.strokeStyle = cyanCol;
    bCtx.fillStyle = cyanCol;
    bCtx.lineWidth = 2.5;

    // Left strand tension UP
    bCtx.beginPath();
    bCtx.moveTo(pulleyX - pulleyR, pulleyY - 10);
    bCtx.lineTo(pulleyX - pulleyR, pulleyY - 45);
    bCtx.stroke();
    bCtx.beginPath();
    bCtx.moveTo(pulleyX - pulleyR, pulleyY - 45);
    bCtx.lineTo(pulleyX - pulleyR - 5, pulleyY - 35);
    bCtx.lineTo(pulleyX - pulleyR + 5, pulleyY - 35);
    bCtx.closePath();
    bCtx.fill();

    // Right strand tension UP
    bCtx.beginPath();
    bCtx.moveTo(pulleyX + pulleyR, pulleyY - 10);
    bCtx.lineTo(pulleyX + pulleyR, pulleyY - 45);
    bCtx.stroke();
    bCtx.beginPath();
    bCtx.moveTo(pulleyX + pulleyR, pulleyY - 45);
    bCtx.lineTo(pulleyX + pulleyR - 5, pulleyY - 35);
    bCtx.lineTo(pulleyX + pulleyR + 5, pulleyY - 35);
    bCtx.closePath();
    bCtx.fill();

    bCtx.font = "bold 13px 'Inter', sans-serif";
    bCtx.fillText("T = E", pulleyX - pulleyR - 45, pulleyY - 25);
    bCtx.fillText("T = E", pulleyX + pulleyR + 10, pulleyY - 25);

    // Axle hook & Hanging Load Box
    const loadW = 110;
    const loadH = 65;
    const loadX = pulleyX - loadW / 2;
    const loadY = pulleyY + pulleyR + 35;

    bCtx.strokeStyle = lineCol;
    bCtx.lineWidth = 3;
    bCtx.beginPath();
    bCtx.moveTo(pulleyX, pulleyY + 6);
    bCtx.lineTo(pulleyX, loadY);
    bCtx.stroke();

    // Load Box
    bCtx.fillStyle = isLight ? "#fef3c7" : "rgba(234, 179, 8, 0.15)";
    bCtx.strokeStyle = accentCol;
    bCtx.lineWidth = 2.5;
    bCtx.fillRect(loadX, loadY, loadW, loadH);
    bCtx.strokeRect(loadX, loadY, loadW, loadH);

    bCtx.fillStyle = isLight ? "#78350f" : "#fde047";
    bCtx.font = "bold 15px 'Space Grotesk', sans-serif";
    bCtx.textAlign = "center";
    bCtx.fillText("LOAD L", pulleyX, loadY + 28);
    bCtx.font = "bold 14px 'JetBrains Mono', monospace";
    bCtx.fillText("200 N", pulleyX, loadY + 48);
    bCtx.textAlign = "left";

    // Downward Weight Vector arrow
    bCtx.strokeStyle = pinkCol;
    bCtx.fillStyle = pinkCol;
    bCtx.lineWidth = 3;
    bCtx.beginPath();
    bCtx.moveTo(pulleyX, loadY + loadH);
    bCtx.lineTo(pulleyX, loadY + loadH + 35);
    bCtx.stroke();
    bCtx.beginPath();
    bCtx.moveTo(pulleyX, loadY + loadH + 35);
    bCtx.lineTo(pulleyX - 6, loadY + loadH + 25);
    bCtx.lineTo(pulleyX + 6, loadY + loadH + 25);
    bCtx.closePath();
    bCtx.fill();

    bCtx.font = "bold 12px 'JetBrains Mono', monospace";
    bCtx.fillText("Distance dₗ = d/2", pulleyX + 15, loadY + loadH + 25);

    // Summary Formula Badge Card
    const cardX = panelX + 25;
    const cardY = panelY + panelH - 80;
    bCtx.fillStyle = cardBg;
    bCtx.strokeStyle = cardBorder;
    bCtx.lineWidth = 1;
    if (typeof bCtx.roundRect === "function") {
      bCtx.roundRect(cardX, cardY, 520, 60, 10);
      bCtx.fill();
      bCtx.stroke();
    } else {
      bCtx.fillRect(cardX, cardY, 520, 60);
      bCtx.strokeRect(cardX, cardY, 520, 60);
    }

    bCtx.fillStyle = strokeCol;
    bCtx.font = "bold 12px 'JetBrains Mono', monospace";
    bCtx.fillText("⚙️ SINGLE MOVABLE PULLEY DYNAMICS", cardX + 16, cardY + 22);
    bCtx.fillStyle = lineCol;
    bCtx.font = "bold 13px 'Inter', sans-serif";
    bCtx.fillText("MA = L / E = 200 / 100 = 2  |  VR = dₑ / dₗ = 2  |  η = MA / VR = 100%", cardX + 16, cardY + 45);
  }
  // 2. CONSERVATION OF ENERGY DIAGRAM
  else if (text.includes("energy") || text.includes("conservation") || text.includes("kinetic") || text.includes("potential")) {
    const scaleX = panelX + 80;
    const topY = panelY + 70;
    const botY = panelY + 380;

    bCtx.strokeStyle = lineCol;
    bCtx.lineWidth = 3;
    bCtx.beginPath();
    bCtx.moveTo(panelX + 30, botY + 20);
    bCtx.lineTo(panelX + 270, botY + 20);
    bCtx.stroke();

    bCtx.strokeStyle = cyanCol;
    bCtx.lineWidth = 2;
    bCtx.setLineDash([5, 5]);
    bCtx.beginPath();
    bCtx.moveTo(scaleX, topY);
    bCtx.lineTo(scaleX, botY + 20);
    bCtx.stroke();
    bCtx.setLineDash([]);

    bCtx.fillStyle = cyanCol;
    bCtx.font = "bold 13px 'JetBrains Mono', monospace";
    bCtx.fillText("Height h", scaleX - 60, (topY + botY) / 2);

    const positions = [
      { y: topY, label: "Position A (Top)", pe: "PE = mgh (Max)", ke: "KE = 0", color: pinkCol },
      { y: (topY + botY) / 2, label: "Position B (Mid)", pe: "PE = ½ mgh", ke: "KE = ½ mv²", color: accentCol },
      { y: botY, label: "Position C (Bottom)", pe: "PE = 0", ke: "KE = ½ mv² (Max)", color: strokeCol },
    ];

    positions.forEach((pos) => {
      bCtx.fillStyle = pos.color;
      bCtx.beginPath();
      bCtx.arc(scaleX, pos.y, 14, 0, Math.PI * 2);
      bCtx.fill();
      bCtx.strokeStyle = lineCol;
      bCtx.lineWidth = 2;
      bCtx.stroke();

      bCtx.fillStyle = lineCol;
      bCtx.font = "bold 13px 'Inter', sans-serif";
      bCtx.fillText(pos.label, scaleX + 25, pos.y - 5);
      bCtx.font = "12px 'JetBrains Mono', monospace";
      bCtx.fillStyle = strokeCol;
      bCtx.fillText(`${pos.pe}  |  ${pos.ke}`, scaleX + 25, pos.y + 12);
    });

    // Bar Chart
    const barX = panelX + 340;
    const barW = 40;
    const barH = 260;
    const barY = topY;

    bCtx.strokeStyle = lineCol;
    bCtx.lineWidth = 2;
    bCtx.strokeRect(barX, barY, barW, barH);
    bCtx.strokeRect(barX + 80, barY, barW, barH);

    bCtx.fillStyle = pinkCol;
    bCtx.fillRect(barX, barY, barW, barH);

    bCtx.fillStyle = pinkCol;
    bCtx.fillRect(barX + 80, barY + barH / 2, barW, barH / 2);
    bCtx.fillStyle = strokeCol;
    bCtx.fillRect(barX + 80, barY, barW, barH / 2);

    bCtx.fillStyle = lineCol;
    bCtx.font = "bold 12px 'Inter', sans-serif";
    bCtx.fillText("Top", barX + 5, barY + barH + 20);
    bCtx.fillText("Mid", barX + 85, barY + barH + 20);

    bCtx.fillStyle = pinkCol;
    bCtx.fillRect(panelX + 340, botY + 60, 12, 12);
    bCtx.fillStyle = lineCol;
    bCtx.font = "bold 12px 'Inter', sans-serif";
    bCtx.fillText("Potential Energy (PE)", panelX + 360, botY + 70);

    bCtx.fillStyle = strokeCol;
    bCtx.fillRect(panelX + 340, botY + 80, 12, 12);
    bCtx.fillStyle = lineCol;
    bCtx.fillText("Kinetic Energy (KE)", panelX + 360, botY + 90);

    const cardX = panelX + 25;
    const cardY = panelY + panelH - 75;
    bCtx.fillStyle = cardBg;
    bCtx.strokeStyle = cardBorder;
    bCtx.lineWidth = 1;
    if (typeof bCtx.roundRect === "function") {
      bCtx.roundRect(cardX, cardY, 520, 55, 10);
      bCtx.fill();
      bCtx.stroke();
    } else {
      bCtx.fillRect(cardX, cardY, 520, 55);
      bCtx.strokeRect(cardX, cardY, 520, 55);
    }

    bCtx.fillStyle = accentCol;
    bCtx.font = "bold 14px 'Space Grotesk', sans-serif";
    bCtx.textAlign = "center";
    bCtx.fillText("⚡ LAW OF CONSERVATION OF ENERGY: E Total = KE + PE = Constant", panelX + panelW / 2, cardY + 33);
    bCtx.textAlign = "left";
  }
  // 3. MATHEMATICS / GEOMETRY / CALCULUS DIAGRAM
  else if (
    text.includes("math") || text.includes("geometry") || text.includes("trigonometry") || 
    text.includes("calculus") || text.includes("sine") || text.includes("triangle") || 
    text.includes("graph") || text.includes("equation") || text.includes("vector") || text.includes("angle")
  ) {
    const originX = panelX + 70;
    const originY = panelY + 280;

    // X and Y Coordinate Axes
    bCtx.strokeStyle = lineCol;
    bCtx.lineWidth = 2.5;
    bCtx.beginPath();
    bCtx.moveTo(originX - 20, originY);
    bCtx.lineTo(originX + 440, originY); // X Axis
    bCtx.moveTo(originX, originY + 120);
    bCtx.lineTo(originX, originY - 200); // Y Axis
    bCtx.stroke();

    // Axis Arrows & Labels
    bCtx.fillStyle = lineCol;
    bCtx.font = "bold 13px 'JetBrains Mono', monospace";
    bCtx.fillText("X", originX + 450, originY + 5);
    bCtx.fillText("Y", originX - 5, originY - 210);
    bCtx.fillText("O(0,0)", originX - 35, originY + 20);

    // Sine Wave Curve
    bCtx.strokeStyle = cyanCol;
    bCtx.lineWidth = 3;
    bCtx.beginPath();
    for (let x = 0; x <= 400; x += 5) {
      const y = Math.sin(x * 0.025) * 120;
      if (x === 0) bCtx.moveTo(originX + x, originY - y);
      else bCtx.lineTo(originX + x, originY - y);
    }
    bCtx.stroke();

    // Right Triangle Overlay
    const triX = originX + 120;
    const triY = originY - Math.sin(120 * 0.025) * 120;
    bCtx.strokeStyle = accentCol;
    bCtx.lineWidth = 2.5;
    bCtx.setLineDash([4, 4]);
    bCtx.beginPath();
    bCtx.moveTo(triX, originY);
    bCtx.lineTo(triX, triY);
    bCtx.lineTo(originX, originY);
    bCtx.stroke();
    bCtx.setLineDash([]);

    // Hypotenuse
    bCtx.strokeStyle = pinkCol;
    bCtx.lineWidth = 3;
    bCtx.beginPath();
    bCtx.moveTo(originX, originY);
    bCtx.lineTo(triX, triY);
    bCtx.stroke();

    bCtx.fillStyle = pinkCol;
    bCtx.font = "bold 13px 'Inter', sans-serif";
    bCtx.fillText("r (Vector)", originX + 40, triY + 55);

    bCtx.fillStyle = accentCol;
    bCtx.fillText("y = r sin(θ)", triX + 10, triY + 30);

    // Mathematical Formula Card
    const cardX = panelX + 25;
    const cardY = panelY + panelH - 80;
    bCtx.fillStyle = cardBg;
    bCtx.strokeStyle = cardBorder;
    bCtx.lineWidth = 1;
    if (typeof bCtx.roundRect === "function") {
      bCtx.roundRect(cardX, cardY, 520, 60, 10);
      bCtx.fill();
      bCtx.stroke();
    } else {
      bCtx.fillRect(cardX, cardY, 520, 60);
      bCtx.strokeRect(cardX, cardY, 520, 60);
    }

    bCtx.fillStyle = strokeCol;
    bCtx.font = "bold 12px 'JetBrains Mono', monospace";
    bCtx.fillText("📐 TRIGONOMETRIC FUNCTION & WAVE FORMULA", cardX + 16, cardY + 22);
    bCtx.fillStyle = lineCol;
    bCtx.font = "bold 14px 'Cambria Math', serif";
    bCtx.fillText("y(t) = A sin(ωt + φ)  |  sin²(θ) + cos²(θ) = 1  |  tan(θ) = y / x", cardX + 16, cardY + 45);
  }
  // 4. ACIDS, BASES, NEUTRALIZATION & HYDROXIDE DIAGRAM
  else if (
    text.includes("base") || text.includes("acid") || text.includes("neutraliz") || 
    text.includes("ph") || text.includes("hydroxide") || text.includes("alkali") || text.includes("oh-")
  ) {
    const flaskX = cx - 110;
    const flaskY = cy - 40;

    // Erlenmeyer Flask Body
    bCtx.strokeStyle = strokeCol;
    bCtx.lineWidth = 3;
    bCtx.beginPath();
    bCtx.moveTo(flaskX - 20, flaskY - 90); // Neck top left
    bCtx.lineTo(flaskX + 20, flaskY - 90); // Neck top right
    bCtx.lineTo(flaskX + 20, flaskY - 40); // Neck base right
    bCtx.lineTo(flaskX + 90, flaskY + 80); // Body bottom right
    bCtx.lineTo(flaskX - 90, flaskY + 80); // Body bottom left
    bCtx.lineTo(flaskX - 20, flaskY - 40); // Neck base left
    bCtx.closePath();
    bCtx.stroke();

    // Solution Liquid in Flask
    bCtx.fillStyle = isLight ? "rgba(13, 148, 136, 0.25)" : "rgba(45, 212, 191, 0.2)";
    bCtx.beginPath();
    bCtx.moveTo(flaskX - 45, flaskY + 10);
    bCtx.lineTo(flaskX + 45, flaskY + 10);
    bCtx.lineTo(flaskX + 85, flaskY + 75);
    bCtx.lineTo(flaskX - 85, flaskY + 75);
    bCtx.closePath();
    bCtx.fill();

    // Floating Hydroxide OH- & Metal Na+ Ions
    const ions = [
      { x: flaskX - 30, y: flaskY + 30, label: "OH⁻", col: accentCol },
      { x: flaskX + 25, y: flaskY + 45, label: "OH⁻", col: accentCol },
      { x: flaskX - 10, y: flaskY + 60, label: "Na⁺", col: cyanCol },
      { x: flaskX + 35, y: flaskY + 20, label: "Na⁺", col: cyanCol },
    ];
    ions.forEach((ion) => {
      bCtx.fillStyle = ion.col;
      bCtx.beginPath();
      bCtx.arc(ion.x, ion.y, 14, 0, Math.PI * 2);
      bCtx.fill();
      bCtx.fillStyle = "#000000";
      bCtx.font = "bold 11px sans-serif";
      bCtx.textAlign = "center";
      bCtx.fillText(ion.label, ion.x, ion.y + 4);
    });
    bCtx.textAlign = "left";

    // Neutralization Reaction Arrow to Water Formation
    const arrowX = cx + 20;
    const arrowY = cy - 40;
    bCtx.strokeStyle = pinkCol;
    bCtx.lineWidth = 3;
    bCtx.beginPath();
    bCtx.moveTo(arrowX, arrowY);
    bCtx.lineTo(arrowX + 70, arrowY);
    bCtx.stroke();
    bCtx.beginPath();
    bCtx.moveTo(arrowX + 70, arrowY);
    bCtx.lineTo(arrowX + 58, arrowY - 7);
    bCtx.lineTo(arrowX + 58, arrowY + 7);
    bCtx.closePath();
    bCtx.fillStyle = pinkCol;
    bCtx.fill();

    bCtx.fillStyle = pinkCol;
    bCtx.font = "bold 12px 'JetBrains Mono', monospace";
    bCtx.fillText("+ H⁺ (Acid)", arrowX + 5, arrowY - 12);

    // Water H2O Product Molecule
    const h2oX = arrowX + 130;
    const h2oY = arrowY;
    bCtx.fillStyle = cyanCol;
    bCtx.beginPath();
    bCtx.arc(h2oX, h2oY, 22, 0, Math.PI * 2); // Oxygen
    bCtx.fill();
    bCtx.fillStyle = lineCol;
    bCtx.font = "bold 12px sans-serif";
    bCtx.textAlign = "center";
    bCtx.fillText("O", h2oX, h2oY + 4);

    bCtx.fillStyle = accentCol;
    bCtx.beginPath();
    bCtx.arc(h2oX - 20, h2oY - 18, 12, 0, Math.PI * 2); // H1
    bCtx.arc(h2oX + 20, h2oY - 18, 12, 0, Math.PI * 2); // H2
    bCtx.fill();
    bCtx.fillStyle = "#000000";
    bCtx.font = "bold 10px sans-serif";
    bCtx.fillText("H", h2oX - 20, h2oY - 14);
    bCtx.fillText("H", h2oX + 20, h2oY - 14);
    bCtx.textAlign = "left";

    // Acidity Classification Vials Card
    const cardX = panelX + 25;
    const cardY = panelY + panelH - 85;
    bCtx.fillStyle = cardBg;
    bCtx.strokeStyle = cardBorder;
    bCtx.lineWidth = 1;
    if (typeof bCtx.roundRect === "function") {
      bCtx.roundRect(cardX, cardY, 520, 65, 10);
      bCtx.fill();
      bCtx.stroke();
    } else {
      bCtx.fillRect(cardX, cardY, 520, 65);
      bCtx.strokeRect(cardX, cardY, 520, 65);
    }

    bCtx.fillStyle = accentCol;
    bCtx.font = "bold 12px 'JetBrains Mono', monospace";
    bCtx.fillText("🧪 BASE NEUTRALIZATION & HYDROXILATION MECHANISM", cardX + 16, cardY + 22);
    bCtx.fillStyle = lineCol;
    bCtx.font = "bold 14px 'Cambria Math', serif";
    bCtx.fillText("Base → M⁺ + OH⁻  |  H⁺ + OH⁻ → H₂O (Neutralization)", cardX + 16, cardY + 45);
  }
  // 5. FORMATION OF IONS / OCTET RULE DIAGRAM
  else if (
    text.includes("ion") || text.includes("cation") || text.includes("anion") || 
    text.includes("octet") || text.includes("valence")
  ) {
    const nucX = cx;
    const nucY = cy - 30;

    bCtx.strokeStyle = strokeCol;
    bCtx.lineWidth = 2;
    bCtx.beginPath();
    bCtx.arc(nucX, nucY, 70, 0, Math.PI * 2);
    bCtx.arc(nucX, nucY, 120, 0, Math.PI * 2);
    bCtx.stroke();

    bCtx.fillStyle = pinkCol;
    bCtx.beginPath();
    bCtx.arc(nucX, nucY, 28, 0, Math.PI * 2);
    bCtx.fill();

    bCtx.fillStyle = "#ffffff";
    bCtx.font = "bold 12px 'JetBrains Mono', monospace";
    bCtx.textAlign = "center";
    bCtx.fillText("Na⁺ (11p)", nucX, nucY + 4);
    bCtx.textAlign = "left";

    // Chemical Reaction Box
    const cardX = panelX + 25;
    const cardY = panelY + panelH - 80;
    bCtx.fillStyle = cardBg;
    bCtx.strokeStyle = cardBorder;
    bCtx.lineWidth = 1;
    if (typeof bCtx.roundRect === "function") {
      bCtx.roundRect(cardX, cardY, 520, 60, 10);
      bCtx.fill();
      bCtx.stroke();
    } else {
      bCtx.fillRect(cardX, cardY, 520, 60);
      bCtx.strokeRect(cardX, cardY, 520, 60);
    }

    bCtx.fillStyle = accentCol;
    bCtx.font = "bold 12px 'JetBrains Mono', monospace";
    bCtx.fillText("⚡ FORMATION OF IONS & OCTET STABILITY", cardX + 16, cardY + 22);
    bCtx.fillStyle = lineCol;
    bCtx.font = "bold 15px 'Cambria Math', serif";
    bCtx.fillText("Na (2,8,1)  →  Na⁺ (2,8) + e⁻  (Stable Octet Achieved)", cardX + 16, cardY + 45);
  }
  // 6. GENERAL SCIENCE / ACADEMIC CONCEPT DIAGRAM (Dynamic topic fallback)
  else {
    const bentoX = panelX + 30;
    const bentoY = panelY + 40;
    const bentoW = panelW - 60;

    bCtx.fillStyle = cardBg;
    bCtx.strokeStyle = cardBorder;
    bCtx.lineWidth = 1.5;
    bCtx.fillRect(bentoX, bentoY, bentoW, 110);
    bCtx.strokeRect(bentoX, bentoY, bentoW, 110);

    bCtx.fillStyle = accentCol;
    bCtx.font = "bold 15px 'Space Grotesk', sans-serif";
    bCtx.fillText("🧠 KEY CONCEPTUAL ROADMAP", bentoX + 20, bentoY + 30);

    bCtx.fillStyle = lineCol;
    bCtx.font = "14px 'Inter', sans-serif";
    const titleText = formatLatexToReadable(topicText || "Interactive Lecture Notes").replace(/^[#\*\_\s\d\.\:]+/, "");
    bCtx.fillText(`• Topic: ${titleText}`, bentoX + 20, bentoY + 60);
    bCtx.fillText(`• Focus: Key Concepts & Analytical Calculations`, bentoX + 20, bentoY + 85);

    const card2Y = bentoY + 130;
    bCtx.fillStyle = cardBg;
    bCtx.strokeStyle = strokeCol;
    bCtx.lineWidth = 1.5;
    bCtx.fillRect(bentoX, card2Y, bentoW, 140);
    bCtx.strokeRect(bentoX, card2Y, bentoW, 140);

    bCtx.fillStyle = strokeCol;
    bCtx.font = "bold 15px 'Space Grotesk', sans-serif";
    bCtx.fillText("📐 CORE PRINCIPLES & EQUATIONS", bentoX + 20, card2Y + 32);

    bCtx.fillStyle = lineCol;
    bCtx.font = "bold 16px 'Cambria Math', serif";
    bCtx.fillText(titleText ? `Study of ${titleText}` : "Core Scientific Methodology", bentoX + 30, card2Y + 70);
    bCtx.font = "italic 15px 'Cambria Math', serif";
    bCtx.fillStyle = cyanCol;
    bCtx.fillText("Step-by-step conceptual & mathematical analysis", bentoX + 30, card2Y + 105);

    const card3Y = card2Y + 160;
    bCtx.fillStyle = cardBg;
    bCtx.strokeStyle = cardBorder;
    bCtx.lineWidth = 1.5;
    bCtx.fillRect(bentoX, card3Y, bentoW, 140);
    bCtx.strokeRect(bentoX, card3Y, bentoW, 140);

    bCtx.fillStyle = pinkCol;
    bCtx.font = "bold 15px 'Space Grotesk', sans-serif";
    bCtx.fillText("🎯 STEP-BY-STEP LEARNING METHODOLOGY", bentoX + 20, card3Y + 32);

    bCtx.fillStyle = lineCol;
    bCtx.font = "14px 'Inter', sans-serif";
    bCtx.fillText("1. Define Fundamental Definitions & Given Parameters", bentoX + 20, card3Y + 65);
    bCtx.fillText("2. Examine Structural / Physical Conservation Laws", bentoX + 20, card3Y + 90);
    bCtx.fillText("3. Apply Formulas & Solve Example Problems Step-by-Step", bentoX + 20, card3Y + 115);
  }

  bCtx.restore();
}

function extractSvgsAndCleanText(text: string): { cleanText: string; svgs: string[] } {
  if (!text) return { cleanText: "", svgs: [] };

  const svgs: string[] = [];
  
  // Extract all <svg ...> ... </svg> blocks
  const svgRegex = /<svg[\s\S]*?<\/svg>/gi;
  let match;
  while ((match = svgRegex.exec(text)) !== null) {
    svgs.push(match[0]);
  }

  // Strip <svg> blocks
  let cleanText = text.replace(svgRegex, "");

  // Convert LaTeX formulas to readable unicode math text
  cleanText = formatLatexToReadable(cleanText);

  // Also strip unclosed <svg and standard markdown fences / board tags
  cleanText = cleanText
    .replace(/<svg[\s\S]*$/gi, "") // remove trailing incomplete svg tags
    .replace(/<\/?board>/gi, "")
    .replace(/```(markdown|text|latex|html|xml|svg|math)?/gi, "")
    .replace(/```/g, "")
    // Clean LaTeX shapes to simple unicode characters
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
    .replace(/\\{1,4}rhombus\b/g, "◊")
    // Clean bold markdown markers
    .replace(/\*\*/g, "")
    // Clean inline/block math boundaries
    .replace(/\$\$/g, "")
    .replace(/\$/g, "")
    .trim();

  return { cleanText, svgs };
}

export function useBlackboardRecorder({
  mainCanvas,
  micStream,
  playbackStream,
  isClassRunning,
  theme,
  themeConfig,
  studentName,
  subject,
  lessonTitle,
  boardText,
  cherrySpeechText,
  cherryIsSpeaking,
  teachingPhase,
  sessionId,
  onToast,
  onRecordingSaved,
}: UseBlackboardRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [pendingRecording, setPendingRecording] = useState<SavedRecording | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const intervalRef = useRef<any>(null);
  const domCaptureIntervalRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);
  const secondsRef = useRef<number>(0);

  const lastSvgRef = useRef<string>("");
  const svgImageRef = useRef<HTMLImageElement | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);

  // Camera Focus and Panning Tracking State (Smart Panning)
  const lastStudentDrawingTimeRef = useRef<number>(0);
  const prevBoardTextRef = useRef<string>(boardText || "");
  const lastProcessedSpeechRef = useRef<string>((cherrySpeechText || "").toLowerCase());
  
  const lastBoardTextChangeTimeRef = useRef<number>(0);
  const lastBoardTextChangeTypeRef = useRef<'notes' | 'diagram' | null>(null);

  const currentViewportRef = useRef({ x: 0, y: 0, w: 1280, h: 720 });
  const targetViewportRef = useRef({ x: 0, y: 0, w: 1280, h: 720 });
  const activeFocusRef = useRef<'left' | 'right_top' | 'right_bottom'>('left');

  // Watch for drawing interactions on the student canvas to trigger camera panning
  useEffect(() => {
    if (!mainCanvas) return;

    const handleActivity = () => {
      lastStudentDrawingTimeRef.current = Date.now();
      activeFocusRef.current = 'right_bottom';
    };

    mainCanvas.addEventListener("mousedown", handleActivity);
    mainCanvas.addEventListener("touchstart", handleActivity, { passive: true });
    
    const handleMove = (e: MouseEvent) => {
      if (e.buttons > 0) {
        handleActivity();
      }
    };
    mainCanvas.addEventListener("mousemove", handleMove);

    return () => {
      mainCanvas.removeEventListener("mousedown", handleActivity);
      mainCanvas.removeEventListener("touchstart", handleActivity);
      mainCanvas.removeEventListener("mousemove", handleMove);
    };
  }, [mainCanvas]);

  // Keep latest variables in refs to avoid restarting the drawing loop
  const stateRef = useRef({
    theme,
    themeConfig,
    studentName,
    subject,
    lessonTitle,
    boardText,
    cherrySpeechText: cherrySpeechText || "",
    cherryIsSpeaking: !!cherryIsSpeaking,
    teachingPhase: teachingPhase || "intro",
    sessionId,
  });

  useEffect(() => {
    // Detect boardText additions to trigger smart panned camera
    if (boardText && boardText !== prevBoardTextRef.current) {
      const prevLen = prevBoardTextRef.current.length;
      const currentLen = boardText.length;
      if (currentLen > prevLen) {
        const added = boardText.substring(prevLen).toLowerCase();

        const diagramKeywords = [
          "diagram", "canvas", "sketch", "figure", "look at", "see the", "draw", "drawing", "graph", "plot", 
          "illustration", "circle", "triangle", "square", "rectangle", "angle", "axis", "curve", "chart", 
          "image", "visual", "right column", "right panel", "right side", "look on", "screen", "compass",
          "diagram ko", "canvas ko", "sketch ko", "figure ko", "diagram par", "canvas par", "draw karte",
          "चित्र", "रेखा", "कोण", "ग्राफ", "दाएँ", "दाया", "दायाँ", "दाएँ तरफ़", "दाहिने", "बनाया", "ड्रॉ", 
          "फिगर", "स्केच", "सर्कल", "ट्रायंगल", "एक्सिस", "चित्र में", "इमेज", "विजुअल", "दाएं", "देखो"
        ];

        const notesKeywords = [
          "formula", "equation", "notes", "text", "write", "written", "handout", "definition", "theory", 
          "step-by-step", "left column", "left panel", "left side", "read", "board", "welcome", "topics",
          "formule", "equation ko", "notes ko", "write karte",
          "फॉर्मूला", "सूत्र", "नोट्स", "लिखा", "लिखिए", "बाएँ", "बाया", "बायाँ", "बाएँ तरफ़", "बाएं", 
          "थ्योरी", "परिभाषा", "लेफ्ट", "पढ़ो"
        ];

        const hasDiagramKw = diagramKeywords.some(kw => added.includes(kw)) || added.includes("<svg");
        const hasNotesKw = notesKeywords.some(kw => added.includes(kw));

        lastBoardTextChangeTimeRef.current = Date.now();
        if (hasDiagramKw && !hasNotesKw) {
          lastBoardTextChangeTypeRef.current = 'diagram';
        } else if (hasNotesKw && !hasDiagramKw) {
          lastBoardTextChangeTypeRef.current = 'notes';
        } else if (added.includes("<svg")) {
          lastBoardTextChangeTypeRef.current = 'diagram';
        } else {
          lastBoardTextChangeTypeRef.current = 'notes';
        }
      }
      prevBoardTextRef.current = boardText;
    }

    stateRef.current = {
      theme,
      themeConfig,
      studentName,
      subject,
      lessonTitle,
      boardText,
      cherrySpeechText: cherrySpeechText || "",
      cherryIsSpeaking: !!cherryIsSpeaking,
      teachingPhase: teachingPhase || "intro",
      sessionId,
    };

    // Extract SVG from boardText if present and cache it as an image
    if (boardText) {
      const svgRegex = /<svg[\s\S]*?<\/svg>/gi;
      const matches = boardText.match(svgRegex);
      if (matches && matches.length > 0) {
        const latestSvg = matches[matches.length - 1]; // get the last/most recent SVG
        if (latestSvg !== lastSvgRef.current) {
          lastSvgRef.current = latestSvg;
          
          const img = new Image();
          const svgBlob = new Blob([latestSvg], { type: "image/svg+xml;charset=utf-8" });
          const blobUrl = URL.createObjectURL(svgBlob);
          img.onload = () => {
            svgImageRef.current = img;
            // High confidence trigger: a new diagram is generated/loaded! Shift focus to diagram!
            activeFocusRef.current = 'right_top';
          };
          img.onerror = () => {
            URL.revokeObjectURL(blobUrl);
          };
          img.src = blobUrl;
        }
      } else {
        lastSvgRef.current = "";
        svgImageRef.current = null;
      }
    } else {
      lastSvgRef.current = "";
      svgImageRef.current = null;
    }
  }, [theme, themeConfig, studentName, subject, lessonTitle, boardText, cherrySpeechText, cherryIsSpeaking, teachingPhase, sessionId]);

  // Utility to format elapsed time (e.g., 05:24)
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const startRecording = async () => {
    // Capture state properties locally to prevent any asynchronous race conditions or nullified references on unmount/archive
    const activeSessionId = sessionId || "session_auto_" + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    const activeLessonTitle = lessonTitle || "Chalk Blackboard Lesson";
    const activeSubject = subject || "Academic Study";
    const activeTheme = theme;

    chunksRef.current = [];
    secondsRef.current = 0;
    setRecordingSeconds(0);

    try {
      // Audio track setup - retrieve the pre-mixed audio track containing both voices
      let audioTrack: MediaStreamTrack | null = null;
      if (playbackStream && playbackStream.getAudioTracks().length > 0) {
        audioTrack = playbackStream.getAudioTracks()[0];
        console.log("[useBlackboardRecorder] Grabbed pre-mixed audio track containing both student and Cherry Ma'am's voices:", audioTrack);
      } else {
        console.log("[useBlackboardRecorder] No playback stream audio track available. Recording in video-only mode.");
      }

      let displayStream: MediaStream | null = null;
      let usingScreenCapture = false;

      // Try Screen Capture API (Primary - records same-to-same with high fidelity, KaTeX, bento layout, interactive diagrams!)
      if (typeof navigator !== "undefined" && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        try {
          console.log("[useBlackboardRecorder] Attempting native getDisplayMedia for same-to-same screen recording...");
          onToast("🖥️ Please select 'This Tab' or 'This Window' for perfect high-fidelity Blackboard recording!", "info");
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              displaySurface: "browser",
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 }
            },
            audio: false // We already mix voices inside useLiveSession (playbackStream)
          });
          displayStreamRef.current = displayStream;
          usingScreenCapture = true;
          onToast("🖥️ Screen capture established! Recording live blackboard in high resolution.", "success");
        } catch (captureErr) {
          console.warn("[useBlackboardRecorder] Screen capture declined or failed, falling back to virtual drawing:", captureErr);
          onToast("⚠️ For 100% exact screen recording, open the app in a new tab and allow tab share.", "info");
        }
      }

      const mixedStream = new MediaStream();

      if (usingScreenCapture && displayStream) {
        // Native high-fidelity tab/screen video track
        mixedStream.addTrack(displayStream.getVideoTracks()[0]);
      } else {
        // Offscreen virtual canvas drawing loop with high-fidelity live DOM snapshotting in 9:16 Vertical Reel Format
        const backCanvas = document.createElement("canvas");
        backCanvas.width = 720;
        backCanvas.height = 1280;
        const bCtx = backCanvas.getContext("2d");
        if (!bCtx) throw new Error("Could not get backbuffer canvas context");

        const virtualCanvas = document.createElement("canvas");
        virtualCanvas.width = 720;
        virtualCanvas.height = 1280;
        const ctx = virtualCanvas.getContext("2d");
        if (!ctx) throw new Error("Could not get virtual canvas context");

        let flashState = true;
        let frameCount = 0;

        let isCapturingDom = false;
        let lastDomCanvas: HTMLCanvasElement | null = null;

        const captureDomBoard = async () => {
          if (isCapturingDom) return;
          const boardEl = document.getElementById("live-classroom-container") || document.getElementById("chalkboard-main-slate") || document.getElementById("classroom-whiteboard-main");
          if (!boardEl) return;

          isCapturingDom = true;
          try {
            const captured = await html2canvas(boardEl, {
              scale: 1.25,
              useCORS: true,
              allowTaint: true,
              backgroundColor: stateRef.current.themeConfig.primary || "#0c201a",
              logging: false,
            });
            if (captured && captured.width > 0 && captured.height > 0) {
              lastDomCanvas = captured;
            }
          } catch (e) {
            // fallback
          } finally {
            isCapturingDom = false;
          }
        };

        const drawFrame = () => {
          const state = {
            theme: stateRef.current.theme || activeTheme,
            themeConfig: stateRef.current.themeConfig,
            studentName: stateRef.current.studentName || studentName,
            subject: stateRef.current.subject || activeSubject,
            lessonTitle: stateRef.current.lessonTitle || activeLessonTitle,
            boardText: stateRef.current.boardText,
            sessionId: stateRef.current.sessionId || activeSessionId,
          };
          const isLight = state.theme === "ivory";
          const bgFill = isLight ? "#fbfbf9" : "#071916";

          // If live DOM snapshot of blackboard is captured, paint it directly in 9:16 Vertical Reel format!
          if (lastDomCanvas) {
            bCtx.clearRect(0, 0, 720, 1280);
            
            // Check if captured DOM is vertical mobile format (aspect ratio < 0.85)
            const domRatio = lastDomCanvas.width / lastDomCanvas.height;
            if (domRatio < 0.85) {
              bCtx.fillStyle = bgFill;
              bCtx.fillRect(0, 0, 720, 1280);
              const drawH = 1280;
              const drawW = Math.min(720, drawH * domRatio);
              const drawX = (720 - drawW) / 2;
              bCtx.drawImage(lastDomCanvas, drawX, 0, drawW, drawH);
            } else {
              // Widescreen captured DOM - scale & center vertically inside 720x1280 9:16 Reel frame
              bCtx.fillStyle = bgFill;
              bCtx.fillRect(0, 0, 720, 1280);
              const drawW = 720;
              const drawH = drawW / domRatio;
              const drawY = (1280 - drawH) / 2;
              bCtx.drawImage(lastDomCanvas, 0, drawY, drawW, drawH);
            }

            // Overlay live recording badge indicator
            frameCount++;
            if (frameCount % 6 === 0) {
              flashState = !flashState;
            }
            bCtx.save();
            bCtx.fillStyle = "rgba(0, 0, 0, 0.75)";
            bCtx.fillRect(550, 12, 158, 28);
            bCtx.strokeStyle = "rgba(45, 212, 191, 0.4)";
            bCtx.lineWidth = 1;
            bCtx.strokeRect(550, 12, 158, 28);

            if (flashState) {
              bCtx.fillStyle = "#ef4444";
              bCtx.beginPath();
              bCtx.arc(566, 26, 5, 0, 2 * Math.PI);
              bCtx.fill();

              bCtx.fillStyle = "#ef4444";
              bCtx.font = "bold 11px 'JetBrains Mono', monospace";
              bCtx.fillText("LIVE 9:16 REC", 578, 30);
            } else {
              bCtx.fillStyle = "#8ab2bc";
              bCtx.font = "bold 11px 'JetBrains Mono', monospace";
              bCtx.fillText("9:16 REEL REC", 578, 30);
            }
            bCtx.restore();

            // Copy backCanvas onto virtualCanvas so captureStream receives the 9:16 vertical reel frame!
            ctx.fillStyle = bgFill;
            ctx.fillRect(0, 0, 720, 1280);
            ctx.drawImage(backCanvas, 0, 0, 720, 1280);
            return;
          }
          const gridColor = isLight ? "rgba(0,0,0,0.03)" : "rgba(45,212,191,0.07)";
          const borderCol = isLight ? "#dae1dd" : "#143a35";
          const textPrimary = isLight ? "#0a3641" : "rgba(255, 255, 255, 0.95)";
          const textMuted = isLight ? "#486a73" : "#8ab2bc";
          const accentCol = isLight ? "#0d9488" : "#fde047";

          // Clear backbuffer (Dark Slate Background #071916)
          bCtx.fillStyle = bgFill;
          bCtx.fillRect(0, 0, 720, 1280);

          // Wooden Frame Accent (#2a1810 / #1e110b) & Corner Brackets
          bCtx.strokeStyle = "#2a1810";
          bCtx.lineWidth = 10;
          bCtx.strokeRect(5, 5, 710, 1270);
          bCtx.strokeStyle = "#1e110b";
          bCtx.lineWidth = 3;
          bCtx.strokeRect(1, 1, 718, 1278);

          // Metallic corner brackets
          bCtx.fillStyle = "#64748b";
          bCtx.fillRect(2, 2, 22, 6);
          bCtx.fillRect(2, 2, 6, 22);
          bCtx.fillRect(696, 2, 22, 6);
          bCtx.fillRect(712, 2, 6, 22);
          bCtx.fillRect(2, 1272, 22, 6);
          bCtx.fillRect(2, 1256, 6, 22);
          bCtx.fillRect(696, 1272, 22, 6);
          bCtx.fillRect(712, 1256, 6, 22);

          // Draw Blackboard Grid Dots / Crosshairs
          bCtx.fillStyle = gridColor;
          const gridSize = 32;
          for (let x = 20; x < 700; x += gridSize) {
            for (let y = 20; y < 1260; y += gridSize) {
              bCtx.fillRect(x, y, 2, 2);
            }
          }

          // Header Background bar
          bCtx.fillStyle = isLight ? "rgba(13,148,136,0.04)" : "rgba(45,212,191,0.06)";
          bCtx.fillRect(15, 12, 690, 54);
          bCtx.strokeStyle = borderCol;
          bCtx.strokeRect(15, 12, 690, 54);

          // Header Metadata
          bCtx.fillStyle = textPrimary;
          bCtx.font = "bold 14px 'Space Grotesk', sans-serif";
          bCtx.textAlign = "left";
          bCtx.fillText(`CHERRY MA'AM'S LECTURE SESSION`, 28, 34);

          bCtx.fillStyle = textMuted;
          bCtx.font = "bold 10px 'JetBrains Mono', monospace";
          let rawTitle = (state.lessonTitle || "CHALKBOARD TUTORIAL")
            .replace(/^[#\*\_\s\d\.\:]+/, "")
            .split("\n")[0]
            .replace(/welcome!.*$/gi, "")
            .trim();
          if (!rawTitle) rawTitle = "CHALKBOARD TUTORIAL";
          let cleanLessonTitle = formatLatexToReadable(rawTitle);
          if (cleanLessonTitle.length > 25) {
            cleanLessonTitle = cleanLessonTitle.substring(0, 22) + "...";
          }
          const subjText = (state.subject || "MATHEMATICS").toUpperCase();
          bCtx.fillText(`${subjText}  •  ${cleanLessonTitle}`, 28, 52);

          // Active Teaching Phase Badge
          const activePhase = (stateRef.current.teachingPhase || "intro").toLowerCase();
          const phaseBadges: Record<string, { label: string; color: string; bg: string }> = {
            intro: { label: "🎒 PHASE 1: INTRO", color: "#fde047", bg: "rgba(234, 179, 8, 0.2)" },
            concept: { label: "🖊️ PHASE 2: CONCEPT", color: "#2dd4bf", bg: "rgba(45, 212, 191, 0.2)" },
            example: { label: "🔍 PHASE 3: DEEP DIVE", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.2)" },
            doubt: { label: "❓ PHASE 4: DOUBTS", color: "#f87171", bg: "rgba(239, 68, 68, 0.2)" },
            transition: { label: "🚀 PHASE 5: TRANSITION", color: "#c084fc", bg: "rgba(192, 132, 252, 0.2)" }
          };
          const badgeObj = phaseBadges[activePhase] || phaseBadges.intro;

          bCtx.save();
          bCtx.fillStyle = badgeObj.bg;
          bCtx.strokeStyle = badgeObj.color;
          bCtx.lineWidth = 1;
          if (typeof bCtx.roundRect === "function") {
            bCtx.roundRect(375, 26, 140, 24, 12);
            bCtx.fill();
            bCtx.stroke();
          } else {
            bCtx.fillRect(375, 26, 140, 24);
            bCtx.strokeRect(375, 26, 140, 24);
          }
          bCtx.fillStyle = badgeObj.color;
          bCtx.font = "bold 9px 'JetBrains Mono', monospace";
          bCtx.textAlign = "center";
          bCtx.fillText(badgeObj.label, 445, 41);
          bCtx.restore();

          // ------------------------------------------------------------------
          // DRAW UPPER SECTION: RECORDED LESSON HANDOUT & STRUCTURED CARDS (9:16 VERTICAL REEL)
          // ------------------------------------------------------------------
          bCtx.textAlign = "left";
          bCtx.fillStyle = textPrimary;
          bCtx.font = "bold 14px 'Space Grotesk', sans-serif";
          bCtx.fillText("📝 RECORDED LESSON HANDOUT", 28, 95);

          // Render Multi-Color Chalk Stick Legend
          bCtx.font = "bold 9px 'JetBrains Mono', monospace";
          bCtx.fillStyle = isLight ? "#334155" : "rgba(255,255,255,0.9)";
          bCtx.fillText("⚪ Text", 260, 95);

          bCtx.fillStyle = isLight ? "#d97706" : "#fde047";
          bCtx.fillText("🟡 Terms", 315, 95);

          bCtx.fillStyle = isLight ? "#0d9488" : "#2dd4bf";
          bCtx.fillText("🟢 Formula", 380, 95);

          bCtx.fillStyle = isLight ? "#e11d48" : "#f87171";
          bCtx.fillText("❓ Polls", 455, 95);

          // Draw simple chalk underline
          bCtx.strokeStyle = accentCol;
          bCtx.lineWidth = 1.5;
          bCtx.beginPath();
          bCtx.moveTo(28, 105);
          bCtx.lineTo(685, 105);
          bCtx.stroke();

          // Framed border around Handout box
          bCtx.strokeStyle = borderCol;
          bCtx.lineWidth = 1;
          bCtx.strokeRect(15, 115, 690, 570);

          // Helper to wrap text into multiple lines given max pixel width
          const wrapTextToLines = (text: string, maxWidth: number, font: string): string[] => {
            bCtx.save();
            bCtx.font = font;
            const words = text.split(" ");
            const lines: string[] = [];
            let currentLine = "";

            words.forEach(word => {
              const testLine = currentLine ? `${currentLine} ${word}` : word;
              if (bCtx.measureText(testLine).width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
              } else {
                currentLine = testLine;
              }
            });
            if (currentLine) {
              lines.push(currentLine);
            }
            bCtx.restore();
            return lines;
          };

          // Clip upper box to strictly prevent text overflow
          bCtx.save();
          bCtx.beginPath();
          bCtx.rect(15, 115, 690, 570);
          bCtx.clip();

          // Render chalk text inside structured cards matching screenshots
          let textToProcess = state.boardText;
          if (!textToProcess || !textToProcess.trim() || textToProcess === "Class session in progress...") {
            const currentTitle = (state.lessonTitle || "CHALKBOARD LESSON").replace(/^[#\*\_\s\d\.\:]+/, "").toUpperCase();
            textToProcess = `# ${currentTitle}\n\n` +
              `📌 LESSON ROADMAP & KEY CONCEPTS:\n` +
              `- Step 1 : Interactive Introduction & Topic Overview\n` +
              `- Step 2 : Verbatim Concept Verification & Chalk Notes\n` +
              `- Step 3 : Derivations, Equations & Socratic Problem Solving\n` +
              `- Step 4 : Real-time Doubt Resolution & Checkpoints\n\n` +
              `🌟 CONCEPT\n` +
              `Welcome to Cherry Ma'am's live session! Board notes will appear line-by-line as she explains! ✍️✨`;
          }

          const { cleanText } = extractSvgsAndCleanText(textToProcess);
          const rawLines = cleanText.split("\n").map(l => l.trim()).filter(Boolean);

          let curY = 135;
          const boxLeft = 30;
          const boxWidth = 660;
          const maxY = 665;

          // Helper to draw rounded rectangle with left accent bar
          const drawCard = (
            x: number,
            y: number,
            w: number,
            h: number,
            bgColor: string,
            borderColor: string,
            leftAccentColor?: string
          ) => {
            bCtx.save();
            bCtx.fillStyle = bgColor;
            bCtx.beginPath();
            if (typeof bCtx.roundRect === "function") {
              bCtx.roundRect(x, y, w, h, 12);
            } else {
              bCtx.rect(x, y, w, h);
            }
            bCtx.fill();

            bCtx.strokeStyle = borderColor;
            bCtx.lineWidth = 1;
            bCtx.stroke();

            if (leftAccentColor) {
              bCtx.fillStyle = leftAccentColor;
              bCtx.fillRect(x, y + 4, 4, h - 8);
            }
            bCtx.restore();
          };

          for (let i = 0; i < rawLines.length; i++) {
            if (curY >= maxY) break;
            const line = rawLines[i];
            const lower = line.toLowerCase();

            // 1. Topic Title
            if (line.startsWith("#") || line.startsWith("📌") || lower.includes("newton") || lower.startsWith("welcome")) {
              const displayTitle = line.replace(/^[#📌\s]+/, "").toUpperCase();
              bCtx.fillStyle = "#ffffff";
              bCtx.font = "bold 15px 'Space Grotesk', sans-serif";
              bCtx.fillText("📌 " + (displayTitle || "LESSON TOPIC"), boxLeft, curY + 15);
              curY += 32;
              continue;
            }

            // 2. Yellow Accent Cards (DEFINITION, DESCRIPTION, EXAMPLE, CONCEPT)
            if (
              lower.includes("definition") ||
              lower.includes("description") ||
              lower.includes("example") ||
              lower.includes("concept") ||
              lower.includes("important") ||
              lower.includes("परिभाषा")
            ) {
              let badgeTitle = "🌟 DEFINITION";
              if (lower.includes("description")) badgeTitle = "🌟 DESCRIPTION";
              else if (lower.includes("example")) badgeTitle = "🌟 EXAMPLE";
              else if (lower.includes("concept")) badgeTitle = "🌟 CONCEPT";

              let bodyText = "";
              if (i + 1 < rawLines.length && !rawLines[i + 1].startsWith("📐") && !rawLines[i + 1].startsWith("-") && !rawLines[i + 1].includes("=")) {
                bodyText = rawLines[i + 1];
                i++;
              } else {
                bodyText = line.replace(/^(definition|description|example|concept|🌟|:|\*)+/gi, "").trim();
              }

              const wrappedBodyLines = bodyText ? wrapTextToLines(bodyText, 620, "13px 'Inter', sans-serif") : [];
              const cardH = wrappedBodyLines.length > 0 ? 28 + (wrappedBodyLines.length * 20) + 10 : 38;

              drawCard(boxLeft, curY, boxWidth, cardH, "rgba(234, 179, 8, 0.08)", "rgba(234, 179, 8, 0.25)", "#facc15");

              bCtx.fillStyle = "#fde047";
              bCtx.font = "bold 10px 'JetBrains Mono', monospace";
              bCtx.fillText(badgeTitle, boxLeft + 14, curY + 18);

              wrappedBodyLines.forEach((bLine, lineIdx) => {
                const lineY = curY + 36 + (lineIdx * 20);
                const words = bLine.split(" ");
                let wordX = boxLeft + 14;

                words.forEach(word => {
                  const wLower = word.toLowerCase();
                  if (wLower.includes("force") || wLower.includes("mass") || wLower.includes("acceleration") || wLower.includes("motion") || wLower.includes("velocity")) {
                    bCtx.fillStyle = "#38bdf8";
                    bCtx.font = "bold 13px 'Inter', sans-serif";
                  } else if (word === "=" || word === "×" || word === "+") {
                    bCtx.fillStyle = "#f87171";
                    bCtx.font = "bold 13px 'Inter', sans-serif";
                  } else {
                    bCtx.fillStyle = "rgba(255, 255, 255, 0.92)";
                    bCtx.font = "13px 'Inter', sans-serif";
                  }
                  bCtx.fillText(word, wordX, lineY);
                  wordX += bCtx.measureText(word + " ").width;
                });
              });

              curY += cardH + 12;
              continue;
            }

            // 3. Prediction Polls / Checkpoints Card
            if (lower.includes("poll") || line.includes("❓") || lower.includes("prediction")) {
              const pollTitle = "❓ PREDICTION POLL";
              let questionText = line.replace(/^(❓|\*|#|PREDICTION POLL|POLL)+/gi, "").trim();
              if (i + 1 < rawLines.length && !rawLines[i + 1].toLowerCase().startsWith("a)") && !rawLines[i + 1].toLowerCase().startsWith("b)")) {
                questionText += " " + rawLines[i + 1];
                i++;
              }
              
              let optA = "";
              let optB = "";
              if (i + 1 < rawLines.length && rawLines[i + 1].toLowerCase().startsWith("a)")) {
                optA = rawLines[i + 1];
                i++;
              }
              if (i + 1 < rawLines.length && rawLines[i + 1].toLowerCase().startsWith("b)")) {
                optB = rawLines[i + 1];
                i++;
              }

              const wrappedQ = wrapTextToLines(questionText || "Answer the checkpoint prediction question:", boxWidth - 32, "bold 13px 'Inter', sans-serif");
              const pollBoxH = 34 + (wrappedQ.length * 20) + (optA ? 34 : 0) + (optB ? 34 : 0) + 12;
              drawCard(boxLeft, curY, boxWidth, pollBoxH, "rgba(6, 22, 19, 0.95)", "rgba(45, 212, 191, 0.5)", "#fde047");

              bCtx.fillStyle = "#fde047";
              bCtx.font = "bold 11px 'Space Grotesk', sans-serif";
              bCtx.fillText(pollTitle, boxLeft + 14, curY + 20);

              bCtx.fillStyle = "#ffffff";
              bCtx.font = "bold 13px 'Inter', sans-serif";
              let qY = curY + 38;
              wrappedQ.forEach(qLine => {
                bCtx.fillText(qLine, boxLeft + 14, qY);
                qY += 20;
              });

              if (optA) {
                drawCard(boxLeft + 14, qY + 2, boxWidth - 28, 30, "rgba(45, 212, 191, 0.12)", "rgba(45, 212, 191, 0.4)", "#2dd4bf");
                bCtx.fillStyle = "#38bdf8";
                bCtx.font = "bold 12px 'JetBrains Mono', monospace";
                bCtx.fillText("A)", boxLeft + 26, qY + 22);
                bCtx.fillStyle = "#ffffff";
                bCtx.font = "12px 'Inter', sans-serif";
                bCtx.fillText(optA.replace(/^a\)\s*/i, ""), boxLeft + 48, qY + 22);
                qY += 34;
              }

              if (optB) {
                drawCard(boxLeft + 14, qY + 2, boxWidth - 28, 30, "rgba(45, 212, 191, 0.12)", "rgba(45, 212, 191, 0.4)", "#2dd4bf");
                bCtx.fillStyle = "#38bdf8";
                bCtx.font = "bold 12px 'JetBrains Mono', monospace";
                bCtx.fillText("B)", boxLeft + 26, qY + 22);
                bCtx.fillStyle = "#ffffff";
                bCtx.font = "12px 'Inter', sans-serif";
                bCtx.fillText(optB.replace(/^b\)\s*/i, ""), boxLeft + 48, qY + 22);
                qY += 34;
              }

              curY += pollBoxH + 12;
              continue;
            }

            // 4. Cyan Header Card (FORMULA Header)
            if (lower.includes("formula") || lower.includes("equation") || lower.includes("सूत्र")) {
              drawCard(boxLeft, curY, boxWidth, 38, "rgba(14, 165, 233, 0.08)", "rgba(14, 165, 233, 0.25)", "#38bdf8");
              bCtx.fillStyle = "#38bdf8";
              bCtx.font = "bold 10px 'JetBrains Mono', monospace";
              bCtx.fillText("📐 FORMULA", boxLeft + 14, curY + 22);
              curY += 48;
              continue;
            }

            // 5. Centered Formula Display Box
            const cleanFormula = formatLatexToReadable(line);
            const lowerLine = line.toLowerCase();
            const isShortFormula = cleanFormula.length <= 42 && 
              !lowerLine.includes("stored") && 
              !lowerLine.includes("position") && 
              !lowerLine.includes("system") && 
              !lowerLine.includes("because") && 
              !lowerLine.includes("isolated") && 
              !lowerLine.includes("energy of") && 
              !lowerLine.includes("gravity") &&
              !lowerLine.includes("due to");

            if (isShortFormula && (line.includes("=") || line.includes("\\") || line.includes("^") || line.includes("frac"))) {
              const boxH = 55;
              const fBoxX = boxLeft + 10;
              const fBoxWidth = boxWidth - 20;

              drawCard(fBoxX, curY, fBoxWidth, boxH, "#061613", "rgba(56, 189, 248, 0.35)");

              bCtx.fillStyle = "#ffffff";
              let fontSz = 20;
              bCtx.font = `italic bold ${fontSz}px 'Cambria Math', 'Times New Roman', serif`;
              bCtx.textAlign = "center";
              while (bCtx.measureText(cleanFormula).width > fBoxWidth - 30 && fontSz > 11) {
                fontSz--;
                bCtx.font = `italic bold ${fontSz}px 'Cambria Math', 'Times New Roman', serif`;
              }
              bCtx.fillText(cleanFormula, fBoxX + fBoxWidth / 2, curY + 34);
              bCtx.textAlign = "left";

              curY += boxH + 14;
              continue;
            }

            // 6. Bullet List Items
            if (line.startsWith("-") || line.startsWith("*") || line.toLowerCase().startsWith("law") || line.startsWith("1.") || line.startsWith("2.")) {
              const itemText = line.replace(/^[-*123.]+\s*/, "").trim();
              const wrappedItemLines = wrapTextToLines(itemText, 580, "14px 'Inter', sans-serif");

              wrappedItemLines.forEach((iLine, lIdx) => {
                if (lIdx === 0) {
                  bCtx.fillStyle = "rgba(239, 68, 68, 0.2)";
                  bCtx.strokeStyle = "rgba(239, 68, 68, 0.4)";
                  bCtx.lineWidth = 1;
                  bCtx.beginPath();
                  if (typeof bCtx.roundRect === "function") {
                    bCtx.roundRect(boxLeft + 10, curY + 2, 20, 20, 5);
                  } else {
                    bCtx.rect(boxLeft + 10, curY + 2, 20, 20);
                  }
                  bCtx.fill();
                  bCtx.stroke();

                  bCtx.fillStyle = "#f87171";
                  bCtx.fillRect(boxLeft + 15, curY + 11, 10, 2);
                }

                const parts = iLine.split(/(\s*:\s*|\s*=\s*)/);
                let itemX = boxLeft + 38;
                const itemY = curY + 16;

                parts.forEach(part => {
                  if (part.trim() === ":") {
                    bCtx.fillStyle = "#fde047";
                    bCtx.font = "bold 14px 'Inter', sans-serif";
                  } else if (part.trim() === "=") {
                    bCtx.fillStyle = "#f87171";
                    bCtx.font = "bold 14px 'Inter', sans-serif";
                  } else {
                    bCtx.fillStyle = "#ffffff";
                    bCtx.font = "14px 'Inter', sans-serif";
                  }
                  bCtx.fillText(part, itemX, itemY);
                  itemX += bCtx.measureText(part).width;
                });

                curY += 24;
              });

              curY += 4;
              continue;
            }

            // Default regular text line
            const cleanRegLine = formatLatexToReadable(line);
            const wrappedRegLines = wrapTextToLines(cleanRegLine, 620, "13px 'Inter', sans-serif");
            wrappedRegLines.forEach(rLine => {
              bCtx.textAlign = "left";
              bCtx.fillStyle = "rgba(255, 255, 255, 0.92)";
              bCtx.font = "13px 'Inter', sans-serif";
              bCtx.fillText(rLine, boxLeft + 10, curY + 14);
              curY += 22;
            });
            curY += 4;
          }

          bCtx.restore();

          // Framed border around Handout box
          bCtx.strokeStyle = borderCol;
          bCtx.lineWidth = 1;
          bCtx.strokeRect(15, 115, 690, 570);

          // ------------------------------------------------------------------
          // DRAW LOWER SECTION: GENERATED LESSON DIAGRAMS (9:16 VERTICAL REEL)
          // ------------------------------------------------------------------
          bCtx.fillStyle = textPrimary;
          bCtx.font = "bold 14px 'Space Grotesk', sans-serif";
          bCtx.fillText("🎨 GENERATED LESSON DIAGRAMS", 28, 715);

          bCtx.strokeStyle = accentCol;
          bCtx.lineWidth = 1.5;
          bCtx.beginPath();
          bCtx.moveTo(28, 725);
          bCtx.lineTo(685, 725);
          bCtx.stroke();

          if (svgImageRef.current) {
            try {
              const img = svgImageRef.current;
              const panelW = 660;
              const panelH = 500;
              const panelX = 30;
              const panelY = 740;
              
              let drawW = panelW - 20;
              let drawH = panelH - 20;
              const imgRatio = img.width / img.height;
              const panelRatio = drawW / drawH;
              
              if (imgRatio > panelRatio) {
                drawH = drawW / imgRatio;
              } else {
                drawW = drawH * imgRatio;
              }
              
              const drawX = panelX + (panelW - drawW) / 2;
              const drawY = panelY + (panelH - drawH) / 2;
              
              bCtx.drawImage(img, drawX, drawY, drawW, drawH);
            } catch (e) {
              console.warn("Failed rendering SVG diagram to backbuffer canvas:", e);
            }
          } else {
            drawDynamicLessonDiagram(
              bCtx,
              state.lessonTitle || state.subject || "",
              (stateRef.current.cherrySpeechText || "") + " " + (state.boardText || ""),
              state.theme,
              isLight,
              25,
              740,
              670,
              500
            );
          }

          if (mainCanvas) {
            try {
              bCtx.save();
              bCtx.globalAlpha = 0.92;
              bCtx.drawImage(mainCanvas, 25, 740, 670, 500);
              bCtx.restore();
            } catch (e) {}
          }

          bCtx.strokeStyle = borderCol;
          bCtx.lineWidth = 1;
          bCtx.strokeRect(15, 698, 690, 555);

          let tx = 0, ty = 0, tw = 720, th = 1280;
          targetViewportRef.current = { x: tx, y: ty, w: tw, h: th };

          const cur = currentViewportRef.current;
          const tgt = targetViewportRef.current;
          const lerpFactor = 0.12;

          cur.x += (tgt.x - cur.x) * lerpFactor;
          cur.y += (tgt.y - cur.y) * lerpFactor;
          cur.w += (tgt.w - cur.w) * lerpFactor;
          cur.h += (tgt.h - cur.h) * lerpFactor;

          ctx.fillStyle = bgFill;
          ctx.fillRect(0, 0, 720, 1280);

          ctx.drawImage(
            backCanvas,
            cur.x, cur.y, cur.w, cur.h,
            0, 0, 720, 1280
          );
        };

        // Set render interval at 30 FPS (33ms) for fluid OBS-style recording
        intervalRef.current = setInterval(drawFrame, 33);

        // Capture live DOM blackboard snapshots every 250ms
        domCaptureIntervalRef.current = setInterval(() => {
          captureDomBoard();
        }, 250);

        const canvasStream = virtualCanvas.captureStream(30); // 30 FPS fluid video stream
        mixedStream.addTrack(canvasStream.getVideoTracks()[0]);
      }

      if (audioTrack) {
        mixedStream.addTrack(audioTrack);
      }

      // Try best mime types in sequence (VP9 with high 8Mbps bitrate, then VP8, then h264, then fallback)
      let recorder: MediaRecorder;
      const bitRate = 8000000; // 8 Mbps high fidelity video (captures sharp vectors, KaTeX & live DOM flawlessly)
      const mimeTypes = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=h264,opus",
        "video/webm",
        "video/mp4"
      ];

      let selectedOptions: MediaRecorderOptions = { videoBitsPerSecond: bitRate };
      for (const mime of mimeTypes) {
        if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mime)) {
          selectedOptions = { mimeType: mime, videoBitsPerSecond: bitRate };
          console.log(`[useBlackboardRecorder] Selected supported premium format: ${mime} at ${bitRate} bps`);
          break;
        }
      }

      try {
        recorder = new MediaRecorder(mixedStream, selectedOptions);
      } catch (err) {
        console.warn("MimeType options not supported, falling back to standard MediaRecorder:", err);
        recorder = new MediaRecorder(mixedStream);
      }

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        clearInterval(intervalRef.current);
        clearInterval(domCaptureIntervalRef.current);
        
        // Clean up tracks of captured display stream immediately to turn off sharing indicator
        if (displayStreamRef.current) {
          try {
            displayStreamRef.current.getTracks().forEach(track => track.stop());
            displayStreamRef.current = null;
          } catch (e) {}
        }

        console.log("[useBlackboardRecorder] MediaRecorder onstop triggered. Total chunks collected:", chunksRef.current.length);
        
        if (chunksRef.current.length === 0) {
          console.warn("[useBlackboardRecorder] No recording chunks were collected. Recording save aborted.");
          return;
        }

        // Compile recording into a single, high-fidelity WebM video blob
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        console.log("[useBlackboardRecorder] Compiled video blob size:", blob.size, "bytes");
        
        // Convert to ArrayBuffer for 100% reliable storage inside sandboxed iframe previews (IndexedDB safe serialize)
        let arrayBuffer: ArrayBuffer | undefined = undefined;
        try {
          console.log("[useBlackboardRecorder] Converting video blob to ArrayBuffer...");
          arrayBuffer = await blob.arrayBuffer();
          console.log("[useBlackboardRecorder] Conversion successful. ArrayBuffer byteLength:", arrayBuffer.byteLength);
        } catch (e) {
          console.error("[useBlackboardRecorder] Failed converting video blob to arrayBuffer:", e);
        }

        const durationStr = formatTime(secondsRef.current);
        const savedRec: SavedRecording = {
          id: activeSessionId,
          topicTitle: activeLessonTitle,
          subject: activeSubject,
          date: new Date().toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
          duration: durationStr || "00:05",
          blob: blob,
          arrayBuffer: arrayBuffer,
          theme: activeTheme,
        };

        console.log("[useBlackboardRecorder] Lesson concluded. Setting pendingRecording for Save Confirmation:", savedRec);
        setPendingRecording(savedRec);
        onToast(`🎬 Lesson concluded! Save Confirmation pending for "${activeLessonTitle}" (${durationStr})`, "info");
      };

      // Start recording with 1000ms timeslice to push data continuously
      recorder.start(1000);
      setIsRecording(true);

      // Start elapsed timer
      timerIntervalRef.current = setInterval(() => {
        secondsRef.current += 1;
        setRecordingSeconds(secondsRef.current);
      }, 1000);

      onToast("📹 Classroom screen recording initiated!", "info");

    } catch (err: any) {
      console.error("Failed initializing automated whiteboard recorder:", err);
      onToast("Unable to start screen recording. Please try opening in a new tab.", "error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    // Release any active screen sharing capture streams immediately
    if (displayStreamRef.current) {
      try {
        displayStreamRef.current.getTracks().forEach(track => track.stop());
        displayStreamRef.current = null;
      } catch (e) {}
    }
    clearInterval(timerIntervalRef.current);
    clearInterval(intervalRef.current);
    clearInterval(domCaptureIntervalRef.current);
    setIsRecording(false);
  };

  // Watch class state and automatically start/stop recording!
  useEffect(() => {
    if (isClassRunning && !isRecording) {
      startRecording();
    } else if (!isClassRunning && isRecording) {
      stopRecording();
    }
  }, [isClassRunning, isRecording, playbackStream]);

  // Clean up any remaining intervals on unmount
  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      clearInterval(domCaptureIntervalRef.current);
      clearInterval(timerIntervalRef.current);
    };
  }, []);

  const savePendingRecording = async () => {
    if (!pendingRecording) return;
    try {
      console.log("[useBlackboardRecorder] Saving pending recording to IndexedDB...", pendingRecording);
      await saveRecording(pendingRecording);
      console.log("[useBlackboardRecorder] Recording saved successfully.");
      onToast(`🎬 Classroom screen recording saved to Student Profile! (${pendingRecording.duration})`, "success");
      setPendingRecording(null);
      if (onRecordingSaved) {
        onRecordingSaved();
      }
    } catch (saveErr) {
      console.error("[useBlackboardRecorder] Failed storing video recording in IndexedDB:", saveErr);
      onToast("⚠️ Video recording failed to save due to storage limit.", "error");
    }
  };

  const discardPendingRecording = () => {
    setPendingRecording(null);
    onToast("🗑️ Recording discarded.", "info");
  };

  const downloadPendingRecording = () => {
    if (!pendingRecording) return;
    const activeBlob = pendingRecording.blob || (pendingRecording.arrayBuffer ? new Blob([pendingRecording.arrayBuffer], { type: "video/webm" }) : null);
    if (!activeBlob) {
      onToast("⚠️ Unable to download: video blob not found.", "error");
      return;
    }
    try {
      const url = URL.createObjectURL(activeBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pendingRecording.topicTitle.replace(/[^a-zA-Z0-9]/g, "_")}_${pendingRecording.date.replace(/[^a-zA-Z0-9]/g, "_")}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onToast("📥 Video recording download started!", "success");
    } catch (err) {
      console.error("[useBlackboardRecorder] Download failed:", err);
      onToast("⚠️ Download failed.", "error");
    }
  };

  return {
    isRecording,
    recordingDuration: formatTime(recordingSeconds),
    pendingRecording,
    setPendingRecording,
    savePendingRecording,
    discardPendingRecording,
    downloadPendingRecording,
    stopRecording,
  };
}
