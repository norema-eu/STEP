#!/bin/bash
# Sincronizza step.norema.eu con il repository GitHub norema-eu/STEP.
# Da eseguire su SiteGround come cron job (es. ogni 15 minuti).
# Non tocca mai i file .htaccess / .htpasswd creati da "Protected URLs".

set -euo pipefail

REPO_DIR="$HOME/step-repo"                              # copia locale del repository (fuori dal sito)
SITE_DIR="$HOME/www/step.norema.eu/public_html"         # cartella pubblica del sottodominio
LOG="$HOME/step-sync.log"

cd "$REPO_DIR"
BEFORE=$(git rev-parse HEAD)
git fetch --quiet origin main
git reset --quiet --hard origin/main
AFTER=$(git rev-parse HEAD)

# Pubblica solo se ci sono novità (o al primo avvio)
if [ "$BEFORE" != "$AFTER" ] || [ ! -f "$SITE_DIR/index.html" ]; then
  rsync -a --delete \
    --exclude='.git/' --exclude='.github/' --exclude='_template/' --exclude='preview/' \
    --exclude='deploy/' --exclude='build.py' --exclude='README.md' \
    --exclude='.htaccess' --exclude='.htpasswd*' --exclude='.well-known/' \
    "$REPO_DIR/" "$SITE_DIR/"
  echo "$(date '+%F %T') pubblicato ${AFTER:0:7}" >> "$LOG"
fi
