import React from "react";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import NotebookGrid from "@/components/dashboard/NotebookGrid";
import EmptyDashboard from "@/components/dashboard/EmptyDashboard";
import { useNotebooks } from "@/hooks/useNotebooks";
import { useAuth } from "@/contexts/AuthContext";

const Dashboard = () => {
  const { user, loading: authLoading, error: authError } = useAuth();
  const { notebooks, isLoading, error, isError } = useNotebooks();
  const hasNotebooks = notebooks && notebooks.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader userEmail={user?.email} />

      <main id="main-content" className="max-w-7xl mx-auto px-6 py-8 md:py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-medium text-foreground mb-2 font-heading tracking-tight md:text-5xl">
            Chào mừng đến InsightsLM
          </h1>
        </div>

        {authLoading || isLoading ? (
          <div className="text-center py-16 animate-in fade-in duration-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">{authLoading ? 'Đang khởi tạo...' : 'Đang tải notebooks...'}</p>
          </div>
        ) : authError || (isError && error) ? (
          <div className="text-center py-16 animate-in slide-in-from-bottom-4 fade-in">
            <p className="text-destructive mb-4">Lỗi: {authError || error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-all active:scale-95 shadow-sm"
            >
              Thử lại
            </button>
          </div>
        ) : (
          hasNotebooks ? <NotebookGrid /> : <EmptyDashboard />
        )}
      </main>
    </div>
  );
};

export default Dashboard;
