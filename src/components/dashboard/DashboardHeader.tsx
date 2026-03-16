
import React from 'react';
import { Button } from '@/components/ui/button';
import { User, LogOut } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useLogout } from '@/services/authService';
import Logo from '@/components/ui/Logo';

interface DashboardHeaderProps {
  userEmail?: string;
}

const DashboardHeader = ({ userEmail }: DashboardHeaderProps) => {
  const { logout } = useLogout();

  return (
    <header className="bg-white px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Logo />
          <h1 className="text-xl font-medium text-gray-900">InsightsLM</h1>
        </div>
        
        <div className="flex items-center space-x-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="p-0">
                <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-purple-600 transition-colors">
                  <User className="h-4 w-4 text-white" />
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={logout} className="cursor-pointer">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
