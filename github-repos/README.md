# 9 GitHub repos that replace $1000 paid tools

These are the open-source projects featured in the Instagram reel
"9 GitHub repos that replace $1000 paid tools" by @leotalksgen
(https://www.instagram.com/reel/DfNMuHKtDn5/). The reel shows each one as a
numbered card next to the paid tool it replaces.

Each repo is a **shallow git submodule** in this folder, pinned to the upstream
commit it was downloaded at. Only the pointers are stored in MEDIA, which keeps
this repo small. Cal.com, OpenProject, Chatwoot and the others add up to more
than 1.4 GB of source.

| # | In the reel | Replaces | Upstream repo | Folder |
|---|---|---|---|---|
| 1 | OpenHiggsField | Higgsfield AI (image/video generation studio) | [wide-trace/open-higgsfield](https://github.com/wide-trace/open-higgsfield) | `01-open-higgsfield` |
| 2 | Voice Studio | ElevenLabs (voice cloning, TTS, dubbing) | [debpalash/VoiceStudio](https://github.com/debpalash/VoiceStudio) | `02-voice-studio` |
| 3 | OpenSEO | Semrush / Ahrefs | [every-app/open-seo](https://github.com/every-app/open-seo) | `03-open-seo` |
| 4 | AppFlowy | Notion | [AppFlowy-IO/AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) | `04-appflowy` |
| 5 | OpenWhisper | Wispr Flow (voice dictation) | [OpenWhispr/openwhispr](https://github.com/OpenWhispr/openwhispr) | `05-openwhispr` |
| 6 | OpenProject | Jira / MS Project | [opf/openproject](https://github.com/opf/openproject) | `06-openproject` |
| 7 | Cal.com | Calendly | [calcom/cal.com](https://github.com/calcom/cal.com) | `07-cal.com` |
| 8 | Chatwoot | Intercom | [chatwoot/chatwoot](https://github.com/chatwoot/chatwoot) | `08-chatwoot` |
| 9 | Cap | Loom | [CapSoftware/Cap](https://github.com/CapSoftware/Cap) | `09-cap` |

The reel shows only names, not links. The names were matched to repos like this:

- **OpenHiggsField**: several repos use this name. `wide-trace/open-higgsfield` is the most-starred
  (~5.5k) and describes itself as "the free, open-source alternative to Higgsfield AI".
  It has **no LICENSE file**, so check with the author before reusing its code.
- **Voice Studio**: `debpalash/VoiceStudio`, "the open-source, fully-local ElevenLabs alternative".
- **OpenSEO**: `every-app/open-seo`, "Open source alternative to Semrush and Ahrefs".
- **OpenWhisper**: the on-screen spelling is "OpenWhisper". The well-known project is spelled
  **OpenWhispr** (`OpenWhispr/openwhispr`, a voice-to-text dictation app). The reel's mic card matches it.

## Getting the source

After cloning MEDIA, pull all nine (shallow, latest pinned commit only):

```bash
git submodule update --init --depth 1 github-repos
```

Or pull just one:

```bash
git submodule update --init --depth 1 github-repos/09-cap
```

To move every repo forward to upstream's latest commit:

```bash
git submodule update --remote --depth 1 github-repos
```

Each project keeps its own license (AGPL, MIT, GPL and others). Read the `LICENSE` file
inside its folder before reusing its code.
