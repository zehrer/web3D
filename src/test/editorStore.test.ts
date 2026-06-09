import { describe, expect, it } from "vitest";
import { DEFAULT_BUILD_STATUS_ID, createInitialMaterials, createProject } from "../lib/project";
import { createEditorStore } from "../store/editorStore";

function createProjectWithProjectMaterials(name?: string) {
  const project = createProject(name);
  const { materialGroups, materials } = createInitialMaterials();
  return { ...project, materialGroups, materials };
}

describe("editor store", () => {
  it("adds, duplicates, and deletes objects", () => {
    const store = createEditorStore();
    const project = createProject();
    const initialCount = project.parts.length;
    store.getState().hydrateProject(project);

    store.getState().addObject("sheet");
    expect(store.getState().project.parts).toHaveLength(initialCount + 1);
    expect(store.getState().project.parts.at(-1)?.objectType).toBe("sheet");
    expect(store.getState().project.parts.at(-1)?.position).toEqual({ x: 0, y: 0, z: 0 });

    const selectedPartId = store.getState().selectedPartId;
    expect(selectedPartId).toBeTruthy();

    store.getState().duplicateSelectedPart();
    expect(store.getState().project.parts).toHaveLength(initialCount + 2);
    expect(store.getState().project.parts.at(-1)?.position).toEqual({ x: 10, y: 0, z: 0 });

    store.getState().deleteSelectedPart();
    expect(store.getState().project.parts).toHaveLength(initialCount + 1);
  });

  it("supports undo and redo around geometry edits", () => {
    const store = createEditorStore();
    store.getState().hydrateProject(createProjectWithProjectMaterials());
    store.getState().addObject("sheet");

    const selectedPartId = store.getState().project.parts[0].id;
    const originalSizeX = store.getState().project.parts[0].size.x;
    store.getState().selectPart(selectedPartId);
    store.getState().setPartGeometry(selectedPartId, { size: { x: 700, y: 300, z: 18 } });
    expect(store.getState().project.parts[0].size.x).toBe(700);

    store.getState().undo();
    expect(store.getState().project.parts[0].size.x).toBe(originalSizeX);

    store.getState().redo();
    expect(store.getState().project.parts[0].size.x).toBe(700);
  });

  it("supports undo and redo around cut setting edits", () => {
    const store = createEditorStore();
    store.getState().hydrateProject(createProject());

    store.getState().updateCutSettings({ kerfMm: 5 });
    expect(store.getState().project.cutSettings.kerfMm).toBe(5);

    store.getState().undo();
    expect(store.getState().project.cutSettings.kerfMm).toBe(3);

    store.getState().redo();
    expect(store.getState().project.cutSettings.kerfMm).toBe(5);
  });

  it("creates timber objects with fixed cross-sections and editable length", () => {
    const store = createEditorStore();
    store.getState().hydrateProject(createProjectWithProjectMaterials());

    store.getState().addObject("timber", "timber-100x100");
    const timber = store.getState().project.parts.at(-1)!;

    expect(timber.objectType).toBe("timber");
    expect(timber.size.y).toBe(100);
    expect(timber.size.z).toBe(100);

    store.getState().setPartGeometry(timber.id, {
      size: { ...timber.size, x: 1800 },
    });
    expect(store.getState().project.parts.at(-1)?.size.x).toBe(1800);

    const timber120 = store.getState().globalMaterialLibrary.materials.find((m) => m.name === "120 x 120 mm")!;
    store.getState().setPartMaterial(timber.id, timber120.id);
    const updated = store.getState().project.parts.at(-1)!;
    expect(updated.size.x).toBe(1800);
    expect(updated.size.y).toBe(120);
    expect(updated.size.z).toBe(120);
  });

  it("uses editable material dimensions and locks when changing a part material", () => {
    const store = createEditorStore();
    store.getState().hydrateProject(createProjectWithProjectMaterials());

    store.getState().addObject("timber", "timber-100x100");
    const timber = store.getState().project.parts.at(-1)!;
    const material = store.getState().globalMaterialLibrary.materials.find((m) => m.name === "100 x 100 mm")!;

    store.getState().updateGlobalMaterialDefaultSize(material.id, "y", 120);
    store.getState().updateGlobalMaterialDefaultSize(material.id, "z", 80);
    store.getState().renameGlobalMaterial(material.id, "120 x 80 mm");
    store.getState().setPartGeometry(timber.id, { size: { ...timber.size, x: 1900 } });
    store.getState().setPartMaterial(timber.id, material.id);

    const updated = store.getState().project.parts.find((part) => part.id === timber.id)!;
    expect(updated.size).toEqual({ x: 1900, y: 120, z: 80 });
    expect(updated.lockedAxes).toEqual({ y: true, z: true });
    expect(updated.crossSectionWidthMm).toBe(120);
    expect(updated.crossSectionHeightMm).toBe(80);

    store.getState().updateGlobalMaterialAxisLock(material.id, "y", false);
    expect(store.getState().globalMaterialLibrary.materials.find((m) => m.id === material.id)?.lockedAxes).toEqual({ z: true });
  });

  it("keeps used material edits in the single global library without mutating placed dimensions", () => {
    const store = createEditorStore();
    store.getState().hydrateProject(createProjectWithProjectMaterials());

    const material = store.getState().globalMaterialLibrary.materials.find((m) => m.name === "100 x 100 mm")!;
    store.getState().addObjectFromMaterial(material.id);
    const placedPart = store.getState().project.parts.at(-1)!;

    store.getState().renameGlobalMaterial(material.id, "Changed");
    store.getState().updateGlobalMaterialDefaultSize(material.id, "y", 120);
    store.getState().updateGlobalMaterialAxisLock(material.id, "y", false);
    store.getState().updateGlobalMaterialColor(material.id, "#000000");

    const changed = store.getState().globalMaterialLibrary.materials.find((m) => m.id === material.id)!;
    expect(changed.name).toBe("Changed");
    expect(changed.defaultSize.y).toBe(120);
    expect(changed.lockedAxes).toEqual({ z: true });
    expect(changed.color).toBe("#000000");
    expect(store.getState().project.parts.find((part) => part.id === placedPart.id)?.size).toEqual(placedPart.size);
  });

  it("adds global library materials directly without project-local copies", () => {
    const store = createEditorStore();
    store.getState().hydrateProject(createProject());
    const globalMaterial = store.getState().globalMaterialLibrary.materials.find((m) => m.name === "100 x 100 mm")!;
    const globalGroup = store.getState().globalMaterialLibrary.materialGroups.find((g) => g.id === globalMaterial.groupId)!;
    store.getState().hydrateGlobalMaterialLibrary({
      materialGroups: [{ ...globalGroup, id: "global-group" }],
      materials: [{ ...globalMaterial, id: "global-material", groupId: "global-group", name: "Global 100 x 100" }],
    });

    store.getState().addObjectFromGlobalMaterial("global-material");

    expect(store.getState().project.materials).toHaveLength(0);
    expect(store.getState().project.parts.at(-1)?.materialId).toBe("global-material");

    store.getState().addObjectFromGlobalMaterial("global-material");
    expect(store.getState().project.materials).toHaveLength(0);
    expect(store.getState().project.parts.filter((part) => part.materialId === "global-material")).toHaveLength(2);
  });

  it("creates editable global material folders and basic material templates", () => {
    const store = createEditorStore();
    store.getState().hydrateProject(createProject());
    const initialGroupCount = store.getState().globalMaterialLibrary.materialGroups.length;
    const initialMaterialCount = store.getState().globalMaterialLibrary.materials.length;

    store.getState().addGlobalMaterialGroup();
    expect(store.getState().globalMaterialLibrary.materialGroups).toHaveLength(initialGroupCount + 1);
    expect(store.getState().globalMaterialLibrary.materialGroups.at(-1)?.name).toBe(`Folder ${initialGroupCount + 1}`);

    store.getState().createGlobalMaterial("timber");
    const timber = store.getState().globalMaterialLibrary.materials.at(-1)!;
    expect(store.getState().globalMaterialLibrary.materials).toHaveLength(initialMaterialCount + 1);
    expect(timber).toMatchObject({
      name: "New Timber",
      objectType: "timber",
      defaultSize: { x: 2500, y: 100, z: 100 },
      lockedAxes: { y: true, z: true },
    });
    expect(store.getState().selectedMaterialId).toBe(timber.id);

    store.getState().createGlobalMaterial("cube");
    const cube = store.getState().globalMaterialLibrary.materials.at(-1)!;
    expect(cube).toMatchObject({
      name: "New Cube",
      objectType: "cube",
      defaultSize: { x: 500, y: 500, z: 500 },
    });
    expect(cube.lockedAxes).toBeUndefined();
  });

  it("creates rhombus cladding objects with fixed profile and editable length", () => {
    const store = createEditorStore();
    store.getState().hydrateProject(createProjectWithProjectMaterials());

    store.getState().addObject("cladding", "rhombus-19x68");
    const cladding = store.getState().project.parts.at(-1)!;

    expect(cladding.objectType).toBe("cladding");
    expect(cladding.size).toEqual({ x: 2000, y: 68, z: 19 });

    store.getState().setPartGeometry(cladding.id, {
      size: { ...cladding.size, x: 2400 },
    });
    expect(store.getState().project.parts.at(-1)?.size.x).toBe(2400);

    const rhombus27 = store.getState().globalMaterialLibrary.materials.find((m) => m.name === "Rhombus 27 x 68 mm")!;
    store.getState().setPartMaterial(cladding.id, rhombus27.id);
    const updated = store.getState().project.parts.at(-1)!;
    expect(updated.size).toEqual({ x: 2400, y: 68, z: 27 });
  });

  it("creates glass objects as plexiglass panels", () => {
    const store = createEditorStore();
    store.getState().hydrateProject(createProjectWithProjectMaterials());

    store.getState().addObject("glass", "plexiglass-3");
    const glass = store.getState().project.parts.at(-1)!;

    expect(glass.objectType).toBe("glass");
    expect(glass.thicknessMm).toBe(3);
    expect(glass.size).toEqual({ x: 900, y: 600, z: 3 });

    store.getState().setPartGeometry(glass.id, {
      size: { x: 1200, y: 800, z: 3 },
    });
    expect(store.getState().project.parts.at(-1)?.size).toEqual({ x: 1200, y: 800, z: 3 });

    const plexi10 = store.getState().globalMaterialLibrary.materials.find((m) => m.name === "Plexiglass 10 mm")!;
    store.getState().setPartMaterial(glass.id, plexi10.id);
    expect(store.getState().project.parts.at(-1)?.size).toEqual({ x: 1200, y: 800, z: 10 });
  });

  it("creates flat shape objects and keeps them zero thickness", () => {
    const store = createEditorStore();
    store.getState().hydrateProject(createProject());

    store.getState().addObject("rectangle");
    const rectangle = store.getState().project.parts.at(-1)!;
    expect(rectangle.objectType).toBe("rectangle");
    expect(rectangle.size).toEqual({ x: 800, y: 0, z: 500 });

    store.getState().setPartGeometry(rectangle.id, {
      size: { x: 1200, y: 50, z: 700 },
    });
    expect(store.getState().project.parts.at(-1)?.size).toEqual({ x: 1200, y: 0, z: 700 });

    store.getState().addObject("circle");
    const circle = store.getState().project.parts.at(-1)!;
    store.getState().setPartGeometry(circle.id, {
      size: { x: 650, y: 50, z: 300 },
    });
    expect(store.getState().project.parts.at(-1)?.size).toEqual({ x: 650, y: 0, z: 650 });
  });

  it("creates repeated cladding patterns from profile width plus gap", () => {
    const store = createEditorStore();
    store.getState().hydrateProject(createProject());
    const initialCount = store.getState().project.parts.length;

    store.getState().addObject("cladding", "rhombus-19x68");
    const cladding = store.getState().project.parts.at(-1)!;

    store.getState().createCladdingPattern(cladding.id, {
      axis: "y",
      copies: 3,
      gap: 12,
    });

    const copies = store.getState().project.parts.slice(initialCount + 1);
    expect(copies).toHaveLength(3);
    expect(copies.map((part) => part.position)).toEqual([
      { x: 0, y: 80, z: 0 },
      { x: 0, y: 160, z: 0 },
      { x: 0, y: 240, z: 0 },
    ]);
    expect(copies.every((part) => part.objectType === "cladding")).toBe(true);
  });

  it("supports negative cladding pattern gaps for reverse direction", () => {
    const store = createEditorStore();
    store.getState().hydrateProject(createProject());

    store.getState().addObject("cladding", "rhombus-19x68");
    const cladding = store.getState().project.parts.at(-1)!;

    store.getState().createCladdingPattern(cladding.id, {
      axis: "y",
      copies: 2,
      gap: -12,
    });

    const copies = store.getState().project.parts.slice(-2);
    expect(copies.map((part) => part.position)).toEqual([
      { x: 0, y: -80, z: 0 },
      { x: 0, y: -160, z: 0 },
    ]);
  });

  it("applies cladding patterns in rotated local coordinates", () => {
    const store = createEditorStore();
    store.getState().hydrateProject(createProject());

    store.getState().addObject("cladding", "rhombus-19x68");
    const cladding = store.getState().project.parts.at(-1)!;
    store.getState().setPartGeometry(cladding.id, { rotation: { x: 0, y: 0, z: Math.PI / 2 } });

    store.getState().createCladdingPattern(cladding.id, {
      axis: "y",
      copies: 1,
      gap: 12,
    });

    const copy = store.getState().project.parts.at(-1)!;
    expect(copy.position.x).toBeCloseTo(-80);
    expect(copy.position.y).toBeCloseTo(0);
    expect(copy.position.z).toBeCloseTo(0);
  });

  it("commits transient geometry changes as a single undo step", () => {
    const store = createEditorStore();
    const project = createProject();
    store.getState().hydrateProject(project);
    store.getState().addObject("sheet");

    const selectedPartId = store.getState().project.parts[0].id;
    const originalPositionX = store.getState().project.parts[0].position.x;
    const undoLengthBefore = store.getState().undoStack.length;
    const snapshot = JSON.parse(JSON.stringify(store.getState().project));

    store.getState().previewPartGeometry(selectedPartId, {
      position: { x: 100, y: 0, z: 0 },
    });
    store.getState().previewPartGeometry(selectedPartId, {
      position: { x: 200, y: 0, z: 0 },
    });
    store.getState().finalizeTransientChange(snapshot);

    expect(store.getState().project.parts[0].position.x).toBe(200);
    expect(store.getState().undoStack).toHaveLength(undoLengthBefore + 1);

    store.getState().undo();
    expect(store.getState().project.parts[0].position.x).toBe(originalPositionX);
  });

  it("organizes objects in nested groups", () => {
    const store = createEditorStore();
    store.getState().hydrateProject(createProject());
    store.getState().addObject("sheet");
    const partId = store.getState().project.parts[0].id;

    store.getState().addGroup();
    const parentGroup = store.getState().project.groups.at(-1)!;
    store.getState().addGroup(parentGroup.id);
    const childGroup = store.getState().project.groups.at(-1)!;

    expect(childGroup.parentGroupId).toBe(parentGroup.id);

    store.getState().movePartToGroup(partId, childGroup.id);
    expect(store.getState().project.parts[0].groupId).toBe(childGroup.id);

    store.getState().moveGroupToGroup(parentGroup.id, childGroup.id);
    expect(store.getState().project.groups.find((group) => group.id === parentGroup.id)?.parentGroupId).toBeNull();

    store.getState().updateGroupName(childGroup.id, "Door Frame");
    expect(store.getState().project.groups.find((group) => group.id === childGroup.id)?.name).toBe("Door Frame");
  });

  it("adds and organizes measurement objects", () => {
    const store = createEditorStore();
    store.getState().hydrateProject(createProject());
    const initialMeasurementCount = store.getState().project.measurements.length;

    store.getState().addMeasurement({ x: 0, y: 0, z: 0 }, { x: 300, y: 0, z: 400 });
    const measurement = store.getState().project.measurements.at(-1)!;

    expect(measurement.name).toBe(`Measure ${initialMeasurementCount + 1}`);
    expect(store.getState().selectedMeasurementId).toBe(measurement.id);
    expect(store.getState().selectedPartId).toBeNull();

    store.getState().addGroup();
    const group = store.getState().project.groups.at(-1)!;
    store.getState().moveMeasurementToGroup(measurement.id, group.id);
    expect(store.getState().project.measurements.find((item) => item.id === measurement.id)?.groupId).toBe(group.id);

    store.getState().updateMeasurement(measurement.id, (current) => ({
      ...current,
      name: "Shelf Width",
    }));
    expect(store.getState().project.measurements.find((item) => item.id === measurement.id)?.name).toBe("Shelf Width");

    store.getState().deleteSelectedMeasurement();
    expect(store.getState().project.measurements).toHaveLength(initialMeasurementCount);
  });

  it("updates object build status and reassigns deleted statuses to planned", () => {
    const store = createEditorStore();
    store.getState().hydrateProject(createProject());
    store.getState().addObject("cube");
    const partId = store.getState().project.parts[0].id;

    store.getState().addBuildStatus();
    const status = store.getState().project.buildStatuses.at(-1)!;
    store.getState().updateBuildStatus(status.id, { label: "Cut" });
    store.getState().setPartBuildStatus(partId, status.id);

    expect(store.getState().project.parts[0].buildStatusId).toBe(status.id);
    expect(store.getState().project.buildStatuses.at(-1)?.label).toBe("Cut");

    store.getState().deleteBuildStatus(status.id);
    expect(store.getState().project.parts[0].buildStatusId).toBe(DEFAULT_BUILD_STATUS_ID);
  });
});
