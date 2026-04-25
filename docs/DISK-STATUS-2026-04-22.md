# Disk Status — 2026-04-22

## Summary

All 11 disks passed SMART health checks. No reallocated sectors, no pending sectors, no uncorrectable errors across any drive. One flag: **sdh is negotiating SATA at 3.0 Gb/s instead of 6.0 Gb/s** — likely a cable or port issue, worth investigating.

---

## RAID Status (`/proc/mdstat`)

```
md1 : active raid5 sdi[6] sdj[1] sdd[0] sdc[3] sdf[4] sde[5] sdh[8] sdg[7]
      109380232192 blocks super 1.2 level 5, 512k chunk, algorithm 2 [8/8] [UUUUUUUU]
      bitmap: 0/117 pages [0KB], 65536KB chunk
```

**Healthy — all 8/8 drives active, no rebuild in progress.**

---

## Filesystem Usage

| Mount | Filesystem | Size | Used | Free | Use% | Notes |
|-------|-----------|------|------|------|------|-------|
| `/` | /dev/sda2 | 60G | 14G | 44G | 23% | OK |
| `/boot/efi` | /dev/sda1 | 511M | 6.2M | 505M | 2% | OK |
| `/tmp` | /dev/sda4 | 12G | 17M | 11G | 1% | OK |
| `/var` | /dev/sda5 | 60G | 44G | 14G | 77% | Monitor — Docker images/logs accumulate here |
| `/home` | /dev/sda6 | 72G | 59G | 9.5G | **87%** | ⚠ Getting full |
| `/CAMRAID` | /dev/sdk2 | 17T | 9.3T | 6.3T | 60% | OK |
| `/HOMENAS` | /dev/md1 | 102T | 92T | 6.1T | **94%** | ⚠ Nearly full — plan expansion or cleanup |
| `/BACKUP` | /dev/sdb1 | 234G | 25G | 198G | 11% | Old server disk from Oct 2022 — see below |
| `/dev/shm` | tmpfs | 16G | 581M | 16G | 4% | OK |

---

## Drive Inventory

### SSDs — OS

| Disk | Model | Serial | Capacity | Hours | Temp | Reallocated | Pending | Uncorrectable | Notes |
|------|-------|--------|----------|-------|------|-------------|---------|---------------|-------|
| sda | Samsung 860 PRO 256GB | S418NF0K600489M | 256 GB | 62,889 (~7.2 yr) | 36°C | 0 | — | 0 | OS drive |
| sdb | Samsung 860 PRO 256GB | S5GANE0N108314D | 256 GB | 51,388 (~5.9 yr) | 34°C | 0 | — | 0 | Mounted at `/BACKUP` — old server disk, see below |

**Note on sda:** 62,889 hours is getting up there for an SSD. Samsung 860 PRO has 1.2 PB endurance rating so it's likely fine, but it's worth monitoring write endurance values going forward.

**Note on sdb — resolved 2026-04-22:** This disk was investigated and identified as the OS/data disk from the previous server (CAMNAS1), migrated over when CAMNAS2 was built in Oct 2022. It was never set up as the intended RAID1 mirror of the OS disk — it was repurposed as FTP storage under the `camftp` user instead, and last actively used in Aug 2025.

Contents:
- `Desktop/` — old Linux desktop files (2019–2022): notes, screenshots, personal docs, a Plex preroll video
- `Plex Media Server/` — old Plex app data (cache, metadata, logs, preferences)
- `Tautulli/` — old Tautulli watch history DB (~170MB, covers up to Oct 2022)
- **⚠ Sensitive files still present:** `/BACKUP/Desktop/metamask recovery phrase` and `/BACKUP/Desktop/MEGA-RECOVERYKEY.txt` — plaintext credential files. Review and securely delete or move these.

The disk was permanently mounted at `/BACKUP` via fstab (UUID-based, `nofail`, 5s device timeout — boot-safe). 25G used, 198G free.

**FTP context:** `vsftpd` is installed and configured (serves `/CAMRAID` as root, SSL enabled, whitelist-only via `/etc/vsftpd.userlist`). Users `camftp` and `grahamftp` are in the whitelist but neither account exists in the current `/etc/passwd` — they were from the old system. **vsftpd is currently broken** — has been failing since 2026-04-12 with `INVALIDARGUMENT`. Needs investigation before FTP is usable again.

---

### HDDs — RAID5 Array (md1 → /HOMENAS)

8x Seagate IronWolf Pro 16TB in RAID5. Two generations of hardware:

**Batch 1 — ST16000NE000-2RW103 (firmware EN02) — ~3.5 years old**

| Disk | Serial | Hours | Temp | Load Cycles | Pending | Uncorrectable |
|------|--------|-------|------|-------------|---------|---------------|
| sdc | ZL2PWRMK | 30,811 | 39°C | 47,223 | 0 | 0 |
| sdd | ZL2PWRH5 | 30,811 | 41°C | 46,988 | 0 | 0 |
| sde | ZL2Q1VMT | 30,688 | 41°C | 47,002 | 0 | 0 |
| sdf | ZL2PWT77 | 30,764 | 40°C | 46,998 | 0 | 0 |
| sdi | ZL2Q1V0A | 30,688 | **44°C** | 47,119 | 0 | 0 |
| sdj | ZL2PWN36 | 30,811 | 42°C | 46,884 | 0 | 0 |

**Batch 2 — ST16000NE000-3UN101 (firmware EN01) — ~1.6 years old**

| Disk | Serial | Hours | Temp | Load Cycles | Pending | Uncorrectable | SATA Speed |
|------|--------|-------|------|-------------|---------|---------------|------------|
| sdg | ZVTEF159 | 13,610 | 40°C | 21,775 | 0 | 0 | 6.0 Gb/s |
| sdh | ZVTEFEJZ | 13,610 | 39°C | 21,858 | 0 | 0 | ✅ 6.0 Gb/s (resolved 2026-04-25) |

**✅ sdh SATA speed resolved 2026-04-25.** SATA cable replaced; now negotiating at 6.0 Gb/s. RAID healthy [8/8] [UUUUUUUU].

#### Cable swap procedure for sdh

sdh is a member of the HOMENAS RAID5 array and is screwed into the chassis — physical identification is required before touching anything.

**Drive to find:** Serial number **ZVTEFEJZ** (Seagate IronWolf Pro 16TB, ST16000NE000-3UN101, ~1.6 years old)

Steps:
1. Before opening the case, note the current OS device assignment: `ls -la /sys/block/sdh` — confirms which physical bay maps to sdh at that moment (device assignments can shift on reboot).
2. Power down cleanly: `sudo shutdown -h now`
3. Open chassis. Check the label on each drive for serial **ZVTEFEJZ** — it's on a sticker on the drive body.
4. Trace the SATA data cable from that drive back to the motherboard/HBA.
5. Swap the SATA data cable for a known-good SATA III cable (not the power cable).
6. If you don't have a spare: try reseating the existing cable at both ends first — sometimes enough to fix a marginal connection.
7. Power on. Verify the fix: `cat /sys/class/ata_link/$(readlink -f /sys/block/sdh | grep -o 'ata[0-9]*' | sed 's/ata/link/')/sata_spd` — should now show `6.0 Gbps`.
8. Confirm RAID is still healthy: `cat /proc/mdstat` — should show `[8/8] [UUUUUUUU]`.

**Note on sdi:** Running warmest at 44°C. Still within safe range for IronWolf Pro (rated to 70°C) but worth keeping an eye on airflow around that bay.

---

### HDD — Standalone (/CAMRAID)

| Disk | Model | Serial | Capacity | Notes |
|------|-------|--------|----------|-------|
| sdk | JMicron H/W RAID5 | 3OOB7XU4HDIXTQ72DYSW | 18 TB (reported) | Hardware RAID controller presenting as single device. SMART data limited — underlying physical drives not individually visible to OS. Mounts as /CAMRAID (ext4, 17T). |

**Note on sdk:** Because this is a hardware RAID controller (JMicron), smartctl can't see the individual drives underneath. The array health is opaque — the controller manages it internally. If the controller fails, data recovery becomes significantly harder. Consider whether migrating to software RAID (mdadm) or a ZFS pool would be preferable long-term.

---

## Items to Watch

| Priority | Item | Action |
|----------|------|--------|
| Medium | /HOMENAS at 94% (6.1T free) | Plan for cleanup or expansion — at current usage this will fill within months |
| Medium | /home at 87% (9.5G free) | Identify what's consuming space: `du -sh /home/camerontora/*` |
| ~~Low~~ | ~~sdh negotiating SATA at 3.0 Gb/s~~ | ✅ Resolved 2026-04-25 — cable replaced, now 6.0 Gb/s |
| Low | sda at 62,889 hours (~7.2 yr) | Monitor; consider having a spare SSD on hand |
| High | Sensitive plaintext files on /BACKUP | Review/delete `/BACKUP/Desktop/metamask recovery phrase` and `/BACKUP/Desktop/MEGA-RECOVERYKEY.txt` |
| Medium | vsftpd broken since 2026-04-12 | Investigate `INVALIDARGUMENT` failure — check logs, likely a config/cert issue |
| Low | camftp/grahamftp in vsftpd.userlist but not in /etc/passwd | Decide whether to recreate these users or remove them from the whitelist |
| Low | sdk hardware RAID opacity | No immediate action needed; be aware if controller shows issuesdi |
