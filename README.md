# Examples App - HTTPS Setup

This examples app runs with HTTPS to enable testing on mobile devices (camera, geolocation APIs require HTTPS).

## Setup

1. **Install mkcert** (if not already installed):
   ```bash
   brew install mkcert
   ```

2. **Install the local CA** (one-time setup):
   ```bash
   mkcert -install
   ```

3. **Generate certificates** (already done, but if you need to regenerate):
   ```bash
   mkcert -key-file .certs/key.pem -cert-file .certs/cert.pem localhost 127.0.0.1 ::1
   ```

   To include your local network IP for phone testing:
   ```bash
   # Get your local IP first
   ipconfig getifaddr en0  # or en1
   
   # Then generate cert with your IP
   mkcert -key-file .certs/key.pem -cert-file .certs/cert.pem localhost 127.0.0.1 ::1 YOUR_LOCAL_IP
   ```

## Running

```bash
npm run dev
```

The app will be available at:
- **Local**: https://localhost:4200
- **Network**: https://YOUR_LOCAL_IP:4200 (for phone testing)

## Phone Testing

1. Make sure your phone is on the same WiFi network as your computer
2. Find your computer's local IP address
3. On your phone, navigate to: `https://YOUR_LOCAL_IP:4200`
4. You may need to accept the self-signed certificate warning on your phone

## Note

The certificates are in `.certs/` directory and are git-ignored for security.

