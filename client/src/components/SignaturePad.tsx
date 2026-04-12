import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Point = {
  x: number;
  y: number;
};

type SignaturePadProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function SignaturePad({ value, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const [isEmpty, setIsEmpty] = useState(!value);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(wrapper.clientWidth, 320);
    const height = 180;

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2;
    context.strokeStyle = "#0f172a";
    context.clearRect(0, 0, width, height);

    if (!value) {
      setIsEmpty(true);
      return;
    }

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      setIsEmpty(false);
    };
    image.src = value;
  }, [value]);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  };

  const beginStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const point = getPoint(event);
    lastPointRef.current = point;
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const continueStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const point = getPoint(event);
    const previousPoint = lastPointRef.current ?? point;
    context.beginPath();
    context.moveTo(previousPoint.x, previousPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPointRef.current = point;
    setIsEmpty(false);
  };

  const endStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    drawingRef.current = false;
    lastPointRef.current = null;
    canvas?.releasePointerCapture(event.pointerId);
    if (canvas) {
      onChange(canvas.toDataURL("image/png"));
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    onChange("");
  };

  return (
    <div className="space-y-3">
      <div
        ref={wrapperRef}
        className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={beginStroke}
          onPointerMove={continueStroke}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          className="touch-none"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {isEmpty ? "Draw your signature here." : "Signature captured electronically."}
        </p>
        <Button type="button" variant="outline" className="rounded-xl" onClick={clearSignature}>
          Clear
        </Button>
      </div>
    </div>
  );
}
