# Decisions
- Storage: S3 for evidence instead of GridFS (cost, durability, scalable egress, presigned URLs).
- Hosting: Render for both backend and static frontend for simplicity.
- CSV access via server cache proxy to avoid CORS and rate/format issues.
- Shipping/Billing stored as objects in MongoDB (not arrays).
- Evidence metadata saved on Order: evidenceFileExt, packingEvidenceExt[], deliveryEvidenceExt.
