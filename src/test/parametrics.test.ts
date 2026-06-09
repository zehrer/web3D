import { describe, expect, it } from "vitest";
import { applyProjectParamBindings, evaluateExpression } from "../lib/parametrics";
import { createObjectPart, createProject } from "../lib/project";

describe("parametrics", () => {
  it("evaluates arithmetic expressions with variables", () => {
    const result = evaluateExpression("width - 2 * offset", [
      { id: "var-1", name: "width", valueMm: 1200 },
      { id: "var-2", name: "offset", valueMm: 25 },
    ]);

    expect(result).toEqual({ ok: true, value: 1150 });
  });

  it("supports safe helper functions", () => {
    const result = evaluateExpression("max(width, 800) + round(extra)", [
      { id: "var-1", name: "width", valueMm: 750 },
      { id: "var-2", name: "extra", valueMm: 12.4 },
    ]);

    expect(result).toEqual({ ok: true, value: 812 });
  });

  it("reports invalid expressions without throwing", () => {
    const result = evaluateExpression("width / 0", [
      { id: "var-1", name: "width", valueMm: 1200 },
    ]);

    expect(result.ok).toBe(false);
  });

  it("applies valid part bindings and leaves invalid bindings unchanged", () => {
    const part = {
      ...createObjectPart(0, {
        objectType: "cube",
        size: { x: 100, y: 100, z: 100 },
      }),
      id: "part-1",
      paramBindings: {
        "size.x": "width",
        "size.y": "missing + 10",
      },
    };
    const project = {
      ...createProject("Parametric"),
      variables: [{ id: "var-1", name: "width", valueMm: 600 }],
      parts: [part],
    };

    const next = applyProjectParamBindings(project);

    expect(next.parts[0].size.x).toBe(600);
    expect(next.parts[0].size.y).toBe(100);
  });
});
