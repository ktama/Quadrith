import { describe, expect, it } from "vitest";
import { planSwitch } from "./switchPlan";

describe("planSwitch", () => {
  it("move copies then deletes the old file", () => {
    expect(planSwitch("move")).toEqual({
      copyOldToNew: true,
      removeExistingNew: false,
      deleteOldAfter: true,
    });
  });

  it("overwrite removes the existing target then copies, keeping the old", () => {
    expect(planSwitch("overwrite")).toEqual({
      copyOldToNew: true,
      removeExistingNew: true,
      deleteOldAfter: false,
    });
  });

  it("createNew performs no file operations", () => {
    expect(planSwitch("createNew")).toEqual({
      copyOldToNew: false,
      removeExistingNew: false,
      deleteOldAfter: false,
    });
  });

  it("openExisting performs no file operations", () => {
    expect(planSwitch("openExisting")).toEqual({
      copyOldToNew: false,
      removeExistingNew: false,
      deleteOldAfter: false,
    });
  });

  it("never deletes the old file unless it was copied first", () => {
    for (const mode of ["move", "createNew", "openExisting", "overwrite"] as const) {
      const p = planSwitch(mode);
      if (p.deleteOldAfter) expect(p.copyOldToNew).toBe(true);
    }
  });
});
