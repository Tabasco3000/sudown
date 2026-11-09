# SuDown

Graba una canción de tu cuenta de Suno para usarla de fondo en un video. No suena en tus bocinas, no gasta créditos de descarga y no toca lo demás que estés oyendo. Deja el archivo en Descargas como «Título (N s).wav».

## Instalar (Mac, una vez)

Necesitas Google Chrome y Node 22 o más nuevo (nodejs.org). En Terminal:

```
git clone https://github.com/Tabasco3000/sudown ~/.claude/skills/sudown
node ~/.claude/skills/sudown/sudown.mjs --login
```

Se abre un Chrome: entra a Suno con **tu** cuenta y ciérralo. Después, en Claude: «SuDown la de Mi canción, 60 segundos».

Se actualiza solo: al usarlo revisa si hay versión nueva, como mucho una vez al día.

## Qué trae

- `SKILL.md`: lo que Claude lee para usarlo.
- `sudown.mjs`: abre un Chrome propio (tu sesión de Suno vive en `~/.sudown/`, nunca en esta carpeta), graba y lo cierra.
- `grabar-pestana.js`: corre dentro de la página: silencia la pestaña y graba el audio del reproductor.
- `subir.sh`: solo para quien lo mantiene.
