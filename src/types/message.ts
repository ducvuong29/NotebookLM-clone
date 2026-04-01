
export interface MessageSegment {
  text: string;
  citation_id?: number;
}

export interface Citation {
  citation_id: number;
  source_id: string;
  source_title: string;
  source_type: string;
  chunk_lines_from?: number;
  chunk_lines_to?: number;
  chunk_index?: number;
  excerpt?: string;
}

export interface EnhancedChatMessage {
  id: number;
  session_id: string;
  message: {
    type: 'human' | 'ai';
    content: string | {
      segments: MessageSegment[];
      citations: Citation[];
    };
    additional_kwargs?: any /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    response_metadata?: any /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    tool_calls?: any /* eslint-disable-line @typescript-eslint/no-explicit-any */[];
    invalid_tool_calls?: any /* eslint-disable-line @typescript-eslint/no-explicit-any */[];
  };
}
