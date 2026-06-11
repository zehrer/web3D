export type UnitPreference = "metric-cm" | "metric-mm" | "imperial-in";

export type ObjectType = "sheet" | "timber" | "cladding" | "glass" | "rectangle" | "circle" | "cube";

export type SheetProfileId = "osb3-12" | "osb3-15" | "osb3-18" | "osb3-22" | "plywood-18";

export type TimberProfileId = "timber-56x56" | "timber-60x80" | "timber-80x100" | "timber-100x100" | "timber-120x120";

export type CladdingProfileId = "rhombus-18x68" | "rhombus-19x68" | "rhombus-19x95" | "rhombus-24x68" | "rhombus-27x68";

export type GlassProfileId = "plexiglass-3" | "plexiglass-5" | "plexiglass-10";

export type ShapeProfileId = "shape-rectangle" | "shape-circle" | "shape-cube";

export type ObjectProfileId = SheetProfileId | TimberProfileId | CladdingProfileId | GlassProfileId | ShapeProfileId;

export type ActiveTool = "move" | "rotate" | "resize" | "measure";

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export type AxisLocks = Partial<Record<keyof Vector3Like, boolean>>;

export interface SnapSettings {
  enabled: boolean;
  moveIncrement: number;
  resizeIncrement: number;
  rotateIncrementDeg: number;
}

export interface GridSettings {
  size: number;    // mm — total side length of the square grid
  originX: number; // mm — how far the world origin (0,0,0) is from the left edge
  originZ: number; // mm — how far the world origin (0,0,0) is from the front edge
}

export interface CutSettings {
  kerfMm: number;
}

export interface BuildStatusDefinition {
  id: string;
  label: string;
}

export interface CameraState {
  position: Vector3Like;
  target: Vector3Like;
}

export type ParametricFieldKey =
  | "size.x" | "size.y" | "size.z"
  | "position.x" | "position.y" | "position.z"
  | "rotation.x" | "rotation.y" | "rotation.z";

export type ParamBindingMap = Partial<Record<ParametricFieldKey, string>>;

export interface ProjectVariable {
  id: string;
  name: string;
  valueMm: number;
}

export interface PartNode {
  id: string;
  name: string;
  objectType: ObjectType;
  groupId: string | null;
  materialId: string | null;
  buildStatusId: string;
  buildOrder: number;
  size: Vector3Like;
  position: Vector3Like;
  rotation: Vector3Like;
  color: string;
  hidden?: boolean;

  /** Y-axis cross-section lock for timber/cladding (mm). Absent for unlocked types. */
  crossSectionWidthMm?: number;
  /** Z-axis cross-section lock for timber/cladding (mm). Absent for unlocked types. */
  crossSectionHeightMm?: number;
  /** Z-axis thickness lock for sheet/glass (mm). Absent for unlocked types. */
  thicknessMm?: number;
  /** Generic axis locks copied from the material at placement/change time. Locked axes keep their current size while resizing. */
  lockedAxes?: AxisLocks;
  /** Optional parametric expression bindings keyed by editable part field path. */
  paramBindings?: ParamBindingMap;
}

export interface MeasurementNode {
  id: string;
  name: string;
  groupId: string | null;
  start: Vector3Like;
  end: Vector3Like;
  color: string;
  hidden?: boolean;
}

export interface GroupNode {
  id: string;
  name: string;
  parentGroupId: string | null;
  hidden?: boolean;
}

export interface MaterialGroupNode {
  id: string;
  name: string;
  parentGroupId: string | null;
  sourceLibraryGroupId?: string;
}

export interface MaterialNode {
  id: string;
  name: string;
  groupId: string | null;
  objectType: ObjectType;
  color: string;
  /** Default size for new parts spawned from this material (mm, complete vector). */
  defaultSize: Vector3Like;

  /** Y-axis cross-section lock for timber/cladding (mm). Absent for unlocked types. */
  crossSectionWidthMm?: number;
  /** Z-axis cross-section lock for timber/cladding (mm). Absent for unlocked types. */
  crossSectionHeightMm?: number;
  /** Z-axis thickness lock for sheet/glass (mm). Absent for unlocked types. */
  thicknessMm?: number;
  /** Axes fixed for placed parts created from this material. Locked axes use defaultSize as their stock dimension. */
  lockedAxes?: AxisLocks;
  /** Present when this project material was copied from the global material library. */
  sourceLibraryMaterialId?: string;
}

export interface MaterialLibraryDocument {
  materialGroups: MaterialGroupNode[];
  materials: MaterialNode[];
}

export interface ProjectDocument {
  id: string;
  name: string;
  version: number;
  unitPreference: UnitPreference;
  snapSettings: SnapSettings;
  gridSettings: GridSettings;
  cutSettings: CutSettings;
  buildStatuses: BuildStatusDefinition[];
  cameraState: CameraState;
  variables: ProjectVariable[];
  groups: GroupNode[];
  parts: PartNode[];
  measurements: MeasurementNode[];
  materialGroups: MaterialGroupNode[];
  materials: MaterialNode[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  partCount: number;
}
