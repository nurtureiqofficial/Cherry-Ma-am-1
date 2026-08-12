/**
 * Dynamic filtering and extraction utility for the Whiteboard Display System.
 * Separates textbook-quality lecture notes from conversational Hinglish chatter/filler words.
 */

export function extractBoardContent(text: string): string {
  if (!text) return "";

  // 1. Try to extract content wrapped inside <board>...</board> tags
  // This is streaming-safe: if the closing tag hasn't arrived yet, we take everything till the end
  if (text.toLowerCase().includes("<board>")) {
    const blocks: string[] = [];
    let currentIndex = 0;
    const lowerText = text.toLowerCase();
    
    while (true) {
      const openIdx = lowerText.indexOf("<board>", currentIndex);
      if (openIdx === -1) break;
      
      const startContent = openIdx + 7; // Length of "<board>"
      const closeIdx = lowerText.indexOf("</board>", startContent);
      
      if (closeIdx !== -1) {
        let content = text.slice(startContent, closeIdx).trim();
        content = content.replace(/^([\\/nN\s]+)/gi, "");
        content = content.replace(/[\\/]+n$/gi, "");
        content = content.replace(/[\\/]n(?![a-z])/gi, "\n");
        content = content.replace(/<spotlight[^>]*\/?>/gi, "");
        content = content.replace(/<\/spotlight>/gi, "");
        content = content.replace(/^###?\s*📖?\s*SOURCE CONTENT:?\s*/gim, "");
        blocks.push(content.trim());
        currentIndex = closeIdx + 8; // Length of "</board>"
      } else {
        // Stream is ongoing, take everything till the end
        let content = text.slice(startContent).trim();
        content = content.replace(/^([\\/nN\s]+)/gi, "");
        content = content.replace(/[\\/]+n$/gi, "");
        content = content.replace(/[\\/]n(?![a-z])/gi, "\n");
        content = content.replace(/<spotlight[^>]*\/?>/gi, "");
        content = content.replace(/<\/spotlight>/gi, "");
        content = content.replace(/^###?\s*📖?\s*SOURCE CONTENT:?\s*/gim, "");
        blocks.push(content.trim());
        break;
      }
    }
    
    return blocks.filter(Boolean).join("\n\n");
  }

  // Strictly return empty string if no <board> tags are found to prevent spoken conversation from typing onto the main chalkboard.
  return "";
}

/**
 * Smart Whiteboard Section Merger & Deduplicator.
 * Prevents duplicate section headers (e.g. "### 📌 DEFINITION:") from appearing twice on the blackboard.
 */
export function smartMergeWhiteboardNotes(prev: string, incoming: string, append?: boolean): string {
  const trimmedNew = (incoming || "").trim();
  if (!trimmedNew) return prev || ""; // Never wipe board with empty content

  const prevTrimmed = (prev || "").trim();
  if (!prevTrimmed) return trimmedNew;

  const normalizeSpace = (s: string) => s.replace(/[\r\n\s]+/g, " ").trim();

  // 1. Exact or space-normalized match -> return prev to avoid re-renders / duplication
  if (normalizeSpace(prevTrimmed) === normalizeSpace(trimmedNew)) {
    return prevTrimmed;
  }

  // 2. Substring containment check
  if (normalizeSpace(prevTrimmed).includes(normalizeSpace(trimmedNew))) {
    return prevTrimmed;
  }

  // 3. New Topic Title check: If incoming has a new # Main Title different from previous # Main Title, start fresh
  const getMainTitle = (text: string) => {
    const match = text.match(/^#\s+([^\n]+)/m);
    return match ? match[1].trim().toUpperCase() : null;
  };

  const prevTitle = getMainTitle(prevTrimmed);
  const incomingTitle = getMainTitle(trimmedNew);
  if (incomingTitle && prevTitle && incomingTitle !== prevTitle) {
    return trimmedNew;
  }

  // Helper to normalize section header keys e.g. "### 📌 DEFINITION :" -> "DEFINITION"
  const getHeaderKey = (headerLine: string): string => {
    return headerLine
      .replace(/^#+\s*/, "")
      .replace(/[^a-zA-Z0-9\u0900-\u097F]+/g, " ")
      .trim()
      .toUpperCase();
  };

  // Split markdown into structured section blocks based on header lines
  const parseSections = (text: string) => {
    const lines = text.split("\n");
    const sections: { key: string; rawHeader: string; body: string[] }[] = [];
    let currentKey = "__INTRO__";
    let currentRaw = "";
    let currentBody: string[] = [];

    const isHeaderLine = (line: string) => {
      const t = line.trim();
      return (
        t.startsWith("#") ||
        /^(📌|💡|🎯|📐|🧠|⚠️|🔬|🎒|🔍|❓|🚀|🎓|📖)/.test(t) ||
        /^###?\s*(DEFINITION|CHERRY|TOPPER|CORE FORMULA|MNEMONIC|JUGAD|EXAM PITFALL|CONCEPT DIAGRAM|SOURCE CONTENT|SOURCE)/i.test(t)
      );
    };

    for (const line of lines) {
      if (isHeaderLine(line)) {
        if (currentBody.length > 0 || currentRaw !== "") {
          sections.push({
            key: getHeaderKey(currentRaw || currentKey),
            rawHeader: currentRaw,
            body: currentBody,
          });
        }
        currentRaw = line;
        currentKey = getHeaderKey(line);
        currentBody = [line];
      } else {
        currentBody.push(line);
      }
    }

    if (currentBody.length > 0 || currentRaw !== "") {
      sections.push({
        key: getHeaderKey(currentRaw || currentKey),
        rawHeader: currentRaw,
        body: currentBody,
      });
    }

    return sections;
  };

  const prevSections = parseSections(prevTrimmed);
  const incomingSections = parseSections(trimmedNew);

  // If incoming notes have valid section headers
  const validIncomingSections = incomingSections.filter((s) => s.key && s.key !== "__INTRO__");

  if (validIncomingSections.length > 0) {
    const mergedMap = new Map<string, { rawHeader: string; body: string[] }>();
    const sectionOrder: string[] = [];

    // First populate with existing sections from prev
    for (const sec of prevSections) {
      if (sec.key) {
        mergedMap.set(sec.key, { rawHeader: sec.rawHeader, body: sec.body });
        sectionOrder.push(sec.key);
      }
    }

    // Merge or update with incoming sections
    for (const sec of validIncomingSections) {
      if (mergedMap.has(sec.key)) {
        // REPLACE existing section with newer version (prevents duplicates like two DEFINITION blocks)
        mergedMap.set(sec.key, { rawHeader: sec.rawHeader, body: sec.body });
      } else {
        // APPEND new unique section
        mergedMap.set(sec.key, { rawHeader: sec.rawHeader, body: sec.body });
        sectionOrder.push(sec.key);
      }
    }

    // Reconstruct merged markdown string
    const mergedText = sectionOrder
      .map((k) => mergedMap.get(k)?.body.join("\n"))
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (mergedText.length > 0) {
      return mergedText;
    }
  }

  // Fallback if no structured headers were detected:
  if (append) {
    return (prevTrimmed + "\n\n" + trimmedNew).trim();
  }

  // Anti-wipe protection: If previous content is rich (>80 chars) and new content is short snippet without headers
  const isPrevRich = prevTrimmed.length > 80 || prevTrimmed.includes("#") || prevTrimmed.includes("*");
  const isNewShortSnippet = trimmedNew.length < 90 && !trimmedNew.includes("#") && !trimmedNew.startsWith("```");

  if (isPrevRich && isNewShortSnippet) {
    return (prevTrimmed + "\n\n" + trimmedNew).trim();
  }

  return trimmedNew;
}

