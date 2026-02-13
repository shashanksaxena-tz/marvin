import { config } from '../config';

/**
 * Result from the Groq Whisper transcription API.
 */
export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

/**
 * Transcription service using Groq's Whisper API.
 * Converts audio buffers to text.
 */
export class TranscriptionService {
  private readonly apiKey: string;
  private readonly apiUrl = 'https://api.groq.com/openai/v1/audio/transcriptions';

  constructor() {
    this.apiKey = config.groqApiKey;
  }

  /**
   * Check if the transcription service is available (API key configured).
   */
  isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Transcribe an audio buffer to text using Groq Whisper.
   *
   * @param audioBuffer - The raw audio file data
   * @param filename - Original filename (used for content-type detection)
   * @returns Transcription result with text and metadata
   * @throws Error if API key is missing or API call fails
   */
  async transcribe(audioBuffer: Buffer, filename: string = 'audio.ogg'): Promise<TranscriptionResult> {
    if (!this.apiKey) {
      throw new Error('Groq API key not configured. Set GROQ_API_KEY in your .env file.');
    }

    try {
      // Normalize filename to an extension Groq accepts
      // Telegram sends .oga files which Groq doesn't recognize - rename to .ogg
      const normalizedFilename = this.normalizeFilename(filename);
      const mimeType = this.getMimeType(normalizedFilename);

      // Build multipart form data
      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: mimeType });
      formData.append('file', blob, normalizedFilename);
      formData.append('model', 'whisper-large-v3');
      formData.append('response_format', 'verbose_json');
      formData.append('language', 'en');

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Groq API error (${response.status}): ${errorBody}`);
      }

      const data = await response.json() as {
        text: string;
        language?: string;
        duration?: number;
      };

      return {
        text: data.text?.trim() || '',
        language: data.language,
        duration: data.duration,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Groq API error')) {
        throw error;
      }
      throw new Error(`Transcription failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Normalize filename to an extension Groq Whisper accepts.
   * Groq accepts: flac mp3 mp4 mpeg mpga m4a ogg opus wav webm
   * Telegram sends .oga files which need to be renamed to .ogg
   */
  private normalizeFilename(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';

    // Map unsupported extensions to supported ones
    const extensionMap: Record<string, string> = {
      'oga': 'ogg',   // Telegram voice messages
      'opus': 'ogg',  // Some voice recorders
      'aac': 'm4a',   // AAC audio
      'wma': 'mp3',   // Windows media
    };

    if (extensionMap[ext]) {
      const base = filename.substring(0, filename.lastIndexOf('.'));
      return `${base}.${extensionMap[ext]}`;
    }

    // If no extension or unrecognized, default to .ogg
    const supportedExts = ['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm'];
    if (!supportedExts.includes(ext)) {
      return `audio.ogg`;
    }

    return filename;
  }

  /**
   * Determine MIME type from filename extension.
   */
  private getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'ogg': 'audio/ogg',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'webm': 'audio/webm',
      'm4a': 'audio/mp4',
      'mp4': 'audio/mp4',
      'flac': 'audio/flac',
      'mpeg': 'audio/mpeg',
      'mpga': 'audio/mpeg',
    };
    return mimeTypes[ext || ''] || 'audio/ogg';
  }
}
