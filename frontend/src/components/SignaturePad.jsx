import { forwardRef } from "react";
import SignatureCanvas from "react-signature-canvas";

const SignaturePad = forwardRef(function SignaturePad({ onClear }, ref) {
  return (
    <div className="signature-pad">
      <SignatureCanvas
        ref={ref}
        penColor="#172033"
        clearOnResize={false}
        canvasProps={{ className: "signature-canvas" }}
      />
      <div className="signature-pad-actions">
        <button type="button" className="secondary small" onClick={() => { ref.current?.clear(); onClear?.(); }}>
          Clear
        </button>
      </div>
    </div>
  );
});

export default SignaturePad;
