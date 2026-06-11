import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon({ children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export function PanelLeftIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9 4.5v15" />
    </BaseIcon>
  );
}

export function PanelRightIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M15 4.5v15" />
    </BaseIcon>
  );
}

export function SaveIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 4.5h11l3 3v12H5z" />
      <path d="M8 4.5v5h7v-5" />
      <path d="M8 19.5v-6h8v6" />
    </BaseIcon>
  );
}

export function ExportIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 4.5v10" />
      <path d="m8.5 11 3.5 3.5 3.5-3.5" />
      <path d="M5 16.5v3h14v-3" />
    </BaseIcon>
  );
}

export function PrintIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 8V4.5h10V8" />
      <path d="M7 17.5H5a2 2 0 0 1-2-2V11a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4.5a2 2 0 0 1-2 2h-2" />
      <path d="M7 14h10v5.5H7z" />
      <path d="M17.5 11.5h.01" />
    </BaseIcon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </BaseIcon>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 6h16l-6.2 7.1V19l-3.6 1.8v-7.7L4 6Z" />
    </BaseIcon>
  );
}

export function MoveIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="m12 3 2.5 2.5M12 3 9.5 5.5M12 21l2.5-2.5M12 21l-2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
    </BaseIcon>
  );
}

export function RotateIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M16 8a6 6 0 1 0 1.2 6.6" />
      <path d="M16 4.5v4h4" />
    </BaseIcon>
  );
}

export function ResizeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <path d="M9 9h6v6" />
      <path d="m15 9-6 6" />
    </BaseIcon>
  );
}

export function RulerIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 17 17 4l3 3L7 20z" />
      <path d="m14 7 1.5 1.5" />
      <path d="m11 10 1.5 1.5" />
      <path d="m8 13 1.5 1.5" />
    </BaseIcon>
  );
}

export function DuplicateIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <rect x="5" y="5" width="10" height="10" rx="2" />
    </BaseIcon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 12h8l1-12" />
      <path d="M10 11v5M14 11v5" />
    </BaseIcon>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M9 8H5V4" />
      <path d="M5 8a8 8 0 1 1 2 10.6" />
    </BaseIcon>
  );
}

export function RedoIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M15 8h4V4" />
      <path d="M19 8a8 8 0 1 0-2 10.6" />
    </BaseIcon>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 5.5v13l10-6.5z" />
    </BaseIcon>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 5.5v13" />
      <path d="M16 5.5v13" />
    </BaseIcon>
  );
}

export function BuildSequenceIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 18.5h14" />
      <path d="M7 15.5h3v3H7z" />
      <path d="M10.5 11.5h3v7h-3z" />
      <path d="M14 7.5h3v11h-3z" />
      <path d="M6 6h4" />
      <path d="M8 4v4" />
    </BaseIcon>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.8 9.4a2.5 2.5 0 1 1 4.4 1.6c-.8.8-1.7 1.3-1.7 2.6" />
      <circle cx="12" cy="16.8" r="0.6" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m15 15 4 4" />
    </BaseIcon>
  );
}

export function CubeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m12 3 7 4-7 4-7-4 7-4Z" />
      <path d="m5 7 7 4 7-4" />
      <path d="M5 7v8l7 4 7-4V7" />
      <path d="M12 11v8" />
    </BaseIcon>
  );
}

export function SheetIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4.5" y="6.5" width="15" height="11" rx="2" />
      <path d="M7 9h10M7 12h10M7 15h10" />
    </BaseIcon>
  );
}

export function BeamIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 9.5 9 6h10v8l-4 3.5H5z" />
      <path d="M9 6v8M15 9.5v8" />
      <path d="M5 9.5h10" />
    </BaseIcon>
  );
}

export function CladdingIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 8h12l2 3H7z" />
      <path d="M5 13h12l2 3H7z" />
      <path d="M7 11v2M17 11v2" />
    </BaseIcon>
  );
}

export function GlassIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="5" y="4" width="14" height="16" />
      <path d="M8 17 16 7" />
      <path d="M8 11 12 7" />
      <path d="M12 17 16 13" />
    </BaseIcon>
  );
}

export function ShapeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4.5" y="5" width="7" height="7" />
      <circle cx="16" cy="15.5" r="4" />
    </BaseIcon>
  );
}

export function RectangleIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="7" width="16" height="10" />
    </BaseIcon>
  );
}

export function CircleIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="7" />
    </BaseIcon>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 7h6l2 2h8v8.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M4 7V5.5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2V9" />
    </BaseIcon>
  );
}

export function CollapseFoldersIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 7h6l2 2h8v8.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M4 7V5.5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2V9" />
      <path d="m9 13 3 3 3-3" />
    </BaseIcon>
  );
}

export function ExpandFoldersIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 7h6l2 2h8v8.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M4 7V5.5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2V9" />
      <path d="m9 16 3-3 3 3" />
    </BaseIcon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 4.5v2.2M12 17.3v2.2M19.5 12h-2.2M6.7 12H4.5M17.3 6.7l-1.6 1.6M8.3 15.7l-1.6 1.6M17.3 17.3l-1.6-1.6M8.3 8.3 6.7 6.7" />
    </BaseIcon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m14.5 6-6 6 6 6" />
    </BaseIcon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m9.5 6 6 6-6 6" />
    </BaseIcon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m6 9.5 6 6 6-6" />
    </BaseIcon>
  );
}

export function PerspectiveIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m6 7 6-3 6 3-6 3-6-3Z" />
      <path d="m6 7 0 7 6 3 6-3V7" />
      <path d="M12 10v7" />
    </BaseIcon>
  );
}

export function TopViewIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <path d="M9 9h6v6H9z" />
    </BaseIcon>
  );
}

export function ArIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
      <path d="m12 8 3.5 2v4L12 16l-3.5-2v-4L12 8Z" />
      <path d="M12 8v4M15.5 10 12 12l-3.5-2" />
    </BaseIcon>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </BaseIcon>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-6.5 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="m2 2 20 20" />
    </BaseIcon>
  );
}
