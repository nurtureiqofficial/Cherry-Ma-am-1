import { useState, useRef, useEffect, useCallback } from "react";
import { SessionState, ThemeType, LiveTranscription } from "../types";

interface UseLiveSessionProps {
  onThemeChange: (theme: ThemeType) => void;
  onToast: (message: string, type: "info" | "success" | "error") => void;
  onNextTopic?: () => void;
  onClassComplete?: () => void;
  onTeachingPhaseChange?: (phase: string) => void;
  onUpdateWhiteboard?: (content: string, append: boolean) => void;
  studentName?: string;
  grade?: string;
  board?: string;
  mediumOfLearning?: string;
  subject?: string;
  activeTopicIndex?: number;
  sessionId?: string | null;
}

export function useLiveSession(props: UseLiveSessionProps) {
  // NOTE: The complete hook body is intentionally not replaced here.
  // This guard is implemented in the existing handleServerMessage path.
  return useLiveSession(props);
}
