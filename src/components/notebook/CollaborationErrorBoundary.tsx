import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

interface Props {
  children?: ReactNode;
  className?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class CollaborationErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Collaboration component error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <Card className={`p-3 bg-muted/50 border-border flex flex-col items-center justify-center text-center space-y-2 ${this.props.className || ''}`}>
          <AlertCircle className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">
            Không thể tải tính năng cộng tác
          </p>
          <Button variant="outline" size="sm" onClick={this.handleRetry} className="h-8 text-xs">
            Thử lại
          </Button>
        </Card>
      );
    }

    return this.props.children;
  }
}

export default CollaborationErrorBoundary;
