export function getSignatureDataUrl(canvasRef) {
  if (!canvasRef.current || canvasRef.current.isEmpty()) return null;
  // Deliberately not using getTrimmedCanvas() here — react-signature-canvas's
  // bundled trim-canvas dependency fails to interop under Vite's dep
  // pre-bundling ("import_trim_canvas.default is not a function"). A
  // full-canvas capture works fine; it just isn't cropped to the ink.
  return canvasRef.current.toDataURL("image/png");
}
