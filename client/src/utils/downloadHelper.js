export async function downloadPdfFile(fileUrl, fileName) {
  try {
    const res = await fetch(fileUrl);
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const name = fileName || 'documento.pdf';
    a.download = name.endsWith('.pdf') || name.endsWith('.zip') ? name : `${name}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (e) {
    window.open(fileUrl, '_blank');
  }
}
