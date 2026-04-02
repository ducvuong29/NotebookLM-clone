
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useNotebooks } from '@/hooks/useNotebooks';
import { useSources } from '@/hooks/useSources';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useNotebookPermissions } from '@/hooks/useNotebookPermissions';
import NotebookHeader from '@/components/notebook/NotebookHeader';
import SourcesSidebar from '@/components/notebook/SourcesSidebar';
import ChatArea from '@/components/notebook/ChatArea';
import StudioSidebar from '@/components/notebook/StudioSidebar';
import MobileNotebookTabs from '@/components/notebook/MobileNotebookTabs';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Citation } from '@/types/message';

const Notebook = () => {
  const { id: notebookId } = useParams();
  const { notebooks } = useNotebooks();
  const { sources } = useSources(notebookId);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [activeTab, setActiveTab] = useState<string>('chat');
  const isDesktop = useIsDesktop();

  const notebook = notebooks?.find(n => n.id === notebookId);
  const hasSource = sources && sources.length > 0;
  const isSourceDocumentOpen = !!selectedCitation;

  // C-2 + H-3 fix: Centralize permission derivation — call once, pass down as props
  // This avoids 3 separate useNotebookPermissions calls in child components
  // TanStack Query dedup handles the underlying useNotebookMembers call, 
  // but centralizing avoids extra subscription overhead
  const {
    role,
    canEdit,
    canDelete,
    canInvite,
    canChat,
    isMember,
    isOwner,
    isLoading: permissionsLoading,
  } = useNotebookPermissions(notebookId, notebook?.user_id, notebook?.visibility);

  const handleCitationClick = (citation: Citation) => {
    setSelectedCitation(citation);
    // On mobile, auto-switch to Sources tab so the user sees the source content
    if (!isDesktop) {
      setActiveTab('sources');
    }
  };

  const handleCitationClose = () => {
    setSelectedCitation(null);
  };

  // Dynamic width calculations for desktop - expand studio when editing notes
  const sourcesWidth = isSourceDocumentOpen ? 'w-[35%]' : 'w-[25%]';
  const studioWidth = 'w-[30%]'; // Expanded width for note editing
  const chatWidth = isSourceDocumentOpen ? 'w-[35%]' : 'w-[45%]';

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <NotebookHeader 
        title={notebook?.title || 'Notebook chưa đặt tên'} 
        notebookId={notebookId} 
        notebookOwnerId={notebook?.user_id}
        role={role}
        canEdit={canEdit}
        canInvite={canInvite}
        isMember={isMember}
      />
      
      {isDesktop ? (
        // Desktop layout (3-column)
        <main id="main-content" className="flex-1 flex overflow-hidden">
          <div className={`${sourcesWidth} flex-shrink-0`}>
            <SourcesSidebar 
              hasSource={hasSource || false} 
              notebookId={notebookId}
              selectedCitation={selectedCitation}
              onCitationClose={handleCitationClose}
              setSelectedCitation={setSelectedCitation}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          </div>
          
          <div className={`${chatWidth} flex-shrink-0`}>
            <ErrorBoundary key={notebookId}>
              <ChatArea 
                hasSource={hasSource || false} 
                notebookId={notebookId}
                notebook={notebook}
                onCitationClick={handleCitationClick}
                selectedCitation={selectedCitation}
              />
            </ErrorBoundary>
          </div>
          
          <div className={`${studioWidth} flex-shrink-0`}>
            <StudioSidebar 
              notebookId={notebookId} 
              onCitationClick={handleCitationClick}
              canEdit={canEdit}
              canDelete={canDelete}
              isMember={isMember}
            />
          </div>
        </main>
      ) : (
        // Mobile/Tablet layout (tabs)
        <main id="main-content" className="flex-1 overflow-hidden h-full">
          <ErrorBoundary key={notebookId}>
            <MobileNotebookTabs
            hasSource={hasSource || false}
            notebookId={notebookId}
            notebook={notebook}
            selectedCitation={selectedCitation}
            onCitationClose={handleCitationClose}
            setSelectedCitation={setSelectedCitation}
            onCitationClick={handleCitationClick}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            canEdit={canEdit}
            canDelete={canDelete}
            isMember={isMember}
          />
          </ErrorBoundary>
        </main>
      )}
    </div>
  );
};

export default Notebook;
