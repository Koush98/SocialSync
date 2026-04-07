# Static Frontend

Small static replacement for the current Next frontend.

Files:

- `index.html`: dashboard, account connections, media upload, create-post flow
- `posts.html`: scheduled posts, publish now, cancel, edit, operational logs
- `privacy.html`: privacy policy
- `terms.html`: terms page
- `app.js`: shared runtime and API client
- `styles.css`: shared styling

Optional runtime config before `app.js`:

```html
<script>
  window.SOCIALSYNC_CONFIG = {
    apiBaseUrl: "http://127.0.0.1:8000",
    tenantId: "tenant_123",
    authTokenStorageKey: "snapkey_jwt"
  };
</script>
```
