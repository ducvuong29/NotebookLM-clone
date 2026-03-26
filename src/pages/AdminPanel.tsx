import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users,
  Settings,
  ArrowLeft,
  Shield,
  UserCheck,
  Clock,
  Newspaper,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminUsersCount } from '@/hooks/useAdminUsers';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import Logo from '@/components/ui/Logo';
import UserTable from '@/components/admin/UserTable';
import PublicNotebooksView from '@/components/admin/PublicNotebooksView';

// ============================================================================
// Sidebar Navigation
// ============================================================================

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

interface NavItemConfig extends NavItem {
  disabled?: boolean;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'users', label: 'Người dùng', icon: Users },
  { id: 'notebooks', label: 'Public Notebook', icon: Newspaper },
  { id: 'settings', label: 'Cài đặt', icon: Settings },
];

const AdminSidebar: React.FC<{
  activeSection: string;
  onSectionChange: (id: string) => void;
}> = React.memo(({ activeSection, onSectionChange }) => {
  const navigate = useNavigate();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-card border-r border-border/60 flex flex-col z-20">
      {/* Logo area */}
      <div className="px-5 py-4 border-b border-border/40">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 group transition-colors"
          aria-label="Quay về trang chính"
        >
          <Logo />
          <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            InsightsLM
          </span>
        </button>
      </div>

      {/* Admin badge */}
      <div className="px-5 py-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/8 border border-primary/15">
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-primary uppercase tracking-wider">
            Quản trị viên
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1" role="navigation" aria-label="Admin navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          const isDisabled = item.disabled;

          return (
            <button
              key={item.id}
              onClick={() => !isDisabled && onSectionChange(item.id)}
              disabled={isDisabled}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-200
                ${isDisabled
                  ? 'text-muted-foreground/40 cursor-not-allowed'
                  : isActive
                    ? 'bg-primary/10 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                }
              `}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
              {isDisabled && (
                <span className="ml-auto text-[10px] font-normal text-muted-foreground/30 uppercase">Sắp ra</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 py-4 border-t border-border/40 space-y-2">
        <div className="flex items-center justify-between px-3">
          <span className="text-xs text-muted-foreground">Giao diện</span>
          <ThemeToggle />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate('/')}
        >
          <ArrowLeft className="h-4 w-4" />
          Về trang chính
        </Button>
      </div>
    </aside>
  );
});

AdminSidebar.displayName = 'AdminSidebar';

// ============================================================================
// Stat Cards
// ============================================================================

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}

const StatCard: React.FC<StatCardProps> = React.memo(({ label, value, icon: Icon, color }) => (
  <div className="bg-card rounded-xl border border-border/50 p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
    <div className="flex items-center justify-between mb-3">
      <div className={`p-2.5 rounded-lg ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
    <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
    <p className="text-sm text-muted-foreground mt-1">{label}</p>
  </div>
));

StatCard.displayName = 'StatCard';

// ============================================================================
// Users Section
// ============================================================================

const UsersSection: React.FC = () => {
  const { data: counts, isLoading: isCountLoading } = useAdminUsersCount();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground font-heading">
          Quản lý người dùng
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Tìm kiếm, tạo và quản lý tài khoản nhân viên
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Tổng người dùng"
          value={isCountLoading ? '...' : (counts?.total ?? 0)}
          icon={Users}
          color="bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400"
        />
        <StatCard
          label="Quản trị viên"
          value={isCountLoading ? '...' : (counts?.admins ?? 0)}
          icon={UserCheck}
          color="bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
        />
        <StatCard
          label="Tổng Admin"
          value={isCountLoading ? '...' : (counts?.admins ?? 0)}
          icon={Clock}
          color="bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
        />
      </div>

      {/* Full-featured User Table (Story 3.3) */}
      <UserTable />
    </div>
  );
};

// ============================================================================
// Settings Placeholder
// ============================================================================

const SettingsSection: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-300">
    <div className="p-4 rounded-2xl bg-muted/40 mb-4">
      <Settings className="h-8 w-8 text-muted-foreground/50" />
    </div>
    <h2 className="text-lg font-medium text-foreground font-heading">Cài đặt hệ thống</h2>
    <p className="text-sm text-muted-foreground mt-2 max-w-sm">
      Tính năng đang được phát triển. Sẽ sớm hỗ trợ cấu hình SMTP, bảo mật, và thiết lập tổ chức.
    </p>
  </div>
);

// ============================================================================
// AdminPanel (Main Page)
// ============================================================================

const SECTION_COMPONENTS: Record<string, React.FC> = {
  users: UsersSection,
  notebooks: PublicNotebooksView,
  settings: SettingsSection,
};

const AdminPanel: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = searchParams.get('tab') ?? 'users';

  const handleSectionChange = React.useCallback(
    (id: string) => {
      setSearchParams({ tab: id }, { replace: true });
    },
    [setSearchParams]
  );

  const ActiveComponent = SECTION_COMPONENTS[activeSection] ?? UsersSection;

  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      />

      {/* Main content — offset by sidebar width */}
      <main
        id="main-content"
        className="ml-64 min-h-screen"
      >
        <div className="max-w-5xl mx-auto px-8 py-8">
          <ActiveComponent />
        </div>
      </main>
    </div>
  );
};

export default AdminPanel;
