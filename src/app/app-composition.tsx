import { getToolcraftFiniteArtboardRect } from "@/toolcraft/runtime";
import { composeToolcraftApp } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";
import {
  warpRasterFrameRenderer,
  warpVectorFrameRenderer,
} from "./warp/export-renderers";
import { WarpCanvas } from "./warp/warp-canvas";
import { warpRendererPipeline } from "./warp/warp-pipeline";

export const appComposition = composeToolcraftApp(appSchema, {
  renderer: { pipelineRegistration: warpRendererPipeline },
  scene: {
    canvasContent: <WarpCanvas />,
    rasterFrameRenderer: warpRasterFrameRenderer,
    renderDefaultCanvasMedia: false,
    // The product frame is the artboard-sized rect in both modes: warped
    // output is deterministically fitted inside it, so bounds derive from
    // exact state alone.
    sceneBoundsProvider: ({ state }) => [
      getToolcraftFiniteArtboardRect(state.canvas.size),
    ],
    vectorFrameRenderer: warpVectorFrameRenderer,
  },
});
