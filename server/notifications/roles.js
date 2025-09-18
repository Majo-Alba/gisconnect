// server/notifications/roles.js
const FULL_ACCESS = new Set([
    "majo_test@gmail.com",
    // "ventas@greenimportsol.com",
    // "info@greenimportsol.com",
  ]);
  
  const ADMIN_FACTURAS_Y_LOGISTICA = new Set([
    "majo_test@gmail.com",
    // "administracion@greenimportsol.com",
    // "administracion2@greenimportsol.com",
  ]);
  
  const LOGISTICA_Y_ALMACEN = new Set([
    "majo_test@gmail.com",
    // "logistica@greenimportsol.com",
    // "almacen@greenimportsol.com",
    // "almacen2@greenimportsol.com",
  ]);
  
  const ALMACEN_LIMITADO = new Set([
    "majo_test@gmail.com",
    // "almacen3@greenimportsol.com",
  ]);
  
  const STAGES = {
    PEDIDO_REALIZADO: "PEDIDO_REALIZADO",       // <-- NEW
    EVIDENCIA_DE_PAGO: "EVIDENCIA_DE_PAGO",
    PAGO_VERIFICADO: "PAGO_VERIFICADO",
    PREPARANDO_PEDIDO: "PREPARANDO_PEDIDO",
    ETIQUETA_GENERADA: "ETIQUETA_GENERADA",
    PEDIDO_ENTREGADO: "PEDIDO_ENTREGADO",
  };
  
  function recipientsForStage(stage) {
    const emails = new Set();
    switch (stage) {
      case STAGES.PEDIDO_REALIZADO:            // <-- NEW
        FULL_ACCESS.forEach(e => emails.add(e));
        break;
  
      case STAGES.EVIDENCIA_DE_PAGO:
        FULL_ACCESS.forEach(e => emails.add(e));
        break;
  
      case STAGES.PAGO_VERIFICADO:
        ADMIN_FACTURAS_Y_LOGISTICA.forEach(e => emails.add(e));
        LOGISTICA_Y_ALMACEN.forEach(e => emails.add(e));
        ALMACEN_LIMITADO.forEach(e => emails.add(e));
        break;
  
      case STAGES.PREPARANDO_PEDIDO:
        ADMIN_FACTURAS_Y_LOGISTICA.forEach(e => emails.add(e));
        break;
  
      case STAGES.ETIQUETA_GENERADA:
        LOGISTICA_Y_ALMACEN.forEach(e => emails.add(e));
        break;
  
      case STAGES.PEDIDO_ENTREGADO:
        FULL_ACCESS.forEach(e => emails.add(e));
        break;
    }
    return [...emails];
  }
  
  module.exports = { STAGES, recipientsForStage };
  