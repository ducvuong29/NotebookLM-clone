
import React, { useEffect, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Citation } from '@/types/message';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface SourceContentViewerProps {
  citation: Citation | null;
  sourceContent?: string;
  sourceSummary?: string;
  sourceUrl?: string;
  className?: string;
  isOpenedFromSourceList?: boolean;
}

const SourceContentViewer = ({ 
  citation, 
  sourceContent, 
  sourceSummary,
  sourceUrl,
  className = '',
  isOpenedFromSourceList = false
}: SourceContentViewerProps) => {
  const highlightedContentRef = useRef<HTMLDivElement>(null);
  const scrollAreaViewportRef = useRef<HTMLDivElement>(null);
  
  /** Accordion defaults open when browsing the source list, closed when jumping from a citation */
  const [accordionValue, setAccordionValue] = useState<string>(
    isOpenedFromSourceList ? "guide" : ""
  );

  const hasValidCitationLines = citation && 
    typeof citation.chunk_lines_from === 'number' && 
    typeof citation.chunk_lines_to === 'number' &&
    citation.chunk_lines_from > 0;

  // ── Auto-scroll to the highlighted passage ──────────────────────────
  useEffect(() => {
    if (!hasValidCitationLines) return;

    // Use requestAnimationFrame to wait for the DOM paint, then scroll
    const frameId = requestAnimationFrame(() => {
      highlightedContentRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });

    return () => cancelAnimationFrame(frameId);
  }, [citation?.citation_id, citation?.chunk_lines_from, citation?.chunk_lines_to, citation?.source_id, hasValidCitationLines]);

  // ── Collapse the guide accordion when a real citation is clicked ────
  useEffect(() => {
    if (hasValidCitationLines) {
      setAccordionValue("");
    }
  }, [hasValidCitationLines]);

  // ── Empty state ─────────────────────────────────────────────────────
  if (!citation || !sourceContent) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p className="text-sm">Nhấn vào trích dẫn để xem nội dung nguồn</p>
      </div>
    );
  }

  // ── Source type icon helper ─────────────────────────────────────────
  const getSourceIcon = (type: string) => {
    const iconMap: Record<string, string> = {
      'pdf': '/file-types/PDF.svg',
      'text': '/file-types/TXT.png',
      'website': '/file-types/WEB.svg',
      'youtube': '/file-types/MP3.png',
      'audio': '/file-types/MP3.png',
      'doc': '/file-types/DOC.png',
      'multiple-websites': '/file-types/WEB.svg',
      'copied-text': '/file-types/TXT.png'
    };

    const iconUrl = iconMap[type] || iconMap['text'];
    
    return (
      <img 
        src={iconUrl} 
        alt={`${type} icon`} 
        className="w-full h-full object-contain"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          if (target.parentElement) target.parentElement.innerHTML = '📄';
        }}
      />
    );
  };

  // ── Highlight range logic ──────────────────────────────────────────
  const lines = sourceContent.split('\n');

  const startLine = hasValidCitationLines ? citation.chunk_lines_from! : -1;
  const endLine   = hasValidCitationLines ? citation.chunk_lines_to!   : -1;

  const renderHighlightedContent = () => {
    return lines.map((line, index) => {
      const lineNumber = index + 1;
      const isHighlighted = startLine > 0 && lineNumber >= startLine && lineNumber <= endLine;
      const isFirstHighlightedLine = isHighlighted && lineNumber === startLine;
      
      return (
        <div
          key={`${citation?.citation_id}-${index}`}
          ref={isFirstHighlightedLine ? highlightedContentRef : null}
          className={`py-2 px-3 rounded leading-relaxed transition-colors duration-500 ${
            isHighlighted 
              ? 'border-l-4 border-purple-600 bg-purple-100 dark:bg-purple-900/40 dark:border-purple-400 text-foreground' 
              : 'hover:bg-muted'
          }`}
        >
          <span className={isHighlighted ? 'font-medium text-foreground' : 'text-foreground'}>{line}</span>
        </div>
      );
    });
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col h-full overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center space-x-2 mb-2">
          <div className="w-6 h-6 bg-background rounded border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
            {getSourceIcon(citation.source_type)}
          </div>
          <span className="font-medium text-foreground truncate">{citation.source_title}</span>
        </div>
      </div>

      {/* Source Guide Accordion */}
      {sourceSummary && (
        <div className="border-b border-border flex-shrink-0">
          <Accordion type="single" value={accordionValue} onValueChange={setAccordionValue} collapsible>
            <AccordionItem value="guide" className="border-0">
              <AccordionTrigger 
                className="px-4 py-3 text-sm font-medium hover:no-underline hover:bg-muted text-blue-900 dark:text-blue-400" 
              >
                <div className="flex items-center space-x-2">
                  <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor">
                    <path d="M166.67-120.67 120-167.33l317.67-318L254-531l194-121-16.33-228 175 147L818-818.33l-85.67 211.66L880-432l-228.67-16.67-120.66 194L485-438.33 166.67-120.67Zm24.66-536L120-728l72-72 71.33 71.33-72 72Zm366.34 233 58-94.33 111 8.33-72-85 41.66-102.66-102.66 41.66-85-71.66L517-616.67l-94.33 59 108 26.67 27 107.33Zm171 303.67-71.34-72 71.34-71.33 71.33 72L728.67-120ZM575-576Z"/>
                  </svg>
                  <span>Hướng dẫn nguồn</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="text-sm text-foreground/80 space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Tóm tắt</h4>
                    <p className="leading-relaxed">{sourceSummary}</p>
                  </div>
                  
                  {/* Show URL for website sources */}
                  {citation.source_type === 'website' && sourceUrl && (
                    <div>
                      <h4 className="font-medium mb-2">Đường dẫn</h4>
                      <a 
                        href={sourceUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline break-all text-sm"
                      >
                        {sourceUrl}
                      </a>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}

      {/* Content */}
      <ScrollArea className="flex-1 h-full" ref={scrollAreaViewportRef}>
        <div className="p-4">
          <div className="prose prose-gray max-w-none space-y-1">
            {renderHighlightedContent()}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default SourceContentViewer;
