import { useState } from 'react';
import { DotsThreeVertical, Trash } from '@phosphor-icons/react';
import { Button, DeleteResource, DropdownMenu } from '@cloudflare/kumo';
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
  const [deleteError, setDeleteError] = useState<string>();

  const handleDeleteApp = async () => {
    try {
      setIsDeleting(true);
      setDeleteError(undefined);
      const response = await apiClient.deleteApp(appId);

      if (response.success) {
        toast.success('App deleted successfully');
        setIsDeleteDialogOpen(false);

        appEvents.emitAppDeleted(appId);
        onAppDeleted?.();
      }
    } catch (error) {
      console.error('Error deleting app:', error);
      setDeleteError('An unexpected error occurred while deleting the app');
    } finally {
      setIsDeleting(false);
    }
  };

  const buttonClasses = showOnHover
    ? `opacity-0 transition-all duration-200 group-hover:opacity-100 ${className}`
    : className;

  const kumoSize = size === 'default' ? 'base' : 'sm';
  const kumoVariant = variant === 'default' ? 'secondary' : variant;

  return (
    <>
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={
          <Button
            variant={kumoVariant}
            size={kumoSize}
            shape="square"
            aria-label="App actions"
            className={buttonClasses}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            <DotsThreeVertical className="h-4 w-4" weight="bold" />
          </Button>
          }
        />
        <DropdownMenu.Content align="start">
          <DropdownMenu.Item
            icon={Trash}
            variant="danger"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setDeleteError(undefined);
              setIsDeleteDialogOpen(true);
            }}
          >
            Delete app
          </DropdownMenu.Item>

        </DropdownMenu.Content>
      </DropdownMenu>

      <DeleteResource
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        resourceType="App"
        resourceName={appTitle}
        onDelete={handleDeleteApp}
        isDeleting={isDeleting}
        errorMessage={deleteError}
        className="sm:w-[32rem]"
      />
    </>
  );
}
