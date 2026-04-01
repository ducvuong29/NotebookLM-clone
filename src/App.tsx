import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import AdminGuard from "@/components/auth/AdminGuard";
import { lazy, Suspense } from "react";

// Auth is eager-loaded — users see it first, no cold-start delay acceptable.
import Auth from "./pages/Auth";

// [perf] Lazy-load all other routes — reduces initial bundle by ~65KB+ of JS that
// Dashboard users never need. Each route gets its own chunk, loaded on navigation.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Notebook = lazy(() => import("./pages/Notebook"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Minimal spinner shown during route chunk download (usually < 200ms on good connection)
const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const queryClient = new QueryClient();

const AppContent = () => {
  return (
    <>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:ring-2 focus:ring-primary focus:rounded-md shadow-md">
        Chuyển đến nội dung chính
      </a>
      {/* [perf] Suspense boundary for lazy route chunks */}
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route 
          path="/" 
          element={
            <ProtectedRoute fallback={<Auth />}>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/notebook" 
          element={
            <ProtectedRoute fallback={<Auth />}>
              <Notebook />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/notebook/:id" 
          element={
            <ProtectedRoute fallback={<Auth />}>
              <Notebook />
            </ProtectedRoute>
          } 
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute fallback={<Auth />}>
              <AdminGuard>
                <AdminPanel />
              </AdminGuard>
            </ProtectedRoute>
          }
        />
        <Route path="/auth" element={<Auth />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
