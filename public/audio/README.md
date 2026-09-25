# Scene audio

Taleweaver plays a looping **ambience** for each scene and short **sound effects** at dramatic moments.
Out of the box every sound is synthesised in the browser. For richer sound, drop audio files in this folder
and list them in `manifest.json`. Any tag without a file keeps using the synthesised version, and a file that
fails to load falls back too.

```json
{
  "ambience": {
    "tavern": ["ambience/tavern-1.ogg", "ambience/tavern-2.ogg"],
    "storm": ["ambience/storm.ogg"]
  },
  "sfx": {
    "sword": ["sfx/sword-clash.ogg"]
  }
}
```

When several files are listed for a tag, one is picked at random. Use `.ogg` or `.mp3`. Ambience should loop
cleanly and be 1–3 minutes long.

## Tags

Ambience: `tavern`, `forest-day`, `forest-night`, `cave`, `dungeon`, `storm`, `city`, `sea`, `camp`, `temple`,
`combat`, `tension`, `victory`, `silence`.

Sound effects: `door`, `sword`, `spell`, `coins`, `roar`, `footsteps`, `thunder`, `splash`, `arrow`, `scream`,
`chest`, `bell`, plus `dice` (played on every roll).

## Where to find free sounds

Use sounds whose licence allows use without attribution (CC0 / public domain), or keep a note of the credits:

- Freesound: https://freesound.org (filter by the "Creative Commons 0" licence)
- OpenGameArt: https://opengameart.org (filter by CC0)
- Sonniss GDC audio bundles: https://sonniss.com/gameaudiogdc (royalty-free, no attribution)

In Docker the folder is mounted from `./audio`, so you can add files without rebuilding the image.
