import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, type ThreeEvent, type ThreeElements, useFrame, useThree } from "@react-three/fiber";
import { Edges, Html, Line, OrbitControls, Text, TransformControls } from "@react-three/drei";
import { ArrowHelper, DoubleSide, Euler, Mesh, PerspectiveCamera, Vector3, type Object3D } from "three";
import {
  ArIcon,
  BeamIcon,
  BuildSequenceIcon,
  CircleIcon,
  CladdingIcon,
  CubeIcon,
  DuplicateIcon,
  GlassIcon,
  HelpIcon,
  MoveIcon,
  PauseIcon,
  PerspectiveIcon,
  PlayIcon,
  PlusIcon,
  RedoIcon,
  RectangleIcon,
  ResizeIcon,
  RulerIcon,
  RotateIcon,
  SheetIcon,
  ShapeIcon,
  TopViewIcon,
  TrashIcon,
  UndoIcon,
} from "./Icons";
import { getResizableAxes } from "../lib/profiles";
import { applyResizeFromHandle } from "../lib/geometry";
import { openProjectInArQuickLook } from "../lib/export";
import { DEFAULT_BUILD_STATUS_ID, cloneProject } from "../lib/project";
import { snapValue, toRadians } from "../lib/snap";
import { formatLength } from "../lib/units";
import { editorStore, useEditorStore } from "../store/editorStore";
import type { MaterialNode, MeasurementNode, PartNode, ProjectDocument, Vector3Like } from "../types/model";

const GRID_STEP = 100;
const GROUND_PLANE_SIZE = 12400;

type ResizeDragState = {
  axis: keyof Vector3Like;
  direction: 1 | -1;
  startX: number;
  startY: number;
  snapshot: ProjectDocument;
  initialPart: PartNode;
};

type HandleDefinition = {
  axis: keyof Vector3Like;
  direction: 1 | -1;
  position: [number, number, number];
};

type MeasurementDraft = {
  start: Vector3Like;
  end: Vector3Like;
};

type PartCornerDefinition = {
  key: string;
  local: [number, number, number];
  world: Vector3Like;
};

function vectorToTuple(vector: Vector3Like): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function distanceBetween(start: Vector3Like, end: Vector3Like): number {
  return Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
}

function isFlatShape(part: PartNode): boolean {
  return part.objectType === "rectangle" || part.objectType === "circle";
}

function transformLocalPoint(part: PartNode, local: [number, number, number], rotation: Euler): PartCornerDefinition {
  const world = new Vector3(...local).applyEuler(rotation).add(new Vector3(part.position.x, part.position.y, part.position.z));

  return {
    key: local.join("-"),
    local,
    world: {
      x: world.x,
      y: world.y,
      z: world.z,
    },
  };
}

function getPartCorners(part: PartNode): PartCornerDefinition[] {
  const rotation = new Euler(part.rotation.x, part.rotation.y, part.rotation.z);

  if (part.objectType === "rectangle") {
    return ([
      [0, 0, 0],
      [part.size.x, 0, 0],
      [part.size.x, 0, part.size.z],
      [0, 0, part.size.z],
    ] as Array<[number, number, number]>).map((local) => transformLocalPoint(part, local, rotation));
  }

  if (part.objectType === "circle") {
    const radius = part.size.x / 2;
    return ([
      [0, 0, radius],
      [radius, 0, 0],
      [part.size.x, 0, radius],
      [radius, 0, part.size.z],
    ] as Array<[number, number, number]>).map((local) => transformLocalPoint(part, local, rotation));
  }

  return ([0, part.size.x] as const).flatMap((x) =>
    ([0, part.size.y] as const).flatMap((y) =>
      ([0, part.size.z] as const).map((z) => {
        const local: [number, number, number] = [x, y, z];
        const world = new Vector3(x, y, z).applyEuler(rotation).add(new Vector3(part.position.x, part.position.y, part.position.z));

        return {
          key: `${x}-${y}-${z}`,
          local,
          world: {
            x: world.x,
            y: world.y,
            z: world.z,
          },
        };
      }),
    ),
  );
}

const _ssPos = new Vector3();

function ScreenSizeMesh({
  pixelRadius,
  position,
  children,
  ...props
}: { pixelRadius: number; position: [number, number, number] } & Omit<ThreeElements["mesh"], "ref">) {
  const ref = useRef<Mesh>(null);
  const { camera, size } = useThree();

  useFrame(() => {
    if (!ref.current) return;
    ref.current.getWorldPosition(_ssPos);
    const dist = camera.position.distanceTo(_ssPos);
    const fovRad = ((camera as PerspectiveCamera).fov * Math.PI) / 180;
    const worldPerPx = (2 * dist * Math.tan(fovRad / 2)) / size.height;
    ref.current.scale.setScalar(worldPerPx * pixelRadius);
  });

  return (
    <mesh ref={ref} position={position} {...props}>
      {children}
    </mesh>
  );
}

function CameraController({
  orbitRef,
}: {
  orbitRef: RefObject<{ target: Vector3; update: () => void; enabled: boolean } | null>;
}) {
  const cameraState = useEditorStore((state) => state.project.cameraState);
  const commitCameraState = useEditorStore((state) => state.commitCameraState);
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(cameraState.position.x, cameraState.position.y, cameraState.position.z);
    orbitRef.current?.target.set(cameraState.target.x, cameraState.target.y, cameraState.target.z);
    orbitRef.current?.update();
  }, [
    camera,
    cameraState.position.x,
    cameraState.position.y,
    cameraState.position.z,
    cameraState.target.x,
    cameraState.target.y,
    cameraState.target.z,
    orbitRef,
  ]);

  return (
    <OrbitControls
      ref={orbitRef as never}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      onEnd={() => {
        if (!orbitRef.current) {
          return;
        }

        commitCameraState({
          position: {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
          },
          target: {
            x: orbitRef.current.target.x,
            y: orbitRef.current.target.y,
            z: orbitRef.current.target.z,
          },
        });
      }}
    />
  );
}

function KeyDimensionGuide({ part }: { part: PartNode }) {
  const unitPreference = useEditorStore((state) => state.project.unitPreference);
  const axes = getResizableAxes(part);
  const showX = axes.includes("x");
  const showY = axes.includes("y");
  const showZ = axes.includes("z") && part.objectType !== "circle";
  const offset = Math.max(36, Math.max(part.size.x, part.size.y, part.size.z) * 0.14);
  const guideY = Math.max(16, Math.min(36, part.size.y * 0.12));
  const xGuideZ = part.size.z + offset;
  const zGuideX = part.size.x + offset;
  const yGuideX = part.size.x + offset * 0.65;
  const yGuideZ = part.size.z + offset * 0.65;

  return (
    <>
      {showX ? (
        <>
          <Line points={[[0, guideY, xGuideZ], [part.size.x, guideY, xGuideZ]]} color="#505a66" lineWidth={1.2} />
          <Line points={[[0, 0, part.size.z], [0, guideY, xGuideZ]]} color="#9aa6b1" lineWidth={1} dashed dashSize={10} gapSize={6} />
          <Line
            points={[[part.size.x, 0, part.size.z], [part.size.x, guideY, xGuideZ]]}
            color="#9aa6b1"
            lineWidth={1}
            dashed
            dashSize={10}
            gapSize={6}
          />
          <ScreenSizeMesh pixelRadius={5} position={[0, guideY, xGuideZ]}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial color="#f5f7fa" />
          </ScreenSizeMesh>
          <ScreenSizeMesh pixelRadius={5} position={[part.size.x, guideY, xGuideZ]}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial color="#f5f7fa" />
          </ScreenSizeMesh>
          <Html position={[part.size.x / 2, guideY + 18, xGuideZ]} center style={{ pointerEvents: "none" }}>
            <div className="measurement-chip">{formatLength(part.size.x, unitPreference)}</div>
          </Html>
        </>
      ) : null}

      {showZ ? (
        <>
          <Line points={[[zGuideX, guideY, 0], [zGuideX, guideY, part.size.z]]} color="#505a66" lineWidth={1.2} />
          <Line points={[[part.size.x, 0, 0], [zGuideX, guideY, 0]]} color="#9aa6b1" lineWidth={1} dashed dashSize={10} gapSize={6} />
          <Line
            points={[[part.size.x, 0, part.size.z], [zGuideX, guideY, part.size.z]]}
            color="#9aa6b1"
            lineWidth={1}
            dashed
            dashSize={10}
            gapSize={6}
          />
          <ScreenSizeMesh pixelRadius={5} position={[zGuideX, guideY, 0]}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial color="#f5f7fa" />
          </ScreenSizeMesh>
          <ScreenSizeMesh pixelRadius={5} position={[zGuideX, guideY, part.size.z]}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial color="#f5f7fa" />
          </ScreenSizeMesh>
          <Html position={[zGuideX, guideY + 18, part.size.z / 2]} center style={{ pointerEvents: "none" }}>
            <div className="measurement-chip">{formatLength(part.size.z, unitPreference)}</div>
          </Html>
        </>
      ) : null}

      {showY ? (
        <>
          <Line points={[[yGuideX, 0, yGuideZ], [yGuideX, part.size.y, yGuideZ]]} color="#505a66" lineWidth={1.2} />
          <Line points={[[part.size.x, 0, part.size.z], [yGuideX, 0, yGuideZ]]} color="#9aa6b1" lineWidth={1} dashed dashSize={10} gapSize={6} />
          <Line
            points={[[part.size.x, part.size.y, part.size.z], [yGuideX, part.size.y, yGuideZ]]}
            color="#9aa6b1"
            lineWidth={1}
            dashed
            dashSize={10}
            gapSize={6}
          />
          <ScreenSizeMesh pixelRadius={5} position={[yGuideX, 0, yGuideZ]}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial color="#f5f7fa" />
          </ScreenSizeMesh>
          <ScreenSizeMesh pixelRadius={5} position={[yGuideX, part.size.y, yGuideZ]}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial color="#f5f7fa" />
          </ScreenSizeMesh>
          <Html position={[yGuideX, part.size.y / 2, yGuideZ]} center style={{ pointerEvents: "none" }}>
            <div className="measurement-chip">{formatLength(part.size.y, unitPreference)}</div>
          </Html>
        </>
      ) : null}
    </>
  );
}

function MeasurementGuide({
  measurement,
  selected,
}: {
  measurement: Pick<MeasurementNode, "start" | "end" | "color">;
  selected?: boolean;
}) {
  const unitPreference = useEditorStore((state) => state.project.unitPreference);
  const start: [number, number, number] = [measurement.start.x, measurement.start.y + 18, measurement.start.z];
  const end: [number, number, number] = [measurement.end.x, measurement.end.y + 18, measurement.end.z];
  const midpoint: [number, number, number] = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2 + 42,
    (start[2] + end[2]) / 2,
  ];
  const length = distanceBetween(measurement.start, measurement.end);

  return (
    <>
      <Line points={[start, end]} color={selected ? "#5f6b76" : measurement.color} lineWidth={selected ? 2.2 : 1.5} />
      <ScreenSizeMesh pixelRadius={7} position={start}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial color={selected ? "#5f6b76" : measurement.color} />
      </ScreenSizeMesh>
      <ScreenSizeMesh pixelRadius={7} position={end}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial color={selected ? "#5f6b76" : measurement.color} />
      </ScreenSizeMesh>
      <Html position={midpoint} center style={{ pointerEvents: "none" }}>
        <div className={`measurement-chip ${selected ? "measurement-chip--selected" : ""}`}>
          {formatLength(length, unitPreference)}
        </div>
      </Html>
    </>
  );
}

function buildPreviewPart(material: MaterialNode): PartNode {
  return {
    id: "__preview__",
    name: material.name,
    objectType: material.objectType,
    groupId: null,
    materialId: material.id,
    buildStatusId: DEFAULT_BUILD_STATUS_ID,
    buildOrder: 0,
    size: { ...material.defaultSize },
    crossSectionWidthMm: material.crossSectionWidthMm,
    crossSectionHeightMm: material.crossSectionHeightMm,
    thicknessMm: material.thicknessMm,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    color: material.color,
  };
}

function ObjectMaterial({ part, dimmed = false }: { part: PartNode; dimmed?: boolean }) {
  if (part.objectType === "glass") {
    return (
      <meshStandardMaterial
        color={part.color}
        depthWrite={false}
        metalness={0}
        opacity={dimmed ? 0.1 : 0.38}
        roughness={0.08}
        transparent
      />
    );
  }

  if (isFlatShape(part)) {
    return (
      <meshStandardMaterial
        color={part.color}
        metalness={0.02}
        opacity={dimmed ? 0.22 : 1}
        transparent={dimmed}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
        roughness={0.72}
        side={DoubleSide}
      />
    );
  }

  return <meshStandardMaterial color={part.color} roughness={0.82} metalness={0.08} opacity={dimmed ? 0.22 : 1} transparent={dimmed} />;
}

function PartShapeMesh({ part, selected, dimmed = false }: { part: PartNode; selected: boolean; dimmed?: boolean }) {
  if (part.objectType === "rectangle") {
    return (
      <mesh position={[part.size.x / 2, 0, part.size.z / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[part.size.x, part.size.z]} />
        <ObjectMaterial part={part} dimmed={dimmed} />
        <Edges color={selected ? "#eef1f4" : "#53606d"} />
      </mesh>
    );
  }

  if (part.objectType === "circle") {
    return (
      <mesh position={[part.size.x / 2, 0, part.size.z / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[part.size.x / 2, 64]} />
        <ObjectMaterial part={part} dimmed={dimmed} />
        <Edges color={selected ? "#eef1f4" : "#53606d"} />
      </mesh>
    );
  }

  return (
    <mesh
      position={[part.size.x / 2, part.size.y / 2, part.size.z / 2]}
      castShadow={part.objectType !== "glass"}
      receiveShadow={part.objectType !== "glass"}
    >
      <boxGeometry args={[part.size.x, part.size.y, part.size.z]} />
      <ObjectMaterial part={part} dimmed={dimmed} />
      <Edges color={selected ? "#eef1f4" : "#53606d"} />
    </mesh>
  );
}

function AxisArrow({
  direction,
  length,
  color,
}: {
  direction: [number, number, number];
  length: number;
  color: string;
}) {
  const helper = useMemo(
    () => new ArrowHelper(new Vector3(...direction).normalize(), new Vector3(0, 0, 0), length, color, 100, 55),
    [color, direction, length],
  );

  return <primitive object={helper} />;
}

function AxisGuide() {
  return (
    <>
      <AxisArrow direction={[1, 0, 0]} length={900} color="#c96b54" />
      <AxisArrow direction={[0, 1, 0]} length={720} color="#5b9b67" />
      <AxisArrow direction={[0, 0, 1]} length={900} color="#5682c8" />

      <Text position={[980, 8, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={92} color="#c96b54">
        X
      </Text>
      <Text position={[0, 780, 0]} fontSize={92} color="#5b9b67">
        Y
      </Text>
      <Text position={[0, 8, 980]} rotation={[-Math.PI / 2, 0, 0]} fontSize={92} color="#5682c8">
        Z
      </Text>
    </>
  );
}

function isPartVisible(part: PartNode, groups: import("../types/model").GroupNode[]): boolean {
  if (part.hidden) return false;
  let groupId = part.groupId;
  while (groupId) {
    const group = groups.find((g) => g.id === groupId);
    if (!group) break;
    if (group.hidden) return false;
    groupId = group.parentGroupId;
  }
  return true;
}

function isPartVisibleInBuildPreview(part: PartNode, buildPreviewEnabled: boolean, buildPreviewStep: number): boolean {
  if (!buildPreviewEnabled) {
    return true;
  }
  return part.buildOrder <= buildPreviewStep;
}

function getMaxBuildOrder(parts: PartNode[]): number {
  return parts.reduce((max, part) => Math.max(max, Number.isFinite(part.buildOrder) ? part.buildOrder : 0), 0);
}

function isMeasurementVisible(measurement: MeasurementNode, groups: import("../types/model").GroupNode[]): boolean {
  if (measurement.hidden) return false;
  let groupId = measurement.groupId;
  while (groupId) {
    const group = groups.find((g) => g.id === groupId);
    if (!group) break;
    if (group.hidden) return false;
    groupId = group.parentGroupId;
  }
  return true;
}

function Scene() {
  const allParts = useEditorStore((state) => state.project.parts);
  const groups = useEditorStore((state) => state.project.groups);
  const buildPreviewEnabled = useEditorStore((state) => state.buildPreviewEnabled);
  const buildPreviewStep = useEditorStore((state) => state.buildPreviewStep);
  const globalMaterialLibrary = useEditorStore((state) => state.globalMaterialLibrary);
  const selectedMaterialId = useEditorStore((state) => state.selectedMaterialId);
  const selectedMaterial = selectedMaterialId
    ? (globalMaterialLibrary.materials.find((m) => m.id === selectedMaterialId) ?? null)
    : null;
  const previewPart = selectedMaterial ? buildPreviewPart(selectedMaterial) : null;
  const parts = allParts.filter((part) =>
    isPartVisible(part, groups) && isPartVisibleInBuildPreview(part, buildPreviewEnabled, buildPreviewStep)
  );
  const allMeasurements = useEditorStore((state) => state.project.measurements);
  const measurements = allMeasurements.filter((m) => isMeasurementVisible(m, groups));
  const selectedPartId = useEditorStore((state) => state.selectedPartId);
  const selectedMeasurementId = useEditorStore((state) => state.selectedMeasurementId);
  const activeTool = useEditorStore((state) => state.activeTool);
  const snapSettings = useEditorStore((state) => state.project.snapSettings);
  const gridSettings = useEditorStore((state) => state.project.gridSettings);
  const selectPart = useEditorStore((state) => state.selectPart);
  const selectMeasurement = useEditorStore((state) => state.selectMeasurement);
  const addMeasurement = useEditorStore((state) => state.addMeasurement);
  const previewPartGeometry = useEditorStore((state) => state.previewPartGeometry);
  const finalizeTransientChange = useEditorStore((state) => state.finalizeTransientChange);
  const [measurementDraft, setMeasurementDraft] = useState<MeasurementDraft | null>(null);
  const objectRefs = useRef<Record<string, Object3D | null>>({});
  const orbitRef = useRef<{ target: Vector3; update: () => void; enabled: boolean } | null>(null);
  const transformSnapshotRef = useRef<ProjectDocument | null>(null);
  const resizeDragRef = useRef<ResizeDragState | null>(null);
  const handleMoveRef = useRef<((event: PointerEvent) => void) | null>(null);
  const handleUpRef = useRef<(() => void) | null>(null);
  const selectedPart = parts.find((part) => part.id === selectedPartId) ?? null;
  const selectedObject = selectedPart ? objectRefs.current[selectedPart.id] : null;

  function snapGroundPoint(point: Vector3): Vector3Like {
    return {
      x: snapValue(point.x, snapSettings.moveIncrement, snapSettings.enabled),
      y: 0,
      z: snapValue(point.z, snapSettings.moveIncrement, snapSettings.enabled),
    };
  }

  function handleMeasurePoint(nextPoint: Vector3Like) {
    if (!measurementDraft) {
      selectPart(null);
      setMeasurementDraft({ start: nextPoint, end: nextPoint });
      return;
    }

    if (distanceBetween(measurementDraft.start, nextPoint) > 0) {
      addMeasurement(measurementDraft.start, nextPoint);
    }

    setMeasurementDraft(null);
  }

  useEffect(() => {
    return () => {
      if (handleMoveRef.current) {
        window.removeEventListener("pointermove", handleMoveRef.current);
      }

      if (handleUpRef.current) {
        window.removeEventListener("pointerup", handleUpRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeTool !== "measure") {
      setMeasurementDraft(null);
    }
  }, [activeTool]);

  function beginResizeDrag(event: ThreeEvent<PointerEvent>, part: PartNode, axis: keyof Vector3Like, direction: 1 | -1) {
    event.stopPropagation();
    selectPart(part.id);

    if (handleMoveRef.current) {
      window.removeEventListener("pointermove", handleMoveRef.current);
    }

    if (handleUpRef.current) {
      window.removeEventListener("pointerup", handleUpRef.current);
    }

    resizeDragRef.current = {
      axis,
      direction,
      startX: event.nativeEvent.clientX,
      startY: event.nativeEvent.clientY,
      snapshot: cloneProject(editorStore.getState().project),
      initialPart: JSON.parse(JSON.stringify(part)) as PartNode,
    };

    if (orbitRef.current) {
      orbitRef.current.enabled = false;
    }

    handleMoveRef.current = (pointerEvent: PointerEvent) => {
      const drag = resizeDragRef.current;
      if (!drag) {
        return;
      }

      const horizontalDelta = pointerEvent.clientX - drag.startX;
      const verticalDelta = drag.startY - pointerEvent.clientY;
      const axisDeltaPx = drag.axis === "y" ? verticalDelta : horizontalDelta;
      previewPartGeometry(
        drag.initialPart.id,
        applyResizeFromHandle(
          drag.initialPart,
          drag.axis,
          drag.direction,
          axisDeltaPx,
          snapSettings.resizeIncrement,
          snapSettings.enabled,
        ),
      );
    };

    handleUpRef.current = () => {
      if (resizeDragRef.current) {
        finalizeTransientChange(resizeDragRef.current.snapshot);
        resizeDragRef.current = null;
      }

      if (orbitRef.current) {
        orbitRef.current.enabled = true;
      }

      if (handleMoveRef.current) {
        window.removeEventListener("pointermove", handleMoveRef.current);
      }

      if (handleUpRef.current) {
        window.removeEventListener("pointerup", handleUpRef.current);
      }
    };

    window.addEventListener("pointermove", handleMoveRef.current);
    window.addEventListener("pointerup", handleUpRef.current);
  }

  const handleDefinitions: HandleDefinition[] = selectedPart
    ? ([
        { axis: "x", direction: 1, position: [selectedPart.size.x, selectedPart.size.y / 2, selectedPart.size.z / 2] },
        { axis: "x", direction: -1, position: [0, selectedPart.size.y / 2, selectedPart.size.z / 2] },
        { axis: "y", direction: 1, position: [selectedPart.size.x / 2, selectedPart.size.y, selectedPart.size.z / 2] },
        { axis: "y", direction: -1, position: [selectedPart.size.x / 2, 0, selectedPart.size.z / 2] },
        { axis: "z", direction: 1, position: [selectedPart.size.x / 2, selectedPart.size.y / 2, selectedPart.size.z] },
        { axis: "z", direction: -1, position: [selectedPart.size.x / 2, selectedPart.size.y / 2, 0] },
      ] as HandleDefinition[]).filter((handle) => getResizableAxes(selectedPart).includes(handle.axis))
    : [];
  const transformMode = activeTool === "rotate" ? "rotate" : "translate";

  return (
    <>
      <color attach="background" args={["#f3f5f2"]} />
      <ambientLight intensity={1.05} />
      <directionalLight position={[1400, 2200, 1200]} intensity={1.35} />
      <directionalLight position={[-800, 900, -1200]} intensity={0.35} />

      <CameraController orbitRef={orbitRef} />
      {(() => {
        const gs = gridSettings ?? { size: 6000, originX: 0, originZ: 0 };
        const margin = GRID_STEP;
        const totalSize = gs.size + margin * 2;
        const divisions = totalSize / GRID_STEP;
        const cx = gs.size / 2 - gs.originX;
        const cz = gs.size / 2 - gs.originZ;
        return (
          <gridHelper args={[totalSize, divisions, "#cfd7dd", "#cfd7dd"]} position={[cx, 0, cz]} />
        );
      })()}
      <AxisGuide />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.5, 0]}
        onPointerMove={(event) => {
          if (activeTool === "measure" && measurementDraft) {
            event.stopPropagation();
            setMeasurementDraft((draft) => (draft ? { ...draft, end: snapGroundPoint(event.point) } : draft));
          }
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (activeTool === "measure") {
            handleMeasurePoint(snapGroundPoint(event.point));
          } else {
            selectPart(null);
            setMeasurementDraft(null);
          }
        }}
      >
        <planeGeometry args={[GROUND_PLANE_SIZE, GROUND_PLANE_SIZE]} />
        <meshStandardMaterial transparent opacity={0} />
      </mesh>

      {previewPart ? (
        <group position={[0, 0, 0]}>
          <PartShapeMesh part={previewPart} selected={false} />
        </group>
      ) : null}

      {!selectedMaterial && parts.map((part) => {
        const isSelected = part.id === selectedPartId;

        return (
          <group
            key={part.id}
            ref={(node) => {
              objectRefs.current[part.id] = node;
            }}
            position={vectorToTuple(part.position)}
            rotation={vectorToTuple(part.rotation)}
            onClick={(event) => {
              event.stopPropagation();
              selectPart(part.id);
            }}
          >
            <PartShapeMesh part={part} selected={isSelected} dimmed={false} />
            {isSelected ? <KeyDimensionGuide part={part} /> : null}

            {activeTool === "measure"
              ? getPartCorners(part).map((corner) => (
                  <ScreenSizeMesh
                    key={corner.key}
                    pixelRadius={8}
                    position={corner.local}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleMeasurePoint(corner.world);
                    }}
                    onPointerMove={(event) => {
                      if (measurementDraft) {
                        event.stopPropagation();
                        setMeasurementDraft((draft) => (draft ? { ...draft, end: corner.world } : draft));
                      }
                    }}
                  >
                    <sphereGeometry args={[1, 16, 16]} />
                    <meshStandardMaterial color="#276f9f" emissive="#0c3a53" depthTest={false} />
                  </ScreenSizeMesh>
                ))
              : null}

            {isSelected && activeTool === "resize"
              ? handleDefinitions.map((handle) => (
                  <ScreenSizeMesh
                    key={`${handle.axis}-${handle.direction}`}
                    pixelRadius={10}
                    position={handle.position}
                    onPointerDown={(event) => beginResizeDrag(event, part, handle.axis, handle.direction)}
                  >
                    <sphereGeometry args={[1, 16, 16]} />
                    <meshStandardMaterial color="#6f7b87" emissive="#3f4852" />
                  </ScreenSizeMesh>
                ))
              : null}
          </group>
        );
      })}

      {!selectedMaterial && measurements.map((measurement) => (
        <group
          key={measurement.id}
          onClick={(event) => {
            event.stopPropagation();
            selectMeasurement(measurement.id);
          }}
        >
          <MeasurementGuide measurement={measurement} selected={measurement.id === selectedMeasurementId} />
        </group>
      ))}

      {measurementDraft ? <MeasurementGuide measurement={{ ...measurementDraft, color: "#276f9f" }} selected /> : null}

      {selectedObject && selectedPart ? (
        <TransformControls
          object={selectedObject}
          mode={transformMode}
          translationSnap={transformMode === "translate" && snapSettings.enabled ? snapSettings.moveIncrement : undefined}
          rotationSnap={transformMode === "rotate" && snapSettings.enabled ? toRadians(snapSettings.rotateIncrementDeg) : undefined}
          onMouseDown={() => {
            transformSnapshotRef.current = cloneProject(editorStore.getState().project);
            if (orbitRef.current) {
              orbitRef.current.enabled = false;
            }
          }}
          onObjectChange={() => {
            previewPartGeometry(selectedPart.id, {
              position: {
                x: snapValue(selectedObject.position.x, snapSettings.moveIncrement, transformMode === "translate" && snapSettings.enabled),
                y: snapValue(selectedObject.position.y, snapSettings.moveIncrement, transformMode === "translate" && snapSettings.enabled),
                z: snapValue(selectedObject.position.z, snapSettings.moveIncrement, transformMode === "translate" && snapSettings.enabled),
              },
              rotation: {
                x: selectedObject.rotation.x,
                y: selectedObject.rotation.y,
                z: selectedObject.rotation.z,
              },
            });
          }}
          onMouseUp={() => {
            if (transformSnapshotRef.current) {
              finalizeTransientChange(transformSnapshotRef.current);
              transformSnapshotRef.current = null;
            }

            if (orbitRef.current) {
              orbitRef.current.enabled = true;
            }
          }}
        />
      ) : null}
    </>
  );
}

function isIosDevice(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /MacIntel/.test(navigator.platform))
  );
}

export function Viewport() {
  const [showHelp, setShowHelp] = useState(false);
  const [openAddMenu, setOpenAddMenu] = useState<"library" | "shapes" | null>(null);
  const [lastUsedMaterialByGroup, setLastUsedMaterialByGroup] = useState<Map<string, string>>(new Map());
  const [isIos] = useState(() => isIosDevice());
  const [arExporting, setArExporting] = useState(false);
  const [buildPlaybackActive, setBuildPlaybackActive] = useState(false);
  const railMenuRef = useRef<HTMLDivElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const activeTool = useEditorStore((state) => state.activeTool);
  const setActiveTool = useEditorStore((state) => state.setActiveTool);
  const buildPreviewEnabled = useEditorStore((state) => state.buildPreviewEnabled);
  const buildPreviewStep = useEditorStore((state) => state.buildPreviewStep);
  const setBuildPreviewEnabled = useEditorStore((state) => state.setBuildPreviewEnabled);
  const setBuildPreviewStep = useEditorStore((state) => state.setBuildPreviewStep);
  const addObject = useEditorStore((state) => state.addObject);
  const addObjectFromGlobalMaterial = useEditorStore((state) => state.addObjectFromGlobalMaterial);
  const materialGroups = useEditorStore((state) => state.globalMaterialLibrary.materialGroups);
  const materials = useEditorStore((state) => state.globalMaterialLibrary.materials);
  const duplicateSelectedPart = useEditorStore((state) => state.duplicateSelectedPart);
  const deleteSelectedPart = useEditorStore((state) => state.deleteSelectedPart);
  const deleteSelectedMeasurement = useEditorStore((state) => state.deleteSelectedMeasurement);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const commitCameraState = useEditorStore((state) => state.commitCameraState);
  const allParts = useEditorStore((state) => state.project.parts);
  const groups = useEditorStore((state) => state.project.groups);
  const gridSettings = useEditorStore((state) => state.project.gridSettings);
  const selectedPart = useEditorStore((state) =>
    state.project.parts.find((part) => part.id === state.selectedPartId) ?? null,
  );
  const selectedMeasurement = useEditorStore((state) =>
    state.project.measurements.find((measurement) => measurement.id === state.selectedMeasurementId) ?? null,
  );
  const unitPreference = useEditorStore((state) => state.project.unitPreference);
  const maxBuildOrder = getMaxBuildOrder(allParts);
  const visibleBuildParts = allParts
    .filter((part) => isPartVisible(part, groups) && isPartVisibleInBuildPreview(part, buildPreviewEnabled, buildPreviewStep))
    .length;

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!railMenuRef.current?.contains(event.target as Node)) {
        setOpenAddMenu(null);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (buildPreviewStep > maxBuildOrder) {
      setBuildPreviewStep(maxBuildOrder);
    }
  }, [buildPreviewStep, maxBuildOrder, setBuildPreviewStep]);

  useEffect(() => {
    if (!buildPlaybackActive || !buildPreviewEnabled || maxBuildOrder === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      const currentStep = editorStore.getState().buildPreviewStep;
      if (currentStep >= maxBuildOrder) {
        setBuildPlaybackActive(false);
        return;
      }
      editorStore.getState().setBuildPreviewStep(currentStep + 1);
    }, 900);

    return () => window.clearInterval(timer);
  }, [buildPlaybackActive, buildPreviewEnabled, maxBuildOrder]);

  async function handleOpenArView() {
    if (arExporting) {
      return;
    }

    setArExporting(true);

    try {
      await openProjectInArQuickLook(editorStore.getState().project);
    } finally {
      setArExporting(false);
    }
  }

  function setCameraPreset(preset: "perspective" | "top" | "front" | "right") {
    const visibleParts = allParts.filter((part) =>
      isPartVisible(part, groups) && isPartVisibleInBuildPreview(part, buildPreviewEnabled, buildPreviewStep)
    );
    const CAMERA_FOV_DEG = 38;
    const PADDING = 1.35;

    let center: Vector3Like;
    let halfX: number;
    let halfY: number;
    let halfZ: number;

    if (visibleParts.length === 0) {
      const gs = gridSettings;
      const cx = gs.size / 2 - gs.originX;
      const cz = gs.size / 2 - gs.originZ;
      center = { x: cx, y: 400, z: cz };
      halfX = gs.size / 2;
      halfY = 800;
      halfZ = gs.size / 2;
    } else {
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const part of visibleParts) {
        const { position: p, size: s } = part;
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.z < minZ) minZ = p.z;
        if (p.x + s.x > maxX) maxX = p.x + s.x;
        if (p.y + s.y > maxY) maxY = p.y + s.y;
        if (p.z + s.z > maxZ) maxZ = p.z + s.z;
      }
      center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
      halfX = Math.max((maxX - minX) / 2, 100);
      halfY = Math.max((maxY - minY) / 2, 100);
      halfZ = Math.max((maxZ - minZ) / 2, 100);
    }

    const fovRad = (CAMERA_FOV_DEG * Math.PI) / 180;
    const tanHalfFov = Math.tan(fovRad / 2);
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    const aspect = rect && rect.height > 0 ? rect.width / rect.height : 1.5;
    const fit = (halfHoriz: number, halfVert: number) => {
      const distH = halfHoriz / (tanHalfFov * aspect);
      const distV = halfVert / tanHalfFov;
      return Math.max(distH, distV) * PADDING;
    };

    let position: Vector3Like;
    if (preset === "top") {
      const dist = fit(halfX, halfZ);
      position = { x: center.x, y: center.y + dist, z: center.z + 0.01 };
    } else if (preset === "front") {
      const dist = fit(halfX, halfY);
      position = { x: center.x, y: center.y, z: center.z + halfZ + dist };
    } else if (preset === "right") {
      const dist = fit(halfZ, halfY);
      position = { x: center.x + halfX + dist, y: center.y, z: center.z };
    } else {
      const diagonal = Math.sqrt(halfX * halfX + halfY * halfY + halfZ * halfZ);
      const dist = fit(diagonal, diagonal);
      const offset = dist / Math.sqrt(3);
      position = { x: center.x + offset, y: center.y + offset, z: center.z + offset };
    }

    commitCameraState({ position, target: center });
  }

  return (
    <section className="viewport-panel">
      <div className="viewport-canvas" ref={canvasContainerRef}>
        <div className="viewport-rail viewport-rail--left" ref={railMenuRef}>
          <div className="viewport-rail__menu-wrapper">
            <button
              className={`viewport-rail__button ${openAddMenu === "library" ? "viewport-rail__button--active" : ""}`}
              onClick={() => {
                setOpenAddMenu((value) => (value === "library" ? null : "library"));
              }}
              title="Add from material library"
              type="button"
            >
              <PlusIcon width={18} height={18} />
            </button>
            {openAddMenu === "library" ? (
              <div className="viewport-add-menu">
                {materialGroups.map((group) => {
                  const groupMaterials = materials.filter((m) => m.groupId === group.id);
                  if (groupMaterials.length === 0) return null;
                  const lastId = lastUsedMaterialByGroup.get(group.id);
                  const targetMaterial = groupMaterials.find((m) => m.id === lastId) ?? groupMaterials[0];
                  const firstType = targetMaterial.objectType;
                  return (
                    <button
                      key={group.id}
                      className="viewport-add-menu__item"
                      onClick={() => {
                        addObjectFromGlobalMaterial(targetMaterial.id);
                        setLastUsedMaterialByGroup((prev) => new Map(prev).set(group.id, targetMaterial.id));
                        setOpenAddMenu(null);
                      }}
                      type="button"
                    >
                      <span className="viewport-add-menu__group-icon">
                        {firstType === "timber" ? <BeamIcon width={13} height={13} /> :
                         firstType === "sheet" ? <SheetIcon width={13} height={13} /> :
                         firstType === "cladding" ? <CladdingIcon width={13} height={13} /> :
                         firstType === "glass" ? <GlassIcon width={13} height={13} /> : null}
                      </span>
                      <span>{group.name}</span>
                    </button>
                  );
                })}
                {materialGroups.length === 0 ? (
                  <span className="viewport-add-menu__empty">No materials in library</span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="viewport-rail__menu-wrapper">
            <button
              className={`viewport-rail__button ${openAddMenu === "shapes" ? "viewport-rail__button--active" : ""}`}
              onClick={() => setOpenAddMenu((value) => (value === "shapes" ? null : "shapes"))}
              title="Add basic shape"
              type="button"
            >
              <ShapeIcon width={18} height={18} />
            </button>
            {openAddMenu === "shapes" ? (
              <div className="viewport-add-menu">
                <button
                  className="viewport-add-menu__item"
                  onClick={() => {
                    addObject("rectangle");
                    setOpenAddMenu(null);
                  }}
                  type="button"
                >
                  <RectangleIcon width={16} height={16} />
                  <span>Rectangle</span>
                </button>
                <button
                  className="viewport-add-menu__item"
                  onClick={() => {
                    addObject("circle");
                    setOpenAddMenu(null);
                  }}
                  type="button"
                >
                  <CircleIcon width={16} height={16} />
                  <span>Circle</span>
                </button>
                <button
                  className="viewport-add-menu__item"
                  onClick={() => {
                    addObject("cube");
                    setOpenAddMenu(null);
                  }}
                  type="button"
                >
                  <CubeIcon width={16} height={16} />
                  <span>Cube</span>
                </button>
              </div>
            ) : null}
          </div>
          {([
            ["move", MoveIcon, "Move"],
            ["rotate", RotateIcon, "Rotate"],
            ["resize", ResizeIcon, "Resize"],
            ["measure", RulerIcon, "Measure"],
          ] as const).map(([tool, Icon, label]) => (
            <button
              key={tool}
              className={`viewport-rail__button ${activeTool === tool ? "viewport-rail__button--active" : ""}`}
              onClick={() => {
                setOpenAddMenu(null);
                setActiveTool(tool);
              }}
              title={label}
              type="button"
            >
              <Icon width={18} height={18} />
            </button>
          ))}
          <div className="viewport-rail__divider" />
          <button
            className="viewport-rail__button"
            onClick={() => {
              setOpenAddMenu(null);
              undo();
            }}
            title="Undo"
            type="button"
          >
            <UndoIcon width={18} height={18} />
          </button>
          <button
            className="viewport-rail__button"
            onClick={() => {
              setOpenAddMenu(null);
              redo();
            }}
            title="Redo"
            type="button"
          >
            <RedoIcon width={18} height={18} />
          </button>
        </div>

        <div className="viewport-rail viewport-rail--right">
          <button className="viewport-rail__button" onClick={() => setCameraPreset("perspective")} title="Perspective view" type="button">
            <PerspectiveIcon width={18} height={18} />
          </button>
          <button className="viewport-rail__button" onClick={() => setCameraPreset("top")} title="Top view" type="button">
            <TopViewIcon width={18} height={18} />
          </button>
          {isIos ? (
            <button
              className="viewport-rail__button"
              disabled={arExporting}
              onClick={() => void handleOpenArView()}
              title={arExporting ? "Preparing AR…" : "View in AR"}
              type="button"
            >
              <ArIcon width={18} height={18} />
            </button>
          ) : null}
          <button className={`viewport-rail__button ${showHelp ? "viewport-rail__button--active" : ""}`} onClick={() => setShowHelp((value) => !value)} title="Help" type="button">
            <HelpIcon width={18} height={18} />
          </button>
          <button
            className={`viewport-rail__button ${buildPreviewEnabled ? "viewport-rail__button--active" : ""}`}
            onClick={() => {
              const nextEnabled = !buildPreviewEnabled;
              setBuildPreviewEnabled(nextEnabled);
              if (!nextEnabled) {
                setBuildPlaybackActive(false);
              }
            }}
            title="Build sequence"
            type="button"
          >
            <BuildSequenceIcon width={18} height={18} />
          </button>
        </div>

        {showHelp ? (
          <div className="viewport-help">
            <strong>Help</strong>
            <span>Drag to orbit the camera.</span>
            <span>Use move and rotate for gizmos.</span>
            <span>Use resize to drag the yellow handles.</span>
            <span>Use measure to click two grid points or object corners.</span>
            <span>Units and snap live in the project settings.</span>
          </div>
        ) : null}

        {buildPreviewEnabled ? (
          <div className="build-sequence-panel">
            <div className="build-sequence-panel__header">
              <strong>Build Sequence</strong>
              <span>
                Step {buildPreviewStep} / {maxBuildOrder} · {visibleBuildParts} visible
              </span>
            </div>
            <div className="build-sequence-panel__controls">
              <button
                className="build-sequence-panel__icon"
                disabled={buildPreviewStep <= 0}
                onClick={() => setBuildPreviewStep(buildPreviewStep - 1)}
                title="Previous step"
                type="button"
              >
                <span aria-hidden="true">−</span>
              </button>
              <input
                aria-label="Build sequence step"
                max={maxBuildOrder}
                min={0}
                onChange={(event) => setBuildPreviewStep(Number(event.target.value))}
                type="range"
                value={Math.min(buildPreviewStep, maxBuildOrder)}
              />
              <button
                className="build-sequence-panel__icon"
                disabled={buildPreviewStep >= maxBuildOrder}
                onClick={() => setBuildPreviewStep(buildPreviewStep + 1)}
                title="Next step"
                type="button"
              >
                <span aria-hidden="true">+</span>
              </button>
              <button
                className="build-sequence-panel__play"
                disabled={maxBuildOrder === 0}
                onClick={() => {
                  if (buildPreviewStep >= maxBuildOrder) {
                    setBuildPreviewStep(0);
                  }
                  setBuildPlaybackActive((value) => !value);
                }}
                title={buildPlaybackActive ? "Pause build animation" : "Play build animation"}
                type="button"
              >
                {buildPlaybackActive ? <PauseIcon width={15} height={15} /> : <PlayIcon width={15} height={15} />}
                <span>{buildPlaybackActive ? "Pause" : "Play"}</span>
              </button>
            </div>
          </div>
        ) : null}

        {selectedPart ? (
          <div className="viewport-context-bar">
            <button className="viewport-context-bar__button" onClick={duplicateSelectedPart} type="button">
              <DuplicateIcon width={16} height={16} />
              <span>Duplicate</span>
            </button>
            <button className="viewport-context-bar__button viewport-context-bar__button--danger" onClick={deleteSelectedPart} type="button">
              <TrashIcon width={16} height={16} />
              <span>Delete</span>
            </button>
          </div>
        ) : selectedMeasurement ? (
          <div className="viewport-context-bar">
            <button className="viewport-context-bar__button viewport-context-bar__button--danger" onClick={deleteSelectedMeasurement} type="button">
              <TrashIcon width={16} height={16} />
              <span>Delete</span>
            </button>
          </div>
        ) : null}

        <Canvas shadows camera={{ fov: 38, near: 1, far: 12000 }}>
          <Scene />
        </Canvas>
      </div>
    </section>
  );
}
