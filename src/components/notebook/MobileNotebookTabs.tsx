
import React, { Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, MessageCircle, NotebookPen, Activity, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import SourcesSidebar from './SourcesSidebar';
import ChatArea from './ChatArea';
import StudioSidebar from './StudioSidebar';
import { Citation } from '@/types/message';

const ActivityPanel = React.lazy(() => import('./ActivityPanel'));

interface MobileNotebookTabsProps {
  hasSource: boolean;
  notebookId?: string;
  notebook?: {
    id: string;
    title: string;
    description?: string;
    generation_status?: string;
    icon?: string;
    example_questions?: string[];
  } | null;
  selectedCitation?: Citation | null;
  onCitationClose?: () => void;
  setSelectedCitation?: (citation: Citation | null) => void;
  onCitationClick?: (citation: Citation) => void;
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
  // Permission props forwarded from Notebook.tsx (H-4 fix)
  canEdit?: boolean;
  canDelete?: boolean;
  isMember?: boolean;
}

const MobileNotebookTabs = ({
  hasSource,
  notebookId,
  notebook,
  selectedCitation,
  onCitationClose,
  setSelectedCitation,
  onCitationClick,
  activeTab = 'chat',
  setActiveTab,
  canEdit,
  canDelete,
  isMember,
}: MobileNotebookTabsProps) => {
  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab?.(value)} className="flex-1 flex flex-col overflow-hidden">
      <TabsList className={cn("grid w-full bg-gray-100 p-1 h-12 rounded-none border-b border-gray-200", isMember ? "grid-cols-4" : "grid-cols-3")}>
        <TabsTrigger 
          value="sources" 
          className="flex items-center space-x-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
        >
          <FileText className="h-4 w-4" />
          <span className="hidden sm:inline">Nguồn</span>
        </TabsTrigger>
        <TabsTrigger 
          value="chat" 
          className="flex items-center space-x-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
        >
          <MessageCircle className="h-4 w-4" />
          <span className="hidden sm:inline">Trò chuyện</span>
        </TabsTrigger>
        <TabsTrigger 
          value="studio" 
          className="flex items-center space-x-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
        >
          <NotebookPen className="h-4 w-4" />
          <span className="hidden sm:inline">Studio</span>
        </TabsTrigger>
        {isMember && (
          <TabsTrigger 
            value="activity" 
            className="flex items-center space-x-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Nhật ký</span>
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="sources" className="flex-1 overflow-hidden mt-0">
        <SourcesSidebar 
          hasSource={hasSource}
          notebookId={notebookId}
          selectedCitation={selectedCitation}
          onCitationClose={onCitationClose}
          setSelectedCitation={setSelectedCitation}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </TabsContent>

      <TabsContent value="chat" className="flex-1 overflow-hidden mt-0">
        <ChatArea 
          hasSource={hasSource}
          notebookId={notebookId}
          notebook={notebook}
          onCitationClick={onCitationClick}
          selectedCitation={selectedCitation}
        />
      </TabsContent>

      <TabsContent value="studio" className="flex-1 overflow-hidden mt-0">
        <StudioSidebar 
          notebookId={notebookId}
          onCitationClick={onCitationClick}
          canEdit={canEdit}
          canDelete={canDelete}
          isMember={isMember}
        />
      </TabsContent>

      {isMember && (
        <TabsContent value="activity" className="flex-1 overflow-hidden mt-0 overflow-y-auto bg-background">
          <Suspense fallback={
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          }>
            <ActivityPanel notebookId={notebookId} />
          </Suspense>
        </TabsContent>
      )}
    </Tabs>
  );
};

export default MobileNotebookTabs;
