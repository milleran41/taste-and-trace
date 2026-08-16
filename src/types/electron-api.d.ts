export {};

export type TasteTraceTranscribeRequest =
  | string
  | {
      type?: "url";
      url: string;
      language?: string;
    }
  | {
      type: "file";
      path: string;
      name?: string;
      language?: string;
    };

export interface TasteTraceSelectedVideoFile {
  path: string;
  name: string;
}

export interface TasteTraceSelectVideoFileResult {
  canceled: boolean;
  file?: TasteTraceSelectedVideoFile;
}

export interface TasteTraceTranscriptionError {
  code: string;
  message: string;
}

export interface TasteTraceTranscriptionTimings {
  metadata_seconds?: number;
  download_seconds?: number;
  model_load_seconds?: number;
  transcription_seconds?: number;
  total_seconds?: number;
}

export interface TasteTraceTranscriptionResult {
  success: boolean;
  text?: string;
  language?: string | null;
  language_probability?: number | null;
  duration?: number | null;
  engine?: string;
  model?: string;
  device?: string;
  compute_type?: string;
  transcription_seconds?: number;
  total_seconds?: number;
  timings?: TasteTraceTranscriptionTimings;
  electron?: {
    helper_wall_seconds: number;
    overhead_seconds: number | null;
    timeout_ms: number;
    helper: "python-cli" | "bundled-exe";
    model_dir: string;
  };
  error?: TasteTraceTranscriptionError;
}

export interface TasteTraceTranscriptionHealthResult {
  success?: boolean;
  status?: "ok" | string;
  engine?: string;
  model?: string;
  model_dir?: string | null;
  device?: string;
  compute_type?: string;
  default_language?: string;
  vad_filter?: boolean;
  token_configured?: boolean;
  ffmpeg_found?: boolean;
  ytdlp_no_check_certificate?: boolean;
  python_system_certs?: boolean;
  electron?: {
    helper_wall_seconds: number;
    overhead_seconds: number | null;
    timeout_ms: number;
    helper: "python-cli" | "bundled-exe";
    model_dir: string;
  };
  error?: TasteTraceTranscriptionError;
}

export interface TasteTraceVideoTextResult {
  success: boolean;
  platform?: "youtube" | string;
  extractorKey?: string | null;
  title?: string;
  description?: string;
  thumbnail?: string;
  transcript?: string;
  transcriptSource?: "manual" | "automatic" | "none" | string;
  ocrText?: string;
  ocr?: {
    success: boolean;
    text?: string;
    events?: Array<{ timestamp?: number; lastTimestamp?: number; text: string }>;
    engine?: string;
    sampleIntervalSeconds?: number;
    framesSampled?: number;
    total_seconds?: number;
    error?: TasteTraceTranscriptionError;
  };
  language?: string | null;
  duration?: number | null;
  resolution?: {
    width?: number | null;
    height?: number | null;
  };
  captionDiagnostics?: {
    manualLanguages?: string[];
    automaticLanguages?: string[];
    errors?: Array<{ source?: string; language?: string; message?: string }>;
  };
  total_seconds?: number;
  electron?: {
    helper_wall_seconds: number;
    overhead_seconds: number | null;
    timeout_ms: number;
    helper: "python-cli" | "bundled-exe";
    model_dir: string;
  };
  error?: TasteTraceTranscriptionError;
}

export interface TasteTraceVideoThumbnailResult {
  success: boolean;
  imageDataUrl?: string;
  mimeType?: "image/jpeg" | "image/webp" | string;
  timestamp?: number;
  strategy?: "first_good_candidate" | "best_available_candidate" | string;
  candidates?: Array<{
    timestamp: number;
    stats?: {
      brightness?: number;
      contrast?: number;
      entropy?: number;
      channelSpread?: number;
      width?: number;
      height?: number;
      rejected?: boolean;
      score?: number;
    };
  }>;
  platform?: string;
  sourceUrl?: string;
  videoUrl?: string;
  duration?: number | null;
  total_seconds?: number;
  electron?: {
    helper_wall_seconds: number;
    overhead_seconds: number | null;
    timeout_ms: number;
    helper: "python-cli" | "bundled-exe";
    model_dir: string;
  };
  error?: TasteTraceTranscriptionError;
}

export interface TasteTraceRecipeQualityWarning {
  code: "NEGATION_CONFLICT" | "UNSUPPORTED_QUANTITY" | "UNSUPPORTED_INGREDIENT" | "POSSIBLE_MISSING_INGREDIENT" | string;
  message?: string;
}

export interface TasteTraceRecipeQuality {
  score: "high" | "medium" | "low";
  needs_review: boolean;
  warnings: TasteTraceRecipeQualityWarning[];
  evidence_counts?: {
    numeric: number;
    negations: number;
    ingredient_like: number;
  };
}

export interface TasteTraceLocalParsedRecipe {
  title: string;
  description: string;
  ingredients: string[];
  instructions: string[];
  cooking_time: string;
  servings: number | null;
  difficulty: string;
  tags: string[];
  notes: string;
  category_hint: string;
}

export interface TasteTraceLocalRecipeParserResult {
  success: boolean;
  recipe?: TasteTraceLocalParsedRecipe;
  quality?: TasteTraceRecipeQuality;
  timings?: {
    wall_seconds?: number;
    input_chars?: number;
    peak_working_set_bytes?: number | null;
  };
  error?: TasteTraceTranscriptionError;
  details?: {
    downloadRequired?: boolean;
    modelFile?: string;
    modelSizeBytes?: number;
  };
}

export interface TasteTracePrepareRecipeParserModelResult {
  success: boolean;
  alreadyPresent?: boolean;
  model?: {
    file: string;
    size_bytes?: number;
    sha256?: string;
  };
  error?: TasteTraceTranscriptionError;
}

export interface TasteTraceTranslateRecipeLocalResult {
  success: boolean;
  recipe?: TasteTraceLocalParsedRecipe;
  targetLanguage?: string;
  quality?: TasteTraceRecipeQuality;
  timings?: {
    wall_seconds?: number;
    timeout_ms?: number;
    input_chars?: number;
    peak_working_set_bytes?: number | null;
  };
  model?: {
    file?: string;
    quantization?: string;
    size_bytes?: number | null;
  };
  runtime?: {
    engine?: string;
    version?: string;
  };
  error?: TasteTraceTranscriptionError;
  details?: {
    downloadRequired?: boolean;
    modelFile?: string;
    modelSizeBytes?: number;
  };
}

export interface TasteTraceVideoRecipeEvidenceSource {
  kind: "description" | "captions" | "chapters" | "ocr" | "speech" | "platform_page" | string;
  text: string;
  source?: string;
  engine?: string;
  events?: Array<{ timestamp?: number; lastTimestamp?: number; text: string }>;
}

export interface TasteTraceVideoRecipeEvidence {
  title?: string;
  platform?: string;
  language?: string | null;
  thumbnail?: string;
  sources?: TasteTraceVideoRecipeEvidenceSource[];
  diagnostics?: {
    stagesRun?: string[];
    stagesSkipped?: string[];
    linkedVideoUrl?: string | null;
    assessments?: Array<{
      stage: string;
      score: number;
      sufficient: boolean;
      facts?: Record<string, number>;
    }>;
    warnings?: Array<{ code?: string; message?: string }>;
  };
}

export interface TasteTraceImportVideoRecipeLocalResult {
  success: boolean;
  recipe?: TasteTraceLocalParsedRecipe & {
    source?: {
      sourceType: string;
      sourceUrl?: string;
      sourceFileName?: string;
      sourcePlatform: string;
      detectedLanguage?: string | null;
      importedAt?: string;
    };
    localDraft?: boolean;
    quality?: TasteTraceRecipeQuality;
    evidenceDiagnostics?: TasteTraceVideoRecipeEvidence["diagnostics"];
  };
  evidence?: TasteTraceVideoRecipeEvidence;
  stage?: string;
  details?: {
    evidence?: TasteTraceVideoRecipeEvidence;
    parserInput?: string;
  };
  error?: TasteTraceTranscriptionError;
}

export interface TasteTraceImportArticleRecipeLocalResult {
  success: boolean;
  recipe?: TasteTraceLocalParsedRecipe & {
    source?: {
      sourceType: string;
      sourceUrl?: string;
      sourcePlatform: string;
    };
    thumbnail?: string;
    localDraft?: boolean;
    quality?: TasteTraceRecipeQuality;
  };
  stage?: "json_ld" | "local_parser" | string;
  details?: {
    parserInput?: string;
  };
  error?: TasteTraceTranscriptionError;
}

declare global {
  interface Window {
    tasteTrace?: {
      selectVideoFile(): Promise<TasteTraceSelectVideoFileResult>;
      importVideoRecipeLocal(request: TasteTraceTranscribeRequest): Promise<TasteTraceImportVideoRecipeLocalResult>;
      importArticleRecipeLocal(request: { url: string }): Promise<TasteTraceImportArticleRecipeLocalResult>;
      extractVideoText(request: TasteTraceTranscribeRequest): Promise<TasteTraceVideoTextResult>;
      extractVideoThumbnail(request: TasteTraceTranscribeRequest): Promise<TasteTraceVideoThumbnailResult>;
      transcribeVideo(request: TasteTraceTranscribeRequest): Promise<TasteTraceTranscriptionResult>;
      transcribeYouTube(request: TasteTraceTranscribeRequest): Promise<TasteTraceTranscriptionResult>;
      getTranscriptionHealth(): Promise<TasteTraceTranscriptionHealthResult>;
      parseRecipeTextLocal(request: { text: string; sourceLanguage?: string }): Promise<TasteTraceLocalRecipeParserResult>;
      translateRecipeLocal(request: { recipe: unknown; targetLanguage: string }): Promise<TasteTraceTranslateRecipeLocalResult>;
      prepareRecipeParserModel(): Promise<TasteTracePrepareRecipeParserModelResult>;
    };
  }
}
