// Impression et export PDF des documents commerciaux.
//
// Un seul document sert d'original : celui déjà rendu à l'écran. On le clone
// dans un conteneur de premier niveau, la feuille papier de styles.css se
// charge de la mise en page, et le navigateur pagine. Rien n'est redessiné,
// donc l'aperçu, la sortie imprimante et le PDF ne peuvent pas diverger.
//
// « Enregistrer au format PDF » depuis la boîte d'impression produit le
// fichier : le titre du document donne le nom proposé.

const HOST_ID = 'print-root';

const filename = (value: string) => value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();

// Les images du clone viennent du cache, mais une signature tout juste
// téléversée peut ne pas être décodée : sans cette attente elle sort blanche.
const ready = (root: HTMLElement) =>
  Promise.all(
    Array.from(root.querySelectorAll('img')).map(image =>
      image.complete ? Promise.resolve() : image.decode().catch(() => undefined),
    ),
  );

export async function printDocument(sourceId: string, title: string, footer?: string) {
  const source = document.getElementById(sourceId);
  if (!source) return;
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.appendChild(source.cloneNode(true));
  if (footer) {
    const note = document.createElement('div');
    note.className = 'print-page-footer';
    note.textContent = footer;
    host.appendChild(note);
  }
  document.body.appendChild(host);

  const previousTitle = document.title;
  document.title = filename(title);
  document.body.classList.add('is-printing');

  const cleanup = () => {
    document.body.classList.remove('is-printing');
    document.title = previousTitle;
    host.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  await ready(host);
  window.print();
  // Safari ne déclenche pas toujours afterprint : filet de sécurité.
  setTimeout(cleanup, 1000);
}
