// MinerU API 类型定义

export interface MinerUConfig {
  apiToken: string;
  baseUrl?: string;
  enableTable?: boolean;
  enableFormula?: boolean;
  language?: string;
}

export interface UploadUrlResponse {
  code: number;
  data: {
    batch_id: string;
    file_urls: string[];
  };
  msg: string;
  trace_id: string;
}

export interface TaskStatusResponse {
  code: number;
  data: {
    batch_id: string;
    extract_result: Array<{
      file_name: string;
      state: 'waiting-file' | 'pending' | 'running' | 'done' | 'failed' | 'converting';
      full_zip_url?: string;
      err_msg?: string;
      data_id?: string;
      extract_progress?: {
        extracted_pages: number;
        total_pages: number;
        start_time: string;
      };
    }>;
  };
  msg: string;
  trace_id: string;
}

export interface ExtractionResult {
  text: string;
  markdownUrl?: string;
  images?: Map<string, Uint8Array>; // filename -> image data (optional)
  source: 'mineru';
  hasStructure: true;
}

export interface CacheEntry {
  itemID: number;
  mdContent: string;
  imageAttachments: number[]; // attachment item IDs
  timestamp: number;
}
