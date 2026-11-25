#!/usr/bin/env bash
# Mission management system - interactive installer for a fresh Ubuntu 22.04/24.04 VPS.
#
# Run as root:
#   sudo -i
#   bash install.sh                 # from a checkout of this repository (deploy/install.sh)
#   REPO_URL=https://... bash install.sh   # or let the script clone the repository
#
# Re-running the script on an existing install updates code, rebuilds, applies
# migrations and restarts the service. The existing server/.env is kept.
set -Eeuo pipefail

APP_NAME="missionapp"
APP_DIR="${APP_DIR:-/opt/$APP_NAME}"
DATA_DIR="${DATA_DIR:-/var/lib/$APP_NAME}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/$APP_NAME}"
CREDS_FILE="/root/${APP_NAME}-install-info.txt"
PORT=4000
NODE_MAJOR=22
FRESH_ENV=0   # set to 1 when a new server/.env is generated

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd || true)"

# ---------- output helpers ----------
C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_CYAN=$'\033[36m'
step()  { echo; echo "${C_BOLD}${C_CYAN}==> $*${C_RESET}"; }
info()  { echo "    $*"; }
ok()    { echo "    ${C_GREEN}✔${C_RESET} $*"; }
warn()  { echo "    ${C_YELLOW}!${C_RESET} $*"; }
die()   { echo "${C_RED}ERROR: $*${C_RESET}" >&2; exit 1; }

on_error() { echo "${C_RED}Installation stopped at line $1. Fix the error above and run the script again (it is safe to re-run).${C_RESET}" >&2; }
trap 'on_error $LINENO' ERR

# ---------- prompts ----------
ask() {  # ask VAR "Question" "default"
  local var="$1" question="$2" default="${3:-}" answer
  if [[ -n "$default" ]]; then
    read -r -p "  $question [$default]: " answer || true
    answer="${answer:-$default}"
  else
    while true; do
      read -r -p "  $question: " answer || true
      [[ -n "$answer" ]] && break
      warn "This value is required."
    done
  fi
  printf -v "$var" '%s' "$answer"
}

JALALI_NOW_JS='const p=new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-latn",{timeZone:"Asia/Tehran",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());const g=t=>p.find(x=>x.type===t).value;console.log(g("year")+"/"+g("month")+"/"+g("day")+" "+g("hour")+":"+g("minute"))'
jalali_now() { node -e "$JALALI_NOW_JS"; }  # e.g. 1405/09/04 11:38 (Tehran time, Jalali)

port_in_use() { ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$1$"; }

# Value of a directive in the Nginx site written by a previous install (empty if none).
site_value() {
  local f="/etc/nginx/sites-available/$APP_NAME"
  [[ -f "$f" ]] || return 0
  sed -nE "s/^[[:space:]]*$1[[:space:]]+(.*);.*/\1/p" "$f" | head -1
}

# active | inactive | not installed
ufw_state() {
  command -v ufw >/dev/null 2>&1 || { echo "not installed"; return; }
  ufw status 2>/dev/null | awk 'NR==1 {print $2}'
}

# Asks for the certificate and key files, checks they match and cover the domain.
ask_cert_files() {
  while true; do
    read -r -p "  Full path of the certificate file (fullchain, .pem/.crt): " CERT_FILE || true
    read -r -p "  Full path of the private key file (.pem/.key): " KEY_FILE || true
    if [[ ! -r "$CERT_FILE" || ! -r "$KEY_FILE" ]]; then
      warn "File not found or not readable. Check the paths (the installer runs as root)."; continue
    fi
    if ! openssl x509 -in "$CERT_FILE" -noout 2>/dev/null; then
      warn "This is not a valid certificate file: $CERT_FILE"; continue
    fi
    if ! openssl pkey -in "$KEY_FILE" -passin pass: -pubout >/dev/null 2>&1; then
      warn "Cannot read the private key (unencrypted PEM key required; encrypted keys are not supported)."; continue
    fi
    if [[ "$(openssl x509 -in "$CERT_FILE" -noout -pubkey | openssl sha256)" != "$(openssl pkey -in "$KEY_FILE" -passin pass: -pubout | openssl sha256)" ]]; then
      warn "The private key does not belong to this certificate."; continue
    fi
    break
  done
  if ! openssl x509 -in "$CERT_FILE" -noout -checkhost "$DOMAIN" | grep -q "does match"; then
    warn "This certificate does not list $DOMAIN. Browsers will show a certificate warning."
  fi
  ok "Certificate and private key verified"
}

ask_yes_no() {  # ask_yes_no "Question" "y|n" -> returns 0 for yes
  local question="$1" default="$2" answer hint
  [[ "$default" == "y" ]] && hint="Y/n" || hint="y/N"
  read -r -p "  $question [$hint]: " answer || true
  answer="${answer:-$default}"
  [[ "$answer" =~ ^[Yy]$ ]]
}

# ---------- preflight ----------
banner() {
  echo "${C_BOLD}"
  echo "  ============================================================"
  echo "   Mission management system - VPS installer (Ubuntu)"
  echo "  ============================================================${C_RESET}"
}

preflight() {
  step "Checking the server"
  [[ $EUID -eq 0 ]] || die "Run this script as root (for example: sudo -i, then bash install.sh)."
  [[ -r /etc/os-release ]] || die "Cannot read /etc/os-release. Ubuntu 22.04 or 24.04 is required."
  . /etc/os-release
  [[ "${ID:-}" == "ubuntu" ]] || die "This installer supports Ubuntu only (found: ${ID:-unknown})."
  case "${VERSION_ID:-}" in
    22.04|24.04) ok "Ubuntu $VERSION_ID" ;;
    *) warn "Ubuntu ${VERSION_ID:-?} is not tested. Continuing." ;;
  esac
  local free_gb
  free_gb=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
  (( free_gb >= 5 )) || die "At least 5 GB of free disk space is required (found ${free_gb} GB)."
  ok "Free disk space: ${free_gb} GB"
  if ! command -v curl >/dev/null 2>&1; then apt-get update -qq && apt-get install -y -qq curl ca-certificates; fi
  curl -fsS --max-time 10 https://deb.nodesource.com >/dev/null 2>&1 || warn "Cannot reach deb.nodesource.com. Check the network connection."
  ok "Basic checks passed"
}

# ---------- wizard ----------
# Asks for the local port the app listens on (Nginx forwards to it). An existing
# install keeps its port as default; a port already in use is refused.
ask_port() {
  local existing="" current answer
  [[ -f "$APP_DIR/server/.env" ]] && existing=$(sed -n 's/^PORT=//p' "$APP_DIR/server/.env" | tr -d '"\r' | tail -1)
  current="${existing:-4000}"
  while true; do
    read -r -p "  Local port for the app, 1024-65535 (not public; Nginx forwards to it) [$current]: " answer || true
    answer="${answer:-$current}"
    if [[ ! "$answer" =~ ^[0-9]+$ ]] || (( 10#$answer < 1024 || 10#$answer > 65535 )); then
      warn "Enter a number between 1024 and 65535."
      continue
    fi
    answer=$((10#$answer))
    if [[ "$answer" != "$existing" ]] && port_in_use "$answer"; then
      warn "Port $answer is already in use on this server. Choose another port."
      continue
    fi
    break
  done
  PORT="$answer"
}

wizard() {
  step "Configuration"
  info "Press Enter to accept the value in brackets."
  echo

  # An existing install keeps its domain and certificate as defaults.
  local prev_domain prev_cert prev_key
  prev_domain=$(site_value 'server_name'); [[ "$prev_domain" == "_" ]] && prev_domain=""
  prev_cert=$(site_value 'ssl_certificate'); prev_key=$(site_value 'ssl_certificate_key')
  if [[ -n "$prev_domain" ]]; then
    read -r -p "  Domain name pointing to this server [$prev_domain] (type - for none): " DOMAIN || true
    DOMAIN="${DOMAIN:-$prev_domain}"
  else
    read -r -p "  Domain name pointing to this server (e.g. missions.example.com), or Enter to skip: " DOMAIN || true
  fi
  DOMAIN="${DOMAIN:-}"; [[ "$DOMAIN" == "-" ]] && DOMAIN=""

  USE_HTTPS=0; CERT_MODE="none"; LE_EMAIL=""
  if [[ -n "$DOMAIN" ]]; then
    if [[ "$DOMAIN" == "$prev_domain" && -r "$prev_cert" && -r "$prev_key" ]]; then
      CERT_MODE="keep"; CERT_FILE="$prev_cert"; KEY_FILE="$prev_key"; USE_HTTPS=1
      ok "Existing certificate for $DOMAIN will be kept"
    else
      echo "  HTTPS certificate:"
      echo "    1) Let's Encrypt (automatic, needs port 80 reachable from the internet)"
      echo "    2) My own certificate files (fullchain + private key on this server)"
      local cert_choice; read -r -p "  Choose 1 or 2 [1]: " cert_choice || true
      if [[ "${cert_choice:-1}" == "2" ]]; then
        ask_cert_files
        CERT_MODE="custom"
      else
        ask LE_EMAIL "E-mail for Let's Encrypt certificate notices" "${LE_EMAIL:-}"
        CERT_MODE="letsencrypt"
      fi
      USE_HTTPS=1
    fi
  else
    warn "No domain: the app will run over plain HTTP. Login cookies are then not secure; use a domain for production."
  fi

  ask_port
  ask ORG_NAME "Organization name (shown in the UI and on PDFs; can be changed later)" "${ORG_NAME:-سازمان}"
  ask_yes_no "Install demo accounts (admin, manager1, employee1 ... with password 123456)?" n && SEED_DEMO=1 || SEED_DEMO=0
  ask_yes_no "Install Google Chrome for PDF generation (recommended)?" y && INSTALL_CHROME=1 || INSTALL_CHROME=0
  ask_yes_no "Create a daily backup at 02:30 (keeps 14 days)?" y && USE_BACKUP=1 || USE_BACKUP=0

  if [[ -z "$SOURCE_DIR" || ! -f "$SOURCE_DIR/server/package.json" ]]; then
    if [[ -n "${REPO_URL:-}" ]]; then
      SOURCE_MODE="clone"
    else
      ask REPO_URL "Git repository URL of the project (used because the script is not inside a checkout)" ""
      SOURCE_MODE="clone"
    fi
  else
    SOURCE_MODE="local"
  fi

  echo
  step "Summary"
  info "Install directory : $APP_DIR"
  info "Data directory    : $DATA_DIR  (database and uploads)"
  info "Domain            : ${DOMAIN:-(none, IP over HTTP)}"
  case "$CERT_MODE" in
    letsencrypt) info "HTTPS certificate : Let's Encrypt (requested during install)" ;;
    custom)      info "HTTPS certificate : your files ($CERT_FILE)" ;;
    keep)        info "HTTPS certificate : existing ($CERT_FILE)" ;;
    *)           info "HTTPS certificate : none (HTTP only)" ;;
  esac
  info "App port (local)  : $PORT  (127.0.0.1 only)"
  info "Organization      : $ORG_NAME"
  info "Demo accounts     : $([[ $SEED_DEMO -eq 1 ]] && echo yes || echo no)"
  info "Google Chrome     : $([[ $INSTALL_CHROME -eq 1 ]] && echo yes || echo no)"
  info "Firewall (UFW)    : $(ufw_state)  (left unchanged; only opened if already active)"
  info "Daily backup      : $([[ $USE_BACKUP -eq 1 ]] && echo yes || echo no)"
  info "Source            : $([[ $SOURCE_MODE == local ]] && echo "this checkout ($SOURCE_DIR)" || echo "git clone $REPO_URL")"
  echo
  ask_yes_no "Start the installation with these settings?" y || die "Cancelled. Nothing was changed."
}

# ---------- installation steps ----------
install_packages() {
  step "Installing system packages"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq nginx certbot python3-certbot-nginx sqlite3 git openssl ca-certificates gnupg curl
  ok "nginx, certbot, sqlite3, git, openssl installed"

  local node_ok=0
  if command -v node >/dev/null 2>&1; then
    local major; major=$(node -p 'process.versions.node.split(".")[0]')
    (( major >= 20 )) && node_ok=1
  fi
  if (( node_ok == 0 )); then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y -qq nodejs
  fi
  ok "Node.js $(node -v)"

  if (( INSTALL_CHROME == 1 )); then
    if ! command -v google-chrome-stable >/dev/null 2>&1; then
      curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg
      echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
        > /etc/apt/sources.list.d/google-chrome.list
      apt-get update -qq
      apt-get install -y -qq google-chrome-stable
    fi
    ok "Google Chrome $(google-chrome-stable --version 2>/dev/null | awk '{print $3}')"
  fi
}

fetch_source() {
  step "Copying application code to $APP_DIR"
  mkdir -p "$APP_DIR"
  if [[ "$SOURCE_MODE" == "local" ]]; then
    # Copy the checkout but never carry over local build output, dependencies or data.
    if command -v rsync >/dev/null 2>&1; then
      rsync -a --delete --exclude node_modules --exclude dist --exclude storage --exclude '*.db*' --exclude .env \
        --exclude .git --exclude client/dist "$SOURCE_DIR/" "$APP_DIR/"
    else
      apt-get install -y -qq rsync >/dev/null
      rsync -a --delete --exclude node_modules --exclude dist --exclude storage --exclude '*.db*' --exclude .env \
        --exclude .git --exclude client/dist "$SOURCE_DIR/" "$APP_DIR/"
    fi
  else
    if [[ -d "$APP_DIR/.git" ]]; then
      git -C "$APP_DIR" pull --ff-only
    else
      rm -rf "$APP_DIR"
      git clone "$REPO_URL" "$APP_DIR"
    fi
  fi
  ok "Code copied"
}

prepare_dirs() {
  mkdir -p "$DATA_DIR/db" "$DATA_DIR/storage" "$BACKUP_DIR"
  chmod 700 "$DATA_DIR" "$BACKUP_DIR"
}

write_env() {
  local env_file="$APP_DIR/server/.env"
  if [[ -f "$env_file" ]]; then
    sed -i "s/^PORT=.*/PORT=$PORT/" "$env_file"
    ok "Existing $env_file kept (update mode, PORT=$PORT)"
    return
  fi
  FRESH_ENV=1
  local setup_token; setup_token=$(openssl rand -hex 24)
  local cookie_secure="false"; (( USE_HTTPS == 1 )) && cookie_secure="true"
  local chrome_path=""; (( INSTALL_CHROME == 1 )) && chrome_path="/usr/bin/google-chrome-stable"
  umask 077
  cat > "$env_file" <<EOF
# Generated by deploy/install.sh on $(jalali_now) (Tehran time)
NODE_ENV=production
PORT=$PORT
DATABASE_URL="file:$DATA_DIR/db/app.db"
STORAGE_DIR=$DATA_DIR/storage
CLIENT_DIST_DIR=$APP_DIR/client/dist
SESSION_TTL_HOURS=8
IDLE_TIMEOUT_MINUTES=60
COOKIE_SECURE=$cookie_secure
TRUST_PROXY=1
CHROME_PATH=$chrome_path
SETUP_TOKEN=$setup_token
EOF
  chmod 600 "$env_file"
  ok "Created $env_file (secrets generated)"
  SETUP_TOKEN_VALUE="$setup_token"
}

build_app() {
  step "Installing dependencies and building (this can take a few minutes)"
  cd "$APP_DIR/server"
  npm ci --no-audit --no-fund
  npx prisma migrate deploy
  if (( FRESH_ENV == 1 )); then
    # Store the organization name chosen in the wizard (SQL-escaped).
    local org_sql="${ORG_NAME//\'/\'\'}"
    sqlite3 "$DATA_DIR/db/app.db" "INSERT INTO SystemSettings (id, orgName, missionSeq, updatedAt) VALUES (1, '$org_sql', 0, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET orgName = excluded.orgName;"
  fi
  npm run build
  ok "Server built and database migrated"

  if (( SEED_DEMO == 1 )) && [[ -z "$(sqlite3 "$DATA_DIR/db/app.db" "select 1 from User limit 1" 2>/dev/null || true)" ]]; then
    npx tsx prisma/seed.ts
    ok "Demo accounts created"
  fi

  cd "$APP_DIR/client"
  npm ci --no-audit --no-fund --legacy-peer-deps
  npm run build
  ok "Client built"
}

install_service() {
  step "Creating the systemd service"
  cat > /etc/systemd/system/$APP_NAME.service <<EOF
[Unit]
Description=Mission management system
After=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=$APP_DIR/server
EnvironmentFile=$APP_DIR/server/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR /tmp
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable $APP_NAME >/dev/null
  systemctl restart $APP_NAME
  local i
  for i in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:$PORT/api/setup/status" >/dev/null 2>&1; then
      ok "Service is running on 127.0.0.1:$PORT"
      return
    fi
    sleep 1
  done
  journalctl -u $APP_NAME -n 40 --no-pager || true
  die "The service did not respond. See the log above (journalctl -u $APP_NAME -f)."
}

configure_nginx() {
  step "Configuring Nginx"
  local server_name="${DOMAIN:-_}" site="/etc/nginx/sites-available/$APP_NAME"
  local proxy="    client_max_body_size 3m;   # uploads are limited to 2 MB by the app

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }"
  if [[ "$CERT_MODE" == "custom" || "$CERT_MODE" == "keep" ]]; then
    # HTTPS with the certificate files given by the user (or kept from the previous install).
    cat > "$site" <<EOF_SITE
server {
    listen 80;
    server_name $server_name;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $server_name;

    ssl_certificate $CERT_FILE;
    ssl_certificate_key $KEY_FILE;
    ssl_protocols TLSv1.2 TLSv1.3;

$proxy
}
EOF_SITE
  else
    # HTTP only. For Let's Encrypt, certbot adds the HTTPS part below.
    cat > "$site" <<EOF_SITE
server {
    listen 80;
    server_name $server_name;

$proxy
}
EOF_SITE
  fi
  ln -sf "$site" /etc/nginx/sites-enabled/$APP_NAME
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
  ok "Nginx site enabled"

  case "$CERT_MODE" in
    custom|keep)
      sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=true/' "$APP_DIR/server/.env"
      systemctl restart $APP_NAME
      ok "HTTPS enabled with the certificate in $CERT_FILE"
      ;;
    letsencrypt)
      if certbot --nginx -d "$DOMAIN" -m "$LE_EMAIL" --agree-tos --no-eff-email --redirect --non-interactive; then
        ok "HTTPS certificate installed for $DOMAIN (renews automatically)"
        sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=true/' "$APP_DIR/server/.env"
        systemctl restart $APP_NAME
      else
        warn "Certificate request failed. Check that $DOMAIN points to this server, then run: certbot --nginx -d $DOMAIN"
        warn "The app is reachable over HTTP for now."
      fi
      ;;
  esac
}

configure_firewall() {
  step "Checking the firewall"
  case "$(ufw_state)" in
    active)
      ufw allow OpenSSH >/dev/null
      ufw allow 'Nginx Full' >/dev/null
      ok "UFW is active: SSH, HTTP and HTTPS allowed. Port $PORT is not exposed."
      ;;
    *)
      ok "UFW is $(ufw_state); left unchanged. Port $PORT is only on 127.0.0.1 anyway."
      ;;
  esac
}

configure_backup() {
  (( USE_BACKUP == 1 )) || return 0
  step "Configuring daily backups"
  cat > /usr/local/bin/$APP_NAME-backup.sh <<EOF
#!/usr/bin/env bash
set -euo pipefail
DEST=$BACKUP_DIR
STAMP=\$(node -e '$JALALI_NOW_JS' | tr '/ :' '-_-')
sqlite3 $DATA_DIR/db/app.db ".backup '\$DEST/app-\$STAMP.db'"
tar -C $DATA_DIR -czf "\$DEST/storage-\$STAMP.tar.gz" storage
cp $APP_DIR/server/.env "\$DEST/env-\$STAMP.txt" && chmod 600 "\$DEST/env-\$STAMP.txt"
find "\$DEST" -type f -mtime +14 -delete
echo "backup \$STAMP ok"
EOF
  chmod 700 /usr/local/bin/$APP_NAME-backup.sh
  /usr/local/bin/$APP_NAME-backup.sh >/dev/null
  echo "30 2 * * * /usr/local/bin/$APP_NAME-backup.sh >> /var/log/$APP_NAME-backup.log 2>&1" > /etc/cron.d/$APP_NAME-backup
  chmod 644 /etc/cron.d/$APP_NAME-backup
  ok "Backup created now and scheduled daily at 02:30 (kept 14 days in $BACKUP_DIR)"
}

write_summary() {
  local url
  if [[ -n "$DOMAIN" ]]; then
    url=$([[ $USE_HTTPS -eq 1 ]] && echo "https://$DOMAIN" || echo "http://$DOMAIN")
  else
    url="http://$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
  fi
  {
    echo "Mission management system - installation info ($(jalali_now) Tehran time)"
    echo "URL:                $url"
    echo "App (local port):   127.0.0.1:$PORT"
    echo "Setup page:         $url/setup   (only until the first admin exists)"
    echo "Setup token:        ${SETUP_TOKEN_VALUE:-(kept in $APP_DIR/server/.env as SETUP_TOKEN)}"
    echo "Install directory:  $APP_DIR"
    echo "Database:           $DATA_DIR/db/app.db"
    echo "Uploads:            $DATA_DIR/storage"
    echo "Backups:            $BACKUP_DIR"
    if (( SEED_DEMO == 1 )); then
      echo "Demo accounts:      admin, manager1, manager2, employee1-5  (password 123456, change at first login)"
    fi
  } > "$CREDS_FILE"
  chmod 600 "$CREDS_FILE"

  echo
  echo "${C_BOLD}${C_GREEN}Installation finished.${C_RESET}"
  echo
  echo "  Open:          $url"
  if (( SEED_DEMO == 1 )); then
    echo "  Demo login:    admin / 123456  (you must change the password at first login)"
  else
    echo "  First admin:   open $url/setup and enter the setup token below"
  fi
  echo "  Setup token:   ${SETUP_TOKEN_VALUE:-see $APP_DIR/server/.env}"
  echo
  echo "  Saved to:      $CREDS_FILE  (root only)"
  echo "  Logs:          journalctl -u $APP_NAME -f"
  echo "  Restart:       systemctl restart $APP_NAME"
  echo "  Update later:  bash $APP_DIR/deploy/install.sh   (keeps .env and data)"
  if (( USE_HTTPS == 0 )); then
    echo
    warn "Running over HTTP. Add a domain and re-run the installer to enable HTTPS."
  fi
  if (( SEED_DEMO == 1 )); then
    warn "Demo accounts with a known password exist. Delete or change them before real use."
  fi
}

main() {
  banner
  preflight
  wizard
  install_packages
  fetch_source
  prepare_dirs
  write_env
  build_app
  install_service
  configure_nginx
  configure_firewall
  configure_backup
  write_summary
}

main "$@"
