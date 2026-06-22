// ── Utilidades PDF centralizadas ──
// Cargado ANTES que informes.js (ver app.html). Reemplaza progresivamente las ~7
// copias del cargador de jsPDF y los helpers de cabecera/color repartidos por módulo.

// Carga jsPDF + autotable on-demand
window.pdfEnsureLibs = async function () {
  // Comprueba jsPDF y autotable por separado (no basta con que jsPDF exista: autotable
  // puede faltar). Mismas URLs/versiones que producción (informes.js): jsPDF 2.5.1 +
  // autotable 3.5.23 — NO cambiar sin verificar el render de tablas en todos los módulos.
  const load = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
  if (typeof window.jspdf === 'undefined') {
    await load('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  }
  const jsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!jsPDF) throw new Error('No se pudo cargar jsPDF.');
  if (!(jsPDF.API && typeof jsPDF.API.autoTable === 'function')) {
    await load('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js');
  }
};

// Info del centro (logo, color, nombre) — cacheada por sesión
window.pdfCentroInfo = async function () {
  if (window._pdfCentroCache) return window._pdfCentroCache;
  const { data } = await window.sb.from('centros').select('nombre,logo_url,color_primario').eq('id', window.ctrId).single();
  window._pdfCentroCache = data || {};
  return window._pdfCentroCache;
};

// Hex a RGB
window.pdfHexToRgb = function (hex) {
  hex = (hex || '1a73e8').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
};

// Cabecera estándar de PDF con logo y color del centro. Devuelve la Y inicial tras la cabecera.
window.pdfHeader = async function (doc, titulo, subtitulo) {
  const centro = await pdfCentroInfo();
  const [r, g, b] = pdfHexToRgb(centro.color_primario);
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text(centro.nombre || 'DidactIA', 14, 10);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(titulo || '', 14, 17);
  if (subtitulo) doc.text(subtitulo, 196, 17, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  return 28;
};
