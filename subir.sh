#!/bin/bash
# subir.sh: manda a GitHub (repo privado Tabasco3000/sudown) lo que cambió de SuDown en el Brain.
# Solo en la Mac de Luis: el Brain es la fuente y GitHub la copia de donde se actualizan los demás.
# El Brain nunca sube nada (es local por diseño): se copia la carpeta a un clon aparte y se sube desde ahí.
#   bash subir.sh "qué cambió"
set -eu
FUENTE="/Users/luisdupeyron/Desktop/Brain/⚙️ Meta/skills/sudown"
CLON="$HOME/.sudown/publicar"
[ -d "$FUENTE" ] || { echo "Esto solo corre en la Mac donde vive el Brain."; exit 1; }
if [ -d "$CLON/.git" ]; then git -C "$CLON" pull -q --ff-only; else git clone -q https://github.com/Tabasco3000/sudown.git "$CLON"; fi
rsync -a --delete --exclude .git --exclude .DS_Store "$FUENTE/" "$CLON/"
cd "$CLON"
git add -A
if git diff --cached --quiet; then echo "No hay cambios que subir."; exit 0; fi
git commit -q -m "${1:-Actualización}"
git push -q origin HEAD:main
echo "Subido a GitHub ($(git rev-parse --short HEAD)). A las demás Macs les llega solo la próxima vez que usen SuDown (una revisión al día)."
