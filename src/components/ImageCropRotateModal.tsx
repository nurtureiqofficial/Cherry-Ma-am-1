import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  RotateCw, RotateCcw, Check, X, Crop, RefreshCw, ZoomIn, ZoomOut, 
  Maximize2, Move, Sparkles, CheckCircle2
} from "lucide-react";

interface ImageCropRotateModalProps {
  imageSrc: string;
  onComplete: (croppedDataUrl: string, croppedFile: File) => void;
  onCancel: () => void;
}

interface CropRect {
  x: number;      // percentage (0 - 100)
  y: number;      // percentage (0 - 100)
  width: number;  // percentage (0 - 100)
  height: number; // percentage (0 - 100)
}

export const ImageCropRotateModal: React.FC<ImageCropRotateModalProps> = ({
  imageSrc,
  onComplete,
  onCancel,
}) => {
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270
  const [crop, setCrop] = useState<CropRect>({ x: 5, y: 5, width: 90, height: 90 });
  const [aspectPreset, setAspectPreset] = useState<"free" | "1:1" | "4:3" | "3:4" | "A4">("free");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragInfoRef = useRef<{
    handle: string;
    startX: number;
    startY: number;
    initialCrop: CropRect;
  } | null>(null);

  // Rotate functions
  const rotateRight = () => setRotation((prev) => (prev + 90) % 360);
  const rotateLeft = () => setRotation((prev) => (prev - 90 + 360) % 360);
  const resetAll = () => {
    setRotation(0);
    setCrop({ x: 5, y: 5, width: 90, height: 90 });
    setAspectPreset("free");
  };

  // Handle aspect ratio adjustments
  const applyAspectPreset = (preset: "free" | "1:1" | "4:3" | "3:4" | "A4") => {
    setAspectPreset(preset);
    if (preset === "free") return;

    let targetRatio = 1;
    if (preset === "1:1") targetRatio = 1;
    if (preset === "4:3") targetRatio = 4 / 3;
    if (preset === "3:4") targetRatio = 3 / 4;
    if (preset === "A4") targetRatio = 1 / 1.414;

    // Adjust crop height/width to fit container aspect ratio
    let newW = 80;
    let newH = newW / targetRatio;
    if (newH > 80) {
      newH = 80;
      newW = newH * targetRatio;
    }

    setCrop({
      x: Math.max(0, (100 - newW) / 2),
      y: Math.max(0, (100 - newH) / 2),
      width: Math.min(100, newW),
      height: Math.min(100, newH),
    });
  };

  // Mouse / Touch Drag handlers for Cropping Box
  const handlePointerDown = (handle: string, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragInfoRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: { ...crop },
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragInfoRef.current || !containerRef.current) return;
    const { handle, startX, startY, initialCrop } = dragInfoRef.current;
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const deltaXPercent = ((e.clientX - startX) / rect.width) * 100;
    const deltaYPercent = ((e.clientY - startY) / rect.height) * 100;

    let newCrop = { ...initialCrop };

    if (handle === "move") {
      newCrop.x = Math.max(0, Math.min(100 - initialCrop.width, initialCrop.x + deltaXPercent));
      newCrop.y = Math.max(0, Math.min(100 - initialCrop.height, initialCrop.y + deltaYPercent));
    } else {
      if (handle.includes("e")) {
        newCrop.width = Math.max(10, Math.min(100 - initialCrop.x, initialCrop.width + deltaXPercent));
      }
      if (handle.includes("s")) {
        newCrop.height = Math.max(10, Math.min(100 - initialCrop.y, initialCrop.height + deltaYPercent));
      }
      if (handle.includes("w")) {
        const possibleWidth = initialCrop.width - deltaXPercent;
        if (possibleWidth >= 10 && initialCrop.x + deltaXPercent >= 0) {
          newCrop.x = initialCrop.x + deltaXPercent;
          newCrop.width = possibleWidth;
        }
      }
      if (handle.includes("n")) {
        const possibleHeight = initialCrop.height - deltaYPercent;
        if (possibleHeight >= 10 && initialCrop.y + deltaYPercent >= 0) {
          newCrop.y = initialCrop.y + deltaYPercent;
          newCrop.height = possibleHeight;
        }
      }
    }

    setCrop(newCrop);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragInfoRef.current) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore pointer release errors
      }
      dragInfoRef.current = null;
    }
  };

  // Perform rotation & crop using Offscreen Canvas
  const processCropAndExport = async () => {
    setIsProcessing(true);

    try {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = imageSrc;

      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });

      // 1. Create canvas for original image + rotation
      const rotCanvas = document.createElement("canvas");
      const rotCtx = rotCanvas.getContext("2d");
      if (!rotCtx) throw new Error("Could not create canvas context");

      const isLandscapeRotated = rotation === 90 || rotation === 270;
      rotCanvas.width = isLandscapeRotated ? image.naturalHeight : image.naturalWidth;
      rotCanvas.height = isLandscapeRotated ? image.naturalWidth : image.naturalHeight;

      rotCtx.save();
      rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
      rotCtx.rotate((rotation * Math.PI) / 180);
      rotCtx.drawImage(
        image,
        -image.naturalWidth / 2,
        -image.naturalHeight / 2
      );
      rotCtx.restore();

      // 2. Crop from rotated canvas
      const cropX = (crop.x / 100) * rotCanvas.width;
      const cropY = (crop.y / 100) * rotCanvas.height;
      const cropW = (crop.width / 100) * rotCanvas.width;
      const cropH = (crop.height / 100) * rotCanvas.height;

      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = Math.max(1, Math.round(cropW));
      finalCanvas.height = Math.max(1, Math.round(cropH));

      const finalCtx = finalCanvas.getContext("2d");
      if (!finalCtx) throw new Error("Could not create final context");

      finalCtx.drawImage(
        rotCanvas,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        finalCanvas.width,
        finalCanvas.height
      );

      const croppedDataUrl = finalCanvas.toDataURL("image/jpeg", 0.92);

      // Convert to File
      const blob = await (await fetch(croppedDataUrl)).blob();
      const croppedFile = new File([blob], `homework_photo_${Date.now()}.jpg`, {
        type: "image/jpeg",
      });

      onComplete(croppedDataUrl, croppedFile);
    } catch (err) {
      console.error("Crop/rotate error:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-950/90 backdrop-blur-md flex flex-col justify-between p-2 sm:p-4 animate-in fade-in duration-200">
      
      {/* Top Header Bar */}
      <div className="flex items-center justify-between text-white bg-slate-900/80 px-4 py-3 rounded-2xl border border-slate-800 shadow-lg">
        <div className="flex items-center gap-2">
          <Crop className="w-5 h-5 text-emerald-400" />
          <h3 className="font-bold text-sm sm:text-base tracking-tight text-slate-100">
            Crop & Rotate Homework Photo
          </h3>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Image Cropping Canvas Container */}
      <div className="flex-1 my-3 relative flex items-center justify-center overflow-hidden select-none">
        <div
          ref={containerRef}
          className="relative max-w-full max-h-[60vh] sm:max-h-[68vh] flex items-center justify-center border border-slate-800 rounded-xl overflow-hidden shadow-2xl bg-black/50"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Base Rotated Image */}
          <img
            ref={imgRef}
            src={imageSrc}
            alt="To crop"
            className="max-w-full max-h-[60vh] sm:max-h-[68vh] object-contain transition-transform duration-300 pointer-events-none"
            style={{ transform: `rotate(${rotation}deg)` }}
          />

          {/* Semi-transparent Overlay over non-cropped region */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Top mask */}
            <div
              className="absolute bg-black/60 inset-x-0 top-0"
              style={{ height: `${crop.y}%` }}
            />
            {/* Bottom mask */}
            <div
              className="absolute bg-black/60 inset-x-0 bottom-0"
              style={{ height: `${100 - (crop.y + crop.height)}%` }}
            />
            {/* Left mask */}
            <div
              className="absolute bg-black/60 left-0"
              style={{
                top: `${crop.y}%`,
                height: `${crop.height}%`,
                width: `${crop.x}%`,
              }}
            />
            {/* Right mask */}
            <div
              className="absolute bg-black/60 right-0"
              style={{
                top: `${crop.y}%`,
                height: `${crop.height}%`,
                width: `${100 - (crop.x + crop.width)}%`,
              }}
            />
          </div>

          {/* Active Interactive Crop Box */}
          <div
            className="absolute border-2 border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)] cursor-move group"
            style={{
              left: `${crop.x}%`,
              top: `${crop.y}%`,
              width: `${crop.width}%`,
              height: `${crop.height}%`,
            }}
            onPointerDown={(e) => handlePointerDown("move", e)}
          >
            {/* Rule of Thirds Grid Lines */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
              <div className="border-r border-b border-emerald-400/30" />
              <div className="border-r border-b border-emerald-400/30" />
              <div className="border-b border-emerald-400/30" />
              <div className="border-r border-b border-emerald-400/30" />
              <div className="border-r border-b border-emerald-400/30" />
              <div className="border-b border-emerald-400/30" />
              <div className="border-r border-emerald-400/30" />
              <div className="border-r border-emerald-400/30" />
              <div />
            </div>

            {/* Corner Drag Handles */}
            <div
              className="absolute -top-2.5 -left-2.5 w-6 h-6 bg-white border-2 border-emerald-500 rounded-full shadow-md cursor-nwse-resize touch-none"
              onPointerDown={(e) => handlePointerDown("nw", e)}
            />
            <div
              className="absolute -top-2.5 -right-2.5 w-6 h-6 bg-white border-2 border-emerald-500 rounded-full shadow-md cursor-nesw-resize touch-none"
              onPointerDown={(e) => handlePointerDown("ne", e)}
            />
            <div
              className="absolute -bottom-2.5 -left-2.5 w-6 h-6 bg-white border-2 border-emerald-500 rounded-full shadow-md cursor-nesw-resize touch-none"
              onPointerDown={(e) => handlePointerDown("sw", e)}
            />
            <div
              className="absolute -bottom-2.5 -right-2.5 w-6 h-6 bg-white border-2 border-emerald-500 rounded-full shadow-md cursor-nwse-resize touch-none"
              onPointerDown={(e) => handlePointerDown("se", e)}
            />

            {/* Edge Drag Handles */}
            <div
              className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-3 bg-white/90 border border-emerald-500 rounded-full cursor-ns-resize touch-none"
              onPointerDown={(e) => handlePointerDown("n", e)}
            />
            <div
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-3 bg-white/90 border border-emerald-500 rounded-full cursor-ns-resize touch-none"
              onPointerDown={(e) => handlePointerDown("s", e)}
            />
            <div
              className="absolute top-1/2 -left-2 -translate-y-1/2 w-3 h-8 bg-white/90 border border-emerald-500 rounded-full cursor-ew-resize touch-none"
              onPointerDown={(e) => handlePointerDown("w", e)}
            />
            <div
              className="absolute top-1/2 -right-2 -translate-y-1/2 w-3 h-8 bg-white/90 border border-emerald-500 rounded-full cursor-ew-resize touch-none"
              onPointerDown={(e) => handlePointerDown("e", e)}
            />
          </div>
        </div>
      </div>

      {/* Control Tools Bar */}
      <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl space-y-3 shadow-xl">
        
        {/* Aspect Ratio Presets */}
        <div className="flex items-center justify-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
          <span className="text-slate-400 font-mono text-[10px] uppercase font-bold shrink-0 mr-1">Aspect:</span>
          {[
            { id: "free", label: "Free" },
            { id: "1:1", label: "1:1 Square" },
            { id: "4:3", label: "4:3 Doc" },
            { id: "3:4", label: "3:4 Page" },
            { id: "A4", label: "A4 Page" },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyAspectPreset(preset.id as any)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                aspectPreset === preset.id
                  ? "bg-emerald-500 text-slate-950 font-bold"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Action Buttons: Rotate & Confirm */}
        <div className="flex items-center justify-between gap-2">
          
          {/* Rotation Controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={rotateLeft}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Rotate 90° Counter-Clockwise"
            >
              <RotateCcw className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Rotate Left</span>
            </button>
            <button
              type="button"
              onClick={rotateRight}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Rotate 90° Clockwise"
            >
              <RotateCw className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Rotate Right</span>
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="px-2.5 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-xs font-medium transition-all cursor-pointer"
              title="Reset Crop & Rotation"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Confirm & Cancel Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={processCropAndExport}
              className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 rounded-xl text-xs sm:text-sm font-black flex items-center gap-1.5 shadow-lg transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Cropping...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Crop & Attach Photo</span>
                </>
              )}
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};
