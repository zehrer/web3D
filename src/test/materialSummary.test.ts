import { describe, expect, it } from "vitest";
import { getMaterialUsageSummary } from "../lib/materialSummary";
import { DEFAULT_BUILD_STATUSES, createObjectPart } from "../lib/project";
import type { MaterialNode } from "../types/model";

const TIMBER_MATERIAL: MaterialNode = {
  id: "mat-timber-100",
  name: "Timber 100×100",
  groupId: null,
  objectType: "timber",
  color: "#a77b4e",
  defaultSize: { x: 2500, y: 100, z: 100 },
  crossSectionWidthMm: 100,
  crossSectionHeightMm: 100,
};

const TIMBER_60_MATERIAL: MaterialNode = {
  id: "mat-timber-60",
  name: "Timber 60×80",
  groupId: null,
  objectType: "timber",
  color: "#a77b4e",
  defaultSize: { x: 2000, y: 60, z: 80 },
  crossSectionWidthMm: 60,
  crossSectionHeightMm: 80,
};

const SHEET_MATERIAL: MaterialNode = {
  id: "mat-osb-18",
  name: "OSB/3 18 mm",
  groupId: null,
  objectType: "sheet",
  color: "#caa165",
  defaultSize: { x: 1200, y: 600, z: 18 },
  thicknessMm: 18,
};

describe("material summary", () => {
  it("groups parts that share a materialId and totals their length", () => {
    const first = { ...createObjectPart(0, { objectType: "timber", profileId: "timber-100x100", size: { x: 1200, y: 100, z: 100 } }), materialId: TIMBER_MATERIAL.id };
    const second = { ...createObjectPart(1, { objectType: "timber", profileId: "timber-100x100", size: { x: 800, y: 100, z: 100 } }), materialId: TIMBER_MATERIAL.id };

    const summary = getMaterialUsageSummary([first, second], [TIMBER_MATERIAL]);

    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({
      key: `mat:${TIMBER_MATERIAL.id}`,
      label: "Timber 100×100",
      objectType: "timber",
      count: 2,
      kind: "linear",
      totalLengthMm: 2000,
    });
    expect(summary[0].partIds).toEqual([first.id, second.id]);
  });

  it("uses the material's name as the label, not the profile label", () => {
    const renamed: MaterialNode = { ...TIMBER_MATERIAL, name: "Custom Beam Stock" };
    const part = { ...createObjectPart(0, { objectType: "timber", profileId: "timber-100x100", size: { x: 1000, y: 100, z: 100 } }), materialId: renamed.id };

    const summary = getMaterialUsageSummary([part], [renamed]);

    expect(summary[0].label).toBe("Custom Beam Stock");
  });

  it("groups orphan parts (no materialId) by their lock dimensions", () => {
    const a = { ...createObjectPart(0, { objectType: "timber", profileId: "timber-100x100", size: { x: 500, y: 100, z: 100 } }), materialId: null };
    const b = { ...createObjectPart(1, { objectType: "timber", profileId: "timber-100x100", size: { x: 1500, y: 100, z: 100 } }), materialId: null };
    const c = { ...createObjectPart(2, { objectType: "timber", profileId: "timber-60x80", size: { x: 1000, y: 60, z: 80 } }), materialId: null };

    const summary = getMaterialUsageSummary([a, b, c], []);

    expect(summary).toHaveLength(2);
    const square = summary.find((item) => item.key === "dim:timber:100x100");
    const rectangular = summary.find((item) => item.key === "dim:timber:60x80");
    expect(square).toMatchObject({ label: "Timber 100 × 100 mm", count: 2, totalLengthMm: 2000 });
    expect(rectangular).toMatchObject({ label: "Timber 60 × 80 mm", count: 1, totalLengthMm: 1000 });
  });

  it("falls back to a dimensions-based label when materialId points to a deleted material", () => {
    const part = { ...createObjectPart(0, { objectType: "sheet", profileId: "osb3-18", size: { x: 1200, y: 600, z: 18 } }), materialId: "deleted-id" };

    const summary = getMaterialUsageSummary([part], []);

    expect(summary[0].label).toBe("Sheet 18 mm");
    expect(summary[0].key).toBe("dim:sheet:t18");
  });

  it("computes panel and shape area as before", () => {
    const sheet = { ...createObjectPart(0, { objectType: "sheet", profileId: "osb3-18", size: { x: 1200, y: 600, z: 18 } }), materialId: SHEET_MATERIAL.id };
    const rectangle = { ...createObjectPart(1, { objectType: "rectangle", profileId: "shape-rectangle", size: { x: 1000, y: 0, z: 500 } }), materialId: null };

    const summary = getMaterialUsageSummary([sheet, rectangle], [SHEET_MATERIAL]);

    expect(summary.find((item) => item.key === `mat:${SHEET_MATERIAL.id}`)).toMatchObject({
      kind: "area",
      totalAreaMm2: 720000,
    });
    expect(summary.find((item) => item.key === "dim:rectangle")).toMatchObject({
      label: "Rectangle",
      kind: "area",
      totalAreaMm2: 500000,
    });
  });

  it("plans sheet cuts into raw boards with kerf", () => {
    const material = { ...SHEET_MATERIAL, defaultSize: { x: 2000, y: 600, z: 18 } };
    const parts = [
      { ...createObjectPart(0, { objectType: "sheet", profileId: "osb3-18", size: { x: 1000, y: 600, z: 18 } }), name: "Panel A", materialId: material.id },
      { ...createObjectPart(1, { objectType: "sheet", profileId: "osb3-18", size: { x: 997, y: 600, z: 18 } }), name: "Panel B", materialId: material.id },
      { ...createObjectPart(2, { objectType: "sheet", profileId: "osb3-18", size: { x: 500, y: 300, z: 18 } }), name: "Panel C", materialId: material.id },
    ];

    const summary = getMaterialUsageSummary(parts, [material], 3);

    expect(summary[0].panelPlan?.rawWidthMm).toBe(2000);
    expect(summary[0].panelPlan?.rawHeightMm).toBe(600);
    expect(summary[0].panelPlan?.stockCount).toBe(2);
    expect(summary[0].panelPlan?.stock[0].shelves[0].cuts.map((cut) => cut.partName)).toEqual(["Panel A", "Panel B"]);
    expect(summary[0].panelPlan?.stock[1].shelves[0].cuts.map((cut) => cut.partName)).toEqual(["Panel C"]);
  });

  it("flags oversized sheet cuts and keeps them out of sheet packing", () => {
    const material = { ...SHEET_MATERIAL, defaultSize: { x: 2000, y: 600, z: 18 } };
    const parts = [
      { ...createObjectPart(0, { objectType: "sheet", profileId: "osb3-18", size: { x: 2100, y: 600, z: 18 } }), name: "Too Long", materialId: material.id },
      { ...createObjectPart(1, { objectType: "sheet", profileId: "osb3-18", size: { x: 500, y: 300, z: 18 } }), name: "Small", materialId: material.id },
    ];

    const summary = getMaterialUsageSummary(parts, [material], 3);

    expect(summary[0].panelPlan?.oversizePartIds).toEqual([parts[0].id]);
    expect(summary[0].panelPlan?.stockCount).toBe(1);
    expect(summary[0].panelPlan?.stock[0].shelves[0].cuts.map((cut) => cut.partName)).toEqual(["Small"]);
  });

  it("plans linear cuts into the required number of raw stock pieces with kerf", () => {
    const parts = Array.from({ length: 10 }, (_, index) => ({
      ...createObjectPart(index, { objectType: "timber", profileId: "timber-100x100", size: { x: 300, y: 100, z: 100 } }),
      name: `Cut ${index + 1}`,
      materialId: TIMBER_60_MATERIAL.id,
    }));

    const summary = getMaterialUsageSummary(parts, [TIMBER_60_MATERIAL], 3);

    expect(summary[0].cutPlan?.rawStockLengthMm).toBe(2000);
    expect(summary[0].cutPlan?.stockCount).toBe(2);
    expect(summary[0].cutPlan?.stock[0].cuts).toHaveLength(6);
    expect(summary[0].cutPlan?.stock[0].usedLengthMm).toBe(1815);
  });

  it("handles exact linear stock fits with and without kerf", () => {
    const parts = [
      { ...createObjectPart(0, { objectType: "timber", profileId: "timber-100x100", size: { x: 1000, y: 100, z: 100 } }), materialId: TIMBER_MATERIAL.id },
      { ...createObjectPart(1, { objectType: "timber", profileId: "timber-100x100", size: { x: 1000, y: 100, z: 100 } }), materialId: TIMBER_MATERIAL.id },
    ];

    const noKerf = getMaterialUsageSummary(parts, [{ ...TIMBER_MATERIAL, defaultSize: { x: 2000, y: 100, z: 100 } }], 0);
    const withKerf = getMaterialUsageSummary(parts, [{ ...TIMBER_MATERIAL, defaultSize: { x: 2003, y: 100, z: 100 } }], 3);

    expect(noKerf[0].cutPlan?.stock).toMatchObject([{ usedLengthMm: 2000, leftoverLengthMm: 0 }]);
    expect(withKerf[0].cutPlan?.stock).toMatchObject([{ usedLengthMm: 2003, leftoverLengthMm: 0 }]);
  });

  it("packs longest cuts first deterministically", () => {
    const parts = [
      { ...createObjectPart(0, { objectType: "timber", profileId: "timber-100x100", size: { x: 300, y: 100, z: 100 } }), name: "Short", materialId: TIMBER_60_MATERIAL.id },
      { ...createObjectPart(1, { objectType: "timber", profileId: "timber-100x100", size: { x: 900, y: 100, z: 100 } }), name: "Long", materialId: TIMBER_60_MATERIAL.id },
      { ...createObjectPart(2, { objectType: "timber", profileId: "timber-100x100", size: { x: 700, y: 100, z: 100 } }), name: "Mid", materialId: TIMBER_60_MATERIAL.id },
    ];

    const summary = getMaterialUsageSummary(parts, [TIMBER_60_MATERIAL], 0);

    expect(summary[0].cutPlan?.stock[0].cuts.map((cut) => cut.partName)).toEqual(["Long", "Mid", "Short"]);
  });

  it("flags oversized cuts and keeps them out of stock packing", () => {
    const parts = [
      { ...createObjectPart(0, { objectType: "timber", profileId: "timber-100x100", size: { x: 2100, y: 100, z: 100 } }), materialId: TIMBER_60_MATERIAL.id },
      { ...createObjectPart(1, { objectType: "timber", profileId: "timber-100x100", size: { x: 500, y: 100, z: 100 } }), materialId: TIMBER_60_MATERIAL.id },
    ];

    const summary = getMaterialUsageSummary(parts, [TIMBER_60_MATERIAL], 3);

    expect(summary[0].cutPlan?.oversizePartIds).toEqual([parts[0].id]);
    expect(summary[0].cutPlan?.stockCount).toBe(1);
    expect(summary[0].cutPlan?.stock[0].cuts.map((cut) => cut.partId)).toEqual([parts[1].id]);
  });

  it("plans different materials independently", () => {
    const parts = [
      { ...createObjectPart(0, { objectType: "timber", profileId: "timber-100x100", size: { x: 1200, y: 100, z: 100 } }), materialId: TIMBER_MATERIAL.id },
      { ...createObjectPart(1, { objectType: "timber", profileId: "timber-60x80", size: { x: 1200, y: 60, z: 80 } }), materialId: TIMBER_60_MATERIAL.id },
    ];

    const summary = getMaterialUsageSummary(parts, [TIMBER_MATERIAL, TIMBER_60_MATERIAL], 3);

    expect(summary).toHaveLength(2);
    expect(summary.every((item) => item.cutPlan?.stockCount === 1)).toBe(true);
  });

  it("keeps already handled parts out of cutting stock while reporting status counts", () => {
    const planned = {
      ...createObjectPart(0, { objectType: "timber", profileId: "timber-100x100", size: { x: 1200, y: 100, z: 100 } }),
      name: "Planned cut",
      materialId: TIMBER_60_MATERIAL.id,
      buildStatusId: "planned",
    };
    const prepared = {
      ...createObjectPart(1, { objectType: "timber", profileId: "timber-100x100", size: { x: 1200, y: 100, z: 100 } }),
      name: "Prepared cut",
      materialId: TIMBER_60_MATERIAL.id,
      buildStatusId: "material-ready",
    };
    const installed = {
      ...createObjectPart(2, { objectType: "timber", profileId: "timber-100x100", size: { x: 1200, y: 100, z: 100 } }),
      name: "Installed cut",
      materialId: TIMBER_60_MATERIAL.id,
      buildStatusId: "installed",
    };

    const summary = getMaterialUsageSummary([planned, prepared, installed], [TIMBER_60_MATERIAL], 3, {
      buildStatuses: DEFAULT_BUILD_STATUSES,
    });

    expect(summary[0].count).toBe(3);
    expect(summary[0].plannedPartIds).toEqual([planned.id]);
    expect(summary[0].handledPartIds).toEqual([prepared.id, installed.id]);
    expect(summary[0].totalLengthMm).toBe(3600);
    expect(summary[0].plannedLengthMm).toBe(1200);
    expect(summary[0].statusCounts).toMatchObject({ planned: 1, "material-ready": 1, installed: 1 });
    expect(summary[0].cutPlan?.stockCount).toBe(1);
    expect(summary[0].cutPlan?.stock[0].cuts.map((cut) => cut.partName)).toEqual(["Planned cut"]);
  });
});
