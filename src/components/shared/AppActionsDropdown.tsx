import { useState } from 'react';
import { MoreVertical, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { appEvents } from '@/lib/app-events';

interface AppActionsDropdownProps {
  appId: string;
  appTitle: string;
  onAppDeleted?: () => void;
  className?: string;
  variant?: 'default' | 'ghost';
  size?: 'default' | 'sm' | 'icon';
  showOnHover?: boolean;
}

export function AppActionsDropdown({
  appId,
  appTitle,
  onAppDeleted,
  className = '',
  variant = 'ghost',
  size = 'icon',
  showOnHover = false
}: AppActionsDropdownProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteApp = async () => {
    try {
      setIsDeleting(true);
      const response = await apiClient.deleteApp(appId);
      
      if (response.success) {
        toast.success('App deleted successfully');
        setIsDeleteDialogOpen(false);
        
        appEvents.emitAppDeleted(appId);
        onAppDeleted?.();
      }
    } catch (error) {
      console.error('Error deleting app:', error);
      toast.error('An unexpected error occurred while deleting the app');
    } finally {
      setIsDeleting(false);
    }
  };

  const buttonClasses = showOnHover 
    ? `opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-bg-3/80 cursor-pointer ${className}`
    : `hover:bg-bg-3/80 cursor-pointer ${className}`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            size={size}
            className={buttonClasses}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">App actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setIsDeleteDialogOpen(true);
            }}
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete app
          </DropdownMenuItem>
          {/* Future: Add Share option here */}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDeleteDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDeleteApp}
        isLoading={isDeleting}
        appTitle={appTitle}
      />
    </>
  );
}