#!/bin/bash
#
# Mount camerontora directories via SSHFS
# Auto-detects internal vs external network
#
# Usage:
#   mount-camerontora.sh [mount|unmount|status|remount] [all|home|media]
#
# Examples:
#   mount-camerontora.sh              # Mount all
#   mount-camerontora.sh mount home   # Mount home only
#   mount-camerontora.sh unmount all  # Unmount all
#   mount-camerontora.sh status       # Check status of all mounts
#

REMOTE_USER="camerontora"

# Internal network config
INTERNAL_HOST="192.168.2.34"
INTERNAL_PORT="22"

# External network config
EXTERNAL_HOST="camerontora.ca"
EXTERNAL_PORT="2222"

# SSHFS base options
SSHFS_BASE_OPTS="follow_symlinks,reconnect,ServerAliveInterval=15,ServerAliveCountMax=3"

# Mount definitions (compatible with bash 3.2)
get_mount_config() {
    local name="$1"
    case "$name" in
        home)
            echo "$HOME/mnt/HOMENAS:/home/camerontora:HOMENAS"
            ;;
        media)
            echo "$HOME/mnt/CAMNAS2:/HOMENAS:CAMNAS2"
            ;;
        raid)
            echo "$HOME/mnt/CAMRAID:/CAMRAID:CAMRAID"
            ;;
        *)
            echo ""
            ;;
    esac
}

ALL_MOUNTS="home media raid"

log() {
    echo "[$(date '+%H:%M:%S')] $1"
}

is_mounted() {
    local mount_point="$1"
    mount | grep -q "on $mount_point "
}

is_internal_network() {
    ping -c 1 -W 1 "$INTERNAL_HOST" &>/dev/null
}

get_connection_info() {
    if is_internal_network; then
        echo "$INTERNAL_HOST:$INTERNAL_PORT:internal"
    else
        echo "$EXTERNAL_HOST:$EXTERNAL_PORT:external"
    fi
}

do_mount_single() {
    local name="$1"
    local config
    config=$(get_mount_config "$name")

    if [[ -z "$config" ]]; then
        log "ERROR: Unknown mount '$name'"
        return 1
    fi

    local mount_point remote_path vol_name
    mount_point=$(echo "$config" | cut -d: -f1)
    remote_path=$(echo "$config" | cut -d: -f2)
    vol_name=$(echo "$config" | cut -d: -f3)

    # Create mount point if needed
    mkdir -p "$mount_point"

    if is_mounted "$mount_point"; then
        log "[$name] Already mounted at $mount_point"
        return 0
    fi

    # Get connection info
    local conn_info host port network
    conn_info=$(get_connection_info)
    host=$(echo "$conn_info" | cut -d: -f1)
    port=$(echo "$conn_info" | cut -d: -f2)
    network=$(echo "$conn_info" | cut -d: -f3)
    log "[$name] $network network detected, using $host:$port"

    # Test SSH connectivity first
    if ! ssh -p "$port" -o ConnectTimeout=5 -o BatchMode=yes "$REMOTE_USER@$host" "echo ok" &>/dev/null; then
        log "[$name] ERROR: Cannot connect to $host:$port via SSH"
        return 1
    fi

    # Mount with volume name
    log "[$name] Mounting $remote_path to $mount_point"
    /opt/homebrew/bin/sshfs "$REMOTE_USER@$host:$remote_path" "$mount_point" \
        -p "$port" \
        -o "volname=$vol_name,$SSHFS_BASE_OPTS"

    if is_mounted "$mount_point"; then
        log "[$name] Successfully mounted"
        return 0
    else
        log "[$name] ERROR: Mount failed"
        return 1
    fi
}

do_unmount_single() {
    local name="$1"
    local config
    config=$(get_mount_config "$name")

    if [[ -z "$config" ]]; then
        log "ERROR: Unknown mount '$name'"
        return 1
    fi

    local mount_point
    mount_point=$(echo "$config" | cut -d: -f1)

    if ! is_mounted "$mount_point"; then
        log "[$name] Not mounted"
        return 0
    fi

    log "[$name] Unmounting $mount_point"
    umount "$mount_point" 2>/dev/null || diskutil unmount force "$mount_point"

    if is_mounted "$mount_point"; then
        log "[$name] ERROR: Unmount failed"
        return 1
    else
        log "[$name] Successfully unmounted"
        return 0
    fi
}

do_status_single() {
    local name="$1"
    local config
    config=$(get_mount_config "$name")

    local mount_point vol_name
    mount_point=$(echo "$config" | cut -d: -f1)
    vol_name=$(echo "$config" | cut -d: -f3)

    if is_mounted "$mount_point"; then
        echo "[$name] Mounted at $mount_point ($vol_name)"
    else
        echo "[$name] Not mounted"
    fi
}

do_mount() {
    local target="${1:-all}"

    if [[ "$target" == "all" ]]; then
        for name in $ALL_MOUNTS; do
            do_mount_single "$name"
        done
    else
        do_mount_single "$target"
    fi
}

do_unmount() {
    local target="${1:-all}"

    if [[ "$target" == "all" ]]; then
        for name in $ALL_MOUNTS; do
            do_unmount_single "$name"
        done
    else
        do_unmount_single "$target"
    fi
}

do_status() {
    local target="${1:-all}"

    # Network info
    if is_internal_network; then
        echo "Network: internal ($INTERNAL_HOST)"
    else
        echo "Network: external ($EXTERNAL_HOST)"
    fi
    echo ""

    if [[ "$target" == "all" ]]; then
        for name in $ALL_MOUNTS; do
            do_status_single "$name"
        done
    else
        do_status_single "$target"
    fi
}

# Ensure SSH agent has keys (for automount scenarios)
ensure_ssh_agent() {
    if ! ssh-add -l &>/dev/null; then
        log "No SSH keys loaded, attempting to load from keychain..."
        ssh-add --apple-load-keychain 2>/dev/null
    fi
}

# Parse arguments
ACTION="${1:-mount}"
TARGET="${2:-all}"

case "$ACTION" in
    mount)
        ensure_ssh_agent
        do_mount "$TARGET"
        ;;
    unmount|umount)
        do_unmount "$TARGET"
        ;;
    status)
        do_status "$TARGET"
        ;;
    remount)
        do_unmount "$TARGET"
        sleep 1
        ensure_ssh_agent
        do_mount "$TARGET"
        ;;
    *)
        echo "Usage: $0 [mount|unmount|status|remount] [all|home|media|raid]"
        echo ""
        echo "Mounts:"
        echo "  home  - ~/mnt/HOMENAS  → /home/camerontora"
        echo "  media - ~/mnt/CAMNAS2  → /HOMENAS (100TB RAID)"
        echo "  raid  - ~/mnt/CAMRAID  → /CAMRAID (hardware RAID)"
        echo "  all   - All mounts (default)"
        exit 1
        ;;
esac
