
import React from 'react';
import { Button } from '@/components/ui/button';

interface CitationButtonProps {
  chunkIndex: number;
  onClick: () => void;
  isActive?: boolean;
  className?: string;
}

const CitationButton = ({ chunkIndex, onClick, isActive = false, className = '' }: CitationButtonProps) => {
  const displayNumber = chunkIndex + 1;

  const baseStyles = 'inline-flex items-center justify-center w-6 h-6 p-0 ml-1 text-xs font-medium rounded-full animate-[pulse_0.5s_ease-in-out_1]';

  const activeStyles = isActive
    ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
    : 'text-blue-600 border-blue-300 hover:bg-blue-50 hover:border-blue-400';

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      aria-label={`Trích dẫn ${displayNumber}`}
      className={`${baseStyles} ${activeStyles} ${className}`}
    >
      {displayNumber}
    </Button>
  );
};

export default CitationButton;
