# Cookie Export

Store the Craftpix session cookie file at `.local/craftpix/cookies.txt` unless the user asks for another path.

## Format

Export cookies in Netscape or Mozilla cookie-jar format so the Bun helper can parse them directly.

## Scope

- Export cookies from a browser session that is already signed in to Craftpix.
- Include `craftpix.net` cookies.
- Re-export after logging in again, changing browsers, or when downloads start returning HTML instead of an archive.

## Safety

- Keep cookie files local.
- Never commit them.
- Prefer `.local/` or another ignored path outside game folders.

## Troubleshooting

- `membership page instead of an archive`: the session cookie is missing or expired.
- `sign-in page instead of an archive`: the export came from a logged-out browser state or the wrong browser profile.
- `could not find Craftpix product_ID`: the input URL is not a standard Craftpix product page; pass the product page or the direct `/download/<id>/` URL instead.
