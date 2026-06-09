import { DEFAULT_BUILD_STATUS_ID, DEFAULT_BUILD_STATUSES, DEFAULT_CUT_SETTINGS, DEFAULT_GRID_SETTINGS, PROJECT_SCHEMA_VERSION, createInitialMaterials } from "./project";
import { DEFAULT_OBJECT_COLOR } from "./materials";
import { createSizeFromProfile, extractLockFields, getProfileById } from "./profiles";
import type { AxisLocks, MaterialLibraryDocument, MaterialNode, MeasurementNode, ObjectProfileId, PartNode, ProjectDocument } from "../types/model";
import { buildPortableProject } from "./materialLibrary";

// Legacy shapes carry profileId (dropped from current PartNode/MaterialNode at v9).
// Used by migration paths to read profileId from the on-disk format.
type LegacyPartWithProfileId = PartNode & { profileId: ObjectProfileId };

const WEB3D_PROJECT_FILE_FORMAT = "web3d-project";
const WEB3D_PROJECT_FILE_FORMAT_VERSION = 1;

type LegacyThicknessPreset = "board-18mm" | "board-24mm" | "sheet-12mm" | "sheet-18mm" | "custom";

type LegacyProjectDocument = {
  id: string;
  name: string;
  version: 1;
  unitPreference: ProjectDocument["unitPreference"];
  snapSettings: ProjectDocument["snapSettings"];
  cameraState: ProjectDocument["cameraState"];
  parts: Array<{
    id: string;
    name: string;
    size: ProjectDocument["parts"][number]["size"];
    position: ProjectDocument["parts"][number]["position"];
    rotation: ProjectDocument["parts"][number]["rotation"];
    thicknessPreset: LegacyThicknessPreset;
    color?: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

type ProjectDocumentV2 = Omit<ProjectDocument, "groups" | "measurements" | "parts" | "version"> & {
  version: 2;
  parts: Array<Omit<LegacyPartWithProfileId, "groupId" | "materialId" | "crossSectionWidthMm" | "crossSectionHeightMm" | "thicknessMm">>;
};

type ProjectDocumentV3 = Omit<ProjectDocument, "measurements" | "version" | "parts"> & {
  version: 3;
  parts: Array<Omit<LegacyPartWithProfileId, "materialId" | "crossSectionWidthMm" | "crossSectionHeightMm" | "thicknessMm">>;
};

type ProjectDocumentV4 = Omit<ProjectDocument, "materialGroups" | "materials" | "version" | "parts"> & {
  version: 4;
  parts: Array<Omit<LegacyPartWithProfileId, "materialId" | "crossSectionWidthMm" | "crossSectionHeightMm" | "thicknessMm">>;
};

// During migration we sometimes synthesize "fresh" materials via createInitialMaterials
// (current shape, no profileId). The legacy types treat profileId/defaultSize/lock fields
// as OPTIONAL so the chain accepts both genuine on-disk legacy materials and synthesized ones.
type FlexibleLegacyMaterial = Omit<MaterialNode, "defaultSize" | "crossSectionWidthMm" | "crossSectionHeightMm" | "thicknessMm"> & {
  profileId?: ObjectProfileId;
  defaultSize?: { x?: number; y?: number; z?: number };
  crossSectionWidthMm?: number;
  crossSectionHeightMm?: number;
  thicknessMm?: number;
};

type ProjectDocumentV5 = Omit<ProjectDocument, "gridSettings" | "version" | "parts" | "materials"> & {
  version: 5;
  parts: Array<Omit<LegacyPartWithProfileId, "crossSectionWidthMm" | "crossSectionHeightMm" | "thicknessMm">>;
  materials: FlexibleLegacyMaterial[];
};

type ProjectDocumentV6 = Omit<ProjectDocument, "version" | "parts" | "materials"> & {
  version: 6;
  parts: Array<Omit<LegacyPartWithProfileId, "crossSectionWidthMm" | "crossSectionHeightMm" | "thicknessMm">>;
  materials: FlexibleLegacyMaterial[];
};

type ProjectDocumentV7 = Omit<ProjectDocument, "version" | "materials"> & {
  version: 7;
  parts: LegacyPartWithProfileId[];
  materials: FlexibleLegacyMaterial[];
};

type ProjectDocumentV8 = Omit<ProjectDocument, "version" | "parts" | "materials"> & {
  version: 8;
  parts: LegacyPartWithProfileId[];
  materials: FlexibleLegacyMaterial[];
};

type ProjectDocumentV9 = Omit<ProjectDocument, "version" | "parts" | "materials"> & {
  version: 9;
  parts: Array<Omit<PartNode, "lockedAxes">>;
  materials: Array<Omit<MaterialNode, "lockedAxes">>;
};

type ProjectDocumentV10 = Omit<ProjectDocument, "version" | "cutSettings" | "buildStatuses" | "parts"> & {
  version: 10;
  parts: Array<Omit<PartNode, "buildStatusId">>;
};

type ProjectDocumentV11 = Omit<ProjectDocument, "version" | "variables" | "buildStatuses" | "parts"> & {
  version: 11;
  parts: Array<Omit<PartNode, "paramBindings" | "buildStatusId">>;
};

type ProjectDocumentV12 = Omit<ProjectDocument, "version" | "buildStatuses" | "parts"> & {
  version: 12;
  parts: Array<Omit<PartNode, "buildStatusId">>;
};

type Web3dProjectFile = {
  format: typeof WEB3D_PROJECT_FILE_FORMAT;
  formatVersion: typeof WEB3D_PROJECT_FILE_FORMAT_VERSION;
  application: "Web3D Designer";
  exportedAt: string;
  project: ProjectDocument;
};

function mapLegacyThicknessPreset(preset: LegacyThicknessPreset): ObjectProfileId {
  switch (preset) {
    case "sheet-12mm":
      return "osb3-12";
    case "board-24mm":
      return "osb3-22";
    case "sheet-18mm":
    case "board-18mm":
    case "custom":
    default:
      return "osb3-18";
  }
}

function migrateProjectV1ToCurrent(legacy: LegacyProjectDocument): ProjectDocument {
  const v4 = {
    id: legacy.id,
    name: legacy.name,
    version: 4 as const,
    unitPreference: legacy.unitPreference,
    snapSettings: legacy.snapSettings,
    cameraState: legacy.cameraState,
    groups: [],
    measurements: [],
    parts: legacy.parts.map((part) => {
      const profileId = mapLegacyThicknessPreset(part.thicknessPreset);
      const profile = getProfileById(profileId);
      return {
        id: part.id,
        name: part.name,
        objectType: "sheet" as const,
        profileId,
        groupId: null,
        size: part.size,
        position: part.position,
        rotation: part.rotation,
        color: part.color ?? profile.color ?? DEFAULT_OBJECT_COLOR,
      };
    }),
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
  };
  return migrateProjectV4ToCurrent(v4 as unknown as ProjectDocumentV4);
}

function migrateProjectV2ToCurrent(project: ProjectDocumentV2): ProjectDocument {
  const v4 = {
    ...project,
    version: 4 as const,
    groups: [],
    measurements: [],
    parts: project.parts.map((part) => ({
      ...part,
      groupId: null,
    })),
  };
  return migrateProjectV4ToCurrent(v4 as unknown as ProjectDocumentV4);
}

function migrateProjectV3ToCurrent(project: ProjectDocumentV3): ProjectDocument {
  const v4 = {
    ...project,
    version: 4 as const,
    parts: project.parts.map((part) => ({ ...part, materialId: null as null })),
    measurements: [],
  };
  return migrateProjectV4ToCurrent(v4 as unknown as ProjectDocumentV4);
}

function migrateProjectV4ToCurrent(project: ProjectDocumentV4): ProjectDocument {
  const { materialGroups, materials, profileToMaterialId } = createInitialMaterials();
  const v5: ProjectDocumentV5 = {
    ...project,
    version: 5 as const,
    materialGroups,
    materials,
    parts: project.parts.map((part) => ({
      ...part,
      materialId: profileToMaterialId.get(part.profileId) ?? null,
    })),
  };
  return migrateProjectV5ToCurrent(v5);
}

const LEGACY_MATERIAL_GROUP_RENAMES: Record<string, string> = {
  "Sheet Goods": "Sheet",
  "Structural Timber": "Timber",
  "Rhombus Cladding": "Cladding",
};

function migrateProjectV5ToCurrent(project: ProjectDocumentV5): ProjectDocument {
  const v6: ProjectDocumentV6 = {
    ...project,
    version: 6 as const,
    gridSettings: { ...DEFAULT_GRID_SETTINGS },
    materialGroups: project.materialGroups.map((group) =>
      LEGACY_MATERIAL_GROUP_RENAMES[group.name]
        ? { ...group, name: LEGACY_MATERIAL_GROUP_RENAMES[group.name] }
        : group,
    ),
  };
  return migrateProjectV6ToCurrent(v6);
}

function migrateProjectV6ToCurrent(project: ProjectDocumentV6): ProjectDocument {
  const v7: ProjectDocumentV7 = {
    ...project,
    version: 7 as const,
    parts: project.parts.map((part) => ({
      ...part,
      ...extractLockFields(getProfileById(part.profileId)),
    })),
  };
  return migrateProjectV7ToCurrent(v7);
}

function migrateProjectV7ToCurrent(project: ProjectDocumentV7): ProjectDocument {
  const v8: ProjectDocumentV8 = {
    ...project,
    version: 8 as const,
    materials: project.materials.map((material) => {
      const ds = material.defaultSize;
      const alreadyComplete = ds && ds.x !== undefined && ds.y !== undefined && ds.z !== undefined;
      if (alreadyComplete) {
        // Synthesized by createInitialMaterials during a v4-or-earlier migration —
        // material is already at v8 shape, nothing to backfill.
        return material;
      }
      if (!material.profileId) {
        return material;
      }
      const profile = getProfileById(material.profileId);
      const profileSize = createSizeFromProfile(profile);
      return {
        ...material,
        defaultSize: {
          x: ds?.x ?? profileSize.x,
          y: ds?.y ?? profileSize.y,
          z: ds?.z ?? profileSize.z,
        },
        ...extractLockFields(profile),
      };
    }),
  };
  return migrateProjectV8ToCurrent(v8);
}

function migrateProjectV8ToCurrent(project: ProjectDocumentV8): ProjectDocument {
  // v9: drop `profileId` from parts and materials. The hardcoded catalog is now seed-only.
  const v9: ProjectDocumentV9 = {
    ...project,
    version: 9 as const,
    parts: project.parts.map(({ profileId: _profileId, ...rest }) => rest),
    materials: project.materials.map(({ profileId: _profileId, defaultSize, ...rest }) => ({
      ...rest,
      defaultSize: defaultSize as PartNode["size"], // narrowed: v8 materials always have a complete defaultSize
    })),
  };
  return migrateProjectV9ToCurrent(v9);
}

function deriveLockedAxes(item: Pick<PartNode | MaterialNode, "crossSectionWidthMm" | "crossSectionHeightMm" | "thicknessMm">): AxisLocks | undefined {
  if (item.crossSectionWidthMm !== undefined && item.crossSectionHeightMm !== undefined) {
    return { y: true, z: true };
  }
  if (item.thicknessMm !== undefined) {
    return { z: true };
  }
  return undefined;
}

function migrateProjectV9ToCurrent(project: ProjectDocumentV9): ProjectDocument {
  const v10: ProjectDocumentV10 = {
    ...project,
    version: 10 as const,
    parts: project.parts.map((part) => ({ ...part, lockedAxes: deriveLockedAxes(part) })),
    materials: project.materials.map((material) => ({ ...material, lockedAxes: deriveLockedAxes(material) })),
  };
  return migrateProjectV10ToCurrent(v10);
}

function migrateProjectV10ToCurrent(project: ProjectDocumentV10): ProjectDocument {
  const v11: ProjectDocumentV11 = {
    ...project,
    version: 11 as const,
    cutSettings: { ...DEFAULT_CUT_SETTINGS },
  };
  return migrateProjectV11ToCurrent(v11);
}

function migrateProjectV11ToCurrent(project: ProjectDocumentV11): ProjectDocument {
  const v12: ProjectDocumentV12 = {
    ...project,
    version: 12 as const,
    variables: [],
    parts: project.parts.map((part) => ({ ...part })),
  };
  return migrateProjectV12ToCurrent(v12);
}

function migrateProjectV12ToCurrent(project: ProjectDocumentV12): ProjectDocument {
  return {
    ...project,
    version: PROJECT_SCHEMA_VERSION,
    buildStatuses: DEFAULT_BUILD_STATUSES.map((status) => ({ ...status })),
    parts: project.parts.map((part) => ({ ...part, buildStatusId: DEFAULT_BUILD_STATUS_ID })),
  };
}

export function serializeProject(project: ProjectDocument): string {
  return JSON.stringify(project);
}

export function serializeProjectFile(project: ProjectDocument, library?: MaterialLibraryDocument): string {
  const portableProject = library ? buildPortableProject(project, library) : project;
  const projectFile: Web3dProjectFile = {
    format: WEB3D_PROJECT_FILE_FORMAT,
    formatVersion: WEB3D_PROJECT_FILE_FORMAT_VERSION,
    application: "Web3D Designer",
    exportedAt: new Date().toISOString(),
    project: portableProject,
  };

  return JSON.stringify(projectFile, null, 2);
}

export function deserializeProject(payload: string): ProjectDocument {
  const parsed = JSON.parse(payload) as ProjectDocument | LegacyProjectDocument;

  if (parsed.version === 1) {
    return migrateProjectV1ToCurrent(parsed as LegacyProjectDocument);
  }

  if (parsed.version === 2) {
    return migrateProjectV2ToCurrent(parsed as unknown as ProjectDocumentV2);
  }

  if (parsed.version === 3) {
    return migrateProjectV3ToCurrent(parsed as unknown as ProjectDocumentV3);
  }

  if (parsed.version === 4) {
    return migrateProjectV4ToCurrent(parsed as unknown as ProjectDocumentV4);
  }

  if (parsed.version === 5) {
    return migrateProjectV5ToCurrent(parsed as unknown as ProjectDocumentV5);
  }

  if (parsed.version === 6) {
    return migrateProjectV6ToCurrent(parsed as unknown as ProjectDocumentV6);
  }

  if (parsed.version === 7) {
    return migrateProjectV7ToCurrent(parsed as unknown as ProjectDocumentV7);
  }

  if (parsed.version === 8) {
    return migrateProjectV8ToCurrent(parsed as unknown as ProjectDocumentV8);
  }

  if (parsed.version === 9) {
    return migrateProjectV9ToCurrent(parsed as unknown as ProjectDocumentV9);
  }

  if (parsed.version === 10) {
    return migrateProjectV10ToCurrent(parsed as unknown as ProjectDocumentV10);
  }

  if (parsed.version === 11) {
    return migrateProjectV11ToCurrent(parsed as unknown as ProjectDocumentV11);
  }

  if (parsed.version === 12) {
    return migrateProjectV12ToCurrent(parsed as unknown as ProjectDocumentV12);
  }

  if (parsed.version !== PROJECT_SCHEMA_VERSION) {
    throw new Error(`Unsupported project version: ${parsed.version}`);
  }

  if (
    !parsed.id ||
    !parsed.name ||
    !Array.isArray(parsed.parts) ||
    !Array.isArray(parsed.groups) ||
    !Array.isArray((parsed as ProjectDocument & { measurements?: MeasurementNode[] }).measurements)
  ) {
    throw new Error("Invalid project payload");
  }

  return {
    ...parsed,
    variables: Array.isArray((parsed as ProjectDocument).variables) ? (parsed as ProjectDocument).variables : [],
    buildStatuses: Array.isArray((parsed as ProjectDocument).buildStatuses)
      ? (parsed as ProjectDocument).buildStatuses
      : DEFAULT_BUILD_STATUSES.map((status) => ({ ...status })),
    parts: parsed.parts.map((part) => ({
      ...part,
      buildStatusId: part.buildStatusId ?? DEFAULT_BUILD_STATUS_ID,
    })),
  } as ProjectDocument;
}

export function deserializeProjectFile(payload: string): ProjectDocument {
  const parsed = JSON.parse(payload) as Partial<Web3dProjectFile> & {
    extras?: {
      web3dProjectDocument?: ProjectDocument;
    };
  };

  if (parsed.format === WEB3D_PROJECT_FILE_FORMAT && parsed.project) {
    return deserializeProject(JSON.stringify(parsed.project));
  }

  if (parsed.extras?.web3dProjectDocument) {
    return deserializeProject(JSON.stringify(parsed.extras.web3dProjectDocument));
  }

  return deserializeProject(payload);
}
