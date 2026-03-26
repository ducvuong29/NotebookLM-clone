import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import EmptyDashboard from '@/components/dashboard/EmptyDashboard';
import AuthForm from '@/components/auth/AuthForm';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mocks
vi.mock('@/hooks/useNotebooks', () => ({
  useNotebooks: () => ({
    createNotebook: vi.fn(),
    isCreating: false,
  })
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signUp: vi.fn(),
    resetPassword: vi.fn(),
  })
}));

const queryClient = new QueryClient();

const TestProvider = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      {children}
    </BrowserRouter>
  </QueryClientProvider>
);

describe('Vietnamese UI Localization (Story 1.3)', () => {
  describe('EmptyDashboard Component', () => {
    it('renders translated headings and descriptions', () => {
      render(
        <TestProvider>
          <EmptyDashboard />
        </TestProvider>
      );
      
      expect(screen.getByText('Tạo notebook đầu tiên')).toBeInTheDocument();
      expect(screen.getByText(/InsightsLM là trợ lý nghiên cứu/)).toBeInTheDocument();
      
      expect(screen.getByText('Tài liệu PDF')).toBeInTheDocument();
      expect(screen.getByText('Trang web')).toBeInTheDocument();
      expect(screen.getByText('Âm thanh')).toBeInTheDocument();
      
      expect(screen.getByRole('button', { name: /Tạo notebook/i })).toBeInTheDocument();
    });
  });

  describe('AuthForm Component', () => {
    it('renders translated auth labels and buttons', () => {
      render(
        <TestProvider>
          <AuthForm />
        </TestProvider>
      );
      
      // Default state is Login
      expect(screen.getByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Mật khẩu')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeInTheDocument();
      expect(screen.getByText('Chưa có tài khoản?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Đăng ký' })).toBeInTheDocument();
    });
  });
});
