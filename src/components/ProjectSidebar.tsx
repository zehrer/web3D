import { useEffect, useState, type DragEvent } from "react";
import { BeamIcon, ChevronDownIcon, ChevronRightIcon, CircleIcon, CladdingIcon, CollapseFoldersIcon, CubeIcon, ExpandFoldersIcon, EyeIcon, EyeOffIcon, FilterIcon, FolderIcon, GlassIcon, PlusIcon, RectangleIcon, RulerIcon, SettingsIcon, SheetIcon, TrashIcon } from "./Icons";
import { DEFAULT_BUILD_STATUS_ID } from "../lib/project";
import { useEditorStore } from "../store/editorStore";
import type { GroupNode, MaterialGroupNode, MaterialNode, MeasurementNode, ObjectType, PartNode } from "../types/model";

type SidebarTab = "objects" | "material" | "variables";
type EditingItem = { kind: "part" | "group" | "measurement"; id: string } | null;
type EditingMaterialItem = { kind: "material" | "materialGroup"; id: string } | null;
type DraggedTreeItem = { kind: "part" | "group" | "measurement"; id: string };
type DropTarget = "root" | string | null;

const TREE_DRAG_MIME = "application/x-web3d-tree-item";

function PartTypeIcon({ objectType }: { objectType: ObjectType }) {
  if (objectType === "sheet") return <SheetIcon width={14} height={14} />;
  if (objectType === "cladding") return <CladdingIcon width={14} height={14} />;
  if (objectType === "glass") return <GlassIcon width={14} height={14} />;
  if (objectType === "rectangle") return <RectangleIcon width={14} height={14} />;
  if (objectType === "circle") return <CircleIcon width={14} height={14} />;
  if (objectType === "cube") return <CubeIcon width={14} height={14} />;
  return <BeamIcon width={14} height={14} />;
}
function isGroupDescendant(groups: GroupNode[], candidateGroupId: string, ancestorGroupId: string): boolean {
  let current = groups.find((group) => group.id === candidateGroupId);
  while (current?.parentGroupId) {
    if (current.parentGroupId === ancestorGroupId) return true;
    current = groups.find((group) => group.id === current?.parentGroupId);
  }
  return false;
}

function MaterialPanel() {
  const project = useEditorStore((state) => state.project);
  const globalMaterialLibrary = useEditorStore((state) => state.globalMaterialLibrary);
  const selectedMaterialId = useEditorStore((state) => state.selectedMaterialId);
  const selectedMaterialSource = useEditorStore((state) => state.selectedMaterialSource);
  const selectMaterial = useEditorStore((state) => state.selectMaterial);
  const renameGlobalMaterial = useEditorStore((state) => state.renameGlobalMaterial);
  const renameGlobalMaterialGroup = useEditorStore((state) => state.renameGlobalMaterialGroup);
  const addGlobalMaterialGroup = useEditorStore((state) => state.addGlobalMaterialGroup);
  const deleteGlobalMaterialGroup = useEditorStore((state) => state.deleteGlobalMaterialGroup);
  const deleteGlobalMaterial = useEditorStore((state) => state.deleteGlobalMaterial);

  const [filterMode, setFilterMode] = useState<"all" | "used">("all");
  const [editingItem, setEditingItem] = useState<EditingMaterialItem>(null);
  const [draftName, setDraftName] = useState("");
  const activeLibrary = {
    materialGroups: globalMaterialLibrary.materialGroups,
    materials: filterMode === "all"
      ? globalMaterialLibrary.materials
      : globalMaterialLibrary.materials.filter((material) => project.parts.some((part) => part.materialId === material.id)),
  };
  const activeSource: "global" = "global";
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set(activeLibrary.materialGroups.map((g) => g.id)));

  useEffect(() => {
    setExpandedGroupIds(new Set(activeLibrary.materialGroups.map((group) => group.id)));
  }, [filterMode, activeLibrary.materialGroups]);

  function commitRename() {
    if (!editingItem) return;
    const name = draftName.trim();
    if (name) {
      if (editingItem.kind === "material") {
        renameGlobalMaterial(editingItem.id, name);
      } else {
        renameGlobalMaterialGroup(editingItem.id, name);
      }
    }
    setEditingItem(null);
    setDraftName("");
  }

  function toggleGroup(groupId: string) {
    setExpandedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function renderNameEditor(kind: "material" | "materialGroup", id: string, name: string) {
    if (editingItem?.kind === kind && editingItem.id === id) {
      return (
        <input
          autoFocus
          className="object-row__name-input"
          type="text"
          value={draftName}
          onBlur={commitRename}
          onChange={(event) => setDraftName(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); commitRename(); }
            if (event.key === "Escape") { event.preventDefault(); setEditingItem(null); setDraftName(""); }
          }}
        />
      );
    }
    return (
      <button
        className="object-row__name-button"
        onClick={(event) => {
          event.stopPropagation();
          setEditingItem({ kind, id });
          setDraftName(name);
        }}
        type="button"
      >
        <strong>{name}</strong>
      </button>
    );
  }

  function renderMaterial(material: MaterialNode, depth: number) {
    const isSelected = material.id === selectedMaterialId && selectedMaterialSource === activeSource;
    const isUsed = project.parts.some((p) => p.materialId === material.id);
    return (
      <div
        key={material.id}
        className={`object-row ${isSelected ? "object-row--selected" : ""}`}
        onClick={() => selectMaterial(isSelected ? null : material.id, activeSource)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectMaterial(isSelected ? null : material.id, activeSource);
          }
        }}
        role="button"
        style={{ paddingLeft: `${0.88 + depth * 1.2}rem` }}
        tabIndex={0}
      >
        <span className="object-row__disclosure object-row__disclosure--placeholder" />
        <span className="object-row__icon">
          <PartTypeIcon objectType={material.objectType} />
        </span>
        <span className="object-row__content">
          {renderNameEditor("material", material.id, material.name)}
        </span>
        {!isUsed ? (
          <button
            aria-label={`Delete ${material.name}`}
            className="object-row__eye"
            onClick={(event) => {
              event.stopPropagation();
              deleteGlobalMaterial(material.id);
            }}
            title="Delete material"
            type="button"
          >
            <TrashIcon width={12} height={12} />
          </button>
        ) : null}
      </div>
    );
  }

  function renderMaterialGroup(group: MaterialGroupNode, depth: number) {
    const children = activeLibrary.materials.filter((m) => m.groupId === group.id);
    const childGroups = activeLibrary.materialGroups.filter((g) => g.parentGroupId === group.id);
    const hasChildren = children.length > 0 || childGroups.length > 0;
    const isExpanded = expandedGroupIds.has(group.id);
    return (
      <div className="object-tree__group" key={group.id}>
        <div
          className="object-row object-row--group"
          style={{ paddingLeft: `${0.88 + depth * 1.2}rem` }}
        >
          {hasChildren ? (
            <button
              aria-label={isExpanded ? `Collapse ${group.name}` : `Expand ${group.name}`}
              className="object-row__disclosure"
              onClick={(event) => { event.stopPropagation(); toggleGroup(group.id); }}
              type="button"
            >
              {isExpanded ? <ChevronDownIcon width={13} height={13} /> : <ChevronRightIcon width={13} height={13} />}
            </button>
          ) : (
            <span className="object-row__disclosure object-row__disclosure--placeholder" />
          )}
          <span className="object-row__icon object-row__icon--group">
            <FolderIcon width={14} height={14} />
          </span>
          <span className="object-row__content">
            {renderNameEditor("materialGroup", group.id, group.name)}
          </span>
          {!hasChildren && filterMode === "all" ? (
            <button
              aria-label={`Delete ${group.name}`}
              className="object-row__eye"
              onClick={(event) => {
                event.stopPropagation();
                deleteGlobalMaterialGroup(group.id);
              }}
              title="Delete empty folder"
              type="button"
            >
              <TrashIcon width={12} height={12} />
            </button>
          ) : null}
        </div>
        {isExpanded ? (
          <>
            {childGroups.map((g) => renderMaterialGroup(g, depth + 1))}
            {children.map((m) => renderMaterial(m, depth + 1))}
          </>
        ) : null}
      </div>
    );
  }

  const rootGroups = activeLibrary.materialGroups.filter((g) => g.parentGroupId === null);
  const ungroupedMaterials = activeLibrary.materials.filter((m) => m.groupId === null);

  return (
    <section className="panel-card browser-card">
      <div className="browser-card__header">
        <div>
          <span className="panel-card__title">Material</span>
          <p className="browser-card__subtitle">
            {filterMode === "all" ? `${globalMaterialLibrary.materials.length} global materials` : `${activeLibrary.materials.length} used in project`}
          </p>
        </div>
        <div className="browser-card__header-actions">
          <button
            aria-label="Create material folder"
            className="browser-card__header-action"
            onClick={() => {
              setFilterMode("all");
              addGlobalMaterialGroup();
            }}
            title="Create material folder"
            type="button"
          >
            <FolderIcon width={16} height={16} />
          </button>
          <button
            aria-label={filterMode === "all" ? "Show used materials" : "Show all materials"}
            className={`browser-card__header-action ${filterMode === "used" ? "browser-card__header-action--active" : ""}`}
            onClick={() => {
              setEditingItem(null);
              setFilterMode((mode) => (mode === "all" ? "used" : "all"));
            }}
            title={filterMode === "all" ? "Show only materials used in this project" : "Show global material library"}
            type="button"
          >
            <FilterIcon width={16} height={16} />
          </button>
        </div>
      </div>

      <div className="object-browser">
        {rootGroups.length > 0 || ungroupedMaterials.length > 0 ? (
          <>
            {rootGroups.map((g) => renderMaterialGroup(g, 0))}
            {ungroupedMaterials.map((m) => renderMaterial(m, 0))}
          </>
        ) : (
          <p className="panel-card__empty">{filterMode === "all" ? "No materials defined yet." : "No materials used in this project yet."}</p>
        )}
      </div>
    </section>
  );
}

function VariablesPanel() {
  const variables = useEditorStore((state) => state.project.variables);
  const buildStatuses = useEditorStore((state) => state.project.buildStatuses);
  const addProjectVariable = useEditorStore((state) => state.addProjectVariable);
  const updateProjectVariable = useEditorStore((state) => state.updateProjectVariable);
  const deleteProjectVariable = useEditorStore((state) => state.deleteProjectVariable);
  const addBuildStatus = useEditorStore((state) => state.addBuildStatus);
  const updateBuildStatus = useEditorStore((state) => state.updateBuildStatus);
  const deleteBuildStatus = useEditorStore((state) => state.deleteBuildStatus);

  return (
    <section className="panel-card browser-card">
      <div className="browser-card__header">
        <div>
          <span className="panel-card__title">Settings</span>
          <p className="browser-card__subtitle">
            Variables and build statuses
          </p>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section__header">
          <span className="settings-section__title">Build Statuses</span>
          <button
            aria-label="Create build status"
            className="browser-card__header-action"
            onClick={() => addBuildStatus()}
            title="Create build status"
            type="button"
          >
            <PlusIcon width={16} height={16} />
          </button>
        </div>
        <div className="variable-list">
          {buildStatuses.map((status) => (
            <div className="variable-row variable-row--status" key={status.id}>
              <SettingsIcon width={14} height={14} />
              <input
                aria-label="Build status label"
                className="variable-row__input"
                value={status.label}
                onChange={(event) => updateBuildStatus(status.id, { label: event.target.value })}
                type="text"
              />
              <button
                aria-label={`Delete ${status.label}`}
                className="object-row__eye object-row__eye--hidden"
                disabled={status.id === DEFAULT_BUILD_STATUS_ID}
                onClick={() => deleteBuildStatus(status.id)}
                title={status.id === DEFAULT_BUILD_STATUS_ID ? "Default status cannot be deleted" : "Delete build status"}
                type="button"
              >
                <TrashIcon width={12} height={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section__header">
          <span className="settings-section__title">Variables</span>
        <button
          aria-label="Create variable"
          className="browser-card__header-action"
          onClick={() => addProjectVariable()}
          title="Create variable"
          type="button"
        >
          <PlusIcon width={16} height={16} />
        </button>
      </div>

      <div className="variable-list">
        {variables.length > 0 ? variables.map((variable) => (
          <div className="variable-row" key={variable.id}>
            <SettingsIcon width={14} height={14} />
            <input
              aria-label="Variable name"
              className="variable-row__input"
              value={variable.name}
              onChange={(event) => updateProjectVariable(variable.id, { name: event.target.value })}
              type="text"
            />
            <input
              aria-label={`${variable.name} value in millimeters`}
              className="variable-row__value"
              value={Number(variable.valueMm.toFixed(2))}
              onChange={(event) => updateProjectVariable(variable.id, { valueMm: Number(event.target.value) })}
              type="number"
              step="0.1"
            />
            <span className="variable-row__unit">mm</span>
            <button
              aria-label={`Delete ${variable.name}`}
              className="object-row__eye object-row__eye--hidden"
              onClick={() => deleteProjectVariable(variable.id)}
              title="Delete variable"
              type="button"
            >
              <TrashIcon width={12} height={12} />
            </button>
          </div>
        )) : (
          <p className="panel-card__empty">No variables defined yet.</p>
        )}
      </div>
      </div>
    </section>
  );
}

export function ProjectSidebar() {
  const [activeTab, setActiveTab] = useState<SidebarTab>("objects");
  const [editingItem, setEditingItem] = useState<EditingItem>(null);
  const [draftName, setDraftName] = useState("");
  const [draggingItem, setDraggingItem] = useState<DraggedTreeItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set());
  const project = useEditorStore((state) => state.project);
  const selectedPartId = useEditorStore((state) => state.selectedPartId);
  const selectedMeasurementId = useEditorStore((state) => state.selectedMeasurementId);
  const selectedMaterialId = useEditorStore((state) => state.selectedMaterialId);
  const selectPart = useEditorStore((state) => state.selectPart);
  const selectMeasurement = useEditorStore((state) => state.selectMeasurement);
  const selectMaterial = useEditorStore((state) => state.selectMaterial);
  const addGroup = useEditorStore((state) => state.addGroup);
  const updatePart = useEditorStore((state) => state.updatePart);
  const updateMeasurement = useEditorStore((state) => state.updateMeasurement);
  const updateGroupName = useEditorStore((state) => state.updateGroupName);
  const movePartToGroup = useEditorStore((state) => state.movePartToGroup);
  const moveMeasurementToGroup = useEditorStore((state) => state.moveMeasurementToGroup);
  const moveGroupToGroup = useEditorStore((state) => state.moveGroupToGroup);
  const togglePartVisibility = useEditorStore((state) => state.togglePartVisibility);
  const toggleGroupVisibility = useEditorStore((state) => state.toggleGroupVisibility);
  const toggleMeasurementVisibility = useEditorStore((state) => state.toggleMeasurementVisibility);
  const deleteGroup = useEditorStore((state) => state.deleteGroup);

  useEffect(() => {
    if (editingItem?.kind === "part" && !project.parts.some((part) => part.id === editingItem.id)) {
      setEditingItem(null); setDraftName("");
    }
    if (editingItem?.kind === "measurement" && !project.measurements.some((m) => m.id === editingItem.id)) {
      setEditingItem(null); setDraftName("");
    }
    if (editingItem?.kind === "group" && !project.groups.some((g) => g.id === editingItem.id)) {
      setEditingItem(null); setDraftName("");
    }
  }, [editingItem, project.groups, project.measurements, project.parts]);

  useEffect(() => {
    if (selectedMaterialId) {
      setActiveTab("material");
    }
  }, [selectedMaterialId]);

  useEffect(() => {
    setExpandedGroupIds((current) => {
      const next = new Set(current);
      let changed = false;
      const existingGroupIds = new Set(project.groups.map((group) => group.id));
      Array.from(next).forEach((groupId) => {
        if (!existingGroupIds.has(groupId)) { next.delete(groupId); changed = true; }
      });
      return changed ? next : current;
    });
  }, [project.groups]);

  function beginRenamePart(partId: string, currentName: string) {
    setEditingItem({ kind: "part", id: partId }); setDraftName(currentName); selectPart(partId);
  }
  function beginRenameGroup(groupId: string, currentName: string) {
    setEditingItem({ kind: "group", id: groupId }); setDraftName(currentName); selectPart(null);
  }
  function beginRenameMeasurement(measurementId: string, currentName: string) {
    setEditingItem({ kind: "measurement", id: measurementId }); setDraftName(currentName); selectMeasurement(measurementId);
  }

  function commitRename() {
    if (!editingItem) return;
    const nextName = draftName.trim();
    if (nextName && editingItem.kind === "part") updatePart(editingItem.id, (part) => ({ ...part, name: nextName }));
    if (nextName && editingItem.kind === "measurement") updateMeasurement(editingItem.id, (m) => ({ ...m, name: nextName }));
    if (nextName && editingItem.kind === "group") updateGroupName(editingItem.id, nextName);
    setEditingItem(null); setDraftName("");
  }

  function groupChildren(groupId: string | null): GroupNode[] {
    return project.groups.filter((group) => group.parentGroupId === groupId);
  }
  function partChildren(groupId: string | null): PartNode[] {
    return project.parts.filter((part) => part.groupId === groupId);
  }
  function measurementChildren(groupId: string | null): MeasurementNode[] {
    return project.measurements.filter((measurement) => measurement.groupId === groupId);
  }

  function parseDraggedItem(event: DragEvent): DraggedTreeItem | null {
    const payload = event.dataTransfer.getData(TREE_DRAG_MIME);
    if (!payload) return null;
    try {
      const parsed = JSON.parse(payload) as DraggedTreeItem;
      return parsed.kind === "part" || parsed.kind === "group" || parsed.kind === "measurement" ? parsed : null;
    } catch { return null; }
  }

  function getDraggedItem(event: DragEvent): DraggedTreeItem | null {
    return draggingItem ?? parseDraggedItem(event);
  }

  function canDropOnGroup(item: DraggedTreeItem | null, groupId: string): boolean {
    if (!item) return false;
    if (item.kind === "part") return project.parts.some((part) => part.id === item.id);
    if (item.kind === "measurement") return project.measurements.some((m) => m.id === item.id);
    return item.id !== groupId && !isGroupDescendant(project.groups, groupId, item.id);
  }

  function isEventOnObjectRow(event: DragEvent): boolean {
    return event.target instanceof Element && Boolean(event.target.closest(".object-row"));
  }

  function beginDrag(event: DragEvent, item: DraggedTreeItem) {
    event.stopPropagation();
    setDraggingItem(item);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(TREE_DRAG_MIME, JSON.stringify(item));
  }

  function endDrag() { setDraggingItem(null); setDropTarget(null); }

  function dropItemIntoGroup(item: DraggedTreeItem, groupId: string) {
    if (item.kind === "part") { movePartToGroup(item.id, groupId); return; }
    if (item.kind === "measurement") { moveMeasurementToGroup(item.id, groupId); return; }
    moveGroupToGroup(item.id, groupId);
  }

  function dropItemAtRoot(item: DraggedTreeItem) {
    if (item.kind === "part") { movePartToGroup(item.id, null); return; }
    if (item.kind === "measurement") { moveMeasurementToGroup(item.id, null); return; }
    moveGroupToGroup(item.id, null);
  }

  function handleGroupDragOver(event: DragEvent, groupId: string) {
    const item = getDraggedItem(event);
    if (!canDropOnGroup(item, groupId)) return;
    event.preventDefault(); event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(groupId);
  }

  function handleGroupDrop(event: DragEvent, groupId: string) {
    const item = getDraggedItem(event);
    event.preventDefault(); event.stopPropagation();
    if (item && canDropOnGroup(item, groupId)) dropItemIntoGroup(item, groupId);
    endDrag();
  }

  function handleRootDragOver(event: DragEvent) {
    const item = getDraggedItem(event);
    if (!item || isEventOnObjectRow(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget("root");
  }

  function handleRootDrop(event: DragEvent) {
    const item = getDraggedItem(event);
    if (!item || isEventOnObjectRow(event)) return;
    event.preventDefault();
    dropItemAtRoot(item);
    endDrag();
  }

  function toggleGroupExpanded(groupId: string) {
    setExpandedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function renderNameEditor(kind: "part" | "group" | "measurement", id: string, name: string) {
    if (editingItem?.kind === kind && editingItem.id === id) {
      return (
        <input
          autoFocus
          className="object-row__name-input"
          type="text"
          value={draftName}
          onBlur={commitRename}
          onChange={(event) => setDraftName(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); commitRename(); }
            if (event.key === "Escape") { event.preventDefault(); setEditingItem(null); setDraftName(""); }
          }}
        />
      );
    }
    return (
      <button
        className="object-row__name-button"
        onClick={(event) => {
          event.stopPropagation();
          if (kind === "part") beginRenamePart(id, name);
          else if (kind === "measurement") beginRenameMeasurement(id, name);
          else beginRenameGroup(id, name);
        }}
        type="button"
      >
        <strong>{name}</strong>
      </button>
    );
  }

  function isAncestorGroupHidden(groupId: string | null): boolean {
    let current = groupId ? project.groups.find((g) => g.id === groupId) : null;
    while (current) {
      if (current.hidden) return true;
      current = current.parentGroupId ? project.groups.find((g) => g.id === current!.parentGroupId) ?? null : null;
    }
    return false;
  }

  function renderVisibilityButton(hidden: boolean | undefined, onToggle: (event: React.MouseEvent) => void, label: string) {
    return (
      <button
        aria-label={label}
        className={`object-row__eye ${hidden ? "object-row__eye--hidden" : ""}`}
        onClick={(event) => { event.stopPropagation(); onToggle(event); }}
        onDragStart={(event) => event.preventDefault()}
        title={hidden ? "Show" : "Hide"}
        type="button"
      >
        {hidden ? <EyeOffIcon width={13} height={13} /> : <EyeIcon width={13} height={13} />}
      </button>
    );
  }

  function renderMeasurement(measurement: MeasurementNode, depth: number) {
    const isDragging = draggingItem?.kind === "measurement" && draggingItem.id === measurement.id;
    const effectivelyHidden = measurement.hidden || isAncestorGroupHidden(measurement.groupId);
    return (
      <div
        key={measurement.id}
        className={`object-row ${selectedMeasurementId === measurement.id ? "object-row--selected" : ""} ${isDragging ? "object-row--dragging" : ""} ${effectivelyHidden ? "object-row--hidden" : ""}`}
        draggable
        onClick={() => selectMeasurement(measurement.id)}
        onDragEnd={endDrag}
        onDragStart={(event) => beginDrag(event, { kind: "measurement", id: measurement.id })}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectMeasurement(measurement.id); } }}
        role="button"
        style={{ paddingLeft: `${0.88 + depth * 1.2}rem` }}
        tabIndex={0}
      >
        <span className="object-row__disclosure object-row__disclosure--placeholder" />
        <span className="object-row__icon"><RulerIcon width={14} height={14} /></span>
        <span className="object-row__content">{renderNameEditor("measurement", measurement.id, measurement.name)}</span>
        {renderVisibilityButton(measurement.hidden, () => toggleMeasurementVisibility(measurement.id), measurement.hidden ? `Show ${measurement.name}` : `Hide ${measurement.name}`)}
      </div>
    );
  }

  function renderPart(part: PartNode, depth: number) {
    const isDragging = draggingItem?.kind === "part" && draggingItem.id === part.id;
    const effectivelyHidden = part.hidden || isAncestorGroupHidden(part.groupId);
    return (
      <div
        key={part.id}
        className={`object-row ${selectedPartId === part.id ? "object-row--selected" : ""} ${isDragging ? "object-row--dragging" : ""} ${effectivelyHidden ? "object-row--hidden" : ""}`}
        draggable
        onClick={() => selectPart(part.id)}
        onDragEnd={endDrag}
        onDragStart={(event) => beginDrag(event, { kind: "part", id: part.id })}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectPart(part.id); } }}
        role="button"
        style={{ paddingLeft: `${0.88 + depth * 1.2}rem` }}
        tabIndex={0}
      >
        <span className="object-row__disclosure object-row__disclosure--placeholder" />
        <span className="object-row__icon"><PartTypeIcon objectType={part.objectType} /></span>
        <span className="object-row__content">{renderNameEditor("part", part.id, part.name)}</span>
        {renderVisibilityButton(part.hidden, () => togglePartVisibility(part.id), part.hidden ? `Show ${part.name}` : `Hide ${part.name}`)}
      </div>
    );
  }

  function renderGroup(group: GroupNode, depth: number) {
    const childrenGroups = groupChildren(group.id);
    const childrenParts = partChildren(group.id);
    const childrenMeasurements = measurementChildren(group.id);
    const hasChildren = childrenGroups.length > 0 || childrenParts.length > 0 || childrenMeasurements.length > 0;
    const isExpanded = expandedGroupIds.has(group.id);
    const isDragging = draggingItem?.kind === "group" && draggingItem.id === group.id;
    const isDropTarget = dropTarget === group.id;

    return (
      <div className="object-tree__group" key={group.id}>
        <div
          className={`object-row object-row--group ${isDragging ? "object-row--dragging" : ""} ${isDropTarget ? "object-row--drop-target" : ""} ${group.hidden ? "object-row--hidden" : ""}`}
          draggable
          onDragEnd={endDrag}
          onDragLeave={() => { if (dropTarget === group.id) setDropTarget(null); }}
          onDragOver={(event) => handleGroupDragOver(event, group.id)}
          onDragStart={(event) => beginDrag(event, { kind: "group", id: group.id })}
          onDrop={(event) => handleGroupDrop(event, group.id)}
          style={{ paddingLeft: `${0.88 + depth * 1.2}rem` }}
        >
          {hasChildren ? (
            <button
              aria-label={isExpanded ? `Collapse ${group.name}` : `Expand ${group.name}`}
              className="object-row__disclosure"
              onClick={(event) => { event.stopPropagation(); toggleGroupExpanded(group.id); }}
              onDragStart={(event) => event.preventDefault()}
              type="button"
            >
              {isExpanded ? <ChevronDownIcon width={13} height={13} /> : <ChevronRightIcon width={13} height={13} />}
            </button>
          ) : (
            <span className="object-row__disclosure object-row__disclosure--placeholder" />
          )}
          <span className="object-row__icon object-row__icon--group"><FolderIcon width={14} height={14} /></span>
          <span className="object-row__content">{renderNameEditor("group", group.id, group.name)}</span>
          {renderVisibilityButton(group.hidden, () => toggleGroupVisibility(group.id), group.hidden ? `Show folder ${group.name}` : `Hide folder ${group.name}`)}
          <button
            aria-label={`Delete folder ${group.name}`}
            className="object-row__eye"
            onClick={(event) => { event.stopPropagation(); deleteGroup(group.id); }}
            onDragStart={(event) => event.preventDefault()}
            title="Delete folder (contents move to parent)"
            type="button"
          >
            <TrashIcon width={13} height={13} />
          </button>
        </div>
        {isExpanded ? childrenGroups.map((childGroup) => renderGroup(childGroup, depth + 1)) : null}
        {isExpanded ? childrenParts.map((part) => renderPart(part, depth + 1)) : null}
        {isExpanded ? childrenMeasurements.map((measurement) => renderMeasurement(measurement, depth + 1)) : null}
      </div>
    );
  }

  const rootGroups = groupChildren(null);
  const rootParts = partChildren(null);
  const rootMeasurements = measurementChildren(null);
  const hasVisibleItems = rootGroups.length > 0 || rootParts.length > 0 || rootMeasurements.length > 0;

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tabs__tab ${activeTab === "objects" ? "sidebar-tabs__tab--active" : ""}`}
          onClick={() => { setActiveTab("objects"); selectMaterial(null); }}
          type="button"
        >
          Objects
        </button>
        <button
          className={`sidebar-tabs__tab ${activeTab === "material" ? "sidebar-tabs__tab--active" : ""}`}
          onClick={() => setActiveTab("material")}
          type="button"
        >
          Material
        </button>
        <button
          className={`sidebar-tabs__tab ${activeTab === "variables" ? "sidebar-tabs__tab--active" : ""}`}
          onClick={() => { setActiveTab("variables"); selectMaterial(null); }}
          type="button"
        >
          Settings
        </button>
      </div>

      {activeTab === "objects" ? (
        <section className="panel-card browser-card">
          <div className="browser-card__header">
            <div>
              <span className="panel-card__title">Objects</span>
              <p className="browser-card__subtitle">
                {project.parts.length + project.measurements.length} objects · {project.groups.length} groups
              </p>
            </div>
            <div className="browser-card__header-actions">
              <button
                aria-label="Expand all groups"
                className="browser-card__header-action"
                onClick={() => setExpandedGroupIds(new Set(project.groups.map((group) => group.id)))}
                title="Expand all groups"
                type="button"
              >
                <ExpandFoldersIcon width={16} height={16} />
              </button>
              <button
                aria-label="Collapse all groups"
                className="browser-card__header-action"
                onClick={() => setExpandedGroupIds(new Set())}
                title="Collapse all groups"
                type="button"
              >
                <CollapseFoldersIcon width={16} height={16} />
              </button>
              <button
                aria-label="Create group"
                className="browser-card__header-action"
                onClick={() => addGroup()}
                title="Create group"
                type="button"
              >
                <FolderIcon width={16} height={16} />
              </button>
            </div>
          </div>

          <div
            className={`object-browser ${dropTarget === "root" ? "object-browser--drop-target" : ""}`}
            onDragLeave={(event) => { if (event.currentTarget === event.target && dropTarget === "root") setDropTarget(null); }}
            onDragOver={handleRootDragOver}
            onDrop={handleRootDrop}
          >
            {hasVisibleItems ? (
              <>
                {rootGroups.map((group) => renderGroup(group, 0))}
                {rootParts.map((part) => renderPart(part, 0))}
                {rootMeasurements.map((measurement) => renderMeasurement(measurement, 0))}
              </>
            ) : (
              <p className="panel-card__empty">No objects or groups yet.</p>
            )}
          </div>
        </section>
      ) : activeTab === "material" ? (
        <MaterialPanel />
      ) : (
        <VariablesPanel />
      )}
    </aside>
  );
}
