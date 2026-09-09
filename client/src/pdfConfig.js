/**
 * Configuración centralizada de PDF.js worker.
 * Usa el worker local (bundleado por Vite) en lugar de cargarlo desde CDN,
 * evitando errores de red y de módulos dinámicos no resueltos.
 */
import { pdfjs } from 'react-pdf';

// Usa new URL para que Vite copie el worker como asset estático
// y lo sirva desde el mismo origen (sin dependencia de CDN externo).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export { pdfjs };
