import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Headphones, Volume2, Music, Sparkles, Brain, HelpCircle, Activity, Info } from "lucide-react";

interface AmbientFocusAudioProps {
  primaryColor: string;
  accentColor: string;
  compact?: boolean;
}

type SoundtrackType = "none" | "lofi" | "piano" | "nature";

export default function AmbientFocusAudio({
  primaryColor,
  accentColor,
  compact = false,
}: AmbientFocusAudioProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [soundtrack, setSoundtrack] = useState<SoundtrackType>("none");
  const [focusWaveActive, setFocusWaveActive] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.7); // 0 to 1
  const [waveVolume, setWaveVolume] = useState(0.6);  // 0 to 1
  const [isPlaying, setIsPlaying] = useState(false);

  // Web Audio Nodes refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const waveGainRef = useRef<GainNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);

  // Focus Wave Oscillator ref
  const focusOscRef = useRef<OscillatorNode | null>(null);

  // Soundtrack-specific refs
  const pianoTimerRef = useRef<any>(null);
  const pianoOscsRef = useRef<OscillatorNode[]>([]);
  
  const lofiTimerRef = useRef<any>(null);
  const lofiOscsRef = useRef<OscillatorNode[]>([]);
  const lofiCrackleSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const lofiCrackleGainRef = useRef<GainNode | null>(null);

  const natureSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const natureFilterRef = useRef<BiquadFilterNode | null>(null);
  const natureLfoRef = useRef<OscillatorNode | null>(null);

  // Visualizer mini-canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Initialize Web Audio API on-demand (user gesture)
  const initAudio = () => {
    if (audioCtxRef.current) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;

      // Master Gain
      const master = ctx.createGain();
      master.gain.setValueAtTime(1.0, ctx.currentTime);
      master.connect(ctx.destination);
      masterGainRef.current = master;

      // 40Hz Wave Gain
      const wGain = ctx.createGain();
      wGain.gain.setValueAtTime(0, ctx.currentTime);
      wGain.connect(master);
      waveGainRef.current = wGain;

      // Soundtrack Gain
      const mGain = ctx.createGain();
      mGain.gain.setValueAtTime(0, ctx.currentTime);
      mGain.connect(master);
      musicGainRef.current = mGain;
    } catch (e) {
      console.error("Failed to initialize Web Audio API:", e);
    }
  };

  // Safe resume context helper
  const resumeContext = async () => {
    initAudio();
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === "suspended") {
      await ctx.resume();
    }
  };

  // Handle master play toggle
  const togglePlay = async () => {
    await resumeContext();
    setIsPlaying((prev) => !prev);
  };

  // Update Volumes
  useEffect(() => {
    if (waveGainRef.current && audioCtxRef.current) {
      const targetGain = focusWaveActive && isPlaying ? waveVolume * 0.5 : 0;
      waveGainRef.current.gain.setTargetAtTime(targetGain, audioCtxRef.current.currentTime, 0.1);
    }
  }, [waveVolume, focusWaveActive, isPlaying]);

  useEffect(() => {
    if (musicGainRef.current && audioCtxRef.current) {
      const targetGain = soundtrack !== "none" && isPlaying ? musicVolume * 1.0 : 0;
      musicGainRef.current.gain.setTargetAtTime(targetGain, audioCtxRef.current.currentTime, 0.15);
    }
  }, [musicVolume, soundtrack, isPlaying]);

  // Handle 40Hz focus oscillator lifecycle
  useEffect(() => {
    if (!audioCtxRef.current || !waveGainRef.current) return;

    const ctx = audioCtxRef.current;

    if (focusWaveActive && isPlaying) {
      // Start 40Hz oscillator
      if (!focusOscRef.current) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(40, ctx.currentTime); // Scientifically proven concentration frequency
        osc.connect(waveGainRef.current);
        osc.start();
        focusOscRef.current = osc;
      }
    } else {
      // Stop oscillator
      if (focusOscRef.current) {
        try {
          focusOscRef.current.stop();
          focusOscRef.current.disconnect();
        } catch (e) {}
        focusOscRef.current = null;
      }
    }
  }, [focusWaveActive, isPlaying]);

  // Clean up helper for calm piano
  const clearPianoNodes = () => {
    if (pianoTimerRef.current) {
      clearInterval(pianoTimerRef.current);
      pianoTimerRef.current = null;
    }
    pianoOscsRef.current.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (e) {}
    });
    pianoOscsRef.current = [];
  };

  // Clean up helper for lofi
  const clearLofiNodes = () => {
    if (lofiTimerRef.current) {
      clearInterval(lofiTimerRef.current);
      lofiTimerRef.current = null;
    }
    lofiOscsRef.current.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (e) {}
    });
    lofiOscsRef.current = [];

    if (lofiCrackleSourceRef.current) {
      try {
        lofiCrackleSourceRef.current.stop();
        lofiCrackleSourceRef.current.disconnect();
      } catch (e) {}
      lofiCrackleSourceRef.current = null;
    }
    if (lofiCrackleGainRef.current) {
      lofiCrackleGainRef.current.disconnect();
      lofiCrackleGainRef.current = null;
    }
  };

  // Clean up helper for nature
  const clearNatureNodes = () => {
    if (natureSourceRef.current) {
      try {
        natureSourceRef.current.stop();
        natureSourceRef.current.disconnect();
      } catch (e) {}
      natureSourceRef.current = null;
    }
    if (natureLfoRef.current) {
      try {
        natureLfoRef.current.stop();
        natureLfoRef.current.disconnect();
      } catch (e) {}
      natureLfoRef.current = null;
    }
    if (natureFilterRef.current) {
      natureFilterRef.current.disconnect();
      natureFilterRef.current = null;
    }
  };

  // Play a single calm synth-piano note with elegant envelopes
  const playCalmPianoNote = (freq: number, duration: number = 3.5) => {
    const ctx = audioCtxRef.current;
    const dest = musicGainRef.current;
    if (!ctx || !dest) return;

    try {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const noteGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Create rich dual-voice warm sound
      osc1.type = "sine";
      osc2.type = "triangle";
      
      osc1.frequency.setValueAtTime(freq, ctx.currentTime);
      osc2.frequency.setValueAtTime(freq * 1.002, ctx.currentTime); // Subtle detuning for lush chorus effect

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1100, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(250, ctx.currentTime + duration);

      noteGain.gain.setValueAtTime(0, ctx.currentTime);
      noteGain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.1); // Clear attack
      noteGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration); // Long, peaceful release

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(noteGain);
      noteGain.connect(dest);

      osc1.start();
      osc2.start();
      
      pianoOscsRef.current.push(osc1, osc2);

      // Remove from active nodes array when finished
      setTimeout(() => {
        try {
          osc1.stop();
          osc2.stop();
          osc1.disconnect();
          osc2.disconnect();
          pianoOscsRef.current = pianoOscsRef.current.filter(o => o !== osc1 && o !== osc2);
        } catch (e) {}
      }, duration * 1000 + 100);
    } catch (e) {}
  };

  // Play lofi chord notes with dusty lowpass filters
  const playLofiChord = (notes: number[], duration: number = 4.0) => {
    const ctx = audioCtxRef.current;
    const dest = musicGainRef.current;
    if (!ctx || !dest) return;

    try {
      const chordOscs: OscillatorNode[] = [];
      const chordGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(750, ctx.currentTime); // Cozy, warm lofi cutoff

      chordGain.gain.setValueAtTime(0, ctx.currentTime);
      chordGain.gain.linearRampToValueAtTime(0.30, ctx.currentTime + 0.3); // Slow attack pads
      chordGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = idx === 0 ? "sine" : "triangle"; // sine bass, triangle mid-high
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc.connect(filter);
        osc.start();
        chordOscs.push(osc);
        lofiOscsRef.current.push(osc);
      });

      filter.connect(chordGain);
      chordGain.connect(dest);

      setTimeout(() => {
        chordOscs.forEach((osc) => {
          try {
            osc.stop();
            osc.disconnect();
            lofiOscsRef.current = lofiOscsRef.current.filter(o => o !== osc);
          } catch (e) {}
        });
      }, duration * 1000 + 100);
    } catch (e) {}
  };

  // Create a procedural tape crackle noise buffer for LoFi
  const playLofiCrackle = () => {
    const ctx = audioCtxRef.current;
    const dest = musicGainRef.current;
    if (!ctx || !dest) return;

    try {
      const bufferSize = ctx.sampleRate * 2.5; // 2.5 seconds loop
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Generate cozy old-record crackles (mostly silence with sparse static pops)
      for (let i = 0; i < bufferSize; i++) {
        if (Math.random() < 0.0002) {
          data[i] = (Math.random() * 2 - 1) * 0.3;
        } else {
          // Subtle warm low background tape hiss
          data[i] = (Math.random() * 2 - 1) * 0.005;
        }
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1200; // Muffled record crackle band
      filter.Q.value = 1.0;

      const crackleGain = ctx.createGain();
      crackleGain.gain.setValueAtTime(0.20, ctx.currentTime);

      source.connect(filter);
      filter.connect(crackleGain);
      crackleGain.connect(dest);
      source.start();

      lofiCrackleSourceRef.current = source;
      lofiCrackleGainRef.current = crackleGain;
    } catch (e) {}
  };

  // Generate a procedural sea breeze / nature wind sound via bandpass filtered noise & LFO modulation
  const playNatureBreeze = () => {
    const ctx = audioCtxRef.current;
    const dest = musicGainRef.current;
    if (!ctx || !dest) return;

    try {
      const bufferSize = ctx.sampleRate * 3; // 3 second noise buffer
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 450;
      filter.Q.value = 1.0;

      // Create a very slow LFO to oscillate/sweep the filter cutoff frequency (making it sound like waves/wind)
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.06, ctx.currentTime); // 0.06 Hz - sweep every 16 seconds

      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(220, ctx.currentTime); // Sweep between 230Hz and 670Hz

      const breezeGain = ctx.createGain();
      breezeGain.gain.setValueAtTime(0.45, ctx.currentTime);

      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      source.connect(filter);
      filter.connect(breezeGain);
      breezeGain.connect(dest);

      lfo.start();
      source.start();

      natureSourceRef.current = source;
      natureFilterRef.current = filter;
      natureLfoRef.current = lfo;
    } catch (e) {}
  };

  // Start soundscapes depending on selection
  useEffect(() => {
    if (!audioCtxRef.current || !isPlaying) {
      clearPianoNodes();
      clearLofiNodes();
      clearNatureNodes();
      return;
    }

    const ctx = audioCtxRef.current;

    if (soundtrack === "piano") {
      clearLofiNodes();
      clearNatureNodes();

      // Slow, beautiful peaceful pentatonic scale notes (A minor/C major pentatonic)
      const pianoNotes = [110, 130.81, 146.83, 164.81, 196.0, 220, 261.63, 293.66, 329.63, 392.0, 440, 523.25, 659.25];
      
      const triggerPianoInterval = () => {
        // Play 1 or 2 random notes
        const noteCount = Math.random() > 0.6 ? 2 : 1;
        for (let i = 0; i < noteCount; i++) {
          const randomNote = pianoNotes[Math.floor(Math.random() * pianoNotes.length)];
          const delay = i * (200 + Math.random() * 300); // slight stagger if playing 2 notes
          setTimeout(() => {
            if (isPlaying && soundtrack === "piano") {
              playCalmPianoNote(randomNote, 4.0 + Math.random() * 2);
            }
          }, delay);
        }
      };

      // Play immediately, then loop
      triggerPianoInterval();
      pianoTimerRef.current = setInterval(triggerPianoInterval, 4000);

    } else if (soundtrack === "lofi") {
      clearPianoNodes();
      clearNatureNodes();

      // Play record vinyl crackle loop
      playLofiCrackle();

      // Soft warm lowpassed Rhodes chord progressions
      // Progression: Am9 -> Dm9 -> G13 -> Cmaj9
      const progressions = [
        [110, 261.63, 329.63, 392.0, 493.88], // Am9
        [146.83, 349.23, 440.0, 523.25, 659.25], // Dm9
        [98.0, 246.94, 349.23, 440.0, 659.25], // G13
        [130.81, 329.63, 392.0, 493.88, 587.33] // Cmaj9
      ];

      let chordIndex = 0;
      const triggerLofiProgression = () => {
        const chord = progressions[chordIndex];
        playLofiChord(chord, 4.5);
        chordIndex = (chordIndex + 1) % progressions.length;
      };

      // Play immediately, then loop every 5 seconds
      triggerLofiProgression();
      lofiTimerRef.current = setInterval(triggerLofiProgression, 5000);

    } else if (soundtrack === "nature") {
      clearPianoNodes();
      clearLofiNodes();

      // Generate procedural nature wind & sea ocean wave soundscapes
      playNatureBreeze();
    } else {
      clearPianoNodes();
      clearLofiNodes();
      clearNatureNodes();
    }

    return () => {
      clearPianoNodes();
      clearLofiNodes();
      clearNatureNodes();
    };
  }, [soundtrack, isPlaying]);

  // Handle master unmount cleanup
  useEffect(() => {
    return () => {
      clearPianoNodes();
      clearLofiNodes();
      clearNatureNodes();
      if (focusOscRef.current) {
        try { focusOscRef.current.stop(); } catch (e) {}
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (e) {}
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // Mini-Visualizer Animation for the 40Hz / Music waves
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let phase = 0;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      ctx.beginPath();
      ctx.strokeStyle = accentColor || "#c4f500";
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.8;

      const activeState = isPlaying && (focusWaveActive || soundtrack !== "none");
      const currentAmplitude = activeState ? (focusWaveActive ? 12 : 6) : 2;
      const frequency = focusWaveActive ? 0.08 : 0.04;
      const speed = focusWaveActive ? 0.06 : 0.02;

      phase += speed;

      for (let x = 0; x < width; x++) {
        const envelope = Math.sin((x / width) * Math.PI);
        const y = centerY + Math.sin(x * frequency - phase) * currentAmplitude * envelope;
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, focusWaveActive, soundtrack, accentColor]);

  return (
    <div className="relative inline-block" id="ambient-focus-audio-widget">
      {/* Headphones Activation Button */}
      <button
        onClick={() => {
          resumeContext();
          setIsOpen(!isOpen);
        }}
        className={`${compact ? "w-8 h-8 xs:w-8.5 xs:h-8.5 sm:w-10 sm:h-10 rounded-xl bg-white border border-slate-200/90 shadow-2xs" : "p-2 rounded-xl bg-white border border-slate-200"} active:scale-95 transition-all duration-200 cursor-pointer flex items-center justify-center relative shrink-0 ${
          isOpen 
            ? "bg-slate-100 text-[#0a3641] border-slate-300 ring-2 ring-[#0a3641]/10" 
            : isPlaying && (focusWaveActive || soundtrack !== "none")
              ? "bg-emerald-50 text-emerald-700 font-bold border-emerald-300"
              : "text-slate-700 hover:bg-slate-100 hover:text-[#0a3641]"
        }`}
        title="Study Focus & Background Sounds 🎧"
      >
        <Headphones className={`${compact ? "w-3.5 h-3.5 xs:w-4 xs:h-4 sm:w-4.5 sm:h-4.5" : "w-4.5 h-4.5"} ${isPlaying && (focusWaveActive || soundtrack !== "none") ? "animate-bounce-short" : ""}`} />
        {isPlaying && (focusWaveActive || soundtrack !== "none") && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
        )}
      </button>

      {/* Popover Floating Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop click closer */}
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 mt-2.5 w-76 bg-white border border-slate-200 rounded-2xl shadow-xl p-4.5 z-50 text-left font-sans text-slate-800"
              style={{
                boxShadow: "0 10px 30px rgba(10, 54, 65, 0.12), 0 1px 3px rgba(0, 0, 0, 0.02)"
              }}
            >
              {/* Header Title with cute status line */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-[#0a3641]/5 text-[#0a3641]">
                    <Brain className="w-4 h-4 text-[#0a3641]" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-[#0a3641] uppercase tracking-wide">
                      Study Focus Audio
                    </h4>
                    <p className="text-[7.5px] font-mono text-slate-400 uppercase tracking-widest mt-0.5 font-bold">
                      Procedural Synthesizers
                    </p>
                  </div>
                </div>

                {/* Main Audio Toggle Button */}
                <button
                  onClick={togglePlay}
                  className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase transition-all tracking-wider active:scale-95 cursor-pointer flex items-center gap-1 ${
                    isPlaying
                      ? "bg-rose-50 text-rose-600 border border-rose-200"
                      : "bg-[#0a3641] text-[#c4f505] shadow-sm"
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <span className="w-1 h-1 rounded-full bg-rose-500 animate-ping" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <span>Play</span>
                  )}
                </button>
              </div>

              {/* Informative Note */}
              <p className="text-[9px] text-[#486a73] leading-relaxed mb-3 flex items-start gap-1 font-medium bg-slate-50 p-2 rounded-lg border border-slate-100/50">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
                <span>
                  Cherry Ma'am ke lecture ke samay focus badhane ke liye <strong>40 Hz Monaural wave (Gamma frequency)</strong> background sound ke sath play karein!
                </span>
              </p>

              {/* Soundtrack Selector */}
              <div className="space-y-1.5 mb-3.5">
                <label className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest block mb-1">
                  1. Focus Soundtrack
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: "none", label: "Silence 🤫", desc: "No Background" },
                    { id: "lofi", label: "Study Lofi 🎧", desc: "Cozy Tape Chords" },
                    { id: "piano", label: "Calm Piano 🎹", desc: "Slow Pentatonic" },
                    { id: "nature", label: "Nature Conc. 🍃", desc: "Procedural Breeze" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        resumeContext();
                        setSoundtrack(item.id as SoundtrackType);
                        if (!isPlaying) setIsPlaying(true);
                      }}
                      className={`p-1.5 text-left rounded-xl border transition-all cursor-pointer ${
                        soundtrack === item.id
                          ? "border-[#0a3641] bg-[#0a3641]/5 text-[#0a3641] font-bold"
                          : "border-slate-100 hover:border-slate-200 hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      <div className="text-[10px] leading-tight font-sans">{item.label}</div>
                      <div className="text-[7.5px] font-mono text-slate-400 font-semibold mt-0.5 leading-none">
                        {item.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Soundtrack volume slider */}
              {soundtrack !== "none" && (
                <div className="space-y-1 mb-3.5 bg-[#0a3641]/2.5 p-2 rounded-xl border border-slate-100">
                  <div className="flex items-center justify-between text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wide">
                    <span className="flex items-center gap-1">
                      <Music className="w-3 h-3 text-[#0a3641]" /> Sound Volume
                    </span>
                    <span>{Math.round(musicVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                    className="w-full h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#0a3641]"
                  />
                </div>
              )}

              {/* 40Hz Monaural Wave Controller */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-[9.5px] font-sans font-black text-[#0a3641] uppercase tracking-wide flex items-center gap-1">
                      <Brain className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                      40 Hz Focus Wave
                    </label>
                    <p className="text-[7.5px] font-mono text-slate-400 uppercase tracking-widest mt-0.5 font-bold">
                      Gamma Concentration Beat
                    </p>
                  </div>
                  
                  {/* Toggle Switch */}
                  <button
                    onClick={() => {
                      resumeContext();
                      setFocusWaveActive(!focusWaveActive);
                      if (!isPlaying) setIsPlaying(true);
                    }}
                    className={`w-8.5 h-5 rounded-full p-0.5 transition-colors cursor-pointer duration-200 focus:outline-none ${
                      focusWaveActive ? "bg-emerald-500" : "bg-slate-200"
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                        focusWaveActive ? "translate-x-3.5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Wave Volume Slider */}
                {focusWaveActive && (
                  <div className="space-y-1 bg-emerald-50/50 p-2 rounded-xl border border-emerald-100/40">
                    <div className="flex items-center justify-between text-[9px] font-mono font-bold text-emerald-700 uppercase tracking-wide">
                      <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3 text-emerald-500" /> Wave Strength
                      </span>
                      <span>{Math.round(waveVolume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={waveVolume}
                      onChange={(e) => setWaveVolume(parseFloat(e.target.value))}
                      className="w-full h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>
                )}
              </div>

              {/* Wave Animated Visualizer mini-box */}
              <div className="mt-3.5 h-6 bg-slate-950 rounded-xl overflow-hidden relative flex items-center justify-between px-3 border border-slate-900 shadow-inner">
                <span className="text-[8px] font-mono text-slate-400 font-bold uppercase tracking-widest">
                  {isPlaying 
                    ? focusWaveActive 
                      ? "40Hz Gamma Beat Active ⚡" 
                      : soundtrack !== "none"
                        ? "Ambient Stream Active 🎧"
                        : "Focus Engine Ready 🤫"
                    : "Engine Standby 😴"}
                </span>
                <canvas
                  ref={canvasRef}
                  width="100"
                  height="24"
                  className="w-20 h-full opacity-90"
                />
              </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
