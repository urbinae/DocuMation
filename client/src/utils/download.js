/**
 * Función utilitaria para forzar la descarga directa de archivos (PDFs, ZIP, etc.)
 * en lugar de navegar o abrir la URL de la API en el navegador.
 *
 * @param {Event|null} e Evento de clic
 * @param {string} url URL completa o relativa del recurso a descargar
 * @param {string} defaultFilename Nombre deseado para el archivo descargado
 */
export async function handleDirectDownload(e, url, defaultFilename = 'recibo.pdf') {
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Error en la descarga (${res.status})`);
    }

    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = defaultFilename;
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.warn('Fallback a descarga directa por enlace:', err);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultFilename;
    link.target = '_self';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
