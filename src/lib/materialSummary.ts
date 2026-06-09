import { getObjectTypeLabel } from "./profiles";
import type { BuildStatusDefinition, MaterialNode, ObjectType, PartNode } from "../types/model";

export type MaterialUsageKind = "linear" | "area";

export type CutPlanCut = {
  partId: string;
  partName: string;
  buildStatusId: string;
  lengthMm: number;
};

export type CutPlanStock = {
  index: number;
  cuts: CutPlanCut[];
  usedLengthMm: number;
  leftoverLengthMm: number;
};

export type LinearCutPlan = {
  rawStockLengthMm: number;
  kerfMm: number;
  stock: CutPlanStock[];
  stockCount: number;
  totalWasteMm: number;
  oversizePartIds: string[];
};

export type PanelPlanCut = {
  partId: string;
  partName: string;
  buildStatusId: string;
  widthMm: number;
  heightMm: number;
  rotated: boolean;
};

export type PanelPlanShelf = {
  cuts: PanelPlanCut[];
  usedWidthMm: number;
  heightMm: number;
};

export type PanelPlanStock = {
  index: number;
  shelves: PanelPlanShelf[];
  usedAreaMm2: number;
  wasteAreaMm2: number;
};

export type PanelCutPlan = {
  rawWidthMm: number;
  rawHeightMm: number;
  kerfMm: number;
  stock: PanelPlanStock[];
  stockCount: number;
  totalWasteMm2: number;
  oversizePartIds: string[];
};

export type MaterialUsageItem = {
  key: string;
  materialId: string | null;
  label: string;
  objectType: ObjectType;
  objectTypeLabel: string;
  count: number;
  kind: MaterialUsageKind;
  totalLengthMm: number;
  totalAreaMm2: number;
  plannedLengthMm: number;
  plannedAreaMm2: number;
  partIds: string[];
  plannedPartIds: string[];
  handledPartIds: string[];
  statusCounts: Record<string, number>;
  cutPlan?: LinearCutPlan;
  panelPlan?: PanelCutPlan;
};

export type MaterialUsageOptions = {
  buildStatuses?: BuildStatusDefinition[];
  handledBuildStatusIds?: string[];
};

const OBJECT_TYPE_SORT_ORDER: Record<ObjectType, number> = {
  timber: 0,
  cladding: 1,
  sheet: 2,
  glass: 3,
  rectangle: 4,
  circle: 5,
  cube: 6,
};

function getUsageKind(part: PartNode): MaterialUsageKind {
  return part.objectType === "timber" || part.objectType === "cladding" ? "linear" : "area";
}

function getPartAreaMm2(part: PartNode): number {
  if (part.objectType === "circle") {
    return Math.PI * (part.size.x / 2) ** 2;
  }

  if (part.objectType === "rectangle") {
    return part.size.x * part.size.z;
  }

  return part.size.x * part.size.y;
}

function canPlanAsPanel(part: PartNode): boolean {
  return part.objectType === "sheet" || part.objectType === "glass";
}

/**
 * Label for a part that has no (or a missing) materialId — derived from the
 * part's own type and lock fields. Used as the cut-list fallback so the
 * material library isn't load-bearing for the summary.
 */
function deriveOrphanLabel(part: PartNode): string {
  const typeLabel = getObjectTypeLabel(part.objectType);
  if (part.crossSectionWidthMm !== undefined && part.crossSectionHeightMm !== undefined) {
    return `${typeLabel} ${part.crossSectionWidthMm} × ${part.crossSectionHeightMm} mm`;
  }
  if (part.thicknessMm !== undefined) {
    return `${typeLabel} ${part.thicknessMm} mm`;
  }
  return typeLabel;
}

function deriveOrphanKey(part: PartNode): string {
  if (part.crossSectionWidthMm !== undefined && part.crossSectionHeightMm !== undefined) {
    return `dim:${part.objectType}:${part.crossSectionWidthMm}x${part.crossSectionHeightMm}`;
  }
  if (part.thicknessMm !== undefined) {
    return `dim:${part.objectType}:t${part.thicknessMm}`;
  }
  return `dim:${part.objectType}`;
}

export function getMaterialUsageSummary(
  parts: PartNode[],
  materials: MaterialNode[],
  kerfMm = 0,
  options: MaterialUsageOptions = {},
): MaterialUsageItem[] {
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const usageByKey = new Map<string, MaterialUsageItem>();
  const handledStatusIds = getHandledBuildStatusIds(options.buildStatuses, options.handledBuildStatusIds);

  for (const part of parts) {
    const material = part.materialId ? materialById.get(part.materialId) : undefined;
    const key = material ? `mat:${material.id}` : deriveOrphanKey(part);
    const label = material ? material.name : deriveOrphanLabel(part);
    const kind = getUsageKind(part);

    const current = usageByKey.get(key) ?? {
      key,
      materialId: material?.id ?? null,
      label,
      objectType: part.objectType,
      objectTypeLabel: getObjectTypeLabel(part.objectType),
      count: 0,
      kind,
      totalLengthMm: 0,
      totalAreaMm2: 0,
      plannedLengthMm: 0,
      plannedAreaMm2: 0,
      partIds: [],
      plannedPartIds: [],
      handledPartIds: [],
      statusCounts: {},
    };

    current.count += 1;
    current.partIds.push(part.id);
    current.statusCounts[part.buildStatusId] = (current.statusCounts[part.buildStatusId] ?? 0) + 1;
    const isHandled = handledStatusIds.has(part.buildStatusId);
    if (isHandled) {
      current.handledPartIds.push(part.id);
    } else {
      current.plannedPartIds.push(part.id);
    }
    if (kind === "linear") {
      current.totalLengthMm += part.size.x;
      if (!isHandled) {
        current.plannedLengthMm += part.size.x;
      }
    } else {
      const areaMm2 = getPartAreaMm2(part);
      current.totalAreaMm2 += areaMm2;
      if (!isHandled) {
        current.plannedAreaMm2 += areaMm2;
      }
    }

    usageByKey.set(key, current);
  }

  const byPartId = new Map(parts.map((part) => [part.id, part]));
  const normalizedKerfMm = Math.max(0, Number.isFinite(kerfMm) ? kerfMm : 0);

  usageByKey.forEach((item) => {
    if (!item.key.startsWith("mat:")) {
      return;
    }
    const material = materialById.get(item.key.slice(4));
    if (!material) {
      return;
    }

    const itemParts = item.plannedPartIds
      .map((partId) => byPartId.get(partId))
      .filter((part): part is PartNode => Boolean(part));

    if (item.kind === "linear" && material.defaultSize.x > 0) {
      item.cutPlan = createLinearCutPlan(itemParts, material.defaultSize.x, normalizedKerfMm);
    }

    if (item.kind === "area" && itemParts.every(canPlanAsPanel) && material.defaultSize.x > 0 && material.defaultSize.y > 0) {
      item.panelPlan = createPanelCutPlan(itemParts, material.defaultSize.x, material.defaultSize.y, normalizedKerfMm);
    }
  });

  return [...usageByKey.values()].sort((a, b) => {
    const typeOrder = OBJECT_TYPE_SORT_ORDER[a.objectType] - OBJECT_TYPE_SORT_ORDER[b.objectType];
    return typeOrder || a.label.localeCompare(b.label);
  });
}

function getHandledBuildStatusIds(
  buildStatuses: BuildStatusDefinition[] | undefined,
  explicitIds: string[] | undefined,
): Set<string> {
  if (explicitIds) {
    return new Set(explicitIds);
  }

  return new Set(
    (buildStatuses ?? [])
      .filter((status) => {
        const value = `${status.id} ${status.label}`.toLowerCase();
        return value.includes("ready") || value.includes("prepared") || value.includes("cut") || value.includes("installed") || value.includes("inspected");
      })
      .map((status) => status.id),
  );
}

function createLinearCutPlan(parts: PartNode[], rawStockLengthMm: number, kerfMm: number): LinearCutPlan {
  const oversizePartIds: string[] = [];
  const cuts = parts
    .map((part): CutPlanCut => ({ partId: part.id, partName: part.name, buildStatusId: part.buildStatusId, lengthMm: part.size.x }))
    .filter((cut) => {
      if (cut.lengthMm > rawStockLengthMm) {
        oversizePartIds.push(cut.partId);
        return false;
      }
      return true;
    })
    .sort((left, right) => right.lengthMm - left.lengthMm || left.partName.localeCompare(right.partName) || left.partId.localeCompare(right.partId));

  const stock: CutPlanStock[] = [];

  cuts.forEach((cut) => {
    const target = stock.find((candidate) => candidate.usedLengthMm + (candidate.cuts.length > 0 ? kerfMm : 0) + cut.lengthMm <= rawStockLengthMm);
    if (target) {
      target.usedLengthMm += (target.cuts.length > 0 ? kerfMm : 0) + cut.lengthMm;
      target.leftoverLengthMm = rawStockLengthMm - target.usedLengthMm;
      target.cuts.push(cut);
    } else {
      stock.push({
        index: stock.length + 1,
        cuts: [cut],
        usedLengthMm: cut.lengthMm,
        leftoverLengthMm: rawStockLengthMm - cut.lengthMm,
      });
    }
  });

  return {
    rawStockLengthMm,
    kerfMm,
    stock,
    stockCount: stock.length,
    totalWasteMm: stock.reduce((sum, item) => sum + item.leftoverLengthMm, 0),
    oversizePartIds,
  };
}

function createPanelCutPlan(parts: PartNode[], rawWidthMm: number, rawHeightMm: number, kerfMm: number): PanelCutPlan {
  const rawAreaMm2 = rawWidthMm * rawHeightMm;
  const oversizePartIds: string[] = [];
  const cuts = parts
    .map((part) => ({
      part,
      orientations: [
        { widthMm: part.size.x, heightMm: part.size.y, rotated: false },
        { widthMm: part.size.y, heightMm: part.size.x, rotated: true },
      ].filter((orientation, index, all) =>
        index === 0 || orientation.widthMm !== all[0].widthMm || orientation.heightMm !== all[0].heightMm,
      ),
    }))
    .filter(({ part, orientations }) => {
      const fits = orientations.some((orientation) => orientation.widthMm <= rawWidthMm && orientation.heightMm <= rawHeightMm);
      if (!fits) {
        oversizePartIds.push(part.id);
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      const leftMax = Math.max(left.part.size.x, left.part.size.y);
      const rightMax = Math.max(right.part.size.x, right.part.size.y);
      const leftMin = Math.min(left.part.size.x, left.part.size.y);
      const rightMin = Math.min(right.part.size.x, right.part.size.y);
      return rightMax - leftMax || rightMin - leftMin || left.part.name.localeCompare(right.part.name) || left.part.id.localeCompare(right.part.id);
    });

  const stock: PanelPlanStock[] = [];

  cuts.forEach(({ part, orientations }) => {
    const orientationChoices = orientations
      .filter((orientation) => orientation.widthMm <= rawWidthMm && orientation.heightMm <= rawHeightMm)
      .sort((left, right) => right.heightMm - left.heightMm || right.widthMm - left.widthMm);

    let placed = false;
    for (const board of stock) {
      for (const shelf of board.shelves) {
        const match = orientationChoices.find((orientation) => {
          const requiredWidth = shelf.usedWidthMm + (shelf.cuts.length > 0 ? kerfMm : 0) + orientation.widthMm;
          return orientation.heightMm <= shelf.heightMm && requiredWidth <= rawWidthMm;
        });
        if (!match) {
          continue;
        }

        shelf.usedWidthMm += (shelf.cuts.length > 0 ? kerfMm : 0) + match.widthMm;
        shelf.cuts.push({
          partId: part.id,
          partName: part.name,
          buildStatusId: part.buildStatusId,
          widthMm: match.widthMm,
          heightMm: match.heightMm,
          rotated: match.rotated,
        });
        board.usedAreaMm2 += part.size.x * part.size.y;
        board.wasteAreaMm2 = rawAreaMm2 - board.usedAreaMm2;
        placed = true;
        break;
      }

      if (placed) {
        break;
      }

      const usedHeightMm = board.shelves.reduce((sum, shelf) => sum + shelf.heightMm, 0) + Math.max(0, board.shelves.length - 1) * kerfMm;
      const match = orientationChoices.find((orientation) => usedHeightMm + (board.shelves.length > 0 ? kerfMm : 0) + orientation.heightMm <= rawHeightMm);
      if (match) {
        board.shelves.push({
          cuts: [{
            partId: part.id,
            partName: part.name,
            buildStatusId: part.buildStatusId,
            widthMm: match.widthMm,
            heightMm: match.heightMm,
            rotated: match.rotated,
          }],
          usedWidthMm: match.widthMm,
          heightMm: match.heightMm,
        });
        board.usedAreaMm2 += part.size.x * part.size.y;
        board.wasteAreaMm2 = rawAreaMm2 - board.usedAreaMm2;
        placed = true;
        break;
      }
    }

    if (!placed) {
      const first = orientationChoices[0];
      stock.push({
        index: stock.length + 1,
        shelves: [{
          cuts: [{
            partId: part.id,
            partName: part.name,
            buildStatusId: part.buildStatusId,
            widthMm: first.widthMm,
            heightMm: first.heightMm,
            rotated: first.rotated,
          }],
          usedWidthMm: first.widthMm,
          heightMm: first.heightMm,
        }],
        usedAreaMm2: part.size.x * part.size.y,
        wasteAreaMm2: rawAreaMm2 - part.size.x * part.size.y,
      });
    }
  });

  return {
    rawWidthMm,
    rawHeightMm,
    kerfMm,
    stock,
    stockCount: stock.length,
    totalWasteMm2: stock.reduce((sum, item) => sum + item.wasteAreaMm2, 0),
    oversizePartIds,
  };
}
