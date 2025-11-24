// server/notifications/roles.js

const FULL_ACCESS = new Set([
  "majo_test@gmail.com",
  "ventas@greenimportsol.com",
  "info@greenimportsol.com",
]);

const ADMIN_FACTURAS_Y_LOGISTICA = new Set([
  "majo_test@gmail.com",
  "administracion@greenimportsol.com",
  "administracion2@greenimportsol.com",
]);

const LOGISTICA_Y_ALMACEN = new Set([
  "majo_test@gmail.com",
  "logistica@greenimportsol.com",
  "almacen@greenimportsol.com",
  "almacen2@greenimportsol.com",
  "almacen3@greenimportsol.com",
]);

const ALMACEN_LIMITADO = new Set([
  "majo_test@gmail.com",
  // "almacen3@greenimportsol.com",
]);

// Keep the enum exactly as used across the codebase
const STAGES = {
  PEDIDO_REALIZADO: "PEDIDO_REALIZADO",
  EVIDENCIA_DE_PAGO: "EVIDENCIA_DE_PAGO",
  PAGO_VERIFICADO: "PAGO_VERIFICADO",
  PREPARANDO_PEDIDO: "PREPARANDO_PEDIDO",
  ETIQUETA_GENERADA: "ETIQUETA_GENERADA",
  PEDIDO_ENTREGADO: "PEDIDO_ENTREGADO",
};

// Small helper to add a whole set into another
function addAll(targetSet, sourceSet) {
  for (const e of sourceSet) targetSet.add(String(e).trim().toLowerCase());
}

function recipientsForStage(stage) {
  const emails = new Set();
  switch (stage) {
    case STAGES.PEDIDO_REALIZADO:
      // Currently only FULL_ACCESS. If you want Ops to see it too, uncomment:
      // addAll(emails, ADMIN_FACTURAS_Y_LOGISTICA);
      // addAll(emails, LOGISTICA_Y_ALMACEN);
      addAll(emails, FULL_ACCESS);
      break;

    case STAGES.EVIDENCIA_DE_PAGO:
      addAll(emails, FULL_ACCESS);
      break;

    case STAGES.PAGO_VERIFICADO:
      addAll(emails, ADMIN_FACTURAS_Y_LOGISTICA);
      addAll(emails, LOGISTICA_Y_ALMACEN);
      addAll(emails, ALMACEN_LIMITADO);
      addAll(emails, FULL_ACCESS);
      break;

    case STAGES.PREPARANDO_PEDIDO:
      addAll(emails, ADMIN_FACTURAS_Y_LOGISTICA);
      addAll(emails, FULL_ACCESS);
      break;

    case STAGES.ETIQUETA_GENERADA:
      addAll(emails, LOGISTICA_Y_ALMACEN);
      addAll(emails, FULL_ACCESS);
      break;

    case STAGES.PEDIDO_ENTREGADO:
      addAll(emails, FULL_ACCESS);
      break;

    default:
      console.warn(`[recipientsForStage] Unknown stage: "${stage}"`);
      // Optionally default to FULL_ACCESS so nothing is silently dropped:
      // addAll(emails, FULL_ACCESS);
      break;
  }
  return [...emails];
}

module.exports = { STAGES, recipientsForStage };

// // server/notifications/roles.js
// const FULL_ACCESS = new Set([
//     "majo_test@gmail.com",
//     "ventas@greenimportsol.com",
//     "info@greenimportsol.com",
//   ]);
  
//   const ADMIN_FACTURAS_Y_LOGISTICA = new Set([
//     "majo_test@gmail.com",
//     "administracion@greenimportsol.com",
//     "administracion2@greenimportsol.com",
//   ]);
  
//   const LOGISTICA_Y_ALMACEN = new Set([
//     "majo_test@gmail.com",
//     "logistica@greenimportsol.com",
//     "almacen@greenimportsol.com",
//     "almacen2@greenimportsol.com",
//   ]);
  
//   const ALMACEN_LIMITADO = new Set([
//     "majo_test@gmail.com",
//     "almacen3@greenimportsol.com",
//   ]);
  
//   const STAGES = {
//     PEDIDO_REALIZADO: "PEDIDO_REALIZADO",
//     EVIDENCIA_DE_PAGO: "EVIDENCIA_DE_PAGO",
//     PAGO_VERIFICADO: "PAGO_VERIFICADO",
//     PREPARANDO_PEDIDO: "PREPARANDO_PEDIDO",
//     ETIQUETA_GENERADA: "ETIQUETA_GENERADA",
//     PEDIDO_ENTREGADO: "PEDIDO_ENTREGADO",
//   };
  
//   function recipientsForStage(stage) {
//     const emails = new Set();
//     switch (stage) {
//       case STAGES.PEDIDO_REALIZADO:
//         FULL_ACCESS.forEach(e => emails.add(e));
//         break;
//       case STAGES.EVIDENCIA_DE_PAGO:
//         FULL_ACCESS.forEach(e => emails.add(e));
//         break;
//       case STAGES.PAGO_VERIFICADO:
//         ADMIN_FACTURAS_Y_LOGISTICA.forEach(e => emails.add(e));
//         LOGISTICA_Y_ALMACEN.forEach(e => emails.add(e));
//         ALMACEN_LIMITADO.forEach(e => emails.add(e));
//         break;
//       case STAGES.PREPARANDO_PEDIDO:
//         ADMIN_FACTURAS_Y_LOGISTICA.forEach(e => emails.add(e));
//         break;
//       case STAGES.ETIQUETA_GENERADA:
//         LOGISTICA_Y_ALMACEN.forEach(e => emails.add(e));
//         break;
//       case STAGES.PEDIDO_ENTREGADO:
//         FULL_ACCESS.forEach(e => emails.add(e));
//         break;
//     }
//     return [...emails];
//   }
  
//   module.exports = { STAGES, recipientsForStage };
  