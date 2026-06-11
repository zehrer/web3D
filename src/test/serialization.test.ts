import { describe, expect, it } from "vitest";
import { DEFAULT_BUILD_STATUS_ID, DEFAULT_BUILD_STATUSES, PROJECT_SCHEMA_VERSION, createDemoProject, createProject } from "../lib/project";
import { deserializeProject, deserializeProjectFile, serializeProject, serializeProjectFile } from "../lib/serialization";

describe("project serialization", () => {
  it("round-trips a project document", () => {
    const project = createDemoProject();
    const payload = serializeProject(project);
    const parsed = deserializeProject(payload);

    expect(parsed.id).toBe(project.id);
    expect(parsed.name).toBe(project.name);
    expect(parsed.groups).toHaveLength(project.groups.length);
    expect(parsed.parts).toHaveLength(project.parts.length);
    expect(parsed.parts[0].size.x).toBe(project.parts[0].size.x);
    expect(parsed.parts[0].groupId).toBe(project.parts[0].groupId);
    expect(parsed.measurements).toEqual(project.measurements);
    expect(parsed.groups.some((group) => group.name === "Shed")).toBe(true);
    expect(parsed.parts).toHaveLength(162);
    expect(parsed.parts.some((part) => part.objectType === "timber")).toBe(true);
    expect(parsed.parts.some((part) => part.objectType === "glass")).toBe(true);
    expect(parsed.parts.some((part) => part.objectType === "rectangle")).toBe(true);
  });

  it("migrates legacy thickness-based projects into sheet objects", () => {
    const payload = JSON.stringify({
      id: "legacy-project",
      name: "Legacy",
      version: 1,
      unitPreference: "metric-cm",
      snapSettings: { enabled: true, moveIncrement: 10, resizeIncrement: 5, rotateIncrementDeg: 15 },
      cameraState: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } },
      parts: [
        {
          id: "legacy-part",
          name: "OSB Panel",
          size: { x: 1200, y: 600, z: 18 },
          position: { x: 0, y: 150, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          thicknessPreset: "sheet-18mm",
        },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const parsed = deserializeProject(payload);

    expect(parsed.version).toBe(PROJECT_SCHEMA_VERSION);
    expect(parsed.groups).toEqual([]);
    expect(parsed.measurements).toEqual([]);
    expect(parsed.parts[0].groupId).toBeNull();
    expect(parsed.parts[0].objectType).toBe("sheet");
    expect(parsed.parts[0].thicknessMm).toBe(18);
    expect(parsed.parts[0].lockedAxes).toEqual({ z: true });
    expect(parsed.gridSettings).toBeDefined();
    expect(parsed.cutSettings).toEqual({ kerfMm: 3 });
  });

  it("migrates v2 object projects into grouped-capable projects", () => {
    const project = createProject("V2");
    const payload = JSON.stringify({
      ...project,
      version: 2,
      parts: project.parts.map(({ groupId: _groupId, ...part }) => part),
      groups: undefined,
    });

    const parsed = deserializeProject(payload);

    expect(parsed.version).toBe(PROJECT_SCHEMA_VERSION);
    expect(parsed.groups).toEqual([]);
    expect(parsed.measurements).toEqual([]);
    expect(parsed.parts.every((part) => part.groupId === null)).toBe(true);
    expect(parsed.gridSettings).toBeDefined();
  });

  it("migrates v3 grouped projects into measurement-capable projects", () => {
    const project = createProject("V3");
    const payload = JSON.stringify({
      ...project,
      version: 3,
      measurements: undefined,
    });

    const parsed = deserializeProject(payload);

    expect(parsed.version).toBe(PROJECT_SCHEMA_VERSION);
    expect(parsed.measurements).toEqual([]);
    expect(parsed.groups).toHaveLength(project.groups.length);
    expect(parsed.gridSettings).toBeDefined();
  });

  it("migrates v5 projects by adding gridSettings", () => {
    const project = createProject("V5");
    const payload = JSON.stringify({ ...project, version: 5, gridSettings: undefined });

    const parsed = deserializeProject(payload);

    expect(parsed.version).toBe(PROJECT_SCHEMA_VERSION);
    expect(parsed.gridSettings).toEqual({ size: 6000, originX: 0, originZ: 0 });
  });

  it("migrates v8 projects by dropping profileId from parts and materials", () => {
    const project = createProject("V8");
    const v8MaterialId = "mat-x";
    const legacyMaterial = {
      id: v8MaterialId,
      name: "Test Material",
      groupId: null,
      objectType: "timber" as const,
      profileId: "timber-100x100" as const,
      color: "#a77b4e",
      defaultSize: { x: 2500, y: 100, z: 100 },
      crossSectionWidthMm: 100,
      crossSectionHeightMm: 100,
    };
    const legacyPart = {
      id: "p-x",
      name: "Beam",
      objectType: "timber" as const,
      profileId: "timber-100x100" as const,
      groupId: null,
      materialId: v8MaterialId,
      size: { x: 2500, y: 100, z: 100 },
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      color: "#a77b4e",
      crossSectionWidthMm: 100,
      crossSectionHeightMm: 100,
    };
    const payload = JSON.stringify({ ...project, version: 8, parts: [legacyPart], materials: [legacyMaterial] });

    const parsed = deserializeProject(payload);

    expect(parsed.version).toBe(PROJECT_SCHEMA_VERSION);
    expect("profileId" in parsed.parts[0]).toBe(false);
    expect("profileId" in parsed.materials[0]).toBe(false);
    // Geometry-driving fields survive the migration.
    expect(parsed.parts[0].crossSectionWidthMm).toBe(100);
    expect(parsed.parts[0].lockedAxes).toEqual({ y: true, z: true });
    expect(parsed.materials[0].defaultSize).toEqual({ x: 2500, y: 100, z: 100 });
    expect(parsed.materials[0].lockedAxes).toEqual({ y: true, z: true });
    expect(parsed.parts[0].materialId).toBe(v8MaterialId);
  });

  it("migrates v10 projects by adding cut settings", () => {
    const project = createProject("V10");
    const payload = JSON.stringify({ ...project, version: 10, cutSettings: undefined });

    const parsed = deserializeProject(payload);

    expect(parsed.version).toBe(PROJECT_SCHEMA_VERSION);
    expect(parsed.cutSettings).toEqual({ kerfMm: 3 });
  });

  it("round-trips project cut settings", () => {
    const project = createProject("Cut Settings");
    project.cutSettings = { kerfMm: 4.2 };

    const parsed = deserializeProject(serializeProject(project));

    expect(parsed.cutSettings).toEqual({ kerfMm: 4.2 });
  });

  it("migrates v12 projects by adding build statuses", () => {
    const project = createProject("V12");
    const payload = JSON.stringify({
      ...project,
      version: 12,
      buildStatuses: undefined,
      parts: project.parts.map(({ buildStatusId: _buildStatusId, ...part }) => part),
    });

    const parsed = deserializeProject(payload);

    expect(parsed.version).toBe(PROJECT_SCHEMA_VERSION);
    expect(parsed.buildStatuses).toEqual(DEFAULT_BUILD_STATUSES);
    expect(parsed.parts.every((part) => part.buildStatusId === DEFAULT_BUILD_STATUS_ID)).toBe(true);
  });

  it("migrates v13 projects by adding sequential build order", () => {
    const project = createDemoProject();
    const payload = JSON.stringify({
      ...project,
      version: 13,
      parts: project.parts.map(({ buildOrder: _buildOrder, ...part }) => part),
    });

    const parsed = deserializeProject(payload);

    expect(parsed.version).toBe(PROJECT_SCHEMA_VERSION);
    expect(parsed.parts.slice(0, 3).map((part) => part.buildOrder)).toEqual([1, 2, 3]);
  });

  it("migrates v7 projects by populating defaultSize and lock fields on materials", () => {
    const project = createProject("V7");
    const legacyMaterials = [
      {
        id: "lm-timber", name: "Timber 100×100", groupId: null,
        objectType: "timber" as const, profileId: "timber-100x100" as const,
        color: "#a77b4e",
        defaultSize: { x: 2200 }, // partial — only overrides length
      },
      {
        id: "lm-sheet", name: "OSB 18 mm", groupId: null,
        objectType: "sheet" as const, profileId: "osb3-18" as const,
        color: "#caa165",
        // no defaultSize override at all
      },
    ];
    const payload = JSON.stringify({ ...project, version: 7, materials: legacyMaterials });

    const parsed = deserializeProject(payload);

    expect(parsed.version).toBe(PROJECT_SCHEMA_VERSION);
    const timber = parsed.materials.find((m) => m.id === "lm-timber")!;
    expect(timber.defaultSize).toEqual({ x: 2200, y: 100, z: 100 });
    expect(timber.crossSectionWidthMm).toBe(100);
    expect(timber.crossSectionHeightMm).toBe(100);
    expect(timber.lockedAxes).toEqual({ y: true, z: true });
    const sheet = parsed.materials.find((m) => m.id === "lm-sheet")!;
    expect(sheet.defaultSize).toEqual({ x: 1200, y: 600, z: 18 });
    expect(sheet.thicknessMm).toBe(18);
    expect(sheet.lockedAxes).toEqual({ z: true });
  });

  it("migrates v6 projects by populating cross-section lock fields on parts", () => {
    const project = createProject("V6");
    const timberPart = {
      id: "p1", name: "Beam", objectType: "timber" as const, profileId: "timber-100x100" as const,
      groupId: null, materialId: null, color: "#a77b4e",
      size: { x: 2000, y: 100, z: 100 },
      position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    };
    const sheetPart = {
      id: "p2", name: "Panel", objectType: "sheet" as const, profileId: "osb3-18" as const,
      groupId: null, materialId: null, color: "#caa165",
      size: { x: 1200, y: 600, z: 18 },
      position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    };
    const payload = JSON.stringify({ ...project, version: 6, parts: [timberPart, sheetPart] });

    const parsed = deserializeProject(payload);

    expect(parsed.version).toBe(PROJECT_SCHEMA_VERSION);
    expect(parsed.parts[0].crossSectionWidthMm).toBe(100);
    expect(parsed.parts[0].crossSectionHeightMm).toBe(100);
    expect(parsed.parts[0].lockedAxes).toEqual({ y: true, z: true });
    expect(parsed.parts[0].thicknessMm).toBeUndefined();
    expect(parsed.parts[1].thicknessMm).toBe(18);
    expect(parsed.parts[1].lockedAxes).toEqual({ z: true });
    expect(parsed.parts[1].crossSectionWidthMm).toBeUndefined();
  });

  it("round-trips native Web3D project files with group and object names", () => {
    const project = createProject("Exported Project");
    const group = { id: "group-1", name: "Custom Folder", parentGroupId: null };
    const part = {
      id: "part-1",
      name: "Custom Timber",
      objectType: "timber" as const,
      profileId: "timber-100x100" as const,
      groupId: group.id,
      materialId: null,
      buildStatusId: DEFAULT_BUILD_STATUS_ID,
      buildOrder: 1,
      size: { x: 100, y: 100, z: 2500 },
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      color: "#a77b4e",
    };
    project.groups.push(group);
    project.parts.push(part);
    project.measurements.push({
      id: "measure-1",
      name: "Custom Measure",
      groupId: group.id,
      start: { x: 0, y: 0, z: 0 },
      end: { x: 300, y: 0, z: 400 },
      color: "#276f9f",
    });

    const parsed = deserializeProjectFile(serializeProjectFile(project));

    expect(parsed.name).toBe("Exported Project");
    expect(parsed.groups[0]).toMatchObject({ id: group.id, name: "Custom Folder" });
    expect(parsed.parts[0]).toMatchObject({ id: part.id, name: "Custom Timber", groupId: group.id });
    expect(parsed.measurements.find((m) => m.id === "measure-1")).toMatchObject({
      id: "measure-1",
      name: "Custom Measure",
      groupId: group.id,
    });
    expect(parsed.snapSettings).toEqual(project.snapSettings);
    expect(parsed.cameraState).toEqual(project.cameraState);
  });

  it("imports Web3D project data embedded in glTF extras", () => {
    const project = createProject("Embedded Project");
    const group = { id: "group-embed", name: "Embedded Folder", parentGroupId: null };
    const part = {
      id: "part-embed",
      name: "Embedded Object",
      objectType: "timber" as const,
      profileId: "timber-100x100" as const,
      groupId: null,
      materialId: null,
      buildStatusId: DEFAULT_BUILD_STATUS_ID,
      buildOrder: 1,
      size: { x: 100, y: 100, z: 2500 },
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      color: "#a77b4e",
    };
    project.groups.push(group);
    project.parts.push(part);
    project.measurements.push({
      id: "embedded-measure",
      name: "Embedded Measure",
      groupId: group.id,
      start: { x: 0, y: 0, z: 0 },
      end: { x: 100, y: 0, z: 0 },
      color: "#276f9f",
    });
    const payload = JSON.stringify({
      asset: { version: "2.0" },
      extras: { web3dProjectDocument: project },
    });

    const parsed = deserializeProjectFile(payload);

    expect(parsed.name).toBe("Embedded Project");
    expect(parsed.groups[0].name).toBe("Embedded Folder");
    expect(parsed.parts[0].name).toBe("Embedded Object");
    expect(parsed.measurements.find((m) => m.id === "embedded-measure")?.name).toBe("Embedded Measure");
  });
});
