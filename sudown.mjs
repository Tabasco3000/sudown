// sudown: abre un Chrome aparte con tu sesión de Suno, graba una canción en silencio, la deja en ~/Downloads y cierra ese Chrome.
// Uso: node sudown.mjs "<link o id de Suno>" [segundos, por defecto la canción completa]
//      node sudown.mjs --login   → abre ese Chrome para iniciar sesión en Suno (solo la primera vez).
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, renameSync, rmSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const perfil = join(homedir(), '.sudown', 'chrome-suno'); // Chrome propio de SuDown, fuera del paquete: no toca tus otros Chrome y no se sube
const descargas = join(homedir(), 'Downloads');
const chromeBin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dormir = ms => new Promise(r => setTimeout(r, ms));
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

// Actualizador: si SuDown se instaló desde GitHub (esta carpeta es un clon), baja la versión nueva una vez al día
// y se vuelve a correr con ella. En la Mac de quien lo mantiene (la carpeta no es clon) no hace nada.
const marca = join(homedir(), '.sudown', 'ultima-revision');
if (existsSync(join(aqui, '.git')) && !process.env.SUDOWN_YA_REVISO
    && (!existsSync(marca) || Date.now() - statSync(marca).mtimeMs > 24 * 3600e3)) {
  mkdirSync(dirname(marca), { recursive: true }); writeFileSync(marca, '');
  const antes = spawnSync('git', ['-C', aqui, 'rev-parse', 'HEAD']).stdout?.toString();
  spawnSync('git', ['-C', aqui, 'pull', '-q', '--ff-only'], { timeout: 20000 });
  if (spawnSync('git', ['-C', aqui, 'rev-parse', 'HEAD']).stdout?.toString() !== antes) {
    console.log('SuDown se actualizó.');
    const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, SUDOWN_YA_REVISO: '1' } });
    process.exit(r.status ?? 1);
  }
}

if (!existsSync(chromeBin)) { console.log('Falta Google Chrome: bájalo de google.com/chrome e instálalo.'); process.exit(1); }
if (typeof WebSocket === 'undefined') { console.log('Tu Node es viejo: instala la versión 22 o más nueva desde nodejs.org.'); process.exit(1); }

const [entrada, segArg] = process.argv.slice(2);
if (!entrada) { console.log('Uso: node sudown.mjs "<link o id de Suno>" [segundos]  |  node sudown.mjs --login'); process.exit(1); }
const login = entrada === '--login';
let id = login ? null : entrada.match(UUID)?.[0];
// Link corto de «Compartir» (suno.com/s/…): se sigue hasta la canción. Solo links de suno.com.
if (!login && !id && /^https:\/\/(www\.)?suno\.com\//.test(entrada)) id = (await fetch(entrada).then(r => r.url).catch(() => '')).match(UUID)?.[0];
if (!login && !id) { console.log(`No encontré la canción en: ${entrada}`); process.exit(1); }
const segundos = Number(segArg) > 0 ? Number(segArg) : 600; // sin segundos: hasta que la canción se acabe

// En Mac, Chrome sigue vivo sin ventanas: si quedó abierto el de SuDown (p. ej. tras --login), se cierra antes. Solo ese perfil.
const patron = `--user-data-dir=${perfil.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`;
spawnSync('pkill', ['-f', patron]);
for (let i = 0; i < 40 && spawnSync('pgrep', ['-f', patron]).status === 0; i++) await dormir(250);
const archivoPuerto = join(perfil, 'DevToolsActivePort');
rmSync(archivoPuerto, { force: true });

const chrome = spawn(chromeBin, [
  // Puerto de control al azar (0) y solo mientras graba; al iniciar sesión, sin control remoto (Google lo rechaza).
  `--user-data-dir=${perfil}`, ...(login ? [] : ['--remote-debugging-port=0']),
  '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check',
  // Sin esto, Chrome pausa el audio silenciado si la ventana queda detrás de otra («paused to save power»).
  '--disable-background-media-suspend', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  login ? 'https://suno.com' : `https://suno.com/song/${id}`,
], { stdio: 'ignore' });
if (login) { console.log('Inicia sesión en Suno con tu cuenta en esa ventana y luego ciérrala.'); process.exit(0); }

// Pase lo que pase (error, Ctrl+C, se detiene en segundo plano, se tarda de más), el Chrome de SuDown se cierra.
let ws, cerrando = false;
const morir = (texto, codigo) => { if (texto) console.log(texto); cerrando = true; try { ws?.close(); } catch {} chrome.kill(); process.exit(codigo); };
process.on('SIGINT', () => morir('Cancelado.', 130));
process.on('SIGTERM', () => morir('Cancelado.', 143));
process.on('uncaughtException', e => morir(`Error: ${e.message}`, 1));
process.on('unhandledRejection', e => morir(`Error: ${e?.message ?? e}`, 1));
setTimeout(() => morir('Se tardó demasiado; cerré Chrome.', 6), (Math.min(segundos, 600) + 120) * 1000);

// --- Conexión con ese Chrome (protocolo de DevTools) ---
let puerto;
for (let i = 0; i < 60 && !puerto; i++) { await dormir(250); puerto = existsSync(archivoPuerto) && readFileSync(archivoPuerto, 'utf8').split('\n')[0]; }
let lista;
for (let i = 0; i < 40 && puerto && !lista?.some(t => t.url.includes(id)); i++) { await dormir(250); lista = await fetch(`http://127.0.0.1:${puerto}/json`).then(r => r.json()).catch(() => null); }
const pagina = lista?.find(t => t.type === 'page' && t.url.includes(id));
if (!pagina) morir('No pude conectarme al Chrome de SuDown.', 1);
ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
ws.addEventListener('close', () => { if (!cerrando) morir('Se cerró el Chrome de SuDown antes de terminar.', 5); });
let n = 0; const pend = new Map();
const descarga = {}; // la descarga del WAV: su nombre interno (guid) y si ya terminó
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.method === 'Browser.downloadWillBegin' && m.params.suggestedFilename.endsWith('.wav')) descarga.guid = m.params.guid;
  if (m.method === 'Browser.downloadProgress' && m.params.state === 'completed' && m.params.guid === descarga.guid) descarga.lista = true;
  pend.get(m.id)?.(m); pend.delete(m.id);
});
const cdp = (method, params = {}) => new Promise(r => { const i = ++n; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expression) => {
  const r = (await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result;
  if (r?.exceptionDetails) console.log('Error en la página:', r.exceptionDetails.exception?.description?.split('\n')[0] ?? r.exceptionDetails.text);
  return r?.result?.value;
};
// Chrome se cierra sin contestar a Browser.close: se espera 1 s como mucho.
const cerrar = async (texto, codigo) => { cerrando = true; await Promise.race([cdp('Browser.close'), dormir(1000)]); morir(texto, codigo); };

// Chrome guarda el archivo con un nombre interno; el nombre final lo pone este script, sin pisar ninguno que ya exista.
await cdp('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: descargas, eventsEnabled: true });

// Espera a que cargue la canción. Si no aparece su botón de Play, falta la sesión.
let listo = false;
for (let i = 0; i < 40 && !listo; i++) { await dormir(500); listo = await js(`!!document.querySelector('button[aria-label="Play"]') && document.title.includes('| Suno')`); }
if (!listo) await cerrar('No cargó la canción. ¿Falta iniciar sesión? Corre: node sudown.mjs --login', 2);

await js(readFileSync(join(aqui, 'grabar-pestana.js'), 'utf8'));          // silencia la pestaña y prepara la grabadora
// Clic en Play hasta que la canción cargue (a veces el primer clic no alcanza): hasta 20 s, otro clic cada 4 s.
let cargada = false;
for (let i = 0; i < 80 && !cargada; i++) {
  if (i % 16 === 0) await js(`document.querySelector('button[aria-label="Play"]')?.click()`);
  await dormir(250);
  cargada = await js(`[...document.querySelectorAll('audio')].some(a => a.duration > 1)`);
}
console.log(`Grabando «${await js(`document.title.replace(/ \\| Suno$/, '').replace(/ by [^ ]+$/, '')`)}»…`);
await js(`window.sunoGrabar(${segundos})`);                                  // regresa cuando termina
const estado = await js('window.sunoEstado');
if (estado?.estado !== 'terminado') await cerrar(`Falló: ${JSON.stringify(estado)}`, 3);

// Espera a que Chrome termine de escribir el archivo y le pone su nombre («Título (N s).wav», « 2», « 3»… si ya existe).
for (let i = 0; i < 80 && !descarga.lista; i++) await dormir(250);
if (!descarga.lista) await cerrar('Chrome no terminó de guardar el archivo.', 4);
let ruta = join(descargas, estado.archivo);
for (let k = 2; existsSync(ruta); k++) ruta = join(descargas, estado.archivo.replace(/\.wav$/, ` ${k}.wav`));
try { renameSync(join(descargas, descarga.guid), ruta); } catch { ruta = join(descargas, descarga.guid); }
if (estado.pico < 0.001) await cerrar(`OJO: la grabación salió en silencio (${ruta}).`, 7);
await cerrar(`Guardada: ${ruta}`, 0);
