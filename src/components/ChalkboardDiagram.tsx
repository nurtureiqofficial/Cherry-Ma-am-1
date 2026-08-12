import React, { useState, useEffect } from "react";
import { Sparkles, Sliders, Activity, RefreshCw } from "lucide-react";

interface ChalkboardDiagramProps {
  speechText: string;
}

type DiagramType = "math_quad" | "math_trig" | "physics_ramp" | "physics_wave" | "chemistry_bohr" | "chemistry_lewis" | "bio_cell" | "cs_logic" | "econ_supply";

export const ChalkboardDiagram: React.FC<ChalkboardDiagramProps> = ({ speechText }) => {
  const [diagramType, setDiagramType] = useState<DiagramType>("physics_wave");
  const [isDrawHidden, setIsDrawHidden] = useState(false);

  // Multi-discipline Knobs / Interactive Sliders state
  const [selectedLewisMolecule, setSelectedLewisMolecule] = useState<"h2o" | "co2" | "ch4">("h2o");
  const [mathA, setMathA] = useState(1); // ax^2
  const [mathB, setMathB] = useState(-4); // bx
  const [mathC, setMathC] = useState(3); // c
  
  const [angle, setAngle] = useState(35); // For ramp tilt or trig angle
  
  const [waveAmpli, setWaveAmpli] = useState(40); // Wave Amplitude
  const [waveFreq, setWaveFreq] = useState(2); // Wave frequency
  const [waveTime, setWaveTime] = useState(0); // wave timeline speed

  const [atomNumber, setAtomNumber] = useState(6); // Bohr dynamic atom (Carbon = 6)

  // New interactive states for extended subjects
  const [bioFocus, setBioFocus] = useState<"all" | "nucleus" | "vacuole" | "mitochondria" | "chloroplast">("all");
  const [bioSubTopic, setBioSubTopic] = useState<"plant_cell" | "animal_cell" | "photosynthesis" | "dna" | "neuron">("plant_cell");
  const [dnaUnwind, setDnaUnwind] = useState(20); // DNA rotation/unwinding offset
  const [csInputA, setCsInputA] = useState<0 | 1>(1);
  const [csInputB, setCsInputB] = useState<0 | 1>(0);
  const [csGateType, setCsGateType] = useState<"AND" | "OR" | "XOR" | "NAND">("AND");
  const [econDemandShift, setEconDemandShift] = useState(0);
  const [econSupplyShift, setEconSupplyShift] = useState(0);

  // Auto-classify lecture speech into specific architectural diagrams
  useEffect(() => {
    if (!speechText) return;
    const norm = speechText.toLowerCase();

    if (norm.match(/quad|quadratic|parabola|x\^2|curve|vertex/)) {
      setDiagramType("math_quad");
    } else if (norm.match(/triangle|trigonometr|angle|theta|sine|cosine|pythagor/)) {
      setDiagramType("math_trig");
    } else if (norm.match(/incline|ramp|force|gravity|friction|mass|newton|weight/)) {
      setDiagramType("physics_ramp");
    } else if (norm.match(/wave|frequency|amplitude|cycle|sine|transverse/)) {
      setDiagramType("physics_wave");
    } else if (norm.match(/bohr|shell|electron|atom|nucleus|proton|neutron|orbit|atomic/)) {
      setDiagramType("chemistry_bohr");
    } else if (norm.match(/bond|structure|covalent|lewis|skeletal|h2o|co2|ch4|h_2o/)) {
      setDiagramType("chemistry_lewis");
      if (norm.match(/co2|carbon dioxide/)) {
        setSelectedLewisMolecule("co2");
      } else if (norm.match(/ch4|methane/)) {
        setSelectedLewisMolecule("ch4");
      } else {
        setSelectedLewisMolecule("h2o");
      }
    } else if (norm.match(/cell|plant|animal|nucleus|organelle|vacuole|mitochondria|chloroplast|membrane|photosynthesis|calvin|light reaction|chlorophyll|dna|helix|nucleotide|neuron|nerve|axon|soma|dendrite|biology|botany|zoology/)) {
      setDiagramType("bio_cell");
      if (norm.match(/photosynthesis|calvin|light reaction|chlorophyll/)) {
        setBioSubTopic("photosynthesis");
      } else if (norm.match(/dna|helix|nucleotide|genetics/)) {
        setBioSubTopic("dna");
      } else if (norm.match(/neuron|nerve|axon|soma|dendrite/)) {
        setBioSubTopic("neuron");
      } else if (norm.match(/animal/)) {
        setBioSubTopic("animal_cell");
      } else {
        setBioSubTopic("plant_cell");
      }
    } else if (norm.match(/gate|logic|circuit|binary|and gate|or gate|xor|nand|boolean/)) {
      setDiagramType("cs_logic");
    } else if (norm.match(/supply|demand|equilibrium|price|quantity|buyer|seller|market/)) {
      setDiagramType("econ_supply");
    }
  }, [speechText]);

  // Request wave animation interval ticker
  useEffect(() => {
    if (diagramType !== "physics_wave" && (diagramType !== "bio_cell" || bioSubTopic !== "neuron")) return;
    let frameId: number;
    const tick = () => {
      setWaveTime((prev) => (prev + 0.08) % (Math.PI * 4));
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [diagramType, bioSubTopic]);

  if (isDrawHidden) {
    return (
      <div className="my-2 p-2.5 border border-dashed border-emerald-900/30 bg-zinc-950/45 rounded-lg flex items-center justify-between font-mono text-[9px]">
        <span className="text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-zinc-600 animate-pulse" />
          Interactive Chalkboard Sketchpad is Minimized
        </span>
        <button
          onClick={() => setIsDrawHidden(false)}
          className="px-2 py-0.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 font-bold rounded transition-colors"
        >
          📝 Show Sketchpad
        </button>
      </div>
    );
  }

  // Get labels for Bohr atomic configurations
  const getAtomDetails = (num: number) => {
    const list: Record<number, { sym: string; name: string; shells: number[]; color: string }> = {
      1: { sym: "H", name: "Hydrogen", shells: [1], color: "#ffffff" },
      2: { sym: "He", name: "Helium", shells: [2], color: "#fde047" },
      3: { sym: "Li", name: "Lithium", shells: [2, 1], color: "#34d399" },
      4: { sym: "Be", name: "Beryllium", shells: [2, 2], color: "#34d399" },
      5: { sym: "B", name: "Boron", shells: [2, 3], color: "#f472b6" },
      6: { sym: "C", name: "Carbon", shells: [2, 4], color: "#ea580c" },
      7: { sym: "N", name: "Nitrogen", shells: [2, 5], color: "#60a5fa" },
      8: { sym: "O", name: "Oxygen", shells: [2, 6], color: "#f43f5e" },
      9: { sym: "F", name: "Fluorine", shells: [2, 7], color: "#a78bfa" },
      10: { sym: "Ne", name: "Neon", shells: [2, 8], color: "#fb7185" },
    };
    return list[num] || { sym: "C", name: "Carbon", shells: [2, 4], color: "#ea580c" };
  };

  const atom = getAtomDetails(atomNumber);

  return (
    <div className="my-4 p-4 border border-emerald-950/40 bg-zinc-950/60 rounded-xl space-y-4 shadow-xl select-none max-w-full overflow-hidden animate-chalk-fade" id="interactive-chalk-workspace-block">
      
      {/* SVG hand-drawn filter declarations crucial for realistic chalkboard look */}
      <svg className="absolute w-0 h-0" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="chalk-roughness" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      {/* Manual Drawing Category Selector */}
      <div className="flex flex-wrap gap-1 border-b border-zinc-900 pb-3" id="discipline-tab-bar">
        {[
          { id: "math_quad", label: "📈 Parabola" },
          { id: "math_trig", label: "📐 Trigonometry" },
          { id: "physics_wave", label: "〰️ Wave Harmonics" },
          { id: "physics_ramp", label: "⏹️ Ramp Force" },
          { id: "chemistry_bohr", label: "⚛️ Bohr Atom" },
          { id: "chemistry_lewis", label: "🧪 Lewis Molecule" },
          { id: "bio_cell", label: "🌿 Biology Engine" },
          { id: "cs_logic", label: "💻 Logic Circuit" },
          { id: "econ_supply", label: "📊 Supply & Demand" },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setDiagramType(item.id as DiagramType)}
            className={`px-2 py-1 text-[9px] font-mono font-bold rounded transition-colors ${
              diagramType === item.id
                ? "bg-emerald-900/80 text-emerald-200 border border-emerald-700/80"
                : "bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-850"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Diagram Header */}
      <div className="flex items-center justify-between border-b border-zinc-900/60 pb-1.5">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-emerald-450 animate-pulse" />
          <span className="text-[10px] font-mono font-bold tracking-wider text-amber-300 uppercase">
            {diagramType === "math_quad" && "📐 Math: Parabolas & Axes Graph"}
            {diagramType === "math_trig" && "📐 Math: Right Triangle Trigonometry"}
            {diagramType === "physics_ramp" && "⚛️ Physics: Free Body Ramp Forces"}
            {diagramType === "physics_wave" && "⚛️ Physics: Interactive Wave Harmonics"}
            {diagramType === "chemistry_bohr" && "🧬 Sci: Bohr Shell Atomic Simulator"}
            {diagramType === "chemistry_lewis" && "🧬 Sci: Molecular Covalent Skeletal Bonds"}
            {diagramType === "bio_cell" && `🌿 Bio: Botany & Zoology Diagram Engine (${bioSubTopic === "plant_cell" ? "Plant Cell" : bioSubTopic === "animal_cell" ? "Animal Cell" : bioSubTopic === "photosynthesis" ? "Photosynthesis" : bioSubTopic === "dna" ? "DNA Helix" : "Neuron"})`}
            {diagramType === "cs_logic" && "💻 CS: Digital Logic Gate Combinations"}
            {diagramType === "econ_supply" && "📊 Econ: Supply and Demand Equilibrium Curve"}
          </span>
        </div>
        <div className="flex items-center space-x-2 font-mono text-[9px] text-zinc-500">
          <span>VECTOR CHALK ART</span>
          <button 
            onClick={() => setIsDrawHidden(true)} 
            className="text-stone-400 hover:text-pink-400 underline font-semibold transition-colors cursor-pointer"
          >
            Minimize
          </button>
        </div>
      </div>

      {/* ILLUSTRATION CANVAS AREA */}
      <div className="relative bg-[#061210] border border-emerald-900/10 rounded-lg p-2 flex items-center justify-center min-h-[180px] sm:min-h-[220px]">
        {/* Subtle coordinate dot grid background */}
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />

        {/* 1. MATHEMATICS QUADRATIC PLOTTER */}
        {diagramType === "math_quad" && (
          <svg className="w-full max-w-[320px] h-[200px]" viewBox="0 0 320 200">
            {/* Draw Axes with chalk filter effect */}
            <g filter="url(#chalk-roughness)">
              {/* x-axis */}
              <line x1="10" y1="100" x2="310" y2="100" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
              <polygon points="310,96 318,100 310,104" fill="rgba(255,255,255,0.4)" />
              {/* y-axis */}
              <line x1="160" y1="10" x2="160" y2="190" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
              <polygon points="156,15 160,7 164,15" fill="rgba(255,255,255,0.4)" />
              
              {/* Label strings */}
              <text x="300" y="115" fill="rgba(255,255,255,0.5)" className="font-mono text-[9px]">X</text>
              <text x="145" y="24" fill="rgba(255,255,255,0.5)" className="font-mono text-[9px]">Y</text>

              {/* Dynamic quadratic chalk curve */}
              {(() => {
                let pathD = "";
                const scaleX = 15;
                const scaleY = 10;
                for (let px = -10; px <= 10; px += 0.5) {
                  // y = ax^2 + bx + c
                  const py = mathA * px * px + mathB * px + mathC;
                  const svgX = 160 + px * scaleX;
                  const svgY = 100 - py * scaleY;
                  
                  if (svgX >= 10 && svgX <= 310 && svgY >= 10 && svgY <= 190) {
                    if (pathD === "") {
                      pathD = `M ${svgX} ${svgY}`;
                    } else {
                      pathD += ` L ${svgX} ${svgY}`;
                    }
                  }
                }
                return (
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#fde047"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })()}
              
              {/* Equation print */}
              <text x="20" y="35" fill="#fde047" className="font-mono text-[10px] chalk-font">
                y = {mathA.toFixed(1)}x² {mathB >= 0 ? `+ ${mathB.toFixed(1)}` : `- ${Math.abs(mathB).toFixed(1)}`}x {mathC >= 0 ? `+ ${mathC.toFixed(1)}` : `- ${Math.abs(mathC).toFixed(1)}`}
              </text>
            </g>
          </svg>
        )}

        {/* 2. MATHEMATICS TRIGONOMETRIC MODEL */}
        {diagramType === "math_trig" && (
          <svg className="w-full max-w-[320px] h-[200px]" viewBox="0 0 320 200">
            {(() => {
              const startX = 60;
              const startY = 150;
              const baseLen = 180;
              // trigonometry math
              const rad = (angle * Math.PI) / 180;
              const height = baseLen * Math.tan(rad);
              const endX = startX + baseLen;
              // cap the height so it fits the viewport
              const actualHeight = Math.min(height, 120);
              const topY = startY - actualHeight;
              
              return (
                <g filter="url(#chalk-roughness)">
                  {/* Base line */}
                  <line x1={startX} y1={startY} x2={endX} y2={startY} stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" />
                  {/* Perpendicular line */}
                  <line x1={endX} y1={startY} x2={endX} y2={topY} stroke="#f472b6" strokeWidth="2.5" />
                  {/* Hypotenuse line */}
                  <line x1={startX} y1={startY} x2={endX} y2={topY} stroke="#34d399" strokeWidth="3" />
                  
                  {/* Right-angle box indicator */}
                  <path d={`M ${endX - 12} ${startY} L ${endX - 12} ${startY - 12} L ${endX} ${startY - 12}`} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
                  
                  {/* Theta sign arc */}
                  <path d={`M ${startX + 30} ${startY} A 30 30 0 0 0 ${startX + 30 - Math.abs(15 * (1 - Math.cos(rad)))} ${startY - 15 * Math.sin(rad)}`} fill="none" stroke="#fde047" strokeWidth="2" />
                  <text x={startX + 38} y={startY - 6} fill="#fde047" className="font-mono text-[10px]">θ = {angle}°</text>
                  
                  {/* Side notation chalk labels */}
                  <text x={startX + baseLen/2 - 5} y={startY + 16} fill="rgba(255,255,255,0.6)" className="font-mono text-[9px] text-center">base (b)</text>
                  <text x={endX + 8} y={startY - actualHeight/2 + 3} fill="#f472b6" className="font-mono text-[9px]">opp (h)</text>
                  <text x={(startX + endX)/2 - 38} y={(startY + topY)/2 - 8} fill="#34d399" className="font-mono text-[9px]">hyp (c)</text>
                  
                  {/* Formula */}
                  <text x="30" y="35" fill="rgba(255,255,255,0.8)" className="font-mono text-[10px] chalk-font">
                    tan(θ) = opp / base = {Math.tan(rad).toFixed(3)}
                  </text>
                  <text x="30" y="52" fill="#34d399" className="font-mono text-[10px] chalk-font">
                    c² = a² + b² = {(baseLen * baseLen + actualHeight * actualHeight).toFixed(0)} (pixels)
                  </text>
                </g>
              );
            })()}
          </svg>
        )}

        {/* 3. PHYSICS INCLINED FORCES BLOCK PLANE */}
        {diagramType === "physics_ramp" && (
          <svg className="w-full max-w-[320px] h-[200px]" viewBox="0 0 320 200">
            {(() => {
              const rad = (angle * Math.PI) / 180;
              const startX = 30;
              const startY = 160;
              const length = 260;
              const endX = startX + length * Math.cos(rad);
              const endY = startY - length * Math.sin(rad);

              // Center block location on incline ramp
              const blockDist = length * 0.55;
              const bx = startX + blockDist * Math.cos(rad);
              const by = startY - blockDist * Math.sin(rad);

              // Standard force coordinate transform rotated parallel to ramp
              // We'll draw vectors with arrows
              return (
                <g filter="url(#chalk-roughness)">
                  {/* Incline line (Ramp surface) */}
                  <line x1={startX} y1={startY} x2={endX} y2={endY} stroke="rgba(255,255,255,0.8)" strokeWidth="3" />
                  {/* Ground line */}
                  <line x1={startX} y1={startY} x2={endX} y2={startY} stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeDasharray="4,4" />
                  {/* Vert base support */}
                  <line x1={endX} y1={startY} x2={endX} y2={endY} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                  {/* Ramp theta angle arc */}
                  <path d={`M ${startX + 40} ${startY} A 40 40 0 0 0 ${startX + 40 - Math.abs(10 * (1 - Math.cos(rad)))} ${startY - 20 * Math.sin(rad)}`} fill="none" stroke="#fde047" strokeWidth="1.5" />
                  <text x={startX + 45} y={startY - 5} fill="#fde047" className="font-mono text-[9px]">θ = {angle}°</text>

                  {/* Draw box on ramp box rotates by -angle */}
                  <g transform={`translate(${bx}, ${by}) rotate(${-angle})`}>
                    {/* The physical sliding block mass m */}
                    <rect x="-20" y="-24" width="40" height="24" fill="none" stroke="#60a5fa" strokeWidth="2.5" />
                    <text x="-5" y="-10" fill="#60a5fa" className="font-mono text-[9px] font-bold">m</text>

                    {/* Gravity Vector: Always pointing directly Downward (must rotate angle back into screen vert) */}
                    <g transform={`rotate(${angle})`}>
                      <line x1="0" y1="-12" x2="0" y2="48" stroke="#f43f5e" strokeWidth="2.5" />
                      <polygon points="-4,40 0,48 4,40" fill="#f43f5e" />
                      <text x="6" y="44" fill="#f43f5e" className="font-mono text-[9px] font-bold">Fg = mg</text>
                    </g>

                    {/* Normal force FN: Pointing upward perpendicular to ramp */}
                    <line x1="0" y1="-12" x2="0" y2="-62" stroke="#34d399" strokeWidth="2.5" />
                    <polygon points="-4,-54 0,-62 4,-54" fill="#34d399" />
                    <text x="6" y="-54" fill="#34d399" className="font-mono text-[9px] font-bold">FN = mg•cosθ</text>

                    {/* Tension / Static Friction Ff: Pointing back along ramp offset -X */}
                    <line x1="-15" y1="-12" x2="-65" y2="-12" stroke="#fde047" strokeWidth="2" strokeDasharray="2,2" />
                    <polygon points="-58,-15 -65,-12 -58,-9" fill="#fde047" />
                    <text x="-65" y="-20" fill="#fde047" className="font-mono text-[9px] font-bold">Ff (friction)</text>
                  </g>
                </g>
              );
            })()}
          </svg>
        )}

        {/* 4. PHYSICS WAVE HARMONICS */}
        {diagramType === "physics_wave" && (
          <svg className="w-full max-w-[320px] h-[200px]" viewBox="0 0 320 200">
            <g filter="url(#chalk-roughness)">
              {/* Baseline center line */}
              <line x1="10" y1="100" x2="310" y2="100" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeDasharray="4,4" />
              
              {/* Plot dynamic wave with amplitude and waveFreq sliders */}
              {(() => {
                let d = "";
                const width = 300;
                const pointsCount = 100;
                for (let i = 0; i <= pointsCount; i++) {
                  const x = 10 + (i / pointsCount) * width;
                  const phase = (i / pointsCount) * Math.PI * 2 * waveFreq;
                  const y = 100 - Math.sin(phase - waveTime) * waveAmpli;
                  
                  if (i === 0) {
                    d = `M ${x} ${y}`;
                  } else {
                    d += ` L ${x} ${y}`;
                  }
                }
                return (
                  <path
                    d={d}
                    fill="none"
                    stroke="#fde047"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })()}

              {/* Labels */}
              <text x="20" y="30" fill="rgba(255,255,255,0.7)" className="font-mono text-[9px]">
                Amp: {waveAmpli}px • Freq: {waveFreq}Hz
              </text>
              <text x="20" y="45" fill="#fde047" className="font-mono text-[9px] chalk-font">
                Wave Equation: y(x,t) = A sin(kx - ωt)
              </text>
            </g>
          </svg>
        )}

        {/* 5. CHEMISTRY BOHR ATOM SHELL MODEL */}
        {diagramType === "chemistry_bohr" && (
          <svg className="w-full max-w-[320px] h-[200px]" viewBox="0 0 320 200">
            <g filter="url(#chalk-roughness)">
              {/* Central Nucleus cluster */}
              <circle cx="160" cy="100" r="18" fill="rgba(239, 68, 68, 0.25)" stroke="#ef4444" strokeWidth="2.5" />
              <text x="146" y="103" fill="rgba(255,255,255,0.95)" className="font-mono text-[9px] font-bold uppercase tracking-wider text-center select-all">
                {atom.sym} ({atomNumber})
              </text>
              <text x="142" y="117" fill="rgba(255,255,255,0.4)" className="font-mono text-[7px]" />

              {/* Bohr electron shells orbits */}
              {atom.shells.map((electronsCount, index) => {
                const radius = 38 + index * 26;
                return (
                  <g key={index}>
                    {/* Ring orbit */}
                    <circle cx="160" cy="100" r={radius} fill="none" stroke="rgba(255, 255, 255, 0.24)" strokeWidth="1.2" strokeDasharray="4,3" />
                    
                    {/* Orbit shell indicators */}
                    <text x={160 + radius + 4} y="96" fill="rgba(255,255,255,0.3)" className="font-mono text-[7px]">n={index + 1}</text>

                    {/* Electron dots spaced evenly on circumference */}
                    {Array.from({ length: electronsCount }).map((_, eIdx) => {
                      const angleRad = (eIdx / electronsCount) * Math.PI * 2 + (index * 0.4);
                      const ex = 160 + radius * Math.cos(angleRad);
                      const ey = 100 + radius * Math.sin(angleRad);
                      return (
                        <g key={eIdx}>
                          {/* Electron particle glow */}
                          <circle cx={ex} cy={ey} r="4.2" fill={atom.color} stroke="#061210" strokeWidth="1" />
                          <circle cx={ex} cy={ey} r="1.5" fill="#000000" />
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* Atomic name banner */}
              <text x="20" y="32" fill={atom.color} className="font-mono text-[10px] uppercase font-bold tracking-widest chalk-font">
                {atom.name} ({atom.sym}) Bohr structure
              </text>
              <text x="20" y="47" fill="rgba(255,255,255,0.6)" className="font-mono text-[9px]">
                Config: {atom.shells.join("-")} • Total e⁻: {atomNumber}
              </text>
            </g>
          </svg>
        )}

        {/* 6. CHEMISTRY COVALENT SKELETAL LEWIS STRUCTURES */}
        {diagramType === "chemistry_lewis" && (
          <svg className="w-full max-w-[320px] h-[200px]" viewBox="0 0 320 200">
            {(() => {
              let molecularName = "Water Molecule";
              let formula = "H₂O";
              
              if (selectedLewisMolecule === "co2") {
                molecularName = "Carbon Dioxide";
                formula = "CO₂";
              } else if (selectedLewisMolecule === "ch4") {
                molecularName = "Methane";
                formula = "CH₄";
              }

              return (
                <g filter="url(#chalk-roughness)">
                  {/* Title labels */}
                  <text x="20" y="32" fill="#34d399" className="font-mono text-[10px] font-bold uppercase tracking-widest chalk-font">
                    {molecularName} Skeletal Lewis Model
                  </text>
                  <text x="20" y="47" fill="rgba(255,255,255,0.6)" className="font-mono text-[9px]">
                    Formula: {formula} • Covalent bonds shared electrons
                  </text>

                  {/* CO2 Model */}
                  {formula === "CO₂" ? (
                    <g transform="translate(40, 20)">
                      {/* Central Carbon atom */}
                      <circle cx="120" cy="90" r="15" fill="none" stroke="#60a5fa" strokeWidth="2.5" />
                      <text x="114" y="94" fill="#60a5fa" className="font-mono test-xs font-bold">C</text>
                      
                      {/* Left Oxygen atom */}
                      <circle cx="50" cy="90" r="15" fill="none" stroke="#f43f5e" strokeWidth="2.5" />
                      <text x="44" y="94" fill="#f43f5e" className="font-mono test-xs font-bold">O</text>

                      {/* Right Oxygen atom */}
                      <circle cx="190" cy="90" r="15" fill="none" stroke="#f43f5e" strokeWidth="2.5" />
                      <text x="184" y="94" fill="#f43f5e" className="font-mono test-xs font-bold">O</text>

                      {/* Double Covalent Bonds (Left) */}
                      <line x1="68" y1="85" x2="102" y2="85" stroke="rgba(255,255,255,0.8)" strokeWidth="2.2" />
                      <line x1="68" y1="95" x2="102" y2="95" stroke="rgba(255,255,255,0.8)" strokeWidth="2.2" />

                      {/* Double Covalent Bonds (Right) */}
                      <line x1="138" y1="85" x2="172" y2="85" stroke="rgba(255,255,255,0.8)" strokeWidth="2.2" />
                      <line x1="138" y1="95" x2="172" y2="95" stroke="rgba(255,255,255,0.8)" strokeWidth="2.2" />

                      {/* Electron Lone Pairs Dot representations */}
                      {/* Left Oxygen lone pairs */}
                      <circle cx="40" cy="68" r="2.2" fill="#f43f5e" />
                      <circle cx="48" cy="68" r="2.2" fill="#f43f5e" />
                      <circle cx="40" cy="112" r="2.2" fill="#f43f5e" />
                      <circle cx="48" cy="112" r="2.2" fill="#f43f5e" />
                      {/* Right Oxygen lone pairs */}
                      <circle cx="192" cy="68" r="2.2" fill="#f43f5e" />
                      <circle cx="200" cy="68" r="2.2" fill="#f43f5e" />
                      <circle cx="192" cy="112" r="2.2" fill="#f43f5e" />
                      <circle cx="200" cy="112" r="2.2" fill="#f43f5e" />
                    </g>
                  ) : formula === "CH₄" ? (
                    <g transform="translate(40, 10)">
                      {/* Central Carbon */}
                      <circle cx="120" cy="90" r="15" fill="none" stroke="#60a5fa" strokeWidth="2.5" />
                      <text x="114" y="94" fill="#60a5fa" className="font-mono text-xs font-bold">C</text>

                      {/* 4 Hydrogen Atoms */}
                      {/* Top H */}
                      <circle cx="120" cy="30" r="11" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
                      <text x="116" y="34" fill="rgba(255,255,255,0.85)" className="font-mono text-[9px] font-bold">H</text>
                      {/* Bottom H */}
                      <circle cx="120" cy="150" r="11" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
                      <text x="116" y="154" fill="rgba(255,255,255,0.85)" className="font-mono text-[9px] font-bold">H</text>
                      {/* Left H */}
                      <circle cx="60" cy="90" r="11" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
                      <text x="56" y="94" fill="rgba(255,255,255,0.85)" className="font-mono text-[9px] font-bold">H</text>
                      {/* Right H */}
                      <circle cx="180" cy="90" r="11" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
                      <text x="176" y="94" fill="rgba(255,255,255,0.85)" className="font-mono text-[9px] font-bold">H</text>

                      {/* Single Covalent bonds lines */}
                      <line x1="120" y1="44" x2="120" y2="72" stroke="white" strokeWidth="2" />
                      <line x1="120" y1="108" x2="120" y2="136" stroke="white" strokeWidth="2" />
                      <line x1="74" y1="90" x2="102" y2="90" stroke="white" strokeWidth="2" />
                      <line x1="138" y1="90" x2="166" y2="90" stroke="white" strokeWidth="2" />
                    </g>
                  ) : (
                    /* Default: H2O */
                    <g transform="translate(40, 15)">
                      {/* Central Oxygen (Bent shape angles ~104.5°) */}
                      <circle cx="120" cy="70" r="15" fill="none" stroke="#f43f5e" strokeWidth="2.5" />
                      <text x="114" y="74" fill="#f43f5e" className="font-mono text-xs font-bold">O</text>

                      {/* Electron Lone Pairs (Bent top) */}
                      <circle cx="110" cy="46" r="2.2" fill="#f43f5e" />
                      <circle cx="116" cy="42" r="2.2" fill="#f43f5e" />
                      
                      <circle cx="130" cy="46" r="2.2" fill="#f43f5e" />
                      <circle cx="124" cy="42" r="2.2" fill="#f43f5e" />

                      {/* Bottom-left hydrogen */}
                      <circle cx="70" cy="120" r="11" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
                      <text x="66" y="124" fill="rgba(255,255,255,0.85)" className="font-mono text-[9px] font-bold">H</text>

                      {/* Bottom-right hydrogen */}
                      <circle cx="170" cy="120" r="11" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
                      <text x="166" y="124" fill="rgba(255,255,255,0.85)" className="font-mono text-[9px] font-bold">H</text>

                      {/* Bent Covalent Lines */}
                      <line x1="108" y1="82" x2="82" y2="108" stroke="white" strokeWidth="2" />
                      <line x1="132" y1="82" x2="158" y2="108" stroke="white" strokeWidth="2" />

                      <text x="100" y="135" fill="rgba(255,255,255,0.4)" className="font-mono text-[8px]">Angle: 104.5°</text>
                    </g>
                  )}
                </g>
              );
            })()}
          </svg>
        )}

        {/* 7. BIOLOGY ENGINE (BOTANY + ZOOLOGY) */}
        {diagramType === "bio_cell" && (
          <div className="flex flex-col items-center w-full space-y-3" id="biology-chalkboard-wrapper">
            {/* Biology Sub-topic Tabs */}
            <div className="flex flex-wrap justify-center gap-1 w-full bg-zinc-950/80 p-1.5 rounded-lg border border-zinc-900/60 shadow-inner">
              {[
                { id: "plant_cell" as const, label: "🌿 Botany: Plant Cell" },
                { id: "photosynthesis" as const, label: "☀️ Botany: Photosynthesis" },
                { id: "dna" as const, label: "🧬 Genetics: DNA Helix" },
                { id: "animal_cell" as const, label: "🐾 Zoology: Animal Cell" },
                { id: "neuron" as const, label: "🧠 Zoology: Nerve Cell" },
              ].map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setBioSubTopic(sub.id)}
                  className={`px-2 py-0.5 text-[9px] font-mono font-bold rounded-md transition-all cursor-pointer ${
                    bioSubTopic === sub.id
                      ? "bg-emerald-900/80 text-emerald-200 border border-emerald-600"
                      : "bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-white border border-transparent"
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            <svg className="w-full max-w-[340px] h-[210px] bg-emerald-950/5 rounded-lg border border-emerald-950/20" viewBox="0 0 340 210">
              {/* Plant Cell */}
              {bioSubTopic === "plant_cell" && (
                <g filter="url(#chalk-roughness)">
                  {/* Outer Cell Wall */}
                  <polygon
                    points="45,20 295,20 315,50 315,150 295,180 45,180 25,150 25,50"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                  />
                  {/* Inner Cell Membrane */}
                  <polygon
                    points="50,25 290,25 308,52 308,148 290,175 50,175 32,148 32,52"
                    fill="none"
                    stroke="rgba(16, 185, 129, 0.5)"
                    strokeWidth="1.2"
                    strokeDasharray="3,3"
                  />
                  {/* Large Central Vacuole */}
                  <path
                    d="M 150,75 Q 180,60 220,75 T 240,120 Q 220,150 170,145 T 140,100 Z"
                    fill="none"
                    stroke={bioFocus === "vacuole" ? "#fde047" : "#38bdf8"}
                    strokeWidth={bioFocus === "vacuole" ? "3" : "1.8"}
                  />
                  <text x="165" y="110" fill="#38bdf8" opacity="0.6" className="font-mono text-[7px] font-bold">Vacuole (Botany)</text>

                  {/* Nucleus */}
                  <g>
                    <circle
                      cx="90"
                      cy="110"
                      r="22"
                      fill="none"
                      stroke={bioFocus === "nucleus" ? "#fde047" : "#c084fc"}
                      strokeWidth={bioFocus === "nucleus" ? "3" : "1.8"}
                    />
                    <circle cx="85" cy="105" r="7" fill="none" stroke="#c084fc" strokeWidth="1" />
                    <text x="80" y="142" fill="#c084fc" opacity="0.8" className="font-mono text-[7px] font-bold">Nucleus</text>
                  </g>

                  {/* Chloroplasts */}
                  <g stroke="#10b981" fill="none">
                    <ellipse
                      cx="265"
                      cy="60"
                      rx="13"
                      ry="7"
                      transform="rotate(25 265 60)"
                      strokeWidth={bioFocus === "chloroplast" ? "2.5" : "1.5"}
                      stroke={bioFocus === "chloroplast" ? "#fde047" : "#10b981"}
                    />
                    <ellipse
                      cx="255"
                      cy="145"
                      rx="13"
                      ry="7"
                      transform="rotate(-35 255 145)"
                      strokeWidth={bioFocus === "chloroplast" ? "2.5" : "1.5"}
                      stroke={bioFocus === "chloroplast" ? "#fde047" : "#10b981"}
                    />
                  </g>

                  {/* Mitochondria */}
                  <g stroke="#f97316" fill="none">
                    <ellipse
                      cx="65"
                      cy="55"
                      rx="13"
                      ry="6"
                      transform="rotate(-15 65 55)"
                      strokeWidth={bioFocus === "mitochondria" ? "2.5" : "1.5"}
                      stroke={bioFocus === "mitochondria" ? "#fde047" : "#f97316"}
                    />
                    <ellipse
                      cx="205"
                      cy="50"
                      rx="13"
                      ry="6"
                      transform="rotate(45 205 50)"
                      strokeWidth={bioFocus === "mitochondria" ? "2.5" : "1.5"}
                      stroke={bioFocus === "mitochondria" ? "#fde047" : "#f97316"}
                    />
                  </g>

                  {bioFocus !== "all" && (
                    <g>
                      {bioFocus === "nucleus" && <circle cx="90" cy="110" r="30" fill="none" stroke="#fde047" strokeWidth="1" strokeDasharray="2,2" />}
                      {bioFocus === "vacuole" && <circle cx="185" cy="110" r="50" fill="none" stroke="#fde047" strokeWidth="1" strokeDasharray="2,2" />}
                      {bioFocus === "mitochondria" && (
                        <>
                          <circle cx="65" cy="55" r="20" fill="none" stroke="#fde047" strokeWidth="1" strokeDasharray="2,2" />
                          <circle cx="205" cy="50" r="20" fill="none" stroke="#fde047" strokeWidth="1" strokeDasharray="2,2" />
                        </>
                      )}
                      {bioFocus === "chloroplast" && (
                        <>
                          <circle cx="265" cy="60" r="20" fill="none" stroke="#fde047" strokeWidth="1" strokeDasharray="2,2" />
                          <circle cx="255" cy="145" r="20" fill="none" stroke="#fde047" strokeWidth="1" strokeDasharray="2,2" />
                        </>
                      )}
                    </g>
                  )}

                  <text x="35" y="198" fill="#fde047" className="font-mono text-[7.5px]" style={{ fontFamily: "monospace" }}>
                    {bioFocus === "all" && "🌿 Plant Cell Model: Rigged with rigid Cell Wall & Chloroplasts (Botany)"}
                    {bioFocus === "nucleus" && "🧠 Nucleus: Core chromosomal DNA containment unit."}
                    {bioFocus === "vacuole" && "💧 Central Vacuole: High turgor pressure maintenance."}
                    {bioFocus === "mitochondria" && "⚡ Mitochondria: Double-membrane powerhouse generating cellular ATP."}
                    {bioFocus === "chloroplast" && "☀️ Chloroplast: Site of light-harvesting Thylakoids & Calvin Cycle."}
                  </text>
                </g>
              )}

              {/* Photosynthesis Pathway */}
              {bioSubTopic === "photosynthesis" && (
                <g filter="url(#chalk-roughness)">
                  {/* Solar illumination */}
                  <g stroke="#fde047" fill="none" strokeWidth="1.5">
                    <circle cx="50" cy="45" r="12" />
                    <line x1="50" y1="25" x2="50" y2="15" />
                    <line x1="50" y1="65" x2="50" y2="75" />
                    <line x1="30" y1="45" x2="20" y2="45" />
                    <line x1="70" y1="45" x2="80" y2="45" />
                    <line x1="36" y1="31" x2="28" y2="23" />
                    <line x1="64" y1="59" x2="72" y2="67" />
                    <line x1="64" y1="31" x2="72" y2="23" />
                    <line x1="36" y1="59" x2="28" y2="67" />
                    <text x="32" y="90" fill="#fde047" className="font-mono text-[8px] font-black">Sunlight (hν)</text>
                  </g>

                  {/* Leaf structure (Botany) */}
                  <path
                    d="M 120,110 C 130,55 240,55 270,110 C 240,165 130,165 120,110 Z"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                  />
                  {/* Leaf primary stem */}
                  <path
                    d="M 100,110 C 140,110 210,110 270,110"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="1.5"
                    strokeDasharray="3,3"
                  />

                  {/* H2O Water Input */}
                  <g stroke="#38bdf8" strokeWidth="2" fill="none">
                    <path d="M 40,150 Q 80,155 110,130" />
                    {/* Arrow-head */}
                    <polygon points="110,130 102,130 108,137" fill="#38bdf8" />
                    <text x="35" y="170" fill="#38bdf8" className="font-mono text-[8px] font-bold">H₂O Water In</text>
                  </g>

                  {/* CO2 Gas Input */}
                  <g stroke="#a78bfa" strokeWidth="2" fill="none">
                    <path d="M 140,30 Q 170,45 185,75" />
                    <polygon points="185,75 178,71 187,68" fill="#a78bfa" />
                    <text x="145" y="24" fill="#a78bfa" className="font-mono text-[8px] font-bold">CO₂ Gas In</text>
                  </g>

                  {/* O2 Gas Output */}
                  <g stroke="#f43f5e" strokeWidth="2" fill="none">
                    <path d="M 230,120 Q 275,130 300,105" />
                    <polygon points="300,105 292,107 296,100" fill="#f43f5e" />
                    <text x="270" y="94" fill="#f43f5e" className="font-mono text-[8px] font-bold">O₂ Gas Out ↑</text>
                  </g>

                  {/* Chemical Equation overlay */}
                  <rect x="55" y="180" width="230" height="20" rx="6" fill="#0b282d" stroke="rgba(253, 224, 71, 0.3)" strokeWidth="1" />
                  <text x="65" y="193" fill="#fde047" className="font-mono text-[7px] font-black tracking-wide">
                    Equation: 6CO₂ + 6H₂O + light ───→ C₆H₁₂O₆ + 6O₂
                  </text>
                </g>
              )}

              {/* DNA Double Helix */}
              {bioSubTopic === "dna" && (
                <g filter="url(#chalk-roughness)">
                  {(() => {
                    const points: number[] = Array.from({ length: 15 }, (_, i) => i);
                    return (
                      <>
                        {/* Ribbon A (Cyan) */}
                        <path
                          d={`M 40,${100 + 40 * Math.sin(0)} ` + points.map(i => {
                            const x = 40 + i * 18;
                            const y = 100 + 40 * Math.sin((x + dnaUnwind * 1.5) * 0.03);
                            return `L ${x},${y}`;
                          }).join(" ")}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="2.5"
                        />

                        {/* Ribbon B (Lilac) */}
                        <path
                          d={`M 40,${100 - 40 * Math.sin(0)} ` + points.map(i => {
                            const x = 40 + i * 18;
                            const y = 100 - 40 * Math.sin((x + dnaUnwind * 1.5) * 0.03);
                            return `L ${x},${y}`;
                          }).join(" ")}
                          fill="none"
                          stroke="#c084fc"
                          strokeWidth="2.5"
                        />

                        {/* Hydrogen bond rungs (base pairs) linking the two strands */}
                        {points.map((i) => {
                          const x = 40 + i * 18;
                          const phase = (x + dnaUnwind * 1.5) * 0.03;
                          const y1 = 100 + 40 * Math.sin(phase);
                          const y2 = 100 - 40 * Math.sin(phase);
                          
                          const strokeColor = i % 2 === 0 ? "#fde047" : "#10b981";
                          const baseLabel = i % 4 === 0 ? "A-T" : i % 4 === 1 ? "T-A" : i % 4 === 2 ? "G-C" : "C-G";
                          
                          return (
                            <g key={i}>
                              <line
                                x1={x}
                                y1={y1}
                                x2={x}
                                y2={y2}
                                stroke={strokeColor}
                                strokeWidth="1.8"
                                strokeDasharray="2,2"
                              />
                              <circle cx={x} cy={y1} r="3.5" fill="#38bdf8" />
                              <circle cx={x} cy={y2} r="3.5" fill="#c084fc" />
                              {i % 2 === 0 && Math.abs(y1 - y2) > 30 && (
                                <text x={x - 4} y="103" fill={strokeColor} className="font-mono text-[5px] font-black">{baseLabel}</text>
                              )}
                            </g>
                          );
                        })}
                      </>
                    );
                  })()}

                  <text x="35" y="195" fill="#fde047" className="font-mono text-[7px]" style={{ fontFamily: "monospace" }}>
                    🧬 Watson-Crick DNA Model: Double Helix with Watson-Crick Complementary Base Pairs
                  </text>
                  <text x="35" y="206" fill="rgba(255, 255, 255, 0.4)" className="font-mono text-[6.5px]">
                    * Adenine (A) pairs with Thymine (T) | Guanine (G) pairs with Cytosine (C)
                  </text>
                </g>
              )}

              {/* Animal Cell */}
              {bioSubTopic === "animal_cell" && (
                <g filter="url(#chalk-roughness)">
                  {/* Outer cell membrane */}
                  <circle
                    cx="170"
                    cy="100"
                    r="82"
                    fill="none"
                    stroke="#fb7185"
                    strokeWidth="2.5"
                  />
                  {/* Smooth internal plasma lining */}
                  <circle
                    cx="170"
                    cy="100"
                    r="77"
                    fill="none"
                    stroke="rgba(251, 113, 133, 0.5)"
                    strokeWidth="1.2"
                    strokeDasharray="2,2"
                  />

                  {/* Central Nucleus */}
                  <g>
                    <circle
                      cx="140"
                      cy="100"
                      r="22"
                      fill="none"
                      stroke={bioFocus === "nucleus" ? "#fde047" : "#c084fc"}
                      strokeWidth={bioFocus === "nucleus" ? "3" : "1.8"}
                    />
                    <circle cx="135" cy="95" r="7" fill="none" stroke="#c084fc" strokeWidth="1" />
                    <text x="130" y="132" fill="#c084fc" opacity="0.8" className="font-mono text-[7px] font-bold">Nucleus</text>
                  </g>

                  {/* Golgi Apparatus */}
                  <g stroke="#38bdf8" fill="none" strokeWidth="1.6">
                    <path d="M 195,65 Q 215,70 230,62" />
                    <path d="M 197,71 Q 217,76 228,68" />
                    <path d="M 199,77 Q 219,82 226,74" />
                    <text x="218" y="52" fill="#38bdf8" opacity="0.8" className="font-mono text-[7px] font-bold">Golgi</text>
                  </g>

                  {/* Centrioles */}
                  <g stroke="#fde047" strokeWidth="2.5">
                    <line x1="105" y1="65" x2="117" y2="65" />
                    <line x1="111" y1="59" x2="111" y2="71" />
                    <text x="92" y="52" fill="#fde047" opacity="0.8" className="font-mono text-[7px] font-bold">Centrosome</text>
                  </g>

                  {/* Lysosomes */}
                  <g stroke="#f43f5e" fill="none" strokeWidth="1.5">
                    <circle cx="105" cy="135" r="6" />
                    <line x1="103" y1="135" x2="107" y2="135" />
                    <circle cx="215" cy="130" r="6" />
                    <line x1="213" y1="130" x2="217" y2="130" />
                    <text x="85" y="152" fill="#f43f5e" opacity="0.8" className="font-mono text-[7px] font-bold">Lysosomes</text>
                  </g>

                  {/* Mitochondria */}
                  <g stroke="#f97316" fill="none">
                    <ellipse
                      cx="175"
                      cy="145"
                      rx="13"
                      ry="6"
                      transform="rotate(-25 175 145)"
                      strokeWidth={bioFocus === "mitochondria" ? "2.5" : "1.5"}
                      stroke={bioFocus === "mitochondria" ? "#fde047" : "#f97316"}
                    />
                  </g>

                  {bioFocus !== "all" && (
                    <g>
                      {bioFocus === "nucleus" && <circle cx="140" cy="100" r="30" fill="none" stroke="#fde047" strokeWidth="1" strokeDasharray="2,2" />}
                      {bioFocus === "mitochondria" && <circle cx="175" cy="145" r="20" fill="none" stroke="#fde047" strokeWidth="1" strokeDasharray="2,2" />}
                    </g>
                  )}

                  <text x="35" y="198" fill="#fde047" className="font-mono text-[7.5px]" style={{ fontFamily: "monospace" }}>
                    {bioFocus === "all" && "🐾 Animal Cell Model: Lacks rigid Cell Wall, contains Lysosomes & Centrioles (Zoology)"}
                    {bioFocus === "nucleus" && "🧠 Nucleus: Governs the cell's genetic processes & nuclear division."}
                    {bioFocus === "mitochondria" && "⚡ Mitochondria: Generates ATP through oxidative phosphorylation."}
                  </text>
                </g>
              )}

              {/* Neuron / Nerve Cell */}
              {bioSubTopic === "neuron" && (
                <g filter="url(#chalk-roughness)">
                  {/* Cell Body / Soma */}
                  <path
                    d="M 60,110 C 50,90 60,70 80,80 C 95,65 115,85 110,110 C 120,125 100,145 80,135 C 60,140 45,125 60,110"
                    fill="none"
                    stroke="#fb7185"
                    strokeWidth="2"
                  />
                  {/* Dendrites radiating outwards */}
                  <g stroke="#fb7185" strokeWidth="1.5" fill="none">
                    <path d="M 55,90 L 35,80 Q 25,90 15,80" />
                    <path d="M 80,75 L 75,55 Q 85,45 80,35" />
                    <path d="M 105,85 L 125,70 Q 135,70 145,60" />
                    <path d="M 105,130 L 125,145 Q 125,155 135,165" />
                    <path d="M 60,130 L 40,145 Q 30,145 20,155" />
                  </g>

                  {/* Nucleus inside Soma */}
                  <circle cx="85" cy="110" r="10" fill="none" stroke="#c084fc" strokeWidth="1.5" />
                  <circle cx="82" cy="107" r="3.5" fill="none" stroke="#c084fc" strokeWidth="1" />
                  <text x="73" y="128" fill="#c084fc" opacity="0.85" className="font-mono text-[6.5px] font-black">Soma</text>

                  {/* Long Axon Pathway */}
                  <line x1="110" y1="110" x2="250" y2="110" stroke="#fb7185" strokeWidth="2" />
                  
                  {/* Myelin Sheath wraps */}
                  <g stroke="#fde047" strokeWidth="1.2" fill="none">
                    <rect x="122" y="102" width="22" height="16" rx="4" />
                    <rect x="154" y="102" width="22" height="16" rx="4" />
                    <rect x="186" y="102" width="22" height="16" rx="4" />
                    <rect x="218" y="102" width="22" height="16" rx="4" />
                  </g>
                  <text x="155" y="94" fill="#fde047" opacity="0.85" className="font-mono text-[6.5px] font-black">Myelin Sheath</text>

                  {/* Axon Terminals */}
                  <g stroke="#fb7185" strokeWidth="1.5" fill="none">
                    <path d="M 250,110 Q 265,95 285,90" />
                    <circle cx="285" cy="90" r="3" fill="#fb7185" />
                    
                    <path d="M 250,110 L 290,110" />
                    <circle cx="290" cy="110" r="3" fill="#fb7185" />
                    
                    <path d="M 250,110 Q 265,125 285,130" />
                    <circle cx="285" cy="130" r="3" fill="#fb7185" />
                  </g>
                  <text x="260" y="80" fill="#fb7185" opacity="0.85" className="font-mono text-[6.5px] font-black">Terminals</text>

                  {/* Action Potential Signal Pulse (Animated circles moving along the axon) */}
                  {(() => {
                    const normalizedTime = (waveTime / (Math.PI * 4));
                    const signalX = 110 + normalizedTime * 140;
                    return (
                      <g>
                        <circle cx={signalX} cy="110" r="5" fill="#fde047" opacity="0.8" className="animate-pulse" />
                        <circle cx={signalX} cy="110" r="3" fill="#fde047" />
                        <text x={signalX - 15} y="125" fill="#fde047" className="font-mono text-[6px] font-extrabold uppercase">Impulse</text>
                      </g>
                    );
                  })()}

                  <text x="35" y="195" fill="#fde047" className="font-mono text-[7px]" style={{ fontFamily: "monospace" }}>
                    ⚡ Nerve Cell (Neuron): Transmitting active Action Potential impulses down myelinated Axon (Zoology)
                  </text>
                  <text x="35" y="206" fill="rgba(255, 255, 255, 0.4)" className="font-mono text-[6.5px]">
                    * Signal propagates saltatorily across Nodes of Ranvier at high velocities
                  </text>
                </g>
              )}
            </svg>
          </div>
        )}

        {/* 8. COMPUTER SCIENCE DIGITAL LOGIC GATES */}
        {diagramType === "cs_logic" && (
          <svg className="w-full max-w-[320px] h-[200px]" viewBox="0 0 320 200">
            {(() => {
              const outVal = csGateType === "AND" ? (csInputA && csInputB ? 1 : 0) :
                             csGateType === "OR" ? (csInputA || csInputB ? 1 : 0) :
                             csGateType === "XOR" ? (csInputA !== csInputB ? 1 : 0) :
                             /* NAND */ (!(csInputA && csInputB) ? 1 : 0);
                             
              return (
                <g filter="url(#chalk-roughness)">
                  {/* Inputs on the left */}
                  <g>
                    {/* Input A */}
                    <circle cx="45" cy="70" r="12" fill="none" stroke={csInputA ? "#34d399" : "#a1a1aa"} strokeWidth="2" />
                    <text x="41" y="74" fill={csInputA ? "#34d399" : "#a1a1aa"} className="font-mono text-[10px] font-bold">{csInputA}</text>
                    <text x="20" y="73" fill="rgba(255,255,255,0.6)" className="font-mono text-[8px] font-bold">In A</text>

                    {/* Input B */}
                    <circle cx="45" cy="130" r="12" fill="none" stroke={csInputB ? "#34d399" : "#a1a1aa"} strokeWidth="2" />
                    <text x="41" y="134" fill={csInputB ? "#34d399" : "#a1a1aa"} className="font-mono text-[10px] font-bold">{csInputB}</text>
                    <text x="20" y="133" fill="rgba(255,255,255,0.6)" className="font-mono text-[8px] font-bold">In B</text>
                  </g>

                  {/* Wire Connections to Gate */}
                  <g>
                    <path d="M 57 70 L 120 70" fill="none" stroke={csInputA ? "#34d399" : "#52525b"} strokeWidth="2" />
                    <path d="M 57 130 L 120 130" fill="none" stroke={csInputB ? "#34d399" : "#52525b"} strokeWidth="2" />
                  </g>

                  {/* Gate Symbols */}
                  <g transform="translate(10, 0)">
                    {csGateType === "AND" && (
                      <path d="M 110 55 L 145 55 A 45 45 0 0 1 145 145 L 110 145 Z" fill="none" stroke="#f6e05e" strokeWidth="2.5" />
                    )}
                    {csGateType === "OR" && (
                      <path d="M 100 55 Q 120 100 100 145 Q 145 145 185 100 Q 145 55 100 55 Z" fill="none" stroke="#f6e56e" strokeWidth="2.5" />
                    )}
                    {csGateType === "XOR" && (
                      <>
                        <path d="M 105 55 Q 125 100 105 145 Q 150 145 190 100 Q 150 55 105 55 Z" fill="none" stroke="#f6e55e" strokeWidth="2.5" />
                        <path d="M 97 55 Q 117 100 97 145" fill="none" stroke="#f6e55e" strokeWidth="1.8" />
                      </>
                    )}
                    {csGateType === "NAND" && (
                      <>
                        <path d="M 110 55 L 145 55 A 40 40 0 0 1 145 135 L 110 135 Z" fill="none" stroke="#f6e55e" strokeWidth="2.5" />
                        <circle cx="190" cy="95" r="5" fill="none" stroke="#f6e55e" strokeWidth="2" />
                      </>
                    )}
                    <text x="122" y="104" fill="#f6e55e" className="font-mono text-[9px] font-bold uppercase tracking-wider">{csGateType}</text>
                  </g>

                  {/* Output Wire Connection */}
                  <path
                    d={csGateType === "NAND" ? "M 205 95 L 255 95" : "M 195 100 L 255 100"}
                    fill="none"
                    stroke={outVal ? "#34d399" : "#52525b"}
                    strokeWidth="2.5"
                  />

                  {/* Final Output Circle */}
                  <g>
                    <circle cx="270" cy="100" r="14" fill="none" stroke={outVal ? "#34d399" : "#a1a1aa"} strokeWidth="2.5" />
                    <text x="266" y="104" fill={outVal ? "#34d399" : "#a1a1aa"} className="font-mono text-[10px] font-bold">{outVal}</text>
                    <text x="257" y="125" fill="rgba(255,255,255,0.7)" className="font-mono text-[8px] font-bold uppercase">Out Y</text>
                  </g>

                  {/* Equation chalk description below */}
                  <text x="40" y="185" fill="#fde047" className="font-mono text-[8px]" style={{ fontFamily: "monospace" }}>
                    Boolean Formula: Y = {csGateType === "AND" && "A • B"}
                    {csGateType === "OR" && "A + B"}
                    {csGateType === "XOR" && "A ⊕ B"}
                    {csGateType === "NAND" && "!(A • B)"}
                  </text>
                </g>
              );
            })()}
          </svg>
        )}

        {/* 9. ECONOMICS SUPPLY & DEMAND */}
        {diagramType === "econ_supply" && (
          <svg className="w-full max-w-[320px] h-[200px]" viewBox="0 0 320 200">
            {(() => {
              // baseline coordinates
              const yOrigin = 160;
              const xOrigin = 40;
              
              // shifted eq:
              // xE = 150 + (econDemandShift + econSupplyShift) / 2
              // yE = 100 + (econDemandShift - econSupplyShift) / 2
              const xE = 150 + (econDemandShift + econSupplyShift) / 2;
              const yE = 100 + (econDemandShift - econSupplyShift) / 2;

              return (
                <g filter="url(#chalk-roughness)">
                  {/* Axis lines */}
                  <line x1={xOrigin} y1="20" x2={xOrigin} y2={yOrigin} stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" />
                  <line x1={xOrigin} y1={yOrigin} x2="290" y2={yOrigin} stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" />
                  
                  <text x="25" y="25" fill="rgba(255,255,255,0.5)" className="font-mono text-[7px]" style={{ fontFamily: "monospace" }}>Price (P)</text>
                  <text x="260" y="174" fill="rgba(255,255,255,0.5)" className="font-mono text-[7px]" style={{ fontFamily: "monospace" }}>Quant (Q)</text>

                  {/* Reference baseline D0 and S0 (dotted) */}
                  <line x1="50" y1="45" x2="250" y2="155" stroke="rgba(244, 114, 182, 0.25)" strokeWidth="1.2" strokeDasharray="3,3" />
                  <line x1="50" y1="155" x2="250" y2="45" stroke="rgba(96, 165, 250, 0.25)" strokeWidth="1.2" strokeDasharray="3,3" />
                  <text x="250" y="152" fill="rgba(244, 114, 182, 0.3)" className="font-mono text-[7px]" style={{ fontFamily: "monospace" }}>D₀</text>
                  <text x="250" y="52" fill="rgba(96, 165, 250, 0.3)" className="font-mono text-[7px]" style={{ fontFamily: "monospace" }}>S₀</text>

                  {/* Active Demand Curve D1 (Pink) */}
                  <line
                    x1={50 + econDemandShift}
                    y1="45"
                    x2={250 + econDemandShift}
                    y2="155"
                    stroke="#f472b6"
                    strokeWidth="2.5"
                  />
                  <text x={252 + econDemandShift} y="152" fill="#f472b6" className="font-mono text-[8px] font-bold" style={{ fontFamily: "monospace" }}>D₁</text>

                  {/* Active Supply Curve S1 (Blue) */}
                  <line
                    x1={50 + econSupplyShift}
                    y1="155"
                    x2={250 + econSupplyShift}
                    y2="45"
                    stroke="#60a5fa"
                    strokeWidth="2.5"
                  />
                  <text x={252 + econSupplyShift} y="52" fill="#60a5fa" className="font-mono text-[8px] font-bold" style={{ fontFamily: "monospace" }}>S₁</text>

                  {/* Equilibrium Intersection point Projection lines */}
                  <line x1={xOrigin} y1={yE} x2={xE} y2={yE} stroke="#fde047" strokeWidth="1" strokeDasharray="2,2" opacity="0.6" />
                  <line x1={xE} y1={yOrigin} x2={xE} y2={yE} stroke="#fde047" strokeWidth="1" strokeDasharray="2,2" opacity="0.6" />

                  {/* Intersection spot */}
                  <circle cx={xE} cy={yE} r="4.5" fill="#fde047" stroke="#061210" strokeWidth="1" />
                  
                  {/* P* and Q* markers */}
                  <text x="18" y={yE + 3} fill="#fde047" className="font-mono text-[8px] font-bold" style={{ fontFamily: "monospace" }}>P*</text>
                  <text x={xE - 5} y="173" fill="#fde047" className="font-mono text-[8px] font-bold" style={{ fontFamily: "monospace" }}>Q*</text>

                  {/* Equilibrium Label text */}
                  <text x="14" y="193" fill="rgba(253, 224, 71, 0.95)" className="font-mono text-[8px]" style={{ fontFamily: "monospace" }}>
                    Equilibrium: Price shift = {((100 - yE) * 0.5).toFixed(1)}% | Qty shift = {((xE - 150) * 0.5).toFixed(1)}%
                  </text>
                </g>
              );
            })()}
          </svg>
        )}
      </div>

      {/* DYNAMIC LAB SLIDERS & KNOBS (INTERACTION DESK FOR STUDENTS) */}
      <div className="p-3 bg-zinc-900/60 border border-zinc-900 rounded-lg space-y-3 font-mono text-[10px]">
        <div className="flex items-center space-x-2 text-stone-300 font-bold uppercase tracking-wider text-[9px] border-b border-zinc-850 pb-1.5">
          <Sliders className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Interactive Variable Controls (Manipulate values live!):</span>
        </div>

        {/* 1. Quadratic Math Knobs */}
        {diagramType === "math_quad" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <span className="text-zinc-400 flex justify-between">
                <span>Value a (x² coefficient):</span>
                <span className="text-emerald-400 font-bold">{mathA.toFixed(1)}</span>
              </span>
              <input 
                type="range" min="-2.5" max="2.5" step="0.1" value={mathA} 
                onChange={(e) => setMathA(parseFloat(e.target.value))}
                className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <span className="text-zinc-400 flex justify-between">
                <span>Value b (x coefficient):</span>
                <span className="text-[#fde047] font-bold">{mathB.toFixed(1)}</span>
              </span>
              <input 
                type="range" min="-8" max="8" step="0.2" value={mathB} 
                onChange={(e) => setMathB(parseFloat(e.target.value))}
                className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-[#fde047]"
              />
            </div>
            <div className="space-y-1">
              <span className="text-zinc-400 flex justify-between">
                <span>Value c (Y-intercept):</span>
                <span className="text-fuchsia-400 font-bold">{mathC.toFixed(1)}</span>
              </span>
              <input 
                type="range" min="-8" max="8" step="0.2" value={mathC} 
                onChange={(e) => setMathC(parseFloat(e.target.value))}
                className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-fuchsia-400"
              />
            </div>
          </div>
        )}

        {/* 2. Right triangle Knobs */}
        {diagramType === "math_trig" && (
          <div className="space-y-2 max-w-sm">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Angle Tilt (θ degrees):</span>
              <span className="text-emerald-400 font-bold font-mono text-xs">{angle}°</span>
            </div>
            <input 
              type="range" min="5" max="55" value={angle} 
              onChange={(e) => setAngle(parseInt(e.target.value))}
              className="w-full h-1.5 bg-zinc-800 rounded appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        )}

        {/* 3. Ramp Physics Angle Tilt */}
        {diagramType === "physics_ramp" && (
          <div className="space-y-2 max-w-sm">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Ramp Angle Tilt (θ):</span>
              <span className="text-[#60a5fa] font-bold font-mono text-xs">{angle}°</span>
            </div>
            <input 
              type="range" min="10" max="60" value={angle} 
              onChange={(e) => setAngle(parseInt(e.target.value))}
              className="w-full h-1.5 bg-zinc-800 rounded appearance-none cursor-pointer accent-[#60a5fa]"
            />
          </div>
        )}

        {/* 4. Wave Harmonics Knobs */}
        {diagramType === "physics_wave" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-zinc-400 flex justify-between">
                <span>Transverse Wave Amplitude (A):</span>
                <span className="text-yellow-400 font-bold">{waveAmpli}px</span>
              </span>
              <input 
                type="range" min="10" max="75" value={waveAmpli} 
                onChange={(e) => setWaveAmpli(parseInt(e.target.value))}
                className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-yellow-400"
              />
            </div>
            <div className="space-y-1">
              <span className="text-zinc-400 flex justify-between">
                <span>Sine Frequency Harmonics (k):</span>
                <span className="text-rose-400 font-bold">{waveFreq} Hz</span>
              </span>
              <input 
                type="range" min="1" max="5" step="0.5" value={waveFreq} 
                onChange={(e) => setWaveFreq(parseFloat(e.target.value))}
                className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-rose-400"
              />
            </div>
          </div>
        )}

        {/* 5. Chemistry Bohr Orbit Knobs */}
        {diagramType === "chemistry_bohr" && (
          <div className="space-y-2 max-w-md">
            <div className="flex justify-between items-center">
              <span className="text-stone-300">Select Atomic Element (Atomic Number):</span>
              <span className="text-yellow-300 font-bold text-xs font-mono">{atom.name} ({atom.sym}) (Z={atomNumber})</span>
            </div>
            <div className="flex items-center space-x-3">
              <input 
                type="range" min="1" max="10" value={atomNumber} 
                onChange={(e) => setAtomNumber(parseInt(e.target.value))}
                className="flex-1 h-1.5 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
              />
              <span className="text-[8px] text-zinc-500 uppercase">Limit: H (1) to Ne (10)</span>
            </div>
          </div>
        )}

        {/* 6. Molecular Bonds Knobs */}
        {diagramType === "chemistry_lewis" && (
          <div className="space-y-1">
            <span className="text-zinc-400 block mb-1">Select molecular skeletal structures detected on board:</span>
            <div className="flex space-x-2">
              {[
                { label: "Water H₂O", key: "h2o" as const },
                { label: "Carbon Dioxide CO₂", key: "co2" as const },
                { label: "Methane CH₄", key: "ch4" as const }
              ].map((mol) => (
                <button
                  key={mol.label}
                  onClick={() => {
                    setSelectedLewisMolecule(mol.key);
                    if (mol.key === "co2") {
                      setAngle(90);
                    } else {
                      setAngle(45);
                    }
                  }}
                  className={`px-2.5 py-1 border rounded cursor-pointer transition-colors text-[9px] font-mono font-bold ${
                    selectedLewisMolecule === mol.key
                      ? "bg-emerald-900/60 border-emerald-500 text-emerald-200"
                      : "bg-zinc-950 border-zinc-800 hover:border-zinc-750 text-stone-300"
                  }`}
                >
                  {mol.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 7. Biology Engine Interactive Knobs */}
        {diagramType === "bio_cell" && (
          <div className="space-y-3 p-3 bg-zinc-900/30 rounded-lg border border-zinc-900/50">
            {/* Plant & Animal Cell Highlight Selectors */}
            {(bioSubTopic === "plant_cell" || bioSubTopic === "animal_cell") && (
              <div className="space-y-1.5">
                <span className="text-zinc-400 block font-mono text-[9px] uppercase tracking-wider">
                  Highlight {bioSubTopic === "plant_cell" ? "Plant" : "Animal"} Organelle:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: "all" as const, label: "🔍 Show All Structure" },
                    { id: "nucleus" as const, label: "🧠 Focus Nucleus" },
                    { id: "mitochondria" as const, label: "⚡ Focus Mitochondria" },
                    ...(bioSubTopic === "plant_cell" ? [
                      { id: "vacuole" as const, label: "💧 Focus Vacuole" },
                      { id: "chloroplast" as const, label: "☀️ Focus Chloroplast" }
                    ] : [])
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setBioFocus(opt.id)}
                      className={`px-2 py-1 text-[9px] font-mono font-bold rounded border transition-colors cursor-pointer ${
                        bioFocus === opt.id
                          ? "bg-emerald-900/60 border-emerald-500 text-emerald-200"
                          : "bg-zinc-950 border-zinc-850 hover:border-zinc-750 text-zinc-400 hover:text-white"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* DNA Unwinding Torsion slider */}
            {bioSubTopic === "dna" && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-zinc-400 font-mono text-[9px] uppercase tracking-wider">
                  <span>DNA Double Helix Unwinding Torsion:</span>
                  <span className="text-emerald-400 font-bold">{dnaUnwind}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="2"
                  value={dnaUnwind}
                  onChange={(e) => setDnaUnwind(parseInt(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
                />
                <span className="text-[8px] text-zinc-500 font-mono block">
                  * Move slider to rotate or wind/unwind the base-paired strands.
                </span>
              </div>
            )}

            {/* Photosynthesis interactive description */}
            {bioSubTopic === "photosynthesis" && (
              <div className="space-y-1.5 text-[10px] font-mono leading-relaxed text-zinc-300">
                <span className="text-zinc-400 block font-mono text-[9px] uppercase tracking-wider">
                  🌿 Botany Photosynthesis Reaction Mechanics:
                </span>
                <p>
                  Chlorophyll pigments inside Thylakoid membranes absorb <strong className="text-yellow-300">Sunlight (hν)</strong>, triggering photolysis of <strong className="text-sky-300">H₂O</strong> (releasing oxygen byproduct) and driving the synthesis of ATP and NADPH to fix <strong className="text-purple-300">CO₂</strong> into energy-rich sugars.
                </p>
              </div>
            )}

            {/* Neuron Signal interactive speed */}
            {bioSubTopic === "neuron" && (
              <div className="space-y-1 text-[10px] font-mono text-zinc-300">
                <span className="text-zinc-400 block font-mono text-[9px] uppercase tracking-wider">
                  🧠 Zoology Neural Transmission (Action Potential):
                </span>
                <p className="leading-normal">
                  The electrical impulse (Action Potential) travels down the <strong className="text-pink-300">Axon</strong>. The insulated <strong className="text-yellow-300">Myelin Sheaths</strong> force the signal to jump from node to node (Saltatory Conduction), maximizing velocity!
                </p>
              </div>
            )}
          </div>
        )}

        {/* 8. CS Logic Circuits Gates Sim */}
        {diagramType === "cs_logic" && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-4 border-b border-zinc-850 pb-2">
              <div className="space-y-1">
                <span className="text-zinc-400 block font-mono text-[8.5px] uppercase">Toggle Inputs:</span>
                <div className="flex space-x-1.5">
                  <button
                    onClick={() => setCsInputA(csInputA === 1 ? 0 : 1)}
                    className={`px-2.5 py-1 text-[9px] font-mono font-black border rounded cursor-pointer ${
                      csInputA ? "bg-emerald-950 border-emerald-500 text-emerald-300" : "bg-zinc-950 border-zinc-800 text-zinc-500"
                    }`}
                  >
                    Input A = {csInputA}
                  </button>
                  <button
                    onClick={() => setCsInputB(csInputB === 1 ? 0 : 1)}
                    className={`px-2.5 py-1 text-[9px] font-mono font-black border rounded cursor-pointer ${
                      csInputB ? "bg-emerald-950 border-emerald-500 text-emerald-300" : "bg-zinc-950 border-zinc-800 text-zinc-500"
                    }`}
                  >
                    Input B = {csInputB}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-zinc-400 block font-mono text-[8.5px] uppercase">Select Logic Operator Gate:</span>
                <div className="flex space-x-1">
                  {(["AND", "OR", "XOR", "NAND"] as const).map((gate) => (
                    <button
                      key={gate}
                      onClick={() => setCsGateType(gate)}
                      className={`px-2 py-1 text-[9px] font-mono font-bold rounded border transition-colors cursor-pointer ${
                        csGateType === gate
                          ? "bg-yellow-950/40 border-yellow-500 text-yellow-300"
                          : "bg-zinc-950 border-zinc-850 hover:border-zinc-750 text-zinc-400"
                      }`}
                    >
                      {gate}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 9. Economic Equilibrium Curve Shifts */}
        {diagramType === "econ_supply" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-zinc-400 flex justify-between">
                <span>Demand Shift (D₁):</span>
                <span className="text-pink-400 font-bold font-mono">
                  {econDemandShift === 0 ? "No Shift" : econDemandShift > 0 ? `+${(econDemandShift * 0.5).toFixed(0)}% Right` : `${(econDemandShift * 0.5).toFixed(0)}% Left`}
                </span>
              </span>
              <input
                type="range"
                min="-40"
                max="40"
                step="5"
                value={econDemandShift}
                onChange={(e) => setEconDemandShift(parseInt(e.target.value))}
                className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-pink-500"
              />
            </div>

            <div className="space-y-1">
              <span className="text-zinc-400 flex justify-between">
                <span>Supply Shift (S₁):</span>
                <span className="text-blue-400 font-bold font-mono">
                  {econSupplyShift === 0 ? "No Shift" : econSupplyShift > 0 ? `+${(econSupplyShift * 0.5).toFixed(0)}% Right` : `${(econSupplyShift * 0.5).toFixed(0)}% Left`}
                </span>
              </span>
              <input
                type="range"
                min="-40"
                max="40"
                step="5"
                value={econSupplyShift}
                onChange={(e) => setEconSupplyShift(parseInt(e.target.value))}
                className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-400"
              />
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
