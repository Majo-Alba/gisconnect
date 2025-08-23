# Key Routes
GET   /healthz
GET   /orders/:id
PATCH /order/:id/status { orderStatus }
POST  /orders/:id/evidence/payment       (file field: "file" or "evidenceImage")
POST  /orders/:id/evidence/packing       (fields: "packingImages" or "files", up to 3)
POST  /orders/:id/evidence/delivery      (field: "deliveryImage" or "file")
PATCH /orders/:id                        (insuredAmount, deliveryDate, trackingNumber, etc.)
GET   /cache/products
GET   /cache/clients
GET   /cache/special-prices
GET   /cache/inventory-latest
