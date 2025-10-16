import { Moon } from 'lucide-react';
import { Button } from './ui/button';

export function ThemeToggle() {
  return (
    <Button variant="ghost" size="icon" className="h-8 w-8 text-text-primary cursor-default">
      <Moon className="h-[1.2rem] w-[1.2rem]" />
      <span className="sr-only">Dark theme active</span>
    </Button>
  );
}