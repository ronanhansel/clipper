import { describe, expect, it } from "vitest";

import {
  getDefaultPostProcessPackages,
  registerPostProcessPackage,
  type PostProcessPackage,
} from "./registry";
import type { UnknownPostProcessPass } from "../types";

describe("post-process package registry", () => {
  it("exposes external post-process package declarations", () => {
    const packageDefinition = {
      kind: "test.postprocess.external",
      createRenderer: () => ({ dispose: () => undefined }) as never,
      createExportRenderer: () => ({ render: async () => null }) as never,
      withFrameBackground: (pass) => pass,
    } satisfies PostProcessPackage<UnknownPostProcessPass>;

    registerPostProcessPackage(packageDefinition);

    expect(getDefaultPostProcessPackages()).toContain(packageDefinition);
  });
});
