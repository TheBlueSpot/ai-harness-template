# Gladiator Soul Art Notes

Goal: ship transparent gladiator art with a public-domain basis.

## Sources

| Local file | Source | Basis |
| --- | --- | --- |
| `assets/gladiators/player.png` | https://openclipart.org/detail/339771/gladiator | OpenClipart page states the image was released into the public domain by BlackScorp. |
| `assets/gladiators/enemy.png` | https://openclipart.org/detail/296808/gladiator | OpenClipart remix of a public-domain source image; source page and download bitmap are used for the shipped raster. |

## Notes

- Both shipped files are transparent PNGs intended for direct use in the menu, arena, and champion screens.
- The game keeps the provenance note at a high level here so the UI and code can stay focused on gameplay.
- If the art changes later, keep the local filenames stable or update the inventory loader at the same time.
