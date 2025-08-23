import axios from "axios";
import { API } from "/src/lib/api";

function isImageMime(m) {
  return /^image\//i.test(m || "");
}

export default function EvidenceGallery({
  orderId,
  deliveryEvidenceExt, // { key, filename, mimetype, ... }
  evidenceFileExt,     // payment
  packingEvidenceExt = [], // array
}) {
  const paymentUrl  = `${API}/orders/${orderId}/evidence/payment`;
  const deliveryUrl = `${API}/orders/${orderId}/evidence/delivery`;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Payment */}
      {evidenceFileExt && (
        <section>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Pago</div>
          <a href={paymentUrl} target="_blank" rel="noreferrer">
            {isImageMime(evidenceFileExt.mimetype)
              ? <img src={paymentUrl} alt="Pago" style={{ maxWidth: "100%", borderRadius: 8 }} />
              : <span>Descargar: {evidenceFileExt.filename || "pago"}</span>}
          </a>
        </section>
      )}

      {/* Delivery */}
      {deliveryEvidenceExt && (
        <section>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Entrega</div>
          <a href={deliveryUrl} target="_blank" rel="noreferrer">
            {isImageMime(deliveryEvidenceExt.mimetype)
              ? <img src={deliveryUrl} alt="Entrega" style={{ maxWidth: "100%", borderRadius: 8 }} />
              : <span>Descargar: {deliveryEvidenceExt.filename || "entrega"}</span>}
          </a>
        </section>
      )}

      {/* Packing list */}
      {Array.isArray(packingEvidenceExt) && packingEvidenceExt.length > 0 && (
        <section>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Empaquetado</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {packingEvidenceExt.map((f, i) => {
              const url = `${API}/orders/${orderId}/evidence/packing/${i}`;
              return (
                <a key={i} href={url} target="_blank" rel="noreferrer" style={{ textAlign: "center" }}>
                  {isImageMime(f.mimetype)
                    ? <img src={url} alt={`Empaque ${i+1}`} style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8 }} />
                    : <div style={{ width: 120, height: 120, display: "grid", placeItems: "center", border: "1px solid #ddd", borderRadius: 8 }}>Archivo {i+1}</div>}
                  <div style={{ fontSize: 12, marginTop: 4 }}>{f.filename || `archivo-${i+1}`}</div>
                </a>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
