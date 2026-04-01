import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileType, CheckCircle2, AlertCircle, XCircle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useBulkImportUsers } from '@/hooks/useAdminUsers';

// Validation status for each row
type RowStatus = 'valid' | 'invalid_email' | 'duplicate_email';

interface ParsedRow {
  index: number;
  email: string;
  full_name: string;
  status: RowStatus;
  errorMessage?: string;
}

export default function BulkImportDialog() {
  const [open, setOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  
  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [uploadStats, setUploadStats] = useState<{ success: number; failed: number } | null>(null);

  const bulkImportMutation = useBulkImportUsers();

  const resetState = useCallback(() => {
    setParsedRows([]);
    setIsParsing(false);
    setIsUploading(false);
    setProgressValue(0);
    setUploadStats(null);
  }, []);

  const handleOpenChange = (newOpen: boolean) => {
    if (isUploading) return; // Prevent closing while uploading
    setOpen(newOpen);
    if (!newOpen) {
      setTimeout(resetState, 200);
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsParsing(true);
    setParsedRows([]);
    setUploadStats(null);

    // Dynamically import papaparse to optimize bundle size
    try {
      const Papa = (await import('papaparse')).default;

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows: ParsedRow[] = [];
          const emailSet = new Set<string>();

          results.data.forEach((row: any /* eslint-disable-line @typescript-eslint/no-explicit-any */, i: number) => {
            const email = (row.email ?? '').toString().trim();
            const full_name = (row.full_name ?? '').toString().trim();
            
            let status: RowStatus = 'valid';
            let errorMessage = '';

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!email || !emailRegex.test(email)) {
              status = 'invalid_email';
              errorMessage = 'Email không hợp lệ';
            } else if (emailSet.has(email.toLowerCase())) {
              status = 'duplicate_email';
              errorMessage = 'Trùng lặp trong file';
            }

            if (status === 'valid') {
              emailSet.add(email.toLowerCase());
            }

            rows.push({
              index: i + 1,
              email: email || '(Trống)',
              full_name,
              status,
              errorMessage,
            });
          });

          setParsedRows(rows);
          setIsParsing(false);
        },
        error: (error: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => {
          console.error('CSV Parse Error:', error);
          setIsParsing(false);
        }
      });
    } catch (err) {
      console.error('Failed to load PapaParse', err);
      setIsParsing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
    multiple: false,
  });

  const handleUpload = async () => {
    const validRows = parsedRows.filter(r => r.status === 'valid');
    if (validRows.length === 0) return;

    setIsUploading(true);
    setProgressValue(0);

    const BATCH_SIZE = 50; // To adhere to 25s Edge Function timeout
    let totalSuccess = 0;
    let totalFailed = parsedRows.filter(r => r.status !== 'valid').length; // Already failed due to parsing

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE).map(r => ({
        email: r.email,
        full_name: r.full_name,
      }));

      try {
        const result = await bulkImportMutation.mutateAsync({ users: batch });
        totalSuccess += result.success_count;
        totalFailed += result.failed_count;
      } catch (error) {
        // If entire batch fails (e.g. network error)
        totalFailed += batch.length;
        console.error('Batch error:', error);
      }

      setProgressValue(Math.round(((i + batch.length) / validRows.length) * 100));
    }

    setUploadStats({ success: totalSuccess, failed: totalFailed });
    setIsUploading(false);
  };

  const hasData = parsedRows.length > 0;
  const validCount = parsedRows.filter(r => r.status === 'valid').length;
  const invalidCount = parsedRows.length - validCount;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 text-xs">
          <UploadCloud className="h-4 w-4" />
          Nhập CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] gap-6 max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Tạo người dùng hàng loạt (CSV)</DialogTitle>
          <DialogDescription>
            Tải lên file định dạng CSV để tạo nhiều người dùng. Yêu cầu có 2 cột: <strong>email</strong>, <strong>full_name</strong>.
            Tối đa 500 dòng.
          </DialogDescription>
        </DialogHeader>

        {!hasData && !isParsing && (
          <div 
            {...getRootProps()} 
            className={`
              border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-colors
              ${isDragActive ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/50 hover:bg-muted/30'}
            `}
          >
            <input {...getInputProps()} />
            <div className="p-4 rounded-full bg-primary/10 mb-4 text-primary">
              <FileType className="h-8 w-8" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {isDragActive ? 'Thả file vào đây...' : 'Kéo thả file CSV vào đây, hoặc nhấn để chọn'}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              File dung lượng tối đa 5MB.
            </p>
          </div>
        )}

        {isParsing && (
          <div className="py-12 flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary opacity-80" />
            <p className="text-sm mt-4 text-muted-foreground">Đang phân tích file CSV...</p>
          </div>
        )}

        {hasData && !uploadStats && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm bg-muted/30 p-3 rounded-lg border border-border/50">
              <div className="flex items-center gap-1.5 text-foreground font-medium">
                <span className="font-bold">{parsedRows.length}</span> tổng
              </div>
              <div className="w-px h-4 bg-border/60" />
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>{validCount} hợp lệ</span>
              </div>
              <div className="w-px h-4 bg-border/60" />
              <div className="flex items-center gap-1.5 text-destructive/80">
                <AlertCircle className="h-4 w-4" />
                <span>{invalidCount} lỗi</span>
              </div>
            </div>

            <ScrollArea className="h-[250px] border border-border/40 rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b border-border/40 z-10">
                  <tr>
                    <th className="text-left font-semibold text-muted-foreground p-3 w-12 text-center">#</th>
                    <th className="text-left font-semibold text-muted-foreground p-3">Email</th>
                    <th className="text-left font-semibold text-muted-foreground p-3">Họ Tên</th>
                    <th className="text-left font-semibold text-muted-foreground p-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {parsedRows.map((row) => (
                    <tr key={row.index} className={row.status !== 'valid' ? 'bg-destructive/5 hover:bg-destructive/10' : 'hover:bg-muted/20'}>
                      <td className="p-3 text-center text-muted-foreground text-xs">{row.index}</td>
                      <td className="p-3 font-medium text-foreground truncate max-w-[200px]">{row.email}</td>
                      <td className="p-3 text-muted-foreground truncate max-w-[150px]">{row.full_name || '—'}</td>
                      <td className="p-3">
                        {row.status === 'valid' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-500/10 px-2 py-1 rounded">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Hợp lệ
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-destructive font-medium bg-destructive/10 px-2 py-1 rounded">
                            <XCircle className="h-3.5 w-3.5" /> {row.errorMessage}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>

            {isUploading && (
              <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex justify-between text-xs font-medium text-muted-foreground">
                  <span>Đang tải lên hệ thống...</span>
                  <span>{progressValue}%</span>
                </div>
                <Progress value={progressValue} className="h-2" />
              </div>
            )}
          </div>
        )}

        {uploadStats && (
          <div className="py-8 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-300">
            <div className="p-4 rounded-full bg-emerald-500/10 mb-5">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Hoàn tất nhập dữ liệu</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Đã xử lý xong <strong>{parsedRows.length}</strong> dòng dữ liệu từ file CSV. Các tài khoản hợp lệ đã được tạo thành công.
            </p>
            <div className="flex gap-4">
              <div className="bg-muted/40 border border-border/50 rounded-lg p-4 min-w-[120px]">
                <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{uploadStats.success}</p>
                <p className="text-xs text-muted-foreground mt-1 uppercase font-semibold">Thành công</p>
              </div>
              <div className="bg-muted/40 border border-border/50 rounded-lg p-4 min-w-[120px]">
                <p className={`text-3xl font-bold ${uploadStats.failed > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{uploadStats.failed}</p>
                <p className="text-xs text-muted-foreground mt-1 uppercase font-semibold">Lỗi/Bỏ qua</p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {!uploadStats ? (
            <>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isUploading}>
                Hủy
              </Button>
              <Button
                type="button" 
                onClick={handleUpload}
                disabled={!hasData || validCount === 0 || isUploading}
                className="gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang tạo...
                  </>
                ) : (
                  <>Xác nhận Import</>
                )}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={() => setOpen(false)} className="w-full sm:w-auto">
              Đóng và làm mới
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
