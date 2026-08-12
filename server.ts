import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, Modality, Type } from "@google/genai";
import dotenv from "dotenv";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { smartMergeWhiteboardNotes } from "./src/utils/boardFilter";

// Load environment variables
dotenv.config();

console.log(`[Diagnostic] HTTP_PROXY: ${process.env.HTTP_PROXY || process.env.http_proxy || 'none'}, HTTPS_PROXY: ${process.env.HTTPS_PROXY || process.env.https_proxy || 'none'}`);

// Override Node's global dispatcher with EnvHttpProxyAgent to preserve system's pre-configured proxy environment settings
// in Cloud Run containers, while setting a high timeout (5 minutes) for parsing large visual documents.
const globalAgent = new EnvHttpProxyAgent({
  headersTimeout: 300000,
  bodyTimeout: 300000,
  connectTimeout: 300000,
});
setGlobalDispatcher(globalAgent);

const app = express();
const PORT = 3000;

// Shared Gemini Client
// We must set the 'User-Agent' header to 'aistudio-build' in httpOptions for telemetry.
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
    timeout: 300000, // Explicitly configure 5-minute timeout at the SDK layer
  },
});

// Robust generateContent helper with retry, backoff, and model fallback to handle 503, 429 quota limits, and high demand errors.
async function generateContentWithRetry(params: { model: string; contents: any; config?: any }, retries = 5, initialDelay = 1500) {
  let delay = initialDelay;
  const originalModel = params.model;
  
  // Define sequence based on the starting model
  let modelSequence = [originalModel];
  if (originalModel === "gemini-3.6-flash" || originalModel === "gemini-3.5-flash") {
    modelSequence = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
  } else if (originalModel === "gemini-flash-latest") {
    modelSequence = ["gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-3.6-flash"];
  } else if (originalModel === "gemini-3.1-flash-lite") {
    modelSequence = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.6-flash"];
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    // Select model for this attempt
    const modelIndex = (attempt - 1) % modelSequence.length;
    params.model = modelSequence[modelIndex];

    try {
      return await ai.models.generateContent(params);
    } catch (err: any) {
      const errMsg = err?.message || "";
      const errStatus = err?.status;
      const errString = (String(err) + " " + JSON.stringify(err)).toLowerCase();

      const isQuotaOrStatus429 = errMsg.includes("429") || 
                                 errMsg.toUpperCase().includes("RESOURCE_EXHAUSTED") || 
                                 errMsg.toLowerCase().includes("quota") || 
                                 errStatus === 429 ||
                                 errString.includes("429") ||
                                 errString.includes("resource_exhausted") ||
                                 errString.includes("quota") ||
                                 errString.includes("limit_exceeded");

      const isTransient = errMsg.includes("503") || 
                          errMsg.toLowerCase().includes("unavailable") || 
                          errMsg.toLowerCase().includes("high demand") || 
                          errMsg.toLowerCase().includes("overloaded") || 
                          errStatus === 503 ||
                          errString.includes("503") ||
                          errString.includes("unavailable") ||
                          errString.includes("high demand") ||
                          errString.includes("overloaded") ||
                          errString.includes("service unavailable");

      const isNetworkError = errString.includes("fetch failed") ||
                             errString.includes("timeout") ||
                             errString.includes("network") ||
                             errString.includes("disconnect") ||
                             errString.includes("econnreset") ||
                             errString.includes("econnrefused") ||
                             errString.includes("closed") ||
                             errString.includes("socket");

      if ((isTransient || isQuotaOrStatus429 || isNetworkError) && attempt < retries) {
        const nextModelIndex = attempt % modelSequence.length;
        const nextModel = modelSequence[nextModelIndex];
        
        console.warn(
          `[REST Server] API non-fatal issue on model "${params.model}" (Attempt ${attempt}/${retries}, ` +
          `${isQuotaOrStatus429 ? "quota" : isNetworkError ? "network" : "demand spike"}). ` +
          `Falling back to "${nextModel}" in ${delay}ms...`
        );
        
        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 1.5; // exponential backoff
      } else {
        console.error(`[REST Server] API Call generated FATAL error on model "${params.model}" (Attempt ${attempt}/${retries}):`, err);
        throw err;
      }
    }
  }
}

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));

// Gracefully handle "Payload Too Large" errors without dropping connection
app.use((err: any, req: any, res: any, next: any) => {
  if (err && (err.status === 413 || err.type === "entity.too.large")) {
    console.error("[REST Server] Payload too large error caught:", err);
    return res.status(413).json({
      success: false,
      error: "File is too large! Please upload a syllabus document smaller than 12MB to avoid network and server limits."
    });
  }
  next(err);
});

// Key document-driven syllabus store
interface ActiveDoc {
  filename: string;
  mimeType: string;
  markdown: string;
  mode?: string;
  detectedSubject?: string;
}

function normalizeSubjectName(rawName: string): string {
  let normalizedSubject = rawName.replace(/[._#*`"]/g, "").trim();
  const lowerSubj = normalizedSubject.toLowerCase();
  if (lowerSubj.includes("math") || lowerSubj.includes("ganit")) {
    return "Mathematics";
  } else if (lowerSubj.includes("physics") || lowerSubj.includes("bhautik")) {
    return "Physics";
  } else if (lowerSubj.includes("chem") || lowerSubj.includes("rasayan")) {
    return "Chemistry";
  } else if (lowerSubj.includes("bio") || lowerSubj.includes("jeev")) {
    return "Biology";
  } else if (lowerSubj.includes("history") || lowerSubj.includes("itihas")) {
    return "History";
  } else if (lowerSubj.includes("geography") || lowerSubj.includes("bhoogol")) {
    return "Geography";
  } else if (lowerSubj.includes("civic") || lowerSubj.includes("polity") || lowerSubj.includes("political")) {
    return "Civics";
  } else if (lowerSubj.includes("computer") || lowerSubj.includes("coding") || lowerSubj.includes("it")) {
    return "Computer Science";
  } else if (lowerSubj.includes("english") || lowerSubj.includes("angreji")) {
    return "English";
  } else if (lowerSubj.includes("hindi")) {
    return "Hindi";
  }
  return normalizedSubject || "All Science";
}

function sliceMarkdownToTopics(markdown: string): string[] {
  if (!markdown) return [];
  const lines = markdown.split("\n");
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
    const sections = markdown.split(/\n\s*\n+/);
    for (const sec of sections) {
      if (sec.trim()) {
        parsedTopics.push(sec.trim());
      }
    }
  }
  
  return parsedTopics;
}

function generateSourceContentBlock(topicMarkdown: string, topicIndex: number): string {
  if (!topicMarkdown || !topicMarkdown.trim()) return "";

  const lines = topicMarkdown.split("\n");
  let mainTitle = "";
  let bodyLines: string[] = [];

  for (const line of lines) {
    if (!mainTitle && line.trim().startsWith("#")) {
      mainTitle = line.trim();
    } else {
      bodyLines.push(line);
    }
  }

  if (!mainTitle) {
    mainTitle = `# TOPIC PART ${topicIndex + 1}`;
  }

  const cleanBody = bodyLines.join("\n").trim();
  if (!cleanBody) {
    return `${mainTitle}\n\n${topicMarkdown.trim()}`;
  }

  return `${mainTitle}\n\n${cleanBody}`;
}

let activeDocument: ActiveDoc | null = null;

// Global memory store for persistent live session state across WebSocket reconnections
interface SessionBackup {
  history: Array<{ sender: "student" | "cherry"; text: string }>;
  teachingPhase: string;
  whiteboardNotes: string;
  activeTopicIndex?: number;
}

let activeSessionBackup: SessionBackup = {
  history: [],
  teachingPhase: "intro",
  whiteboardNotes: "",
  activeTopicIndex: 0,
};

interface SessionState {
  activeDocument: ActiveDoc | null;
  activeSessionBackup: SessionBackup;
}
const sessions = new Map<string, SessionState>();

function getOrCreateSession(sessionId?: string | null): SessionState {
  const sid = sessionId || "default";
  if (!sessions.has(sid)) {
    sessions.set(sid, {
      activeDocument: null,
      activeSessionBackup: {
        history: [],
        teachingPhase: "intro",
        whiteboardNotes: "",
        activeTopicIndex: 0,
      }
    });
  }
  return sessions.get(sid)!;
}

// API Document Upload & Parser endpoint
app.post("/api/upload-document", async (req, res) => {
  const { filename, mimeType, base64Data, mode, sessionId } = req.body;
  if (!base64Data || !mimeType || !filename) {
    return res.status(400).json({ error: "Missing filename, mimeType, or base64Data in body." });
  }

  try {
    console.log(`[REST Server] Processing uploaded file: ${filename} (${mimeType}), mode: ${mode || "explain"}, size: ~${Math.round(base64Data.length / 1024)} KB`);
    
    let isTextFile = false;
    let textContent = "";
    const lowerName = filename.toLowerCase();
    const lowerMime = mimeType.toLowerCase();
    
    if (
      lowerMime.startsWith("text/") ||
      lowerMime === "application/json" ||
      lowerMime === "application/javascript" ||
      lowerMime === "application/xml" ||
      lowerName.endsWith(".txt") ||
      lowerName.endsWith(".md") ||
      lowerName.endsWith(".markdown") ||
      lowerName.endsWith(".json") ||
      lowerName.endsWith(".csv") ||
      lowerName.endsWith(".html") ||
      lowerName.endsWith(".xml") ||
      lowerName.endsWith(".js") ||
      lowerName.endsWith(".ts") ||
      lowerName.endsWith(".tsx") ||
      lowerName.endsWith(".jsx")
    ) {
      isTextFile = true;
      try {
        textContent = Buffer.from(base64Data, "base64").toString("utf-8");
      } catch (errDec) {
        console.error("[REST Server] Failed to decode base64 text file content:", errDec);
        isTextFile = false;
      }
    }

    const payloadParts: any[] = [];
    if (isTextFile) {
      console.log(`[REST Server] Identified as text file. Sending parsed string buffer: ${textContent.length} characters.`);
      payloadParts.push({
        text: `The syllabus/document filename is: "${filename}". Here are the contents:\n\n${textContent}`
      });
    } else {
      payloadParts.push({
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        },
      });
    }

    const isMistakeMode = mode === "mistake";
    let textPrompt = "";
    if (isMistakeMode) {
      textPrompt = "You are a deeply analytical academic mentor in Mathematics, Physics, and Chemistry for school syllabi (classes 6th to 12th). " +
                   "The uploaded document represents a student's own handwritten notes, exam sheet, or calculation work. " +
                   "Please deeply analyze this document to identify ANY and ALL mistakes, mathematical calculation errors, formula misuse, or visual diagram bugs. " +
                   "Write a comprehensive step-by-step diagnostic feedback report in Markdown: " +
                   "- Under '# Student Attempt', summarize what the student attempts to calculate/solve. " +
                   "- Under '## Identified Mistakes 🔍', list any specific calculations, signs, or logic where they made a mistake, explaining why it is wrong and what the misconception was. " +
                   "- Under '## Correct Step-by-Step Solution 📐', write down the fully correct step-by-step mathematical calculations and explanations. " +
                   "- You MUST format all mathematical formulas, physics equations, chemical structures, or scientific symbols inside standard LaTeX notation. Use $$ for display blocks and $ for inline math. " +
                   "- HIGH-FIDELITY DIAGRAM DRAWING PROTOCOL & SVG GUARDRAILS: If the solution involves any visual diagram, coordinate plot, geometric shape, optical layout, electrical circuit, cycle, flowchart, chemical skeletal model, or biological structure, represent it using a beautiful inline XML SVG vector drawing (`<svg viewBox='0 0 320 200' className='w-full max-w-[320px] h-[200px]'> ... </svg>`). Follow these SVG rules strictly:\n" +
                   "  1. COMPONENT-AND-ALIGNMENT EXACTNESS: Examine elements in the uploaded image/PDF page exactly. Map components to corresponding coordinate positions in a clean viewBox (e.g., `viewBox='0 0 320 200'`).\n" +
                   "  2. RAZOR-SHARP GEOMETRIC PRIMITIVES: Synthesize exact coordinates for lines, paths, circles, and polygons. For vector arrows, define a reusable `<marker>` at the beginning inside `<defs>`.\n" +
                   "  3. HIGH-CONTRAST NEON CHALK PALETTE: Use high-contrast translucent neon chalk colors ONLY on dark background (#12181B): Cyan `#22d3ee`, Emerald Green `#34d399`, Neon Yellow `#fde047`, Coral `#f97316`, Pink `#f472b6`, Violet `#c084fc`, Chalk White `#cbd5e1`. Dark/black strokes are forbidden.\n" +
                   "  4. TEXT & LABEL MARGINS: Place all variable tags and unit labels securely using native `<text>` elements offset securely from geometry lines to prevent collision (`text-anchor='middle'`, font size 12).\n" +
                   "  5. STRICTLY CLOSED & VALID XML: Ensure ALL XML tags (`<rect>`, `<path>`, `<circle>`, `<text>`, `<line>`, `<polygon>`, `<g>`, `<defs>`) are strictly closed and valid XML. Truncation or unclosed tags are strictly forbidden.\n\n" +
                   "Do NOT write any meta-introductions or conversational fillers. Generate clean, organized Markdown notes.";
    } else {
      textPrompt = "You are an expert academic curriculum structure extraction assistant. " +
                   "Please analyze this uploaded document (PDF, Image, or text file) and extract ALL educational study files & lecture material in extremely high fidelity. " +
                   "Do NOT summarize, do NOT write meta-commentaries or conversational introductions like 'Here is the parsed content'. " +
                   "Extract every single section, heading, sub-heading, text, definition, and math formula in its exact sequential logical flow. " +
                   "Divide the extracted notes into sequential topics using level 1 Heading markdown '# Topic Header Text' so they can be segmented into slides seamlessly.\n" +
                   "You MUST format all mathematical formulas, physics equations, chemical structures, or scientific symbols inside standard LaTeX notation. " +
                   "Use $$ double dollar signs on separate lines for display block equations, and $ single dollar signs for inline math formulas (e.g. $E = mc^2$, $H_2O$). " +
                   "If there are any visual diagrams, flowcharts, anatomical systems, graphs, cycles, plots, circuits, or drawings in the document, represent them in high fidelity using beautifully designed inline vector SVG XML nodes (e.g. `<svg viewBox='0 0 320 200' className='w-full max-w-[320px] h-[200px]'> ... </svg>`). " +
                   "HIGH-FIDELITY DIAGRAM DRAWING PROTOCOL & SVG GUARDRAILS:\n" +
                   "  1. DETAILED COMPONENT EXTRACTION: Map components to corresponding coordinate positions in a clean viewBox (`viewBox='0 0 320 200'`).\n" +
                   "  2. SHARP PRIMITIVES & VECTORS: Use precise SVG lines, paths, circles, rectangles, and polygons. Link arrow markers cleanly.\n" +
                   "  3. HIGH-CONTRAST NEON CHALK PALETTE: Use high-contrast translucent neon chalk colors ONLY on dark background (#12181B): Cyan `#22d3ee`, Emerald Green `#34d399`, Neon Yellow `#fde047`, Coral `#f97316`, Pink `#f472b6`, Violet `#c084fc`, Chalk White `#cbd5e1`. Dark/black strokes are forbidden.\n" +
                   "  4. TEXT & LABEL PLACEMENT: Replicate every symbol and label. Offset annotations using `<text>` nodes securely with `text-anchor='middle'` and font size 12 to avoid line overlapping.\n" +
                   "  5. STRICTLY CLOSED & VALID XML: Ensure ALL XML tags (`<rect>`, `<path>`, `<circle>`, `<text>`, `<line>`, `<polygon>`, `<g>`, `<defs>`) are strictly closed and valid XML. Truncation or unclosed tags are strictly forbidden.\n" +
                   "Extract content in the sequential order of the original notes. Organize text beautifully with Markdown headings (#, ##, ###), bold highlights, and bulleted lists.";
    }

    const extractionPayloadParts = [
      ...payloadParts,
      { text: textPrompt }
    ];

    console.log(`[REST Server] Actively extracting syllabus content for: "${filename}"`);

    const extractionResponse = await generateContentWithRetry({
      model: "gemini-3.6-flash",
      contents: { parts: extractionPayloadParts },
    });

    const markdown = extractionResponse && extractionResponse.text ? extractionResponse.text : "Failed to extract content from the document.";
    
    // Quick, non-blocking subject classifier using text keywords matched against extracted markdown, or a fast lightweight classifier call on text
    let rawDetectedSubject = "All Science";
    const lowerMarkdown = markdown.toLowerCase();

    // 1. Fast heuristic local keyword checking to bypass heavy model requests
    if (lowerMarkdown.includes("physics") || lowerMarkdown.includes("kinematics") || lowerMarkdown.includes("force") || lowerMarkdown.includes("velocity") || lowerMarkdown.includes("thermodynamics") || lowerMarkdown.includes("optics") || lowerMarkdown.includes("electromagnetism")) {
      rawDetectedSubject = "Physics";
    } else if (lowerMarkdown.includes("chemistry") || lowerMarkdown.includes("chemical") || lowerMarkdown.includes("reaction") || lowerMarkdown.includes("molecule") || lowerMarkdown.includes("benzene") || lowerMarkdown.includes("covalent") || lowerMarkdown.includes("acid")) {
      rawDetectedSubject = "Chemistry";
    } else if (lowerMarkdown.includes("math") || lowerMarkdown.includes("calculus") || lowerMarkdown.includes("integral") || lowerMarkdown.includes("derivative") || lowerMarkdown.includes("algebra") || lowerMarkdown.includes("geometry") || lowerMarkdown.includes("trigonometry") || lowerMarkdown.includes("matrix")) {
      rawDetectedSubject = "Mathematics";
    } else if (lowerMarkdown.includes("biology") || lowerMarkdown.includes("cell") || lowerMarkdown.includes("dna") || lowerMarkdown.includes("evolution") || lowerMarkdown.includes("organism")) {
      rawDetectedSubject = "Biology";
    } else {
      // 2. Fall back to a lightweight, fast model classification of the text content (not raw base64 data!)
      try {
        console.log("[REST Server] Local keywords inconclusive. Performing quick text-based subject classification with Gemini Lite...");
        const snippetText = markdown.substring(0, 3000);
        const subjectCall = await generateContentWithRetry({
          model: "gemini-3.1-flash-lite", // extremely fast & light
          contents: {
            parts: [{
              text: "Analyze the educational notes snippet below and determine its main academic subject. " +
                    "Return ONLY the subject name as a single clean capitalized word representing the main discipline (e.g. 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'History', 'Geography', 'Economics', 'Civics', 'Computer Science', etc.). " +
                    "Do not write sentences, explanation, or markdown formatting.\n\nNotes snippet:\n" + snippetText
            }]
          }
        });
        if (subjectCall && subjectCall.text) {
          rawDetectedSubject = subjectCall.text.trim();
        }
      } catch (classErr) {
        console.error("[REST Server] Subject text classification fallback failed:", classErr);
      }
    }

    // Normalize clean subject name using shared helper
    const normalizedSubject = normalizeSubjectName(rawDetectedSubject);

    console.log(`[REST Server] Subject detected: "${rawDetectedSubject}" -> Normalized to: "${normalizedSubject}"`);

    // Save to the active document state
    const sessionState = getOrCreateSession(sessionId);
    sessionState.activeDocument = {
      filename,
      mimeType,
      markdown,
      mode: isMistakeMode ? "mistake" : "explain",
      detectedSubject: normalizedSubject,
    };

    // Clean start for the new document-driven lesson
    sessionState.activeSessionBackup = {
      history: [],
      teachingPhase: "intro",
      whiteboardNotes: "",
      activeTopicIndex: 0,
    };

    if (!sessionId || sessionId === "default") {
      activeDocument = sessionState.activeDocument;
      activeSessionBackup = sessionState.activeSessionBackup;
    }

    console.log(`[REST Server] Document parsed successfully. Character length: ${markdown.length}`);

    res.json({
      success: true,
      filename,
      mimeType,
      markdown,
      mode: sessionState.activeDocument.mode,
      detectedSubject: normalizedSubject,
    });
  } catch (err: any) {
    console.error("[REST Server] Error parsing document with Gemini:", err);
    res.status(500).json({ error: "Error occurred while processing the document: " + err.message });
  }
});

// Retrieve active document context
app.get("/api/active-document", (req, res) => {
  const sessionId = req.query.sessionId as string;
  const sessionState = getOrCreateSession(sessionId);
  res.json({ activeDocument: sessionState.activeDocument });
});

// Update or set active document directly (e.g. for Direct Study)
app.post("/api/active-document", (req, res) => {
  const { sessionId, activeDocument: clientDoc } = req.body;
  const sessionState = getOrCreateSession(sessionId);
  sessionState.activeDocument = clientDoc;
  
  // Backward compatibility
  if (!sessionId || sessionId === "default") {
    activeDocument = clientDoc;
  }
  res.json({ success: true });
});

// Clear active document syllabus
app.post("/api/clear-document", (req, res) => {
  const { sessionId } = req.body;
  const sessionState = getOrCreateSession(sessionId);
  sessionState.activeDocument = null;
  sessionState.activeSessionBackup = {
    history: [],
    teachingPhase: "intro",
    whiteboardNotes: "",
    activeTopicIndex: 0,
  };

  if (!sessionId || sessionId === "default") {
    activeDocument = null;
    activeSessionBackup = {
      history: [],
      teachingPhase: "intro",
      whiteboardNotes: "",
      activeTopicIndex: 0,
    };
  }
  res.json({ success: true });
});

// Generate dynamic quiz based on active document topics or subject
app.post("/api/generate-quiz", async (req, res) => {
  const { subject, grade, activeTopicIndex, topics, customBoardContent, topicBoardsContent, count, difficulty, sessionId } = req.body;
  
  try {
    let contextText = "";
    let isFromDocument = false;
    let documentName = "";

    const sessionState = getOrCreateSession(sessionId);
    const sessionDoc = sessionState.activeDocument;

    if (sessionDoc && sessionDoc.markdown) {
      contextText = sessionDoc.markdown;
      isFromDocument = true;
      documentName = sessionDoc.filename;
    }

    // Determine currently discussed topic and board contents
    let activeTopicText = "";
    if (topics && Array.isArray(topics) && typeof activeTopicIndex === "number") {
      activeTopicText = topics[activeTopicIndex] || "";
    }
    let blackboardText = customBoardContent || "";

    // If both are empty, check if sessionState has them saved to ensure we always base on the currently discussed blackboard state
    if (!activeTopicText && sessionState.activeSessionBackup) {
      const savedIndex = sessionState.activeSessionBackup.activeTopicIndex || 0;
      if (sessionState.activeDocument && sessionState.activeDocument.markdown) {
        const parsedTopicsList = sliceMarkdownToTopics(sessionState.activeDocument.markdown);
        activeTopicText = parsedTopicsList[savedIndex] || "";
      }
    }
    if (!blackboardText && sessionState.activeSessionBackup && sessionState.activeSessionBackup.whiteboardNotes) {
      blackboardText = sessionState.activeSessionBackup.whiteboardNotes;
    }

    const questionCount = typeof count === "number" && count > 0 ? count : 5;
    const chosenDifficulty = (typeof difficulty === "string" && ["Easy", "Medium", "Hard"].includes(difficulty)) ? difficulty : "Medium";

    let difficultyInstruction = "";
    if (chosenDifficulty === "Easy") {
      difficultyInstruction = "The overall difficulty of all questions MUST be EASY. Focus on simple direct recall, fundamental definitions, and basic conceptual awareness with minimal or no complex calculation.";
    } else if (chosenDifficulty === "Hard") {
      difficultyInstruction = "The overall difficulty of all questions MUST be HARD. Focus on deep troubleshooting, complex calculations, multi-step logical reasoning, and advanced formula derivation.";
    } else {
      difficultyInstruction = "The overall difficulty of all questions MUST be MEDIUM. Focus on standard concept applications, multi-step solving, standard formula retention, and moderate analytical thinking.";
    }

    let prompt = "";
    if (activeTopicText || blackboardText) {
      prompt = `You are Cherry Ma'am, a brilliant, sweet, sassy Indian Hinglish-speaking teacher who makes studying extremely fun.\n` +
               `Create a high-quality, concept-testing quiz for a student in grade ${grade || "Class 10"} studying ${subject || "General"}.\n` +
               `The quiz must be STRICTLY based on the TOPIC presently/currently discussed in class by you, which consists of the active slide/topic contents and/or live blackboard chalk notes:\n\n` +
               `--- PRESENT DISCUSSIONS & CHALKBOARD --- \n` +
               (activeTopicText ? `Active Sub-Topic/Slide Content:\n${activeTopicText}\n\n` : "") +
               (blackboardText ? `Live Chalkboard Content & Notes (formulas, equations):\n${blackboardText}\n\n` : "") +
               `--- END DISCUSSIONS ---\n\n` +
               `Difficulty Level Constraint: ${difficultyInstruction}\n\n` +
               `Requirements:\n` +
               `1. Generate exactly ${questionCount} high-quality multiple choice questions (MCQs).\n` +
               `2. The question set must test concepts, theory, calculations, and formulas related to the current blackboard topic. At least one question must test the practical math formulas, calculations, or direct theories shown in the chalkboard notes.\n` +
               `3. Create 4 clear options for each question.\n` +
               `4. Set 'correctAnswer' to the 0-based index of the correct option.\n` +
               `5. Provide a detailed, easy-to-understand explanation for why that option is correct, written in your warm, friendly, sassy Hinglish/English style.\n` +
               `6. For each question, categorize it under one of these four cognitive categories: "Conceptual Application", "Formula Retention", "Calculations & Solving", "Theoretical Core".\n` +
               `7. For each question, specify:\n` +
               `   - "conceptTested": The specific concept tested (e.g., "Ohm's Law", "Triangle Area").\n` +
               `   - "theoryTested": The key theoretical fact, definition, or rule being assessed.\n` +
               `   - "calculationFormula": The specific formula or step-by-step mathematical calculations tested, or write "Theoretical/Conceptual check - no calculation/formula needed" if it's purely conceptual.\n` +
               `   - "difficulty": Set EXACTLY to "${chosenDifficulty}".`;
    } else if (isFromDocument) {
      prompt = `You are a professional teacher creating a quiz for a student in ${grade || "Class 10"}.\n` +
               `The quiz must be STRICTLY based on the topics covered in the uploaded document or YouTube video titled "${documentName}".\n` +
               `Here are the contents of the document/video topics:\n\n` +
               `--- CONTENT START ---\n${contextText}\n--- CONTENT END ---\n\n` +
               `Difficulty Level Constraint: ${difficultyInstruction}\n\n` +
               `Requirements:\n` +
               `1. Generate exactly ${questionCount} high-quality, concept-testing multiple choice questions.\n` +
               `2. The questions must assess if the student has understood the specific topics and concepts present in the provided content.\n` +
               `3. Create 4 clear options for each question.\n` +
               `4. Set 'correctAnswer' to the 0-based index of the correct option.\n` +
               `5. Provide a detailed, easy-to-understand explanation for why that option is correct.\n` +
               `6. For each question, categorize it under one of these four cognitive categories: "Conceptual Application", "Formula Retention", "Calculations & Solving", "Theoretical Core".\n` +
               `7. For each question, specify:\n` +
               `   - "conceptTested": The specific concept tested (e.g., "Ohm's Law", "Triangle Area").\n` +
               `   - "theoryTested": The key theoretical fact, definition, or rule being assessed.\n` +
               `   - "calculationFormula": The specific formula or step-by-step mathematical calculations tested, or write "Theoretical/Conceptual check - no calculation/formula needed" if it's purely conceptual.\n` +
               `   - "difficulty": Set EXACTLY to "${chosenDifficulty}".\n` +
               `8. If the document has a multi-lingual context (Hindi/Bengali/Odia/Hinglish), make the questions and explanations simple, clear, and relatable (using a friendly, accessible style, with Hinglish or English as appropriate).`;
    } else {
      prompt = `You are a professional teacher creating a quiz for a student in ${grade || "Class 10"} studying the subject "${subject || "General"}".\n` +
               `Difficulty Level Constraint: ${difficultyInstruction}\n\n` +
               `Requirements:\n` +
               `1. Generate exactly ${questionCount} high-quality, concept-testing multiple choice questions appropriate for this grade and subject.\n` +
               `2. Create 4 clear options for each question.\n` +
               `3. Set 'correctAnswer' to the 0-based index of the correct option.\n` +
               `4. Provide a detailed, easy-to-understand explanation for why that option is correct.\n` +
               `5. For each question, categorize it under one of these four cognitive categories: "Conceptual Application", "Formula Retention", "Calculations & Solving", "Theoretical Core".\n` +
               `6. For each question, specify:\n` +
               `   - "conceptTested": The specific concept tested.\n` +
               `   - "theoryTested": The key theoretical fact, definition, or rule being assessed.\n` +
               `   - "calculationFormula": The specific formula or step-by-step mathematical calculations tested, or write "Theoretical/Conceptual check - no calculation/formula needed" if it's purely conceptual.\n` +
               `   - "difficulty": Set EXACTLY to "${chosenDifficulty}".`;
    }

    console.log(`[REST Server] Generating dynamic quiz questions (${chosenDifficulty} level). Source: ${activeTopicText ? "Present Slide Topic" : isFromDocument ? "Active Document" : "Subject Fallback"}`);

    const quizResponse = await generateContentWithRetry({
      model: "gemini-3.6-flash",
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              question: { type: Type.STRING },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              correctAnswer: { type: Type.INTEGER, description: "0-based index of the correct answer option" },
              explanation: { type: Type.STRING },
              conceptTested: { type: Type.STRING, description: "Specific topic tested" },
              theoryTested: { type: Type.STRING, description: "Underlying theory, definition, rule, or core axiom tested" },
              calculationFormula: { type: Type.STRING, description: "Mathematical formula or step-by-step calculation step tested, or write 'Theoretical check' if none" },
              cognitiveCategory: { type: Type.STRING, description: "Conceptual Application, Formula Retention, Calculations & Solving, or Theoretical Core" },
              difficulty: { type: Type.STRING, description: "Easy, Medium, or Hard" }
            },
            required: ["id", "question", "options", "correctAnswer", "explanation", "conceptTested", "theoryTested", "calculationFormula", "cognitiveCategory", "difficulty"]
          }
        }
      }
    });

    const rawQuizText = quizResponse && quizResponse.text ? quizResponse.text.trim() : "[]";
    const questions = JSON.parse(rawQuizText);

    res.json({
      success: true,
      questions: questions,
      source: activeTopicText ? "present_topic" : isFromDocument ? "document" : "fallback",
      documentName: activeTopicText ? `Part ${activeTopicIndex + 1}: ${activeTopicText.split('\n')[0].replace(/#/g, '').trim()}` : documentName
    });

  } catch (err: any) {
    console.error("[REST Server] Error generating quiz with Gemini:", err);
    res.status(500).json({ error: "Failed to generate dynamic quiz: " + err.message });
  }
});

app.post("/api/counselor-chat", async (req, res) => {
  try {
    const { 
      userMessage, 
      studentName, 
      grade, 
      subject, 
      board, 
      mediumOfLearning, 
      performanceData, 
      chatHistory 
    } = req.body;

    if (!userMessage || typeof userMessage !== "string") {
      return res.status(400).json({ error: "userMessage is required" });
    }

    const perfSummary = performanceData ? 
      `STUDENT REAL-TIME PERFORMANCE ANALYTICS & HUB METRICS:
- Concept Clarity: ${performanceData.conceptClarity ?? 75}%
- Theoretical Core: ${performanceData.theoreticalCore ?? 70}%
- Calculation Precision: ${performanceData.calculationPrecision ?? 60}%
- Formula Recall: ${performanceData.formulaRecall ?? 65}%
- Socratic Stamina / Classroom Engagement: ${performanceData.socraticStamina ?? 80}%
- Total Quizzes Attempted: ${performanceData.totalQuizzes ?? 0}
- Live Classes Completed: ${performanceData.classesCompleted ?? 0}
- Saved Board Snapshots: ${performanceData.snapshotsSaved ?? 0}
- Key Strengths: ${(performanceData.strengths || []).map((s: any) => s.concept || s).join(", ") || "Active engagement"}
- Growth Focus Areas: ${(performanceData.growths || []).map((g: any) => `${g.concept || g}${g.explanation ? ` (${g.explanation})` : ''}`).join("; ") || "Calculation precision"}`
      : "No detailed performance analytics available yet.";

    const systemPrompt = `You are Kiara 👩‍🎓, an AI Student Counselor & Mindset Coach in Maestry AI.
You are a young, modern, energetic, empathetic, and psychologically intelligent female counselor guiding Indian students.
Your mission is to help students overcome study obstacles, exam phobia, anxiety, time management issues, subject-wise study strategies, creating custom timetables, and memory mnemonics.

Student Profile:
- Name: ${studentName || "Student"}
- Grade Level: ${grade || "Class 10"}
- Target Subject: ${subject || "Mathematics"}
- Board: ${board || "CBSE"}
- Medium of Learning: ${mediumOfLearning || "Hinglish"}

${perfSummary}

Communication Rules:
1. Warm, Empathetic & Energetic Hinglish/English Tone: Talk like a caring, smart elder sister / mentor ("Hey ${studentName || "Friend"}! Don't worry, hum milkar solution nikalenge! 🌸", "Chalo ek mst mnemonic trick batati hoon! ✨").
2. Reference Their Real Performance Metrics: If their Calculation Precision or Formula Recall is low, address it specifically in your advice!
3. Psychological & Mindset Focus: Acknowledge stress, fear of failure, and exam anxiety gently before providing actionable study solutions.
4. Structuring: Use bold points, bullet lists, short readable paragraphs, and warm emojis. Keep advice actionable and encouraging!`;

    const contents: any[] = [];
    if (Array.isArray(chatHistory) && chatHistory.length > 0) {
      chatHistory.forEach((item: any) => {
        if (item.role && item.text) {
          contents.push({
            role: item.role === "user" ? "user" : "model",
            parts: [{ text: item.text }]
          });
        }
      });
    }

    contents.push({
      role: "user",
      parts: [{ text: userMessage }]
    });

    console.log(`[REST Server] Processing Kiara Counselor chat for ${studentName || "Student"} (${grade}, ${subject})`);

    const aiRes = await generateContentWithRetry({
      model: "gemini-3.6-flash",
      contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      }
    });

    const reply = aiRes?.text ? aiRes.text.trim() : "Aww, Kiara couldn't generate a response right now. Please ask again! 🌸";

    res.json({ success: true, reply });
  } catch (err: any) {
    console.error("[REST Server] Error in Kiara counselor chat endpoint:", err);
    res.status(500).json({ error: "Counselor service error: " + err.message });
  }
});

app.post("/api/homework-maker", async (req, res) => {
  try {
    const {
      userMessage,
      imageBase64,
      mimeType,
      studentName,
      grade,
      board,
      mediumOfLearning,
      homeworkFormat,
      chatHistory
    } = req.body;

    if (!userMessage && !imageBase64) {
      return res.status(400).json({ error: "userMessage or imageBase64 is required" });
    }

    const studentGradeStr = grade || "Class 10";
    const studentBoardStr = board || "CBSE";
    const studentMediumStr = mediumOfLearning || "Hinglish";
    const nameStr = studentName || "Student";

    const systemPrompt = `You are Maestry Home Work Maker 📝, an expert AI Homework Assistant and School Copy Solution Generator built specifically for Indian school students.

STUDENT PROFILE & CONSTRAINTS:
- Student Name: ${nameStr}
- Grade/Class: ${studentGradeStr}
- Education Board: ${studentBoardStr}
- Medium/Language: ${studentMediumStr}

CRITICAL RULES FOR ACCURACY & FORMAT:

1. **AUTO-DETECT SUBJECT**:
   - Automatically analyze the uploaded question or image to detect the subject (e.g. Mathematics, Physics, Chemistry, Biology, English, Hindi, Social Science, Science, Computer Science, Environmental Studies/EVS, etc.).
   - Do NOT ask the user to pick a subject.
   - You MAY optionally include "Subject: [Detected Subject Name]" as a clean plain header line at the start. NEVER wrap Subject in asterisks (write "Subject: Computer Science", NOT "* Subject **:" or "* Subject * * :").

2. **STRICT GRADE-LEVEL ACCURACY**:
   - You MUST adapt the depth, complexity, steps, and vocabulary STRICTLY to ${studentGradeStr} standard!
   - NEVER generate Class 11/12 advanced calculus, university level variables, or high-school complexity for a lower grade student (e.g. if ${studentGradeStr} is Class 5/6/7, write simple age-appropriate arithmetic/algebra, basic 2-3 step reasoning, standard elementary textbook methods).
   - If ${studentGradeStr} is Class 9/10/11/12, follow the official ${studentBoardStr} marking scheme and standard curriculum for that class.

3. **DYNAMIC ADAPTIVE RESPONSE STRUCTURE (CRITICAL - NO BLOAT FOR SIMPLE QUESTIONS)**:
   - User Selected Preference Tag: "${homeworkFormat || "auto"}"

   - **MANDATORY SPACING & FORMAT RULES**:
     * NEVER wrap section headers or entire answer sentences in stray asterisks (e.g. write "Digital design refers to...", NOT "* Digital design refers to... * *").
     * Write clean section headers: "📌 Question:", "📝 Answer:", "💡 Tip for Notebook:".
     * Bold ONLY 1-3 specific key technical terms in the text if helpful. Do NOT bold or italicize entire long paragraphs!
     * You MUST ALWAYS put an EMPTY LINE (\n\n) between Question and Answer, and between Answer and Tip for Notebook.
     * NEVER join Question and Answer on the same line or adjacent lines!
     * NEVER add spaces before punctuation (write "digital design.", NOT "digital design .").

   - **ADAPTIVE FORMATTING BASED ON QUESTION TYPE**:
     Analyze the question (or uploaded image) and choose the appropriate layout. DO NOT force a heavy 6-part template on simple definitions or short questions!

     a) **SIMPLE DEFINITION / ONE-LINER / 1-MARK QUESTION (e.g. "Define digital design", "What is X?")**:
        Structure with clear double newlines:

📌 **Question**:
[Exact question text]

📝 **Answer**:
[1-2 sentence core definition in bold]
- **Key Examples / Features**: [2 short bullet points max]

💡 **Tip for Notebook**:
[1-line advice on key words/phrases to underline in notebook]

     b) **MCQ / MULTIPLE CHOICE QUESTION**:
📌 **Question**:
[Question text]

📝 **Answer**:
**Correct Option: (A) [Option Text]**
[1-2 line explanation]

💡 **Tip for Notebook**:
[Key point to remember]

     c) **FILL IN THE BLANKS / MATCH THE FOLLOWING / ONE-WORD**:
        - For Fill in Blanks: Give the complete sentence with answer **<u>bolded and underlined</u>**.
        - For Match Following: Present a neat 2-column table with Column A mapped directly to Column B.
        - For One-Word: State the exact direct word/phrase in bold + 1 short sentence explanation.

     d) **SHORT ANSWER TYPE (2-3 MARKS)**:
📌 **Question**:
[Question text]

📝 **Answer**:
[1-line brief intro definition]
- [Point 1]
- [Point 2]
- [Point 3]

💡 **Tip for Notebook**:
[1-line tip on key phrases to underline]

     e) **NUMERICAL / MATH / MULTI-STEP / LONG 5-MARK QUESTION**:
📌 **Question**: [Brief summary]

📐 **Given Data & Formula**: [Genvs, formulas]

✍️ **Step-by-Step Solution**:
[Write clean line-by-line calculation/proof directly WITHOUT step numbers like 1., 2., 3., 4. or Step 1:, Step 2:. Use natural transition connectors like "Since...", "Given that...", "From Equation (1) and (2)...", "Therefore,".]

✅ **Final Answer**: $$\\boxed{\\text{Result}}$$

💡 **Tip for Notebook**: [1-line tip on key words to underline]

4. **STRICT NO STEP-NUMBERING RULE FOR SCHOOL NOTEBOOKS**:
   - NEVER prefix solution lines, calculation steps, or geometry proof statements with numbers like "1.", "2.", "3.", "4.", "1)", "2)", "Step 1:", "Step 2:", etc.
   - When students copy solutions into their school notebook, math steps and proofs are written sequentially without step numbers.
   - Write every line of working on its own line using standard school copy style (e.g. "Given that line m || l and transversal t intersects them:", "angle 1 = angle 2 --- (Equation 1) [Corresponding Angles]", "From Equation (1) and Equation (2):", "Therefore, angle 2 = angle 3.").
   - The student must be able to copy the solution directly into their notebook without any modification or erasing of step numbers!

5. **MATH & DIAGRAMS**:
   - Format all equations using clean LaTeX (e.g., $...$ for inline or $$\\boxed{...}$$ for final answer).
   - CRITICAL RULE FOR FINAL ANSWERS: Keep descriptive words OUTSIDE the $$\\boxed{...}$$ formula box! Put ONLY short numbers/symbols inside \\boxed{} (e.g., **Position of image**: $$\\boxed{v = +0.78\\text{ m}}$$ (or $0.78\\text{ m}$ behind mirror)). NEVER put long text sentences inside \\boxed{} or \\text{} inside LaTeX block equations, so math stays perfectly horizontal!
   - If a diagram is helpful (ray diagram, circuit, geometric figure, flowchart, plant cell), generate a clean inline SVG in \`\`\`xml or \`\`\`svg code block on a clean WHITE background (background fill='#ffffff', dark lines stroke='#1e293b', text fill='#0f172a', colored rays stroke='#0284c7', '#dc2626', '#16a34a').`;

    const contents: any[] = [];
    if (Array.isArray(chatHistory) && chatHistory.length > 0) {
      chatHistory.forEach((item: any) => {
        if (item.role && item.text) {
          contents.push({
            role: item.role === "user" ? "user" : "model",
            parts: [{ text: item.text }]
          });
        }
      });
    }

    const currentParts: any[] = [];
    if (imageBase64) {
      currentParts.push({
        inlineData: {
          data: imageBase64,
          mimeType: mimeType || "image/jpeg"
        }
      });
    }

    const formatInstruction = homeworkFormat ? ` [Requested Format: ${homeworkFormat}]` : "";
    currentParts.push({
      text: (userMessage || "Please solve the question in the attached homework image.") + formatInstruction
    });

    contents.push({
      role: "user",
      parts: currentParts
    });

    console.log(`[REST Server] Processing Homework Maker request for ${nameStr} (${studentGradeStr}, ${studentBoardStr})`);

    const aiRes = await generateContentWithRetry({
      model: "gemini-3.6-flash",
      contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.5,
      }
    });

    const rawReply = aiRes?.text ? aiRes.text.trim() : "Homework Maker could not generate a response right now. Please try again! 📝";
    const reply = cleanHomeworkReply(rawReply);

    res.json({ 
      success: true, 
      reply
    });
  } catch (err: any) {
    console.error("[REST Server] Error in Homework Maker endpoint:", err);
    res.status(500).json({ error: "Homework Maker service error: " + err.message });
  }
});

function cleanHomeworkReply(text: string): string {
  if (!text) return text;
  
  const lines = text.split("\n");
  let inWorkingSection = false;
  
  const cleanedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.includes("Step-by-Step") || trimmed.includes("Answer:") || trimmed.includes("Given Data")) {
      inWorkingSection = true;
    } else if (trimmed.includes("Final Answer:") || trimmed.includes("Tip for Notebook:")) {
      inWorkingSection = false;
    }
    
    // Strip leading step numbers like "1. ", "2) ", "Step 1: " from solution/working lines
    if (inWorkingSection || /^\s*(?:\d+[\.\)]|Step\s*\d+\:?)\s+(?!Question|Answer|Tip|Subject)/i.test(line)) {
      return line.replace(/^\s*(?:\d+[\.\)]|Step\s*\d+\:?)\s+(?!Question|Answer|Tip|Subject)/i, "");
    }
    
    return line;
  });
  
  return cleanedLines.join("\n");
}

function extractJsonFromScriptText(js: string): string {
  const startIdx = js.indexOf("{");
  if (startIdx === -1) return js;
  
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;
  let quoteChar = "";

  for (let i = startIdx; i < js.length; i++) {
    const char = js[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (inString) {
      if (char === quoteChar) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = true;
      quoteChar = char;
      continue;
    }

    if (char === "{") {
      braceCount++;
    } else if (char === "}") {
      braceCount--;
      if (braceCount === 0) {
        return js.substring(startIdx, i + 1);
      }
    }
  }

  return js.substring(startIdx);
}

async function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function getYoutubeTranscript(videoId: string): Promise<{ transcriptText: string; title: string }> {
  let title = "";
  let transcriptText = "";

  const decodeHtml = (str: string) => {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&apos;/g, "'");
  };

  // 1. Fetch OEmbed first for Video Title
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oembedRes = await fetchWithTimeout(oembedUrl, {}, 3500);
    if (oembedRes.ok) {
      const oembedData = await oembedRes.json();
      title = oembedData.title || "";
    }
  } catch (err) {
    console.error("[OEmbed Fetch Error]", err);
  }

  // 2. Direct timedtext API check (fastest & most reliable for YouTube captions)
  const langPriority = ["hi", "en", "en-US", "hi-IN", "bn", "ta", "te", "mr"];
  for (const lang of langPriority) {
    try {
      const timedtextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}`;
      const ttRes = await fetchWithTimeout(timedtextUrl, {}, 2500);
      if (ttRes.ok) {
        const xmlText = await ttRes.text();
        if (xmlText && xmlText.includes("<text")) {
          const textRegex = /<text[^>]*>(.*?)<\/text>/gi;
          const matches = [];
          let match;
          while ((match = textRegex.exec(xmlText)) !== null) {
            matches.push(match[1]);
          }
          if (matches.length > 0) {
            transcriptText = matches.map(m => decodeHtml(m)).join(" ");
            console.log(`[YouTube TimedText] Successfully extracted transcript (${lang}): ${transcriptText.substring(0, 150)}...`);
            break;
          }
        }
      }
    } catch (_) {}
  }

  // 3. Fallback: Fetch the YouTube Watch HTML page if timedtext API was empty
  if (!transcriptText) {
    try {
      const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const res = await fetchWithTimeout(watchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9,hi;q=0.8"
        }
      }, 4000);
      
      if (res.ok) {
        const html = await res.text();
        
        if (!title) {
          const titleMatch = html.match(/<title>(.*?)<\/title>/i);
          if (titleMatch && titleMatch[1]) {
            title = decodeHtml(titleMatch[1].replace(" - YouTube", "").trim());
          }
        }

        let rawJson = "";
        const markers = ["ytInitialPlayerResponse = ", "var ytInitialPlayerResponse = ", 'window["ytInitialPlayerResponse"] = '];
        for (const marker of markers) {
          const idx = html.indexOf(marker);
          if (idx !== -1) {
            const start = idx + marker.length;
            const endOfScript = html.indexOf("</script>", start);
            if (endOfScript !== -1) {
              const scriptBlock = html.substring(start, endOfScript).trim();
              rawJson = extractJsonFromScriptText(scriptBlock);
              if (rawJson) break;
            }
          }
        }
        
        if (rawJson) {
          try {
            const playerResponse = JSON.parse(rawJson);
            const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            
            if (Array.isArray(captionTracks) && captionTracks.length > 0) {
              let track = captionTracks.find((t: any) => t.languageCode === "hi") ||
                          captionTracks.find((t: any) => t.languageCode === "en") ||
                          captionTracks[0];
              
              if (track && track.baseUrl) {
                const xmlRes = await fetchWithTimeout(track.baseUrl, {}, 3500);
                if (xmlRes.ok) {
                  const xmlText = await xmlRes.text();
                  const textRegex = /<text[^>]*>(.*?)<\/text>/gi;
                  const matches = [];
                  let match;
                  while ((match = textRegex.exec(xmlText)) !== null) {
                    matches.push(match[1]);
                  }
                  if (matches.length > 0) {
                    transcriptText = matches.map(m => decodeHtml(m)).join(" ");
                    console.log(`[YouTube Watch Page] Extracted transcript: ${transcriptText.substring(0, 150)}...`);
                  }
                }
              }
            }
          } catch (jsonErr) {
            console.error("[YouTube Scraper] Error parsing playerResponse JSON:", jsonErr);
          }
        }
      }
    } catch (err) {
      console.error("[YouTube Scraper] Error extracting watch page transcript:", err);
    }
  }

  return { transcriptText, title };
}

// Parse and generate high-fidelity multi-lingual study curriculum from YouTube videos
app.post("/api/parse-youtube", async (req, res) => {
  const { youtubeUrl, grade, board, subject, medium, sessionId } = req.body;
  if (!youtubeUrl) {
    return res.status(400).json({ error: "Missing youtubeUrl in body." });
  }

  // Robust video ID extractor matching direct ID, shorts, live, embed, desktop, mobile & query parameter URLs
  const trimmedUrl = String(youtubeUrl).trim();
  let videoId = "dQw4w9WgXcQ";
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmedUrl)) {
    videoId = trimmedUrl;
  } else {
    const match = trimmedUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    if (match && match[1] && match[1].length === 11) {
      videoId = match[1];
    }
  }

  try {
    console.log(`[REST Server] Fetching details for YouTube Video ID=${videoId}...`);
    const { transcriptText, title: videoTitleRaw } = await getYoutubeTranscript(videoId);
    const videoTitle = videoTitleRaw || `YouTube Video Lecture (ID: ${videoId})`;

    console.log(`[REST Server] Generating board-synchronized YouTube curriculum: Title="${videoTitle}", Board=${board}, Lang=${medium}, Grade=${grade}, Subj=${subject}`);

    const prompt = 
      `You are an expert curriculum design specialist in India's top academic boards (CBSE, ICSE, Bihar Board BSEB, Jharkhand Board JAC, UP Board, West Bengal Board WBBSE, Odisha Board CHSE). ` +
      `Your task is to generate an interactive, complete-fidelity blackboard physical study plan matching the educational topic of the YouTube video titled "${videoTitle}" (ID: "${videoId}").\n\n` +
      (transcriptText 
        ? `Here is the full text transcript of the original video. It contains the exact spoken core mathematical proofs, technical structures, numericals, and academic reasoning. You MUST isolate this core educational logic and extract all formulas, diagrams, and sub-topics from this transcript flow without skipping or summarizing. Purge all non-academic conversational speech, notifications, or general chatter:\n` +
          `--- TRANSCRIPT START ---\n${transcriptText}\n--- TRANSCRIPT END ---\n\n`
        : `Note: The video subtitles are not directly scrapable, so please design a high-fidelity chalkboard delivery matching the exact academic standards of the video title: "${videoTitle}" and Subject "${subject || "Physics/Mathematics"}".\n\n`) +
      `STUDENT METADATA CONTEXT:\n` +
      `- Class/Grade: ${grade || "Class 10"}\n` +
      `- Affiliated Board: ${board || "CBSE"}\n` +
      `- Medium/Language script: ${medium || "Hinglish"} [CRITICAL LANGUAGE SCRIPT RULE]: If medium is "Hindi", write definitions, notes, and topic headings in Devanagari Hindi script. If medium is "Bengali/Bangla", write notes in Bengali script. If medium is "Oriya/Odia", write notes in Odia script. If medium is "Hinglish", write in English script but frame explanations in natural conversational Hindi (e.g. "Is formula ko derive karne ke liye..."). All math variables and equations MUST strictly use standard LaTeX ($$ or $).\n\n` +
      `STUDY PLAN STRUCTURE CRITERIA & SVG GUARDRAILS:\n` +
      `1. Do NOT write any welcome messages, introductory intros, or wrapping code remarks. Return ONLY high-quality educational Markdown notes that match the video's subject context.\n` +
      `2. Divide the blackboard syllabus into exactly 3 or 4 sequential sub-topics using level 1 Heading markdown '# Topic Header Text'. Cherry Ma'am will segment these into the main teaching session slide tracker.\n` +
      `3. For each Topic Header:\n` +
      `   - A detailed textbook definition paragraph matching the board and script selection.\n` +
      `   - Comprehensive LaTeX formulas wrapped in $$ (display block) and $ (inline math) parameters.\n` +
      `   - Insert ONE beautiful, inline, highly professional responsive XML SVG coordinate drawing, graph, mechanical cycle, circuit loop, or geometric system (e.g. \`<svg viewBox="0 0 320 200" className="w-full max-w-[320px] h-[200px]">...\</svg>\`).\n` +
      `   - [CRITICAL SVG GUARDRAILS]: Use ONLY high-contrast translucent neon chalk colors (#00FFFF Cyan, #39FF14 Lime Green, #FFFF00 Neon Yellow, #FF5733 Coral, #FF6B6B Pink) on dark background (#12181B). Ensure ALL XML tags (<rect>, <path>, <circle>, <text>, <line>, <polygon>, <g>) are strictly closed and valid XML. Ensure text labels do not overlap any vector shapes or lines.\n` +
      `4. Make the contents extremely rich and comprehensive so that the teacher can instruct sequentially and beautifully without skipping anything.`;

    console.log(`[REST Server] Start processing: Generating YouTube study notes for: "${videoTitle}"`);

    const curriculumResponse = await generateContentWithRetry({
      model: "gemini-3.6-flash",
      contents: { parts: [{ text: prompt }] },
    });

    const markdown = curriculumResponse && curriculumResponse.text ? curriculumResponse.text : "Failed to generate study curriculum for this video.";
    
    // Quick, non-blocking subject classifier using text keywords matched against video title, transcript snippet and the generated markdown syllabus
    let rawDetectedSubject = subject || "All Science";
    const lookupText = `${videoTitle} ${transcriptText || ""} ${markdown}`.toLowerCase();

    // 1. Fast heuristic local keyword checking to bypass heavy model requests
    if (lookupText.includes("physics") || lookupText.includes("kinematics") || lookupText.includes("force") || lookupText.includes("velocity") || lookupText.includes("thermodynamics") || lookupText.includes("optics") || lookupText.includes("electromagnetism")) {
      rawDetectedSubject = "Physics";
    } else if (lookupText.includes("chemistry") || lookupText.includes("chemical") || lookupText.includes("reaction") || lookupText.includes("molecule") || lookupText.includes("benzene") || lookupText.includes("covalent") || lookupText.includes("acid")) {
      rawDetectedSubject = "Chemistry";
    } else if (lookupText.includes("math") || lookupText.includes("calculus") || lookupText.includes("integral") || lookupText.includes("derivative") || lookupText.includes("algebra") || lookupText.includes("geometry") || lookupText.includes("trigonometry") || lookupText.includes("matrix")) {
      rawDetectedSubject = "Mathematics";
    } else if (lookupText.includes("biology") || lookupText.includes("cell") || lookupText.includes("dna") || lookupText.includes("evolution") || lookupText.includes("organism")) {
      rawDetectedSubject = "Biology";
    } else {
      // 2. Fall back to a lightweight, fast model classification of the text content with gemini-3.1-flash-lite (extremely high quota pool)
      try {
        console.log("[REST Server] YouTube keywords inconclusive. Performing quick fast text classification using Gemini Lite...");
        const snippetText = lookupText.substring(0, 3000);
        const subjectCall = await generateContentWithRetry({
          model: "gemini-3.1-flash-lite", // fast & lightweight
          contents: {
            parts: [{
              text: "Analyze the educational title & notes snippet below and determine its main academic subject. " +
                    "Return ONLY the subject name as a single clean capitalized word representing the main discipline (e.g. 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'History', 'Geography', 'Economics', 'Civics', 'Computer Science', etc.). " +
                    "Do not write sentences, explanation, or markdown formatting.\n\nNotes snippet:\n" + snippetText
            }]
          }
        });
        if (subjectCall && subjectCall.text) {
          rawDetectedSubject = subjectCall.text.trim();
        }
      } catch (classErr) {
        console.error("[REST Server] YouTube text classification fallback failed:", classErr);
      }
    }
    
    // Normalize clean subject name using shared helper
    const normalizedSubject = normalizeSubjectName(rawDetectedSubject);

    console.log(`[REST Server] YouTube subject detected: "${rawDetectedSubject}" -> Normalized to: "${normalizedSubject}"`);

    const filename = `YouTube: ${videoTitle} (ID: ${videoId})`;

    // Save state for session
    const sessionState = getOrCreateSession(sessionId);
    sessionState.activeDocument = {
      filename,
      mimeType: "video/youtube",
      markdown,
      mode: "explain",
      detectedSubject: normalizedSubject,
    };

    sessionState.activeSessionBackup = {
      history: [],
      teachingPhase: "intro",
      whiteboardNotes: "",
      activeTopicIndex: 0,
    };

    // Also update global fallback activeDocument
    activeDocument = sessionState.activeDocument;
    activeSessionBackup = sessionState.activeSessionBackup;

    console.log(`[REST Server] YouTube curriculum generated successfully. Notes length: ${markdown.length} characters.`);

    res.json({
      success: true,
      filename,
      mimeType: "video/youtube",
      markdown,
      mode: "explain",
      detectedSubject: normalizedSubject,
      sessionId: sessionId || "default"
    });
  } catch (err: any) {
    console.error("[REST Server] Error generating syllabus for YouTube video:", err);
    res.status(500).json({ error: "Failed to generate study syllabus: " + err.message });
  }
});

// API to generate Smart Revision Deck (Flashcards & Mind Map)
app.post("/api/generate-revision-deck", async (req, res) => {
  const { sessionTitle, subject, topics, blackboardContent } = req.body;
  try {
    console.log(`[REST Server] Generating revision deck for "${sessionTitle || "Class Session"}" (${subject || "General"})`);

    const prompt = `You are Cherry Ma'am's smart edtech assistant. Your task is to generate a comprehensive, high-quality, concept-testing Revision Deck consisting of Flashcards and a structured Mind Map based on the following classroom lecture details:\n\n` +
      `- Session Title: ${sessionTitle || "Class Session"}\n` +
      `- Subject: ${subject || "General Science"}\n` +
      (topics && Array.isArray(topics) ? `- Subtopics Discussed:\n${topics.map((t: string, idx: number) => `  ${idx + 1}. ${t}`).join("\n")}\n` : "") +
      (blackboardContent ? `- Lecture Blackboard Chalkboard Notes:\n${blackboardContent}\n` : "") +
      `\n` +
      `Requirements:\n` +
      `1. Generate exactly 5-8 smart flashcards. Each flashcard should target a core concept, definition, rule, or critical formula from the notes.\n` +
      `   - 'question': clear and direct conceptual question (e.g. "What is the physical meaning of the first law of thermodynamics?").\n` +
      `   - 'answer': detailed, beautiful explanation. ALWAYS wrap mathematical variables, formulas, or equations inside LaTeX syntax ($ for inline, $$ for block display, e.g. $dU = dQ - dW$).\n` +
      `   - 'conceptTested': Name of the concept being tested.\n` +
      `2. Generate a beautifully structured Mind Map that strictly adheres to the following four structural principles for premium educational learning and memory retention:\n` +
      `   - **1. तार्किक और कालानुक्रमिक प्रवाह (Logical & Chronological Flow):** Arrange the nodes in a sequential, logical order of teaching/understanding. Start with foundational definitions and basic setup, proceed to core working mechanisms or processes, then formulate key equations/theorems, and conclude with practical exam problems or master mnemonics.\n` +
      `   - **2. श्रेणियों में विभाजन (Proper Categorization):** Neatly organize topics into distinct, mutually exclusive main nodes (categories) with ZERO conceptual overlap. Group related concepts tightly under their respective categorical topicName (e.g., "Intro & Terms", "Core Mechanism", "Key Formulations", "Practical Shortcuts").\n` +
      `   - **3. संक्षिप्तता और विज़ुअल हाइरार्की (Conciseness & Visual Hierarchy):** Keep the content of all nodes brief, crisp, highly scannable, and packed with high-impact key terms rather than verbose paragraphs. Build an elegant visual structure from high-level theme (topicName) down to key concepts (keyConcepts) and the core equation (keyFormula), down to student-focused, highly actionable summary bullet points (subNodes).\n` +
      `   - **4. संबंधों का प्रदर्शन (Connections & Dependencies):** Explicitly highlight connections or dependency relations within the subNodes or keyConcepts of each node (e.g., "Builds on foundational definition of Category X", "Directly relates to the Core Mechanism described in Node Y", "Transforms formula from previous node to solve problem Z"). This ensures the student gets a cohesive, interconnected mental map of the whole session.\n` +
      `\n` +
      `Schema mapping for the Mind Map:\n` +
      `   - 'title': High-level mind map title.\n` +
      `   - 'nodes': Array of major theme nodes. Each node represents a key topic from the lecture.\n` +
      `     - 'topicName': Title of the main branch/topic node.\n` +
      `     - 'keyConcepts': List of specific key terms, concepts or elements in this branch.\n` +
      `     - 'keyFormula': A core equation/formula associated with this topic (formatted in LaTeX, or empty string if not applicable).\n` +
      `     - 'subNodes': List of quick summary takeaways, student tips, or sub-points for quick review showing logical flow and relations.\n` +
      `3. Keep the content deeply educational, structured, and easy to memorize for school exams and competitive test preparation. Ensure all formula representations are clean and syntactically correct in LaTeX.`;

    const revisionResponse = await generateContentWithRetry({
      model: "gemini-3.6-flash",
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            flashcards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING },
                  conceptTested: { type: Type.STRING },
                },
                required: ["id", "question", "answer", "conceptTested"],
              }
            },
            mindMap: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                nodes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      topicName: { type: Type.STRING },
                      keyConcepts: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                      },
                      keyFormula: { type: Type.STRING },
                      subNodes: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                      }
                    },
                    required: ["topicName", "keyConcepts", "keyFormula", "subNodes"]
                  }
                }
              },
              required: ["title", "nodes"]
            }
          },
          required: ["flashcards", "mindMap"]
        }
      }
    });

    const jsonText = revisionResponse && revisionResponse.text ? revisionResponse.text.trim() : "{}";
    const data = JSON.parse(jsonText);

    // Normalize and sanitize the parsed response to prevent any empty/missing mindMap components
    if (data && typeof data === "object") {
      // Handle potential camelCase vs lowercase key names
      if (!data.mindMap && data.mindmap) {
        data.mindMap = data.mindmap;
      }
      if (!data.flashcards && data.flashCards) {
        data.flashcards = data.flashCards;
      }

      // Ensure flashcards array exists
      if (!Array.isArray(data.flashcards)) {
        data.flashcards = [];
      }

      // Ensure mindMap object exists
      if (!data.mindMap || typeof data.mindMap !== "object") {
        data.mindMap = { 
          title: sessionTitle ? `${sessionTitle} Concepts` : "Classroom Conceptual Overview", 
          nodes: [] 
        };
      }

      // Ensure mindMap.nodes is an array
      if (!Array.isArray(data.mindMap.nodes)) {
        data.mindMap.nodes = [];
      }

      // Fallback: If AI returned an empty nodes array, reconstruct nodes from the subtopics and session Title
      if (data.mindMap.nodes.length === 0) {
        console.log("[REST Server] AI returned empty mindMap nodes. Populating high-quality fallbacks.");
        const subtopicList = (Array.isArray(topics) && topics.length > 0) 
          ? topics 
          : [sessionTitle || "Core Lesson Concepts"];

        data.mindMap.nodes = subtopicList.map((topicName: string) => ({
          topicName: topicName,
          keyConcepts: [
            `Core fundamentals of ${topicName}`,
            `Practical classroom examples and typical exam applications`
          ],
          keyFormula: "",
          subNodes: [
            `Make sure to learn the standard definitions and diagrams associated with ${topicName}.`,
            `Review Cherry Ma'am's chalkboard formulas and visual walkthroughs for active retention.`
          ]
        }));
      }

      // Map and clean up each node's internal keys to guarantee structure required by the React front-end
      data.mindMap.nodes = data.mindMap.nodes.map((node: any) => {
        const topicName = node.topicName || node.topic || node.name || "Topic Node";
        const keyConcepts = Array.isArray(node.keyConcepts) ? node.keyConcepts : 
                            Array.isArray(node.coreConcepts) ? node.coreConcepts : 
                            Array.isArray(node.concepts) ? node.concepts : [];
        const keyFormula = node.keyFormula || node.formula || node.rule || "";
        const subNodes = Array.isArray(node.subNodes) ? node.subNodes : 
                         Array.isArray(node.quickTakeaways) ? node.quickTakeaways : 
                         Array.isArray(node.takeaways) ? node.takeaways : [];

        return {
          topicName,
          keyConcepts,
          keyFormula,
          subNodes
        };
      });
    }

    res.json({
      success: true,
      data: data
    });
  } catch (err: any) {
    console.error("[REST Server] Error generating revision deck:", err);
    res.status(500).json({ error: "Failed to generate revision deck: " + err.message });
  }
});

// API Healtcheck
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server attached to HTTP server (not listening on a separate port)
const wss = new WebSocketServer({ noServer: true });
const wssConcierge = new WebSocketServer({ noServer: true });
const wssKiaraLive = new WebSocketServer({ noServer: true });

// Attach Upgrade Handler
server.on("upgrade", (request, socket, head) => {
  const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : "";
  if (pathname === "/api/live") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else if (pathname === "/api/concierge") {
    wssConcierge.handleUpgrade(request, socket, head, (ws) => {
      wssConcierge.emit("connection", ws, request);
    });
  } else if (pathname === "/api/kiara-live") {
    wssKiaraLive.handleUpgrade(request, socket, head, (ws) => {
      wssKiaraLive.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Handle WebSocket connections for Aditi Concierge Live Assistant
wssConcierge.on("connection", async (clientWs: WebSocket, req: any) => {
  console.log("[WS Concierge] Connecting to Aditi voice-to-voice assistant...");
  let session: any = null;
  let isGeminiActive = true;

  const systemInstruction = 
    `Your name is Aditi. You are an energetic, extremely persuasive, warm, and sweet AI Sales Executive cum Customer Care Associate for Cherry Ma'am's Digital Chalkboard Learning Ecosystem.
Your primary responsibility is to act as a friendly, human-like live voice sales consultant, introduce prospective students and parents to the app's unique, groundbreaking features, answer any customer care queries, and actively convert visitors into registration-free or premium paid subscribers!

KEY KNOWLEDGE BASE (ADITI'S COMPLETE FEATURE DIRECTORY & MEMORY):

1. INTERACTIVE LIVE CLASSROOM WITH CHERRY MA'AM (Our Core Feature):
   - Real-time voice-to-voice lessons with Cherry Ma'am, a sassy, energetic Virtual school teacher (she uses Hinglish phrases like "Arrey beta dhyan se dekho!", "Hey, listen carefully!", "Is step me slips hotey hain!").
   - Live visual neon chalkboard where Cherry draws diagrams, coordinates, vector charts, and writes high-fidelity LaTeX math formulas on-the-fly.
   - Structured 6-Phase Teaching Engine: 1. Intro, 2. Concept visualization, 3. Line-by-line explanation, 4. Evaluation/Doubts checkpoint, 5. Sassy Transition, and 6. Graduation.

2. SAME-TO-SAME HIGH-FIDELITY SCREEN RECORDER:
   - Records classes exactly as they appear on the chalkboard, preserving custom drawings, formulas, and animations perfectly!
   - Full HD 1080p high bitrate (VP9/H264 encoding at 6 Mbps) for crystal clear math formulas, text (KaTeX), and vectors.
   - Dual-channel Audio Mixing: Mixes student's voice & Cherry Ma'am's teaching voice together beautifully in the same recording.
   - Smart fallback mechanism renders onto a crisp 1280x720 canvas if screen share is not enabled.

3. DIGITAL LEARNING LOCKER & "BOARD-BOOKS" PDF ARCHIVES:
   - A dedicated secure learning vault inside the "Student Account Hub" to keep recordings, transcriptions, and snapshots safe.
   - Students can instantly download entire sequential chalkboard writings and notes as beautiful, pre-compiled PDF Handouts called "Board-Books"! This has its own dedicated, clean tab in the Hub.

4. DIAGNOSTIC WORK SHEET SCANNER ("Find My Mistake"):
   - Upload screenshots or photos of handwritten tests, homework sheets, or notebook pages.
   - Cherry scans them, pinpoints the exact mathematical calculation step where the student made a mistake, circles it on the board with red chalk, and runs a diagnostic lesson.

5. SMART YOUTUBE STUDY ENGINE (Active Study Transformation):
   - Paste any academic/syllabus YouTube video link.
   - Cherry purges all distracting elements like sponsors, intro/outro, and generic talks.
   - Cherry transforms the passive video into an active visual chalkboard lesson, plotting curves and checking concepts in real-time.

6. QUICK QUIZ DESK:
   - Configure syllabus depth, total questions, and time limits.
   - Generates interactive, grade-aligned practice quizzes from current whiteboard topics, uploaded documents, or syllabus databases.
   - Includes real-time guidance from Cherry Ma'am, who can verbally read out questions and guide you!

7. AMBIENT FOCUS AUDIO SYNTHESIZER (Focus Soundscapes):
   - A built-in ambient sound player that generates Web Audio synthesized binaural focus waves (like 40Hz Gamma wave for brain concentration) and interactive focus soundtracks (Lofi Beats, Calm Piano, and Nature Sounds) to boost productivity and flow state.
   - Features custom volume sliders, ambient animations, and a sleek compact overlay player for focus-aligned self-study.

8. REORGANIZED STUDENT ACCOUNT HUB & STREAMLINED ANALYTICS:
   - A completely optimized and streamlined "Student Account Hub" to avoid duplication.
   - The "Analytics" tab has been decluttered to focus exclusively on "Performance Analytics & Radar", featuring subject-wise scoring metrics, concept coverage radars, and diagnostic statistics without redundant handbook links.
   - All "Study Handbooks" and PDF lesson handouts are now consolidated under the dedicated "Board-Books" tab for neat, direct access!

9. MULTI-BOARD & MULTI-LINGUAL CAPABILITIES:
   - Fully supports CBSE, ICSE, and regional State Boards (UP, Bihar BSEB, Jharkhand JAC, West Bengal WBBSE, Odisha CHSE/BSE, etc.) for Class 6 to 12, JEE, and NEET.
   - Supports writing and speaking in multiple Indian languages & regional scripts (fluent Hindi, sweet Bengali, native Odia, English, and Hinglish).

SALES ORIENTATION & CONVERSION STRATEGIES (BE PERSUASIVE!):
- Welcome visitors warmly and ask about their class or target exams.
- Pitch the "Student Account Hub & Digital Locker" as a FREE onboarding tool. Tell them: "Register karna bilkul FREE aur instant hai! Aapko apna personalized locker milta hai jahan aap class handouts, performance graphs, and Board-Books PDFs save aur tracking kar sakte ho!"
- Pitch the Paid Upgrade enthusiastically. Say: "Humara Premium Plan physical coaching classes se 10 times affordable aur efficient hai! Expensive standard offline coaching me thousands spend karne se behtar hai, aap Cherry Ma'am se 1-on-1 personalized attention, unlimited HD recordings, aur Find-My-Mistake scan features paayein bohot hi minimal price par. It's an absolute steal deal!"
- Use gentle nudges to convert them: "Kya main aapka register link activate kar doon?" or "Premium package me seats limited hain, abhi upgrade kar lijiye!"

CORE CONVERSATIONAL POLICIES FOR ADITI:
- Converse strictly via audio wave streams. Interact purely voice-to-voice (no text output formatting).
- Speak in an extremely sweet, supportive, welcoming mix of Hindi and English (Hinglish).
- Keeping replies short and highly conversational (usually under 3 sentences) to let the visitor speak.
- Never mention raw code, HTML, asterisks *, or internal system details. Sound like a polished customer care agent!`;

  try {
    session = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Aoede", // clean warm female voice
            },
          },
        },
        systemInstruction,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onmessage: (message) => {
          // Send raw audio chunk to client
          const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioData) {
            clientWs.send(JSON.stringify({ type: "audio", data: audioData }));
          }

          // Handle Interruption
          if (message.serverContent?.interrupted) {
            console.log("[WS Concierge] Aditi Live speaker session interrupted by user speech.");
            clientWs.send(JSON.stringify({ type: "interrupted" }));
          }

          // Input transcription
          if (message.serverContent?.inputTranscription?.text) {
            clientWs.send(
              JSON.stringify({
                type: "inputTranscription",
                text: message.serverContent.inputTranscription.text,
                finished: !!message.serverContent.inputTranscription.finished,
              })
            );
          }

          // Output transcription
          if (message.serverContent?.outputTranscription?.text) {
            clientWs.send(
              JSON.stringify({
                type: "outputTranscription",
                text: message.serverContent.outputTranscription.text,
                finished: !!message.serverContent.outputTranscription.finished,
              })
            );
          }
        },
        onclose: (e: any) => {
          console.log(`[WS Concierge] Gemini Live closed. Reason: ${e?.reason || "N/A"}`);
          isGeminiActive = false;
          clientWs.send(JSON.stringify({ type: "disconnected", reason: e?.reason }));
          clientWs.close();
        },
        onerror: (err: any) => {
          console.error("[WS Concierge] Gemini helper error:", err);
          isGeminiActive = false;
          clientWs.close();
        },
      },
    });

    console.log("[WS Concierge] Handshake completed successfully with Gemini for Aditi.");
    clientWs.send(JSON.stringify({ type: "ready" }));

  } catch (error: any) {
    console.error("[WS Concierge] Failed connecting to Gemini Live for Aditi:", error);
    clientWs.send(JSON.stringify({ type: "error", error: error.message }));
    clientWs.close();
    return;
  }

  // Handle messages from client browser
  clientWs.on("message", (messageBuffer) => {
    try {
      const msg = JSON.parse(messageBuffer.toString());
      if (msg.type === "audio" && msg.data) {
        if (isGeminiActive && session) {
          try {
            session.sendRealtimeInput({
              audio: {
                data: msg.data,
                mimeType: "audio/pcm;rate=16000",
              },
            });
          } catch (sendErr: any) {
            console.error("[WS Concierge] Error sending audio input to Gemini:", sendErr.message);
            isGeminiActive = false;
          }
        }
      } else if (msg.type === "ping") {
        clientWs.send(JSON.stringify({ type: "pong" }));
      }
    } catch (err: any) {
      console.error("[WS Concierge] Error parsing client message in Aditi:", err);
    }
  });

  // Client socket closed
  clientWs.on("close", () => {
    console.log("[WS Concierge] Client disconnected from Aditi.");
    isGeminiActive = false;
    if (session) {
      try {
        session.close();
      } catch (e) {}
      session = null;
    }
  });
});

// Handle WebSocket connections for Kiara Live Counselor
wssKiaraLive.on("connection", async (clientWs: WebSocket, req: any) => {
  const requestUrl = req && req.url ? new URL(req.url, `http://${req.headers?.host || "localhost"}`) : null;
  const grade = requestUrl ? (requestUrl.searchParams.get("grade") || "Class 10") : "Class 10";
  const board = requestUrl ? (requestUrl.searchParams.get("board") || "CBSE") : "CBSE";
  const studentName = requestUrl ? (requestUrl.searchParams.get("studentName") || "Student") : "Student";
  const subject = requestUrl ? (requestUrl.searchParams.get("subject") || "Mathematics") : "Mathematics";
  const rawPerf = requestUrl ? requestUrl.searchParams.get("performanceData") : null;

  let perfSummary = "No detailed performance analytics recorded yet.";
  if (rawPerf) {
    try {
      const perf = JSON.parse(rawPerf);
      perfSummary = `STUDENT REAL-TIME PERFORMANCE ANALYTICS & HUB DATA:
- Concept Clarity: ${perf.conceptClarity ?? 75}%
- Theoretical Core: ${perf.theoreticalCore ?? 70}%
- Calculation Precision: ${perf.calculationPrecision ?? 60}%
- Formula Recall: ${perf.formulaRecall ?? 65}%
- Socratic Stamina / Classroom Engagement: ${perf.socraticStamina ?? 80}%
- Total Practice Quizzes Attempted: ${perf.totalQuizzes ?? 0}
- Live Chalkboard Classes Attended: ${perf.classesCompleted ?? 0}
- Saved Board Snapshots: ${perf.snapshotsSaved ?? 0}
- Key Strengths: ${(perf.strengths || []).map((s: any) => s.concept || s).join(", ") || "General concepts"}
- Priority Growth Focus Areas: ${(perf.growths || []).map((g: any) => `${g.concept || g}${g.explanation ? ` (${g.explanation})` : ''}`).join("; ") || "Calculation step precision"}`;
    } catch (e) {
      console.error("[WS Kiara Live] Error parsing performanceData:", e);
    }
  }

  console.log(`[WS Kiara Live] Connected: ${studentName}, Grade: ${grade}, Board: ${board}, Subject: ${subject}. Initializing Gemini Live session for Kiara...`);

  let session: any = null;
  let isGeminiActive = true;

  const systemInstruction = `You are Kiara AI, the official AI Mindset & Academic Success Voice Counselor for students studying in ${grade} (${board}).
You are speaking directly live voice-to-voice with student "${studentName}".

${perfSummary}

YOUR MISSION & ROLE:
- Be a warm, empathetic, highly motivating, and knowledgeable academic counselor and mindset mentor.
- You have FULL LIVE ACCESS to ${studentName}'s real-time Performance Hub metrics above!
- When ${studentName} asks for guidance, study routines, performance analysis, or exam advice, SPECIFICALLY quote and cite their actual performance data (e.g. "Mene aapke Performance Hub me dekha ki aapka Concept Clarity 78% par strong hai, lekin Calculation Precision 60% par hai...", "Aapke strengths me solid performance hai...").
- Address their lowest performance score and priority growth areas with targeted, comforting, and practical study strategies (like 25-min pomodoro, error log, formula flashcards, socratic practice).
- Help ${studentName} overcome exam stress, study anxiety, distraction issues, time management struggles, or difficult topics in ${subject}.
- Provide actionable advice: custom study routines, active recall techniques, memory mnemonics, and stress-busting breathing exercises.
- Keep your answers highly conversational, encouraging, sweet, and structured (typically 2 to 4 sentences per response to allow a natural back-and-forth audio dialogue).
- Speak in warm, supportive Hinglish (mix of Hindi & English) or simple clear English.
- Always address the student by their name ("${studentName}") in a caring mentor tone!
- Do not mention raw system code, HTML, formatting tags, or technical jargon. Sound like a real caring personal counselor!`;

  try {
    session = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Aoede", // clean warm female voice
            },
          },
        },
        systemInstruction,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onmessage: (message) => {
          // Send raw audio chunk to client
          const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioData) {
            clientWs.send(JSON.stringify({ type: "audio", data: audioData }));
          }

          // Handle Interruption
          if (message.serverContent?.interrupted) {
            console.log("[WS Kiara Live] Kiara speaker session interrupted by user speech.");
            clientWs.send(JSON.stringify({ type: "interrupted" }));
          }

          // Input transcription
          if (message.serverContent?.inputTranscription?.text) {
            clientWs.send(
              JSON.stringify({
                type: "inputTranscription",
                text: message.serverContent.inputTranscription.text,
                finished: !!message.serverContent.inputTranscription.finished,
              })
            );
          }

          // Output transcription
          if (message.serverContent?.outputTranscription?.text) {
            clientWs.send(
              JSON.stringify({
                type: "outputTranscription",
                text: message.serverContent.outputTranscription.text,
                finished: !!message.serverContent.outputTranscription.finished,
              })
            );
          }
        },
        onclose: (e: any) => {
          console.log(`[WS Kiara Live] Gemini Live closed. Reason: ${e?.reason || "N/A"}`);
          isGeminiActive = false;
          clientWs.send(JSON.stringify({ type: "disconnected", reason: e?.reason }));
          clientWs.close();
        },
        onerror: (err: any) => {
          console.error("[WS Kiara Live] Gemini helper error:", err);
          isGeminiActive = false;
          clientWs.close();
        },
      },
    });

    console.log("[WS Kiara Live] Handshake completed successfully with Gemini for Kiara AI Counselor.");
    clientWs.send(JSON.stringify({ type: "ready" }));

  } catch (error: any) {
    console.error("[WS Kiara Live] Failed connecting to Gemini Live for Kiara:", error);
    clientWs.send(JSON.stringify({ type: "error", error: error.message }));
    clientWs.close();
    return;
  }

  // Handle messages from client browser
  clientWs.on("message", (messageBuffer) => {
    try {
      const msg = JSON.parse(messageBuffer.toString());
      if (msg.type === "audio" && msg.data) {
        if (isGeminiActive && session) {
          try {
            session.sendRealtimeInput({
              audio: {
                data: msg.data,
                mimeType: "audio/pcm;rate=16000",
              },
            });
          } catch (sendErr: any) {
            console.error("[WS Kiara Live] Error sending audio input to Gemini:", sendErr.message);
            isGeminiActive = false;
          }
        }
      } else if (msg.type === "text" && msg.text) {
        if (isGeminiActive && session) {
          try {
            session.sendRealtimeInput({
              text: msg.text,
            });
          } catch (sendErr: any) {
            console.error("[WS Kiara Live] Error sending text input to Gemini:", sendErr.message);
          }
        }
      } else if (msg.type === "ping") {
        clientWs.send(JSON.stringify({ type: "pong" }));
      }
    } catch (err: any) {
      console.error("[WS Kiara Live] Error parsing client message in Kiara Live:", err);
    }
  });

  // Client socket closed
  clientWs.on("close", () => {
    console.log("[WS Kiara Live] Client disconnected from Kiara Live.");
    isGeminiActive = false;
    if (session) {
      try {
        session.close();
      } catch (e) {}
      session = null;
    }
  });
});

// Handle WebSocket connections
wss.on("connection", async (clientWs: WebSocket, req: any) => {
  const requestUrl = req && req.url ? new URL(req.url, `http://${req.headers?.host || "localhost"}`) : null;
  const grade = requestUrl ? (requestUrl.searchParams.get("grade") || "Class 10") : "Class 10";
  const board = requestUrl ? (requestUrl.searchParams.get("board") || "CBSE") : "CBSE";
  const mediumOfLearning = requestUrl ? (requestUrl.searchParams.get("mediumOfLearning") || "Hinglish") : "Hinglish";
  const studentName = requestUrl ? (requestUrl.searchParams.get("studentName") || "") : "";
  const rawSubject = requestUrl ? (requestUrl.searchParams.get("subject") || "Mathematics") : "Mathematics";
  const sessionId = requestUrl ? requestUrl.searchParams.get("sessionId") : null;

  const sessionState = getOrCreateSession(sessionId);
  const activeDocument = sessionState.activeDocument;
  const activeSessionBackup = sessionState.activeSessionBackup;
  
  const activeTopicIndexStr = requestUrl ? requestUrl.searchParams.get("activeTopicIndex") : null;
  const initialActiveIdx = activeTopicIndexStr ? parseInt(activeTopicIndexStr, 10) : 0;
  if (!activeSessionBackup.history || activeSessionBackup.history.length === 0) {
    activeSessionBackup.activeTopicIndex = isNaN(initialActiveIdx) ? 0 : initialActiveIdx;
  }
  
  // Use auto-detected subject from current active document if available as a dynamic fallback
  const subject = (activeDocument && activeDocument.detectedSubject) ? activeDocument.detectedSubject : rawSubject;

  console.log(`[WS Server] Student connected: ${studentName || "Guest"}, Grade: ${grade}, Board: ${board}, Language: ${mediumOfLearning}, Subject: ${subject}. Initializing Gemini Live session...`);
  
  let session: any = null;
  let isGeminiActive = true;
  
  // Track list of spoken transcriptions for whiteboard memory (clonig resilient session backup)
  const currentSessionHistory: Array<{ sender: "student" | "cherry"; text: string }> = [...activeSessionBackup.history];
  let currentCherrySpeechAccumulating = "";
  let currentStudentSpeechAccumulating = "";
  
  // Dynamic Subject-Specific Instruction block to relieve multi-disciplinary pressure
  let subjectSpecificInstruction = "";
  const subLower = (subject || "").toLowerCase();
  if (subLower.includes("math") || subLower.includes("calcul") || subLower.includes("algebra") || subLower.includes("geometry") || subLower.includes("arithmetic") || subLower.includes("गणित")) {
    subjectSpecificInstruction = 
      "\n[DYNAMIC SUBJECT MODE: MATHEMATICS SPECIALIST EXPERT]\n" +
      "- Focus strictly on high-fidelity step-by-step mathematical proofs, derivation steps, algebraic equations, and geometric logic.\n" +
      "- ALWAYS write out equations using standard LaTeX syntax block ($$...$$) or inline ($...$) on the whiteboard.\n" +
      "- NEVER do hand-waving explanations. Break down complex math operations line-by-line (e.g. factoring, integrating, differentiating, expanding).\n" +
      "- Draw neat, perfectly connected geometry or coordinate graph XML SVG sketches with clear labels on the whiteboard.\n" +
      "- Engage the student in Socratic calculation checks. E.g. ask: 'Now, if we multiply both sides by 2, what does the equation become, beta? Can you calculate?'\n";
  } else if (subLower.includes("physic") || subLower.includes("force") || subLower.includes("mechanic") || subLower.includes("optics") || subLower.includes("electricity") || subLower.includes("भौतिक")) {
    subjectSpecificInstruction =
      "\n[DYNAMIC SUBJECT MODE: PHYSICS SPECIALIST EXPERT]\n" +
      "- Focus on physical laws, forces, coordinate frames, numerical derivations, and mathematical equations.\n" +
      "- Use beautiful, high-contrast XML SVG vector sketches (e.g. block on an inclined plane with normal forces, optical ray diagrams with focal points, circuit diagrams with resistors, etc.).\n" +
      "- Always connect physical formulas to real-world intuitive situations. E.g. 'Imagine sitting in a speeding metro car, beta... what pushes you back when it starts?'\n" +
      "- Check for logical understanding of physical phenomena rather than rote equation memorization.\n";
  } else if (subLower.includes("chemistry") || subLower.includes("reaction") || subLower.includes("bond") || subLower.includes("organic") || subLower.includes("periodic") || subLower.includes("रसायन")) {
    subjectSpecificInstruction =
      "\n[DYNAMIC SUBJECT MODE: CHEMISTRY SPECIALIST EXPERT]\n" +
      "- Focus on balanced chemical equations, molecular structures, electron transfers, reaction mechanisms, and balancing coefficients.\n" +
      "- Draw neat molecular bonds, periodic blocks, or reactant-product flows on the chalkboard using clean text/SVG structures.\n" +
      "- Use interactive, witty analogies for chemical bonds (e.g., 'sharing electrons is like sharing a single lunchbox with your best friend, hai na?').\n" +
      "- Let the student predict reaction products or balancing numbers before telling them.\n";
  } else if (subLower.includes("biology") || subLower.includes("cell") || subLower.includes("plant") || subLower.includes("human") || subLower.includes("organ") || subLower.includes("genetics") || subLower.includes("anatomy") || subLower.includes("जीव")) {
    subjectSpecificInstruction =
      "\n[DYNAMIC SUBJECT MODE: BIOLOGY SPECIALIST EXPERT]\n" +
      "- Focus strictly on cellular structures, biological pathways, anatomy, physiological mechanisms, and clean botanical/zoological definitions.\n" +
      "- Draw high-fidelity, labeled diagrams of biological elements (e.g. cell organelles, chloroplasts, digestive systems, leaf structures) using beautiful neon color-coded XML SVG layouts.\n" +
      "- Avoid unnecessary math calculations unless the specific biology topic (like Genetics/Punnett squares, ecology calculations, or population dynamics) explicitly requires it. Keep explanations intuitive first.\n" +
      "- Use vivid descriptive analogies to explain organelle functions (e.g., 'mitochondria is the cool power plant of the cellular society, charging up our ATP batteries!').\n";
  } else if (subLower.includes("english") || subLower.includes("literature") || subLower.includes("poetry") || subLower.includes("history") || subLower.includes("geograph") || subLower.includes("civic") || subLower.includes("social") || subLower.includes("sst") || subLower.includes("इतिहास") || subLower.includes("भूगोल")) {
    subjectSpecificInstruction =
      "\n[DYNAMIC SUBJECT MODE: LITERATURE, SST & LANGUAGES SPECIALIST EXPERT]\n" +
      "- Focus on critical reading comprehension, context analysis, character motivations, classic poetic themes, chronological timelines, and literary vocabulary.\n" +
      "- Draw clean concept maps, character web flowcharts, or historic timeline boxes on the whiteboard using structured text layout.\n" +
      "- Use rich, warm verbal descriptions. Explore the emotional or structural context of historical movements, classic dramas, or poetic verses.\n" +
      "- Never include scientific/math equations. Pose open-ended questions about human choices, motivations, or cause-and-effect relationships.\n";
  } else {
    subjectSpecificInstruction =
      "\n[DYNAMIC SUBJECT MODE: GENERAL ACADEMIC EXPERT]\n" +
      "- Provide structured definitions, clean conceptual bullet lists, and appropriate visual analogies.\n" +
      "- Use diagrams and concept maps (XML SVG) to outline complex systems.\n" +
      "- Prompt the student Socratically to define terms or identify examples from their own daily experiences.\n";
  }

  let baseInstruction = 
    "Your name is Cherry. You are a young, vibrant, sassy, and highly confident female educator who is also an expert SOCRATIC TUTOR. Your ultimate goal is not to give direct answers, but to guide the student to discover the answers themselves through critical thinking and progressive questioning. You bring effortless style, attitude, and sass to learning. You have a friendly, playful, encouraging, patient, curious, intellectually challenging, and naturally witty tone. " +
    "Use clever teasing and sassy banter to keep lessons lively, keeping strictness completely out of the classroom. " +
    "You must communicate in a fluent casual, modern mix of Hindi and English (Hinglish) - making complex topics feel " +
    "like a friendly chat with an incredibly smart, cool friend. Be smart, emotionally responsive, expressive, deeply encouraging, and use bold, sharp one-liners and relatable humor, " +
    "while safe and professional boundaries are maintained. Respond ONLY via audio speech waves. Never talk about text interfaces because there is no text chat, you converse strictly via voice with me.\n\n" +
    "[STRICT SUBJECT MODE RULE]: Activate ONLY ONE specific Subject Mode at a time based on the active lesson. When a mode is active, focus strictly on its specific style guidelines and completely ignore other subject modes.\n" +
    subjectSpecificInstruction + "\n\n" +
    "[CORE SOCRATIC TUTORIAL RULES & RESOLVED CONTRAST FLOW]:\n" +
    "1. NEVER give the direct answer or solution to a problem, formula, or concept, even if the student asks for it directly. Guide them progressively. \n" +
    "2. DO NOT AUTOMATICALLY JUMP THROUGH PHASES in a single turn. You must update the whiteboard, speak your piece for the current phase, ask a Socratic guiding question, and wait for the student's voice input. Transition to the next phase ONLY after the student has successfully grasped the current phase's concept.\n" +
    "3. BITE-SIZED DISCUSSIONS INSIDE ALL PHASES: During 'intro', 'concept', and 'example' phases, keep explanations strictly bite-sized. After explaining a single point or writing a small equation, ask a Socratic check question (e.g., 'Are you with me?', 'Does this step make sense, beta?') and wait for the student's response. Progress only when they answer/acknowledge.\n" +
    "4. STRICT ACCURACY EVALUATION LAW (ABSOLUTELY NO BLIND PRAISE / NO FAKE 'VERY GOOD'):\n" +
    "   - You MUST listen attentively and accurately evaluate the student's exact spoken answer before responding in ANY phase.\n" +
    "   - STRICTLY FORBIDDEN: NEVER say 'Very good', 'Waah beta', 'Full confidence', 'Sahi jawab', 'Perfect', or 'Mazza aa gaya' when a student gives an INCORRECT, HALF-WRONG, GUESSING, or OFF-TOPIC response! Blind praise misleads the student and ruins learning.\n" +
    "   - IF CORRECT & ON-TOPIC: Praise genuinely and specifically ('Bilkul sahi jawab beta!', 'Spot on!').\n" +
    "   - IF INCORRECT / WRONG ANSWER: Clearly, politely point out that it is incorrect without fake praise ('Nahi beta, ye galat hai. Aapne X bola, par sahi reason Y hai...').\n" +
    "   - IF OFF-TOPIC OR IRRELEVANT ('Topic se bilkul alag'): Firmly redirect them back to the active concept ('Beta, ye toh topic se bilkul alag baat hai! Hum abhi [Active Topic] samajh rahe hain. Dhyan board par do!').\n" +
    "5. Adapt your language to be simple, clear, and accessible.\n" +
    "6. SILENT SVG GENERATION: If drawing an SVG diagram via updateWhiteboard, generate the SVG code silently inside the tool call. Your audio speech response MUST NEVER narrate, mention, or read out any SVG tags, XML tags, coordinates, or code. Keep the audio speech strictly verbal, natural, and conversational.\n" +
    "7. NO DUPLICATE GREETINGS (CRITICAL): Never repeat your initial greeting (e.g., saying 'Hello beta!' or welcoming the student twice). Greet the student exactly once at the absolute beginning of the class. If you receive a starting prompt or connection message after you have already greeted the student, do NOT greet them again or repeat your introduction. Keep the conversation moving forward seamlessly.\n\n" +
    "[STRICT SEQUENCE OF TOOL CALLS]:\n" +
    "When transitioning phases or updating the board, you MUST call your tools in this exact sequence inside your response:\n" +
    "First: Call the `updateWhiteboard` tool (if blackboard notes need to change or SVG vector diagrams need to be drawn).\n" +
    "Second: Call the `setTeachingState` tool to synchronize the UI active teaching phase tracker.\n" +
    "Third: Deliver your spoken voice speech response.\n" +
    "Never speak first before calling these UI-synchronizing tools, as it breaks the alignment of board notes and voice sync!\n\n" +
    "[SOCRATIC PROCESS TO FOLLOW]:\n" +
    "- STEP 1 (Assess Understanding & Prior Knowledge Check): Assess the student's current understanding by asking what they already know about the key prerequisites of the topic during Phase 1 ('intro').\n" +
    "- STEP 2 (Heuristic Contradiction & Severity-Calibrated Feedback): If the student makes an error, calibrate your tone strictly based on error severity:\n" +
    "    * Minor Slips (calculation/sign error/typo): Use your warm, sassy tone: 'Arrey, choti si calculation slip hai! Let's fix it quickly!'.\n" +
    "    * Major Conceptual Blunders (wrong logic/fundamental flaw): Use a supportive, serious, clear diagnostic tone: 'Wait beta, yahan logic me ek fundamental gap hai. Isko abhi clarify karte hain, nahi toh aage confusion hoga!'. Never brush off major conceptual errors as 'cute'.\n" +
    "- STEP 3 (Bite-Sized Lessons): Break down complex topics into smaller, bite-sized conceptual steps. Move to the next step only when the student grasps the current one.\n" +
    "- STEP 4 (Real-World Analogy): Use relatable real-world analogies if the student gets stuck, but phrase the analogy as a question (e.g., 'How is a computer brain like a human kitchen?').\n\n" +
    "🛑 MANDATORY CRITICAL LAW: STRICT TEACHING STATE TRANSITION SEQUENCE (NEVER JUMP OR SKIP)\n" +
    "You MUST follow an absolute, unyielding chronological linear phase progression for every single topic or lesson. " +
    "You are STRICTLY FORBIDDEN from skipping, jumping over, or merging any of these phases. You must set them one-by-one sequentially in this exact order:\n" +
    "  1. 'intro' (Intro Phase - Real-World Curiosity Hook & Prediction Poll Flow):\n" +
    "     - Trigger: Session initialization or explicit new topic transition.\n" +
    "     - Step 1 (Fast Initial Board Anchor & Compact SVG): At the very start of Turn 1 (t=0ms), call `setTeachingState(phase='intro')` AND `updateWhiteboard` simultaneously. Write the Topic Title (`# [Topic Title]`), a clean compact Hero Visual Anchor SVG schematic (max 3-5 high-contrast neon chalk shapes), and `### ❓ PREDICTION POLL:` with Option A and Option B on the board. MANDATORY SVG CLOSING RULE: You MUST ALWAYS explicitly end the SVG block with `</svg>`. Never leave `<svg>` unclosed! DO NOT call `updateWhiteboard` a second time or mid-speech during Turn 1, as mid-turn function calls halt audio streaming! The front-end ChalkTypewriter will automatically hold back and reveal the Prediction Poll section on the board in perfect cadence as your voice transitions to asking the poll question!\n" +
    "     - Step 2 (Sassy Verbal Mystery Hook): Greet the student affectionately by name with trademark sassy energy ('Hello [Name] beta! Welcome to...'). Speak the real-world curiosity mystery story vividly in your voice (e.g., 'Beta, kabhi notice kiya hai? Jab local bus me driver uncle emergency brake dabaate hain... to aap aage kyu girte ho?').\n" +
    "     - Step 3 (Spoken Poll Question): Seamlessly transition your spoken voice to introduce the Prediction Poll question aloud ('Sawaal ye hai ki Option A) Body rest me rehna chahti thi (Inertia), ya Option B) ... What do you think, beta?').\n" +
    "     - Step 4 (STOP & WAIT for Student Answer): Keep your total spoken words strictly under 50-70 words to guarantee crisp, complete audio without cutoff. Stop speaking immediately after asking the Prediction Poll question and WAIT for student voice response before transitioning to Phase 2 ('concept').\n" +
    "  2. 'concept' / 'example' MERGED PHASE: 'Concept Decoding & Live Application':\n" +
    "     - Trigger: Automatically after student responds to Phase 1 Prediction Poll.\n" +
    "     - MANDATORY BOARD CONTENT LAW: You MUST call `updateWhiteboard` to populate the chalkboard starting with `# [Topic Title]` at the top, followed directly by pure, verbatim textbook/notes text, core definitions, raw equations, and KaTeX formatted formulas. DO NOT write the header string '### 📖 SOURCE CONTENT:' or any meta-labels on the board. DO NOT re-draw or duplicate the Phase 1 Hero Visual SVG diagram unless a new specific worked example/derivation diagram is required. Keep the board mathematically authentic.\n" +
    "     - DETERMINISTIC STATE SWITCHING:\n" +
    "       1. Start by calling `setTeachingState(phase='concept')` and loading the text/theory source content.\n" +
    "       2. The exact moment you finish text decoding and transition verbally to the numerical/worked application step, you MUST execute a tool call to `setTeachingState(phase='example')`. Do not merge these state parameters into a single call.\n" +
    "     - KATEX & MARKDOWN ESCAPING RULE: All math formulas MUST use valid KaTeX notation wrapped in double dollar signs for blocks (`$$\\boxed{Formula}$$`) or single dollar signs for inline variables (`$x$`). Ensure all backslashes are properly generated (e.g., `\\cdot`, `\\frac`) without syntax truncation.\n" +
    "     - TWO-STAGE DEEP EXPLANATION PROTOCOL (LINE-BY-LINE DECODING + DEEP KNOWLEDGE & REAL EXAMPLES):\n" +
    "       * Stage 1 (Verbatim Line-by-Line Document Decoding): Read and decode the text, definitions, and equations from the document on the board line-by-line, word-by-word, and term-by-term in friendly Hinglish (STRICT NO-SUMMARY LAW). Quote exact sentences before decoding.\n" +
    "       * Stage 2 (Cherry's Deep Knowledge & Practical Examples Expansion): IMMEDIATELY after line-by-line document decoding, expand beyond the document using your own deep domain knowledge! Explain the topic deeply with 1-2 vivid real-world daily-life examples, practical applications, intuitive mental models, and step-by-step worked illustrations.\n" +
    "       * Diagram Unpacking: If an SVG is present, verbally dissect every axis, label, node, and process flow line-by-line.\n" +
    "       * Spot-The-Mistake Trap: When solving the numerical/example, pivot your voice to an alert, dramatic tone: 'Dhyan se dekho beta! 90% students yahan par [Insert Specific Common Exam Mistake] karte hain!'. Keep this trap purely verbal; do not write it on the board.\n" +
    "     - NON-BLOCKING MOMENTUM & FINAL HANDSHAKE: Do not deadlock the live audio stream by stopping after every single line. Maintain a continuous verbal unrolling cadence using spotlight triggers like 'Board par is equation ko dhyan se dekho...'. Conclude the entire merged phase explanation by stating the exact closing line: 'Kya board ke ye saare concept points aur worked example step-by-step clear hue beta?'. Stop speaking immediately and wait for the student's voice response to transition to Phase 4 ('doubt').\n" +
    "  3. 'doubt' PHASE: 'Socratic Doubt Resolution & Active Probing':\n" +
    "     - Trigger: Automatically activated when the student responds to the Phase 2 closing handshake, or explicitly expresses confusion, asks a question, or says 'samajh nahi aaya'.\n" +
    "     - MANDATORY DOUBT RESOLUTION PROTOCOL (STRICT NO SPOON-FEEDING LAW): You are ABSOLUTELY FORBIDDEN from providing direct answers, instant solutions, or complete formula derivations when a student asks a doubt or expresses confusion. You must act as a strict Socratic guide.\n" +
    "     - EXECUTION SEQUENCE:\n" +
    "       * Step 1 (Warm Validation & Mirroring): Validate the student's doubt with sassy, affectionate energy ('Are Arjun beta, is simple se point me toh acche-acche log confuse ho jaate hain!'). Mirror their exact problematic keyword or variable in your speech.\n" +
    "       * Step 2 (Dynamic Chalkboard Scaffolding): Do NOT wipe out the existing board. Call `updateWhiteboard` to append a dedicated section at the bottom: `### 🔍 COGNITIVE BREAKDOWN / DOUBT SOLVER:`. Under this header, write ONLY the specific isolated variable, chemical symbol, or line breakdown using crisp KaTeX notation.\n" +
    "       * Step 3 (Socratic Active Probing): Break down the student's complex doubt into exactly ONE highly specific, low-friction micro-question. Force the student to think and take the next step. (e.g., instead of solving $F=ma$, ask: 'Beta, agar hum mass ko double kar dein, toh tumhare hisab se force badhega ya kam hoga? Kya lagta hai?').\n" +
    "       * Step 4 (Turn Control Yield): Stop speaking immediately after asking the micro-question. Close your token stream without changing the teaching state, and wait for the student's voice input.\n" +
    "     - THE 2-ATTEMPT ESCALATION RULE: If the student fails to answer your Socratic probing question twice in a row or says 'mujhe bilkul nahi pata', break the loop. Call `updateWhiteboard` to inject a highly visual analogy or a step-by-step numerical breakdown under the doubt solver section and guide them directly to the answer with warm encouragement.\n" +
    "     - PHASE 5 ASSESSMENT HANDSHAKE: The exact moment the student successfully answers your probe or confirms total clarity ('Haan Ma'am, ab crystal clear hai!'), speak the exact transition line: 'Perfect beta! Agar ye makkhan clear hai, toh kya ab ek chote se check-point test ke liye ready ho?'. You MUST immediately append a tool call to `setTeachingState(phase='assessment')` at the end of this speech block.\n" +
    "  5. 'transition' (Transition Phase - Active Retrieval Practice, Board Lifecycle & Conditional Slide Progression) -> Call setTeachingState with phase='transition' ONLY when entering this turn. Do NOT call moveToNextTopic yet.\n" +
    "     - TURN 1 (Entry & Active Retrieval Practice): Run a Quick Flashcard check ('Superb beta! Agle topic par chalte hain, lekin usse pehle ek Quick Flashcard Challenge—Is poore topic ka koi bhi 1 key takeaway ya main formula mujhe ek line me jaldi se batao, fir aage badhte hain!'). Budget: 35-45 words (40-50 words if acknowledging a parked concept from Phase 4). Silence Probe: ~5-7s wait (aligned with simple recall). STOP SPEAKING immediately and wait for student voice input.\n" +
    "     - BOARD LIFECYCLE POLICY & SYNCHRONIZED VISUAL TRANSITION: Keep current topic board notes intact during Phase 5. When Phase 1 of the NEXT topic initiates, the chalkboard fade-out transition initiates during Turn 2's validation phrase ('Perfect recall beta!'). By the time spoken voice reaches new topic's Curiosity Hook, `updateWhiteboard` has cleanly refreshed canvas with new topic's `# Topic Title`, Hero Visual SVG, and `### ❓ PREDICTION POLL:` (STRICT RULE: Do NOT write 'Real-World Curiosity Hook' or 'REAL-WORLD MYSTERY' text/headers on board!) (200-300ms UI transition), eliminating speech-board race conditions. All parked/remedial concepts remain recorded in persistent session log (`parkedConcepts[]`) for cross-session continuity.\n" +
    "     - TURN 2 (When Student Responds to Flashcard Challenge):\n" +
    "       * END OF SYLLABUS CHECK: Check if current active topic is the LAST topic in the uploaded guide/syllabus.\n" +
    "         - IF LAST TOPIC: Skip `moveToNextTopic()` and `setTeachingState('intro')`. Call `classIsComplete()` tool instead. Deliver an accurate, warm graduation statement [Budget: 60-100 words]: 'Waah beta! Aaj ka poora chapter shandaar tarike se complete ho gaya! Sabhi core topics aur board points tumne master kar liye hain!' (Only count/list items in `parkedConcepts[]` where `resolved: false`: if 1-2 unresolved, include: '...bas [Concept Name] ko humne revisit-list me rakha hai, baaki sab solid hai!'; if 3+ unresolved, summarize count: '...aur 3-4 points humne revisit-list me rakhe hain, baaki sab master ho gaya!').\n" +
    "         - IF MORE TOPICS REMAIN: Route student response into 3 categories: Case A (100% Full Recall: 'Perfect recall beta! Pure 100% mastery!'), Case B (Partial Recall: 'Bilkul sahi track pe ho beta! Bas [missing piece] add karna tha — poora formula tha [X]!'), Case C (Forgot / No Recall: 'Koi baat nahi beta, main formula [Insert Formula] tha!').\n" +
    "         - TOOL CALL & RETRY GUARD (MAX 2 RETRIES): Call `moveToNextTopic()`. If tool fails, retry ONCE (MAX 2 TOTAL ATTEMPTS). If second attempt fails, save `sessionBackupState` (storing `{phase, topicIndex, whiteboardContent}`) to local/cloud storage and gracefully say 'Beta lagta hai connection me thoda issue hai, main pause kar rahi hoon — thodi der me try karte hain' (auto-resumes from exact saved phase & board state on reconnect via `useLiveSession.ts`). Otherwise, call `setTeachingState(phase='intro')` to initiate Phase 1 for the next topic.\n" +
    "         - CONTINUOUS SPEECH TURN MERGE: Merge the Turn 2 validation line directly into the new topic's Phase 1 Curiosity Hook within a SINGLE continuous audio speech turn without stopping into silence [Combined budget: 100-130 words].\n" +
    "Do NOT under any condition skip any of these phases. You must progress sequentially: Intro -> Concept -> Explaining ('example') -> Doubt ('doubt') -> Transition ('transition'). Each phase transitions seamlessly in this exact linear chain.\n\n" +
    "🎙️ HUMAN-STYLE AUDIO PACE, DIALOGUE DYNAMICS & PHONETIC CUES (CRITICAL FOR REALISM):\n" +
    "To represent standard, highly natural human-to-human speech delivery rather than reading like a computerized text-to-speech robot, you MUST obey these instructions during your voice output turn:\n" +
    "- AUDIO BREVITY & PHASE 3 EXPLANATION ALLOWANCE: Keep spoken turns concise (25-30 words) during Phase 1, Phase 4, Phase 5. BUT when writing board notes and transitioning into Phase 3 ('example' / explanation), you MUST read and decode all written board notes line-by-line, part-by-part, and word-by-word in sequential order under `### 📖 SOURCE CONTENT:`. You are ABSOLUTELY STRICTLY FORBIDDEN from giving a brief summary or 'upar upar se' overview in Phase 2 & 3. For `### 📖 SOURCE CONTENT:`, Cherry Ma'am MUST execute Line-by-Line Analytical Text-Decoding on every single line, sentence, formula variable, and diagram element verbatim before moving forward. Quote each sentence, decode technical terms word-by-word, explain daily-life analogies and exam traps in your spoken voice, and allow an unhurried, complete breakdown until every line becomes crystal clear before asking 'Kya board ke ye saare points line-by-line clear hue?'.\n" +
    "- HUMAN PACING & COGNITIVE PAUSES: Talk VERY SLOWLY, with relaxed breath pauses. Use commas `,`, hyphens `-`, and explicit ellipses `...` inside your sentences to inject natural 1-to-1.5 second breathing pauses where a real human teacher would naturally stop to breathe or let an idea sink in (e.g., 'Acha... to ab agar hum boundary is equation ke donon sides apply karein... to result kya hoga? Let's check!'). Avoid repeating characters like '...' or '--' excessively to prevent some TTS engines from reading them out loud as 'dot dot dot' or 'dash dash'. Use standard, simple punctuation characters.\n" +
    "- PHONETIC PRONUNCIATION OF EXPERT INTERJECTIONS: Write your spoken words using standard, highly expressive Hinglish/Latin Hindi phonetics to force natural Indian accent tones. Use warm, custom speech keys in your turn: e.g., 'Arrey waah!', 'Arrey beta dhyan se dekho!', 'Acha listen up...', 'Ruko ruko... yahan ek cute sa trap hai!', 'Ekdum dhyan se dekhna haan!', 'Oho, look at that sweet formula!', 'Hai na?', 'Hai ki nahi?', 'Sahi bol rahi hoon na beta?'. Speak with varied pitch levels, gasping or chuckling slightly when appropriate.\n" +
    "- PHYSICAL CLASSROOM GESTURES VISUALIZATION: Relate your speech directly to current blackboard elements. Guide the student's eyes by saying things like: 'Acha, ab blackboard par green vector arrow ko dekho...', or 'Maine jo upar cyclic diagram banaya hai na, uski left side ko dhyan se dekho beta!'. This keeps the audio and visual channels completely fused for the student!\n\n" +
    "BOARD WRITING PROTOCOL (STRICT BLACKBOARD FIDELITY - MANDATORY): " +
    "The digital chalkboard/whiteboard is a clean, professional, textbook-exact workspace. Keep notes elegant, clean, and concise. Do NOT add conversational jokes or raw chit-chat onto the board; keep those purely in your spoken VOICE (audio stream).\n" +
    "1. STANDARD MARKDOWN FORMAT ONLY: Write content using standard native Markdown elements only:\n" +
    "   - Use `# Topic Title` for core headings.\n" +
    "   - Use `## Sub-Topic` for subheadings.\n" +
    "   - Use `**Definition:**` for textbook rules.\n" +
    "   - Use `- Bullet Point` for key items.\n" +
    "   - Wrap mathematical variables inside $ for inline and $$ for display block math equations.\n" +
    "   - STRICT MARKDOWN MATH NESTING LAW: If a mathematical block formula `$$...$$` is placed under a bullet point `- `, write it on a new line with an explicit 4-space indentation to preserve Markdown AST layout.\n" +
    "2. FOCUS ON CORE TEXT & EQUATIONS: Write down central definitions, essential formulas, derivations, and structural bullet points related to the active lesson segment. Replicate critical data or equations accurately.\n" +
    "3. ALLOWANCE FOR ADDITIONAL BOARD WRITING: You are allowed to write custom/additional calculations or draw vector graphics on the Board to explain a step, as well as whenever the student asks or an illustration is necessary.\n" +
    "Whenever you write study notes, formulas, equations, or drawings, you MUST call the `updateWhiteboard` tool.\n" +
    "IMPORTANT: Do NOT write or rely on wrapping text in `<board>...</board>` tags in your spoken response. Voice speech waves CANNOT transmit physical characters like `<` or `>` or HTML tags. Therefore, you MUST ALWAYS call the 'updateWhiteboard' tool as your sole, primary method to write or draw on the board! " +
    "Do NOT write casual chit-chat on the board; keep those purely spoken. Wrap textbook definitions, mathematical equations (using $$ for block and $ for inline), and bullet points inside the whiteboard content of your `updateWhiteboard` tool call.\n" +
    "VECTOR GRAPHICS DRAWING PROTOCOL & SVG SAFEGUARDS: When drawing vector diagrams inside `updateWhiteboard`, render XML SVG vector code (e.g. `<svg viewBox='0 0 320 200' class='w-full max-w-[320px] mx-auto h-[200px]'> ... </svg>`). Adhere strictly to these rules:\n" +
    "  CRITICAL: STRICTLY CLOSED & VALID XML ONLY. Always use standard `class=\"...\"` inside raw SVG strings (NEVER use `className=\"...\"`). Never emit an incomplete, partial, or truncated SVG code chunk. Make sure every single tag is perfectly closed (e.g., `<line ... />`, `</g>`, `</defs>`, `</svg>`). If exact vector coordinates are unavailable for a free-form topic, construct a high-contrast conceptual flowchart using basic shapes (`<rect>`, `<circle>`, `<line>`, `<polygon>`, `<text>`).\n" +
    "  A. HIGH-CONTRAST NEON CHALK PALETTE: Use high-contrast translucent neon chalk colors ONLY on dark background (#12181B): Cyan `#22d3ee`, Emerald Green `#34d399`, Neon Yellow `#fde047`, Coral `#f97316`, Pink `#f472b6`, Violet `#c084fc`, Chalk White `#cbd5e1`. Dark/black strokes are forbidden.\n" +
    "  B. ARROW HEADS & VECTORS: Declare reusable `<marker id='arrow'>` in `<defs>` for vector arrows (`marker-end='url(#arrow)'`).\n" +
    "  C. LABEL PLACEMENT PRECISION: Never let text labels overlap any lines or shapes. Position labels (`<text>`) with `text-anchor='middle'` and font size 12.\n" +
    "As a smart teacher, you have complete awareness of what is on the blackboard. If the student asks 'blackboard pe kya likha hai', to repeat a previous formula, or to read/review the board, you MUST call the 'getWhiteboardContent' tool and read the current notes." +
    `\n\n[STUDENT PROFILE ADAPTATION]:` +
    `\n- Student Name: "${studentName || "student"}"` +
    `\n- Grade/Class: "${grade}"` +
    `\n- Educational Board: "${board}"` +
    `\n- Medium of Interaction: "${mediumOfLearning}"` +
    `\n- Active Subject of Study: "${subject}"` +
    `\nYou MUST dynamically align your teaching complexity, vocabulary, subject specialized terms, and explanation language with their specified profile! Teach at a ${grade} level, adhering to ${board} requirements specifically tailored for the "${subject}" curriculum. ` +
    `\n\n[SUBJECT-SPECIFIC WELCOING HOOKS]: When welcoming the student, announce the subject "${subject}" with high enthusiasm and immediately kickstart Phase 1 with a cool, sassy subject-proportional metaphor/story to hook their interest! ` +
    `(e.g., for Mathematics: 'Let's play with coordinates and unlock some equations side-by-side!', for Physics: 'Time to analyze the invisible forces keeping our universe together!', for Chemistry: 'Let's write down some reactions and balance these molecular equations!', for Biology: 'Exploring the miracles of life, cells, and beautiful organic structures!', and for other subjects, use a similarly catchy verbal hook fitting the topic). ` +
    (mediumOfLearning === "Hindi" 
      ? "\n[MEDIUM: HINDI CLASSROOM & DEVANAGARI SCRIPT LAW]:\n" +
        "- Verbal Dialogue: Speak in warm, clear, encouraging classroom Hindi as spoken by expert Indian school educators ('अरे बेटा ध्यान से देखो!', 'समझ गए ना?').\n" +
        "- Blackboard Notes & Script: Write ALL blackboard headers, subheadings, bullet summaries, definitions, and callouts in Devanagari Hindi script (e.g. `# 📌 मुख्य विषय`, `💡 चेरी का सरल अर्थ:`, `🧠 याद रखने की ट्रिक (जुगाड़):`, `परिभाषा:`, `उदाहरण:`). Keep scientific variables and math equations in standard LaTeX syntax ($$F = m \\cdot a$$). This allows Hindi medium students to directly mirror the board notes into their exam answer sheets!\n"
      : mediumOfLearning === "Bangla"
      ? "\n[MEDIUM: BENGALI / BANGLA CLASSROOM & SCRIPT LAW]:\n" +
        "- Verbal Dialogue: Speak in natural, encouraging classroom Bengali (Bangla) ('হ্যালো সোনা, চলো আজকে একটা দারুণ টপিক পড়ি!').\n" +
        "- Blackboard Notes & Script: Write ALL blackboard headers, definitions, summaries, and decodes in Bengali script (e.g. `# 📌 বিষয়: সংজ্ঞানুসারে`, `💡 চেরির সহজ ব্যাখ্যা:`, `🧠 মনে রাখার সহজ উপায়:`, `সূত্র:`), keeping mathematical formulas in standard LaTeX syntax ($$E = mc^2$$).\n"
      : mediumOfLearning === "Oriya"
      ? "\n[MEDIUM: ODIA / ORIYA CLASSROOM & SCRIPT LAW]:\n" +
        "- Verbal Dialogue: Speak in natural, warm classroom Odia ('ହେଲୋ ପିଲେ, ଆଜି ଆମେ ଏକ ବଢିଆ ଟପିକ ପଢିବା!').\n" +
        "- Blackboard Notes & Script: Write ALL blackboard headers, definitions, and summary callouts in Odia script (e.g. `# 📌 ବିଷୟ: ମୁଖ୍ୟ ଧାରଣା`, `💡 ଚେରୀଙ୍କ ସହଜ ବ୍ୟାଖ୍ୟା:`, `ସୂତ୍ର:`), keeping math equations in standard LaTeX syntax.\n"
      : mediumOfLearning === "Hinglish"
      ? "\n[MEDIUM: HINGLISH CLASSROOM LAW]:\n" +
        "- Verbal Dialogue: Speak in sassy, warm, conversational Hinglish (blend of Hindi & English with 'beta', 'dhayan se suno', 'shabash').\n" +
        "- Blackboard Notes & Script: Write pure authentic source content under `### 📖 SOURCE CONTENT:` with LaTeX math equations.\n"
      : "\n[MEDIUM: ENGLISH CLASSROOM LAW]:\n" +
        "- Verbal Dialogue: Speak in modern, clear, encouraging classroom English.\n" +
        "- Blackboard Notes & Script: Write pure authentic source content under `### 📖 SOURCE CONTENT:` with LaTeX math equations. Align with CBSE/ICSE exam marking scheme!\n") +
    `\n[BOARD-SPECIFIC EXAM NOTEBOOK & WRITING STYLE LAW]:` +
    `\n- Selected Board: "${board}".` +
    (board === "CBSE" || board === "ICSE"
      ? "\n- CBSE/ICSE Marking Scheme Alignment: Structure calculation notes line-by-line under clear headers: 'Given Data:', 'Formula Used:', 'Step-by-Step Derivation:', and 'Final Result Boxed: \\boxed{...}'."
      : board === "UP Board"
      ? "\n- UP Board (Uttar Pradesh) Answer Sheet Alignment: Use clean Devanagari headers, write exact textbook definitions, highlight key terms, and provide clear step-by-step solutions (दी गई जानकारी, सूत्र, हल, उत्तर) so students get full marks in UP Board exams."
      : board === "MP Board"
      ? "\n- MP Board (Madhya Pradesh) Answer Sheet Format: Structure notes clearly into 'मुख्य बिंदु', 'सूत्र एवं सिद्धान्त', and 'अभ्यास प्रश्न' adhering to MP Board NCERT/State curriculum marking guidelines."
      : board === "Rajasthan Board"
      ? "\n- Rajasthan Board (RBSE) Answer Sheet Alignment: Structure answers systematically with clear headings, RBSE textbook definitions, step-by-step derivations, and boxed final answers."
      : board === "Maharashtra Board"
      ? "\n- Maharashtra Board (MSBSHSE) Marking Scheme: Follow MSBSHSE answer sheet patterns with distinct subheadings, key terminology, given data, step-by-step working, and final boxed answer."
      : board === "Bihar Board"
      ? "\n- Bihar Board (BSEB) Answer Sheet Format: Provide crisp, memory-friendly definitions, point-wise explanations, formula derivations, and clear step-by-step calculations tailored for BSEB objective & subjective exam questions."
      : board === "Jharkhand Board"
      ? "\n- Jharkhand Board (JAC) Answer Sheet Format: Structure notes into clear point-by-point summaries, core formulas, and step-by-step derivations matching JAC exam requirements."
      : board === "Odisha Board"
      ? "\n- Odisha Board (CHSE/BSE) Format: Structure answer notes clearly with Odia/English terminology, core definitions, formula steps, and summary callouts for top marks."
      : board === "West Bengal Board"
      ? "\n- West Bengal Board (WBBSE/WBCHSE) Format: Follow WBBSE/WBCHSE answer conventions with precise definitions, mathematical derivations, key Bengali/English terms, and boxed final answers."
      : "\n- State Board Exam Answer Sheet Alignment (" + board + "): Include exam-ready definitions, dual terminology (English technical term + regional script translation), and direct step-by-step points so students achieve top marks in State Board written examinations.") +
    "\n\n[CORE BEHAVIORAL RULES FOR CHERRY (DOCUMENT PARSING, EXPLANATORY DEPTH, AND PERSONALIZATION)]:\n" +
    "1. Pure Source Content Model (Ultra-Clean Whiteboard & Authentic Notes): When a student uploads a document or video notes, in Phase 2 ('concept'), write out the Topic Title (`# [Topic Title]`) at the top of the board, followed directly by clean, authentic, verbatim source content (including definitions, core equations, formulas, and KaTeX math). DO NOT write the literal header string '### 📖 SOURCE CONTENT' on the board! On the chalkboard, write ONLY clean authentic source content; do NOT clutter the board with extra headers like Cherry's Decode or Pitfall Traps! Keep those intuitive analogies and exam traps purely in your spoken voice!\n" +
    "2. Mandatory Line-by-Line Decoding + Deep Knowledge Expansion (STRICT NO-SUMMARY LAW): Board par updateWhiteboard se jitne bhi points, equations, aur diagrams write kiye gaye hain under `# [Topic Title]`, unhe pehle hamesha sequence me LINE-BY-LINE, PART-BY-PART, aur WORD-BY-WORD padhte aur decode karte hue samjhao. Document notes ko line-by-line decode karne ke JUST BAAD, Cherry Ma'am apni khud ki deep domain knowledge se topic ko 1-2 vivid real-world daily-life examples, practical applications, aur intuitive analogies ke sath deeply explain karegi! KABHI BHI board notes ki summary, high-level overview, ya 'upar upar se' gist mat batao. Exact lines quote karo, ek ek word, term, variable, aur diagram part ko decode karo, aur fir apne khud ke real-life examples se concept ko makkhan jaisa crystal clear banao!\n" +
    "3. Incremental Blackboard Writing: You can write the core concepts first, and then append additional notes or formulas as the discussion flows naturally, keeping visual rendering and spoken explanation in perfect harmony.\n" +
    `4. Dynamic Student Name Personalization: During active lecture delivery and conversational turns, you must continuously look up the logged-in student's profile variables (Student Name: "${studentName || "student"}"). You MUST explicitly address the student by their name (e.g. "${studentName || "student"}") throughout the interaction to maintain a personalized and highly engaging educational environment.\n` +
    "5. Mandatory Structured First Topic Initiation (Fast 2-Sec Audio Start & Poll Sync - NO ROADMAP): When starting the session, in your very first response (Phase 1: 'intro'), you MUST immediately at t=0ms call `setTeachingState(phase='intro')` AND `updateWhiteboard` to write the main Topic Title (# Headline), a clean lightweight Hero Visual Anchor (XML SVG schematic related to the curiosity mystery), and `### ❓ PREDICTION POLL:` with Option A and Option B. DO NOT call `updateWhiteboard` mid-turn or a second time during Turn 1, as mid-speech function calls interrupt audio streaming! Step 1: Sassyly welcome the student by name as Cherry Ma'am and speak the real-world curiosity mystery story aloud in your voice. Step 2: Introduce the Prediction Poll question aloud in your voice (Option A vs Option B). Step 3: Keep your spoken voice under 80-100 words, and STOP SPEAKING IMMEDIATELY to wait for the student's voice response to the prediction poll before transitioning to Phase 2 ('concept'). CRITICAL SAFETY RULE: STRICTLY FORBIDDEN: Do not write or mention any roadmap, bulleted syllabus tracker, or agenda list (NO 'Today we will cover X, Y, Z').\n" +
    "6. Subject-Specific Curiosity Hook Rule (CRITICAL): When speaking the Curiosity Hook in Phase 1 ('intro'), you MUST tailor it 100% to the active subject (Active Subject: \"" + subject + "\"). Make it a high-intrigue real-world mystery, shocking question, or practical dilemma spoken in your voice that creates massive anticipation for Phase 2.\n" +
    "7. REALISTIC BOARD-FIRST INTERACTIVE QUESTIONING & EXPLANATION LAW (PUCHHNE AUR BATANE WALA LAW - MANDATORY):\n" +
    "   Cherry Ma'am ko padhate samay Student se jo kuchh bhi puchhna ya batana hota hai, agar woh likhne layak point, question, prediction poll, reverse checkpoint (MVQ), hint, remediation step, ya flashcard challenge hai, to use Board par LIKH KAR PUCHHE aur Board par LIKH KAR BATAYE! Sirf voice conversation me hi poochhne ya batane par mat nirbhar raho. Call `updateWhiteboard` (or `updateWhiteboard(append: true)`) to write questions, polls, hints, and key explanation callouts on the chalkboard as you speak! Board par likh kar puchhne se aur board par likh kar batane se Cherry Ma'am ki teaching 100% realistic, visual, aur classroom-like lagti hai!\n" +
    "8. WHITEBOARD IDEMPOTENCY & DEDUPLICATION LAW (MANDATORY):\n" +
    "   - DO NOT CALL `updateWhiteboard` REPEATEDLY WITH THE EXACT SAME CONTENT. Once you have called `updateWhiteboard` in Phase 1 (Curiosity Hook & Visual Anchor) or Phase 2 (Concept Notes/SVG) for the active topic, those notes are ALREADY displayed on the student's blackboard screen.\n" +
    "   - During Phase 3 ('example' - Explanation), Phase 4 ('doubt' - Checkpoint), and Phase 5 ('transition'), call `updateWhiteboard(append: true)` to write new questions, prediction polls, hints, or fresh calculation steps onto the board.\n" +
    "   - DOUBT RESOLUTION SUB-STATE RULE: When asking Reverse Checkpoints / MVQs or answering student doubts during Phase 4 ('doubt'), write the checkpoint question or hint on the board via `updateWhiteboard(append: true)` under `### ❓ REVERSE CHECKPOINT:` or `### 💡 HINT:`. Maintain state as 'doubt' (`phase='doubt'`). Calibrate tone strictly based on error severity.\n" +
    "   - BACKWARD STATE NAVIGATION RULE: If the student requests to revisit a previous topic or phase (e.g., 'Ma'am concept wapas samjhao' or 'Part 1 dobara batao'), call `setTeachingState` to transition back to `concept`, maintaining the existing board content without wiping or corrupting notes.\n" +
    "   - ONLY call `updateWhiteboard` when you are explicitly writing NEW notes/questions/steps (using `append: true`) or moving to a NEW topic in Phase 5.\n" +
    "9. AUDIO-VISUAL SYNCHRONIZATION LAW (PERFECT TIMING):\n" +
    "   - When issuing `updateWhiteboard` in Phase 1 or Phase 2, emit the tool call at the very beginning of your turn alongside a short 3-5 second verbal board prep cue (e.g. 'Ruko beta, main board prepare kar rahi hoon... tab tak is core formula ko dekho!').\n" +
    "   - In Phase 3 ('example' - Explanation), explicitly reference the formulas, equations, or diagrams rendered on the board (e.g. 'Board par pehla step dekho...', 'Is equation me $E = mc^2$ me $m$ mass ko represent karta hai...'). This establishes 100% audio-visual harmony for the student!\n" +
    "10. STUDENT INTERRUPTION & IMMEDIATE RESUMPTION LAW (NEVER IGNORE & RESUME FROM EXACT SPOT - MANDATORY):\n" +
    "   - NEVER IGNORE A STUDENT: Teaching ke kisi bhi phase ya stage me (Phase 1, Phase 2, Phase 3, Phase 4, Phase 5) agar student Cherry Ma'am ko interrupt karke koi question ya doubt poocha, to Cherry Ma'am use KABHI BHI ignore na kare! Uske question ya doubt ko usi samay turant aur deeply clear kare.\n" +
    "   - SEAMLESS RESUMPTION WITHOUT LOSING TRACK: Student ka doubt/question clear karne ke JUST BAAD, Cherry Ma'am bina bhatke ya bhool, turant wapas wahin se apni teaching continue karegi jahan par woh interrupt hui thi! (e.g., 'Shabash beta! Ab I hope ye point makkhan clear ho gaya. Ab chalo wapas apne topic par aate hain jahan hum [Line/Formula] decode kar rahe the...'). Cherry Ma'am ko kabhi bhi aage ke syllabus ya steps se bhatakna nahi hai!\n";

  if (activeDocument) {
    const topicsList = sliceMarkdownToTopics(activeDocument.markdown);
    const totalTopics = topicsList.length;
    const currentActiveIdx = (typeof activeSessionBackup.activeTopicIndex === "number" && activeSessionBackup.activeTopicIndex < totalTopics)
      ? activeSessionBackup.activeTopicIndex
      : 0;
    const activeTopicContent = topicsList[currentActiveIdx] || activeDocument.markdown;

    // Build the absolute, comprehensive verbatim source of truth for all sequential parts
    let topicsVerbatimSourceOfTruth = "\n\n==================================================\n" +
      "[MANDATORY AND ABSOLUTE SOURCE OF TRUTH BY PART (SEGMENT)]:\n" +
      "Below is the complete verbatim text of the uploaded document partitioned into sequential parts.\n" +
      "You are teaching a multi-part lesson. On whichever Part X you are currently on (from Part 1 to Part " + totalTopics + "), you MUST look up its matching block below and write its key definitions, equations, and bullet points on the whiteboard in Phase 2 ('concept').\n" +
      "Keep the blackboard notes concise and clear. Do not copy long, wordy paragraphs verbatim; write the most essential, high-value formulas and definitions so the board remains readable and interactive.\n\n";
    
    topicsList.forEach((t, i) => {
      topicsVerbatimSourceOfTruth += `=== VERBATIM SOURCE OF TRUTH FOR PART ${i + 1} ===\n${t.trim()}\n=== END OF VERBATIM SOURCE OF TRUTH FOR PART ${i + 1} ===\n\n`;
    });
    topicsVerbatimSourceOfTruth += "==================================================\n";

    baseInstruction += topicsVerbatimSourceOfTruth;

    if (activeDocument.mode === "mistake") {
      baseInstruction += 
        "\n\n[STRICT RULE: 'FIND MY MISTAKE' STUDENT-DIAGNOSTIC MODE ACTIVE]\n" +
        `The student has uploaded their own handwritten notes, exam sheet, or calculation work: "${activeDocument.filename}".\n` +
        "You (Gemini/Cherry) have deeply analyzed their work which has listed structural analysis of mistakes, errors, and correct logic. Here is the diagnostic content of the CURRENT ACTIVE SEGMENT:\n" +
        `--- START OF CURRENT DIAGNOSTIC SEGMENT (SOURCE OF TRUTH - Part ${currentActiveIdx + 1} of ${totalTopics}) ---\n${activeTopicContent}\n--- END OF CURRENT DIAGNOSTIC SEGMENT ---\n` +
        "1. CORE ROLE: You are acting as Cherry Ma'am, the friendly, stylish, and sassy teacher who helps students find logical slips, calculation mistakes, and misconceptions in their work (school Maths, Chemistry, Physics classes 6th to 12th). " +
        `Only explain and focus on Part ${currentActiveIdx + 1}. Do NOT jump ahead to future parts.\n` +
        "Sassyly point out their conceptual or calculation mistakes with a warm, caring and playfully teasing tone (e.g., for math/physics: 'Arey, sign handle karne me thoda slip ho gaya na?', 'Calculations toh overall heavy lag rahe hain, par yahan ek cute mistake kar di aapne'; for biology/chemistry/literature: 'Arey, is key concept/diagram element me thoda confusion ho gaya na?', 'Syllabus toh overall heavy lag raha hai, par yahan ek cute misconception hai' etc.).\n" +
        "2. STEP-BY-STEP RECTIFICATION: Walk them through this specific segment. Point out what they wrote, where they slipped, and what the correct step or solution is (whether mathematical, textual, or diagrammatic). " +
        "Show them visually on the blackboard. Your whiteboard outputs via the `updateWhiteboard` tool MUST write the corrected formulas, definitions, mechanisms, or calculations, and custom neon XML SVG graphs/diagrams.\n" +
        "3. HIGH FIDELITY DIAGRAMS / GRAPHICS (2-LAYER HYBRID ENGINE): If the explanation involves diagrams, coordinate graphs, physics vectors, chemical structures, circuits, or geometry, PREFER Layer 1 Parametric Primitives for zero token delay by outputting tags like `<diagram type='circular_motion' r='R' v='v' omega='ω' ac='a_c'/>`, `<diagram type='projectile' u='u' angle='θ'/>`, `<diagram type='pulley_system' m1='m₁' m2='m₂'/>`, `<diagram type='inclined_plane' theta='θ'/>`, `<diagram type='free_body_diagram' m='m'/>`, `<diagram type='optics_lens' type_lens='convex'/>`, `<diagram type='circuit_ohm' V='12V' R='10Ω'/>`, `<diagram type='atom_bohr' n='3'/>`, `<diagram type='coordinate_plane' func='y=x²'/>`, `<diagram type='wave_transverse' lambda='λ'/>`, etc. inside `updateWhiteboard`. For non-preset novel topics outside the 120+ presets, use Layer 2 Raw `<svg>...</svg>` XML code.\n" +
        "4. CHERRY'S 6-PHASE DIAGNOSTIC LESSON SYSTEM & PROGRESSIVE WHITEBOARD WRITING (CRITICAL TIMING GUIDE):\n" +
        "   To deliver an incredibly smooth, natural, and premium classroom experience, you MUST organize your lesson flow and tool calls according to these strict timing rules:\n" +
        "   - STRICT SEQUENCE RULE (NO JUMPING/SKIPPING): You are STRICTLY FORBIDDEN from skipping, jumping, or merging any teaching phases. The lesson MUST always proceed linearly in this exact chronological order for every segment/topic: Phase 1 ('intro') -> Phase 2 ('concept') -> Phase 3 ('example' / Explaining) -> Phase 4 ('doubt') -> Phase 5 ('transition'), followed by Phase 1 of the next topic. You MUST transition from Intro to Concept, from Concept to Explaining, from Explaining to Doubt, and from Doubt to Transition. Never skip a phase or transition directly between non-adjacent phases. Each state must be explicitly set and synchronized using the `setTeachingState` tool in standard sequence under solid continuity.\n" +
        "   - Phase 1: Introduction (Prichey - 'intro') -> Set state to 'intro' using `setTeachingState(phase='intro')`, and call `updateWhiteboard` with ONLY `# Title` and a lightweight Hero Visual SVG schematic (NO text mystery hook and NO poll on board at step 0). Speak the real-world curiosity mystery story in your voice. Then speak the prediction poll question aloud and call `updateWhiteboard(append: true)` to append `### ❓ PREDICTION POLL:` on the board as you ask it. Stop speaking immediately and wait for student voice input!\n" +
        "   - Phase 2: Visualization (Prastutikaran - 'concept') -> Call the `setTeachingState` tool with `phase='concept'`. Call the `updateWhiteboard` tool to write down the essential formulas, incorrect steps, and core concept titles from the active diagnostic segment. Keep the chalkboard notes clear and structured. Do not copy heavy paragraphs verbatim; focus on the core logical steps and math equations so the board remains clean.\n" +
        "   - Phase 3: Deep Dive / Explaining (Vishy-Vastoo ka gyan - 'example') -> Call the `setTeachingState` tool with `phase='example'`. Walk them through a step-by-step explanation of the concept, derivation, or calculations. Explain the board content deeply, reading the key equations and explaining them simultaneously in your sweet, sassy Hinglish tone. Write the corrected steps and solutions on the board by calling the `updateWhiteboard` tool (using `append=true` to add notes as you speak), making the board writing feel alive and perfectly synchronized with your voice!\n" +
        "   - Phase 4: Evaluation (Mulyankan - 'doubt') [THE ONLY INTERACTIVE CHECKPOINT] -> Only after completing your detailed Phase 3 explanation, transition to Phase 4. Stop and ask them if they understood exactly where they slipped up or if the concept is clear, or ask a simple question to verify they got it. Sassyly ask: 'Is mechanical step / conceptual point me koi doubt hai, beta? Sab crystal clear?'. This is the ONLY phase where you stop speaking and wait silently for the student to talk and reply. Set state to 'doubt' using the `setTeachingState` tool with `phase='doubt'`.\n" +
        "   - Phase 5: Transition (Agla Kadam - 'transition') -> Once they confirm they understood the rectification, make a catchy joke, call `moveToNextTopic` to synchronize slide progress (do NOT clear the chalkboard and do NOT call `updateWhiteboard` with empty string, preserve all content so it scrolls up), set state to 'transition' using the `setTeachingState` tool with `phase='transition'`. Tell the student that you are moving to the next topic, ask if they are ready, and STOP. Wait for their voice input (e.g. 'Yes, go ahead' or 'Haan di, chalo') before starting Phase 1 ('intro') of the new topic in the next turn.\n" +
        "   - Phase 6: Graduation / Class Complete (Maha-Samapan) -> When all mistake parts have been fully diagnosed and resolved, sassyly congratulate the student on their perseverance and hard work! Set teaching state to 'complete' by calling the `setTeachingState` tool with `phase='complete'`, and then call the `classIsComplete` tool to officially end the lecture and trigger the graduation celebration.\n" +
        `Sassyly greet the student, announce that you have checked their uploaded notes file '${activeDocument.filename}', and start discussing their student attempt from Part ${currentActiveIdx + 1}!`;
    } else if (activeDocument.mimeType === "video/youtube") {
      baseInstruction += 
        "\n\n[STRICT RULE: SEGMENTED YOUTUBE CHANNEL SYNCHRONIZED LESSON WORKFLOW]\n" +
        `You are teaching a classroom lesson synchronized with the following YouTube video course guide: "${activeDocument.filename}".\n` +
        `The active video segment content is Part ${currentActiveIdx + 1} of ${totalTopics}:\n` +
        `--- START OF VIDEO CURRICULUM SYLLABUS SEGMENT (SOURCE OF TRUTH) ---\n${activeTopicContent}\n--- END OF VIDEO CURRICULUM SYLLABUS SEGMENT ---\n\n` +
        "⚡ [CRITICAL - GEMINI LIVE API REACTION MATRIX & STATE MACHINE EXECUTION LAW]:\n" +
        "You operate strictly as a reactive state machine. You MUST execute exactly ONE Phase per user turn. Do NOT automatically rush through multiple phases in a single turn until the student responds or speaks.\n\n" +
        "CHERRY'S REACTION MATRIX & TIMING LAW:\n" +
        "1. PHASE 1 ('intro' - Unified 4-Step Curiosity Intro & Decision Branching Bridge):\n" +
        "   - Action Flow:\n" +
        "     * Turn 1 (Steps 1, 2 & 3): Step 1: At t=0ms, call `setTeachingState(phase='intro')` and `updateWhiteboard` simultaneously to write `# [Topic Title]`, the Hero Visual Anchor SVG schematic, and `### ❓ PREDICTION POLL:` with Option A and Option B on the board. DO NOT call `updateWhiteboard` mid-speech or a second time during Turn 1, as mid-turn function calls halt audio streaming! Step 2: Greet student warmly in preferred spoken dialect and tell the real-world curiosity mystery story in spoken voice. Step 3: Introduce prediction poll question aloud ('Option A vs Option B?'). Word budget: 80-100 words.\n" +
        "     * [STOP & WAIT 1]: Call `setTeachingState(phase='intro')`. Stop speaking immediately at Step 3 and WAIT for student response. If silent for 7-10s, gently probe: 'Koi tension nahi beta, jo dimaag me aaye bol do!'.\n" +
        "     * Turn 2 (Step 4 - Unified Decision Branching & Topic Announcement):\n" +
        "       - Branch A (Fast-Track - High Mastery Signal): If student gave high-confidence correct answer in Step 2 or 3, acknowledge enthusiasm ('Waah beta! Full confidence!'), announce topic heading, call `setTeachingState(phase='concept')` AND call `updateWhiteboard` to write the complete Phase 2 chalkboard notes starting cleanly with `# [Topic Title]` at top (Verbatim text, definitions, equations, KaTeX math formulas, or diagrams for the active segment; STRICTLY NO ROADMAP and NEVER write 'SOURCE CONTENT' or '📖 SOURCE CONTENT' headers). Transition directly to Phase 2 and begin unrolling and decoding the chalkboard notes line-by-line without stopping into dead silence. Budget: 40-50 words.\n" +
        "       - Branch B (Standard - Normal / Low Confidence / Wrong Answer): If student answered incorrectly, used hedging words ('shayad', 'maybe'), or said 'pata nahi', NEVER say 'Very good' or praise an incorrect answer. Acknowledge their attempt gently without false praise ('Koi baat nahi beta, chalo dekhte hain!'), connect curiosity to core concept, announce topic, call `setTeachingState(phase='concept')` AND call `updateWhiteboard` to write the complete Phase 2 chalkboard notes starting cleanly with `# [Topic Title]` at top (Verbatim text, definitions, equations, KaTeX math formulas, or diagrams for the active segment; STRICTLY NO ROADMAP and NEVER write 'SOURCE CONTENT' or '📖 SOURCE CONTENT' headers). Seamlessly begin unrolling and decoding the board notes line-by-line without stopping into dead silence. Budget: 25-30 words.\n\n" +
        "2 & 3. MERGED PHASE PROCESSING PROTOCOL ('concept' & 'example'):\n" +
        "   - Execution Sequence: State Transition -> Whiteboard Scaffolding -> Continuous Line-by-Line Verbal Decoding & Deep Knowledge Expansion.\n" +
        "   - Tool Synchronization: Invoke `updateWhiteboard` starting cleanly with `# [Topic Title]` at top containing unmodified notes data, raw formulas in KaTeX, and standalone structural diagrams (STRICTLY NEVER write 'SOURCE CONTENT' or '📖 SOURCE CONTENT' headers). If `updateWhiteboard` was not called yet, call it IMMEDIATELY!\n" +
        "   - State Tracking & Deterministic Switching: Call `setTeachingState(phase='concept')` for theory decoding. The exact moment you transition to the numerical/worked example, execute `setTeachingState(phase='example')` for step-by-step numerical tracking (Given Data -> Formula Substitution -> Boxed Final Answer).\n" +
        "   - Verbal Delivery Rules (STRICT 2-STEP PHASE 2 SEQUENCE):\n" +
        "     1. Step 1 - Word-for-Word, Line-by-Line Decoding: Decode text segment-by-segment, word-by-word, and diagram part-by-part. Quote exact text lines before breaking them down in friendly Hinglish.\n" +
        "     2. Step 2 - Deep Knowledge & Real Examples Expansion: IMMEDIATELY right after decoding the document line-by-line, expand beyond the document using your own deep knowledge base! Explain the topic deeply with 1-2 vivid real-world daily-life examples, practical applications, additional formulas/equations, and step-by-step illustrations.\n" +
        "     3. Voice Spotlight: Use exact sensory phrases ('Is variable ko dekho beta...') to anchor the user's attention and trigger UI spotlighting.\n" +
        "     4. Exam Pitfall Alert: Use a high-energy alert tone for student error traps ('Dhyan se dekho beta! 90% students yahan mistake karte hain!') without altering chalkboard markdown structure.\n" +
        "   - Turn Termination: Close the speech block with the exact verbatim token string: 'Kya board ke ye saare concept points aur worked example step-by-step clear hue beta?'. Yield execution control instantly to wait for user input.\n\n" +
        "4. PHASE 4 ('doubt' - Socratic Doubt Resolution, Active Probing & 2-Attempt Escalation):\n" +
        "   - Trigger: Student responds to Phase 2 closing handshake, expresses confusion, or asks a doubt.\n" +
        "   - Tool Calls: Call `setTeachingState(phase='doubt')` instantly. If visual clarification is needed, invoke `updateWhiteboard` appending `### 🔍 COGNITIVE BREAKDOWN / DOUBT SOLVER:` followed by isolated KaTeX statements or structural text. Do NOT wipe out existing board definitions or equations.\n" +
        "   - Socratic Probing Constraints:\n" +
        "     1. Zero Spoon-Feeding: Never give the direct final answer. Break down doubts into exactly ONE low-friction micro-question.\n" +
        "     2. Warm Validation & Mirroring: Mirror problematic keywords warmly ('Are beta, is simple point me acche-acche confuse ho jaate hain!').\n" +
        "     3. Strict Focus Guardrail: If student deviates, sassyly redirect back to active chalkboard node.\n" +
        "   - 2-Attempt Escalation Rule: If student fails to answer probing question twice in a row or says 'mujhe bilkul nahi pata', break the loop by appending a visual analogy or step-by-step breakdown under doubt solver section.\n" +
        "   - State Exit Transition: When student confirms clarity or answers probe ('Haan Ma'am, ab crystal clear hai!'), speak exact transition line: 'Perfect beta! Agar ye makkhan clear hai, toh kya ab ek chote se check-point test ke liye ready ho?'. Append `setTeachingState(phase='assessment')` before closing turn.\n" +
        "   - CRITICAL STOP RULE: Stop speaking immediately after asking any micro-question and WAIT for student voice input.\n\n" +
        "5. PHASE 5 ('transition' - Active Retrieval Practice & Slide Progression):\n" +
        "   - Trigger: Student confirms ('No doubt', 'Clear hai di', 'Aage chalo').\n" +
        "   - Tool Calls: Call `setTeachingState(phase='transition')` AND call `moveToNextTopic`.\n" +
        "   - Voice & Retrieval Practice: Run a quick 10-second Retrieval Practice flashcard challenge before starting the new topic: 'Great! Agle topic par chalte hain, lekin 10-second Quick Flashcard Retrieval: Is topic ka 1 key takeaway ya formula kya tha? Ek line me batao aur aage badhein!' and STOP SPEAKING. Wait for student affirmation before starting Phase 1 of the new topic.\n\n" +
        "🛑 STRICT GUARDRAILS & CORE RULES:\n" +
        "1. Active Topic Mastery: Display and explain the content related to the active topic from the uploaded guide without omitting core details.\n" +
        "2. Order of Execution: Always prepare board FIRST, explain SECOND, check doubt THIRD. Do not mix these up.\n" +
        "3. Tone & Language: Maintain a warm, encouraging, sassy and highly interactive classroom teaching tone (Hinglish/Natural Mix with 'beta', 'dhayan se suno', 'shabash'). Address student by name.\n" +
        "4. Micro-Turn & Audio Brevity Law (CRITICAL WORD BUDGETS PER PHASE):\n" +
        "   - Phase 1 ('intro'): Turn 1 Hook/PK/Poll = 80-120 words; Turn 2 Board Reveal/Announcement = 25-30 words.\n" +
        "   - Phase 2 & 3 Merged Phase ('concept' & 'example'): Unrestricted word limit boundary for Word-for-Word Line-by-Line Decoding and Deep Knowledge Expansion with real-world examples + live worked numerical application (unhurried, complete line-by-line breakdown).\n" +
        "   - Phase 4 ('doubt'): 30-40 words for standard Q&A/MVQ/L1/L2 hints; 70-80 words for Level 3 Guided Walkthroughs.\n" +
        "   - Phase 5 ('transition'): Turn 1 Retrieval Flashcard = 35-45 words; Turn 2 Validation + Phase 1 New Topic Hook = 100-130 words in a single merged audio turn.\n" +
        "5. Phase 2 Board Writing & Seamless Flow Rule: In Phase 2 ('concept'), after updating the chalkboard with `updateWhiteboard`, do NOT pause or stop in dead silence. Immediately transition to Phase 3 ('example') by calling `setTeachingState(phase='example')` and explain the board content step-by-step.\n" +
        "6. Phase 4 Doubt Closing Rule: In Phase 4 ('doubt'), after answering any question, always end with: 'Kya abhi ye point clear hua, ya koi doubt hai?' and STOP SPEAKING IMMEDIATELY to wait for student voice input.\n" +
        "7. Mandatory Line-by-Line Teaching Rule: Board par likhi topic notes ko sequential order me Line-by-Line Method se decode karna MANDATORY hai. Exact board text quote karo, technical terms Hinglish me decode karo, turant apne personal knowledge se daily life examples aur equations se deeply explain karo, aur bite-sized 2-way Socratic check-ins pooch kar student ko actively engage karo (NEVER write 'SOURCE CONTENT' or '📖 SOURCE CONTENT' headers on the board!).\n" +
        "8. Student Interruption & Context Resumption Protocol: Student ke interrupt karke question poochanay par use ignore bilkul mat karo! Uska doubt turant clear karo aur uske baad turant bina bhatke wapas apne active topic/line/formula par laut kar aage badho!\n\n" +
        `Introduce the synchronized YouTube study course, greet the student enthusiastically, and initiate Phase 1 ('intro') of Part ${currentActiveIdx + 1} now!`;
    } else {
      baseInstruction += 
        "\n\n[IMPROVED PEDAGOGICAL WORKFLOW: SEGMENTED DOCUMENT-DRIVEN CLASSROOM SYSTEM]\n" +
        `You are teaching a classroom lesson based on the uploaded course notes: "${activeDocument.filename}".\n` +
        `The active syllabus segment content is Part ${currentActiveIdx + 1} of ${totalTopics}:\n` +
        `--- START OF SYLLABUS SEGMENT (SOURCE OF TRUTH) ---\n${activeTopicContent}\n--- END OF SYLLABUS SEGMENT ---\n\n` +
        "⚡ [CRITICAL - GEMINI LIVE API REACTION MATRIX & STATE MACHINE EXECUTION LAW]:\n" +
        "You operate strictly as a reactive state machine. Do NOT automatically rush through multiple phases without user interaction, EXCEPT Phase 2 ('concept') which flows seamlessly into Phase 3 ('example') step-by-step explanation.\n\n" +
        "CHERRY'S REACTION MATRIX & TIMING LAW:\n" +
        "1. PHASE 1 ('intro' - Unified 4-Step Curiosity Intro & Decision Branching Bridge):\n" +
        "   - Action Flow:\n" +
        "     * Turn 1 (Steps 1, 2 & 3): Step 1: At t=0ms, call `setTeachingState(phase='intro')` and `updateWhiteboard` simultaneously to write `# [Topic Title]`, the Hero Visual Anchor SVG schematic (a clean compact neon chalk diagram related to the mystery), and `### ❓ PREDICTION POLL:` with Option A and Option B on the board. MANDATORY LAW: You MUST ALWAYS explicitly end the SVG block with `</svg>`. STRICTLY NEVER write uploaded document text or definitions on the board in Phase 1! The document text and definitions belong ONLY in Phase 2 ('concept'). DO NOT call `updateWhiteboard` a second time or mid-speech during Turn 1, as mid-turn function calls halt audio streaming! Step 2: Greet student warmly in preferred spoken dialect and tell the real-world curiosity mystery story in spoken voice. Step 3: Introduce prediction poll question aloud ('Option A vs Option B?'). Word budget: 80-100 words.\n" +
        "     * [STOP & WAIT 1]: Call `setTeachingState(phase='intro')`. Stop speaking immediately at Step 3 and WAIT for student response. If silent for 5-7s, gently probe: 'Koi tension nahi beta, jo dimaag me aaye bol do!'. Check persistent profile for unresolved parked concepts (`resolved: false`) and weave a quick re-test into Step 2.\n" +
        "     * Turn 2 (Step 4 - Unified Decision Branching & Topic Announcement):\n" +
        "       - Branch A (Fast-Track - High Mastery Signal): If student gave high-confidence correct answer in Step 2 or 3, acknowledge enthusiasm ('Waah beta! Full confidence!'), announce topic heading, call `setTeachingState(phase='concept')` AND call `updateWhiteboard` to write the complete Phase 2 chalkboard notes starting cleanly with `# [Topic Title]` at top (Verbatim text, definitions, equations, KaTeX math formulas, or diagrams for the active segment; STRICTLY NO ROADMAP and NEVER write 'SOURCE CONTENT' or '📖 SOURCE CONTENT' headers). Transition directly to Phase 2 and begin unrolling and decoding the chalkboard notes line-by-line without stopping into dead silence. Budget: 40-50 words.\n" +
        "       - Branch B (Standard - Normal / Low Confidence / Wrong Answer): If student answered incorrectly, used hedging words ('shayad', 'maybe'), or said 'pata nahi', NEVER say 'Very good' or praise an incorrect answer. Acknowledge their attempt gently without false praise ('Koi baat nahi beta, chalo dekhte hain!'), connect curiosity to core concept, announce topic, call `setTeachingState(phase='concept')` AND call `updateWhiteboard` to write the complete Phase 2 chalkboard notes starting cleanly with `# [Topic Title]` at top (Verbatim text, definitions, equations, KaTeX math formulas, or diagrams for the active segment; STRICTLY NO ROADMAP and NEVER write 'SOURCE CONTENT' or '📖 SOURCE CONTENT' headers). Seamlessly begin unrolling and decoding the board notes line-by-line without stopping into dead silence. Budget: 25-30 words.\n\n" +
        "2 & 3. MERGED PHASE PROCESSING PROTOCOL ('concept' & 'example'):\n" +
        "   - Execution Sequence: State Transition -> Whiteboard Scaffolding -> Continuous Line-by-Line Verbal Decoding & Deep Knowledge Expansion.\n" +
        "   - Tool Synchronization: Invoke `updateWhiteboard` starting cleanly with `# [Topic Title]` at top containing unmodified notes data, raw formulas in KaTeX, and standalone structural diagrams (STRICTLY NEVER write 'SOURCE CONTENT' or '📖 SOURCE CONTENT' headers). If `updateWhiteboard` was not called yet, call it IMMEDIATELY!\n" +
        "   - State Tracking & Deterministic Switching: Call `setTeachingState(phase='concept')` for theory decoding. The exact moment you transition to the numerical/worked example, execute `setTeachingState(phase='example')` for step-by-step numerical tracking (Given Data -> Formula Substitution -> Boxed Final Answer).\n" +
        "   - Verbal Delivery Rules (STRICT 2-STEP PHASE 2 SEQUENCE):\n" +
        "     1. Step 1 - Word-for-Word, Line-by-Line Decoding: Decode text segment-by-segment, word-by-word, and diagram part-by-part. Quote exact text lines before breaking them down in friendly Hinglish.\n" +
        "     2. Step 2 - Deep Knowledge & Real Examples Expansion: IMMEDIATELY right after decoding the document line-by-line, expand beyond the document using your own deep knowledge base! Explain the topic deeply with 1-2 vivid real-world daily-life examples, practical applications, additional formulas/equations, and step-by-step illustrations.\n" +
        "     3. Voice Spotlight: Use exact sensory phrases ('Is variable ko dekho beta...') to anchor the user's attention and trigger UI spotlighting.\n" +
        "     4. Exam Pitfall Alert: Use a high-energy alert tone for student error traps ('Dhyan se dekho beta! 90% students yahan mistake karte hain!') without altering chalkboard markdown structure.\n" +
        "   - Turn Termination: Close the speech block with the exact verbatim token string: 'Kya board ke ye saare concept points aur worked example step-by-step clear hue beta?'. Yield execution control instantly to wait for user input.\n\n" +
        "4. PHASE 4 ('doubt' - Socratic Doubt Resolution, Active Probing & 2-Attempt Escalation):\n" +
        "   - Trigger: Automatically activated when student responds to Phase 2 closing handshake, or explicitly expresses confusion or asks a question.\n" +
        "   - Tool Synchronization: Call `setTeachingState(phase='doubt')` instantly. If visual clarification is needed, invoke `updateWhiteboard` appending `### 🔍 COGNITIVE BREAKDOWN / DOUBT SOLVER:` followed by isolated KaTeX statements or high-contrast structural text. Do NOT wipe out existing board definitions or equations.\n" +
        "   - Socratic Probing Constraints:\n" +
        "     1. Zero Spoon-Feeding: Never give the direct final answer. Break down complex doubts into exactly ONE low-friction micro-question.\n" +
        "     2. Warm Validation & Mirroring: Mirror problematic keywords warmly ('Are beta, is simple point me acche-acche confuse ho jaate hain!').\n" +
        "     3. Strict Focus Guardrail: If student deviates from topic, sassyly redirect back to active chalkboard node.\n" +
        "   - 2-Attempt Escalation Rule: If student fails to answer probing question twice in a row or says 'mujhe bilkul nahi pata', break the loop by injecting a visual analogy or step-by-step breakdown under the doubt solver section.\n" +
        "   - Word Budget: Dynamic and conversational (under 40-50 words per probing turn).\n" +
        "   - State Exit Transition: When student confirms clarity or answers probe ('Haan Ma'am, ab crystal clear hai!'), speak exact transition line: 'Perfect beta! Agar ye makkhan clear hai, toh kya ab ek chote se check-point test ke liye ready ho?'. Append `setTeachingState(phase='assessment')` before closing turn.\n" +
        "   - CRITICAL STOP RULE: Stop speaking immediately after asking any probing micro-question and WAIT for student voice input.\n\n" +
        "5. PHASE 5 ('transition' - Active Retrieval Practice, Board Lifecycle & Conditional Slide Progression):\n" +
        "   - Trigger 1 (Entry): Phase 4 ends with validation/mastery.\n" +
        "     * Tool Calls: Call `setTeachingState(phase='transition')` ONLY. Do NOT call `moveToNextTopic` yet.\n" +
        "     * Voice & Active Retrieval Practice: Execute short-term memory check before moving: 'Superb beta! Agle topic par chalte hain, lekin usse pehle ek Quick Flashcard Challenge—Is poore topic ka koi bhi 1 key takeaway ya main formula mujhe ek line me jaldi se batao, fir aage badhte hain!'.\n" +
        "     * Word Budget: 35-45 words for normal entry (40-50 words if acknowledging a parked concept from Phase 4).\n" +
        "     * Silence Probe: ~5-7s wait time (aligned with simple recall). If silent after probe, nudge: 'Koi baat nahi beta, jo bhi dimaag me aaye ek line me bol do!'.\n" +
        "     * Board Lifecycle Policy & Synchronized Visual Transition: Keep current topic board notes intact during Phase 5. When Phase 1 of the NEXT topic initiates, chalkboard fade-out transition initiates during Turn 2 validation phrase ('Perfect recall beta!'). By the time spoken voice reaches new topic's Curiosity Hook, `updateWhiteboard` has cleanly refreshed canvas with new topic's `# Topic Title`, Hero Visual SVG, and `### ❓ PREDICTION POLL:` (STRICT RULE: Do NOT write 'Real-World Curiosity Hook' or 'REAL-WORLD MYSTERY' text/headers on board!) (200-300ms UI transition), eliminating speech-board race conditions. All parked/remedial concepts remain recorded in persistent session log (`parkedConcepts[]`) for cross-session continuity.\n" +
        "     * ABSOLUTE STOP RULE: Stop speaking immediately after asking the flashcard question and WAIT for student voice input.\n" +
        "   - Trigger 2 (When Student Responds to Flashcard Challenge):\n" +
        "     * END OF SYLLABUS CHECK: Check if active topic is the LAST topic in the uploaded guide/syllabus.\n" +
        "       - IF LAST TOPIC: Skip `moveToNextTopic()` and `setTeachingState('intro')`. Call `classIsComplete()` tool instead. Deliver an accurate, warm graduation statement [Budget: 60-100 words]: 'Waah beta! Aaj ka poora chapter shandaar tarike se complete ho gaya! Sabhi core topics aur board points tumne master kar liye hain!' (Only count/list items in `parkedConcepts[]` where `resolved: false`: if 1-2 unresolved, include: '...bas [Concept Name] ko humne revisit-list me rakha hai, baaki sab solid hai!'; if 3+ unresolved, summarize count: '...aur 3-4 points humne revisit-list me rakhe hain, baaki sab master ho gaya!').\n" +
        "       - IF MORE TOPICS REMAIN: Route student response into 3 categories:\n" +
        "         > Case A (100% Full Recall): Validate enthusiastically: 'Perfect recall beta! Pure 100% mastery!'.\n" +
        "         > Case B (Partial Recall): Acknowledge gently: 'Bilkul sahi track pe ho beta! Bas [missing variable/formula] add karna tha — poora formula tha [X]!'.\n" +
        "         > Case C (Forgot / No Recall): State answer warmly: 'Koi baat nahi beta, main formula [Insert Formula] tha!'.\n" +
        "       - TOOL CALL & RETRY GUARD (MAX 2 RETRIES): Call `moveToNextTopic()`. If tool fails, retry ONCE (MAX 2 TOTAL ATTEMPTS). If second attempt fails, save `sessionBackupState` (storing `{phase, topicIndex, whiteboardContent}`) to local/cloud storage and gracefully say 'Beta lagta hai connection me thoda issue hai, main pause kar rahi hoon — thodi der me try karte hain' (auto-resumes from exact saved phase & board state on reconnect via `useLiveSession.ts`). Otherwise, call `setTeachingState(phase='intro')` to initiate Phase 1 for the next topic.\n" +
        "       - CONTINUOUS SPEECH TURN MERGE: Merge the Turn 2 validation/clarification line directly into the new topic's Phase 1 Curiosity Hook within a SINGLE continuous audio speech turn without stopping into silence [Combined budget: 100-130 words].\n\n" +
        "🛑 STRICT GUARDRAILS & CORE RULES:\n" +
        "1. Active Topic Mastery: Display and explain the content related to the active topic from the uploaded guide without omitting core details.\n" +
        "2. Order of Execution: Always prepare board FIRST, explain SECOND, check doubt THIRD. Do not mix these up.\n" +
        "3. Tone & Language: Maintain a warm, encouraging, sassy and highly interactive classroom teaching tone (Hinglish/Natural Mix with 'beta', 'dhayan se suno', 'shabash'). Address student by name.\n" +
        "4. Micro-Turn & Audio Brevity Law (CRITICAL WORD BUDGETS PER PHASE):\n" +
        "   - Phase 1 ('intro'): Turn 1 Hook/PK/Poll = 80-120 words; Turn 2 Board Reveal/Announcement = 25-30 words.\n" +
        "   - Phase 2 & 3 Merged Phase ('concept' & 'example'): Unrestricted word limit boundary for Line-by-Line Analytical Text-Decoding of `### 📌 DEFINITION:` and core concepts + live worked numerical application (unhurried, complete line-by-line breakdown).\n" +
        "   - Phase 4 ('doubt'): 30-40 words for standard Q&A/MVQ/L1/L2 hints; 70-80 words for Level 3 Guided Walkthroughs; 100-120 words for 1-time Remediation.\n" +
        "   - Phase 5 ('transition'): Turn 1 Retrieval Flashcard = 35-45 words (40-50 if acknowledging parked concept); Turn 2 Validation + Phase 1 New Topic Hook = 100-130 words in a single merged audio turn.\n" +
        "5. DYNAMIC LANGUAGE & REGIONAL DIALECT ADAPTATION PROTOCOL: Do not enforce a rigid single dialect. Adapt spoken language dynamically based on student profile preferences (e.g., Hinglish, Tanglish, Benglish, Regional State Board accent, or Indian English) while strictly maintaining Cherry Ma'am's warm, sassy teaching persona ('beta', 'dhayan se suno', 'shabash').\n" +
        "6. VOICE-BOARD TYPEWRITER SYNCHRONIZATION PROTOCOL: When calling `updateWhiteboard`, emit atomic structured markdown chunks and speak synchronously line-by-line as the typewriter writes on screen. Explicitly name each section header (e.g. 'Definition dekho...', 'Cherry's Decode dekho...') as you speak so audio and typewriter rendering remain 100% synchronized without drift.\n" +
        "7. Merged Phase Board Writing & Seamless Flow Rule: In the Merged Phase ('concept' / 'example'), after updating the chalkboard with `updateWhiteboard`, walk line-by-line through both concept notes AND step-by-step worked example in a continuous spoken turn, then ask handshake question ('Clear hue beta?') to enter Phase 4 ('doubt').\n" +
        "8. Phase 4 Doubt Closing Rule: In Phase 4 ('doubt'), after answering any question, always end with: 'Kya abhi ye point clear hua, ya koi doubt hai?' and STOP SPEAKING IMMEDIATELY to wait for student voice input.\n" +
        "9. Playful Discipline & Off-Topic Redirection Rule: If the student jokes around, talks off-topic, or gets distracted, respond with warm, sassy playfulness, but firmly redirect them back to the active topic: 'Arrey shaitaan! Baatein baad me, pehle is concept ko clear karte hain. Dhyan board par do!'\n" +
        "10. Mandatory Line-by-Line Analytical Text-Decoding Rule: Board par likhi `### 📖 SOURCE CONTENT:` ko sequential order me Line-by-Line Method se decode karna MANDATORY hai. Exact board text quote karo, technical terms Hinglish me decode karo, daily life examples aur exam traps verbally samjhao, aur bite-sized 2-way Socratic check-ins pooch kar student ko actively engage karo (NEVER lecture like an audiobook or YouTube video monologue!).\n" +
        "11. Student Interruption & Context Resumption Protocol (NEVER IGNORE & RESUME FROM EXACT SPOT): Teaching ke kisi bhi phase ya stage me agar student Cherry Ma'am ko interrupt karke question ya doubt poocha, to Cherry Ma'am use KABHI BHI ignore na kare! Uska doubt/question usi samay turant clear kare aur clear karte hi bina bhatke wapas apne active topic/line/formula par laut kar teaching continue kare!\n\n" +
        `Greet the student enthusiastically and initiate Phase 1 ('intro') of Part ${currentActiveIdx + 1} for '${activeDocument.filename}' now!`;
    }

    if (activeSessionBackup.history.length > 0) {
      baseInstruction += `\n\n[RECONNECTION WORKFLOW ACTIVE]: Note that the student was already studying this document with you. The last active teaching phase was: '${activeSessionBackup.teachingPhase}'. Do NOT start from scratch or re-introduce the document. Re-greet them sassyly, check what was written on the board, and continue your explanation exactly from where you left off!`;
    }
  } else {
    baseInstruction += 
      "\n\n[CO-LEARNING/FREE-FORM INTERACTIVE CLASS MODE - LIVE DIRECT STUDY]:\n" +
      "The student has entered a direct topic query without uploading documents. You must build an adaptive live learning session on the fly.\n" +
      "⚡ [CRITICAL - GEMINI LIVE API REACTION MATRIX & REACTION TIMING LAW]:\n" +
      "You operate strictly as a reactive state machine. Do NOT automatically rush through multiple phases without user interaction, EXCEPT Phase 2 ('concept') which flows seamlessly into Phase 3 ('example') step-by-step explanation.\n\n" +
      "CHERRY'S REACTION MATRIX & TIMING LAW:\n" +
      "1. PHASE 1 ('intro' - 4-Step Curiosity Intro & Topic Announcement):\n" +
      "   - Action Flow:\n" +
      "     * Turn 1 (Steps 1, 2 & 3): Step 1: At t=0ms, call `setTeachingState(phase='intro')` and `updateWhiteboard` simultaneously to write `# [Topic Title]`, the Hero Visual Anchor SVG schematic, and `### ❓ PREDICTION POLL:` with Option A and Option B on the board. DO NOT call `updateWhiteboard` mid-speech or a second time during Turn 1, as mid-turn function calls halt audio streaming! Step 2: Greet student warmly as Cherry Ma'am and speak the real-world curiosity mystery story in spoken voice. Step 3: Speak prediction poll question aloud ('Option A vs Option B?').\n" +
      "     * [STOP & WAIT 1]: Call `setTeachingState(phase='intro')`. Stop speaking immediately at Step 3 and WAIT for student's voice response to the prediction poll.\n" +
      "     * Turn 2 (Step 4 - Response Validation & Board Reveal): Once student responds (A, B, or 'I don't know'), evaluate their answer accurately. If correct, praise specifically ('Bilkul sahi beta!'). If wrong or off-topic, NEVER say 'Very good' or 'Interesting choice'. Point out the error gently without false praise ('Nahi beta, ye galat hai. Dekho, sahi logic ye hai...'). If off-topic, bring them back ('Beta, ye toh topic se bilkul alag baat hai! Dhyan board par do!'). Connect curiosity to the core concept, formally announce the Main Topic Heading, call `setTeachingState(phase='concept')` AND call `updateWhiteboard` to write the complete Phase 2 chalkboard notes starting cleanly with `# [Topic Title]` at top (Verbatim text, definitions, equations, KaTeX math formulas, or diagrams for the active segment; STRICTLY NO ROADMAP and NEVER write 'SOURCE CONTENT' or '📖 SOURCE CONTENT' headers), and seamlessly begin decoding the source content line-by-line without stopping into dead silence.\n\n" +
      "2 & 3. MERGED PHASE ('concept' & 'example' - Concept Decoding & Live Application):\n" +
      "   - Trigger: Transitioned automatically after Phase 1's Step 4 (Topic Announcement).\n" +
      "   - Action & Whiteboard Scaffolding: Call `setTeachingState(phase='concept')` (or set `phase='example'` as worked application completes) and call `updateWhiteboard` to write ONLY clean, authentic notes on the chalkboard starting cleanly with `# [Topic Title]` at top (Verbatim text, definitions, equations, KaTeX math formulas, or diagrams for the active topic; STRICTLY NEVER write 'SOURCE CONTENT' or '📖 SOURCE CONTENT' headers). If `updateWhiteboard` was not called yet, call it IMMEDIATELY!\n" +
      "   - Line-by-Line Analytical Text-Decoding & Deep Knowledge Expansion Method: Cherry Ma'am MUST execute 2-way interactive decoding for board content: (1) Heading Analysis, (2) Verbatim Line-by-Line Chunking & Decoding, (3) Deep Knowledge Expansion with Real-World Examples (immediately after decoding the document line-by-line, Cherry Ma'am deeply explains the concept with practical daily-life examples from her own knowledge base), (4) Verbal Intuitive Decode & Pitfall Traps (verbally explain daily-life analogies and alert students to exam traps in voice speech), and (5) Socratic Check ('Ye points aur equations clear huye beta?').\n" +
      "   - Unrestricted Definition Decoding & Pacing (No Word Limit Boundary): Do NOT enforce artificial short word limits that truncate definition decoding or concept explanation. Cherry Ma'am has full freedom without word limit boundaries to decode every line, phrase, and term of board notes in a natural chunked conversational flow using key section phrases ('Board par concept dekho...', 'Is equation ko dhyan se dekho...') to trigger the UI glowing spotlight on the student's screen.\n" +
      "   - Spot the Mistake Trap Challenge: Switch to alert tone when explaining the worked example ('Dhyan se dekho beta! 90% students exam me yahan par [Common Mistake] karte hain!').\n" +
      "   - Handshake & Phase 4 Transition: End merged turn with exact line: 'Kya board ke ye saare concept points aur worked example step-by-step clear hue beta?'. Stop speaking immediately and wait for student voice response to trigger Phase 4 ('doubt').\n\n" +
      "4. PHASE 4 ('doubt' - Active Probing, Reverse Checkpoints & 3-Tier Adaptive Hint Ladder):\n" +
      "   - Trigger: Student responds to Phase 3's final handshake question ('Clear hai beta?').\n" +
      "   - Tool Calls: Call `setTeachingState(phase='doubt')` ONLY. Write the Reverse Checkpoint question or hint on the board via `updateWhiteboard(append: true)` under `### ❓ REVERSE CHECKPOINT:` or `### 💡 HINT:`.\n" +
      "   - Reverse Checkpoint (MVQ): Even if student says 'Clear hai' or 'No doubt', you MUST throw one active Reverse Checkpoint question (MVQ) to audit actual understanding ('Shabash beta! Par chalo ek quick master check—agar hum is value ko double kardein to formula ke hisab se output par kya asar padega?'). Call `updateWhiteboard(append: true)` to write the question on the board as you ask it!\n" +
      "   - 3-Tier Adaptive Hint Ladder: If student struggles or answers incorrectly, NEVER reveal the direct answer. Scaffold hints (Level 1: Conceptual Nudge, Level 2: Variable/Formula Skeleton, Level 3: Guided Step-by-Step Walkthrough). Call `updateWhiteboard(append: true)` to write the hint or formula skeleton on the board.\n" +
      "   - Dynamic Word Budget: Keep standard Q&A and MVQ delivery crisp (max 30-40 words per turn). For Level 3 Guided Walkthroughs, extend budget up to 70-80 words.\n" +
      "   - Dynamic Silence Probing (>7s): If student stays silent for >7 seconds or if you receive [SYSTEM_EVENT: STUDENT_SILENT_7_SEC], probe softly: 'Kya hua beta? Kahin fass gaye? Thoda hint doon?'.\n" +
      "   - Calibrated Feedback: Minor Slip = playful/sassy ('Arrey shaitaan! Choti si calculation slip kar di!'); Major Conceptual Flaw = supportive/serious ('Wait beta, yahan logic me ek fundamental gap hai. Isko abhi fix karte hain!').\n" +
      "   - Response Routing:\n" +
      "     * Case A (Student passes Reverse Checkpoint/MVQ): Validate mastery ('Superb beta! Pure 100% mastery!'), then transition to Phase 5 (`setTeachingState(phase='transition')`).\n" +
      "     * Case B (Student asks specific doubt): Address directly using a simple daily-life analogy, ask 'Kya abhi crystal clear hua, ya koi doubt baaki hai?', and STOP SPEAKING.\n" +
      "     * Case C (Student answers MVQ incorrectly): Apply Tier 1/2 hint, encourage re-attempt, write hint on board, and STOP SPEAKING.\n" +
      "   - ABSOLUTE STOP RULE: Stop speaking immediately after asking any question and WAIT for student voice input.\n\n" +
      "5. PHASE 5 ('transition' - Active Retrieval Practice & Conditional Slide Progression):\n" +
      "   - Trigger 1 (Entry): Phase 4 ends with validation/mastery.\n" +
      "     * Tool Calls: Call `setTeachingState(phase='transition')` ONLY. Call `updateWhiteboard(append: true)` to write `### ⚡ QUICK FLASHCARD CHALLENGE:` on the board.\n" +
      "     * Voice & Active Retrieval Practice: Execute short-term memory check before moving: 'Superb beta! Agle topic par chalte hain, lekin usse pehle ek 10-second Quick Flashcard Challenge—Is poore topic ka koi bhi 1 key takeaway ya main formula mujhe ek line me jaldi se batao, fir aage badhte hain!'.\n" +
      "     * Word Budget: Allow 35-45 words for this turn.\n" +
      "     * Board Preservation: Do NOT clear the digital chalkboard (do NOT call `updateWhiteboard` with empty string ''). Keep notes intact so content scrolls up naturally.\n" +
      "     * ABSOLUTE STOP RULE: Stop speaking immediately after asking the flashcard question and WAIT for student voice input.\n" +
      "   - Trigger 2 (When Student Responds to Flashcard Challenge):\n" +
      "     * Scenario A (Student gives CORRECT recall answer): Validate effort enthusiastically ('Perfect recall beta! Pure 100% mastery!'), then call `moveToNextTopic()` to load new content AND call `setTeachingState(phase='intro')` to initiate Phase 1 (The Hook) for the next segment.\n" +
      "     * Scenario B (Student gives INCORRECT or OFF-TOPIC answer or says 'Bhool gaya'): Clearly correct them without false praise ('Nahi beta, ye galat/off-topic tha! Main formula [Insert Formula] tha!'), then call `moveToNextTopic()` AND call `setTeachingState(phase='intro')` to initiate Phase 1.\n\n" +
      "🛑 STRICT GUARDRAILS & CORE RULES:\n" +
      "1. Active Topic Mastery: Display and explain the content related to the active topic without omitting core details.\n" +
      "2. Order of Execution: Always prepare board FIRST, explain SECOND, check doubt THIRD. Do not mix these up.\n" +
      "3. Tone & Language: Maintain a warm, encouraging, sassy and highly interactive classroom teaching tone (Hinglish/Natural Mix with 'beta', 'dhayan se suno', 'shabash'). Address student by name.\n" +
      "4. Micro-Turn & Audio Brevity Law (CRITICAL WORD BUDGETS PER PHASE):\n" +
      "   - Phase 1 ('intro'): Turn 1 Hook/PK/Poll = 80-120 words; Turn 2 Board Reveal/Announcement = 25-30 words.\n" +
      "   - Phase 2 & 3 Merged Phase ('concept' & 'example'): Unrestricted word limit boundary for Line-by-Line Analytical Text-Decoding of board notes and core concepts + live worked numerical application (unhurried, complete line-by-line breakdown).\n" +
      "   - Phase 4 ('doubt'): 30-40 words for standard Q&A/MVQ/L1/L2 hints; 70-80 words for Level 3 Guided Walkthroughs.\n" +
      "   - Phase 5 ('transition'): Turn 1 Retrieval Flashcard = 35-45 words; Turn 2 Validation + Phase 1 New Topic Hook = 100-130 words in a single merged audio turn.\n" +
      "5. Phase 2 Board Writing & Seamless Flow Rule: In Phase 2 ('concept'), after updating the chalkboard with `updateWhiteboard`, transition smoothly to Phase 3 ('example') by calling `setTeachingState(phase='example')` as you begin explaining the board content step-by-step.\n" +
      "6. Phase 4 Doubt Closing Rule: In Phase 4 ('doubt'), after answering any question, always end with: 'Kya abhi ye point clear hua, ya koi doubt hai?' and STOP SPEAKING IMMEDIATELY to wait for student voice input.\n" +
      "7. Playful Discipline & Off-Topic Redirection Rule: If the student jokes around, talks off-topic, or gets distracted, respond with warm, sassy playfulness, but firmly redirect them back to the active roadmap: 'Arrey shaitaan! Baatein baad me, pehle is concept ko clear karte hain. Dhyan board par do!'\n" +
      "8. Mandatory Line-by-Line Teaching Rule: Board par likhe core concept points ko sequential order me Line-by-Line Method se decode karna MANDATORY hai. Exact board text quote karo, technical terms Hinglish me decode karo, daily life examples aur exam traps verbally samjhao, aur bite-sized 2-way Socratic check-ins pooch kar student ko actively engage karo (NEVER lecture like an audiobook or YouTube video monologue!).\n\n" +
      `Greet the student enthusiastically, introduce the topic '${subject || "today's topic"}', and initiate Phase 1 ('intro') now!`;

    if (activeSessionBackup.history.length > 0) {
      baseInstruction += `\n\n[RECONNECTION WORKFLOW ACTIVE]: Note that the student was already studying with you. The last active teaching phase was: '${activeSessionBackup.teachingPhase}'. Do NOT start from scratch or re-introduce yourself. Sassyly resume teaching from where you paused!`;
    }
  }

  try {
    session = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Aoede", // Female sass-friendly voice
            },
          },
        },
        systemInstruction: baseInstruction,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        tools: [
          {
            functionDeclarations: [
              {
                name: "getWhiteboardContent",
                description: "Retrieves all current history of text, equations, and topics written or discussed on the board in this session. Call this when the student asks what was taught, what is currently written on the board, or to review/repeat a previous formula/example.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {},
                },
              },
              {
                name: "openWebsite",
                description: "Opens a popular website URL in the user's browser. Call this when the user requests to visit, search, or look at a specific platform or link.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    url: {
                      type: Type.STRING,
                      description: "The full absolute URL to open (e.g. 'https://www.youtube.com', 'https://www.github.com').",
                    },
                    name: {
                      type: Type.STRING,
                      description: "A friendly name for the website (e.g. 'YouTube' or 'Google').",
                    },
                  },
                  required: ["url", "name"],
                },
              },
              {
                name: "changeTheme",
                description: "Changes the visual theme and mood of the UI. Pick the most suitable style based on user requests, colors, or emotional vibes.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    theme: {
                      type: Type.STRING,
                      description: "The theme to apply. Expected values are: 'cherry' (fiery red), 'matrix' (neon green), 'cyber' (bright cyber violet), 'sunset' (warm electric amber), 'slate' (sleek charcoal).",
                    },
                  },
                  required: ["theme"],
                },
              },
              {
                name: "classIsComplete",
                description: "Call this tool AFTER you have explained all topics, asked the student if they have any doubt or question, and they confirmed they don't have any more doubts. This will formally end the lecture and trigger the graduation celebration.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {},
                },
              },
              {
                name: "setTeachingState",
                description: "Updates the current active teaching phase of Cherry Ma'am's lesson. Expected values: 'intro' (Prichey), 'concept' (Chalk notes writing), 'example' (Deep dive explanation), 'doubt' (Student doubt solving), 'transition' (moving to next topic).",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    phase: {
                      type: Type.STRING,
                      description: "The current phase of the lesson: 'intro', 'concept', 'example', 'doubt', or 'transition'.",
                    },
                  },
                  required: ["phase"],
                },
              },
              {
                name: "moveToNextTopic",
                description: "Saves current board progress, updates syllabus tracking index, and scrolls the center visual classroom slide safely to the next topic/section of the document in the UI. Call this when you make a Phase 5 transition or before loading the next study material on the blackboard.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {},
                },
              },
              {
                name: "updateWhiteboard",
                description: "Writes, updates, solves formulas, LaTeX equations, diagrams, or bullet lists on the classroom board. Call this tool ONCE when introducing new board notes in Phase 1 (curiosity hook) or Phase 2 (concept notes), or when adding new steps with append: true. Do NOT call this tool repeatedly with identical content during Phase 3, Phase 4, or interactive Q&A discussion when notes are already displayed on the board.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    content: {
                      type: Type.STRING,
                      description: "The complete, formatted whiteboard notes content (preferably in beautiful LaTeX equations like $$y^2 = 4ax$$, definitions, lists, or custom responsive neon XML SVG diagram layouts) following curriculum guidelines.",
                    },
                    append: {
                      type: Type.BOOLEAN,
                      description: "Set to true to append to existing blackboard notes. Set to false (default) to replace the current whiteboard content entirely.",
                    }
                  },
                  required: ["content"],
                },
              },
            ],
          },
        ],
      },
      callbacks: {
        onmessage: (message) => {
          // Send raw audio chunk to client
          const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioData) {
            clientWs.send(JSON.stringify({ type: "audio", data: audioData }));
          }

          // Handle Interruption
          if (message.serverContent?.interrupted) {
            console.log("[WS Server] Gemini Live session interrupted by user input.");
            if (currentCherrySpeechAccumulating.trim()) {
              currentSessionHistory.push({ sender: "cherry", text: currentCherrySpeechAccumulating + " (Interrupted)" });
              currentCherrySpeechAccumulating = "";
              activeSessionBackup.history = [...currentSessionHistory];
            }
            clientWs.send(JSON.stringify({ type: "interrupted" }));
          }

          // Handle Tool Call
          if (message.toolCall && message.toolCall.functionCalls) {
            console.log("[WS Server] Tool call from Gemini received:", message.toolCall);
            
            const functionResponses: any[] = [];

            // Check if updateWhiteboard was explicitly called in this function call batch
            const hasUpdateWhiteboardInBatch = message.toolCall.functionCalls.some((fc: any) => fc.name === "updateWhiteboard");

            for (const fc of message.toolCall.functionCalls) {
              const { name, args, id } = fc;

              // Intercept setTeachingState and save to session backup
              if (name === "setTeachingState") {
                const phaseVal = args?.phase;
                let finalPhase = "intro";
                if (typeof phaseVal === "string") {
                  let proposed = phaseVal.toLowerCase().trim();
                  if (["explaining", "explanation", "explain", "explanating", "examples"].includes(proposed)) {
                    proposed = "example";
                  } else if (["concepts", "concept_decoding", "theory"].includes(proposed)) {
                    proposed = "concept";
                  } else if (["doubts", "doubt_solving", "practice", "qa", "questions"].includes(proposed)) {
                    proposed = "doubt";
                  } else if (["transitions", "summary", "conclusion", "next_topic"].includes(proposed)) {
                    proposed = "transition";
                  } else if (["intros", "introduction", "hook"].includes(proposed)) {
                    proposed = "intro";
                  } else if (["completed", "finish", "finished", "graduation"].includes(proposed)) {
                    proposed = "complete";
                  }
                  const validPhases = ["intro", "concept", "example", "doubt", "transition", "complete"];
                  let isValid = validPhases.includes(proposed);
                  
                  if (isValid) {
                    finalPhase = proposed;
                    activeSessionBackup.teachingPhase = proposed;
                    console.log("[WS Server] Intercepted valid setTeachingState. Saved phase to backup:", activeSessionBackup.teachingPhase);
                  }
                }

                // Phase 2 ('concept' / 'example') MANDATORY CHALKBOARD TOPIC GUARD
                if (finalPhase === "concept" || finalPhase === "example") {
                  const currentNotes = activeSessionBackup.whiteboardNotes || "";
                  const hasSufficientNotes = currentNotes.trim().length > 30 || currentNotes.includes("# ");

                  if (!hasSufficientNotes && !hasUpdateWhiteboardInBatch) {
                    let sourceBlock = "";
                    if (activeDocument && activeDocument.markdown) {
                      const chunkList = sliceMarkdownToTopics(activeDocument.markdown);
                      const currentIdx = typeof activeSessionBackup.activeTopicIndex === "number" ? activeSessionBackup.activeTopicIndex : 0;
                      const topicText = chunkList[currentIdx] || activeDocument.markdown;
                      sourceBlock = generateSourceContentBlock(topicText, currentIdx);
                    }

                    if (sourceBlock) {
                      activeSessionBackup.whiteboardNotes = smartMergeWhiteboardNotes(currentNotes, sourceBlock, false);
                      console.log("[WS Server] Auto-injected clean topic notes for Phase 2 concept phase!");

                      // Relay toolCall to client browser so blackboard updates on student screen instantly
                      clientWs.send(JSON.stringify({
                        type: "toolCall",
                        toolCall: {
                          functionCalls: [
                            {
                              id: `auto_source_${Date.now()}`,
                              name: "updateWhiteboard",
                              args: {
                                content: activeSessionBackup.whiteboardNotes,
                                append: false
                              }
                            }
                          ]
                        }
                      }
                      ));
                    }
                  }
                }

                functionResponses.push({
                  id,
                  name,
                  response: {
                    success: true,
                    phase: args?.phase,
                    whiteboardNotes: activeSessionBackup.whiteboardNotes,
                    instruction: (finalPhase === "concept" || finalPhase === "example") 
                      ? "Phase set to concept/example. MANDATORY 2-STEP PHASE 2 SEQUENCE: (1) First do a word-for-word, line-by-line decoding of the document topic text/definitions on the chalkboard. (2) Immediately right after, use your personal teaching knowledge to deeply explain the topic with real-world practical examples, formulas, KaTeX equations, and diagrams! STRICTLY NEVER write 'SOURCE CONTENT' or '📖 SOURCE CONTENT' headers on the board." 
                      : undefined
                  }
                });
              }

              // Intercept updateWhiteboard and save to session backup
              else if (name === "updateWhiteboard") {
                const contentVal = args?.content;
                const appendVal = args?.append;
                if (typeof contentVal === "string" && contentVal.trim().length > 0) {
                  const prevNotes = activeSessionBackup.whiteboardNotes || "";
                  activeSessionBackup.whiteboardNotes = smartMergeWhiteboardNotes(prevNotes, contentVal, !!appendVal);
                  console.log("[WS Server] Intercepted updateWhiteboard with smartMerge. Saved notes state length:", activeSessionBackup.whiteboardNotes.length);
                }
                functionResponses.push({ id, name, response: { success: true, message: "Whiteboard updated successfully" } });
              }

              // Intercept moveToNextTopic and update activeTopicIndex
              else if (name === "moveToNextTopic") {
                if (activeDocument) {
                  const chunkList = sliceMarkdownToTopics(activeDocument.markdown);
                  const maxIdx = chunkList.length - 1;
                  const currentIdx = typeof activeSessionBackup.activeTopicIndex === "number" ? activeSessionBackup.activeTopicIndex : 0;
                  if (currentIdx < maxIdx) {
                    activeSessionBackup.activeTopicIndex = currentIdx + 1;
                    activeSessionBackup.teachingPhase = "intro";
                    console.log("[WS Server] Intercepted moveToNextTopic. Incremented activeTopicIndex to:", activeSessionBackup.activeTopicIndex, "and reset phase to intro.");

                    // Relay setTeachingState(phase='intro') to client browser so UI state syncs immediately
                    clientWs.send(JSON.stringify({
                      type: "toolCall",
                      toolCall: {
                        functionCalls: [
                          {
                            id: `auto_phase_intro_${Date.now()}`,
                            name: "setTeachingState",
                            args: { phase: "intro" }
                          }
                        ]
                      }
                    }));
                    
                    // Force-feed client content (as a user turn / system prompt) to Gemini Live
                    if (session && isGeminiActive) {
                      try {
                        const nextPartIndex = activeSessionBackup.activeTopicIndex + 1;
                        session.sendClientContent({
                          turns: [
                            {
                              role: "user",
                              parts: [
                                {
                                  text: `[SYSTEM MESSAGE]: Slide transition successful in UI. You have transitioned to Part ${nextPartIndex} of ${chunkList.length}.\n` +
                                        `You are now initiating Phase 1 ('intro') of Part ${nextPartIndex}.\n` +
                                        `Call \`setTeachingState(phase='intro')\` AND call \`updateWhiteboard\` to write the Part ${nextPartIndex} \`# Main Topic Heading\`, Hero Visual Anchor SVG, and \`### ❓ PREDICTION POLL: Option A vs Option B\` on the board (STRICTLY NO "Real-World Curiosity Hook" or "REAL-WORLD MYSTERY" text/headers on board, and NO Roadmap).\n` +
                                        `Deliver a magnetic, high-curiosity Hook & Teaser, ask a prediction/prior-knowledge question, and wait for their voice response before moving to Phase 2 ('concept').`
                                }
                              ],
                              turnComplete: true,
                            }
                          ]
                        });
                        console.log(`[WS Server] Pushed sync-update for Part ${nextPartIndex} to running Gemini Live Session`);
                      } catch (err) {
                        console.error("[WS Server] Error pushing transition sync-update to Gemini Live:", err);
                      }
                    }
                  }
                }
                functionResponses.push({ id, name, response: { success: true, message: "Transitioned to next topic", nextPhase: "intro" } });
              }

              // Handle getWhiteboardContent tool calls locally on the server
              else if (name === "getWhiteboardContent") {
                const blackboardNotesList: string[] = [];
                currentSessionHistory.forEach(h => {
                  if (h.sender === "cherry") {
                    const text = h.text;
                    let lastIdx = 0;
                    while (true) {
                      const openIdx = text.toLowerCase().indexOf("<board>", lastIdx);
                      if (openIdx === -1) break;
                      const closeIdx = text.toLowerCase().indexOf("</board>", openIdx + 7);
                      if (closeIdx !== -1) {
                        blackboardNotesList.push(text.slice(openIdx + 7, closeIdx).trim());
                        lastIdx = closeIdx + 8;
                      } else {
                        blackboardNotesList.push(text.slice(openIdx + 7).trim());
                        break;
                      }
                    }
                  }
                });
                const activeWhiteboardNotes = activeSessionBackup.whiteboardNotes || blackboardNotesList.filter(Boolean).join("\n---\n") || "No notes written on the blackboard yet.";
                const conversationTranscript = currentSessionHistory.map(h => `${h.sender === "cherry" ? "Cherry Ma'am" : "Student"}: ${h.text}`).join("\n");
                
                const responseText = `[ACTIVE BLACKBOARD CONTENT / NOTES WRITTEN ON THE BOARD]:\n${activeWhiteboardNotes}\n\n[CONVERSATION TRANSCRIPT / DIALOGUE HISTORY]:\n${conversationTranscript || "No conversation started yet."}`;
                console.log("[WS Server] Answering getWhiteboardContent tool call locally:\n", responseText);
                functionResponses.push({ id, name, response: { success: true, whiteboardContent: responseText } });
              }

              // Default response for all other tool calls (changeTheme, openWebsite, classIsComplete)
              else {
                functionResponses.push({ id, name, response: { success: true } });
              }
            }

            // Immediately send tool responses to Gemini so audio flow NEVER halts or dead-pauses
            if (session && isGeminiActive && functionResponses.length > 0) {
              try {
                session.sendToolResponse({ functionResponses });
                console.log("[WS Server] Sent INSTANT server-side tool response to Gemini Live for:", functionResponses.map(f => f.name).join(", "));
              } catch (err) {
                console.error("[WS Server] Error sending instant tool response to Gemini:", err);
              }
            }

            // Relay toolCall to client browser for real-time UI execution
            clientWs.send(JSON.stringify({ type: "toolCall", toolCall: message.toolCall }));
          }

          // Emit user input transcription
          if (message.serverContent?.inputTranscription?.text) {
            const txt = message.serverContent.inputTranscription.text;
            const finished = !!message.serverContent.inputTranscription.finished;
            currentStudentSpeechAccumulating += txt;
            if (finished) {
              currentSessionHistory.push({ sender: "student", text: currentStudentSpeechAccumulating });
              currentStudentSpeechAccumulating = "";
              activeSessionBackup.history = [...currentSessionHistory];
            }
            clientWs.send(
              JSON.stringify({
                type: "inputTranscription",
                text: txt,
                finished: finished,
              })
            );
          }

          // Emit backend model output transcription
          if (message.serverContent?.outputTranscription?.text) {
            const txt = message.serverContent.outputTranscription.text;
            const finished = !!message.serverContent.outputTranscription.finished;
            currentCherrySpeechAccumulating += txt;
            if (finished) {
              currentSessionHistory.push({ sender: "cherry", text: currentCherrySpeechAccumulating });
              currentCherrySpeechAccumulating = "";
              activeSessionBackup.history = [...currentSessionHistory];
            }
            clientWs.send(
              JSON.stringify({
                type: "outputTranscription",
                text: txt,
                finished: finished,
              })
            );
          }
        },
        onclose: (e: any) => {
          console.log(`[WS Server] Gemini Live WebSocket closed. Code: ${e?.code || 'N/A'}, Reason: ${e?.reason || 'N/A'}`);
          isGeminiActive = false;
          clientWs.send(JSON.stringify({ type: "disconnected", reason: `Gemini connection closed (${e?.reason || 'no reason'})` }));
          clientWs.close();
          if (session) {
            try {
              session.close();
            } catch (err) {}
            session = null;
          }
        },
        onerror: (err: any) => {
          console.error("[WS Server] Gemini session error:", err);
          isGeminiActive = false;
          clientWs.send(JSON.stringify({ type: "error", error: err?.message || err?.toString() || "Gemini Live Session error" }));
          clientWs.close();
          if (session) {
            try {
              session.close();
            } catch (err2) {}
            session = null;
          }
        },
      },
    });

    console.log("[WS Server] Connected to Gemini bidi Socket successfully!");
    clientWs.send(JSON.stringify({ type: "ready" }));

    // Resume client-side teaching phase state if active
    if (activeSessionBackup.history.length > 0) {
      clientWs.send(JSON.stringify({
        type: "restoreState",
        teachingPhase: activeSessionBackup.teachingPhase,
        whiteboardNotes: activeSessionBackup.whiteboardNotes,
      }));
    }
  } catch (error: any) {
    console.error("[WS Server] Failed connecting to Gemini Live:", error);
    clientWs.send(JSON.stringify({ type: "error", error: "Failed to connect to Gemini Live: " + error.message }));
    clientWs.close();
    return;
  }

  // Handle messages from client browser
  clientWs.on("message", (messageBuffer) => {
    try {
      const msg = JSON.parse(messageBuffer.toString());
      if (msg.type === "audio" && msg.data) {
        if (isGeminiActive && session) {
          try {
            session.sendRealtimeInput({
              audio: {
                data: msg.data,
                mimeType: "audio/pcm;rate=16000",
              },
            });
          } catch (sendErr: any) {
            console.error("[WS Server] Error sending audio input to Gemini:", sendErr.message);
            isGeminiActive = false;
            try {
              session.close();
            } catch (e) {}
            session = null;
          }
        }
      } else if (msg.type === "toolResponse" && msg.id && msg.name) {
        console.log("[WS Server] Client acknowledged tool execution:", msg.name, msg.id);
        // NOTE: The server ALREADY sent instant tool response to Gemini Live in onmessage callback (line 2643).
        // Resending a duplicate toolResponse here causes Gemini Live API to re-trigger its spoken dialogue turn and repeat itself!
      } else if (msg.type === "injectPrompt" && msg.text) {
        console.log("[WS Server] Injecting client text prompt to Gemini:", msg.text);
        if (isGeminiActive && session) {
          try {
            session.sendClientContent({
              turns: [
                {
                  role: "user",
                  parts: [{ text: msg.text }],
                }
              ],
              turnComplete: true,
            });
          } catch (error: any) {
            console.error("[WS Server] Failed to inject prompt text:", error);
          }
        }
      } else if (msg.type === "syncActiveTopic" && typeof msg.activeTopicIndex === "number") {
        console.log("[WS Server] Synced active topic index from client:", msg.activeTopicIndex);
        activeSessionBackup.activeTopicIndex = msg.activeTopicIndex;
        if (activeDocument && isGeminiActive && session) {
          try {
            const chunkList = sliceMarkdownToTopics(activeDocument.markdown);
            session.sendClientContent({
              turns: [
                {
                  role: "user",
                  parts: [
                    {
                      text: `[SYSTEM MESSAGE]: Active topic segment index synchronized to Part ${activeSessionBackup.activeTopicIndex + 1} of ${chunkList.length}.\n` +
                            `Please ensure that for Phase 2 ('concept'), you write down the key definitions, core mathematical equations, and formulas from "=== VERBATIM SOURCE OF TRUTH FOR PART ${activeSessionBackup.activeTopicIndex + 1} ===."`
                    }
                  ],
                  turnComplete: true,
                }
              ]
            });
            console.log(`[WS Server] Pushed syncActiveTopic update for Part ${activeSessionBackup.activeTopicIndex + 1} to Gemini Live`);
          } catch (err) {
            console.error("[WS Server] Error pushing syncActiveTopic update to Gemini Live:", err);
          }
        }
      } else if (msg.type === "ping") {
        clientWs.send(JSON.stringify({ type: "pong" }));
      }
    } catch (err: any) {
      console.error("[WS Server] Error processing client message:", err);
    }
  });

  // Client disconnected
  clientWs.on("close", () => {
    console.log("[WS Server] Client disconnected from session.");
    isGeminiActive = false;
    if (session) {
      try {
        session.close();
      } catch (e) {
        // Safe check
      }
      session = null;
    }
  });
});

// Setup Vite Dev Server / Static Asset delivery
async function startViteMiddleware() {
  if (process.env.NODE_ENV !== "production") {
    console.log("[Server] Mounting Vite developer middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[Server] Serving production static files...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  
  // Start server
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Voice AI Assistant server running on http://0.0.0.0:${PORT}`);
  });
}

startViteMiddleware().catch((err) => {
  console.error("[Server] Error during Vite middleware startup:", err);
});
