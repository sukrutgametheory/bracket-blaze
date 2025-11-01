#!/bin/bash
# Manual sync script for pushing changes to GitHub

echo "🔄 Syncing to GitHub..."
echo ""

# Check for uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo "📝 You have uncommitted changes:"
    git status -s
    echo ""
    read -p "Would you like to commit these changes? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter commit message: " commit_message
        git add -A
        git commit -m "$commit_message"
    fi
fi

# Push to remote
echo "📤 Pushing to origin/main..."
git push origin main

if [ $? -eq 0 ]; then
    echo "✅ Successfully synced to GitHub!"
    echo "🔗 https://github.com/sukrutgametheory/bracket-blaze"
else
    echo "⚠️  Failed to push. You may need to pull changes first."
    echo "Run: git pull origin main"
fi
