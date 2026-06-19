# Cookie Export

Store the Craftpix session cookie file at `.local/craftpix/cookies.txt` unless the user asks for another path.

## Format

Export cookies in Netscape or Mozilla cookie-jar format so the Bun helper can parse them directly.

## Scope

- Export cookies from a browser session that is already signed in to Craftpix.
- Include `craftpix.net` and `files.craftpix.net` cookies when your exporter can capture them.
- Prefer a Craftpix-only export over dumping every site cookie into one jar.
- Re-export after logging in again, changing browsers, or when downloads start returning HTML instead of an archive.
- After a successful browser download, re-export immediately so Cloudflare clearance cookies for the CDN are included when present.

## Safety

- Keep cookie files local.
- Never commit them.
- Prefer `.local/` or another ignored path outside game folders.

## Troubleshooting

- `membership page instead of an archive`: the session cookie is missing or expired.
- `sign-in page instead of an archive`: the export came from a logged-out browser state or the wrong browser profile.
- `download landing page but the archive could not be fetched`: craftpix.net accepted the session, but `files.craftpix.net` rejected the zip fetch. Complete one download in the browser, then re-export cookies for both hosts.
- `could not find Craftpix product_ID`: the input URL is not a standard Craftpix product page; pass the product page or the direct `/download/<id>/` URL instead.
