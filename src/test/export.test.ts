import { describe, expect, it } from "vitest";
import {
  createGltfFilename,
  createStlFilename,
  createWeb3dFilename,
  exportProjectToGltf,
  exportProjectToStl,
} from "../lib/export";
import { DEFAULT_BUILD_STATUSES, createObjectPart, PROJECT_SCHEMA_VERSION } from "../lib/project";
import type { ProjectDocument } from "../types/model";

describe("3D export", () => {
  function expectVectorToBeClose(actual: number[], expected: number[]) {
    expect(actual).toHaveLength(expected.length);
    expected.forEach((value, index) => {
      expect(actual[index]).toBeCloseTo(value, 6);
    });
  }

  function getNodePosition(node: { translation?: number[]; matrix?: number[] }) {
    return node.translation ?? node.matrix?.slice(12, 15) ?? [];
  }

  it("exports anchored objects as ASCII STL", () => {
    const project: ProjectDocument = {
      id: "project-1",
      name: "Workbench Prototype",
      version: PROJECT_SCHEMA_VERSION,
      unitPreference: "metric-mm",
      snapSettings: {
        enabled: true,
        moveIncrement: 10,
        resizeIncrement: 5,
        rotateIncrementDeg: 15,
      },
      gridSettings: { size: 6000, originX: 0, originZ: 0 },
      cutSettings: { kerfMm: 3 },
      buildStatuses: DEFAULT_BUILD_STATUSES,
      cameraState: {
        position: { x: 1000, y: 800, z: 1000 },
        target: { x: 0, y: 0, z: 0 },
      },
      variables: [],
      groups: [],
      measurements: [],
      materialGroups: [],
      materials: [],
      parts: [
        createObjectPart(0, {
          objectType: "timber",
          profileId: "timber-100x100",
          size: { x: 100, y: 50, z: 25 },
          position: { x: 0, y: 0, z: 0 },
        }),
      ],
      createdAt: "2026-04-13T00:00:00.000Z",
      updatedAt: "2026-04-13T00:00:00.000Z",
    };

    const stl = exportProjectToStl(project);

    expect(stl.startsWith("solid exported")).toBe(true);
    expect(stl).toContain("facet normal");
    expect(stl).toContain("vertex 0 0 0");
    expect(stl).toContain("vertex 100 50 25");
  });

  it("builds a clean download filename from the project name", () => {
    const project = { name: "Garden Shelf / Draft 1" } as ProjectDocument;
    expect(createStlFilename(project)).toBe("garden-shelf-draft-1.stl");
    expect(createGltfFilename(project)).toBe("garden-shelf-draft-1.gltf");
    expect(createWeb3dFilename(project)).toMatch(/^\d{10}_garden-shelf-draft-1\.web3d$/);
  });

  it("exports glTF with complete Web3D project metadata", async () => {
    const project: ProjectDocument = {
      id: "project-1",
      name: "Grouped Workbench",
      version: PROJECT_SCHEMA_VERSION,
      unitPreference: "metric-mm",
      snapSettings: {
        enabled: true,
        moveIncrement: 10,
        resizeIncrement: 5,
        rotateIncrementDeg: 15,
      },
      gridSettings: { size: 6000, originX: 0, originZ: 0 },
      cutSettings: { kerfMm: 3 },
      buildStatuses: DEFAULT_BUILD_STATUSES,
      cameraState: {
        position: { x: 1000, y: 800, z: 1000 },
        target: { x: 0, y: 0, z: 0 },
      },
      variables: [],
      groups: [{ id: "group-1", name: "Frame", parentGroupId: null }],
      measurements: [
        {
          id: "measure-1",
          name: "Opening Width",
          groupId: "group-1",
          start: { x: 0, y: 0, z: 0 },
          end: { x: 100, y: 0, z: 0 },
          color: "#276f9f",
        },
      ],
      materialGroups: [],
      materials: [],
      parts: [
        {
          ...createObjectPart(0, {
            objectType: "timber",
            profileId: "timber-100x100",
            size: { x: 100, y: 50, z: 25 },
            position: { x: 0, y: 0, z: 0 },
          }),
          id: "part-1",
          groupId: "group-1",
        },
      ],
      createdAt: "2026-04-13T00:00:00.000Z",
      updatedAt: "2026-04-13T00:00:00.000Z",
    };

    const gltf = JSON.parse(await exportProjectToGltf(project));

    expect(gltf.asset.version).toBe("2.0");
    expect(gltf.extras.web3dProjectDocument).toMatchObject({
      id: "project-1",
      groups: [{ id: "group-1", name: "Frame", parentGroupId: null }],
      measurements: [{ id: "measure-1", name: "Opening Width", groupId: "group-1" }],
      parts: [{ id: "part-1", groupId: "group-1", objectType: "timber" }],
    });
    expect(JSON.stringify(gltf.nodes)).toContain("Frame");
  });

  it("exports glTF scene geometry in meters while preserving Web3D millimeter metadata", async () => {
    const project: ProjectDocument = {
      id: "project-1",
      name: "Metric Export",
      version: PROJECT_SCHEMA_VERSION,
      unitPreference: "metric-mm",
      snapSettings: {
        enabled: true,
        moveIncrement: 10,
        resizeIncrement: 5,
        rotateIncrementDeg: 15,
      },
      gridSettings: { size: 6000, originX: 0, originZ: 0 },
      cutSettings: { kerfMm: 3 },
      buildStatuses: DEFAULT_BUILD_STATUSES,
      cameraState: {
        position: { x: 1000, y: 800, z: 1000 },
        target: { x: 0, y: 0, z: 0 },
      },
      variables: [],
      groups: [],
      measurements: [],
      materialGroups: [],
      materials: [],
      parts: [
        {
          ...createObjectPart(0, {
            objectType: "timber",
            profileId: "timber-100x100",
            size: { x: 2000, y: 2200, z: 860 },
            position: { x: 1000, y: 0, z: 500 },
          }),
          id: "part-1",
          name: "Metric Beam",
        },
      ],
      createdAt: "2026-04-13T00:00:00.000Z",
      updatedAt: "2026-04-13T00:00:00.000Z",
    };

    const gltf = JSON.parse(await exportProjectToGltf(project));
    const partNode = gltf.nodes.find((node: { name?: string }) => node.name === "Metric Beam");
    const meshNode = gltf.nodes.find((node: { name?: string }) => node.name === "Metric Beam Mesh");
    const positionAccessor =
      gltf.accessors[gltf.meshes[meshNode.mesh].primitives[0].attributes.POSITION];

    expect(gltf.extras.units).toEqual({
      length: "meter",
      sourceLength: "millimeter",
      sourceToExportScale: 0.001,
    });
    expectVectorToBeClose(getNodePosition(partNode), [1, 0, 0.5]);
    expectVectorToBeClose(getNodePosition(meshNode), [1, 1.1, 0.43]);
    expectVectorToBeClose(positionAccessor.min, [-1, -1.1, -0.43]);
    expectVectorToBeClose(positionAccessor.max, [1, 1.1, 0.43]);
    expect(gltf.extras.web3dProjectDocument.parts[0].size).toEqual({ x: 2000, y: 2200, z: 860 });
  });
});
