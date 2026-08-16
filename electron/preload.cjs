const { contextBridge, ipcRenderer } = require("electron");

const TRANSCRIBE_CHANNEL = "tasteTrace:transcribeYouTube";
const TRANSCRIBE_VIDEO_CHANNEL = "tasteTrace:transcribeVideo";
const EXTRACT_VIDEO_TEXT_CHANNEL = "tasteTrace:extractVideoText";
const EXTRACT_VIDEO_THUMBNAIL_CHANNEL = "tasteTrace:extractVideoThumbnail";
const TRANSCRIPTION_HEALTH_CHANNEL = "tasteTrace:getTranscriptionHealth";
const IMPORT_VIDEO_RECIPE_LOCAL_CHANNEL = "tasteTrace:importVideoRecipeLocal";
const PARSE_RECIPE_TEXT_LOCAL_CHANNEL = "tasteTrace:parseRecipeTextLocal";
const PREPARE_RECIPE_MODEL_CHANNEL = "tasteTrace:prepareRecipeParserModel";
const TRANSLATE_RECIPE_LOCAL_CHANNEL = "tasteTrace:translateRecipeLocal";
const SELECT_VIDEO_FILE_CHANNEL = "tasteTrace:selectVideoFile";

contextBridge.exposeInMainWorld("tasteTrace", {
  selectVideoFile() {
    return ipcRenderer.invoke(SELECT_VIDEO_FILE_CHANNEL);
  },
  importVideoRecipeLocal(request) {
    return ipcRenderer.invoke(IMPORT_VIDEO_RECIPE_LOCAL_CHANNEL, request);
  },
  extractVideoText(request) {
    return ipcRenderer.invoke(EXTRACT_VIDEO_TEXT_CHANNEL, request);
  },
  extractVideoThumbnail(request) {
    return ipcRenderer.invoke(EXTRACT_VIDEO_THUMBNAIL_CHANNEL, request);
  },
  transcribeVideo(request) {
    return ipcRenderer.invoke(TRANSCRIBE_VIDEO_CHANNEL, request);
  },
  transcribeYouTube(request) {
    return ipcRenderer.invoke(TRANSCRIBE_CHANNEL, request);
  },
  getTranscriptionHealth() {
    return ipcRenderer.invoke(TRANSCRIPTION_HEALTH_CHANNEL);
  },
  parseRecipeTextLocal(request) {
    return ipcRenderer.invoke(PARSE_RECIPE_TEXT_LOCAL_CHANNEL, request);
  },
  translateRecipeLocal(request) {
    return ipcRenderer.invoke(TRANSLATE_RECIPE_LOCAL_CHANNEL, request);
  },
  prepareRecipeParserModel() {
    return ipcRenderer.invoke(PREPARE_RECIPE_MODEL_CHANNEL);
  },
});
