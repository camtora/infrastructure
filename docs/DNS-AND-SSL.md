# DNS and SSL Certificate Management

## Dynamic DNS (GoDaddy)

The server's public IP can change. A script updates GoDaddy DNS records automatically.

### Script Location
- **Script**: `scripts/godaddy-ddns.sh` (runs directly from git repo)
- **Credentials**: `/etc/godaddy-ddns.env` (chmod 600)
- **Cron**: `/etc/cron.d/godaddy-ddns`

### Schedule
The script runs every 10 minutes via cron. Uses batch API calls (2 calls per run) to stay well under GoDaddy's 20,000 calls/month quota (~8,640 calls/month at this rate).

```
*/10 * * * * root /home/camerontora/infrastructure/scripts/godaddy-ddns.sh
```

To set up the cron job:
```bash
sudo tee /etc/cron.d/godaddy-ddns << 'EOF'
# Update GoDaddy DNS records every 10 minutes
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/10 * * * * root /home/camerontora/infrastructure/scripts/godaddy-ddns.sh 2>&1
EOF
```

### Credentials Setup
The script reads API keys from `/etc/godaddy-ddns.env`. If not already created:
```bash
sudo tee /etc/godaddy-ddns.env << 'EOF'
API_KEY=your_godaddy_api_key
API_SECRET=your_godaddy_api_secret
EOF
sudo chmod 600 /etc/godaddy-ddns.env
```

### Managed Records
The script updates these A records when the IP changes:
- `@` (camerontora.ca)
- `ombi`, `plex`, `sonarr`, `radarr`, `tautulli`, `transmission`
- `jackett`, `status`, `emby`, `jellyfin`, `overseerr`
- `watchmap`, `haymaker`, `netdata`, `health`

### Adding a New Subdomain
1. Edit `scripts/godaddy-ddns.sh`
2. Add the subdomain to the `RECORDS` array
3. Run the script manually to create the record: `sudo /home/camerontora/infrastructure/scripts/godaddy-ddns.sh`

### Logs
- Log file: `/var/log/godaddy-ddns.log`
- Last update: `/var/lib/godaddy-ddns.last_update`

---

## SSL Certificates (Let's Encrypt)

All subdomains share a single certificate managed by certbot.

### Certificate Details
- **Name**: `camerontora-services`
- **Location**: `/etc/letsencrypt/live/camerontora-services/`
- **Method**: Webroot (nginx stays running during renewal)
- **Webroot**: `/var/www/acme`

### Current Domains
```
camerontora.ca
www.camerontora.ca
emby.camerontora.ca
haymaker.camerontora.ca
health.camerontora.ca
jackett.camerontora.ca
jellyfin.camerontora.ca
netdata.camerontora.ca
ombi.camerontora.ca
overseerr.camerontora.ca
plex.camerontora.ca
radarr.camerontora.ca
sonarr.camerontora.ca
status.camerontora.ca
tautulli.camerontora.ca
transmission.camerontora.ca
watchmap.camerontora.ca
```

### Adding a New Subdomain to the Certificate

**IMPORTANT**: You must list ALL existing domains plus the new one. Missing a domain will REMOVE it from the certificate.

```bash
# No need to stop nginx! Webroot mode works with nginx running.
sudo certbot certonly --webroot \
  -w /var/www/acme \
  --cert-name camerontora-services \
  -d camerontora.ca \
  -d www.camerontora.ca \
  -d emby.camerontora.ca \
  -d haymaker.camerontora.ca \
  -d health.camerontora.ca \
  -d jackett.camerontora.ca \
  -d jellyfin.camerontora.ca \
  -d netdata.camerontora.ca \
  -d ombi.camerontora.ca \
  -d overseerr.camerontora.ca \
  -d plex.camerontora.ca \
  -d radarr.camerontora.ca \
  -d sonarr.camerontora.ca \
  -d status.camerontora.ca \
  -d tautulli.camerontora.ca \
  -d transmission.camerontora.ca \
  -d watchmap.camerontora.ca \
  -d NEW_SUBDOMAIN.camerontora.ca

# Reload nginx to pick up new cert
docker exec nginx-proxy nginx -s reload
```

### How Webroot Mode Works
1. Nginx serves `/.well-known/acme-challenge/` from `/var/www/acme` (configured in `00-http-redirect.conf`)
2. Certbot writes challenge files to `/var/www/acme/.well-known/acme-challenge/`
3. Let's Encrypt verifies the challenge via HTTP
4. No downtime - nginx stays running throughout

### Checking Current Certificate
```bash
sudo certbot certificates
# or
echo | openssl s_client -connect camerontora.ca:443 2>/dev/null | openssl x509 -noout -text | grep DNS:
```

### Renewal
Certbot auto-renews via systemd timer. Check status:
```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

---

## Checklist: Adding a New Service

1. **DNS**: Add subdomain to `RECORDS` array in `scripts/godaddy-ddns.sh`
2. **DNS**: Run script to create record: `sudo /home/camerontora/infrastructure/scripts/godaddy-ddns.sh`
3. **SSL**: Expand certificate with ALL domains (see command above)
4. **Nginx**: Add proxy config in `/home/camerontora/infrastructure/nginx/conf.d/`
5. **Nginx**: Reload: `docker exec nginx-proxy nginx -s reload`
