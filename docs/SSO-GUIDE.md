# SSO Guide: Adding New Services to camerontora.ca

This guide explains how to add new services to the camerontora.ca infrastructure with unified Single Sign-On (SSO).

## How SSO Works

### Architecture Overview

1. **Nginx** receives all requests on ports 80/443
2. **OAuth2 Proxy** handles authentication via Google OAuth
3. **Shared cookie** (`_oauth2_proxy`) with domain `.camerontora.ca` enables SSO across all subdomains

### The Cookie Domain Trick

OAuth2 Proxy sets cookies per-subdomain by default, which breaks SSO. We fix this using nginx's `proxy_cookie_domain` directive to rewrite cookie domains:

```nginx
proxy_cookie_domain $host .camerontora.ca;
```

This rewrites `haymaker.camerontora.ca` → `.camerontora.ca`, allowing the cookie to work across all subdomains.

---

## Adding a New Protected Service

### Step 1: DNS Setup

Add an A record pointing to your server:
```
newservice.camerontora.ca → YOUR_SERVER_IP
```

### Step 2: SSL Certificate

Add the new subdomain to your Let's Encrypt certificate:
```bash
sudo certbot certonly --expand \
  -d camerontora.ca \
  -d *.camerontora.ca \
  # ... or add specifically:
  -d newservice.camerontora.ca
```

### Step 3: Add to Google OAuth Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Edit your OAuth 2.0 Client ID
3. Add to "Authorized redirect URIs":
   ```
   https://newservice.camerontora.ca/oauth2/callback
   ```
4. Save and wait 1-5 minutes for propagation

### Step 4: Create Nginx Config

Create `/home/camerontora/infrastructure/nginx/conf.d/XX-newservice.conf`:

```nginx
# newservice.camerontora.ca - Description of your service
# Protected - requires authentication

server {
    listen 80;
    server_name newservice.camerontora.ca;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name newservice.camerontora.ca;

    ssl_certificate /etc/letsencrypt/live/camerontora-services/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/camerontora-services/privkey.pem;

    # OAuth2 endpoints
    location /oauth2/ {
        proxy_pass http://oauth2-proxy;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Auth-Request-Redirect $scheme://$host$request_uri;
        # CRITICAL: Rewrite cookie domain for SSO
        proxy_cookie_domain $host .camerontora.ca;
    }

    location = /oauth2/auth {
        internal;
        proxy_pass http://oauth2-proxy/oauth2/auth;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Content-Length "";
        proxy_pass_request_body off;
    }

    location @error401 {
        return 302 https://$host/oauth2/start?rd=$scheme://$host$request_uri;
    }

    location / {
        auth_request /oauth2/auth;
        auth_request_set $auth_email $upstream_http_x_auth_request_email;
        error_page 401 = @error401;

        # Change this to your service's port
        proxy_pass http://host.docker.internal:YOUR_PORT;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Pass authenticated user's email to backend
        proxy_set_header X-Forwarded-Email $auth_email;

        # WebSocket support (if needed)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Step 5: Reload Nginx

```bash
# Test config first
docker exec nginx-proxy nginx -t

# Reload if test passes
docker exec nginx-proxy nginx -s reload
```

### Step 6: Test

1. Clear cookies for `*.camerontora.ca`
2. Log in to any existing service (e.g., haymaker.camerontora.ca)
3. Navigate to your new service - should be automatically authenticated

---

## Adding a New Public Service

For services that don't require authentication:

```nginx
# publicservice.camerontora.ca - Public service
# No authentication required

server {
    listen 80;
    server_name publicservice.camerontora.ca;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name publicservice.camerontora.ca;

    ssl_certificate /etc/letsencrypt/live/camerontora-services/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/camerontora-services/privkey.pem;

    location / {
        proxy_pass http://host.docker.internal:YOUR_PORT;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Adding a Hybrid Service (Public with Optional Auth)

Like camerontora.ca - public access but passes user info if logged in:

```nginx
server {
    listen 443 ssl http2;
    server_name hybrid.camerontora.ca;

    ssl_certificate /etc/letsencrypt/live/camerontora-services/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/camerontora-services/privkey.pem;

    # OAuth2 endpoints
    location /oauth2/ {
        proxy_pass http://oauth2-proxy;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cookie_domain $host .camerontora.ca;
    }

    location = /oauth2/auth {
        internal;
        proxy_pass http://oauth2-proxy/oauth2/auth;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Content-Length "";
        proxy_pass_request_body off;
    }

    location / {
        # Try to get auth info (but don't require it)
        auth_request /oauth2/auth;
        auth_request_set $auth_email $upstream_http_x_auth_request_email;
        auth_request_set $auth_user $upstream_http_x_auth_request_user;

        # Don't fail if not authenticated - fall back to @public
        error_page 401 = @public;

        proxy_pass http://host.docker.internal:YOUR_PORT;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Email $auth_email;
        proxy_set_header X-Forwarded-User $auth_user;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Fallback for unauthenticated requests
    location @public {
        proxy_pass http://host.docker.internal:YOUR_PORT;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Managing Allowed Users

Edit `/home/camerontora/infrastructure/oauth2-proxy/authenticated_emails.txt`:

```
cameron@camerontora.ca
cameron.tora@gmail.com
newuser@example.com
```

Changes are picked up automatically (no restart needed).

---

## Troubleshooting

### SSO not working (prompted to log in on each subdomain)

1. Check cookie domain in browser dev tools:
   - F12 → Application → Cookies
   - `_oauth2_proxy` should have domain `.camerontora.ca`

2. Verify `proxy_cookie_domain` is in the `/oauth2/` location block

3. Clear all cookies and try again

### 401 Unauthorized

- Check if email is in `authenticated_emails.txt`
- Check OAuth2 Proxy logs: `docker-compose logs oauth2-proxy`

### 502 Bad Gateway

- Check if OAuth2 Proxy is running: `docker-compose ps`
- Check if backend service is running on the specified port

### redirect_uri_mismatch

- Add the callback URL to Google OAuth Console:
  `https://subdomain.camerontora.ca/oauth2/callback`
- Wait 1-5 minutes for Google to propagate changes

### CSRF Token Invalid

- Ensure `proxy_cookie_domain` is set in the `/oauth2/` location
- Clear cookies and try again

---

## Configuration Reference

### OAuth2 Proxy Environment Variables

| Variable | Description |
|----------|-------------|
| `OAUTH2_PROXY_CLIENT_ID` | Google OAuth Client ID |
| `OAUTH2_PROXY_CLIENT_SECRET` | Google OAuth Client Secret |
| `OAUTH2_PROXY_COOKIE_SECRET` | 32-byte base64 secret for cookies |
| `OAUTH2_PROXY_COOKIE_DOMAIN` | `.camerontora.ca` for SSO |
| `OAUTH2_PROXY_WHITELIST_DOMAINS` | `.camerontora.ca` |

### Generate a New Cookie Secret

```bash
python3 -c 'import secrets; import base64; print(base64.b64encode(secrets.token_bytes(32)).decode())'
```

### File Structure

```
/home/camerontora/infrastructure/
├── docker-compose.yaml      # Main compose file
├── .env                     # Secrets (not in git)
├── nginx/
│   ├── nginx.conf          # Main nginx config
│   └── conf.d/
│       ├── 00-auth.conf    # Upstream definition
│       ├── 01-camerontora.conf
│       ├── 02-haymaker.conf
│       ├── 10-protected-services.conf
│       └── 20-public-services.conf
├── oauth2-proxy/
│   └── authenticated_emails.txt
└── docs/
    └── SSO-GUIDE.md        # This file
```

---

## Quick Reference: New Protected Service Checklist

- [ ] Add DNS A record
- [ ] Add to SSL certificate (if not using wildcard)
- [ ] Add callback URL to Google OAuth Console
- [ ] Create nginx config with `proxy_cookie_domain $host .camerontora.ca;`
- [ ] Test nginx config: `docker exec nginx-proxy nginx -t`
- [ ] Reload nginx: `docker exec nginx-proxy nginx -s reload`
- [ ] Test SSO works across subdomains
