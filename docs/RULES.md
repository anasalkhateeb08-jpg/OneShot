# RULES

## Owner's custom rules (master section 3)

EMPTY. The owner has not provided custom rules yet.
When provided, they replace the temporary assumptions below and are implemented literally.

## Temporary assumptions (in use until the owner's rules arrive)

- A match is a single round. One life per player. The first kill ends the match and its owner wins.
- A hit to the head or torso is a kill. A limb hit is not a kill; it increases scope sway by 50%
  for 10 seconds (`PLAYER.limbWoundSwayFactor`, `PLAYER.limbWoundSeconds`).
- If no kill happens by the end of the sudden-death cap (`MATCH.suddenDeathHardCapAfterZeroS`),
  the match ends in a draw and the balance does not change.
- No second lives and no respawns.

## Where these live in code

`shared/src/constants.ts`: `PLAYER`, `MATCH`, `EXPOSURE`, `TRIALS`, `ABUSE`.
