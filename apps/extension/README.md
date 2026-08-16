# Switchpath Chrome extension

Local Manifest V3 intervention layer for the Switchpath MVP.

## Load locally

1. Keep the Switchpath API and worker running.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose this `apps/extension` folder.
5. Open any public HTTP/HTTPS page and press **Ctrl + Shift + Y**.

The panel captures the active page URL, pauses the active research run at a safe checkpoint, submits the page as a proposed route, shows the comparison, and lets the AE approve or keep the original route.

Chrome internal pages and the Chrome Web Store do not allow content-script overlays.
