# Discord Rich Presence test

1. Start **Discord Desktop**. The Discord website does not provide the Windows IPC pipe used here.
2. Open `browser://settings` in Untitled Browser.
3. Paste the **Application ID** from your Discord Developer Portal application. Do not paste the Client Secret or Public Key.
4. Enable Discord RPC and click **Test Connection**.
5. The browser only reports Connected after Discord sends the IPC `READY` event and the `SET_ACTIVITY` command gets a successful response.
6. Open YouTube or another HTTPS site. The presence state uses only the sanitized domain.
7. Open Incognito. The real site is hidden from the presence.

## Protocol

Discord's current RPC documentation specifies Windows IPC paths in the form `\\?\pipe\discord-ipc-{n}`, a version-1 handshake containing the application `client_id`, a `READY` event after the handshake, and `SET_ACTIVITY` for Rich Presence updates.

When Discord rejects the ID, the browser now displays Discord's real RPC code/message rather than a local guess. Check `browser.log` for the same event without exposing the full ID.
