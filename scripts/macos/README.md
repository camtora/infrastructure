# macOS SSHFS Mount for camerontora

Auto-mount the home server's `/home/camerontora` directory via SSHFS.

## Prerequisites

```bash
# 1. Install macFUSE (requires reboot + security approval)
brew install macfuse

# 2. After reboot, go to System Settings → Privacy & Security
#    Allow the macFUSE kernel extension

# 3. Install SSHFS
brew install gromgit/fuse/sshfs-mac

# 4. Create mount point
sudo mkdir -p /mnt/HOMENAS
sudo chown $USER /mnt/HOMENAS

# 5. Ensure your SSH key is in keychain
ssh-add --apple-use-keychain ~/.ssh/id_ed25519  # or your key path
```

## Installation

Copy the files to your MacBook and run:

```bash
# Copy mount script
sudo cp mount-camerontora.sh /opt/homebrew/bin/mount-camerontora
sudo chmod +x /opt/homebrew/bin/mount-camerontora

# Install launchd service (runs at login)
cp com.camerontora.sshfs-mount.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.camerontora.sshfs-mount.plist
```

## Usage

The mount will happen automatically at login. Manual commands:

```bash
# Mount (auto-detects internal vs external network)
mount-camerontora

# Unmount
mount-camerontora unmount

# Check status
mount-camerontora status

# Remount (unmount + mount)
mount-camerontora remount
```

## How it works

1. **Network detection**: Pings `192.168.2.34` to check if you're on the internal network
2. **Internal**: Connects to `192.168.2.34:22`
3. **External**: Connects to `camerontora.ca:2222`
4. **Auto-reconnect**: SSHFS is configured to automatically reconnect if the connection drops

## Troubleshooting

```bash
# Check if mounted
mount | grep HOMENAS

# View automount logs
cat /tmp/sshfs-mount.log

# Check SSH key is loaded
ssh-add -l

# Load SSH key from keychain
ssh-add --apple-load-keychain

# Test SSH connection directly
ssh -p 2222 camerontora@camerontora.ca "echo connected"

# Force unmount if stuck
diskutil unmount force /mnt/HOMENAS
```

## Network Changes

If you switch networks (e.g., leave home), the existing mount will become stale. Run:

```bash
mount-camerontora remount
```

For automatic remount on network change, you could use a tool like `sleepwatcher` or `ControlPlane`, but this adds complexity.
