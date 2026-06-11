import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { applyMaterialToPart, legacyLockFieldsFromSize } from "../lib/partMaterial";
import { applyProjectParamBindings } from "../lib/parametrics";
import { DEFAULT_BUILD_STATUS_ID, DEFAULT_BUILD_STATUSES, cloneProject, createInitialMaterials, createMeasurementNode, createObjectPart, createProject, touchProject } from "../lib/project";
import { applyLockToSize, createSizeFromProfile, extractLockFields, getDefaultProfileId, getObjectTypeLabel, getProfileById } from "../lib/profiles";
import { clampLength } from "../lib/units";
import type {
  ActiveTool,
  BuildStatusDefinition,
  CameraState,
  CutSettings,
  GridSettings,
  GroupNode,
  MaterialGroupNode,
  MaterialLibraryDocument,
  MaterialNode,
  MeasurementNode,
  ObjectProfileId,
  ObjectType,
  ParametricFieldKey,
  PartNode,
  ProjectDocument,
  ProjectSummary,
  ProjectVariable,
  SnapSettings,
  UnitPreference,
  Vector3Like,
} from "../types/model";

type HistoryState = {
  undoStack: ProjectDocument[];
  redoStack: ProjectDocument[];
};

type PatternOptions = {
  axis: keyof Vector3Like;
  copies: number;
  gap: number;
};

export interface EditorState extends HistoryState {
  hydrated: boolean;
  project: ProjectDocument;
  globalMaterialLibrary: MaterialLibraryDocument;
  recentProjects: ProjectSummary[];
  selectedPartId: string | null;
  selectedMeasurementId: string | null;
  selectedMaterialId: string | null;
  selectedMaterialSource: "project" | "global";
  activeTool: ActiveTool;
  buildPreviewEnabled: boolean;
  buildPreviewStep: number;
}

export interface EditorActions {
  hydrateProject: (project: ProjectDocument) => void;
  hydrateGlobalMaterialLibrary: (library: MaterialLibraryDocument) => void;
  setHydrated: (value: boolean) => void;
  setRecentProjects: (projects: ProjectSummary[]) => void;
  createNewProject: () => void;
  selectPart: (partId: string | null) => void;
  selectMeasurement: (measurementId: string | null) => void;
  selectMaterial: (materialId: string | null, source?: "project" | "global") => void;
  addMaterialGroup: (parentGroupId?: string | null) => void;
  renameMaterialGroup: (groupId: string, name: string) => void;
  renameMaterial: (materialId: string, name: string) => void;
  setActiveTool: (tool: ActiveTool) => void;
  renameProject: (name: string) => void;
  updateUnitPreference: (unitPreference: UnitPreference) => void;
  updateSnapSettings: (partial: Partial<SnapSettings>) => void;
  updateGridSettings: (partial: Partial<GridSettings>) => void;
  updateCutSettings: (partial: Partial<CutSettings>) => void;
  addBuildStatus: () => void;
  updateBuildStatus: (statusId: string, patch: Partial<Pick<BuildStatusDefinition, "label">>) => void;
  deleteBuildStatus: (statusId: string) => void;
  setPartBuildStatus: (partId: string, statusId: string) => void;
  setPartBuildOrder: (partId: string, buildOrder: number) => void;
  reorderPartsBuildOrder: (partIds: string[], targetPartId: string) => void;
  setBuildPreviewEnabled: (enabled: boolean) => void;
  setBuildPreviewStep: (step: number) => void;
  addProjectVariable: () => void;
  updateProjectVariable: (variableId: string, patch: Partial<Pick<ProjectVariable, "name" | "valueMm">>) => void;
  deleteProjectVariable: (variableId: string) => void;
  setPartParamBinding: (partId: string, field: ParametricFieldKey, expression: string | null) => void;
  addObject: (objectType: ObjectType, profileId?: ObjectProfileId) => void;
  addMeasurement: (start: Vector3Like, end: Vector3Like) => void;
  addGroup: (parentGroupId?: string | null) => void;
  updateGroupName: (groupId: string, name: string) => void;
  deleteGroup: (groupId: string) => void;
  movePartToGroup: (partId: string, groupId: string | null) => void;
  moveMeasurementToGroup: (measurementId: string, groupId: string | null) => void;
  moveGroupToGroup: (groupId: string, parentGroupId: string | null) => void;
  duplicateSelectedPart: () => void;
  createCladdingPattern: (partId: string, options: PatternOptions) => void;
  deleteSelectedPart: () => void;
  deleteSelectedMeasurement: () => void;
  updatePart: (partId: string, updater: (part: PartNode) => PartNode) => void;
  updateMeasurement: (measurementId: string, updater: (measurement: MeasurementNode) => MeasurementNode) => void;
  togglePartVisibility: (partId: string) => void;
  toggleGroupVisibility: (groupId: string) => void;
  toggleMeasurementVisibility: (measurementId: string) => void;
  addObjectFromMaterial: (materialId: string) => void;
  addObjectFromGlobalMaterial: (materialId: string) => void;
  deleteMaterial: (materialId: string) => void;
  duplicateMaterial: (materialId: string) => void;
  updateMaterialColor: (materialId: string, color: string) => void;
  updateMaterialDefaultSize: (materialId: string, axis: keyof Vector3Like, valueMm: number) => void;
  updateMaterialAxisLock: (materialId: string, axis: keyof Vector3Like, locked: boolean) => void;
  renameGlobalMaterialGroup: (groupId: string, name: string) => void;
  renameGlobalMaterial: (materialId: string, name: string) => void;
  updateGlobalMaterialColor: (materialId: string, color: string) => void;
  updateGlobalMaterialDefaultSize: (materialId: string, axis: keyof Vector3Like, valueMm: number) => void;
  updateGlobalMaterialAxisLock: (materialId: string, axis: keyof Vector3Like, locked: boolean) => void;
  addGlobalMaterialGroup: (parentGroupId?: string | null) => void;
  deleteGlobalMaterialGroup: (groupId: string) => void;
  createGlobalMaterial: (objectType: ObjectType) => void;
  createGlobalMaterialFromPart: (partId: string) => void;
  duplicateGlobalMaterial: (materialId: string) => void;
  deleteGlobalMaterial: (materialId: string) => void;
  deleteMaterialGroup: (groupId: string) => void;
  setPartGeometry: (partId: string, geometry: Partial<Pick<PartNode, "size" | "position" | "rotation">>) => void;
  previewPartGeometry: (partId: string, geometry: Partial<Pick<PartNode, "size" | "position" | "rotation">>) => void;
  setPartMaterial: (partId: string, materialId: string) => void;
  setPartsMaterial: (partIds: string[], materialId: string) => void;
  commitCameraState: (cameraState: CameraState) => void;
  finalizeTransientChange: (previousProject: ProjectDocument) => void;
  undo: () => void;
  redo: () => void;
}

export type EditorStore = ReturnType<typeof createEditorStore>;

const MAX_HISTORY = 50;
const DUPLICATE_OFFSET_MM = 10;

function createEmptyMaterialLibrary(): MaterialLibraryDocument {
  const { materialGroups, materials } = createInitialMaterials();
  return { materialGroups, materials };
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneHistoryProject(project: ProjectDocument): ProjectDocument {
  return cloneProject(project);
}

function withProjectHistory(
  current: EditorState,
  updater: (project: ProjectDocument) => ProjectDocument,
): Pick<EditorState, "project" | "undoStack" | "redoStack"> {
  const previousProject = cloneHistoryProject(current.project);
  const nextProject = touchProject(updater(cloneProject(current.project)));

  return {
    project: nextProject,
    undoStack: [...current.undoStack.slice(-(MAX_HISTORY - 1)), previousProject],
    redoStack: [],
  };
}

function replacePart(parts: PartNode[], partId: string, updater: (part: PartNode) => PartNode): PartNode[] {
  return parts.map((part) => (part.id === partId ? updater(part) : part));
}

function getNextBuildOrder(parts: PartNode[]): number {
  return parts.reduce((max, part) => Math.max(max, Number.isFinite(part.buildOrder) ? part.buildOrder : 0), 0) + 1;
}

function normalizeBuildOrder(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.round(value));
}

function normalizeBuildPreviewStep(value: number, maxStep: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(maxStep, Math.round(value)));
}

function sortPartsByBuildOrder(parts: PartNode[]): PartNode[] {
  return [...parts].sort((left, right) => left.buildOrder - right.buildOrder || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

function replaceGroup(groups: GroupNode[], groupId: string, updater: (group: GroupNode) => GroupNode): GroupNode[] {
  return groups.map((group) => (group.id === groupId ? updater(group) : group));
}

function replaceMeasurement(
  measurements: MeasurementNode[],
  measurementId: string,
  updater: (measurement: MeasurementNode) => MeasurementNode,
): MeasurementNode[] {
  return measurements.map((measurement) => (measurement.id === measurementId ? updater(measurement) : measurement));
}

function isDescendantGroup(groups: GroupNode[], candidateGroupId: string, parentGroupId: string): boolean {
  let current = groups.find((group) => group.id === candidateGroupId);

  while (current) {
    if (current.parentGroupId === parentGroupId) {
      return true;
    }

    current = current.parentGroupId ? groups.find((group) => group.id === current?.parentGroupId) : undefined;
  }

  return false;
}

function isMaterialUsed(project: ProjectDocument, materialId: string): boolean {
  return project.parts.some((part) => part.materialId === materialId);
}

function normalizeVariableName(name: string, fallback: string): string {
  const normalized = name.trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "");
  if (!normalized) return fallback;
  return /^[A-Za-z_]/.test(normalized) ? normalized : `v_${normalized}`;
}

function expressionReferencesVariable(expression: string, variableName: string): boolean {
  return new RegExp(`\\b${variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(expression);
}

function getLocalAxisVector(axis: keyof Vector3Like): Vector3Like {
  return {
    x: axis === "x" ? 1 : 0,
    y: axis === "y" ? 1 : 0,
    z: axis === "z" ? 1 : 0,
  };
}

function rotateVectorByEuler(vector: Vector3Like, rotation: Vector3Like): Vector3Like {
  const cosX = Math.cos(rotation.x);
  const sinX = Math.sin(rotation.x);
  const cosY = Math.cos(rotation.y);
  const sinY = Math.sin(rotation.y);
  const cosZ = Math.cos(rotation.z);
  const sinZ = Math.sin(rotation.z);

  const afterX = {
    x: vector.x,
    y: vector.y * cosX - vector.z * sinX,
    z: vector.y * sinX + vector.z * cosX,
  };
  const afterY = {
    x: afterX.x * cosY + afterX.z * sinY,
    y: afterX.y,
    z: -afterX.x * sinY + afterX.z * cosY,
  };

  return {
    x: afterY.x * cosZ - afterY.y * sinZ,
    y: afterY.x * sinZ + afterY.y * cosZ,
    z: afterY.z,
  };
}

function clampPatternCopies(copies: number): number {
  if (!Number.isFinite(copies)) {
    return 1;
  }

  return Math.max(1, Math.min(200, Math.round(copies)));
}

function getPatternProfileStep(part: PartNode, axis: keyof Vector3Like): number {
  return Math.abs(part.size[axis]);
}

function normalizePartSize(part: PartNode, size: Vector3Like): Vector3Like {
  const clamped = applyLockToSize(part, {
    x: clampLength(size.x),
    y: clampLength(size.y),
    z: clampLength(size.z),
  });
  // Re-clamp after lock application in case the lock value was missing/zero.
  return {
    x: clampLength(clamped.x),
    y: part.objectType === "rectangle" || part.objectType === "circle" ? 0 : clampLength(clamped.y),
    z: clampLength(clamped.z),
  };
}

function mergePartSize(part: PartNode, size: Vector3Like): Vector3Like {
  return normalizePartSize(part, {
    x: size.x ?? part.size.x,
    y: size.y ?? part.size.y,
    z: size.z ?? part.size.z,
  });
}

export function createEditorStore() {
  return createStore<EditorState & EditorActions>((set) => ({
    hydrated: false,
    project: createProject(),
    globalMaterialLibrary: createEmptyMaterialLibrary(),
    recentProjects: [],
    selectedPartId: null,
    selectedMeasurementId: null,
    selectedMaterialId: null,
    selectedMaterialSource: "global",
    activeTool: "move",
    buildPreviewEnabled: false,
    buildPreviewStep: 0,
    undoStack: [],
    redoStack: [],

    hydrateProject: (project) =>
      set({
        project: {
          ...project,
          gridSettings: project.gridSettings ?? { size: 6000, originX: 0, originZ: 0 },
          cutSettings: project.cutSettings ?? { kerfMm: 3 },
          variables: project.variables ?? [],
          buildStatuses: project.buildStatuses ?? DEFAULT_BUILD_STATUSES.map((status) => ({ ...status })),
          parts: project.parts.map((part, index) => ({
            ...part,
            buildStatusId: part.buildStatusId ?? DEFAULT_BUILD_STATUS_ID,
            buildOrder: part.buildOrder ?? index + 1,
          })),
        },
        hydrated: true,
        buildPreviewEnabled: false,
        buildPreviewStep: 0,
        selectedPartId: null,
        selectedMeasurementId: null,
        selectedMaterialId: null,
        selectedMaterialSource: "global",
        undoStack: [],
        redoStack: [],
      }),

    hydrateGlobalMaterialLibrary: (library) =>
      set({
        globalMaterialLibrary: {
          materialGroups: library.materialGroups,
          materials: library.materials,
        },
      }),

    setHydrated: (value) => set({ hydrated: value }),
    setRecentProjects: (projects) => set({ recentProjects: projects }),

    createNewProject: () =>
      set(() => {
        const project = createProject();
        return {
          project,
          selectedPartId: project.parts[0]?.id ?? null,
          selectedMeasurementId: null,
          selectedMaterialId: null,
          selectedMaterialSource: "global",
          buildPreviewEnabled: false,
          buildPreviewStep: 0,
          undoStack: [],
          redoStack: [],
        };
      }),

    selectPart: (partId) => set({ selectedPartId: partId, selectedMeasurementId: null }),
    selectMeasurement: (measurementId) => set({ selectedMeasurementId: measurementId, selectedPartId: null }),

    selectMaterial: (materialId, source = "global") =>
      set({ selectedMaterialId: materialId, selectedMaterialSource: source, selectedPartId: null, selectedMeasurementId: null }),

    addMaterialGroup: (parentGroupId = null) =>
      set((state) => {
        const parentExists = parentGroupId
          ? state.project.materialGroups.some((g) => g.id === parentGroupId)
          : true;
        const newGroup: MaterialGroupNode = {
          id: randomId(),
          name: `Group ${state.project.materialGroups.length + 1}`,
          parentGroupId: parentExists ? parentGroupId : null,
        };
        return {
          ...withProjectHistory(state, (project) => ({
            ...project,
            materialGroups: [...project.materialGroups, newGroup],
          })),
        };
      }),

    renameMaterialGroup: (groupId, name) =>
      set((state) => ({
        ...withProjectHistory(state, (project) => ({
          ...project,
          materialGroups: project.materialGroups.map((g) =>
            g.id === groupId ? { ...g, name: name.trim() || g.name } : g,
          ),
        })),
      })),

    renameMaterial: (materialId, name) =>
      set((state) => {
        if (isMaterialUsed(state.project, materialId)) return state;
        return {
          ...withProjectHistory(state, (project) => ({
            ...project,
            materials: project.materials.map((m) =>
              m.id === materialId ? { ...m, name: name.trim() || m.name } : m,
            ),
          })),
        };
      }),

    setActiveTool: (tool) => set({ activeTool: tool }),

    setBuildPreviewEnabled: (enabled) => set((state) => ({
      buildPreviewEnabled: enabled,
      buildPreviewStep: enabled && state.buildPreviewStep === 0 && state.project.parts.length > 0 ? 1 : state.buildPreviewStep,
    })),

    setBuildPreviewStep: (step) => set((state) => ({
      buildPreviewStep: normalizeBuildPreviewStep(step, getNextBuildOrder(state.project.parts) - 1),
    })),
    renameProject: (name) =>
      set((state) => ({
        ...withProjectHistory(state, (project) => ({
          ...project,
          name: name.trim() || "Untitled Project",
        })),
      })),

    updateUnitPreference: (unitPreference) =>
      set((state) => ({
        ...withProjectHistory(state, (project) => ({
          ...project,
          unitPreference,
        })),
      })),

    updateSnapSettings: (partial) =>
      set((state) => ({
        ...withProjectHistory(state, (project) => ({
          ...project,
          snapSettings: {
            ...project.snapSettings,
            ...partial,
          },
        })),
      })),

    updateGridSettings: (partial) =>
      set((state) => ({
        ...withProjectHistory(state, (project) => ({
          ...project,
          gridSettings: {
            ...project.gridSettings,
            ...partial,
          },
        })),
      })),

    updateCutSettings: (partial) =>
      set((state) => ({
        ...withProjectHistory(state, (project) => ({
          ...project,
          cutSettings: {
            ...project.cutSettings,
            ...partial,
          },
        })),
      })),

    addBuildStatus: () =>
      set((state) => {
        const status: BuildStatusDefinition = {
          id: randomId(),
          label: `Status ${state.project.buildStatuses.length + 1}`,
        };
        return {
          ...withProjectHistory(state, (project) => ({
            ...project,
            buildStatuses: [...project.buildStatuses, status],
          })),
        };
      }),

    updateBuildStatus: (statusId, patch) =>
      set((state) => ({
        ...withProjectHistory(state, (project) => ({
          ...project,
          buildStatuses: project.buildStatuses.map((status) =>
            status.id === statusId ? { ...status, label: patch.label?.trim() || status.label } : status,
          ),
        })),
      })),

    deleteBuildStatus: (statusId) =>
      set((state) => {
        if (statusId === DEFAULT_BUILD_STATUS_ID) return state;
        return {
          ...withProjectHistory(state, (project) => ({
            ...project,
            buildStatuses: project.buildStatuses.filter((status) => status.id !== statusId),
            parts: project.parts.map((part) => (
              part.buildStatusId === statusId ? { ...part, buildStatusId: DEFAULT_BUILD_STATUS_ID } : part
            )),
          })),
        };
      }),

    setPartBuildStatus: (partId, statusId) =>
      set((state) => {
        const exists = state.project.buildStatuses.some((status) => status.id === statusId);
        if (!exists) return state;
        return {
          ...withProjectHistory(state, (project) => ({
            ...project,
            parts: replacePart(project.parts, partId, (part) => ({ ...part, buildStatusId: statusId })),
          })),
        };
      }),

    setPartBuildOrder: (partId, buildOrder) =>
      set((state) => ({
        ...withProjectHistory(state, (project) => ({
          ...project,
          parts: replacePart(project.parts, partId, (part) => ({ ...part, buildOrder: normalizeBuildOrder(buildOrder) })),
        })),
      })),

    reorderPartsBuildOrder: (partIds, targetPartId) =>
      set((state) => {
        const movingIds = [...new Set(partIds)].filter((partId) => state.project.parts.some((part) => part.id === partId));
        if (movingIds.length === 0 || movingIds.includes(targetPartId)) {
          return state;
        }
        const targetExists = state.project.parts.some((part) => part.id === targetPartId);
        if (!targetExists) {
          return state;
        }
        const movingSet = new Set(movingIds);

        return {
          ...withProjectHistory(state, (project) => {
            const ordered = sortPartsByBuildOrder(project.parts);
            const moving = ordered.filter((part) => movingSet.has(part.id));
            const remaining = ordered.filter((part) => !movingSet.has(part.id));
            const targetIndex = remaining.findIndex((part) => part.id === targetPartId);
            if (targetIndex < 0) {
              return project;
            }
            const nextOrdered = [
              ...remaining.slice(0, targetIndex),
              ...moving,
              ...remaining.slice(targetIndex),
            ];
            const orderById = new Map(nextOrdered.map((part, index) => [part.id, index + 1]));

            return {
              ...project,
              parts: project.parts.map((part) => ({ ...part, buildOrder: orderById.get(part.id) ?? part.buildOrder })),
            };
          }),
        };
      }),

    addProjectVariable: () =>
      set((state) => {
        const variable: ProjectVariable = {
          id: randomId(),
          name: `var_${state.project.variables.length + 1}`,
          valueMm: 100,
        };
        return {
          ...withProjectHistory(state, (project) => ({
            ...project,
            variables: [...project.variables, variable],
          })),
        };
      }),

    updateProjectVariable: (variableId, patch) =>
      set((state) => ({
        ...withProjectHistory(state, (project) => applyProjectParamBindings({
          ...project,
          variables: project.variables.map((variable) =>
            variable.id === variableId
              ? {
                  ...variable,
                  name: patch.name !== undefined ? normalizeVariableName(patch.name, variable.name) : variable.name,
                  valueMm: patch.valueMm !== undefined && Number.isFinite(patch.valueMm) ? patch.valueMm : variable.valueMm,
                }
              : variable,
          ),
        })),
      })),

    deleteProjectVariable: (variableId) =>
      set((state) => ({
        ...withProjectHistory(state, (project) => {
          const variable = project.variables.find((candidate) => candidate.id === variableId);
          return {
            ...project,
            variables: project.variables.filter((candidate) => candidate.id !== variableId),
            parts: variable
              ? project.parts.map((part) => {
                  if (!part.paramBindings) return part;
                  const nextBindings = Object.fromEntries(
                    Object.entries(part.paramBindings).filter(([, expression]) => !expressionReferencesVariable(expression, variable.name)),
                  );
                  return {
                    ...part,
                    paramBindings: Object.keys(nextBindings).length > 0 ? nextBindings : undefined,
                  };
                })
              : project.parts,
          };
        }),
      })),

    setPartParamBinding: (partId, field, expression) =>
      set((state) => ({
        ...withProjectHistory(state, (project) => applyProjectParamBindings({
          ...project,
          parts: replacePart(project.parts, partId, (part) => {
            const bindings = { ...part.paramBindings };
            const trimmed = expression?.trim() ?? "";
            if (trimmed) bindings[field] = trimmed;
            else delete bindings[field];
            return {
              ...part,
              paramBindings: Object.keys(bindings).length > 0 ? bindings : undefined,
            };
          }),
        })),
      })),

    addObject: (objectType, profileId = getDefaultProfileId(objectType)) =>
      set((state) => {
        const nextIndex = state.project.parts.length;

        const nextPart = createObjectPart(nextIndex, {
          objectType,
          profileId,
          position: { x: 0, y: 0, z: 0 },
        });
        nextPart.buildOrder = getNextBuildOrder(state.project.parts);

        const history = withProjectHistory(state, (project) => ({
          ...project,
          parts: [...project.parts, nextPart],
        }));

        return {
          ...history,
          selectedPartId: nextPart.id,
          selectedMeasurementId: null,
        };
      }),

    addMeasurement: (start, end) =>
      set((state) => {
        const nextMeasurement = createMeasurementNode(state.project.measurements.length, start, end);

        const history = withProjectHistory(state, (project) => ({
          ...project,
          measurements: [...project.measurements, nextMeasurement],
        }));

        return {
          ...history,
          selectedPartId: null,
          selectedMeasurementId: nextMeasurement.id,
          activeTool: "measure",
        };
      }),

    addGroup: (parentGroupId = null) =>
      set((state) => {
        const parentExists = parentGroupId ? state.project.groups.some((group) => group.id === parentGroupId) : true;
        const nextGroup: GroupNode = {
          id: randomId(),
          name: `Group ${state.project.groups.length + 1}`,
          parentGroupId: parentExists ? parentGroupId : null,
        };

        return {
          ...withProjectHistory(state, (project) => ({
            ...project,
            groups: [...project.groups, nextGroup],
          })),
        };
      }),

    updateGroupName: (groupId, name) =>
      set((state) => ({
        ...withProjectHistory(state, (project) => ({
          ...project,
          groups: replaceGroup(project.groups, groupId, (group) => ({
            ...group,
            name: name.trim() || group.name,
          })),
        })),
      })),

    deleteGroup: (groupId) =>
      set((state) => {
        const group = state.project.groups.find((g) => g.id === groupId);
        if (!group) return state;
        const parentGroupId = group.parentGroupId;

        return {
          ...withProjectHistory(state, (project) => ({
            ...project,
            groups: project.groups
              .filter((g) => g.id !== groupId)
              .map((g) => (g.parentGroupId === groupId ? { ...g, parentGroupId } : g)),
            parts: project.parts.map((p) => (p.groupId === groupId ? { ...p, groupId: parentGroupId } : p)),
            measurements: project.measurements.map((m) => (m.groupId === groupId ? { ...m, groupId: parentGroupId } : m)),
          })),
        };
      }),

    movePartToGroup: (partId, groupId) =>
      set((state) => {
        const nextGroupId = groupId && state.project.groups.some((group) => group.id === groupId) ? groupId : null;

        return {
          ...withProjectHistory(state, (project) => ({
            ...project,
            parts: replacePart(project.parts, partId, (part) => ({
              ...part,
              groupId: nextGroupId,
            })),
          })),
        };
      }),

    moveMeasurementToGroup: (measurementId, groupId) =>
      set((state) => {
        const nextGroupId = groupId && state.project.groups.some((group) => group.id === groupId) ? groupId : null;

        return {
          ...withProjectHistory(state, (project) => ({
            ...project,
            measurements: replaceMeasurement(project.measurements, measurementId, (measurement) => ({
              ...measurement,
              groupId: nextGroupId,
            })),
          })),
        };
      }),

    moveGroupToGroup: (groupId, parentGroupId) =>
      set((state) => {
        const groupExists = state.project.groups.some((group) => group.id === groupId);
        const parentExists = parentGroupId ? state.project.groups.some((group) => group.id === parentGroupId) : true;
        const isInvalidParent =
          parentGroupId === groupId ||
          (parentGroupId ? isDescendantGroup(state.project.groups, parentGroupId, groupId) : false);

        if (!groupExists || !parentExists || isInvalidParent) {
          return state;
        }

        return {
          ...withProjectHistory(state, (project) => ({
            ...project,
            groups: replaceGroup(project.groups, groupId, (group) => ({
              ...group,
              parentGroupId: parentGroupId ?? null,
            })),
          })),
        };
      }),

    duplicateSelectedPart: () =>
      set((state) => {
        const selected = state.project.parts.find((part) => part.id === state.selectedPartId);
        if (!selected) {
          return state;
        }

        const duplicate: PartNode = {
          ...(JSON.parse(JSON.stringify(selected)) as PartNode),
          id: randomId(),
          name: `${selected.name} Copy`,
          position: {
            x: selected.position.x + DUPLICATE_OFFSET_MM,
            y: selected.position.y,
            z: selected.position.z,
          },
          buildOrder: getNextBuildOrder(state.project.parts),
        };

        const history = withProjectHistory(state, (project) => ({
          ...project,
          parts: [...project.parts, duplicate],
        }));

        return {
          ...history,
          selectedPartId: duplicate.id,
          selectedMeasurementId: null,
        };
      }),

    createCladdingPattern: (partId, options) =>
      set((state) => {
        const selected = state.project.parts.find((part) => part.id === partId);
        if (!selected || selected.objectType !== "cladding" || !Number.isFinite(options.gap)) {
          return state;
        }

        const copies = clampPatternCopies(options.copies);
        const direction = rotateVectorByEuler(getLocalAxisVector(options.axis), selected.rotation);
        const stepDistance = Math.sign(options.gap || 1) * (getPatternProfileStep(selected, options.axis) + Math.abs(options.gap));
        const patternParts = Array.from({ length: copies }, (_, index) => {
          const step = index + 1;
          const baseBuildOrder = getNextBuildOrder(state.project.parts);

          return {
            ...(JSON.parse(JSON.stringify(selected)) as PartNode),
            id: randomId(),
            name: `${selected.name} Pattern ${step}`,
            position: {
              x: selected.position.x + direction.x * stepDistance * step,
              y: selected.position.y + direction.y * stepDistance * step,
              z: selected.position.z + direction.z * stepDistance * step,
            },
            buildOrder: baseBuildOrder + index,
          };
        });

        const history = withProjectHistory(state, (project) => ({
          ...project,
          parts: [...project.parts, ...patternParts],
        }));

        return {
          ...history,
          selectedPartId: patternParts.at(-1)?.id ?? selected.id,
          selectedMeasurementId: null,
        };
      }),

    deleteSelectedPart: () =>
      set((state) => {
        if (!state.selectedPartId) {
          return state;
        }

        const nextParts = state.project.parts.filter((part) => part.id !== state.selectedPartId);
        const history = withProjectHistory(state, (project) => ({
          ...project,
          parts: nextParts,
        }));

        return {
          ...history,
          selectedPartId: nextParts[0]?.id ?? null,
          selectedMeasurementId: null,
        };
      }),

    deleteSelectedMeasurement: () =>
      set((state) => {
        if (!state.selectedMeasurementId) {
          return state;
        }

        const nextMeasurements = state.project.measurements.filter((measurement) => measurement.id !== state.selectedMeasurementId);
        const history = withProjectHistory(state, (project) => ({
          ...project,
          measurements: nextMeasurements,
        }));

        return {
          ...history,
          selectedMeasurementId: nextMeasurements[0]?.id ?? null,
          selectedPartId: null,
        };
      }),

    updatePart: (partId, updater) =>
      set((state) => ({
        ...withProjectHistory(state, (project) => ({
          ...project,
          parts: replacePart(project.parts, partId, updater),
        })),
      })),

    updateMeasurement: (measurementId, updater) =>
      set((state) => ({
        ...withProjectHistory(state, (project) => ({
          ...project,
          measurements: replaceMeasurement(project.measurements, measurementId, updater),
        })),
      })),

    togglePartVisibility: (partId) =>
      set((state) => ({
        ...withProjectHistory(state, (project) => ({
          ...project,
          parts: replacePart(project.parts, partId, (part) => ({ ...part, hidden: !part.hidden })),
        })),
      })),

    toggleGroupVisibility: (groupId) =>
      set((state) => ({
        ...withProjectHistory(state, (project) => ({
          ...project,
          groups: replaceGroup(project.groups, groupId, (group) => ({ ...group, hidden: !group.hidden })),
        })),
      })),

    toggleMeasurementVisibility: (measurementId) =>
      set((state) => ({
        ...withProjectHistory(state, (project) => ({
          ...project,
          measurements: replaceMeasurement(project.measurements, measurementId, (m) => ({ ...m, hidden: !m.hidden })),
        })),
      })),

    addObjectFromMaterial: (materialId) =>
      set((state) => {
        const material = state.globalMaterialLibrary.materials.find((m) => m.id === materialId);
        if (!material) return state;

        const nextIndex = state.project.parts.length;
        const nextPart = createObjectPart(nextIndex, {
          objectType: material.objectType,
          size: { ...material.defaultSize },
          position: { x: 0, y: 0, z: 0 },
          materialId: material.id,
        });
        nextPart.buildOrder = getNextBuildOrder(state.project.parts);
        // Override createObjectPart's profile-derived color/locks with the material's own.
        nextPart.color = material.color;
        nextPart.lockedAxes = { ...material.lockedAxes };
        Object.assign(nextPart, legacyLockFieldsFromSize(material.defaultSize, material.lockedAxes));

        const history = withProjectHistory(state, (project) => ({
          ...project,
          parts: [...project.parts, nextPart],
        }));

        return {
          ...history,
          selectedPartId: nextPart.id,
          selectedMeasurementId: null,
          selectedMaterialId: null,
        };
      }),

    addObjectFromGlobalMaterial: (materialId) =>
      set((state) => {
        const globalMaterial = state.globalMaterialLibrary.materials.find((m) => m.id === materialId);
        if (!globalMaterial) return state;

        const history = withProjectHistory(state, (project) => {
          const nextPart = createObjectPart(project.parts.length, {
            objectType: globalMaterial.objectType,
            size: { ...globalMaterial.defaultSize },
            position: { x: 0, y: 0, z: 0 },
            materialId: globalMaterial.id,
          });
          nextPart.buildOrder = getNextBuildOrder(project.parts);
          nextPart.color = globalMaterial.color;
          nextPart.lockedAxes = { ...globalMaterial.lockedAxes };
          Object.assign(nextPart, legacyLockFieldsFromSize(globalMaterial.defaultSize, globalMaterial.lockedAxes));
          return {
            ...project,
            parts: [...project.parts, nextPart],
          };
        });

        const selectedPartId = history.project.parts.at(-1)?.id ?? null;
        return {
          ...history,
          selectedPartId,
          selectedMeasurementId: null,
          selectedMaterialId: null,
          selectedMaterialSource: "global",
        };
      }),

    deleteMaterial: (materialId) =>
      set((state) => {
        if (isMaterialUsed(state.project, materialId)) return state;

        const next = withProjectHistory(state, (project) => ({
          ...project,
          materials: project.materials.filter((m) => m.id !== materialId),
        }));

        return {
          ...next,
          selectedMaterialId: state.selectedMaterialId === materialId ? null : state.selectedMaterialId,
        };
      }),

    updateMaterialDefaultSize: (materialId, axis, valueMm) =>
      set((state) => {
        if (isMaterialUsed(state.project, materialId)) return state;
        return {
          ...withProjectHistory(state, (project) => ({
            ...project,
            materials: project.materials.map((m) => {
              if (m.id !== materialId) return m;
              const nextDefaultSize = { ...m.defaultSize, [axis]: valueMm };
              return {
                ...m,
                defaultSize: nextDefaultSize,
                ...legacyLockFieldsFromSize(nextDefaultSize, m.lockedAxes),
              };
            }),
          })),
        };
      }),

    updateMaterialAxisLock: (materialId, axis, locked) =>
      set((state) => {
        if (isMaterialUsed(state.project, materialId)) return state;
        return {
          ...withProjectHistory(state, (project) => ({
            ...project,
            materials: project.materials.map((m) => {
              if (m.id !== materialId) return m;
              const nextLockedAxes = { ...m.lockedAxes, [axis]: locked };
              if (!locked) delete nextLockedAxes[axis];
              return {
                ...m,
                lockedAxes: nextLockedAxes,
                ...legacyLockFieldsFromSize(m.defaultSize, nextLockedAxes),
              };
            }),
          })),
        };
      }),

    updateMaterialColor: (materialId, color) =>
      set((state) => {
        if (isMaterialUsed(state.project, materialId)) return state;
        return {
          ...withProjectHistory(state, (project) => ({
            ...project,
            materials: project.materials.map((m) =>
              m.id === materialId ? { ...m, color } : m,
            ),
          })),
        };
      }),

    duplicateMaterial: (materialId) =>
      set((state) => {
        const source = state.project.materials.find((m) => m.id === materialId);
        if (!source) return state;
        const copy: MaterialNode = {
          ...source,
          id: randomId(),
          name: `${source.name} Copy`,
          defaultSize: { ...source.defaultSize },
          lockedAxes: { ...source.lockedAxes },
        };
        const next = withProjectHistory(state, (project) => ({
          ...project,
          materials: [...project.materials, copy],
        }));
        return { ...next, selectedMaterialId: copy.id };
      }),

    deleteMaterialGroup: (groupId) =>
      set((state) => {
        const hasMaterials = state.project.materials.some((m) => m.groupId === groupId);
        const hasChildGroups = state.project.materialGroups.some((g) => g.parentGroupId === groupId);
        if (hasMaterials || hasChildGroups) return state;
        return {
          ...withProjectHistory(state, (project) => ({
            ...project,
            materialGroups: project.materialGroups.filter((g) => g.id !== groupId),
          })),
        };
      }),

    renameGlobalMaterialGroup: (groupId, name) =>
      set((state) => ({
        globalMaterialLibrary: {
          ...state.globalMaterialLibrary,
          materialGroups: state.globalMaterialLibrary.materialGroups.map((group) =>
            group.id === groupId ? { ...group, name: name.trim() || group.name } : group,
          ),
        },
      })),

    renameGlobalMaterial: (materialId, name) =>
      set((state) => ({
        globalMaterialLibrary: {
          ...state.globalMaterialLibrary,
          materials: state.globalMaterialLibrary.materials.map((material) =>
            material.id === materialId ? { ...material, name: name.trim() || material.name } : material,
          ),
        },
      })),

    updateGlobalMaterialColor: (materialId, color) =>
      set((state) => ({
        globalMaterialLibrary: {
          ...state.globalMaterialLibrary,
          materials: state.globalMaterialLibrary.materials.map((material) =>
            material.id === materialId ? { ...material, color } : material,
          ),
        },
      })),

    updateGlobalMaterialDefaultSize: (materialId, axis, valueMm) =>
      set((state) => ({
        globalMaterialLibrary: {
          ...state.globalMaterialLibrary,
          materials: state.globalMaterialLibrary.materials.map((material) => {
            if (material.id !== materialId) return material;
            const nextDefaultSize = { ...material.defaultSize, [axis]: valueMm };
            return {
              ...material,
              defaultSize: nextDefaultSize,
              ...legacyLockFieldsFromSize(nextDefaultSize, material.lockedAxes),
            };
          }),
        },
      })),

    updateGlobalMaterialAxisLock: (materialId, axis, locked) =>
      set((state) => ({
        globalMaterialLibrary: {
          ...state.globalMaterialLibrary,
          materials: state.globalMaterialLibrary.materials.map((material) => {
            if (material.id !== materialId) return material;
            const nextLockedAxes = { ...material.lockedAxes, [axis]: locked };
            if (!locked) delete nextLockedAxes[axis];
            return {
              ...material,
              lockedAxes: nextLockedAxes,
              ...legacyLockFieldsFromSize(material.defaultSize, nextLockedAxes),
            };
          }),
        },
      })),

    addGlobalMaterialGroup: (parentGroupId = null) =>
      set((state) => {
        const parentExists = parentGroupId
          ? state.globalMaterialLibrary.materialGroups.some((group) => group.id === parentGroupId)
          : true;
        const group: MaterialGroupNode = {
          id: randomId(),
          name: `Folder ${state.globalMaterialLibrary.materialGroups.length + 1}`,
          parentGroupId: parentExists ? parentGroupId : null,
        };

        return {
          globalMaterialLibrary: {
            ...state.globalMaterialLibrary,
            materialGroups: [...state.globalMaterialLibrary.materialGroups, group],
          },
          selectedMaterialId: null,
          selectedMaterialSource: "global",
        };
      }),

    deleteGlobalMaterialGroup: (groupId) =>
      set((state) => {
        const hasMaterials = state.globalMaterialLibrary.materials.some((material) => material.groupId === groupId);
        const hasChildGroups = state.globalMaterialLibrary.materialGroups.some((group) => group.parentGroupId === groupId);
        if (hasMaterials || hasChildGroups) return state;

        return {
          globalMaterialLibrary: {
            ...state.globalMaterialLibrary,
            materialGroups: state.globalMaterialLibrary.materialGroups.filter((group) => group.id !== groupId),
          },
        };
      }),

    createGlobalMaterial: (objectType) =>
      set((state) => {
        const profile = getProfileById(getDefaultProfileId(objectType));
        const defaultSize = createSizeFromProfile(profile);
        let materialGroups = state.globalMaterialLibrary.materialGroups;
        let groupId = state.globalMaterialLibrary.materials.find((material) => material.objectType === objectType)?.groupId ?? null;

        if (!groupId && objectType !== "rectangle" && objectType !== "circle" && objectType !== "cube") {
          const group = {
            id: randomId(),
            name: getObjectTypeLabel(objectType),
            parentGroupId: null,
          };
          materialGroups = [...materialGroups, group];
          groupId = group.id;
        }

        const material: MaterialNode = {
          id: randomId(),
          name: `New ${getObjectTypeLabel(objectType)}`,
          groupId,
          objectType,
          color: profile.color,
          defaultSize,
          ...extractLockFields(profile),
        };

        return {
          globalMaterialLibrary: {
            materialGroups,
            materials: [...state.globalMaterialLibrary.materials, material],
          },
          selectedMaterialId: material.id,
          selectedMaterialSource: "global",
          selectedPartId: null,
          selectedMeasurementId: null,
        };
      }),

    createGlobalMaterialFromPart: (partId) =>
      set((state) => {
        const part = state.project.parts.find((item) => item.id === partId);
        if (!part) return state;

        let materialGroups = state.globalMaterialLibrary.materialGroups;
        const sourceMaterial = part.materialId
          ? state.globalMaterialLibrary.materials.find((material) => material.id === part.materialId)
          : null;
        let groupId = sourceMaterial?.groupId
          ?? state.globalMaterialLibrary.materials.find((material) => material.objectType === part.objectType)?.groupId
          ?? null;
        if (!groupId) {
          const group = {
            id: randomId(),
            name: getObjectTypeLabel(part.objectType),
            parentGroupId: null,
          };
          materialGroups = [...materialGroups, group];
          groupId = group.id;
        }

        const material: MaterialNode = {
          id: randomId(),
          name: part.name.trim() ? part.name : `New ${getObjectTypeLabel(part.objectType)}`,
          groupId,
          objectType: part.objectType,
          color: part.color,
          defaultSize: { ...part.size },
          lockedAxes: { ...part.lockedAxes },
          ...legacyLockFieldsFromSize(part.size, part.lockedAxes),
        };

        return {
          ...withProjectHistory(state, (project) => ({
            ...project,
            parts: replacePart(project.parts, partId, (current) => applyMaterialToPart(current, material)),
          })),
          globalMaterialLibrary: {
            ...state.globalMaterialLibrary,
            materialGroups,
            materials: [...state.globalMaterialLibrary.materials, material],
          },
          selectedMaterialId: material.id,
          selectedMaterialSource: "global",
        };
      }),

    duplicateGlobalMaterial: (materialId) =>
      set((state) => {
        const source = state.globalMaterialLibrary.materials.find((material) => material.id === materialId);
        if (!source) return state;
        const copy: MaterialNode = {
          ...source,
          id: randomId(),
          name: `${source.name} Copy`,
          defaultSize: { ...source.defaultSize },
          lockedAxes: { ...source.lockedAxes },
          sourceLibraryMaterialId: undefined,
        };
        return {
          globalMaterialLibrary: {
            ...state.globalMaterialLibrary,
            materials: [...state.globalMaterialLibrary.materials, copy],
          },
          selectedMaterialId: copy.id,
          selectedMaterialSource: "global",
        };
      }),

    deleteGlobalMaterial: (materialId) =>
      set((state) => ({
        globalMaterialLibrary: {
          ...state.globalMaterialLibrary,
          materials: state.globalMaterialLibrary.materials.filter((material) => material.id !== materialId),
        },
        selectedMaterialId: state.selectedMaterialSource === "global" && state.selectedMaterialId === materialId ? null : state.selectedMaterialId,
      })),

    setPartGeometry: (partId, geometry) =>
      set((state) => ({
        ...withProjectHistory(state, (project) => ({
          ...project,
          parts: replacePart(project.parts, partId, (part) => ({
            ...part,
            size: geometry.size ? mergePartSize(part, geometry.size) : part.size,
            position: geometry.position ? { ...part.position, ...geometry.position } : part.position,
            rotation: geometry.rotation ? { ...part.rotation, ...geometry.rotation } : part.rotation,
          })),
        })),
      })),

    previewPartGeometry: (partId, geometry) =>
      set((state) => ({
        project: {
          ...state.project,
          parts: replacePart(state.project.parts, partId, (part) => ({
            ...part,
            size: geometry.size ? mergePartSize(part, geometry.size) : part.size,
            position: geometry.position ? { ...part.position, ...geometry.position } : part.position,
            rotation: geometry.rotation ? { ...part.rotation, ...geometry.rotation } : part.rotation,
          })),
        },
      })),

    setPartMaterial: (partId, materialId) =>
      set((state) => {
        const material = state.globalMaterialLibrary.materials.find((m) => m.id === materialId);
        if (!material) return state;
        return {
          ...withProjectHistory(state, (project) => ({
            ...project,
            parts: replacePart(project.parts, partId, (part) => applyMaterialToPart(part, material)),
          })),
        };
      }),

    setPartsMaterial: (partIds, materialId) =>
      set((state) => {
        if (partIds.length === 0) return state;
        const material = state.globalMaterialLibrary.materials.find((m) => m.id === materialId);
        if (!material) return state;
        const targetIds = new Set(partIds);
        return {
          ...withProjectHistory(state, (project) => ({
            ...project,
            parts: project.parts.map((part) => (
              targetIds.has(part.id) ? applyMaterialToPart(part, material) : part
            )),
          })),
        };
      }),

    commitCameraState: (cameraState) =>
      set((state) => ({
        project: {
          ...state.project,
          cameraState,
        },
      })),

    finalizeTransientChange: (previousProject) =>
      set((state) => ({
        project: touchProject(state.project),
        undoStack: [...state.undoStack.slice(-(MAX_HISTORY - 1)), cloneHistoryProject(previousProject)],
        redoStack: [],
      })),

    undo: () =>
      set((state) => {
        const previous = state.undoStack.at(-1);
        if (!previous) {
          return state;
        }

        const selectedMeasurementId =
          previous.measurements.find((measurement) => measurement.id === state.selectedMeasurementId)?.id ?? null;
        const selectedPartId = selectedMeasurementId
          ? null
          : previous.parts.find((part) => part.id === state.selectedPartId)?.id ?? previous.parts[0]?.id ?? null;

        return {
          project: previous,
          undoStack: state.undoStack.slice(0, -1),
          redoStack: [...state.redoStack, cloneHistoryProject(state.project)],
          selectedPartId,
          selectedMeasurementId,
        };
      }),

    redo: () =>
      set((state) => {
        const next = state.redoStack.at(-1);
        if (!next) {
          return state;
        }

        const selectedMeasurementId = next.measurements.find((measurement) => measurement.id === state.selectedMeasurementId)?.id ?? null;
        const selectedPartId = selectedMeasurementId
          ? null
          : next.parts.find((part) => part.id === state.selectedPartId)?.id ?? next.parts[0]?.id ?? null;

        return {
          project: next,
          undoStack: [...state.undoStack, cloneHistoryProject(state.project)],
          redoStack: state.redoStack.slice(0, -1),
          selectedPartId,
          selectedMeasurementId,
        };
      }),
  }));
}

export const editorStore = createEditorStore();

export function useEditorStore<T>(selector: (state: EditorState & EditorActions) => T): T {
  return useStore(editorStore, selector);
}

export function getSelectedPart(state: EditorState): PartNode | null {
  return state.project.parts.find((part) => part.id === state.selectedPartId) ?? null;
}

export function getSelectedMeasurement(state: EditorState): MeasurementNode | null {
  return state.project.measurements.find((measurement) => measurement.id === state.selectedMeasurementId) ?? null;
}

export function updateVector(
  vector: Vector3Like,
  axis: keyof Vector3Like,
  value: number,
): Vector3Like {
  return {
    ...vector,
    [axis]: value,
  };
}
