#!/bin/bash
# export.sh - Automatiserad initiering och push till GitHub

echo "📡 NavisCore GitHub Export Skript"
echo "==================================="

# Kontrollera om git är installerat
if ! command -v git &> /dev/null
then
    echo "❌ Git hittades inte. Installera git först."
    exit 1
fi

REPO_URL="https://github.com/Minglarn/NavisCore.git"

# Initiera repo om det inte redan är det
if [ ! -d ".git" ]; then
    echo "📦 Initierar nytt Git repository..."
    git init
    # Lägg till en standard .gitignore
    cat <<EOT > .gitignore
node_modules/
dist/
data/
*.db
.env
.DS_Store
EOT
    echo "✅ .gitignore skapad"
    git remote add origin "$REPO_URL"
    echo "🔗 Remote origin satt till $REPO_URL"
else
    echo "ℹ️ Git repository redan initialiserat."
    # Kontrollera om origin existerar, annars lägg till
    if ! git remote | grep -q origin; then
        git remote add origin "$REPO_URL"
        echo "🔗 Remote origin satt till $REPO_URL"
    fi
fi

echo "➕ Lägger till filer..."
git add .

echo "📝 Skapar commit..."
git commit -m "🚀 Initial NavisCore Commit (Autogenererad av AI)"

echo "⬆️ Pushar till GitHub (main-branch)..."
git branch -M main
git push -u origin main

echo "✅ Exportering klar! Du kan hitta din kod på: $REPO_URL"
