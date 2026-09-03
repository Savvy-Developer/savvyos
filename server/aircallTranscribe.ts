/**
 * Aircall transcription compatibility module.
 *
 * SavvyOS now receives transcripts and summaries from Aircall Conversation
 * Intelligence. This module intentionally contains no audio download, Whisper,
 * or LLM fallback so Aircall remains the single source for call intelligence.
 */
export {
  formatAircallTranscript,
  syncAircallSummary,
  syncAircallTranscript,
  withAircallSummary,
} from "./aircallConversationIntelligence";
