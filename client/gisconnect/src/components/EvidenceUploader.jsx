import { useRef, useState } from "react";
import axios from "axios";
import { API } from "/src/lib/api";

export default function EvidenceUploader({
  orderId,
  kind,                 // "payment" | "packing" | "delivery"
  multiple = false,     // packing = true
  accept = "image/*,application/pdf",
  max = 3,              // packing cap
  onUploaded,           // (payload) => void
  buttonLabel = "Subir evidencia",
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState(0);

  const openPicker = () => inputRef.current?.click();

  const handleChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setErr("");
    setBusy(true);
    setProgress(0);

    try {
      if (kind === "packing") {
        const form = new FormData();
        files.slice(0, max).forEach((f) => form.append("files", f));
        const res = await axios.post(`${API}/orders/${orderId}/evidence/packing`, form, {
          onUploadProgress: (pe) => {
            if (!pe.total) return;
            setProgress(Math.round((pe.loaded / pe.total) * 100));
          },
        });
        onUploaded?.(res.data);
      } else {
        const form = new FormData();
        form.append("file", files[0]);
        const res = await axios.post(`${API}/orders/${orderId}/evidence/${kind}`, form, {
          onUploadProgress: (pe) => {
            if (!pe.total) return;
            setProgress(Math.round((pe.loaded / pe.total) * 100));
          },
        });
        onUploaded?.(res.data);
      }
    } catch (e) {
      console.error("Upload error", e);
      setErr(e?.response?.data?.error || e.message || "Error al subir evidencia.");
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 600);
      e.target.value = ""; // reset picker
    }
  };

  return (
    <div className="evidence-uploader" style={{ display: "grid", gap: 8 }}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        style={{ display: "none" }}
      />
      <button
        type="button"
        className="quoter-AddMoreButton"
        onClick={openPicker}
        disabled={busy}
        style={{ padding: "10px 14px", borderRadius: 10 }}
      >
        {busy ? "Subiendo..." : buttonLabel}
      </button>
      {progress > 0 && (
        <div style={{ fontSize: 12 }}>
          Progreso: {progress}%
        </div>
      )}
      {err && <div style={{ color: "#b00", fontSize: 12 }}>{err}</div>}
      <div style={{ fontSize: 11, color: "#666" }}>
        Archivos permitidos: imágenes / PDF. Límite aprox. 25 MB por archivo.
      </div>
    </div>
  );
}
