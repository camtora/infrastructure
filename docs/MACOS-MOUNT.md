# macOS Remote Mount (SSHFS)

This documents the SSHFS setup for mounting the home server's files on Cameron's MacBook.

## Overview

With Samba disabled, we use **SSHFS** to mount `/home/camerontora` from the home server over SSH. This works both on the local network and remotely.

| Location | Host | Port |
|----------|------|------|
| Internal (home network) | 192.168.2.34 | 22 |
| External (away from home) | camerontora.ca | 2222 |

## Mount Point

On the MacBook:
```
/mnt/HOMENAS → camerontora@server:/home/camerontora
```

## Scripts

Located in `scripts/macos/`:

| File | Purpose |
|------|---------|
| `mount-camerontora.sh` | Smart mount script - auto-detects internal vs external network |
| `com.camerontora.sshfs-mount.plist` | launchd service for automount at login |

### Installed Locations (on MacBook)

```
/opt/homebrew/bin/mount-camerontora          # Mount script
~/Library/LaunchAgents/com.camerontora.sshfs-mount.plist  # Automount service
```

## How It Works

1. **Network detection**: The script pings `192.168.2.34` to determine if on the home network
2. **SSH connection**: Connects via SSH using key authentication (keys stored in macOS keychain)
3. **SSHFS mount**: Mounts the remote directory as a local filesystem via FUSE
4. **Auto-reconnect**: Configured to automatically reconnect if the connection drops

## Commands

```bash
mount-camerontora          # Mount (auto-detects network)
mount-camerontora unmount  # Unmount
mount-camerontora status   # Check if mounted and which network
mount-camerontora remount  # Unmount + mount (use after network change)
```

## Prerequisites (MacBook)

- **macFUSE**: `brew install macfuse` (requires reboot + security approval)
- **SSHFS**: `brew install gromgit/fuse/sshfs-mac`
- **SSH key in keychain**: `ssh-add --apple-use-keychain ~/.ssh/id_ed25519`
- **Mount point**: `sudo mkdir -p /mnt/HOMENAS && sudo chown $USER /mnt/HOMENAS`

## Troubleshooting

```bash
# Check mount status
mount | grep HOMENAS

# View automount logs
cat /tmp/sshfs-mount.log

# Check SSH keys are loaded
ssh-add -l

# Load keys from keychain
ssh-add --apple-load-keychain

# Force unmount if stuck
diskutil unmount force /mnt/HOMENAS

# Test SSH connection
ssh -p 2222 camerontora@camerontora.ca "echo connected"
```

## Network Changes

When switching networks (leaving/arriving home), the mount may become stale. Run:

```bash
mount-camerontora remount
```

The automount service only runs at login, so manual remount is needed after network changes during a session.
