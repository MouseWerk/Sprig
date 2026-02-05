import * as Icons from 'lucide-react';

const ICON_NAMES = [
  'Book', 'FileText', 'Bookmark', 'GraduationCap', 'Library',
  'Languages', 'Code', 'Atom', 'FlaskConical', 'Dna',
  'Calculator', 'Globe', 'History', 'Music', 'Image',
  'Gamepad2', 'Brain', 'Lightbulb', 'Star', 'Heart'
] as const;

interface IconPickerProps {
  selectedIcon: string;
  onSelect: (name: string) => void;
}

export function IconPicker({ selectedIcon, onSelect }: IconPickerProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {ICON_NAMES.map((name) => {
        const IconComponent = (Icons as any)[name];
        const isSelected = selectedIcon === name;

        return (
          <button
            key={name}
            type="button"
            onClick={() => onSelect(name)}
            className={`p-3 rounded-lg transition-colors ${
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:bg-accent'
            }`}
          >
            <IconComponent size={20} />
          </button>
        );
      })}
    </div>
  );
}
