#!/bin/bash
#
# Mount camerontora home directory via SSHFS
# Auto-detects internal vs external network
#
# Usage:
#   mount-camerontora.sh          # Mount
#   mount-camerontora.sh unmount  # Unmount
#   mount-camerontora.sh status   # Check status
#

MOUNT_POINT="$HOME/mnt/HOMENAS"
REMOTE_PATH="/home/camerontora"
REMOTE_USER="camerontora"

# Internal network config
INTERNAL_HOST="192.168.2.34"
INTERNAL_PORT="22"

# External network config
EXTERNAL_HOST="camerontora.ca"
EXTERNAL_PORT="2222"

# SSHFS options
SSHFS_OPTS="-o volname=camerontora,follow_symlinks,reconnect,ServerAliveInterval=15,ServerAliveCountMax=3"

log() {
    echo "[$(date '+%H:%M:%S')] $1"
}

is_mounted() {
    mount | grep -q "on $MOUNT_POINT "
}

is_internal_network() {
    # Check if we can reach the internal IP directly (quick ping)
    ping -c 1 -W 1 "$INTERNAL_HOST" &>/dev/null
}

do_mount() {
    # Create mount point if needed
    mkdir -p "$MOUNT_POINT"

    if is_mounted; then
        log "Already mounted at $MOUNT_POINT"
        return 0
    fi

    # Determine which host/port to use
    if is_internal_network; then
        HOST="$INTERNAL_HOST"
        PORT="$INTERNAL_PORT"
        log "Internal network detected, using $HOST:$PORT"
    else
        HOST="$EXTERNAL_HOST"
        PORT="$EXTERNAL_PORT"
        log "External network detected, using $HOST:$PORT"
    fi

    # Test SSH connectivity first
    if ! ssh -p "$PORT" -o ConnectTimeout=5 -o BatchMode=yes "$REMOTE_USER@$HOST" "echo ok" &>/dev/null; then
        log "ERROR: Cannot connect to $HOST:$PORT via SSH"
        log "Check that your SSH key is loaded (ssh-add -l)"
        return 1
    fi

    # Mount
    log "Mounting $REMOTE_USER@$HOST:$REMOTE_PATH to $MOUNT_POINT"
    sshfs "$REMOTE_USER@$HOST:$REMOTE_PATH" "$MOUNT_POINT" \
        -p "$PORT" \
        $SSHFS_OPTS

    if is_mounted; then
        log "Successfully mounted"
        return 0
    else
        log "ERROR: Mount failed"
        return 1
    fi
}

do_unmount() {
    if ! is_mounted; then
        log "Not mounted"
        return 0
    fi

    log "Unmounting $MOUNT_POINT"
    umount "$MOUNT_POINT" 2>/dev/null || diskutil unmount force "$MOUNT_POINT"

    if is_mounted; then
        log "ERROR: Unmount failed"
        return 1
    else
        log "Successfully unmounted"
        return 0
    fi
}

do_status() {
    if is_mounted; then
        echo "Mounted at $MOUNT_POINT"
        if is_internal_network; then
            echo "Network: internal ($INTERNAL_HOST)"
        else
            echo "Network: external ($EXTERNAL_HOST)"
        fi
        return 0
    else
        echo "Not mounted"
        return 1
    fi
}

# Ensure SSH agent has keys (for automount scenarios)
ensure_ssh_agent() {
    # Check if any keys are loaded
    if ! ssh-add -l &>/dev/null; then
        log "No SSH keys loaded, attempting to load from keychain..."
        ssh-add --apple-load-keychain 2>/dev/null
    fi
}

case "${1:-mount}" in
    mount)
        ensure_ssh_agent
        do_mount
        ;;
    unmount|umount)
        do_unmount
        ;;
    status)
        do_status
        ;;
    remount)
        do_unmount
        sleep 1
        ensure_ssh_agent
        do_mount
        ;;
    *)
        echo "Usage: $0 [mount|unmount|status|remount]"
        exit 1
        ;;
esac
