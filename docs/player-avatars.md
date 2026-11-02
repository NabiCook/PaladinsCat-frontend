# Player avatars (profile icons) — id map

SSoT: the Hi-Rez icon URL is the durable source of truth. An avatar is fully
described by its id; no local decoding is needed.

```
https://hirez-api.onrender.com/paladins/avatar/{avatar_id}
```

## Where the id comes from

| profile type | field | path into the DB |
|---|---|---|
| public | `AvatarId` / `AvatarURL` (Hi-Rez `getplayer`) | `players.avatar_id` / `players.avatar_url` |
| private (MCTS) | `AVATAR_ITEM_ID` in the profile payload | `mcts_player_observation.payload_gz` |

Frontend consumes it as `/player-avatars/{avatar_id}.png`
(`app/player-avatars/[file]/route.ts`), which fetches the upstream URL above
(`force-cache`, 7-day revalidate, 5 s timeout, 512 KiB cap).

## Map

`player-avatars.tsv` — one row per observed id:

`avatar_id · public_players · private_players · http · content_type · bytes · icon_url · proxy_path`

Observed universe: **365 ids** (9918 – 33755), all `200` upstream.
Private coverage: 70 of 269 privacy-flagged profiles carry an avatar id
(39 distinct ids). Public coverage: 348 k rows carry a non-zero id.

`avatar_id = 0` is the no-avatar sentinel and is excluded.

## Refresh

```bash
python3 /home/n4b1/.hermes/scripts/map_avatars.py --private \
  --out /mnt/n4b1/NABI/Project/PaladinsCat/paladinscat-frontend/docs/player-avatars.tsv
```

~30 s for the current corpus; rewrites the TSV in place.
