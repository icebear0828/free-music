#!/bin/bash
# Ensure Homebrew binaries are in PATH (needed when launched by launchd)
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$PATH"

SESSION="music"
DIR="/Users/yutao/music"

cd $DIR

# Check if session exists
tmux has-session -t $SESSION 2>/dev/null
HAS_SESSION=$?

# Run build before starting the server
echo "Building project..."
NODE_ENV=production npm run build

if [ $? != 0 ]; then
  echo "Build failed. Exiting."
  exit 1
fi

if [ $HAS_SESSION != 0 ]; then
  # Create new session, but don't attach yet
  tmux new-session -d -s $SESSION
  # Run the project
  tmux send-keys -t $SESSION "NODE_ENV=production PORT=15000 npm run start" C-m
  echo "Started new tmux session: $SESSION"
else
  # Restart if session exists
  echo "Session $SESSION already exists. Restarting..."
  tmux send-keys -t $SESSION C-c
  sleep 2
  tmux send-keys -t $SESSION "NODE_ENV=production PORT=15000 npm run start" C-m
fi
