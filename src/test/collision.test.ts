import { describe, expect, it } from "vitest";
import { findOverlappingParts, getPartMaterialChangeOverlaps, partsOverlap } from "../lib/collision";
import { DEFAULT_BUILD_STATUS_ID, createInitialMaterials, createProject } from "../lib/project";
import type { PartNode, Vector3Like } from "../types/model";

function vector(x = 0, y = 0, z = 0): Vector3Like {
  return { x, y, z };
}

function box(id: string, position: Vector3Like, size: Vector3Like, rotation = vector()): PartNode {
  return {
    id,
    name: id,
    objectType: "cube",
    groupId: null,
    materialId: null,
    buildStatusId: DEFAULT_BUILD_STATUS_ID,
    size,
    position,
    rotation,
    color: "#888888",
  };
}

describe("collision detection", () => {
  it("detects volume overlap between axis-aligned parts", () => {
    expect(partsOverlap(box("a", vector(0, 0, 0), vector(100, 100, 100)), box("b", vector(50, 0, 0), vector(100, 100, 100)))).toBe(true);
  });

  it("does not count touching faces as overlap", () => {
    expect(partsOverlap(box("a", vector(0, 0, 0), vector(100, 100, 100)), box("b", vector(100, 0, 0), vector(100, 100, 100)))).toBe(false);
  });

  it("detects overlap for rotated parts", () => {
    const rotated = box("a", vector(0, 0, 0), vector(200, 80, 80), vector(0, 0, Math.PI / 4));
    const neighbor = box("b", vector(70, 70, 0), vector(80, 80, 80));

    expect(partsOverlap(rotated, neighbor)).toBe(true);
  });

  it("returns the neighboring parts overlapped by a candidate", () => {
    const candidate = box("candidate", vector(0, 0, 0), vector(100, 100, 100));
    const overlapping = box("overlapping", vector(90, 0, 0), vector(50, 100, 100));
    const clear = box("clear", vector(200, 0, 0), vector(50, 100, 100));

    expect(findOverlappingParts(candidate, [candidate, overlapping, clear]).map((part) => part.id)).toEqual(["overlapping"]);
  });

  it("projects a material change before checking overlaps", () => {
    const project = createProject();
    const { materials } = createInitialMaterials();
    const smallMaterial = materials.find((material) => material.objectType === "timber" && material.name === "56 x 56 mm")!;
    const largeMaterial = materials.find((material) => material.objectType === "timber" && material.name === "120 x 120 mm")!;
    const timber = box("timber", vector(0, 0, 0), vector(1000, 56, 56));
    const neighbor = box("neighbor", vector(0, 80, 0), vector(1000, 40, 40));

    timber.objectType = "timber";
    timber.materialId = smallMaterial.id;
    timber.crossSectionWidthMm = smallMaterial.crossSectionWidthMm;
    timber.crossSectionHeightMm = smallMaterial.crossSectionHeightMm;
    neighbor.objectType = "timber";
    project.parts = [timber, neighbor];
    const result = getPartMaterialChangeOverlaps(project, materials, timber.id, largeMaterial.id);

    expect(result?.candidate.size).toEqual({ x: 1000, y: 120, z: 120 });
    expect(result?.overlaps.map((part) => part.id)).toEqual(["neighbor"]);
  });
});
