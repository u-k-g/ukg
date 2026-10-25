import { createEffect } from "solid-js";
import { CV_H, CV_W, SCALE, bitmapCanvas, canvasPos, drawTag, hitAxis } from "./printer.ts";
import type { PlacedBitmap, PrintOptions } from "./printer.ts";

export function Preview(props: {
  id?: string;
  label: string;
  options: PrintOptions;
  bitmap: PlacedBitmap | null;
  guides: boolean;
  onOffset: (axis: "x" | "y", dots: number) => void;
}) {
  let canvas!: HTMLCanvasElement;
  let drag: { axis: "x" | "y"; pointer: number; dots: number } | null = null;
  createEffect(() => {
    drawTag(canvas, props.options, props.bitmap, props.guides);
    if (!props.guides) {
      drag = null;
      canvas.style.cursor = "default";
    }
  });
  const axisAt = (event: PointerEvent) => {
    const p = canvasPos(event, canvas, props.options);
    return {
      p,
      axis: hitAxis(p.x, p.y, canvas.getBoundingClientRect().width, props.options, props.guides),
    };
  };
  const endDrag = (event: PointerEvent) => {
    drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  return (
    <canvas
      ref={(element) => {
        canvas = element;
      }}
      id={props.id}
      width={CV_W}
      height={CV_H}
      role="img"
      aria-label={props.label}
      onPointerDown={(event) => {
        const { p, axis } = axisAt(event);
        if (!axis) return;
        drag = {
          axis,
          pointer: p[axis],
          dots: axis === "x" ? props.options.offsetX : props.options.offsetY,
        };
        canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const { p, axis } = axisAt(event);
        if (drag)
          props.onOffset(drag.axis, drag.dots + ((p[drag.axis] - drag.pointer) * 203) / SCALE);
        else
          canvas.style.cursor = axis === "x" ? "ew-resize" : axis === "y" ? "ns-resize" : "default";
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  );
}

export function WireBitmap(props: { bitmap: PlacedBitmap | null }) {
  let canvas!: HTMLCanvasElement;
  createEffect(() => {
    const image = props.bitmap ? bitmapCanvas(props.bitmap) : null;
    canvas.width = image ? image.width : 1;
    canvas.height = image ? image.height : 1;
    if (image) canvas.getContext("2d")!.drawImage(image, 0, 0);
  });
  return (
    <canvas
      ref={(element) => {
        canvas = element;
      }}
      id="wireBitmap"
      width="1"
      height="1"
      role="img"
      aria-label="Exact monochrome bitmap sent over USB, without preview guides"
    />
  );
}
