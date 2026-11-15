// Prepare the file before the tap, so the download is the browser's native link action.
const PostcardExport = (() => {
  const link = document.getElementById('save-card');
  const preview = document.getElementById('card-preview');
  const image = document.getElementById('card-image');
  const open = document.getElementById('card-open');
  const share = document.getElementById('card-share');
  const retry = document.getElementById('card-retry');
  const status = document.getElementById('card-status');
  let revision = 0, objectUrl = '', file = null, current = null;

  function clear() {
    revision++;
    current = null; file = null;
    link.hidden = preview.hidden = share.hidden = retry.hidden = true;
    status.textContent = '';
    for (const a of [link, open]) a.removeAttribute('href');
    image.removeAttribute('src');
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = '';
  }

  async function prepare(world, draw, expanded = false) {
    clear();
    current = { world, draw };
    const version = revision;
    const filename = 'Doodle-Wheels-' + world + '.png';
    status.textContent = I18n.t('card.preparing');
    try {
      const canvas = document.createElement('canvas');
      draw(canvas);
      let blob = null;
      if (typeof canvas.toBlob === 'function') {
        try { blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); }
        catch (_) { /* Synchronous PNG encoding is available on older engines. */ }
      }
      if (version !== revision) return;
      let src;
      if (blob?.size && typeof URL.createObjectURL === 'function') {
        try { objectUrl = URL.createObjectURL(blob); } catch (_) {}
      }
      if (objectUrl) src = objectUrl;
      else {
        src = canvas.toDataURL('image/png');
        if (!src.startsWith('data:image/png;base64,iVBOR')) throw new Error('Empty PNG');
      }
      image.src = open.href = link.href = src;
      link.download = filename;
      image.alt = I18n.t('card.image');
      if (blob?.size && typeof File === 'function' && navigator.share && navigator.canShare) {
        try {
          const candidate = new File([blob], filename, { type:'image/png' });
          if (navigator.canShare({ files:[candidate] })) file = candidate;
        } catch (_) {}
      }
      share.hidden = !file;
      link.hidden = false;
      preview.hidden = !expanded;
      status.textContent = '';
    } catch (_) {
      if (version !== revision) return;
      status.textContent = I18n.t('card.error');
      retry.hidden = false;
    }
  }

  link.addEventListener('click', () => { preview.hidden = false; });
  retry.addEventListener('click', () => { if (current) prepare(current.world, current.draw, true); });
  share.addEventListener('click', async () => {
    if (!file) return;
    const version = revision;
    try { await navigator.share({files:[file]}); }
    catch (e) {
      if (version === revision && e?.name !== 'AbortError') status.textContent = I18n.t('card.shareFail');
    }
  });
  return { clear, prepare };
})();
