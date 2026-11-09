// grabar-pestana.js (SuDown): graba la canción de una página de Suno desde la propia pestaña, sin que suene en las bocinas.
// sudown.mjs lo corre dentro de la pestaña de Suno. Dos pasos:
//   1) ANTES del clic en Play: correr este archivo completo (silencia la pestaña y deja lista window.sunoGrabar).
//   2) Después del clic en Play: window.sunoGrabar(SEGUNDOS) → graba y regresa al terminar.
//      window.sunoEstado → {estado, segundos, archivo}. Al terminar pausa la canción, le regresa el sonido a la pestaña y baja el WAV a ~/Downloads como «Título (N s).wav».
(() => {
  // Todo audio de la página nace y se queda en silencio: la grabación sale del audio, no de las bocinas.
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    this.muted = true;
    return window.sunoFin ? Promise.resolve() : play.call(this); // al terminar, Suno no puede poner la siguiente
  };
  document.addEventListener('play', e => { if (window.sunoFin) e.target.pause(); }, true);
  document.querySelectorAll('audio,video').forEach(a => { a.muted = true; });

  window.sunoEstado = { estado: 'listo' };
  window.sunoGrabar = async (segundos) => {
    const a = [...document.querySelectorAll('audio')].find(x => x.duration > 1);
    if (!a) return (window.sunoEstado = { estado: 'error', motivo: 'no hay canción cargada: falta el clic en Play' });
    a.muted = true; a.currentTime = 0;
    if (a.paused) await a.play();

    const ctx = new AudioContext({ sampleRate: 48000 });
    const fuente = ctx.createMediaStreamSource(a.captureStream());
    const proc = ctx.createScriptProcessor(4096, 2, 2);
    const cero = ctx.createGain(); cero.gain.value = 0;
    const L = [], R = []; let frames = 0, pico = 0; const total = segundos * 48000;
    window.sunoEstado = { estado: 'grabando', segundos: 0 };

    await new Promise(fin => {
      proc.onaudioprocess = e => {
        if (frames >= total) return;
        if (a.paused && !a.ended) a.play(); // si algo la pausa a medias, sigue
        const l = new Float32Array(e.inputBuffer.getChannelData(0)), r = new Float32Array(e.inputBuffer.getChannelData(1));
        for (let i = 0; i < l.length; i += 64) pico = Math.max(pico, Math.abs(l[i]), Math.abs(r[i]));
        L.push(l); R.push(r);
        frames += e.inputBuffer.length;
        window.sunoEstado.segundos = Math.round(frames / 4800) / 10;
        if (frames >= total) fin();
      };
      a.addEventListener('ended', fin, { once: true });
      fuente.connect(proc); proc.connect(cero); cero.connect(ctx.destination);
    });
    // Al acabarse, Suno pone sola la siguiente canción: se bloquea 5 s y luego todo vuelve a la normal.
    window.sunoFin = true; a.pause(); ctx.close();
    setTimeout(() => {
      document.querySelectorAll('audio,video').forEach(x => { x.pause(); x.muted = false; });
      HTMLMediaElement.prototype.play = play; window.sunoFin = false;
    }, 5000);

    // WAV 48 kHz, 16 bits, estéreo.
    const n = Math.min(frames, total), buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf);
    const txt = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    txt(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); txt(8, 'WAVEfmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, 48000, true); v.setUint32(28, 192000, true);
    v.setUint16(32, 4, true); v.setUint16(34, 16, true); txt(36, 'data'); v.setUint32(40, n * 4, true);
    let o = 44, k = 0;
    for (let b = 0; b < L.length && k < n; b++) for (let i = 0; i < L[b].length && k < n; i++, k++) {
      for (const s of [L[b][i], R[b][i]]) { v.setInt16(o, Math.max(-1, Math.min(1, s)) * 0x7fff, true); o += 2; }
    }
    // Título tal como está en Suno («Mi canción by usuario | Suno» → «Mi canción»).
    const titulo = document.title.replace(/ \| Suno$/, '').replace(/ by [^ ]+$/, '').replace(/[\/:]/g, '-')
      .replace(/^[.\s]+/, '').slice(0, 150).trim() || 'Suno'; // sin punto al inicio (archivo oculto) ni nombres larguísimos
    const archivo = `${titulo} (${Math.round(n / 48000)} s).wav`;
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })), download: archivo });
    link.click();
    window.sunoEstado = { estado: 'terminado', segundos: n / 48000, archivo, pico };
  };
  return 'listo: da clic en Play y luego window.sunoGrabar(segundos)';
})();
