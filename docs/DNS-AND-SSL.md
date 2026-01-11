# DNS and SSL Certificate Management

## Dynamic DNS (GoDaddy)

The server's public IP can change. A script updates GoDaddy DNS records automatically.

### Script Location
- **Production**: `/usr/local/bin/godaddy-ddns.sh`
- **Git copy**: `scripts/godaddy-ddns.sh`
- **Credentials**: `/etc/godaddy-ddns.env` (chmod 600)

### Credentials Setup
The git version of the script does NOT contain API keys. Create the credentials file:
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
- `watchmap`, `haymaker`, `netdata`

### Adding a New Subdomain
1. Edit `/usr/local/bin/godaddy-ddns.sh`
2. Add the subdomain to the `RECORDS` array
3. Run the script manually to create the record: `sudo /usr/local/bin/godaddy-ddns.sh`

### Logs
- Log file: `/var/log/godaddy-ddns.log`
- Last update: `/var/lib/godaddy-ddns.last_update`

---

## SSL Certificates (Let's Encrypt)

All subdomains share a single certificate managed by certbot.

### Certificate Details
- **Name**: `camerontora-services`
- **Location**: `/etc/letsencrypt/live/camerontora-services/`
- **Method**: Apache plugin (handles ACME challenges)

### Current Domains
```
camerontora.ca
emby.camerontora.ca
haymaker.camerontora.ca
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

**IMPORTANT**:
1. You must list ALL existing domains plus the new one. Missing a domain will REMOVE it from the certificate.
2. You must stop nginx-proxy first (it binds port 80, blocking Apache/certbot).

```bash
# Stop nginx first
docker stop nginx-proxy

# Run certbot
sudo certbot --apache --expand \
  --cert-name camerontora-services \
  -d camerontora.ca \
  -d emby.camerontora.ca \
  -d haymaker.camerontora.ca \
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

# Restart nginx after cert is updated
docker start nginx-proxy
```

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

1. **DNS**: Add subdomain to `RECORDS` array in `/usr/local/bin/godaddy-ddns.sh`
2. **DNS**: Run script to create record: `sudo /usr/local/bin/godaddy-ddns.sh`
3. **SSL**: Expand certificate with ALL domains (see command above)
4. **Nginx**: Add proxy config in `/home/camerontora/infrastructure/nginx/conf.d/`
5. **Nginx**: Reload: `docker exec nginx-proxy nginx -s reload`
