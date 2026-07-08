const DEFAULT_RANGE = 3.5;

/**
 * F-key proximity interaction prompt.
 *
 * Each frame it scans a list of candidates, shows a prompt for the nearest
 * one within range, and fires a callback when the player presses F.
 *
 * Usage in main.js:
 *   const prompt = createInteractionPrompt(
 *     () => player.mesh.position,
 *     () => pets.filter(p => p.spawned).map(p => ({ mesh: p.mesh, name: p.name, label: '交谈', data: p })),
 *     (pet) => openPetDialogue(pet)
 *   );
 *   prompt.update();
 */
export function createInteractionPrompt(
  getPlayerPos,
  getCandidates,
  onInteract,
  input,
  options = {}
) {
  const range = options.range ?? DEFAULT_RANGE;
  const promptEl = document.createElement('div');
  promptEl.style.cssText = `
    position: fixed;
    bottom: 90px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 14px;
    border-radius: 8px;
    background: rgba(0,0,0,0.65);
    color: #f5ead0;
    font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
    z-index: 150;
    backdrop-filter: blur(4px);
  `;
  document.body.appendChild(promptEl);

  let currentCandidate = null;

  function update() {
    const playerPos = getPlayerPos();
    const candidates = getCandidates() || [];

    let best = null;
    let bestDist = Infinity;

    for (const candidate of candidates) {
      if (!candidate.mesh || !candidate.mesh.visible) continue;
      const dist = playerPos.distanceTo(candidate.mesh.position);
      if (dist <= range && dist < bestDist) {
        best = candidate;
        bestDist = dist;
      }
    }

    currentCandidate = best;

    if (best) {
      const label = best.label || '交互';
      promptEl.innerHTML = `<span style="
        display:inline-flex;align-items:center;justify-content:center;
        width:22px;height:22px;border-radius:4px;background:#f5ead0;
        color:#2a2330;font-weight:bold;font-size:12px;box-shadow:0 2px 0 #2a2330;
      ">F</span><span>按 F ${label} ${best.name || ''}</span>`;
      promptEl.style.opacity = '1';

      if (input?.justPressed('KeyF')) {
        onInteract(best.data ?? best, best);
      }
    } else {
      promptEl.style.opacity = '0';
    }
  }

  function dispose() {
    if (promptEl.parentNode) promptEl.parentNode.removeChild(promptEl);
  }

  return { update, dispose, getCurrentCandidate: () => currentCandidate };
}
