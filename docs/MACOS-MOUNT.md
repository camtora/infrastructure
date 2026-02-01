# macOS Remote Mount (SSHFS)

This documents the SSHFS setup for mounting the home server's files on Cameron's MacBook.

## Overview

With Samba disabled, we use **SSHFS** to mount directories from the home server over SSH. This works both on the local network and remotely.

| Location | Host | Port |
|----------|------|------|
| Internal (home network) | 192.168.2.34 | 22 |
| External (away from home) | camerontora.ca | 2222 |

## Mount Points

On the MacBook:

| Mount Point | Remote Path | Finder Name | Description |
|-------------|-------------|-------------|-------------|
| `~/mnt/HOMENAS` | `/home/camerontora` | HOMENAS | Home directory |
| `~/mnt/CAMNAS2` | `/HOMENAS` | CAMNAS2 | 100TB software RAID (media) |
| `~/mnt/CAMRAID` | `/CAMRAID` | CAMRAID | Hardware RAID (personal media) |

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
# Mount/unmount all
mount-camerontora              # Mount all three
mount-camerontora unmount      # Unmount all
mount-camerontora status       # Check status
mount-camerontora remount      # Remount (after network change)

# Mount/unmount specific
mount-camerontora mount home   # Mount home directory only
mount-camerontora mount media  # Mount 100TB RAID only
mount-camerontora mount raid   # Mount hardware RAID only
mount-camerontora unmount media
```

## Prerequisites (MacBook)

- **macFUSE**: `brew install macfuse` (requires reboot + security approval)
- **SSHFS**: `brew install gromgit/fuse/sshfs-mac`
- **SSH key in keychain**: `ssh-add --apple-use-keychain ~/.ssh/id_ed25519`
- **Mount points**:
  ```bash
  mkdir -p ~/mnt/HOMENAS ~/mnt/CAMNAS2 ~/mnt/CAMRAID
  ```

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
diskutil unmount force ~/mnt/HOMENAS

# Test SSH connection
ssh -p 2222 camerontora@camerontora.ca "echo connected"
```

## Network Changes

When switching networks (leaving/arriving home), the mount may become stale. Run:

```bash
mount-camerontora remount
```

The automount service only runs at login, so manual remount is needed after network changes during a session.
