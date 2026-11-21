#!/usr/bin/env python3
"""Shot pack for animating the Sheru Bhai storyboard with an image-to-video model.

Each of the 18 story frames is the FIRST FRAME of its clip (so the faces, suits, jewellery and props start
exactly as delivered), and the prompt directs what happens next: the acting, the camera and the spoken line
from the storyboard PDF. Frame 19 (the brand card) is not generated; it stays the exact vector card.

Writes:
  out/storyboard/sheru-bhai/animation-shot-pack.json   machine-readable (used when generating)
  out/storyboard/sheru-bhai/animation-shot-pack.md     the same, for pasting into any image-to-video tool

usage: python3 scripts/sheru_shot_pack.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out" / "storyboard" / "sheru-bhai"
RAW = "https://raw.githubusercontent.com/GFHSCreatives/MEDIA/claude/aviation-logo-intro-video-0e18em/out/storyboard/sheru-bhai"

SHERU = "a deep, warm, confident baritone with a relaxed Indian-English accent"
GUARD = "a low, calm, deadpan baritone with an Indian-English accent"

STYLE_TAIL = (
    "Photorealistic 3D animated anthropomorphic animals with expressive animal faces and upright humanlike posture; "
    "individual strands of ivory fur, the weave of the white suit, fine gold embroidery. Keep every face, the fur, the suits, "
    "the jewellery and the props exactly as in the first frame. No background music, no captions, no subtitles, no added text."
)

CAST = {
    "Sheru Bhai": "broad-shouldered adult white lion, full ivory mane, amber eyes, black nose; fitted ivory three-piece suit with gold embroidery, gold pocket square, layered gold chains with a lion medallion, dark gold-rimmed aviator sunglasses, gold watch",
    "The cub": "small white lion cub, round ears, short tuft of fur, no mane; miniature ivory suit and gold tie; a small silver toy passenger jet (the same toy in every shot) held in one paw",
    "The bodyguard": "tall, muscular, dark Indian water buffalo with outward-curving horns; black business suit, white shirt, black tie, discreet earpiece, gold lapel pin; stands alert, delivers everything with a straight face",
}

SHOTS = [
    dict(n=1, title="The toy jet", duration_s=4, speaker=None, dialogue="",
         prompt="At the cub's eye level, the white lion cub flies the silver toy jet in a smooth banking arc from left to right through the foreground, steering it with both paws and making a soft playful 'vrrooom' engine sound; his eyes follow the jet and his delighted face lights up with a giggle, round ears twitching. The ornate sofa and chandeliers stay softly out of focus. Slow gentle push-in, shallow depth of field, warm chandelier light. Audio: the cub's happy giggle and engine noises, soft room tone with a faint chandelier tinkle. No dialogue."),
    dict(n=2, title="The order", duration_s=9, speaker="Sheru Bhai",
         dialogue="My son wants to build a career in aviation. Find me the best aviation college in India. I am ready to buy one!",
         prompt=f"Sheru Bhai, the white lion in the ivory suit, lounges on the ivory-and-gold sofa beside his cub, then turns toward the bodyguard standing behind them and points confidently as he gives his order in an easy, commanding tone; the cub glances up at his father and clutches the toy jet; the water buffalo bodyguard stands motionless and attentive. After the line Sheru smiles, satisfied, and lowers his hand. Slow dolly-in toward Sheru, warm chandelier light. Sheru says, in {SHERU}, lips in sync: \"My son wants to build a career in aviation. Find me the best aviation college in India. I am ready to buy one!\" Audio: only the voice and quiet palace room tone."),
    dict(n=3, title="The bodyguard listens", duration_s=4, speaker=None, dialogue="",
         prompt="Reverse angle on the water buffalo bodyguard, listening with a perfectly straight face. He gives one small, deliberate nod of acknowledgement, then straightens his black jacket with one hand, fingers brushing the button, while his earpiece chain sways slightly. Sheru's white embroidered sleeve stays in the foreground. Slow push-in, warm light. Audio: soft fabric rustle and quiet room tone. No dialogue."),
    dict(n=4, title="The search", duration_s=4, speaker=None, dialogue="",
         prompt="Looking down over the buffalo's curved horns, his dark hands type steadily on a slim laptop keyboard; the search field on the glowing screen fills as he types and he presses Enter with a decisive tap; the screen text stays soft and unreadable. Chandelier light glitters on the gold-edged marble desk. Slow push-in with a slight downward tilt. Audio: crisp keyboard typing clicks, quiet room tone. No dialogue."),
    dict(n=5, title="The college result", duration_s=4, speaker="The bodyguard",
         dialogue="Sir, we have found Global School of Aviation!",
         prompt=f"Over Sheru's shoulder, the water buffalo turns the laptop toward Sheru and points one finger at the photo of an aviation campus and passenger aircraft on the screen, speaking with a completely straight face, while Sheru leans in with his paw at his chin and watches intently. Gentle drift toward the laptop, warm palace light. The buffalo says, in {GUARD}, lips in sync: \"Sir, we have found Global School of Aviation!\" Audio: the voice, the laptop swivelling, quiet room tone."),
    dict(n=6, title="The price", duration_s=5, speaker="Sheru Bhai",
         dialogue="Good! Find out how much it costs. I want to buy it!",
         prompt=f"Close on Sheru leaning forward over the desk, peering at the screen with an amused half-smile; as he says the line he taps the marble desk once beside the laptop with a clawed finger, then grins, certain this will be a simple purchase. His gold chains and bracelet swing slightly. Slow push-in, warm chandelier light. Sheru says, in {SHERU}, lips in sync: \"Good! Find out how much it costs. I want to buy it!\" Audio: the voice, one soft knuckle tap on marble, room tone."),
    dict(n=7, title="The wing emerges", duration_s=4, speaker="The bodyguard (off-screen)",
         dialogue="Sir, Global School of Aviation has three branches in India!",
         prompt=f"A miniature bronze feathered wing on a square plinth rises smoothly out of the glowing relief map of India on the laptop screen, trailing swirling golden light particles; the map outline glows and three golden points ignite on it; the keyboard stays visible and the palace stays softly out of focus behind, with blue screen light on the marble desk. Slow push-in toward the monument. An off-screen voice, {GUARD}, says: \"Sir, Global School of Aviation has three branches in India!\" Audio: magical shimmer, a soft low hum, the voice-over."),
    dict(n=8, title="Three branches", duration_s=4, speaker=None, dialogue="",
         prompt="The giant bronze winged monument towers above the glowing relief map of India. The camera slowly pulls back and drifts; golden light pulses travel along fine lines from the monument's plinth to exactly three golden branch markers, each marker flaring as the light arrives, while soft clouds drift over the map and rays of light fall across the deep blue sea. No city labels. Audio: gentle magical shimmer and soft airy wind. No dialogue."),
    dict(n=9, title="Only three?", duration_s=5, speaker="Sheru Bhai",
         dialogue="Only three branches? Interesting! Let's investigate further.",
         prompt=f"Sheru rests a paw against his chin and studies the small glowing map on the table in front of him, golden points pulsing below his face. He strokes his chin, raises one brow above his aviators, and a faint skeptical smile forms; then he speaks, curious. Slow push-in on his face, warm light. Sheru says, in {SHERU}, lips in sync: \"Only three branches? Interesting! Let's investigate further.\" Audio: the voice, quiet palace room tone."),
    dict(n=10, title="The first glimpse", duration_s=4, speaker="The bodyguard (off-screen)",
         dialogue="Sir! There is something much bigger behind it!",
         prompt=f"Bronze feathers fill the left foreground and catch the glow. Behind them, dusk haze slowly clears from a vast terminal roof and the base of a control tower; amber lights switch on across the roof and an aircraft taxis softly in the distance, the top of the tower still out of frame. Slow lateral dolly to the right past the wing. An off-screen voice, a low, urgent but deadpan baritone with an Indian-English accent, says: \"Sir! There is something much bigger behind it!\" Audio: low swelling wind, distant airfield sounds, the voice."),
    dict(n=11, title="The full reveal", duration_s=5, speaker="The bodyguard (off-screen)",
         dialogue="Global Flight Handling Services operates across thirty-plus airports in India!",
         prompt=f"Pull far back and rise slowly on the same axis from the small bronze winged monument on its square plinth at the bottom of frame to reveal a monumental airport terminal and an illuminated control tower dominating the dusk skyline, about ten times the monument's scale; tiny passenger jets taxi and runway lights shimmer across the wet apron. An off-screen voice, {GUARD}, says: \"Global Flight Handling Services operates across thirty-plus airports in India!\" Audio: distant jet engines, airfield ambience, the voice."),
    dict(n=12, title="\"What?! Thirty-plus airports?\"", duration_s=4, speaker="Sheru Bhai",
         dialogue="What?! Thirty-plus airports?",
         prompt="Tight close-up on Sheru, who lowers his aviators with one paw; his amber eyes widen, his jaw drops slightly and his mane ruffles as he gasps in disbelief, the illuminated tower glinting in one tinted lens. Slow push-in with a tiny shake on the gasp. Sheru says, astonished, in a deep baritone with an Indian-English accent, lips in sync: \"What?! Thirty-plus airports?\" Audio: the voice, a sharp intake of breath, faint airfield wind."),
    dict(n=13, title="Taking it in", duration_s=7, speaker="Sheru Bhai",
         dialogue="I came here to buy an aviation college... but this is much bigger than I imagined!",
         prompt="Wide rear view of Sheru alone at a floor-to-ceiling observation window, his aviators hanging from one paw, small against the glass as the terminal and runway lights twinkle across the dusk airfield; a jet lifts off far away. His shoulders settle, his tail sways slowly, the sunglasses swing gently as he speaks quietly, awed, with his back to the camera. Slow push-in from behind. Sheru says, softly, in a deep baritone with an Indian-English accent: \"I came here to buy an aviation college... but this is much bigger than I imagined!\" Audio: the voice, faint distant jet engines, quiet lounge ambience."),
    dict(n=14, title="The verdict", duration_s=5, speaker="The bodyguard",
         dialogue="Sir, I don't think we can buy this company!",
         prompt="Inside the lounge, the water buffalo leans toward Sheru, opens one hand in a calm 'that's that' gesture and speaks quietly with a completely straight face; Sheru's mane and shoulder frame the edge of the shot, one ear twitching. Focus on the guard's face, slight push-in, warm lamp light against the dusk window. The buffalo says, in a hushed, low, deadpan baritone with an Indian-English accent, lips in sync: \"Sir, I don't think we can buy this company!\" Audio: the voice, soft lounge ambience, a glass clinking on the table."),
    dict(n=15, title="The decision", duration_s=5, speaker="Sheru Bhai",
         dialogue="Then forget buying it. Let's join my son there!",
         prompt=f"Sheru turns away from the airport, bends toward his young cub and offers an open paw, smiling warmly as the cub looks up with wide hopeful eyes, the silver toy jet hugged against his chest; the bodyguard stands behind them, still. Slow push-in on the two of them, warm lamp light. Sheru says, warm and resolute, in {SHERU}, lips in sync: \"Then forget buying it. Let's join my son there!\" Audio: the voice, soft lounge ambience."),
    dict(n=16, title="Arrival", duration_s=3, speaker=None, dialogue="",
         prompt="Morning exterior seen from across the drive: Sheru and his cub walk hand in hand toward the steps of the cream-and-glass aviation school with gold trim, small in the frame; the cub skips beside him with the toy jet, palm fronds sway, visitors move in the glass lobby, and a distant aircraft crosses the clear sky. Slow dolly-in, clear morning sunlight. Keep the building's emblem unchanged; no text. Audio: birdsong, a light breeze, soft footsteps. No dialogue."),
    dict(n=17, title="Through the doors", duration_s=4, speaker="Sheru Bhai",
         dialogue="Son, this is where your aviation journey begins!",
         prompt="Following shot at the cub's height from behind: father and son cross the threshold of the school's glass doors hand in hand; Sheru glances down proudly at his son, the cub looks up at the bright lobby, sunlight streaming across polished marble. The sign above the doors must keep reading exactly 'GLOBAL SCHOOL OF AVIATION' with its lettering unchanged. Steady follow shot. Sheru says, warm and proud, in a deep baritone with a relaxed Indian-English accent: \"Son, this is where your aviation journey begins!\" Audio: the voice, soft footsteps on marble, lobby ambience."),
    dict(n=18, title="The dream takes flight", duration_s=4, speaker=None, dialogue="",
         prompt="Inside the school, the cub in profile at a window raises the silver toy jet in his paw while a real passenger aircraft climbs outside in the same direction; his eyes follow the plane, his smile widens and he lets out a delighted gasp as the toy and the real jet climb in parallel, the airliner leaving a thin contrail across clear sky with open sky left between the two silhouettes. Slow push-in, bright morning sun. Audio: the cub's delighted gasp, a distant jet roar, quiet room tone. No dialogue."),
]

for s in SHOTS:
    s["first_frame"] = f"out/storyboard/sheru-bhai/frame-{s['n']:02d}.png"
    s["first_frame_url"] = f"{RAW}/frame-{s['n']:02d}.png"
    s["prompt_full"] = f"{s['prompt']} {STYLE_TAIL}"
    s["clip_file"] = f"assets/sheru-clips-raw/shot-{s['n']:02d}.mp4"

pack = {
    "film": "Sheru Bhai - The Aviation Mission",
    "aspect_ratio": "9:16",
    "mode": "image-to-video (the still is the first frame)",
    "notes": [
        "Frame 19 (brand card) is not generated: it stays the exact vector card.",
        "Voices are generated per clip and can differ a little between clips; the voice descriptions are repeated in every prompt to keep them close.",
        "Shot 17 must keep the sign reading exactly GLOBAL SCHOOL OF AVIATION. If the generated lettering drifts, that shot falls back to the still-image version.",
        "No music is requested inside the clips: the score and sound design are added in the edit.",
    ],
    "cast": CAST,
    "style_tail": STYLE_TAIL,
    "total_target_seconds": sum(s["duration_s"] for s in SHOTS),
    "shots": SHOTS,
}
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "animation-shot-pack.json").write_text(json.dumps(pack, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

md = ["# Sheru Bhai: animation shot pack", "",
      "Each still is the **first frame** of its clip; the prompt directs the acting, camera and spoken line from the storyboard.",
      f"Total about {pack['total_target_seconds']} s of generated clips, plus the 8 s brand card (frame 19, not generated).", "",
      "## Cast (kept identical in every shot)", ""]
md += [f"- **{k}**: {v}" for k, v in CAST.items()]
md += ["", "## Added to every prompt", "", STYLE_TAIL, ""]
for s in SHOTS:
    md += [f"## Shot {s['n']:02d}: {s['title']} ({s['duration_s']} s)", "",
           f"- First frame: `{s['first_frame']}`  \n  {s['first_frame_url']}",
           f"- Speaker: {s['speaker'] or 'none'}"]
    if s["dialogue"]:
        md.append(f"- Line: \"{s['dialogue']}\"")
    md += ["", "```", s["prompt"], "```", ""]
(OUT / "animation-shot-pack.md").write_text("\n".join(md), encoding="utf-8")
print(f"wrote {len(SHOTS)} shots, {pack['total_target_seconds']} s of clips -> {OUT}/animation-shot-pack.(json|md)")
print("longest prompt (chars):", max(len(s['prompt_full']) for s in SHOTS))
