import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Play, Pause, RotateCcw, Volume2, Download, MoreVertical, Trash2, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AudioPlayerProps {
  audioUrl: string;
  title?: string;
  notebookId?: string;
  expiresAt?: string | null;
  onError?: () => void;
  onDeleted?: () => void;
  onRetry?: () => void;
  onUrlRefresh?: (notebookId: string) => void;
}

const AudioPlayer = ({ 
  audioUrl, 
  title = "Cuộc trò chuyện chuyên sâu", 
  notebookId,
  expiresAt,
  onError,
  onDeleted,
  onRetry,
  onUrlRefresh
}: AudioPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [autoRetryInProgress, setAutoRetryInProgress] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { toast } = useToast();

  // Check if audio is expired
  const isExpired = expiresAt ? new Date(expiresAt) <= new Date() : false;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => {
      setDuration(audio.duration);
      setLoading(false);
      setAudioError(null);
      setRetryCount(0);
    };
    const handleEnded = () => setIsPlaying(false);
    const handleError = async (e: Event) => {
      console.error('Audio error:', e);
      setLoading(false);
      setIsPlaying(false);
      
      // If the URL has expired and we have a notebookId, try to refresh it automatically
      if ((isExpired || audioError?.includes('403') || audioError?.includes('expired')) && 
          notebookId && onUrlRefresh && retryCount < 2 && !autoRetryInProgress) {
        setAutoRetryInProgress(true);
        setRetryCount(prev => prev + 1);
        onUrlRefresh(notebookId);
        return;
      }

      if (retryCount < 2 && !autoRetryInProgress) {
        // Auto-retry up to 2 times for transient errors
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          audio.load();
        }, 1000 * (retryCount + 1)); // Exponential backoff
      } else {
        setAudioError('Không thể tải âm thanh');
        setAutoRetryInProgress(false);
        onError?.();
      }
    };

    const handleCanPlay = () => {
      setLoading(false);
      setAudioError(null);
      setRetryCount(0);
      setAutoRetryInProgress(false);
    };

    const handleLoadStart = () => {
      if (autoRetryInProgress) {
        setLoading(true);
      }
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [onError, isExpired, retryCount, notebookId, onUrlRefresh, audioError, autoRetryInProgress]);

  // Reload audio when URL changes (for automatic refresh)
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && autoRetryInProgress) {
      audio.load();
    }
  }, [audioUrl, autoRetryInProgress]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio || audioError) return;

    if (isPlaying) {
      audio.pause();
    } else {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error('Play failed:', error);
          setAudioError('Phát lại thất bại');
        });
      }
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio || audioError) return;

    const time = value[0];
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolumeChange = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;

    const vol = value[0];
    audio.volume = vol;
    setVolume(vol);
  };

  const restart = () => {
    const audio = audioRef.current;
    if (!audio || audioError) return;

    audio.currentTime = 0;
    setCurrentTime(0);
  };

  const retryLoad = () => {
    const audio = audioRef.current;
    if (!audio) return;

    setLoading(true);
    setAudioError(null);
    setRetryCount(0);
    setAutoRetryInProgress(false);
    audio.load();
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const downloadAudio = async () => {
    setIsDownloading(true);
    
    try {
      // Fetch the audio file
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch audio file');
      }
      
      // Create a blob from the response
      const blob = await response.blob();
      
      // Create a temporary URL for the blob
      const blobUrl = URL.createObjectURL(blob);
      
      // Create a temporary anchor element and trigger download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${title}.mp3`;
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      
      toast({
        title: "Bắt đầu tải xuống",
        description: "File âm thanh đang được tải xuống.",
      });
    } catch (error) {
      console.error('Download failed:', error);
      toast({
        title: "Tải xuống thất bại",
        description: "Không thể tải file âm thanh. Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const deleteAudio = async () => {
    if (!notebookId) {
      toast({
        title: "Lỗi",
        description: "Không thể xóa âm thanh - không tìm thấy notebook",
        variant: "destructive",
      });
      return;
    }

    setIsDeleting(true);
    
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // First, try to remove all files in the notebook folder from storage
      try {
        // List all files in the notebook folder
        const { data: files, error: listError } = await supabase.storage
          .from('audio')
          .list(notebookId);

        if (listError) {
          console.error('Error listing files:', listError);
        } else if (files && files.length > 0) {
          // Delete all files in the folder
          const filePaths = files.map(file => `${notebookId}/${file.name}`);
          
          const { error: deleteError } = await supabase.storage
            .from('audio')
            .remove(filePaths);

          if (deleteError) {
            console.error('Error deleting files from storage:', deleteError);
          }
        }
      } catch (storageError) {
        console.error('Storage operation failed:', storageError);
        // Continue with database update even if storage deletion fails
      }

      // Update the notebook to clear audio overview fields
      const { error } = await supabase
        .from('notebooks')
        .update({
          audio_overview_url: null,
          audio_url_expires_at: null,
          audio_overview_generation_status: null
        })
        .eq('id', notebookId);

      if (error) {
        console.error('Error updating notebook:', error);
        throw error;
      }

      toast({
        title: "Đã xóa âm thanh",
        description: "Tổng quan âm thanh và các file liên quan đã được xóa thành công.",
      });

      // Call the onDeleted callback to update parent component
      onDeleted?.();

    } catch (error) {
      console.error('Failed to delete audio:', error);
      toast({
        title: "Xóa thất bại",
        description: "Không thể xóa tổng quan âm thanh. Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h4 className="font-medium text-foreground">{title}</h4>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={isDeleting}>
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MoreVertical className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={downloadAudio} disabled={isDownloading}>
              {isDownloading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {isDownloading ? 'Đang tải...' : 'Tải xuống'}
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={deleteAudio}
              className="text-red-600 focus:text-red-600"
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Xóa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Auto-refresh indicator */}
      {autoRetryInProgress && (
        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-md border border-blue-200">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
            <span className="text-sm text-blue-600">Đang làm mới quyền truy cập âm thanh...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {audioError && !autoRetryInProgress && (
        <div className="flex items-center justify-between p-3 bg-red-50 rounded-md border border-red-200">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-sm text-red-600">{audioError}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry || retryLoad}
            className="text-red-600 border-red-300 hover:bg-red-50"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Thử lại
          </Button>
        </div>
      )}

      {/* Progress Bar */}
      <div className="space-y-2">
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={1}
          onValueChange={handleSeek}
          className="w-full"
          disabled={loading || !!audioError}
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={restart}
            disabled={loading || !!audioError}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          
          <Button
            variant="default"
            size="sm"
            onClick={togglePlayPause}
            disabled={loading || !!audioError}
            className="w-12"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Volume Control */}
        <div className="flex items-center space-x-2 w-24">
          <Volume2 className="h-4 w-4 text-gray-500" />
          <Slider
            value={[volume]}
            max={1}
            step={0.1}
            onValueChange={handleVolumeChange}
            className="flex-1"
          />
        </div>
      </div>
    </Card>
  );
};

export default AudioPlayer;
